#!/usr/bin/env node
/**
 * scripts/vivo-field-automation.mjs
 *
 * vivo X300 真机自动化脚手架（B7）——只读预检，绝不代签真机验收。
 *
 * 用途：
 *   - 通过 adb forward + Chrome DevTools (CDP) 连接真机 Chrome；
 *   - 用 preview:v2:field 的一次性合成邀请打开 /welcome，断言地址栏令牌被清除；
 *   - 按 D-030 节奏截图（01-entry / 02a+02b first-journey / 03-color）；
 *   - 记录真实视口 / UA / deviceScaleFactor / prefers-reduced-motion；
 *   - 把当前可见文本 dump 到 state.txt；
 *   - 汇总 report.json 并打印一行 JSON。
 *
 * 边界（与 docs/FIELD_AUTOMATION.md 一致）：
 *   - 全程只读 GET/观察，不点击选色/胶囊/场景按钮，不提交任何业务命令，不写业务数据；
 *   - 结果只是预检线索，最终签核以 docs/V2_10_FIELD_ACCEPTANCE.md 的人工 PASS/FAIL 为准。
 *
 * 环境变量：
 *   DEMO_HOST         必填：现场栈公网入口，如 http://192.168.3.6:5173（preview:v2:field 提供）
 *   DEMO_INVITE_TOKEN 必填：当前 preview 会话的一次性合成邀请令牌
 *   ADB_PATH          可选：adb 可执行文件路径，缺省尝试 PATH 中的 adb
 *
 * 运行：node scripts/vivo-field-automation.mjs
 * 只做脚手架：本脚本不启动任何服务，不执行 pnpm install，不跑 playwright test。
 */

import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEVTOOLS_PORT = 9222
const DEVTOOLS_URL = `http://127.0.0.1:${DEVTOOLS_PORT}`
const DEVTOOLS_POLL_MS = 30_000 // 轮询 /json/version 的上限
const FLOW_TIMEOUT_MS = 25_000 // 页面等待默认上限
const DEGRADED_TIMEOUT_MS = 3_000 // 流程出现首个 FAIL 后，后续等待降级，避免在坏页上干等

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const errMessage = (err) => (err instanceof Error ? err.message : String(err))

function adbRun(adbPath, args) {
  return execFileSync(adbPath, args, { encoding: 'utf8', timeout: 20_000 })
}

function parseAdbDevices(output) {
  const devices = []
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('List of devices') || trimmed.startsWith('*')) continue
    const [serial, state] = trimmed.split(/\s+/)
    if (serial && state) devices.push({ serial, state })
  }
  return devices
}

/** 校验存在可用的 adb 设备，返回其 serial。多台时取第一台并告警。 */
function connectDevice(adbPath) {
  let output
  try {
    output = adbRun(adbPath, ['devices'])
  } catch (err) {
    throw new Error(`adb not usable (${errMessage(err)}); install platform-tools or set ADB_PATH`)
  }
  const devices = parseAdbDevices(output)
  const ready = devices.filter((d) => d.state === 'device')
  const other = devices.filter((d) => d.state !== 'device')
  if (ready.length === 0) {
    const hint = other.length > 0
      ? ` (found ${other.map((d) => `${d.serial}:${d.state}`).join(', ')}; authorize USB debugging on the phone)`
      : ''
    throw new Error(`no adb device in "device" state${hint}`)
  }
  if (ready.length > 1) console.log(`[WARN] ${ready.length} devices attached; using ${ready[0].serial}`)
  else console.log(`[INFO] adb device: ${ready[0].serial}`)
  return ready[0].serial
}

function installForward(adbPath, serial) {
  try {
    adbRun(adbPath, ['-s', serial, 'forward', `tcp:${DEVTOOLS_PORT}`, 'localabstract:chrome_devtools_remote'])
    console.log(`[INFO] adb forward tcp:${DEVTOOLS_PORT} localabstract:chrome_devtools_remote -> ok`)
  } catch (err) {
    throw new Error(`adb forward failed: ${errMessage(err)}`)
  }
}

function removeForward(adbPath, serial) {
  adbRun(adbPath, ['-s', serial, 'forward', '--remove', `tcp:${DEVTOOLS_PORT}`])
}

