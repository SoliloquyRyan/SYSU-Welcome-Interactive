import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { startDemoTestStack } from '../tests/e2e/fixtures/demo-stack.ts'
import {
  DISCOVERY_CINEMATIC_DURATION_MS,
  DISCOVERY_VISIBLE_STABLE_MS,
} from '../frontend/src/pages/student/v2-mobile-state.js'

const MOBILE_VIEWPORT = { width: 390, height: 844 }
const CONTROL_VIEWPORT = { width: 1180, height: 820 }
const CHECKER_VIEWPORT = { width: 430, height: 820 }
const smokeMode = process.env.DEMO_PREVIEW_SMOKE === '1'
const artifactMode = smokeMode && process.env.DEMO_PREVIEW_ARTIFACTS === '1'
const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url))
const ARTIFACT_DIRECTORY = path.join(REPOSITORY_ROOT, 'output', 'playwright', 'v2-08-mobile')
const pageDiagnostics = new WeakMap()

function monitorPage(page, baseURL, { expectedHttpFailures = [] } = {}) {
  const failures = []
  const pending = []
  const allowedOrigin = new URL(baseURL).origin
  page.on('pageerror', () => failures.push('pageerror'))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      if (/^Failed to load resource: the server responded with a status of \d+/u.test(message.text())) return
      const safeMessage = message.text()
        .replace(/https?:\/\/\S+/gu, '[url]')
        .replace(/[A-Za-z0-9_-]{32,}/gu, '[redacted]')
        .slice(0, 180)
      failures.push(`console-error:${safeMessage}`)
    }
  })
  page.on('request', (request) => {
    const url = new URL(request.url())
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== allowedOrigin) {
      failures.push('external-network-request')
    }
  })
  page.on('response', (response) => {
    const check = (async () => {
      const status = response.status()
      if (status < 400) return
      const pathname = new URL(response.url()).pathname
      let code = ''
      try { code = (await response.json())?.error?.code ?? '' } catch { /* non-JSON failure */ }
      const expectedAnonymousProbe = status === 401 && code === 'AUTH_REQUIRED' && [
        '/api/v2/participant/snapshot',
        '/api/v2/admin/snapshot',
      ].includes(pathname)
      const expectedReadinessChallenge = status === 409
        && code === 'READINESS_CONFIRMATION_REQUIRED'
        && pathname === '/api/v2/admin/commands'
      const expectedInjectedFailure = expectedHttpFailures.some((expected) =>
        expected.status === status && expected.pathname === pathname)
      if (!expectedAnonymousProbe && !expectedReadinessChallenge && !expectedInjectedFailure) {
        failures.push(`http-status:${status}:${code || 'unknown'}:${pathname}`)
      }
    })()
    pending.push(check)
  })
  pageDiagnostics.set(page, { failures, pending })
}

async function assertPageDiagnostics(page, label) {
  const diagnostics = pageDiagnostics.get(page) ?? { failures: [], pending: [] }
  await Promise.all(diagnostics.pending)
  const failures = diagnostics.failures
  if (failures.length === 0) return
  const counts = Object.fromEntries([...new Set(failures)].map((failure) => [
    failure,
    failures.filter((item) => item === failure).length,
  ]))
  throw new Error(`${label} 存在浏览器错误或非本地请求：${JSON.stringify(counts)}`)
}

const FLOW_ACTION_LABELS = {
  color: '星色选择',
  lock: '锁色与星系拉远',
  submit: '提交胶囊并入场',
  skip: '暂时跳过并入场',
  reload: '刷新并恢复权威状态',
}

const SCENES = {
  READY: { label: '等待启程', mobileTitle: '已抵达，等待全场启程' },
  ASSEMBLY: { label: '星海集结', mobileTitle: '星海集结' },
  PROGRAM_SUPPORT: { label: '节目共振', mobileTitle: '节目共振' },
  COOPERATIVE_LIGHT: { label: '协同点亮', mobileTitle: '协同点亮' },
  COMPLETED: { label: '权威终章', mobileTitle: '今夜的星河，已经成形' },
}

