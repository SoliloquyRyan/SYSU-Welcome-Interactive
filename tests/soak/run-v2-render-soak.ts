import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import {
  V2ActivateParticipantResponseSchema,
  V2AdminCommandResponseSchema,
  V2AdminSnapshotSchema,
  V2ParticipantCommandResponseSchema,
  V2ParticipantSnapshotSchema,
  V2ScreenSnapshotSchema,
  type V2AdminSnapshot,
  type V2ParticipantSnapshot,
} from '../../packages/contracts/src/index.js'
import {
  startDemoTestStack,
  type DemoTestStack,
} from '../e2e/fixtures/demo-stack.js'
import { assertCondition, mapLimit } from '../load/metrics.js'
import {
  SanitizedV2ProtocolError,
  createV2HttpClient,
  type V2HttpClient,
} from '../load/v2-protocol-client.js'

const PARTICIPANT_COUNT = 300
const FORMAL_VISUAL_REFERENCE_COUNT = 220
const VISUAL_ACCEPTANCE_COUNTS = [40, 80, 120, 160, FORMAL_VISUAL_REFERENCE_COUNT] as const
const PRIMARY_CONCURRENCY = 24
const ARRIVAL_SETTLE_MS = 1_800
const PROGRAM_TRANSITION_EXPECTED_MS = 8_400
const FORMAL_RENDER_DURATION_MS = 30 * 60 * 1_000
const SMOKE_RENDER_DURATION_MS = 46_000
const REPORT_SCHEMA_VERSION = 1
const REPORT_ROOT = fileURLToPath(new URL('../reports/', import.meta.url))
const REPORT_PATH = path.join(REPORT_ROOT, 'v2-render-soak.json')
const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ARTIFACT_ROOT = path.join(
  REPOSITORY_ROOT,
  'output',
  'playwright',
  'v2-10-render-soak',
)
const VIEWPORT = { width: 1920, height: 1080 }
const smokeMode = process.argv.includes('--smoke')
const artifactMode = !smokeMode || process.argv.includes('--artifacts')

type SoakStageName =
  | 'empty-ready'
  | 'sparse-40'
  | 'settling-80'
  | 'balanced-120'
  | 'dense-160'
  | 'formal-ready'
  | 'dense-assembly'
  | 'program-transition'
  | 'program-overlay'
  | 'cooperative-light'
  | 'completed-finale'

interface ParticipantState {
  readonly index: number
  readonly cookie: string
  snapshot: V2ParticipantSnapshot
}

interface Diagnostics {
  consoleErrors: number
  issues: string[]
  pageErrors: number
  requestFailures: number
  externalRequests: number
  httpErrors: number
}

interface SurfaceSample {
  canvasBackingHeight: number
  canvasBackingWidth: number
  canvasCount: number
  devicePixelRatio: number
  domNodes: number
  heapLimitBytes: number | null
  horizontalOverflow: number
  rootHeight: number
  rootWidth: number
  signalVisible: boolean
  usedHeapBytes: number | null
  verticalOverflow: number
  viewportHeight: number
  viewportWidth: number
  visibilityState: string
}

interface InstrumentationSnapshot {
  frameIntervals: number[]
  longTasks: number[]
  paintIntervals: number[]
  paintCount: number
}

interface PageStageEvidence {
  canvasHashChanged: boolean | null
  frameIntervalMaxMs: number | null
  frameIntervalP50Ms: number | null
  frameIntervalP95Ms: number | null
  longTaskCount: number
  longTaskMaxMs: number | null
  longTaskTotalMs: number
  firstUsedHeapBytes: number | null
  lastUsedHeapBytes: number | null
  maxDomNodes: number
  maxUsedHeapBytes: number | null
  paintCount: number
  paintFps: number | null
  paintIntervalMaxMs: number | null
  paintIntervalP50Ms: number | null
  paintIntervalP95Ms: number | null
  samples: number
}

interface StageEvidence {
  durationMs: number
  expectedStars: number
  name: SoakStageName
  normal: PageStageEvidence
  reduced: PageStageEvidence
}

interface PageMonitor {
  diagnostics: Diagnostics
}

interface BrowserSurface {
  context: BrowserContext
  monitor: PageMonitor
  page: Page
}

function stageDurations(): Array<{
  name: SoakStageName
  durationMs: number
  expectedStars: number
}> {
  const durations = smokeMode
    ? [3_000, 3_500, 3_500, 3_500, 3_500, 5_000, 6_000, 6_500, 6_000, 5_500]
    : [90_000, 120_000, 120_000, 150_000, 180_000, 240_000, 240_000, 240_000, 240_000, 180_000]
  const names: SoakStageName[] = [
    'empty-ready',
    'sparse-40',
    'settling-80',
    'balanced-120',
    'dense-160',
    'formal-ready',
    'dense-assembly',
    'program-overlay',
    'cooperative-light',
    'completed-finale',
  ]
  const starCounts = [
    0,
    ...VISUAL_ACCEPTANCE_COUNTS,
    PARTICIPANT_COUNT,
    PARTICIPANT_COUNT,
    PARTICIPANT_COUNT,
    PARTICIPANT_COUNT,
  ]
  return names.map((name, index) => ({
    name,
    durationMs: durations[index]!,
    expectedStars: starCounts[index]!,
  }))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? null
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

function failureCode(error: unknown): string {
  if (error instanceof SanitizedV2ProtocolError) return error.code
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return error instanceof Error && error.name ? error.name : 'UNKNOWN_ERROR'
}

function idempotencyKey(operation: string, index: number): string {
  return `v2-soak-${operation}-${String(index).padStart(3, '0')}`
}

function createPageMonitor(page: Page, allowedOrigin: string): PageMonitor {
  const diagnostics: Diagnostics = {
    consoleErrors: 0,
    issues: [],
    pageErrors: 0,
    requestFailures: 0,
    externalRequests: 0,
    httpErrors: 0,
  }
  page.on('console', (message) => {
    if (message.type() === 'error') {
      diagnostics.consoleErrors += 1
      diagnostics.issues.push(`console:${sanitizeDiagnostic(message.text())}`)
    }
  })
  page.on('pageerror', (error) => {
    diagnostics.pageErrors += 1
    diagnostics.issues.push(`page:${sanitizeDiagnostic(error.message)}`)
  })
  page.on('requestfailed', () => { diagnostics.requestFailures += 1 })
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin !== allowedOrigin
    ) {
      diagnostics.externalRequests += 1
    }
  })
  page.on('response', (response) => {
    if (response.status() >= 400) diagnostics.httpErrors += 1
  })
  return { diagnostics }
}