/** 轮询 Chrome DevTools 的 /json/version，直到可用（上限 30s）。 */
async function waitForDevTools(timeoutMs = DEVTOOLS_POLL_MS) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${DEVTOOLS_URL}/json/version`, { signal: AbortSignal.timeout(2_000) })
      if (res.ok) {
        const info = await res.json()
        console.log(`[INFO] devtools endpoint ready (Browser: ${info.Browser ?? 'unknown'})`)
        return info
      }
    } catch (err) {
      lastError = err
    }
    await sleep(500)
  }
  throw new Error(
    `Chrome DevTools endpoint not reachable at ${DEVTOOLS_URL}/json/version within ${timeoutMs}ms` +
      (lastError ? ` (${errMessage(lastError)})` : ''),
  )
}

/* ---------------- .gitignore 覆盖判断（只针对本脚本输出目录的决策） ---------------- */

function escapeGlob(p) {
  const NEEDS_ESCAPE = '.+^${}()|[]\\'
  let out = ''
  for (const c of p) {
    if (c === '*') out += '[^/]*'
    else if (c === '?') out += '[^/]'
    else if (NEEDS_ESCAPE.includes(c)) out += `\\${c}`
    else out += c
  }
  return out
}

/**
 * 判断 relPath（相对仓库根的 POSIX 路径）是否被一段 .gitignore 规则覆盖。
 * 返回 null 表示该规则不涉及；true/false 表示命中（含 ! 反向）。
 * 覆盖常见写法：根锚定路径、双星 any-depth 前缀、目录尾斜杠、星号 / 问号通配；足够支撑本脚本的目录决策。
 */
function gitIgnoreMatch(relPath, rawPattern) {
  let pattern = rawPattern.trim()
  if (!pattern || pattern.startsWith('#')) return null
  const negated = pattern.startsWith('!')
  if (negated) pattern = pattern.slice(1).trim()
  if (!pattern) return null
  if (pattern.endsWith('/')) pattern = pattern.slice(0, -1)
  if (!pattern) return null
  const anchored = pattern.includes('/') && !pattern.startsWith('**/')
  if (pattern.startsWith('**/')) pattern = pattern.slice(3)
  const re = new RegExp(`^${escapeGlob(pattern)}(?:/.*)?$`)
  const segments = relPath.split('/')
  const candidates = anchored ? [relPath] : segments.map((_, i) => segments.slice(i).join('/'))
  const hit = candidates.some((c) => re.test(c))
  return hit ? !negated : null
}

function isGitIgnored(relPath, gitignoreText) {
  let ignored = false
  for (const line of gitignoreText.split(/\r?\n/)) {
    const result = gitIgnoreMatch(relPath, line)
    if (result !== null) ignored = result
  }
  return ignored
}

/**
 * 解析输出目录：
 *   首选 <repo>/output/vivo-field/；若未被根 .gitignore 忽略，改写到被忽略的
 *   <repo>/output/playwright/vivo-field/（当前仓库正是这种情况：output/ 未整体忽略，
 *   只有 output/playwright/ 被忽略）；若仍无法确认忽略，落到 OS 临时目录并打印绝对路径。
 */
function resolveOutputDir(repoRoot, gitignoreText) {
  const preferred = path.join(repoRoot, 'output', 'vivo-field')
  const fallback = path.join(repoRoot, 'output', 'playwright', 'vivo-field')
  const relPreferred = path.relative(repoRoot, preferred).replace(/\\/g, '/')
  const relFallback = path.relative(repoRoot, fallback).replace(/\\/g, '/')
  if (isGitIgnored(relPreferred, gitignoreText)) {
    return { dir: preferred, note: null }
  }
  if (isGitIgnored(relFallback, gitignoreText)) {
    return {
      dir: fallback,
      note:
        'output/ is not fully gitignored (root .gitignore only covers output/playwright/), so artifacts ' +
        'were written to the ignored directory output/playwright/vivo-field/ instead of output/vivo-field/.',
    }
  }
  const tmp = path.join(os.tmpdir(), 'vivo-field')
  return {
    dir: tmp,
    note: `Could not confirm an ignored repo directory; artifacts written to OS temp directory ${tmp} (ignored by definition).`,
  }
}

/* ---------------- 观察流程（全部容错） ---------------- */

async function capture(page, filePath) {
  await page.screenshot({ path: filePath })
  return filePath
}

function redact(value, secret) {
  return secret ? value.split(secret).join('<redacted>') : value
}

async function runStep(name, fn, flow) {
  const timeout = flow.fastFail ? DEGRADED_TIMEOUT_MS : FLOW_TIMEOUT_MS
  try {
    await fn(timeout)
    console.log(`[PASS] ${name}`)
  } catch (err) {
    const reason = errMessage(err)
    console.log(`[FAIL] ${name}: ${reason}`)
    flow.errors.push(`${name}: ${reason}`)
    flow.fastFail = true
  }
}

async function runObservationFlow(page, { demoHost, inviteToken, outputDir, flow }) {
  const { errors } = flow

  await runStep('open welcome with invite token', async () => {
    const url = new URL('/welcome', demoHost)
    url.searchParams.set('token', inviteToken)
    console.log(`[INFO] opening ${demoHost}/welcome?token=<redacted>`)
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 })
  }, flow)

  // 断言地址栏令牌被清除；清除失败则跳过 01-entry（避免把令牌截进截图）。
  let tokenCleared = false
  await runStep('address-bar token cleared', async (timeout) => {
    const deadline = Date.now() + Math.max(2_000, timeout)
    while (Date.now() < deadline) {
      const current = page.url()
      if (!current.includes('token=') && !current.includes(inviteToken)) {
        tokenCleared = true
        return
      }
      await sleep(250)
    }
    throw new Error(`token still present in address bar: ${redact(page.url(), inviteToken)}`)
  }, flow)

  if (tokenCleared) {
    await runStep('screenshot 01-entry', async () => {
      flow.screenshots.push(await capture(page, path.join(outputDir, '01-entry.png')))
    }, flow)
  } else {
    console.log('[WARN] skipping 01-entry.png to avoid capturing the invite token in the address bar')
  }

  // 开播锚点：color-onboarding 区块出现 = 首次旅程开始（约 5.4s 寻星）。
  // 02a/02b 分别取开播后约 1.5s 与 5.5s，覆盖寻星中段与落定/进入选色的时刻。
  let anchorAt = Date.now()
  await runStep('wait for color-onboarding (cinematic start)', async (timeout) => {
    await page.locator('[data-testid="color-onboarding"]').waitFor({ state: 'visible', timeout })
    anchorAt = Date.now()
  }, flow)

  await runStep('wait for title "找到属于你的星" visible', async (timeout) => {
    await page
      .locator('.signal-type-title__typed', { hasText: '找到属于你的星' })
      .waitFor({ state: 'visible', timeout })
  }, flow)

  await runStep('screenshot 02a-first-journey (+1.5s)', async () => {
    const wait = anchorAt + 1_500 - Date.now()
    if (wait > 0) await sleep(wait)
    flow.screenshots.push(await capture(page, path.join(outputDir, '02a-first-journey.png')))
  }, flow)

  await runStep('screenshot 02b-first-journey (+5.5s)', async () => {
    const wait = anchorAt + 5_500 - Date.now()
    if (wait > 0) await sleep(wait)
    flow.screenshots.push(await capture(page, path.join(outputDir, '02b-first-journey.png')))
  }, flow)

  // 选色态检测：仍在 color-onboarding 区块且 discovery 已落定（--settled）。
  let inColorSelection = false
  await runStep('detect color-selection state', async () => {
    inColorSelection = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="color-onboarding"]')
      return Boolean(el && el.classList.contains('color-onboarding--settled'))
    })
    console.log(`[INFO] color-selection state = ${inColorSelection}`)
  }, flow)

  if (inColorSelection) {
    await runStep('screenshot 03-color', async () => {
      flow.screenshots.push(await capture(page, path.join(outputDir, '03-color.png')))
    }, flow)
  } else {
    console.log('[INFO] not in color-selection state; skipping 03-color.png')
  }

  // 只 dump 可见文本，不做任何业务写入。
  await runStep('dump visible text to state.txt', async () => {
    const text = await page.evaluate(() => document.body.innerText)
    fs.writeFileSync(path.join(outputDir, 'state.txt'), text, 'utf8')
    console.log(`[INFO] state.txt dumped (${text.length} chars)`)
  }, flow)

  return errors
}

/* ---------------- 主流程 ---------------- */

async function main() {
  const errors = []
  const flow = { errors, screenshots: [], fastFail: false }

  const demoHost = (process.env.DEMO_HOST || '').trim().replace(/\/+$/, '')
  const inviteToken = (process.env.DEMO_INVITE_TOKEN || '').trim()
  const adbPath = (process.env.ADB_PATH || '').trim() || 'adb'

  if (!demoHost) {
    throw new Error('DEMO_HOST is required, e.g. http://192.168.3.6:5173 (provided by pnpm preview:v2:field)')
  }
  if (!inviteToken) {
    throw new Error('DEMO_INVITE_TOKEN is required (synthetic invite token of the running preview:v2:field session)')
  }

  console.log('[INFO] vivo field automation (read-only scaffold; no business writes, no sign-off)')
  console.log(`[INFO] DEMO_HOST = ${demoHost}`)

  // 输出目录：读取根 .gitignore 判定忽略情况。
  let gitignoreText = ''
  try {
    gitignoreText = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8')
  } catch {
    console.log('[WARN] root .gitignore not readable; falling back to OS temp dir check')
  }
  const { dir: outputDir, note: gitignoreNote } = resolveOutputDir(REPO_ROOT, gitignoreText)
  fs.mkdirSync(outputDir, { recursive: true })
  console.log(`[INFO] output dir = ${outputDir}`)
  if (gitignoreNote) console.log(`[NOTE] ${gitignoreNote}`)

  let browser = null
  let deviceSerial = null
  let forwardInstalled = false
  let report = null

  try {
    // 连接前置（致命：失败即无法继续）
    deviceSerial = connectDevice(adbPath)
    installForward(adbPath, deviceSerial)
    forwardInstalled = true
    await waitForDevTools()

    // 用 playwright 的 chromium.connectOverCDP 连接真机 Chrome
    browser = await chromium.connectOverCDP(DEVTOOLS_URL)
    const context = browser.contexts()[0]
    if (!context) throw new Error('no CDP context on device')
    let page = context.pages()[0]
    if (!page) page = await context.newPage()
    try {
      await page.bringToFront()
    } catch {
      // 真机标签页前台切换为尽力而为
    }

    // 真实设备指标：viewport / UA / deviceScaleFactor / prefers-reduced-motion
    const metrics = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
      ua: navigator.userAgent,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    }))
    console.log(`[INFO] viewport = ${metrics.width}x${metrics.height} dpr=${metrics.dpr}`)
    console.log(`[INFO] UA = ${metrics.ua}`)
    console.log(`[INFO] prefers-reduced-motion = ${metrics.reducedMotion}`)

    await runObservationFlow(page, { demoHost, inviteToken, outputDir, flow })

    report = {
      timestamp: new Date().toISOString(),
      demoHost,
      outputDir,
      ...(gitignoreNote ? { note: gitignoreNote } : {}),
      viewport: {
        width: metrics.width,
        height: metrics.height,
        deviceScaleFactor: metrics.dpr,
      },
      ua: metrics.ua,
      reducedMotion: metrics.reducedMotion,
      screenshots: flow.screenshots,
      errors,
    }
  } catch (err) {
    const reason = errMessage(err)
    console.log(`[FAIL] fatal: ${reason}`)
    errors.push(`fatal: ${reason}`)
    report = {
      timestamp: new Date().toISOString(),
      demoHost,
      outputDir,
      ...(gitignoreNote ? { note: gitignoreNote } : {}),
      viewport: null,
      ua: null,
      reducedMotion: null,
      screenshots: flow.screenshots,
      errors,
    }
  } finally {
    // 结束：adb forward --remove + 断开 CDP（不断开真机 Chrome 本身）
    if (forwardInstalled && deviceSerial) {
      try {
        removeForward(adbPath, deviceSerial)
        console.log(`[INFO] adb forward --remove tcp:${DEVTOOLS_PORT} -> ok`)
      } catch (err) {
        console.log(`[WARN] adb forward --remove failed: ${errMessage(err)}`)
      }
    }
    if (browser) {
      try {
        await browser.close()
      } catch {
        // 断开 CDP 连接失败可忽略
      }
    }
  }

  if (report) {
    const reportPath = path.join(outputDir, 'report.json')
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`[INFO] report written to ${reportPath}`)
    console.log(JSON.stringify(report))
  }

  return errors.length === 0 ? 0 : 1
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    console.error(`[FAIL] ${errMessage(err)}`)
    process.exitCode = 1
  })