const FLOW_CHECKER_HTML = String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>协议 v2 手机动线检查器</title>
    <style>
      :root { color-scheme: dark; font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; color:#edf4ff; background:#030817; }
      * { box-sizing:border-box; }
      body { min-height:100vh; margin:0; background:radial-gradient(circle at 82% 2%,rgba(85,126,255,.2),transparent 32%),linear-gradient(180deg,#07132b,#030817 72%); }
      main { width:min(100%,430px); min-height:100vh; margin:auto; padding:22px 18px 30px; }
      .eyebrow { margin:0 0 8px; color:#8db4ff; font:700 11px/1.3 Consolas,monospace; letter-spacing:.14em; }
      h1 { margin:0; font-size:25px; line-height:1.18; }
      .lede { margin:10px 0 18px; color:#a6b8d5; font-size:13px; line-height:1.65; }
      .status { min-height:58px; margin-bottom:16px; padding:12px 14px; border:1px solid rgba(145,179,235,.26); border-left:3px solid #ffb968; border-radius:10px; background:rgba(9,24,49,.9); font-size:13px; line-height:1.55; }
      .status[data-tone="busy"] { border-left-color:#7ca9ff; }
      .status[data-tone="success"] { border-left-color:#55d6b0; }
      .status[data-tone="danger"] { border-left-color:#ff7184; }
      section { margin-top:12px; padding:15px; border:1px solid rgba(145,179,235,.2); border-radius:12px; background:rgba(7,18,38,.9); }
      h2 { margin:0; font-size:15px; }
      section>p { margin:7px 0 13px; color:#92a8ca; font-size:12px; line-height:1.55; }
      .actions,.scenes { display:grid; gap:8px; }
      .scenes { grid-template-columns:repeat(2,minmax(0,1fr)); }
      button { min-height:46px; padding:9px 12px; border:1px solid rgba(144,181,238,.34); border-radius:8px; color:#edf4ff; background:#102344; font:650 13px/1.25 inherit; text-align:left; cursor:pointer; }
      button:hover:not(:disabled) { border-color:#91b8f5; background:#17335e; }
      button:focus-visible { outline:3px solid #70a4ff; outline-offset:2px; }
      button:disabled { cursor:wait; color:#7183a0; background:#0a1426; }
      button::before { margin-right:8px; color:#ffbe72; content:attr(data-index); }
      .utility { width:100%; border-style:dashed; background:transparent; }
      .note { margin:14px 2px 0; color:#788ead; font-size:11px; line-height:1.6; }
      @media (prefers-reduced-motion:reduce) { *,*::before,*::after { transition:none!important; animation:none!important; } }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">PROTOCOL V2 / TEMP SYNTHETIC DB</p>
      <h1>手机入场与现场检查器</h1>
      <p class="lede">右侧手机窗口连接真实 v2 临时服务。个人入场与全场场景是两只独立时钟，动画不会创建或推进业务事实。</p>
      <div id="flow-status" class="status" role="status" aria-live="polite">准备就绪：首次发现镜头会自动结束在星色选择。</div>

      <section aria-labelledby="entry-title">
        <h2 id="entry-title">个人入场 1 / 2 → 2 / 2</h2>
        <p>锁色后不可回退；提交或持久跳过胶囊后才进入当时的现场场景。</p>
        <div class="actions">
          <button type="button" data-action="color" data-index="01">显示星色选择</button>
          <button type="button" data-action="lock" data-index="02">确认星色并完成拉远</button>
          <button type="button" data-action="submit" data-index="03A">提交合成胶囊并入场</button>
          <button type="button" data-action="skip" data-index="03B">暂时跳过并入场</button>
        </div>
      </section>

      <section aria-labelledby="scene-title">
        <h2 id="scene-title">LIVE 单向现场编排</h2>
        <p>检查器只调用真实后台控制。已经推进的场景不会回跳；重看请重启这次预览。</p>
        <div class="scenes">
          <button type="button" data-scene="READY" data-index="00">等待启程</button>
          <button type="button" data-scene="ASSEMBLY" data-index="01">星海集结</button>
          <button type="button" data-scene="PROGRAM_SUPPORT" data-index="02">节目共振</button>
          <button type="button" data-scene="COOPERATIVE_LIGHT" data-index="03">协同点亮</button>
          <button type="button" data-scene="COMPLETED" data-index="✓">结束并锁定终章</button>
        </div>
      </section>

      <section aria-labelledby="restore-title">
        <h2 id="restore-title">恢复检查</h2>
        <p>刷新只从服务端恢复，不补播首次电影镜头，也不恢复未提交的本页草稿。</p>
        <button class="utility" type="button" data-action="reload" data-index="↻">刷新手机窗口</button>
      </section>

      <p class="note">全部身份和内容均为临时合成数据。关闭手机窗口或按 Ctrl+C 会关闭全部窗口并删除临时数据库；检查器不会显示令牌、姓名、学号或后台凭据。</p>
    </main>
  </body>
</html>`

async function launchBrowser() {
  const candidates = [
    { label: 'Google Chrome', options: { channel: 'chrome' } },
    { label: 'Microsoft Edge', options: { channel: 'msedge' } },
    { label: 'Playwright Chromium', options: {} },
  ]
  const failures = []
  for (const candidate of candidates) {
    try {
      return {
        browser: await chromium.launch({ ...candidate.options, headless: smokeMode }),
        label: candidate.label,
      }
    } catch {
      failures.push(candidate.label)
    }
  }
  throw new Error(`无法打开浏览器，已尝试：${failures.join('、')}。`)
}

async function openAdminController(demo, browser) {
  const context = await browser.newContext({
    baseURL: demo.baseURL,
    viewport: CONTROL_VIEWPORT,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const page = await context.newPage()
  monitorPage(page, demo.baseURL)
  page.on('dialog', (dialog) => void dialog.accept())
  await page.goto('/admin')
  await page.getByRole('heading', { name: '共用 Demo 后台登录' }).waitFor()
  await page.getByLabel('账号').fill(demo.credentials.admin.username)
  await page.getByLabel('密码').fill(demo.credentials.admin.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('heading', { name: '三场景控制台' }).waitFor()
  await page.getByText('权威实时已连接', { exact: true }).waitFor()

  const runtimeFacts = page.locator('.runtime-facts')
  if ((await runtimeFacts.innerText()).includes('排练')) {
    await page.getByRole('button', { name: '切换为现场' }).click()
    await runtimeFacts.filter({ hasText: '现场' }).waitFor()
  }
  await page.evaluate(() => { document.title = 'v2 现场控制台 · SYSU Welcome' })
  return { context, page }
}

async function assertPublicSurfaceOmitsSecrets(page, secrets, label) {
  const privacySafe = await page.evaluate((sensitiveValues) => {
    const publicSurface = [
      window.location.href,
      document.body?.innerText ?? '',
      document.documentElement?.innerHTML ?? '',
    ].join('\n')
    return sensitiveValues.every((value) => !value || !publicSurface.includes(value))
  }, secrets)
  if (!privacySafe) throw new Error(`${label}的脱敏门未通过。`)
}

async function waitForDiscoveryProgress(page, progress) {
  await page.waitForFunction((expectedProgress) => {
    const star = document.querySelector('[data-testid="persistent-focus-star"]')
    const animation = star?.getAnimations().find(
      (candidate) => candidate.animationName.startsWith('discovery-focus-star'),
    )
    return (animation?.effect?.getComputedTiming().progress ?? 0) >= expectedProgress
  }, progress, { timeout: DISCOVERY_CINEMATIC_DURATION_MS + 1_000 })
}

async function captureDiscoveryFrame(page, secrets, name, progress = null) {
  if (!artifactMode) return null
  if (progress !== null) await waitForDiscoveryProgress(page, progress)
  await assertPublicSurfaceOmitsSecrets(page, secrets, `寻星 ${name} 截图`)
  await mkdir(ARTIFACT_DIRECTORY, { recursive: true })
  const observedProgress = await page.evaluate(() => {
    const animation = document.querySelector('[data-testid="persistent-focus-star"]')
      ?.getAnimations()
      .find((candidate) => candidate.animationName.startsWith('discovery-focus-star'))
    return animation?.effect?.getComputedTiming().progress ?? 1
  })
  const artifactPath = path.join(ARTIFACT_DIRECTORY, `${name}.png`)
  await page.locator('.v2-welcome').screenshot({
    path: artifactPath,
    animations: 'allow',
    mask: [page.locator('input:not([type="range"]):not([type="checkbox"]), textarea, .own-star-label')],
    maskColor: '#07101f',
  })
  return { artifactPath, observedProgress }
}

async function startDiscoveryClsWindow(page) {
  await page.evaluate(() => {
    window.__d027LayoutShiftStart = performance.now()
    window.__d027LayoutShiftValue = 0
    window.__d027LayoutShiftEntries = []
  })
}

async function observeDiscoveryCinematic(
  page,
  secrets,
  {
    captureArtifact = true,
    label = 'D-027 normal-motion discovery observed',
    pendingStarHandle = null,
  } = {},
) {
  await page.bringToFront()
  const motionEnvironment = await page.evaluate(() => ({
    visible: document.visibilityState === 'visible',
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }))
  if (!motionEnvironment.visible || motionEnvironment.reduced) {
    throw new Error(`首次寻星 smoke 不是 visible normal-motion 环境：${JSON.stringify(motionEnvironment)}`)
  }

  const cinematic = page.locator('[data-testid="color-onboarding"].color-onboarding--discovering')
  const star = page.locator('[data-testid="persistent-focus-star"]')
  const controls = page.locator('[data-testid="persistent-color-controls"]')
  await cinematic.waitFor({ state: 'visible', timeout: 6_000 })
  const startedAt = await page.evaluate(() => performance.now())
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }))

  const persistentHandle = pendingStarHandle ?? await star.elementHandle()
  if (!persistentHandle) throw new Error('寻星未渲染持久焦点星节点。')
  const sameNodeAtStart = await persistentHandle.evaluate((node) => (
    node === document.querySelector('[data-testid="persistent-focus-star"]')
  ))
  if (!sameNodeAtStart) throw new Error('pending → discovering 期间焦点星节点被替换。')

  const startState = await cinematic.evaluate((element) => {
    const animatedElements = [
      ...element.querySelectorAll('[data-discovery-layer]'),
      document.querySelector('[data-testid="persistent-focus-star"]'),
      document.querySelector('.focus-star__neutral'),
      document.querySelector('.focus-star__temperature'),
      element.querySelector('.discovery-copy'),
      element.querySelector('.selection-copy'),
      document.querySelector('.dock-discovery-status'),
      document.querySelector('[data-testid="persistent-color-controls"]'),
    ].filter(Boolean)
    const animations = animatedElements.map((animatedElement) => {
      const style = getComputedStyle(animatedElement)
      return {
        name: style.animationName,
        duration: style.animationDuration,
        timing: style.animationTimingFunction,
      }
    })
    const controlsElement = document.querySelector('[data-testid="persistent-color-controls"]')
    return {
      duration: getComputedStyle(element).getPropertyValue('--discovery-duration').trim(),
      animations,
      runningAnimations: [
        ...element.getAnimations({ subtree: true }),
        ...document.querySelector('[data-testid="persistent-focus-star"]')
          ?.getAnimations({ subtree: true }) ?? [],
      ].filter(({ playState }) => playState === 'running').length,
      controlsInert: controlsElement?.inert === true,
      controlsAriaHidden: controlsElement?.getAttribute('aria-hidden'),
      controlsOpacity: Number.parseFloat(getComputedStyle(controlsElement).opacity),
    }
  })
  if (startState.duration !== `${DISCOVERY_CINEMATIC_DURATION_MS}ms`) {
    throw new Error(`寻星 CSS/JS 时长漂移：${JSON.stringify(startState)}`)
  }
  for (const expectedName of [
    'discovery-corridor-far',
    'discovery-corridor-near',
    'discovery-signal-axis',
    'discovery-target-lock',
    'discovery-focus-star',
    'discovery-neutral-star',
    'discovery-temperature-star',
    'discovery-status-exit',
    'discovery-selection-enter',
  ]) {
    if (!startState.animations.some(({ name }) => name.startsWith(expectedName))) {
      throw new Error(`寻星缺少 ${expectedName} 动画：${JSON.stringify(startState)}`)
    }
  }
  if (
    startState.animations.some(({ duration, timing }) => (
      duration !== `${DISCOVERY_CINEMATIC_DURATION_MS / 1000}s` || timing !== 'linear'
    ))
  ) {
    throw new Error(`寻星层没有共用同一 linear master：${JSON.stringify(startState)}`)
  }
  if (!startState.controlsInert || startState.controlsAriaHidden !== 'true' || startState.controlsOpacity > 0.1) {
    throw new Error(`寻星中选色控件未预渲染并保持不可交互：${JSON.stringify(startState)}`)
  }
  if (startState.runningAnimations < 9) {
    throw new Error(`寻星动画没有真实运行：${JSON.stringify(startState)}`)
  }

  const clsBaseline = await page.evaluate(() => {
    if (!Number.isFinite(window.__d027LayoutShiftStart)) {
      window.__d027LayoutShiftStart = performance.now()
      window.__d027LayoutShiftValue = 0
      window.__d027LayoutShiftEntries = []
    }
    return 0
  })
  await page.evaluate(() => {
    const focus = document.querySelector('[data-testid="persistent-focus-star"]')
    if (!focus) return
    const recordFinalFrame = (event) => {
      if (event.target !== focus || !event.animationName.startsWith('discovery-focus-star')) return
      const rect = focus.getBoundingClientRect()
      const temperature = focus.querySelector('.focus-star__temperature')
      const corridorFar = document.querySelector('.discovery-corridor--far')
      const corridorNear = document.querySelector('.discovery-corridor--near')
      const signalAxis = document.querySelector('.discovery-signal-axis')
      const controlPanel = document.querySelector('[data-testid="persistent-color-controls"]')
      const controlStyle = getComputedStyle(controlPanel)
      window.__d027DiscoveryFinalFrame = {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        color: getComputedStyle(focus).getPropertyValue('--selected-color').trim(),
        temperatureBackground: getComputedStyle(temperature).backgroundImage,
        temperatureOpacity: Number.parseFloat(getComputedStyle(temperature).opacity),
        controlsOpacity: Number.parseFloat(controlStyle.opacity),
        controlsTransform: controlStyle.transform,
        corridorFarOpacity: Number.parseFloat(getComputedStyle(corridorFar).opacity),
        corridorNearOpacity: Number.parseFloat(getComputedStyle(corridorNear).opacity),
        signalAxisOpacity: Number.parseFloat(getComputedStyle(signalAxis).opacity),
        cls: window.__d027LayoutShiftValue ?? 0,
      }
      focus.removeEventListener('animationend', recordFinalFrame)
    }
    focus.addEventListener('animationend', recordFinalFrame)
  })

  const frames = []
  if (captureArtifact) {
    for (const [name, progress] of [
      ['00a-discovery-f1-12', 0.12],
      ['00b-discovery-f2-35', 0.35],
      ['00c-discovery-f3-60', 0.6],
      ['00d-discovery-f4-82', 0.82],
      ['00e-discovery-f5-94', 0.94],
    ]) {
      const frame = await captureDiscoveryFrame(page, secrets, name, progress)
      if (frame) frames.push(frame)
    }
  } else {
    await waitForDiscoveryProgress(page, 0.6)
  }

  await page.waitForFunction(() => (
    !document.querySelector('.color-onboarding--discovering')
    && document.querySelector('[data-testid="persistent-focus-star"]')
  ), undefined, { timeout: DISCOVERY_CINEMATIC_DURATION_MS + 1_500 })
  const endedAt = await page.evaluate(() => performance.now())
  const observedDuration = endedAt - startedAt
  if (
    observedDuration < DISCOVERY_CINEMATIC_DURATION_MS - 250
    || observedDuration > DISCOVERY_CINEMATIC_DURATION_MS + 500
  ) {
    throw new Error(`寻星实际可见时长偏离目标：${Math.round(observedDuration)}ms`)
  }
  if (captureArtifact) {
    const frame = await captureDiscoveryFrame(page, secrets, '00f-discovery-f6-settled')
    if (frame) frames.push(frame)
  }

  const continuity = await persistentHandle.evaluate((node, baseline) => {
    const current = document.querySelector('[data-testid="persistent-focus-star"]')
    const finalFrame = window.__d027DiscoveryFinalFrame
    const rect = node.getBoundingClientRect()
    const temperature = node.querySelector('.focus-star__temperature')
    const controlPanel = document.querySelector('[data-testid="persistent-color-controls"]')
    const controlStyle = getComputedStyle(controlPanel)
    return {
      sameNode: node === current && node.isConnected,
      finalFrame,
      settled: {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        color: getComputedStyle(node).getPropertyValue('--selected-color').trim(),
        temperatureBackground: getComputedStyle(temperature).backgroundImage,
        controlsOpacity: Number.parseFloat(controlStyle.opacity),
        controlsTransform: controlStyle.transform,
        controlsInert: controlPanel.inert,
        controlsAriaHidden: controlPanel.getAttribute('aria-hidden'),
      },
      cls: (window.__d027LayoutShiftValue ?? 0) - baseline,
      clsEntries: window.__d027LayoutShiftEntries ?? [],
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }
  }, clsBaseline)
  await persistentHandle.dispose()

  const finalFrame = continuity.finalFrame
  const settled = continuity.settled
  const identityTransforms = new Set(['none', 'matrix(1, 0, 0, 1, 0, 0)'])
  const boxDelta = finalFrame ? Math.max(
    Math.abs(finalFrame.centerX - settled.centerX),
    Math.abs(finalFrame.centerY - settled.centerY),
    Math.abs(finalFrame.width - settled.width),
    Math.abs(finalFrame.height - settled.height),
  ) : Infinity
  if (
    !continuity.sameNode
    || !finalFrame
    || boxDelta > 1
    || finalFrame.color !== settled.color
    || finalFrame.temperatureBackground !== settled.temperatureBackground
    || finalFrame.temperatureOpacity < 0.99
    || finalFrame.controlsOpacity < 0.99
    || finalFrame.corridorFarOpacity >= 0.02
    || finalFrame.corridorNearOpacity >= 0.02
    || finalFrame.signalAxisOpacity >= 0.02
    || settled.controlsOpacity < 0.99
    || !identityTransforms.has(finalFrame.controlsTransform)
    || !identityTransforms.has(settled.controlsTransform)
    || settled.controlsInert
    || settled.controlsAriaHidden !== null
    || Math.abs(settled.centerX - continuity.viewport.width * 0.5) > 1
    || Math.abs(settled.centerY - continuity.viewport.height * 0.42) > 1
    || continuity.cls >= 0.01
  ) {
    throw new Error(`F6→F7 连续性门未通过：${JSON.stringify({ ...continuity, boxDelta })}`)
  }

  process.stdout.write(`${label}: ${Math.round(observedDuration)}ms; F6→F7 box Δ${boxDelta.toFixed(2)}px; CLS ${continuity.cls.toFixed(4)}.\n`)
  if (frames.length > 0) {
    process.stdout.write(`D-027 sequence frames: ${frames.map(({ artifactPath, observedProgress }) => `${artifactPath} @${Math.round(observedProgress * 100)}%`).join(', ')}.\n`)
  }
  return { observedDuration, continuity, frames }
}

async function openInvitation(page, demo, participant, { expectDiscovery = false, secrets = [] } = {}) {
  await page.addInitScript(() => {
    window.__d027LayoutShiftValue = 0
    window.__d027LayoutShiftStart = Number.POSITIVE_INFINITY
    window.__d027LayoutShiftEntries = []
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (
            !entry.hadRecentInput
            && entry.startTime >= window.__d027LayoutShiftStart
          ) {
            window.__d027LayoutShiftValue += entry.value
            window.__d027LayoutShiftEntries.push({
              startTime: entry.startTime,
              value: entry.value,
              sources: entry.sources?.map((source) => ({
                className: typeof source.node?.className === 'string' ? source.node.className : '',
                tagName: source.node?.tagName ?? '',
                previousRect: source.previousRect,
                currentRect: source.currentRect,
              })) ?? [],
            })
          }
        }
      })
      observer.observe({ type: 'layout-shift', buffered: true })
    } catch {
      // Layout Instability API is diagnostic-only; continuity geometry remains authoritative.
    }
  })
  const invitation = new URL('/welcome', demo.baseURL)
  invitation.searchParams.set('token', participant.inviteToken)
  await page.goto(invitation.toString())
  await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('token'))
  if (expectDiscovery) {
    await page.getByRole('heading', { name: '正在稳定你的星际信号' })
      .waitFor({ state: 'visible', timeout: 6_000 })
    await startDiscoveryClsWindow(page)
    const pendingStarHandle = await page.locator('[data-testid="persistent-focus-star"]').elementHandle()
    if (await page.getByRole('heading', { name: '为你的星选择颜色' }).isVisible()) {
      throw new Error('寻星启动等待期间误闪了星色选择。')
    }
    await observeDiscoveryCinematic(page, secrets, { pendingStarHandle })
  } else {
    await page.getByRole('heading', { name: /正在寻找属于你的信号|正在稳定你的星际信号|沿着轨道信号，找到你的星|为你的星选择颜色/u }).waitFor()
  }
  await page.evaluate(() => { document.title = 'v2 手机端实时预览 · SYSU Welcome' })
}

async function createVisibilityScenarioPage(demo, browser, initialHidden) {
  const context = await browser.newContext({
    baseURL: demo.baseURL,
    viewport: MOBILE_VIEWPORT,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const page = await context.newPage()
  await page.addInitScript(({ hiddenAtBoot }) => {
    let syntheticHidden = hiddenAtBoot
    try {
      Object.defineProperties(document, {
        hidden: {
          configurable: true,
          get: () => syntheticHidden,
        },
        visibilityState: {
          configurable: true,
          get: () => syntheticHidden ? 'hidden' : 'visible',
        },
      })
      Object.defineProperty(window, '__setPreviewVisibilityForSmoke', {
        configurable: true,
        value(nextHidden) {
          syntheticHidden = Boolean(nextHidden)
          document.dispatchEvent(new Event('visibilitychange'))
        },
      })
      Object.defineProperty(window, '__previewVisibilityOverrideInstalled', {
        configurable: true,
        value: true,
      })
    } catch {
      Object.defineProperty(window, '__previewVisibilityOverrideInstalled', {
        configurable: true,
        value: false,
      })
    }
  }, { hiddenAtBoot: initialHidden })
  monitorPage(page, demo.baseURL)
  return { context, page }
}

async function setSyntheticVisibility(page, hidden) {
  const state = await page.evaluate((nextHidden) => {
    window.__setPreviewVisibilityForSmoke?.(nextHidden)
    return {
      installed: window.__previewVisibilityOverrideInstalled === true,
      hidden: document.hidden,
      visibilityState: document.visibilityState,
    }
  }, hidden)
  const expectedState = hidden ? 'hidden' : 'visible'
  if (!state.installed || state.hidden !== hidden || state.visibilityState !== expectedState) {
    throw new Error(`可见性 smoke 覆写不可用：${JSON.stringify(state)}`)
  }
}

async function runPreStartVisibilityHandoff(demo, browser, participant) {
  const { context, page } = await createVisibilityScenarioPage(demo, browser, true)
  const secrets = [participant.inviteToken, participant.displayName, participant.studentNumber]
  try {
    await openInvitation(page, demo, participant)
    await setSyntheticVisibility(page, true)
    const pending = page.getByRole('heading', { name: '正在稳定你的星际信号' })
    await pending.waitFor({ state: 'visible', timeout: 6_000 })
    await startDiscoveryClsWindow(page)
    await page.waitForTimeout(DISCOVERY_VISIBLE_STABLE_MS + 180)
    if (
      !await pending.isVisible()
      || await page.locator('.cinematic--discovering').isVisible()
      || await page.getByRole('heading', { name: '为你的星选择颜色' }).isVisible()
    ) {
      throw new Error('页面隐藏超过稳定窗口时没有保持寻星等待态。')
    }

    await setSyntheticVisibility(page, false)
    await observeDiscoveryCinematic(page, secrets, {
      captureArtifact: false,
      label: 'D-027 hidden-to-visible discovery observed',
    })
    await waitForColor(page)
    await assertPublicSurfaceOmitsSecrets(page, secrets, 'hidden-to-visible 场景')
    await assertPageDiagnostics(page, 'hidden-to-visible 寻星场景')
  } finally {
    await context.close()
  }
}

async function runPlayingVisibilityInterruption(demo, browser, participant) {
  const { context, page } = await createVisibilityScenarioPage(demo, browser, false)
  const secrets = [participant.inviteToken, participant.displayName, participant.studentNumber]
  try {
    await openInvitation(page, demo, participant)
    await setSyntheticVisibility(page, false)
    await page.getByRole('heading', { name: '正在稳定你的星际信号' })
      .waitFor({ state: 'visible', timeout: 6_000 })
    const cinematic = page.locator('.cinematic--discovering')
    await cinematic.waitFor({ state: 'visible', timeout: 6_000 })
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    }))
    const runningAnimations = await cinematic.evaluate((element) => (
      element.getAnimations({ subtree: true }).filter(({ playState }) => playState === 'running').length
    ))
    if (runningAnimations < 5) throw new Error('开播后隐藏场景没有进入真实寻星动画。')

    const hiddenAt = await page.evaluate(() => performance.now())
    await setSyntheticVisibility(page, true)
    await cinematic.waitFor({ state: 'hidden', timeout: 750 })
    await page.getByRole('heading', { name: '为你的星选择颜色' })
      .waitFor({ state: 'visible', timeout: 750 })
    const collapsedAt = await page.evaluate(() => performance.now())
    if (collapsedAt - hiddenAt > 600) {
      throw new Error(`开播后隐藏未及时收束静态：${Math.round(collapsedAt - hiddenAt)}ms`)
    }

    await setSyntheticVisibility(page, false)
    await page.waitForTimeout(DISCOVERY_VISIBLE_STABLE_MS + 260)
    if (
      await cinematic.isVisible()
      || !await page.getByRole('heading', { name: '为你的星选择颜色' }).isVisible()
    ) {
      throw new Error('寻星中断返回后发生重播或没有保持权威静态状态。')
    }
    await assertPublicSurfaceOmitsSecrets(page, secrets, '开播后隐藏场景')
    await assertPageDiagnostics(page, '开播后隐藏寻星场景')
  } finally {
    await context.close()
  }
}

async function waitForColor(page) {
  const heading = page.getByRole('heading', { name: '为你的星选择颜色' })
  await heading.waitFor({ timeout: 8_000 })
  await page.getByRole('button', { name: '确认星色' }).waitFor({ state: 'visible' })
  await waitForEnabled(page.getByRole('button', { name: '确认星色' }), '确认星色')
  return heading
}

async function waitForEnabled(locator, label) {
  await locator.waitFor({ state: 'visible' })
  try {
    await locator.click({ trial: true, timeout: 8_000 })
  } catch (error) {
    throw new Error(`“${label}”仍不可操作：${await locator.page().locator('body').innerText()}`, { cause: error })
  }
}

async function presentMobileBeforeAction(page) {
  await page.bringToFront()
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }))
}

async function ensureCapsuleDecision(page) {
  const capsule = page.getByRole('heading', { name: /留一句话\s*给未来/u })
  if (await capsule.isVisible()) return capsule
  const colorHeading = page.getByRole('heading', { name: '为你的星选择颜色' })
  if (!(await colorHeading.isVisible())) {
    try { await capsule.waitFor({ timeout: 8_000 }) }
    catch (error) {
      throw new Error(`锁色后的手机状态不符合预期：${await page.locator('body').innerText()}`, { cause: error })
    }
    return capsule
  }
  await waitForColor(page)
  const confirmColor = page.getByRole('button', { name: '确认星色' })
  await waitForEnabled(confirmColor, '确认星色')
  await presentMobileBeforeAction(page)
  await confirmColor.click()
  await capsule.waitFor({ timeout: 8_000 })
  return capsule
}

async function ensureAdmitted(page, decision = 'skip') {
  const sceneHeading = page.locator('.scene-copy h2')
  if (await sceneHeading.isVisible()) return
  await ensureCapsuleDecision(page)
  await presentMobileBeforeAction(page)
  if (decision === 'submit') {
    await page.getByLabel('时光胶囊').fill('今夜，从这里出发。')
    await page.getByLabel(/我同意这段文字进入人工审核候选池/u).check()
    await page.getByRole('button', { name: '提交并进入现场' }).click()
  } else {
    await page.getByRole('button', { name: '暂时跳过' }).click()
  }
  await sceneHeading.waitFor({ timeout: 8_000 })
}

function runtimeRank(runtimeText) {
  if (runtimeText.includes('已完成')) return 4
  if (runtimeText.includes('03 协同点亮')) return 3
  if (runtimeText.includes('02 节目应援')) return 2
  if (runtimeText.includes('01 星海集结')) return 1
  return 0
}

async function driveRuntime(controllerPage, target) {
  const targetRank = ['READY', 'ASSEMBLY', 'PROGRAM_SUPPORT', 'COOPERATIVE_LIGHT', 'COMPLETED'].indexOf(target)
  const runtimeFacts = controllerPage.locator('.runtime-facts')
  let currentRank = runtimeRank(await runtimeFacts.innerText())
  if (targetRank < currentRank) throw new Error('现场已经推进；请重启临时预览后重看较早场景。')

  while (currentRank < targetRank) {
    if (currentRank === 0) {
      await controllerPage.getByRole('button', { name: '开始活动' }).click()
    } else if (currentRank < 3) {
      await controllerPage.getByRole('button', { name: '推进下一场景' }).click()
    } else {
      await controllerPage.getByRole('button', { name: '结束并锁定终章' }).click()
    }
    currentRank += 1
    const expected = currentRank === 4
      ? '已完成'
      : [``, '01 星海集结', '02 节目应援', '03 协同点亮'][currentRank]
    await runtimeFacts.filter({ hasText: expected }).waitFor({ timeout: 8_000 })
  }
}

async function waitForMobileScene(page, scene) {
  await page.getByRole('heading', { name: SCENES[scene].mobileTitle }).waitFor({ timeout: 8_000 })
}

async function setCheckerStatus(page, message, tone = 'idle') {
  await page.evaluate(({ message, tone }) => {
    const status = document.querySelector('#flow-status')
    if (!(status instanceof HTMLElement)) return
    status.textContent = message
    status.dataset.tone = tone
  }, { message, tone })
}

async function setCheckerBusy(page, busy) {
  await page.evaluate((nextBusy) => {
    for (const button of document.querySelectorAll('button')) button.disabled = nextBusy
  }, busy)
}

async function createChecker(context, mobilePage, controllerPage) {
  const page = await context.newPage()
  await page.setViewportSize(CHECKER_VIEWPORT)
  let queue = Promise.resolve()

  const run = (label, action) => {
    queue = queue.then(async () => {
      await setCheckerBusy(page, true)
      await setCheckerStatus(page, `正在进入：${label}`, 'busy')
      try {
        const message = await action()
        await setCheckerStatus(page, message ?? `已进入：${label}`, 'success')
      } catch (error) {
        await setCheckerStatus(page, `未能进入“${label}”：${error instanceof Error ? error.message : String(error)}`, 'danger')
      } finally {
        await setCheckerBusy(page, false)
      }
    })
    return queue
  }

  await page.exposeBinding('v2FlowAction', (_source, action) => run(FLOW_ACTION_LABELS[action] ?? action, async () => {
    if (action === 'color') {
      await waitForColor(mobilePage)
      await mobilePage.bringToFront()
      return '已显示入场 1 / 2 的星色选择。'
    }
    if (action === 'lock') {
      await ensureCapsuleDecision(mobilePage)
      await mobilePage.bringToFront()
      return '锁色事实已提交，公共星点已出现；拉远镜头结束在入场 2 / 2。'
    }
    if (action === 'submit' || action === 'skip') {
      await ensureAdmitted(mobilePage, action)
      await mobilePage.bringToFront()
      return action === 'submit' ? '胶囊已提交，个人入场完成。' : '胶囊已持久跳过，个人入场完成且可在档案补写。'
    }
    if (action === 'reload') {
      await mobilePage.reload()
      await mobilePage.getByRole('heading', { name: /为你的星选择颜色|留一句话\s*给未来|已抵达，等待全场启程|星海集结|节目共振|协同点亮|今夜的星河，已经成形/u }).waitFor()
      await mobilePage.bringToFront()
      return '已从权威快照恢复；首次电影镜头没有重播。'
    }
    throw new Error('未知入场动作。')
  }))

  await page.exposeBinding('v2SceneAction', (_source, scene) => run(SCENES[scene]?.label ?? scene, async () => {
    if (!SCENES[scene]) throw new Error('未知现场场景。')
    await ensureAdmitted(mobilePage)
    await driveRuntime(controllerPage, scene)
    await waitForMobileScene(mobilePage, scene)
    await mobilePage.bringToFront()
    return `已进入：${SCENES[scene].label}。`
  }))

  await page.goto('about:blank')
  await page.setContent(FLOW_CHECKER_HTML, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    document.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof HTMLButtonElement)) return
      if (target.dataset.action) void window.v2FlowAction(target.dataset.action)
      if (target.dataset.scene) void window.v2SceneAction(target.dataset.scene)
    })
  })
  return page
}

async function clickChecker(checker, selector, statusText) {
  await checker.locator(selector).click()
  try {
    await checker.locator('#flow-status[data-tone="success"]').filter({ hasText: statusText }).waitFor({ timeout: 12_000 })
  } catch (error) {
    const actual = await checker.getByRole('status').innerText().catch(() => '检查器状态不可读')
    throw new Error(`等待“${statusText}”失败；检查器当前显示：${actual}`, { cause: error })
  }
}

async function capture(page, name) {
  if (!artifactMode) return
  await mkdir(ARTIFACT_DIRECTORY, { recursive: true })
  await page.screenshot({
    path: path.join(ARTIFACT_DIRECTORY, `${name}.png`),
    fullPage: true,
  })
}

async function setPhoneViewport(page, viewport) {
  await page.setViewportSize(viewport)
  await page.waitForFunction(() => {
    const root = document.querySelector('.v2-welcome')
    if (!root) return false
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    return Math.abs(root.getBoundingClientRect().height - viewportHeight) <= 1
  })
}

async function assertPhoneShell(page, label) {
  const result = await page.evaluate(() => {
    const root = document.querySelector('.v2-welcome')
    const scrolling = document.scrollingElement
    const controls = [...document.querySelectorAll('button:not([hidden]), input:not([hidden]):not([type="checkbox"]), textarea:not([hidden]), label.check-row')]
      .filter((element) => {
        const box = element.getBoundingClientRect()
        return box.width > 0 && box.height > 0 && !element.closest('[inert]')
      })
      .map((element) => ({
        label: element.getAttribute('aria-label')
          || element.labels?.[0]?.textContent?.trim()
          || element.textContent?.trim()
          || element.tagName,
        height: element.getBoundingClientRect().height,
      }))
    const sliders = [...document.querySelectorAll('input[type="range"]')]
      .filter((element) => !element.closest('[inert]'))
      .map((element) => ({
        id: element.id,
        name: element.getAttribute('aria-label') || element.labels?.[0]?.textContent?.trim() || '',
      }))
    return {
      rootPresent: Boolean(root),
      rootWidth: root?.getBoundingClientRect().width ?? 0,
      rootHeight: root?.getBoundingClientRect().height ?? 0,
      viewportWidth: window.visualViewport?.width ?? window.innerWidth,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      pageScrollWidth: scrolling?.scrollWidth ?? 0,
      pageScrollHeight: scrolling?.scrollHeight ?? 0,
      shortControls: controls.filter(({ height }) => height < 43.5),
      unnamedSliders: sliders.filter(({ name }) => name.length === 0),
    }
  })
  if (!result.rootPresent || Math.abs(result.rootWidth - result.viewportWidth) > 1) {
    throw new Error(`${label} 手机页面根容器缺失或宽度未贴合视觉视口：${JSON.stringify(result)}`)
  }
  if (result.rootWidth > result.viewportWidth + 1 || result.pageScrollWidth > result.viewportWidth + 2) {
    throw new Error(`${label} 出现页面级横向溢出：${JSON.stringify(result)}`)
  }
  if (Math.abs(result.rootHeight - result.viewportHeight) > 1 || result.pageScrollHeight > result.viewportHeight + 2) {
    throw new Error(`${label} 出现页面级纵向溢出：${JSON.stringify(result)}`)
  }
  if (result.shortControls.length > 0) {
    throw new Error(`${label} 存在小于 44px 的可见操作：${JSON.stringify(result.shortControls)}`)
  }
  if (result.unnamedSliders.length > 0) {
    throw new Error(`${label} 存在没有可访问名称的滑杆：${JSON.stringify(result.unnamedSliders)}`)
  }
}

async function assertControlReachable(locator, label) {
  await locator.scrollIntoViewIfNeeded()
  const geometry = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return {
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      left: box.left,
      width: box.width,
      height: box.height,
      viewportWidth: window.visualViewport?.width ?? window.innerWidth,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
    }
  })
  if (
    geometry.width < 43.5 || geometry.height < 43.5 ||
    geometry.top < -1 || geometry.left < -1 ||
    geometry.right > geometry.viewportWidth + 1 ||
    geometry.bottom > geometry.viewportHeight + 1
  ) {
    throw new Error(`${label} 被裁切或不满足 44px 触控区：${JSON.stringify(geometry)}`)
  }
}

async function runReducedMotionAndLogout(demo, browser, participant) {
  const context = await browser.newContext({
    baseURL: demo.baseURL,
    viewport: MOBILE_VIEWPORT,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const page = await context.newPage()
  monitorPage(page, demo.baseURL)
  try {
    await page.goto('/welcome')
    await page.getByRole('heading', { name: '重新连接你的邀请' }).waitFor()
    await setPhoneViewport(page, { width: 390, height: 420 })
    await page.getByLabel('虚构姓名').focus()
    await assertControlReachable(page.getByRole('button', { name: '使用合成身份核验' }), '390×420 备用核验按钮')
    await assertPhoneShell(page, '390×420 备用核验输入态')
    const entryKeyboardMode = await page.locator('.v2-welcome').evaluate((element) => (
      element.classList.contains('is-keyboard')
    ))
    if (!entryKeyboardMode) throw new Error('备用核验输入聚焦后未进入短视口键盘布局。')
    await setPhoneViewport(page, MOBILE_VIEWPORT)

    await openInvitation(page, demo, participant)
    await waitForColor(page)
    if (await page.locator('.cinematic').isVisible()) {
      throw new Error('减少动态模式不应保留入场电影镜头。')
    }
    await page.getByLabel('恒星色温').fill('9000')
    await page.getByRole('button', { name: '确认星色' }).click()
    await page.getByRole('heading', { name: /留一句话\s*给未来/u }).waitFor()
    if (await page.locator('.cinematic').isVisible()) {
      throw new Error('减少动态模式不应播放星系拉远。')
    }
    const draft = page.getByLabel('时光胶囊')
    await draft.fill('尚未提交的本页草稿')
    await setPhoneViewport(page, { width: 390, height: 420 })
    await draft.focus()
    await assertControlReachable(page.getByRole('button', { name: '提交并进入现场' }), '390×420 胶囊提交按钮')
    await assertPhoneShell(page, '390×420 胶囊输入态')
    const capsuleKeyboardMode = await page.locator('.v2-welcome').evaluate((element) => (
      element.classList.contains('is-keyboard')
    ))
    if (!capsuleKeyboardMode) throw new Error('胶囊输入聚焦后未进入短视口键盘布局。')
    await setPhoneViewport(page, MOBILE_VIEWPORT)
    await page.getByRole('button', { name: '退出', exact: true }).click()
    const dialog = page.getByRole('alertdialog', { name: '确认退出？' })
    await dialog.getByText('未提交草稿将丢失。', { exact: false }).waitFor()
    await dialog.getByRole('button', { name: '取消' }).click()
    if (await draft.inputValue() !== '尚未提交的本页草稿') {
      throw new Error('取消退出后，本页胶囊草稿不应丢失。')
    }
    await page.getByRole('button', { name: '退出', exact: true }).click()
    await dialog.getByRole('button', { name: '确认退出' }).click()
    await page.getByRole('heading', { name: '重新连接你的邀请' }).waitFor()
    if (await page.locator('textarea').count() !== 0) {
      throw new Error('退出后不应在 DOM 中保留胶囊草稿。')
    }
    const freshParticipant = demo.credentials.participants[2]
    await page.getByLabel('虚构姓名').fill(freshParticipant.displayName)
    await page.getByLabel('合成学号').fill(freshParticipant.studentNumber)
    await page.getByRole('button', { name: '使用合成身份核验' }).click()
    await waitForColor(page)
    if (await page.getByLabel('恒星色温').inputValue() !== '5800') {
      throw new Error('退出后新身份继承了上一身份的本地色温。')
    }
    await assertPhoneShell(page, '减少动态退出后新身份选色')
    await capture(page, '02-reduced-motion-logout')
    await assertPageDiagnostics(page, '减少动态与退出路径')
  } finally {
    await context.close()
  }
}

async function runNormalMotionPersonalJourney(demo, browser, participant, secrets) {
  const context = await browser.newContext({
    baseURL: demo.baseURL,
    viewport: MOBILE_VIEWPORT,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const page = await context.newPage()
  monitorPage(page, demo.baseURL)
  try {
    const journeySecrets = [
      ...secrets,
      participant.inviteToken,
      participant.displayName,
      participant.studentNumber,
    ]
    await openInvitation(page, demo, participant, { expectDiscovery: true, secrets: journeySecrets })
    await waitForColor(page)
    await page.evaluate(() => {
      window.__personalJourneyStar = document.querySelector('[data-testid="persistent-focus-star"]')
    })

    await page.getByRole('button', { name: '确认星色' }).click()
    await page.getByRole('heading', { name: '这束光，已经属于你' }).waitFor()
    await capture(page, '06-color-confirm-flash')
    await page.getByRole('heading', { name: /留一句话\s*给未来/u }).waitFor()
    const sameStarAtCapsule = await page.evaluate(() => (
      window.__personalJourneyStar === document.querySelector('[data-testid="persistent-focus-star"]')
    ))
    if (!sameStarAtCapsule) throw new Error('锁色进入寄语时替换了持久星节点。')
    await capture(page, '07-capsule-personal-star')

    await page.getByLabel('时光胶囊').fill('愿我们在各自的轨道上，仍记得今晚的光。')
    await page.getByLabel(/进入人工审核候选池/u).check()
    await page.getByRole('button', { name: '提交并进入现场' }).click()
    await page.getByRole('heading', { name: '镜头正在拉远' }).waitFor()
    const handoffStartedAt = Date.now()
    const sameStarAtHandoff = await page.evaluate(() => (
      window.__personalJourneyStar === document.querySelector('[data-testid="persistent-focus-star"]')
    ))
    if (!sameStarAtHandoff) throw new Error('寄语提交进入轨道时替换了持久星节点。')
    await page.waitForTimeout(1_350)
    await capture(page, '08-orbit-handoff-midpoint')
    await page.getByRole('heading', { name: '已抵达，等待全场启程' }).waitFor({ timeout: 6_000 })
    const handoffDuration = Date.now() - handoffStartedAt
    if (handoffDuration < 2_500 || handoffDuration > 4_800) {
      throw new Error(`寄语后的入轨镜头时长异常：${handoffDuration}ms`)
    }
    const settled = await page.evaluate(() => {
      const star = document.querySelector('[data-testid="persistent-focus-star"]')
      const canvas = document.querySelectorAll('canvas.v2-welcome__galaxy')
      return {
        persistentNode: window.__personalJourneyStar === star,
        starHidden: star?.classList.contains('focus-star--hidden') === true,
        canvasCount: canvas.length,
        ownLabelVisible: document.querySelector('.own-star-label')?.getClientRects().length > 0,
      }
    })
    if (!settled.persistentNode || !settled.starHidden || settled.canvasCount !== 1 || !settled.ownLabelVisible) {
      throw new Error(`个人星系交接终态异常：${JSON.stringify(settled)}`)
    }
    await capture(page, '09-personal-orbit-settled')
    await assertPhoneShell(page, 'normal-motion 个人星辰完整旅程')
    await assertPageDiagnostics(page, 'normal-motion 个人星辰完整旅程')
    process.stdout.write(`Normal-motion personal journey passed (${handoffDuration}ms orbit handoff).\n`)
  } finally {
    await context.close()
  }
}

async function runLogoutGenerationRace(demo, browser, participant) {
  const context = await browser.newContext({
    baseURL: demo.baseURL,
    viewport: MOBILE_VIEWPORT,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const page = await context.newPage()
  monitorPage(page, demo.baseURL, {
    expectedHttpFailures: [{ status: 503, pathname: '/api/v2/participant/logout' }],
  })
  let snapshotRequests = 0
  let releaseCommand
  let commandCompleted
  const commandGate = new Promise((resolve) => { releaseCommand = resolve })
  const commandReady = new Promise((resolve) => { commandCompleted = resolve })
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v2/participant/snapshot') snapshotRequests += 1
  })
  await page.route('**/api/v2/participant/commands', async (route) => {
    const response = await route.fetch()
    commandCompleted()
    await commandGate
    await route.fulfill({ response })
  })
  await page.route('**/api/v2/participant/logout', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'error' }),
  }))
  try {
    await openInvitation(page, demo, participant)
    await waitForColor(page)
    await page.getByRole('button', { name: '确认星色' }).click()
    await commandReady
    await page.getByRole('button', { name: '退出', exact: true }).click()
    await page.getByRole('alertdialog', { name: '确认退出？' })
      .getByRole('button', { name: '确认退出' }).click()
    await page.getByRole('heading', { name: '重新连接你的邀请' }).waitFor()
    const requestsBeforeRelease = snapshotRequests
    releaseCommand()
    await page.waitForTimeout(500)
    if (snapshotRequests !== requestsBeforeRelease) {
      throw new Error('退出后旧命令仍发起了新的参与者快照请求。')
    }
    if (!await page.getByRole('heading', { name: '重新连接你的邀请' }).isVisible()) {
      throw new Error('退出后旧命令恢复了已清空的参与者会话。')
    }
    await assertPageDiagnostics(page, '退出代际竞态')
  } finally {
    releaseCommand?.()
    await context.close()
  }
}

async function exerciseProgramSupport(controllerPage, mobilePage) {
  const currentProgram = controllerPage.getByLabel('当前节目')
  await currentProgram.selectOption({ index: 0 })
  await controllerPage.getByRole('button', { name: '设为当前节目' }).click()
  await controllerPage.getByText('当前节目已更新。', { exact: true }).waitFor()
  await waitForEnabled(mobilePage.getByRole('button', { name: '送礼物' }), '送礼物')
  const input = mobilePage.getByLabel('匿名弹幕')
  await input.fill('为舞台点亮这一刻')

  await setPhoneViewport(mobilePage, { width: 390, height: 420 })
  await input.focus()
  const barrageConsent = mobilePage.getByLabel(/匿名公开上屏/u)
  const sendButton = mobilePage.getByRole('button', { name: '发送' })
  await barrageConsent.scrollIntoViewIfNeeded()
  if (!await barrageConsent.isVisible() || !await sendButton.isDisabled()) {
    throw new Error('键盘输入态必须显示弹幕公开同意项，并在未确认时禁止发送。')
  }
  await barrageConsent.check()
  await waitForEnabled(sendButton, '键盘输入态弹幕发送')
  const keyboardGeometry = await mobilePage.evaluate(() => {
    const inputElement = document.querySelector('#v2-barrage')
    const send = inputElement?.closest('form')?.querySelector('button[type="submit"]')
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const inputBox = inputElement?.getBoundingClientRect()
    const sendBox = send?.getBoundingClientRect()
    return {
      viewportHeight,
      inputBottom: inputBox?.bottom ?? Infinity,
      sendBottom: sendBox?.bottom ?? Infinity,
      inputHeight: inputBox?.height ?? 0,
      sendHeight: sendBox?.height ?? 0,
    }
  })
  if (
    keyboardGeometry.inputBottom > keyboardGeometry.viewportHeight + 1 ||
    keyboardGeometry.sendBottom > keyboardGeometry.viewportHeight + 1 ||
    keyboardGeometry.inputHeight < 44 ||
    keyboardGeometry.sendHeight < 44
  ) {
    throw new Error(`390×420 输入态操作不可达：${JSON.stringify(keyboardGeometry)}`)
  }
  await assertPhoneShell(mobilePage, '390×420 键盘输入态')
  await setPhoneViewport(mobilePage, MOBILE_VIEWPORT)

  await sendButton.click()
  await mobilePage.getByText('匿名弹幕已送往现场。', { exact: true }).waitFor()
  const giftTrigger = mobilePage.getByRole('button', { name: '送礼物' })
  await giftTrigger.click()
  const giftDialog = mobilePage.getByRole('dialog', { name: '为节目送出礼物' })
  await giftDialog.waitFor()
  await setPhoneViewport(mobilePage, { width: 390, height: 420 })
  await assertPhoneShell(mobilePage, '390×420 礼物面板')
  const giftAccessibility = await mobilePage.evaluate(() => {
    const dialog = document.querySelector('#v2-gift-sheet')
    const description = document.querySelector('#gift-description')
    const background = [
      document.querySelector('.v2-welcome__header'),
      document.querySelector('.v2-welcome__main'),
      document.querySelector('.operation-dock'),
    ]
    const box = dialog?.getBoundingClientRect()
    return {
      activeLabel: document.activeElement?.getAttribute('aria-label') ?? '',
      described: dialog?.getAttribute('aria-describedby') === description?.id,
      backgroundInert: background.every((element) => element?.inert === true),
      top: box?.top ?? -1,
      bottom: box?.bottom ?? Infinity,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
    }
  })
  if (
    giftAccessibility.activeLabel !== '关闭礼物面板'
    || !giftAccessibility.described
    || !giftAccessibility.backgroundInert
    || giftAccessibility.top < -1
    || giftAccessibility.bottom > giftAccessibility.viewportHeight + 1
  ) {
    throw new Error(`礼物面板焦点、语义或短视口边界不合格：${JSON.stringify(giftAccessibility)}`)
  }
  await mobilePage.keyboard.press('Shift+Tab')
  const wrappedToLast = await mobilePage.evaluate(() => (
    document.activeElement === document.querySelector('.gift-grid button:last-child')
  ))
  if (!wrappedToLast) throw new Error('礼物面板 Shift+Tab 未循环到最后一个操作。')
  await mobilePage.keyboard.press('Tab')
  const wrappedToClose = await mobilePage.evaluate(() => (
    document.activeElement?.getAttribute('aria-label') === '关闭礼物面板'
  ))
  if (!wrappedToClose) throw new Error('礼物面板 Tab 未循环回关闭按钮。')
  await mobilePage.keyboard.press('Escape')
  await giftDialog.waitFor({ state: 'hidden' })
  await mobilePage.waitForFunction(() => document.activeElement?.textContent?.trim() === '送礼物')
  await setPhoneViewport(mobilePage, MOBILE_VIEWPORT)

  await giftTrigger.click()
  await giftDialog.waitFor()
  const firstGift = giftDialog.locator('.gift-grid button').first()
  await mobilePage.context().setOffline(true)
  await giftDialog.getByText('设备已离线；未确认的内容不会自动提交。', { exact: true }).waitFor()
  if (!await firstGift.isDisabled()) throw new Error('礼物面板在离线时仍允许提交。')
  await mobilePage.context().setOffline(false)
  await waitForEnabled(firstGift, '联网恢复后的礼物')

  await controllerPage.getByRole('button', { name: '暂停', exact: true }).click()
  await giftDialog.getByText('现场已暂停，暂时不能送礼物。', { exact: true }).waitFor()
  if (!await firstGift.isDisabled()) throw new Error('礼物面板在现场暂停时仍允许提交。')
  await controllerPage.getByRole('button', { name: '恢复运行' }).click()
  await waitForEnabled(firstGift, '恢复运行后的礼物')

  const giftName = (await firstGift.locator('strong').innerText()).trim()
  await firstGift.click()
  await giftDialog.waitFor({ state: 'hidden' })
  await mobilePage.getByText(`${giftName}已送出。`, { exact: true }).waitFor()
  await capture(mobilePage, '04-program-support')

  await controllerPage.getByRole('button', { name: '暂停', exact: true }).click()
  await controllerPage.locator('.runtime-facts').filter({ hasText: '已暂停' }).waitFor()
  await mobilePage.getByRole('heading', { name: '现场暂时停驻' }).waitFor()
  await mobilePage.getByText('现场已暂停，输入会保留在本页，但不会排队或自动提交。', { exact: true }).waitFor()
  await controllerPage.getByRole('button', { name: '恢复运行' }).click()
  await controllerPage.locator('.runtime-facts').filter({ hasText: '运行中' }).waitFor()
  await mobilePage.getByRole('heading', { name: '节目共振' }).waitFor()
}

async function runSmoke(checker, mobilePage, controllerPage, demo, browser, secrets) {
  await clickChecker(checker, '[data-action="color"]', '星色选择')
  await assertPhoneShell(mobilePage, '390×844 星色选择')
  const confirmColor = mobilePage.getByRole('button', { name: '确认星色' })
  await assertControlReachable(confirmColor, '390×844 确认星色')
  await setPhoneViewport(mobilePage, { width: 320, height: 568 })
  await assertPhoneShell(mobilePage, '320×568 星色选择')
  await assertControlReachable(confirmColor, '320×568 确认星色')
  await setPhoneViewport(mobilePage, { width: 667, height: 375 })
  await assertPhoneShell(mobilePage, '667×375 横屏星色选择')
  await assertControlReachable(confirmColor, '667×375 横屏确认星色')
  await setPhoneViewport(mobilePage, MOBILE_VIEWPORT)
  await mobilePage.evaluate(() => { document.documentElement.style.fontSize = '125%' })
  await assertPhoneShell(mobilePage, '390×844 125% 字号星色选择')
  await assertControlReachable(confirmColor, '390×844 125% 字号确认星色')
  await mobilePage.evaluate(() => { document.documentElement.style.removeProperty('font-size') })
  await capture(mobilePage, '01-color-selection')
  await clickChecker(checker, '[data-action="lock"]', '公共星点已出现')
  await clickChecker(checker, '[data-action="skip"]', '个人入场完成')
  await mobilePage.getByRole('button', { name: '档案' }).click()
  await mobilePage.getByText('待补写', { exact: true }).waitFor()
  await mobilePage.getByRole('button', { name: '补写胶囊' }).click()
  const archiveDraft = mobilePage.getByLabel('补写时光胶囊')
  await setPhoneViewport(mobilePage, { width: 390, height: 420 })
  await archiveDraft.focus()
  await assertControlReachable(mobilePage.getByRole('button', { name: '提交补写' }), '390×420 档案补写按钮')
  await assertPhoneShell(mobilePage, '390×420 档案补写输入态')
  const archiveKeyboardMode = await mobilePage.locator('.v2-welcome').evaluate((element) => (
    element.classList.contains('is-keyboard')
  ))
  if (!archiveKeyboardMode) throw new Error('档案补写聚焦后未进入短视口键盘布局。')
  await setPhoneViewport(mobilePage, MOBILE_VIEWPORT)
  await mobilePage.getByRole('button', { name: '取消' }).click()
  await mobilePage.getByRole('button', { name: '星程' }).click()
  await capture(mobilePage, '03-ready-real-galaxy')

  await runReducedMotionAndLogout(demo, browser, demo.credentials.participants[1])
  await runNormalMotionPersonalJourney(
    demo,
    browser,
    demo.credentials.participants[6],
    secrets,
  )
  await runLogoutGenerationRace(demo, browser, demo.credentials.participants[3])
  await runPreStartVisibilityHandoff(demo, browser, demo.credentials.participants[4])
  await runPlayingVisibilityInterruption(demo, browser, demo.credentials.participants[5])

  await clickChecker(checker, '[data-scene="ASSEMBLY"]', '星海集结')
  await mobilePage.getByRole('button', { name: '启动我的星' }).click()
  const startToast = mobilePage.getByText('你的星已正式启动。', { exact: true })
  await startToast.waitFor()
  await mobilePage.getByText('星星已启动', { exact: true }).waitFor()
  await startToast.waitFor({ state: 'hidden', timeout: 5_000 })
  await mobilePage.getByText('星星已启动', { exact: true }).waitFor()
  await clickChecker(checker, '[data-scene="PROGRAM_SUPPORT"]', '节目共振')
  await exerciseProgramSupport(controllerPage, mobilePage)
  await clickChecker(checker, '[data-scene="COOPERATIVE_LIGHT"]', '协同点亮')
  await mobilePage.getByRole('button', { name: '参与全场点亮' }).click()
  await mobilePage.getByText('点亮已完成', { exact: true }).waitFor()
  await clickChecker(checker, '[data-scene="COMPLETED"]', '权威终章')
  await capture(mobilePage, '05-completed-finale')
  await clickChecker(checker, '[data-action="reload"]', '没有重播')

  const publicText = [
    await checker.locator('body').innerText(),
    await checker.locator('html').innerHTML(),
    await mobilePage.locator('body').innerText(),
    await mobilePage.locator('html').innerHTML(),
  ].join('\n')
  for (const secret of secrets) {
    if (publicText.includes(secret)) throw new Error('检查器意外暴露了临时凭据。')
  }
  const mobileCopy = await mobilePage.locator('body').innerText()
  if (/实时同步|\bRUNNING\b|\d\s*\/\s*6/u.test(mobileCopy)) {
    throw new Error('v2 手机页重新暴露了 v1 阶段或原始运行状态文案。')
  }
  if (await mobilePage.locator('canvas.v2-welcome__galaxy').count() !== 1) {
    throw new Error('手机主场必须且只能使用一个真实星系 Canvas。')
  }
  await assertPhoneShell(mobilePage, 'COMPLETED 刷新终态')
  await assertPageDiagnostics(mobilePage, '手机完整动线')
  await assertPageDiagnostics(controllerPage, '后台控制动线')
}

let demo = null
let browser = null
let stopping = false

async function stopPreview() {
  if (stopping) return
  stopping = true
  try { await browser?.close() } finally { await demo?.stop() }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { void stopPreview().finally(() => { process.exitCode = 0 }) })
}

try {
  demo = await startDemoTestStack({ protocolVersion: '2', inProcess: true })
  const launched = await launchBrowser()
  browser = launched.browser
  const controller = await openAdminController(demo, browser)

  const mobileContext = await browser.newContext({
    baseURL: demo.baseURL,
    viewport: MOBILE_VIEWPORT,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const mobilePage = await mobileContext.newPage()
  monitorPage(mobilePage, demo.baseURL)
  const participant = demo.credentials.participant
  const secrets = [
    participant.inviteToken,
    participant.displayName,
    participant.studentNumber,
    demo.credentials.admin.username,
    demo.credentials.admin.password,
  ]
  await openInvitation(mobilePage, demo, participant, { expectDiscovery: smokeMode, secrets })
  if (!smokeMode) await mobilePage.bringToFront()

  const checker = await createChecker(controller.context, mobilePage, controller.page)
  if (smokeMode) {
    await runSmoke(checker, mobilePage, controller.page, demo, browser, secrets)
    process.stdout.write(`V2-08 mobile browser smoke passed (${launched.label}).\n`)
  } else {
    process.stdout.write([
      '',
      `协议 v2 手机动线工作台已打开（${launched.label}）。`,
      `窗口一：390×844 手机页，首次自动播放约 ${(DISCOVERY_CINEMATIC_DURATION_MS / 1000).toFixed(1)} 秒信号发现镜头。`,
      '窗口二：v2 动线检查器，控制个人入场与 LIVE 单向三场景。',
      '同一控制窗口的另一标签页保留真实 v2 匿名后台。',
      '前端文件保存后可热更新；后端、契约或预览脚本变化后请重启预览。',
      '关闭手机窗口或按 Ctrl+C 会清理临时合成数据库并退出。',
      '',
    ].join('\n'))
    await mobilePage.bringToFront()
    await new Promise((resolve) => {
      browser.once('disconnected', resolve)
      mobilePage.once('close', () => void browser?.close())
    })
  }
} finally {
  await stopPreview()
}