function sanitizeDiagnostic(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gu, '[url]')
    .replace(/[A-Za-z0-9_-]{32,}/gu, '[redacted]')
    .slice(0, 200)
}

function diagnosticsPassed(value: Diagnostics): boolean {
  return value.consoleErrors === 0 &&
    value.pageErrors === 0 &&
    value.requestFailures === 0 &&
    value.externalRequests === 0 &&
    value.httpErrors === 0
}

async function installInstrumentation(page: Page): Promise<void> {
  await page.addInitScript({ content: String.raw`
    (() => {
      const metrics = {
        frameIntervals: [],
        lastFrameAt: null,
        lastPaintAt: null,
        longTasks: [],
        paintCount: 0,
        paintIntervals: [],
      };
      globalThis.__v2SoakMetrics = metrics;
      const originalClearRect = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (this.canvas.classList.contains('v2-galaxy')) {
          const now = performance.now();
          metrics.paintCount += 1;
          if (metrics.lastPaintAt !== null) {
            metrics.paintIntervals.push(now - metrics.lastPaintAt);
          }
          metrics.lastPaintAt = now;
        }
        return originalClearRect.apply(this, args);
      };
      const tick = (now) => {
        if (metrics.lastFrameAt !== null) metrics.frameIntervals.push(now - metrics.lastFrameAt);
        metrics.lastFrameAt = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) metrics.longTasks.push(entry.duration);
        });
        observer.observe({ entryTypes: ['longtask'] });
      } catch {}
    })();
  ` })
}

async function resetInstrumentation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const metrics = (globalThis as typeof globalThis & {
      __v2SoakMetrics?: InstrumentationSnapshot & {
        lastFrameAt: number | null
        lastPaintAt: number | null
      }
    }).__v2SoakMetrics
    if (!metrics) throw new Error('V2 soak instrumentation is unavailable')
    metrics.frameIntervals = []
    metrics.longTasks = []
    metrics.paintCount = 0
    metrics.paintIntervals = []
    metrics.lastFrameAt = null
    metrics.lastPaintAt = null
  })
}

async function readInstrumentation(page: Page): Promise<InstrumentationSnapshot> {
  return page.evaluate(() => {
    const metrics = (globalThis as typeof globalThis & {
      __v2SoakMetrics?: InstrumentationSnapshot
    }).__v2SoakMetrics
    if (!metrics) throw new Error('V2 soak instrumentation is unavailable')
    return {
      frameIntervals: [...metrics.frameIntervals],
      longTasks: [...metrics.longTasks],
      paintCount: metrics.paintCount,
      paintIntervals: [...metrics.paintIntervals],
    }
  })
}

async function sampleSurface(page: Page): Promise<SurfaceSample> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas.v2-galaxy')
    const root = document.querySelector('.v2-screen')
    const memory = window.performance as unknown as Performance & {
      memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number }
    }
    return {
      canvasBackingHeight: canvas instanceof HTMLCanvasElement ? canvas.height : 0,
      canvasBackingWidth: canvas instanceof HTMLCanvasElement ? canvas.width : 0,
      canvasCount: document.querySelectorAll('canvas.v2-galaxy').length,
      devicePixelRatio: window.devicePixelRatio,
      domNodes: document.querySelectorAll('*').length,
      heapLimitBytes: memory.memory?.jsHeapSizeLimit ?? null,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rootHeight: root?.getBoundingClientRect().height ?? 0,
      rootWidth: root?.getBoundingClientRect().width ?? 0,
      signalVisible: Boolean(document.querySelector('.v2-signal')),
      usedHeapBytes: memory.memory?.usedJSHeapSize ?? null,
      verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      visibilityState: document.visibilityState,
    }
  })
}

async function canvasHash(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas.v2-galaxy')
    if (!(canvas instanceof HTMLCanvasElement)) return -1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return -1
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const stride = Math.max(4, Math.floor(pixels.length / 8192 / 4) * 4)
    let value = 2166136261
    for (let index = 0; index < pixels.length; index += stride) {
      value ^= pixels[index] ?? 0
      value = Math.imul(value, 16777619)
      value ^= pixels[index + 1] ?? 0
      value = Math.imul(value, 16777619)
      value ^= pixels[index + 2] ?? 0
      value = Math.imul(value, 16777619)
      value ^= pixels[index + 3] ?? 0
      value = Math.imul(value, 16777619)
    }
    return value >>> 0
  })
}

async function inspectProgramTransparency(page: Page): Promise<{
  backgroundsTransparent: boolean
  canvasMaxAlpha: number
  giftVisuals: number
  headings: number
  mediaElements: number
  barrageItems: number
  barragePanels: number
  barrageStreams: number
  sceneCopies: number
}> {
  return await page.evaluate(`(() => {
    const canvas = document.querySelector('canvas.v2-galaxy');
    let canvasMaxAlpha = 255;
    if (canvas instanceof HTMLCanvasElement) {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context) {
        canvasMaxAlpha = 0;
        const stepX = Math.max(1, Math.floor(canvas.width / 80));
        const stepY = Math.max(1, Math.floor(canvas.height / 45));
        for (let y = 0; y < canvas.height; y += stepY) {
          for (let x = 0; x < canvas.width; x += stepX) {
            canvasMaxAlpha = Math.max(
              canvasMaxAlpha,
              context.getImageData(x, y, 1, 1).data[3] ?? 0,
            );
          }
        }
      }
    }
    const backgrounds = [
      document.documentElement,
      document.body,
      document.querySelector('#app'),
      document.querySelector('.app-shell.route-screen'),
      document.querySelector('.v2-screen'),
    ].filter((value) => value instanceof Element)
      .map((element) => getComputedStyle(element).backgroundColor);
    return {
      backgroundsTransparent: backgrounds.every((value) =>
        value === 'transparent' || /^rgba\\(0,\\s*0,\\s*0,\\s*0\\)$/.test(value)),
      canvasMaxAlpha,
      giftVisuals: document.querySelectorAll('.v2-gifts,[data-gift-visual]').length,
      headings: document.querySelectorAll('.v2-screen h1,.v2-screen h2').length,
      mediaElements: document.querySelectorAll('video,audio,iframe').length,
      barrageItems: document.querySelectorAll('.v2-barrage-stream__item').length,
      barragePanels: document.querySelectorAll('.v2-barrage-panel').length,
      barrageStreams: document.querySelectorAll('.v2-barrage-stream').length,
      sceneCopies: document.querySelectorAll('.v2-scene-copy').length,
    };
  })()`) as {
    backgroundsTransparent: boolean
    canvasMaxAlpha: number
    giftVisuals: number
    headings: number
    mediaElements: number
    barrageItems: number
    barragePanels: number
    barrageStreams: number
    sceneCopies: number
  }
}

async function assertPublicPrivacy(
  pages: readonly Page[],
  stack: DemoTestStack,
): Promise<void> {
  const forbidden = stack.credentials.participants.flatMap((participant) => [
    participant.inviteToken,
    participant.displayName,
    participant.studentNumber,
    participant.publicStarId,
  ])
  forbidden.push(stack.credentials.admin.username, stack.credentials.admin.password)
  for (const page of pages) {
    const projection = `${await page.locator('body').innerText()}\n${await page.locator('html').innerHTML()}`
    assertCondition(
      forbidden.every((value) => !projection.includes(value)),
      'A public screen projection exposed a private synthetic identity field',
    )
  }
}

async function waitForScreenState(
  client: V2HttpClient,
  pages: readonly Page[],
  input: { heading?: string; programOverlay?: boolean; stars: number },
): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const snapshot = V2ScreenSnapshotSchema.safeParse((await client.request(
      'soak-screen-state',
      'GET',
      '/api/v2/screen/snapshot',
    )).body)
    const pagesReady = await Promise.all(pages.map(async (page) => {
      if (input.heading) {
        return page.getByRole('heading', { name: input.heading }).isVisible().catch(() => false)
      }
      if (input.programOverlay) {
        // Read one DOM snapshot atomically. Sequential locator calls can straddle
        // the realtime ASSEMBLY -> PROGRAM_SUPPORT patch and briefly combine the
        // old `idle` attribute with the new scene's missing copy.
        return page.evaluate(() => {
          const root = document.querySelector('.v2-screen')
          return root?.classList.contains('scene-program_support') === true
            && root.getAttribute('data-scene-transition') === 'idle'
            && document.querySelectorAll('.v2-scene-transition').length === 0
            && document.querySelectorAll('.v2-scene-copy').length === 0
            && document.querySelectorAll('.v2-gifts,[data-gift-visual]').length === 0
            && document.querySelectorAll('.v2-barrage-panel,.v2-barrage-stream').length === 0
        })
      }
      return false
    }))
    if (
      snapshot.success &&
      snapshot.data.aggregate.publicStarCount === input.stars &&
      pagesReady.every(Boolean)
    ) return
    await sleep(100)
  }
  throw new Error('The public screen did not converge to the expected sanitized state')
}

async function launchBrowser(): Promise<{ browser: Browser; label: string }> {
  const options = {
    headless: true,
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  }
  const candidates = [
    { label: 'Google Chrome', launch: () => chromium.launch({ ...options, channel: 'chrome' }) },
    { label: 'Microsoft Edge', launch: () => chromium.launch({ ...options, channel: 'msedge' }) },
    { label: 'Playwright Chromium', launch: () => chromium.launch(options) },
  ]
  for (const candidate of candidates) {
    try {
      return { browser: await candidate.launch(), label: candidate.label }
    } catch {
      // Fall through to the next installed browser without exposing local paths.
    }
  }
  throw new Error('No supported local Chromium browser could be launched')
}

async function openSurface(
  browser: Browser,
  stack: DemoTestStack,
  reducedMotion: 'no-preference' | 'reduce',
): Promise<BrowserSurface> {
  const context = await browser.newContext({
    baseURL: stack.baseURL,
    viewport: VIEWPORT,
    reducedMotion,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const page = await context.newPage()
  const monitor = createPageMonitor(page, new URL(stack.baseURL).origin)
  await installInstrumentation(page)
  await page.goto('/screen')
  await page.getByRole('heading', { name: '星海集结' }).waitFor()
  return { context, monitor, page }
}

async function captureStage(
  surfaces: readonly BrowserSurface[],
  stage: SoakStageName,
): Promise<void> {
  if (!artifactMode) return
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true })
  await Promise.all(surfaces.map((surface, index) => surface.page.screenshot({
    path: path.join(ARTIFACT_ROOT, `${stage}-${index === 0 ? 'normal' : 'reduced'}.png`),
    omitBackground: stage === 'program-overlay',
  })))
}

async function captureArrivalFrame(
  surfaces: readonly BrowserSurface[],
  label: 'arrival-meteor' | 'arrival-orbit-capture',
): Promise<void> {
  if (!artifactMode) return
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true })
  await Promise.all(surfaces.map((surface, index) => surface.page.screenshot({
    path: path.join(ARTIFACT_ROOT, `${label}-${index === 0 ? 'normal' : 'reduced'}.png`),
  })))
}

function pageStageEvidence(
  instrumentation: InstrumentationSnapshot,
  samples: readonly SurfaceSample[],
  canvasHashChanged: boolean | null,
  durationMs: number,
): PageStageEvidence {
  const paintIntervals = instrumentation.paintIntervals
  return {
    canvasHashChanged,
    frameIntervalMaxMs: instrumentation.frameIntervals.length
      ? round(Math.max(...instrumentation.frameIntervals))
      : null,
    frameIntervalP50Ms: percentile(instrumentation.frameIntervals, 0.5),
    frameIntervalP95Ms: percentile(instrumentation.frameIntervals, 0.95),
    longTaskCount: instrumentation.longTasks.length,
    longTaskMaxMs: instrumentation.longTasks.length
      ? round(Math.max(...instrumentation.longTasks))
      : null,
    longTaskTotalMs: round(instrumentation.longTasks.reduce((sum, value) => sum + value, 0)),
    firstUsedHeapBytes: samples.find((sample) => sample.usedHeapBytes !== null)?.usedHeapBytes ?? null,
    lastUsedHeapBytes: samples.findLast((sample) => sample.usedHeapBytes !== null)?.usedHeapBytes ?? null,
    maxDomNodes: Math.max(...samples.map((sample) => sample.domNodes)),
    maxUsedHeapBytes: samples.some((sample) => sample.usedHeapBytes !== null)
      ? Math.max(...samples.flatMap((sample) => sample.usedHeapBytes === null ? [] : [sample.usedHeapBytes]))
      : null,
    paintCount: instrumentation.paintCount,
    paintFps: instrumentation.paintCount > 1
      ? round((instrumentation.paintCount - 1) * 1_000 / durationMs)
      : 0,
    paintIntervalMaxMs: paintIntervals.length ? round(Math.max(...paintIntervals)) : null,
    paintIntervalP50Ms: percentile(paintIntervals, 0.5),
    paintIntervalP95Ms: percentile(paintIntervals, 0.95),
    samples: samples.length,
  }
}

async function holdStage(input: {
  durationMs: number
  expectedStars: number
  name: SoakStageName
  normal: BrowserSurface
  reduced: BrowserSurface
  onTick?: (elapsedMs: number) => Promise<void>
}): Promise<StageEvidence> {
  const surfaces = [input.normal, input.reduced]
  await captureStage(surfaces, input.name)
  await Promise.all(surfaces.map((surface) => resetInstrumentation(surface.page)))
  const hashDelay = smokeMode ? 350 : 2_000
  await sleep(hashDelay)
  const initialHashes = await Promise.all(surfaces.map((surface) => canvasHash(surface.page)))
  await sleep(hashDelay)
  const nextHashes = await Promise.all(surfaces.map((surface) => canvasHash(surface.page)))
  // getImageData() is an intentionally expensive test probe. Exclude its own
  // long tasks from the stage budget so the metric represents application work.
  await Promise.all(surfaces.map((surface) => resetInstrumentation(surface.page)))
  const samples: [SurfaceSample[], SurfaceSample[]] = [[], []]
  const started = performance.now()
  const intervalMs = smokeMode ? 1_000 : 30_000
  let nextTickAt = 0

  while (performance.now() - started < input.durationMs) {
    const elapsed = performance.now() - started
    if (input.onTick && elapsed >= nextTickAt) {
      await input.onTick(elapsed)
      nextTickAt += smokeMode ? 2_000 : 30_000
    }
    const nextSamples = await Promise.all(surfaces.map((surface) => sampleSurface(surface.page)))
    samples[0].push(nextSamples[0]!)
    samples[1].push(nextSamples[1]!)
    const remaining = input.durationMs - (performance.now() - started)
    if (remaining <= 0) break
    await sleep(Math.min(intervalMs, remaining))
  }
  const measuredDurationMs = performance.now() - started
  const instrumentation = await Promise.all(
    surfaces.map((surface) => readInstrumentation(surface.page)),
  )
  const normal = pageStageEvidence(
    instrumentation[0]!,
    samples[0],
    initialHashes[0] !== nextHashes[0],
    measuredDurationMs,
  )
  const reduced = pageStageEvidence(
    instrumentation[1]!,
    samples[1],
    initialHashes[1] !== nextHashes[1],
    measuredDurationMs,
  )
  return {
    durationMs: round(measuredDurationMs),
    expectedStars: input.expectedStars,
    name: input.name,
    normal,
    reduced,
  }
}

async function measureProgramTransition(input: {
  expectedStars: number
  normal: BrowserSurface
  reduced: BrowserSurface
  onStart: () => Promise<void>
}): Promise<StageEvidence> {
  const surfaces = [input.normal, input.reduced]
  await Promise.all(surfaces.map((surface) => resetInstrumentation(surface.page)))
  const samples: [SurfaceSample[], SurfaceSample[]] = [[], []]
  const started = performance.now()
  await input.onStart()
  let sawNormalTransition = false
  let normalSettled = false
  const deadline = Date.now() + 12_000

  while (Date.now() < deadline) {
    const [transitionState, nextSamples] = await Promise.all([
      input.normal.page.locator('.v2-screen').getAttribute('data-scene-transition'),
      Promise.all(surfaces.map((surface) => sampleSurface(surface.page))),
    ])
    samples[0].push(nextSamples[0]!)
    samples[1].push(nextSamples[1]!)
    if (transitionState === 'ASSEMBLY->PROGRAM_SUPPORT') sawNormalTransition = true
    if (sawNormalTransition && transitionState === 'idle') {
      normalSettled = true
      break
    }
    await sleep(250)
  }
  assertCondition(sawNormalTransition, 'The normal-motion program transition never became visible')
  assertCondition(normalSettled, 'The normal-motion program transition did not settle within 12 seconds')
  const measuredDurationMs = performance.now() - started
  const instrumentation = await Promise.all(
    surfaces.map((surface) => readInstrumentation(surface.page)),
  )
  return {
    durationMs: round(measuredDurationMs),
    expectedStars: input.expectedStars,
    name: 'program-transition',
    normal: pageStageEvidence(
      instrumentation[0]!,
      samples[0],
      null,
      measuredDurationMs,
    ),
    reduced: pageStageEvidence(
      instrumentation[1]!,
      samples[1],
      null,
      measuredDurationMs,
    ),
  }
}

function assertStageEvidence(stage: StageEvidence): void {
  for (const evidence of [stage.normal, stage.reduced]) {
    assertCondition(evidence.samples > 0, 'A render soak stage produced no samples')
    assertCondition(evidence.maxDomNodes <= 500, 'The public screen DOM grew beyond the bounded projection')
    assertCondition(
      evidence.frameIntervalP95Ms !== null && evidence.frameIntervalP95Ms <= 50,
      'Browser frame cadence p95 exceeded the V2 soak threshold',
    )
    assertCondition(
      evidence.longTaskMaxMs === null || evidence.longTaskMaxMs <= 500,
      'A browser long task exceeded the V2 soak threshold',
    )
    assertCondition(
      evidence.longTaskTotalMs <= stage.durationMs * 0.02,
      'Browser long tasks consumed more than two percent of a soak stage',
    )
    assertCondition(
      evidence.maxUsedHeapBytes === null || evidence.maxUsedHeapBytes <= 256 * 1024 * 1024,
      'A public screen renderer exceeded the JS heap ceiling',
    )
  }
  assertCondition(stage.reduced.paintCount <= 4, 'Reduced motion retained a continuous Canvas paint loop')
  if ([
    'empty-ready',
    'sparse-40',
    'settling-80',
    'balanced-120',
    'dense-160',
    'formal-ready',
    'dense-assembly',
    'cooperative-light',
  ].includes(stage.name)) {
    assertCondition(
      stage.normal.paintFps !== null && stage.normal.paintFps >= 20 && stage.normal.paintFps <= 35,
      'The ambient galaxy paint cadence left its 20–35 FPS envelope',
    )
    assertCondition(
      stage.normal.paintIntervalP95Ms !== null && stage.normal.paintIntervalP95Ms <= 80,
      'The active galaxy paint cadence p95 exceeded 80 ms',
    )
    assertCondition(
      stage.normal.canvasHashChanged === true,
      'The normal-motion galaxy did not visibly change between sampled frames',
    )
    assertCondition(
      stage.reduced.canvasHashChanged === false,
      'The reduced-motion galaxy changed between sampled static frames',
    )
  }
  if (stage.name === 'program-transition') {
    assertCondition(
      stage.durationMs >= PROGRAM_TRANSITION_EXPECTED_MS - 500
        && stage.durationMs <= PROGRAM_TRANSITION_EXPECTED_MS + 1_800,
      'The program transition left its 8.4-second timing envelope',
    )
    assertCondition(
      stage.normal.paintFps !== null
        && stage.normal.paintFps >= 50
        && stage.normal.paintFps <= 70,
      'The high-speed program transition left its 50–70 FPS envelope',
    )
    assertCondition(
      stage.normal.paintIntervalP95Ms !== null
        && stage.normal.paintIntervalP95Ms <= 35,
      'The high-speed program transition paint cadence p95 exceeded 35 ms',
    )
  }
  if (stage.name === 'program-overlay') {
    assertCondition(stage.normal.paintCount <= 4, 'The transparent program Canvas retained a continuous paint loop')
    assertCondition(stage.normal.canvasHashChanged === false, 'The transparent program Canvas retained moving pixels')
  }
}

function assertSurfaceSamples(samples: readonly SurfaceSample[]): void {
  for (const sample of samples) {
    assertCondition(sample.canvasCount === 1, 'The public screen must use exactly one galaxy Canvas')
    assertCondition(sample.devicePixelRatio <= 2, 'The galaxy renderer exceeded its DPR ceiling')
    assertCondition(sample.horizontalOverflow <= 1, 'The public screen has horizontal overflow')
    assertCondition(sample.verticalOverflow <= 1, 'The public screen has vertical overflow')
    assertCondition(sample.rootHeight === sample.viewportHeight, 'The public screen root height drifted from the viewport')
    assertCondition(sample.rootWidth === sample.viewportWidth, 'The public screen root width drifted from the viewport')
    assertCondition(sample.visibilityState === 'visible', 'A soak browser became hidden or throttled')
    assertCondition(!sample.signalVisible, 'The public screen retained a connection warning during a stable sample')
    assertCondition(sample.canvasBackingHeight > 0 && sample.canvasBackingWidth > 0, 'The galaxy Canvas backing store is empty')
  }
}

async function run(): Promise<void> {
  const startedAt = new Date()
  const wallStarted = performance.now()
  const plannedStages = stageDurations()
  const plannedRenderDurationMs = plannedStages.reduce((sum, stage) => sum + stage.durationMs, 0)
    + PROGRAM_TRANSITION_EXPECTED_MS
  let stack: DemoTestStack | null = null
  let browser: Browser | null = null
  let reducedBrowser: Browser | null = null
  let normal: BrowserSurface | null = null
  let reduced: BrowserSurface | null = null
  let browserLabel = 'not-launched'
  let browserVersion = 'not-launched'
  let temporaryDirectoryRemoved = false
  let status: 'passed' | 'failed' = 'failed'
  let topLevelFailure: string | null = null
  let failureSummary: string | null = null
  let obsEvidence: Awaited<ReturnType<typeof inspectProgramTransparency>> | null = null
  let backendRestartRecovered = false
  let pageReloadRecovered = false
  let interactionsSent = 0
  const participants: ParticipantState[] = []
  const stages: StageEvidence[] = []
  const allSamples: SurfaceSample[] = []

  try {
    if (artifactMode) {
      const resolvedArtifact = path.resolve(ARTIFACT_ROOT)
      assertCondition(
        resolvedArtifact.startsWith(path.resolve(REPOSITORY_ROOT, 'output', 'playwright') + path.sep),
        'The V2 soak artifact path escaped the ignored Playwright output root',
      )
      fs.rmSync(resolvedArtifact, { recursive: true, force: true })
      fs.mkdirSync(resolvedArtifact, { recursive: true })
    }

    stack = await startDemoTestStack({
      protocolVersion: '2',
      participantCount: PARTICIPANT_COUNT,
      inProcess: true,
      startupTimeoutMs: 60_000,
    })
    const client = createV2HttpClient(stack.backendOrigin, stack.requestOrigin)
    const initialScreen = V2ScreenSnapshotSchema.parse((await client.request(
      'soak-initial-screen',
      'GET',
      '/api/v2/screen/snapshot',
    )).body)
    const resetEpoch = initialScreen.resetEpoch

    const launched = await launchBrowser()
    browser = launched.browser
    browserLabel = launched.label
    browserVersion = browser.version()
    const reducedLaunch = await launchBrowser()
    reducedBrowser = reducedLaunch.browser
    assertCondition(
      reducedLaunch.label === browserLabel,
      'Normal and reduced-motion surfaces launched different browser products',
    )
    normal = await openSurface(browser, stack, 'no-preference')
    reduced = await openSurface(reducedBrowser, stack, 'reduce')
    const surfaces = [normal, reduced]
    const pages = surfaces.map((surface) => surface.page)
    await waitForScreenState(client, pages, { heading: '星海集结', stars: 0 })

    const runStage = async (
      stage: (typeof plannedStages)[number],
      onTick?: (elapsedMs: number) => Promise<void>,
    ) => {
      const evidence = await holdStage({
        ...stage,
        normal: normal!,
        reduced: reduced!,
        ...(onTick ? { onTick } : {}),
      })
      stages.push(evidence)
      assertStageEvidence(evidence)
      const samples = await Promise.all(pages.map(sampleSurface))
      allSamples.push(...samples)
      assertSurfaceSamples(samples)
      await assertPublicPrivacy(pages, stack!)
      process.stdout.write(`V2 render soak stage passed: ${stage.name} (${Math.round(evidence.durationMs)}ms)\n`)
    }

    await runStage(plannedStages[0]!)

    const onboardRange = async (start: number, end: number) => {
      const next = await mapLimit(
        stack!.credentials.participants.slice(start, end),
        PRIMARY_CONCURRENCY,
        async (credential, offset) => {
          const index = start + offset
          const activation = await client.request(
            'soak-activation',
            'POST',
            '/api/v2/participant/activate',
            { body: {
              protocolVersion: '2',
              resetEpoch,
              idempotencyKey: idempotencyKey('activate', index),
              method: 'INVITATION_TOKEN',
              token: credential.inviteToken,
            } },
          )
          assertCondition(activation.cookie, 'Synthetic activation did not issue a session')
          let snapshot = V2ActivateParticipantResponseSchema.parse(activation.body).snapshot
          const locked = V2ParticipantCommandResponseSchema.parse((await client.request(
            'soak-lock-color',
            'POST',
            '/api/v2/participant/commands',
            { cookie: activation.cookie, body: {
              protocolVersion: '2',
              resetEpoch,
              idempotencyKey: idempotencyKey('lock', index),
              expectedParticipantRevision: snapshot.participant.participantRevision,
              command: 'LOCK_COLOR',
              colorTemperatureKelvin: 2400 + (index % 97) * 90,
            } },
          )).body)
          snapshot = { ...snapshot, participant: locked.participant }
          return { index, cookie: activation.cookie, snapshot } satisfies ParticipantState
        },
      )
      participants.push(...next)
    }

    let visualStart = 0
    for (const [visualIndex, visualTarget] of VISUAL_ACCEPTANCE_COUNTS.entries()) {
      const isolateArrivalEvidence = artifactMode && visualIndex === 0
      const bulkTarget = isolateArrivalEvidence ? visualTarget - 1 : visualTarget
      await onboardRange(visualStart, bulkTarget)
      if (isolateArrivalEvidence) {
        await waitForScreenState(client, pages, {
          heading: '星海集结',
          stars: bulkTarget,
        })
        await sleep(ARRIVAL_SETTLE_MS)
        await onboardRange(bulkTarget, visualTarget)
        await waitForScreenState(client, pages, {
          heading: '星海集结',
          stars: visualTarget,
        })
        await sleep(520)
        await captureArrivalFrame(surfaces, 'arrival-meteor')
        await sleep(660)
        await captureArrivalFrame(surfaces, 'arrival-orbit-capture')
      }
      await waitForScreenState(client, pages, {
        heading: '星海集结',
        stars: visualTarget,
      })
      // Bulk synthetic activation is intentionally unlike the physical NFC
      // cadence. Let those test-only concurrent meteors finish before taking
      // the density reference screenshot for this attendance band.
      await sleep(ARRIVAL_SETTLE_MS)
      await runStage(plannedStages[visualIndex + 1]!)
      visualStart = visualTarget
    }

    const adminLogin = await client.request<V2AdminSnapshot>(
      'soak-admin-login',
      'POST',
      '/api/v2/admin/login',
      { body: stack.credentials.admin },
    )
    assertCondition(adminLogin.cookie, 'Synthetic admin login did not issue a session')
    const adminCookie = adminLogin.cookie
    let admin = V2AdminSnapshotSchema.parse(adminLogin.body)
    const applyAdmin = async (body: Record<string, unknown>) => {
      V2AdminCommandResponseSchema.parse((await client.request(
        'soak-admin-command',
        'POST',
        '/api/v2/admin/commands',
        { cookie: adminCookie, body },
      )).body)
      admin = V2AdminSnapshotSchema.parse((await client.request(
        'soak-admin-snapshot',
        'GET',
        '/api/v2/admin/snapshot',
        { cookie: adminCookie },
      )).body)
    }
    await applyAdmin({
      protocolVersion: '2', resetEpoch,
      idempotencyKey: idempotencyKey('set-live', 0),
      command: 'SET_MODE', expectedRunRevision: admin.runtime.runRevision,
      targetMode: 'LIVE', confirmed: true,
    })
    await applyAdmin({
      protocolVersion: '2', resetEpoch,
      idempotencyKey: idempotencyKey('start', 0),
      command: 'START', expectedRunRevision: admin.runtime.runRevision,
      confirmed: true,
    })

    await onboardRange(FORMAL_VISUAL_REFERENCE_COUNT, PARTICIPANT_COUNT)
    await mapLimit(participants, PRIMARY_CONCURRENCY, async (participant) => {
      const response = V2ParticipantCommandResponseSchema.parse((await client.request(
        'soak-start-star',
        'POST',
        '/api/v2/participant/commands',
        { cookie: participant.cookie, body: {
          protocolVersion: '2', resetEpoch,
          idempotencyKey: idempotencyKey('start-star', participant.index),
          expectedParticipantRevision: participant.snapshot.participant.participantRevision,
          command: 'START_STAR',
        } },
      )).body)
      participant.snapshot = { ...participant.snapshot, participant: response.participant }
    })
    await waitForScreenState(client, pages, { heading: '星海集结', stars: 300 })
    await sleep(ARRIVAL_SETTLE_MS)
    await runStage(plannedStages[6]!)

    const transitionEvidence = await measureProgramTransition({
      expectedStars: PARTICIPANT_COUNT,
      normal: normal!,
      reduced: reduced!,
      onStart: () => applyAdmin({
        protocolVersion: '2', resetEpoch,
        idempotencyKey: idempotencyKey('advance-program', 0),
        command: 'ADVANCE', expectedRunRevision: admin.runtime.runRevision,
        expectedPresentationRevision: admin.presentationRevision,
        confirmed: true, overrideReadinessWarnings: false,
      }),
    })
    stages.push(transitionEvidence)
    assertStageEvidence(transitionEvidence)
    const transitionSamples = await Promise.all(pages.map(sampleSurface))
    allSamples.push(...transitionSamples)
    assertSurfaceSamples(transitionSamples)
    await assertPublicPrivacy(pages, stack!)
    process.stdout.write(
      `V2 render soak stage passed: program-transition (${Math.round(transitionEvidence.durationMs)}ms)\n`,
    )
    const programId = admin.programs[0]?.id
    assertCondition(programId, 'No synthetic program is available for the OBS scene')
    await applyAdmin({
      protocolVersion: '2', resetEpoch,
      idempotencyKey: idempotencyKey('set-program', 0),
      command: 'SET_PROGRAM', expectedRunRevision: admin.runtime.runRevision,
      expectedInteractionRevision: admin.interaction.interactionRevision,
      programId, confirmed: true,
    })
    const programSnapshot = participants[0]!.snapshot.currentProgram ??
      V2ParticipantSnapshotSchema.parse((await client.request(
        'soak-program-participant',
        'GET',
        '/api/v2/participant/snapshot',
        { cookie: participants[0]!.cookie },
      )).body).currentProgram
    const giftId = programSnapshot?.giftCatalog[0]?.id
    assertCondition(giftId, 'No synthetic gift is available for the OBS scene')
    await waitForScreenState(client, pages, { programOverlay: true, stars: 300 })
    const transparencyEvidence = await Promise.all(pages.map(inspectProgramTransparency))
    obsEvidence = transparencyEvidence[0]!
    assertCondition(
      transparencyEvidence.every((evidence) => evidence.backgroundsTransparent),
      'The OBS program scene has an opaque page background',
    )
    assertCondition(
      transparencyEvidence.every((evidence) => evidence.canvasMaxAlpha === 0),
      'The OBS program scene retained visible Canvas pixels after the transition',
    )
    assertCondition(
      transparencyEvidence.every((evidence) =>
        evidence.barragePanels === 0
        && evidence.barrageStreams === 0
        && evidence.barrageItems === 0
        && evidence.headings === 0
        && evidence.sceneCopies === 0
        && evidence.giftVisuals === 0),
      'The OBS program scene retained a persistent web overlay before a live barrage event',
    )
    assertCondition(
      transparencyEvidence.every((evidence) => evidence.mediaElements === 0),
      'The web screen attempted to own program media',
    )

    let interactionCursor = 0
    await runStage(plannedStages[7]!, async () => {
      if (interactionCursor >= participants.length) return
      const participant = participants[interactionCursor]!
      const gift = V2ParticipantCommandResponseSchema.parse((await client.request(
        'soak-send-gift',
        'POST',
        '/api/v2/participant/commands',
        { cookie: participant.cookie, body: {
          protocolVersion: '2', resetEpoch,
          idempotencyKey: idempotencyKey('gift', participant.index),
          expectedParticipantRevision: participant.snapshot.participant.participantRevision,
          command: 'SEND_GIFT', programId, giftId,
        } },
      )).body)
      participant.snapshot = { ...participant.snapshot, participant: gift.participant }
      const barrage = V2ParticipantCommandResponseSchema.parse((await client.request(
        'soak-post-barrage',
        'POST',
        '/api/v2/participant/commands',
        { cookie: participant.cookie, body: {
          protocolVersion: '2', resetEpoch,
          idempotencyKey: idempotencyKey('barrage', participant.index),
          expectedParticipantRevision: participant.snapshot.participant.participantRevision,
          command: 'POST_BARRAGE', text: `v2-soak-${String(interactionCursor).padStart(3, '0')}`,
        } },
      )).body)
      participant.snapshot = { ...participant.snapshot, participant: barrage.participant }
      await normal!.page.locator('.v2-barrage-stream__item', {
        hasText: `v2-soak-${String(interactionCursor).padStart(3, '0')}`,
      }).waitFor({ state: 'visible', timeout: 2_000 })
      assertCondition(
        await reduced!.page.locator('.v2-barrage-stream__item').count() === 0,
        'Reduced motion rendered a moving barrage node',
      )
      interactionCursor += 1
      interactionsSent += 2
    })

    await applyAdmin({
      protocolVersion: '2', resetEpoch,
      idempotencyKey: idempotencyKey('advance-light', 0),
      command: 'ADVANCE', expectedRunRevision: admin.runtime.runRevision,
      expectedPresentationRevision: admin.presentationRevision,
      confirmed: true, overrideReadinessWarnings: false,
    })
    await stack.restartBackend()
    await Promise.all(pages.map(async (page) => {
      await page.getByRole('heading', { name: '协同点亮' }).waitFor({ timeout: 20_000 })
      await page.locator('.v2-signal').waitFor({ state: 'detached', timeout: 20_000 })
    }))
    await mapLimit(participants, PRIMARY_CONCURRENCY, async (participant) => {
      const response = V2ParticipantCommandResponseSchema.parse((await client.request(
        'soak-cooperative-light',
        'POST',
        '/api/v2/participant/commands',
        { cookie: participant.cookie, body: {
          protocolVersion: '2', resetEpoch,
          idempotencyKey: idempotencyKey('light', participant.index),
          expectedParticipantRevision: participant.snapshot.participant.participantRevision,
          command: 'COOPERATIVE_LIGHT',
        } },
      )).body)
      participant.snapshot = { ...participant.snapshot, participant: response.participant }
    })
    await waitForScreenState(client, pages, { heading: '协同点亮', stars: 300 })
    await runStage(plannedStages[8]!)

    await applyAdmin({
      protocolVersion: '2', resetEpoch,
      idempotencyKey: idempotencyKey('complete', 0),
      command: 'COMPLETE', expectedRunRevision: admin.runtime.runRevision,
      expectedPresentationRevision: admin.presentationRevision,
      confirmed: true, overrideReadinessWarnings: false,
    })
    await waitForScreenState(client, pages, { heading: '今夜的星河，已经成形', stars: 300 })
    backendRestartRecovered = true
    await Promise.all(pages.map((page) => page.reload()))
    await waitForScreenState(client, pages, { heading: '今夜的星河，已经成形', stars: 300 })
    pageReloadRecovered = true
    await runStage(plannedStages[9]!)

    for (const stage of stages) assertStageEvidence(stage)
    const diagnostics = surfaces.map((surface) => surface.monitor.diagnostics)
    assertCondition(
      diagnostics.every(diagnosticsPassed),
      'Browser diagnostics recorded an error, failed request, or external request',
    )
    const normalHeapStart = stages[0]?.normal.firstUsedHeapBytes ?? null
    const normalHeapEnd = stages.at(-1)?.normal.lastUsedHeapBytes ?? null
    const reducedHeapStart = stages[0]?.reduced.firstUsedHeapBytes ?? null
    const reducedHeapEnd = stages.at(-1)?.reduced.lastUsedHeapBytes ?? null
    const normalHeapGrowthBytes = normalHeapStart === null || normalHeapEnd === null
      ? null
      : normalHeapEnd - normalHeapStart
    const reducedHeapGrowthBytes = reducedHeapStart === null || reducedHeapEnd === null
      ? null
      : reducedHeapEnd - reducedHeapStart
    assertCondition(
      [normalHeapGrowthBytes, reducedHeapGrowthBytes].every((value) =>
        value === null || value <= 64 * 1024 * 1024),
      'A V2 screen JS heap grew by more than 64 MiB during the measured journey',
    )
    assertCondition(backendRestartRecovered, 'The public screen did not resume events after a backend restart')
    assertCondition(pageReloadRecovered, 'The public screen did not recover after reload')
    status = 'passed'
  } catch (error) {
    topLevelFailure = failureCode(error)
    failureSummary = sanitizeDiagnostic(
      error instanceof Error ? error.message : 'unknown soak failure',
    )
  } finally {
    const diagnostics = [normal, reduced]
      .flatMap((surface) => surface ? [surface.monitor.diagnostics] : [])
    const temporaryRoot = stack ? path.dirname(stack.manifestPath) : null
    await Promise.allSettled([
      normal?.context.close() ?? Promise.resolve(),
      reduced?.context.close() ?? Promise.resolve(),
    ])
    await Promise.allSettled([
      browser?.close() ?? Promise.resolve(),
      reducedBrowser?.close() ?? Promise.resolve(),
    ])
    if (stack) await stack.stop().catch(() => { status = 'failed'; topLevelFailure ??= 'CLEANUP_FAILED' })
    temporaryDirectoryRemoved = temporaryRoot === null || !fs.existsSync(temporaryRoot)
    if (!temporaryDirectoryRemoved) {
      status = 'failed'
      topLevelFailure ??= 'TEMPORARY_DATA_REMAINS'
    }

    const finishedAt = new Date()
    const measuredRenderDurationMs = stages.reduce((sum, stage) => sum + stage.durationMs, 0)
    const normalStageHeaps = stages.flatMap((stage) => [
      stage.normal.firstUsedHeapBytes,
      stage.normal.lastUsedHeapBytes,
      stage.normal.maxUsedHeapBytes,
    ].flatMap((value) => value === null ? [] : [value]))
    const reducedStageHeaps = stages.flatMap((stage) => [
      stage.reduced.firstUsedHeapBytes,
      stage.reduced.lastUsedHeapBytes,
      stage.reduced.maxUsedHeapBytes,
    ].flatMap((value) => value === null ? [] : [value]))
    const report = {
      schemaVersion: REPORT_SCHEMA_VERSION,
      status,
      protocolVersion: '2',
      mode: smokeMode ? 'SMOKE' : 'FORMAL_30_MINUTE',
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      wallDurationMs: round(performance.now() - wallStarted),
      plannedRenderDurationMs,
      measuredRenderDurationMs: round(measuredRenderDurationMs),
      environment: {
        platform: process.platform,
        release: os.release(),
        architecture: process.arch,
        node: process.version,
        browser: browserLabel,
        browserVersion,
        headless: true,
        viewport: VIEWPORT,
      },
      surfaces: {
        normalMotion: true,
        reducedMotion: true,
        renderer: 'single-canvas',
        maxPublicStars: PARTICIPANT_COUNT,
      },
      stages,
      interactions: { anonymousEventsSent: interactionsSent },
      obs: obsEvidence,
      recovery: { backendRestartRecovered, pageReloadRecovered },
      diagnostics,
      memory: {
        normal: {
          samples: normalStageHeaps.length,
          firstUsedHeapBytes: stages[0]?.normal.firstUsedHeapBytes ?? null,
          lastUsedHeapBytes: stages.at(-1)?.normal.lastUsedHeapBytes ?? null,
          maxUsedHeapBytes: normalStageHeaps.length ? Math.max(...normalStageHeaps) : null,
          growthBytes: stages[0]?.normal.firstUsedHeapBytes === null ||
            stages.at(-1)?.normal.lastUsedHeapBytes === null
            ? null
            : stages.at(-1)!.normal.lastUsedHeapBytes! - stages[0]!.normal.firstUsedHeapBytes!,
        },
        reduced: {
          samples: reducedStageHeaps.length,
          firstUsedHeapBytes: stages[0]?.reduced.firstUsedHeapBytes ?? null,
          lastUsedHeapBytes: stages.at(-1)?.reduced.lastUsedHeapBytes ?? null,
          maxUsedHeapBytes: reducedStageHeaps.length ? Math.max(...reducedStageHeaps) : null,
          growthBytes: stages[0]?.reduced.firstUsedHeapBytes === null ||
            stages.at(-1)?.reduced.lastUsedHeapBytes === null
            ? null
            : stages.at(-1)!.reduced.lastUsedHeapBytes! - stages[0]!.reduced.firstUsedHeapBytes!,
        },
      },
      cleanup: {
        temporaryDirectoryRemoved,
        actualRepositoryDatabaseTouched: false,
      },
      limitations: [
        'two desktop Chrome processes, not 300 simultaneous browser renderers',
        'headless loopback render evidence, not OBS compositor or venue display-chain evidence',
        'desktop reduced-motion emulation, not physical-phone or soft-keyboard evidence',
      ],
      topLevelFailure,
      failureSummary,
      privacy: {
        containsCredentials: false,
        containsDisplayNames: false,
        containsCapsuleBodies: false,
        containsBarrageBodies: false,
        auditPassed: false,
      },
    }
    const serialized = JSON.stringify(report)
    const forbidden = stack
      ? [
          stack.credentials.admin.username,
          stack.credentials.admin.password,
          ...stack.credentials.participants.flatMap((participant) => [
            participant.inviteToken,
            participant.displayName,
            participant.studentNumber,
            participant.publicStarId,
          ]),
        ]
      : []
    report.privacy.auditPassed = forbidden.every((value) => !serialized.includes(value))
    if (!report.privacy.auditPassed) {
      report.status = 'failed'
      report.topLevelFailure = 'REPORT_PRIVACY_VIOLATION'
    }
    fs.mkdirSync(REPORT_ROOT, { recursive: true })
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify({
      status: report.status,
      mode: report.mode,
      report: path.relative(REPOSITORY_ROOT, REPORT_PATH).replaceAll('\\', '/'),
      plannedRenderDurationMs: report.plannedRenderDurationMs,
      measuredRenderDurationMs: report.measuredRenderDurationMs,
      browser: report.environment.browser,
      browserVersion: report.environment.browserVersion,
      stages: report.stages.map((stage) => ({
        name: stage.name,
        durationMs: stage.durationMs,
        normalPaintFps: stage.normal.paintFps,
        normalFrameP95Ms: stage.normal.frameIntervalP95Ms,
        reducedPaints: stage.reduced.paintCount,
      })),
      topLevelFailure: report.topLevelFailure,
      failureSummary: report.failureSummary,
    }, null, 2)}\n`)
    if (report.status !== 'passed') process.exitCode = 1
  }
}

await run()
