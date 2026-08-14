import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { startDemoTestStack } from '../tests/e2e/fixtures/demo-stack.ts'

const VIEWPORT = { width: 390, height: 844 }
const COLLEGE_WEBSITE_URL = 'https://ise.sysu.edu.cn/'
const captureMode = process.argv.includes('--artifacts')
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const outputDirectory = path.join(repositoryRoot, 'output', 'playwright', 'personal-journey')

async function launchBrowser() {
  for (const candidate of [
    { label: 'Google Chrome', options: { channel: 'chrome' } },
    { label: 'Microsoft Edge', options: { channel: 'msedge' } },
    { label: 'Playwright Chromium', options: {} },
  ]) {
    try {
      return {
        label: candidate.label,
        browser: await chromium.launch({ ...candidate.options, headless: captureMode }),
      }
    } catch {
      // Try the next locally available browser.
    }
  }
  throw new Error('没有找到可用的 Chrome、Edge 或 Playwright Chromium。')
}

async function waitForForegroundFrames(page) {
  await page.bringToFront()
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }))
}

function createBrowserAudit(page, baseURL) {
  const localOrigin = new URL(baseURL).origin
  const faults = []
  const staticTypes = new Set(['document', 'script', 'stylesheet', 'image', 'font'])
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    // A fresh invitation intentionally probes the participant snapshot before
    // activation. Static 401s are still caught by the response audit below.
    if (/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/.test(text)) return
    faults.push(`console: ${text}`)
  })
  page.on('pageerror', (error) => faults.push(`pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    if (staticTypes.has(request.resourceType())) {
      faults.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`)
    }
  })
  page.on('response', (response) => {
    if (response.status() >= 400 && staticTypes.has(response.request().resourceType())) {
      faults.push(`http-${response.status()}: ${response.url()}`)
    }
  })
  page.on('request', (request) => {
    if (request.resourceType() !== 'image') return
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== localOrigin) {
      faults.push(`external-image: ${request.url()}`)
    }
  })
  return () => {
    if (faults.length > 0) throw new Error(`浏览器资源门失败：${faults.slice(0, 6).join(' | ')}`)
  }
}

async function assertLocalAndPrivate(page, baseURL, secrets) {
  const state = await page.evaluate(({ allowedOrigin, sensitiveValues }) => {
    const surface = [
      window.location.href,
      document.body?.innerText ?? '',
      document.documentElement?.innerHTML ?? '',
    ].join('\n')
    return {
      local: window.location.origin === allowedOrigin,
      clean: sensitiveValues.every((value) => !value || !surface.includes(value)),
    }
  }, {
    allowedOrigin: new URL(baseURL).origin,
    sensitiveValues: secrets,
  })
  if (!state.local || !state.clean) throw new Error('正式页预览的本地或脱敏门未通过。')
}

async function assertCollegeBrandEntry(page) {
  const link = page.getByRole('link', { name: '访问中山大学智能工程学院官网（新窗口打开）' })
  const state = await link.evaluate((element) => {
    const image = element.querySelector('img')
    const rectangle = element.getBoundingClientRect()
    return {
      href: element.href,
      target: element.target,
      rel: element.rel,
      width: rectangle.width,
      height: rectangle.height,
      imageReady: Boolean(image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
    }
  })
  if (
    state.href !== COLLEGE_WEBSITE_URL
    || state.target !== '_blank'
    || !state.rel.includes('noopener')
    || !state.rel.includes('noreferrer')
    || state.height < 44
    || state.width < 44
    || !state.imageReady
  ) throw new Error('学院标志或官网入口验收失败。')
}

async function capture(page, name, secrets, baseURL) {
  if (!captureMode) return
  await waitForForegroundFrames(page)
  await assertLocalAndPrivate(page, baseURL, secrets)
  await page.locator('.v2-welcome').screenshot({
    path: path.join(outputDirectory, `${name}.png`),
    animations: 'allow',
    mask: [page.locator('input:not([type="range"]), textarea')],
    maskColor: '#07101f',
  })
}

async function captureTimedSequence(page, entries, secrets, baseURL) {
  const startedAt = performance.now()
  for (const [name, offsetMs] of entries) {
    const remaining = offsetMs - (performance.now() - startedAt)
    if (remaining > 0) await page.waitForTimeout(remaining)
    await capture(page, name, secrets, baseURL)
  }
}

async function assertSignalTitleTyping(page, accessibleName, {
  captureName = '',
  secrets,
  baseURL,
} = {}) {
  const heading = page.getByRole('heading', { name: accessibleName, exact: true })
    .and(page.locator('.signal-type-title'))
  await heading.waitFor({ state: 'visible', timeout: 3_000 })
  const handle = await heading.elementHandle()
  if (!handle) throw new Error(`标题“${accessibleName}”没有可检查的 DOM 节点。`)
  await page.waitForFunction((element) => {
    const typed = element.querySelector('.signal-type-title__typed')
    const measure = element.querySelector('.signal-type-title__measure')
    const visibleLength = Array.from(typed?.firstChild?.textContent ?? '').length
    const fullLength = Array.from(measure?.textContent ?? '').length
    return Boolean(typed && !typed.classList.contains('is-complete') && visibleLength > 0 && visibleLength < fullLength)
  }, handle, { timeout: 1_500 })

  const typingState = await heading.evaluate((element) => {
    const typed = element.querySelector('.signal-type-title__typed')
    const measure = element.querySelector('.signal-type-title__measure')
    const caret = element.querySelector('.signal-type-title__caret:not(.signal-type-title__caret--measure)')
    const textNode = typed?.firstChild
    const range = document.createRange()
    if (textNode) {
      range.setStart(textNode, textNode.textContent?.length ?? 0)
      range.collapse(true)
    }
    const textEnd = textNode ? range.getBoundingClientRect() : null
    const caretBox = caret?.getBoundingClientRect()
    const headingBox = element.getBoundingClientRect()
    return {
      label: element.getAttribute('aria-label'),
      fullText: measure?.textContent ?? '',
      visibleText: textNode?.textContent ?? '',
      caretGap: textEnd && caretBox ? caretBox.left - textEnd.right : Number.POSITIVE_INFINITY,
      caretAnimation: caret ? getComputedStyle(caret).animationName : '',
      headingBox: [headingBox.x, headingBox.y, headingBox.width, headingBox.height],
    }
  })
  if (
    typingState.label !== accessibleName
    || !typingState.visibleText
    || typingState.visibleText === typingState.fullText
    || typingState.caretGap < -1
    || typingState.caretGap > 8
    || !typingState.caretAnimation.includes('signal-caret-blink')
  ) throw new Error(`标题“${accessibleName}”的逐字光标或即时语义门失败。`)

  if (captureName) await capture(page, captureName, secrets, baseURL)
  await heading.locator('.signal-type-title__typed.is-complete').waitFor({ timeout: 2_000 })
  const finalState = await heading.evaluate((element) => {
    const rectangle = element.getBoundingClientRect()
    const typed = element.querySelector('.signal-type-title__typed')
    const caret = element.querySelector('.signal-type-title__caret:not(.signal-type-title__caret--measure)')
    const textNode = typed?.firstChild
    const range = document.createRange()
    if (textNode?.textContent) {
      range.setStart(textNode, textNode.textContent.length - 1)
      range.setEnd(textNode, textNode.textContent.length)
    }
    const lastGlyph = textNode?.textContent ? range.getBoundingClientRect() : null
    const caretBox = caret?.getBoundingClientRect()
    return {
      headingBox: [rectangle.x, rectangle.y, rectangle.width, rectangle.height],
      caretGap: lastGlyph && caretBox ? caretBox.left - lastGlyph.right : Number.POSITIVE_INFINITY,
      caretRowDelta: lastGlyph && caretBox
        ? Math.abs((caretBox.top + caretBox.height / 2) - (lastGlyph.top + lastGlyph.height / 2))
        : Number.POSITIVE_INFINITY,
    }
  })
  const layoutDelta = Math.max(...finalState.headingBox.map((value, index) => Math.abs(value - typingState.headingBox[index])))
  if (layoutDelta > 1) throw new Error(`标题“${accessibleName}”逐字显现造成 ${layoutDelta.toFixed(2)}px 布局跳动。`)
  if (finalState.caretGap < -1 || finalState.caretGap > 8 || finalState.caretRowDelta > 4) {
    throw new Error(`标题“${accessibleName}”完成后光标没有紧跟最后一个字。`)
  }
}

async function assertReducedSignalTitleStatic(page, accessibleName) {
  const heading = page.getByRole('heading', { name: accessibleName, exact: true })
    .and(page.locator('.signal-type-title'))
  await heading.waitFor({ state: 'visible', timeout: 3_000 })
  const state = await heading.evaluate((element) => {
    const typed = element.querySelector('.signal-type-title__typed')
    const measure = element.querySelector('.signal-type-title__measure')
    const caret = element.querySelector('.signal-type-title__caret:not(.signal-type-title__caret--measure)')
    return {
      complete: typed?.classList.contains('is-complete'),
      reduced: typed?.classList.contains('is-reduced'),
      staticCompletion: typed?.classList.contains('is-static'),
      full: typed?.firstChild?.textContent === measure?.textContent,
      caretAnimation: caret ? getComputedStyle(caret).animationName : '',
    }
  })
  if (!state.complete || !state.reduced || !state.staticCompletion || !state.full || state.caretAnimation !== 'none') {
    throw new Error(`减少动态模式的标题“${accessibleName}”没有直接进入静态终态。`)
  }
}

async function runCapturedJourney(page, demo, participant) {
  const assertBrowserClean = createBrowserAudit(page, demo.baseURL)
  const secrets = [participant.inviteToken, participant.displayName, participant.studentNumber]
  const invitation = new URL('/welcome', demo.baseURL)
  invitation.searchParams.set('token', participant.inviteToken)
  await page.goto(invitation.toString())
  await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('token'))
  await page.locator('[data-testid="personal-journey-stage"][data-phase="discovery"][data-playing="true"]')
    .waitFor({ state: 'visible', timeout: 8_000 })
  await waitForForegroundFrames(page)
  await captureTimedSequence(page, [
    ['01-discovery-early', 420],
    ['02-discovery-depth', 1_650],
    ['03-discovery-approach', 3_150],
    ['04-discovery-acquire', 4_500],
    ['05-discovery-handoff', 5_180],
  ], secrets, demo.baseURL)

  await assertSignalTitleTyping(page, '为你的星选择颜色', {
    captureName: '05b-color-title-typing',
    secrets,
    baseURL: demo.baseURL,
  })
  await assertCollegeBrandEntry(page)
  await capture(page, '06-color-selection', secrets, demo.baseURL)

  const confirm = page.getByRole('button', { name: '确认星色' })
  await confirm.click()
  await page.locator('[data-testid="personal-journey-stage"][data-phase="confirm"][data-playing="true"]')
    .waitFor({ timeout: 3_000 })
  await page.waitForTimeout(480)
  await capture(page, '07-color-confirm', secrets, demo.baseURL)

  await page.getByRole('heading', { name: /留一句话\s*给未来/u }).waitFor({ timeout: 3_000 })
  await capture(page, '08-message', secrets, demo.baseURL)
  await page.getByLabel('时光胶囊').fill('愿我们在各自的轨道上，仍记得今晚的光。')
  await page.getByLabel(/进入人工审核候选池/u).check()
  await page.getByRole('button', { name: '提交并进入现场' }).click()
  await page.locator('[data-testid="personal-journey-stage"][data-phase="handoff"][data-playing="true"]')
    .waitFor({ timeout: 3_000 })
  await captureTimedSequence(page, [
    ['09-handoff-near', 420],
    ['10-handoff-pullback', 1_550],
    ['11-handoff-galaxy', 2_750],
    ['12-handoff-orbit', 3_950],
  ], secrets, demo.baseURL)

  await page.locator('[data-testid="personal-journey-stage"][data-phase="orbit"][data-playing="false"]')
    .waitFor({ timeout: 3_000 })
  await assertSignalTitleTyping(page, '已抵达，等待全场启程', {
    secrets,
    baseURL: demo.baseURL,
  })
  await page.waitForTimeout(650)
  await capture(page, '13-orbit-settled', secrets, demo.baseURL)
  const canvas = page.locator('.personal-journey-stage__canvas')
  const firstOrbitFrame = await canvas.screenshot({ animations: 'allow' })
  await page.waitForTimeout(2_350)
  await capture(page, '14-orbit-flow', secrets, demo.baseURL)
  const secondOrbitFrame = await canvas.screenshot({ animations: 'allow' })
  if (Buffer.compare(firstOrbitFrame, secondOrbitFrame) === 0) {
    throw new Error('稳定星系在两个时间点完全相同，持续流动验收失败。')
  }
  await page.waitForTimeout(2_650)
  await capture(page, '15-orbit-flow-late', secrets, demo.baseURL)
  await page.getByRole('button', { name: '节目单', exact: true }).click()
  await assertSignalTitleTyping(page, '节目单', {
    captureName: '17-program-title-typing',
    secrets,
    baseURL: demo.baseURL,
  })
  await capture(page, '18-program-index', secrets, demo.baseURL)
  await page.getByRole('button', { name: '档案', exact: true }).click()
  await assertSignalTitleTyping(page, '我的星际档案', {
    captureName: '19-archive-title-typing',
    secrets,
    baseURL: demo.baseURL,
  })
  await capture(page, '20-personal-archive', secrets, demo.baseURL)
  await assertCollegeBrandEntry(page)
  await assertLocalAndPrivate(page, demo.baseURL, secrets)
  assertBrowserClean()
}

async function runReducedOrbit(browserInstance, demo, participant) {
  const reducedContext = await browserInstance.newContext({
    baseURL: demo.baseURL,
    viewport: VIEWPORT,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  try {
    const page = await reducedContext.newPage()
    const assertBrowserClean = createBrowserAudit(page, demo.baseURL)
    const secrets = [participant.inviteToken, participant.displayName, participant.studentNumber]
    const invitation = new URL('/welcome', demo.baseURL)
    invitation.searchParams.set('token', participant.inviteToken)
    await page.goto(invitation.toString())
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('token'))
    await page.locator('[data-testid="personal-journey-stage"][data-phase="orbit"][data-playing="false"]')
      .waitFor({ state: 'visible', timeout: 8_000 })
    await assertReducedSignalTitleStatic(page, '已抵达，等待全场启程')
    await assertCollegeBrandEntry(page)
    await page.waitForTimeout(650)
    const canvas = page.locator('.personal-journey-stage__canvas')
    const firstFrame = await canvas.screenshot({ animations: 'allow' })
    await page.waitForTimeout(1_200)
    const secondFrame = await canvas.screenshot({ animations: 'allow' })
    if (Buffer.compare(firstFrame, secondFrame) !== 0) {
      throw new Error('减少动态模式的稳定星系发生了持续移动。')
    }
    await capture(page, '16-orbit-reduced-static', secrets, demo.baseURL)
    await assertLocalAndPrivate(page, demo.baseURL, secrets)
    assertBrowserClean()
  } finally {
    await reducedContext.close()
  }
}

async function acceptAdminDialog(page, buttonName) {
  const matching = (candidate) => (
    new URL(candidate.url()).pathname === '/api/v2/admin/commands'
    && candidate.request().method() === 'POST'
  )
  let firstResolve
  let overrideResolve
  const firstResponse = new Promise((resolve) => { firstResolve = resolve })
  const overrideResponse = new Promise((resolve) => { overrideResolve = resolve })
  let responseCount = 0
  const onResponse = (candidate) => {
    if (!matching(candidate)) return
    responseCount += 1
    if (responseCount === 1) firstResolve(candidate)
    else if (responseCount === 2) overrideResolve(candidate)
  }
  page.on('response', onResponse)
  try {
    await page.getByRole('button', { name: buttonName, exact: true }).click()
    const first = await Promise.race([
      firstResponse,
      page.waitForTimeout(5_000).then(() => null),
    ])
    if (!first) throw new Error(`后台命令“${buttonName}”没有发出请求。`)
    if (first.ok()) return
    let code = 'UNKNOWN'
    try { code = (await first.json())?.error?.code ?? code } catch { /* sanitized */ }
    if (code !== 'READINESS_CONFIRMATION_REQUIRED') {
      throw new Error(`后台命令“${buttonName}”失败：HTTP ${first.status()} ${code}。`)
    }
    const override = await Promise.race([
      overrideResponse,
      page.waitForTimeout(5_000).then(() => null),
    ])
    if (!override?.ok()) {
      throw new Error(`后台命令“${buttonName}”的明确就绪覆盖没有成功。`)
    }
  } finally {
    page.off('response', onResponse)
  }
}

async function waitForRuntimeText(page, ...copy) {
  await page.waitForFunction((expected) => {
    const text = document.querySelector('.runtime-facts')?.textContent ?? ''
    return expected.every((value) => text.includes(value))
  }, copy, { timeout: 5_000 })
}

async function runGiftVisual(browserInstance, demo, participant) {
  const participantContext = await browserInstance.newContext({
    baseURL: demo.baseURL,
    viewport: VIEWPORT,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const adminContext = await browserInstance.newContext({ baseURL: demo.baseURL })
  try {
    const participantPage = await participantContext.newPage()
    const adminPage = await adminContext.newPage()
    adminPage.on('dialog', async (dialog) => dialog.accept())
    const assertBrowserClean = createBrowserAudit(participantPage, demo.baseURL)
    const secrets = [participant.inviteToken, participant.displayName, participant.studentNumber]
    const invitation = new URL('/welcome', demo.baseURL)
    invitation.searchParams.set('token', participant.inviteToken)
    await participantPage.goto(invitation.toString())
    await participantPage.waitForFunction(() => !new URL(window.location.href).searchParams.has('token'))
    await participantPage.getByRole('heading', { name: '已抵达，等待全场启程' }).waitFor({ timeout: 5_000 })

    await adminPage.goto('/admin')
    await adminPage.getByRole('heading', { name: '共用 Demo 后台登录' }).waitFor({ timeout: 3_000 })
    await adminPage.getByLabel('账号').fill(demo.credentials.admin.username)
    await adminPage.getByLabel('密码').fill(demo.credentials.admin.password)
    await adminPage.getByRole('button', { name: '登录', exact: true }).click()
    await adminPage.getByRole('heading', { name: '三场景控制台' }).waitFor({ timeout: 5_000 })
    await adminPage.getByText('权威实时已连接').waitFor({ timeout: 5_000 })

    await acceptAdminDialog(adminPage, '切换为现场')
    await waitForRuntimeText(adminPage, '待开始', '尚未开始')
    await acceptAdminDialog(adminPage, '开始活动')
    await waitForRuntimeText(adminPage, '运行中', '01 星海集结')
    await acceptAdminDialog(adminPage, '推进下一场景')
    await waitForRuntimeText(adminPage, '运行中', '02 节目应援')
    await participantPage.getByRole('heading', { name: '节目共振' }).waitFor({ timeout: 5_000 })

    await participantPage.getByRole('button', { name: '送礼物' }).click()
    const unavailableDialog = participantPage.getByRole('dialog', { name: '为节目送出礼物' })
    await unavailableDialog.waitFor({ timeout: 3_000 })
    if (!(await unavailableDialog.textContent())?.includes('当前节目暂不接收礼物')) {
      throw new Error('尚未选择当前节目时，礼物面板没有给出可理解的禁用原因。')
    }
    await capture(participantPage, '21-gift-awaiting-program', secrets, demo.baseURL)
    await unavailableDialog.getByRole('button', { name: '关闭礼物面板' }).click()

    await adminPage.getByLabel('当前节目').selectOption({ index: 0 })
    await adminPage.getByRole('button', { name: '设为当前节目' }).click()
    await participantPage.locator('.now-playing strong').filter({ hasNotText: '等待主控选择节目' })
      .waitFor({ timeout: 5_000 })
    await participantPage.getByRole('button', { name: '送礼物' }).click()
    const giftDialog = participantPage.getByRole('dialog', { name: '为节目送出礼物' })
    await giftDialog.waitFor({ timeout: 3_000 })
    const catalog = await giftDialog.locator('.gift-grid button').evaluateAll((buttons) => buttons.map((button) => ({
      label: button.getAttribute('aria-label'),
      hasIcon: Boolean(button.querySelector('svg.gift-signal-icon')),
      disabled: button.disabled,
    })))
    const balance = await giftDialog.locator('.gift-balance output').textContent()
    if (
      catalog.length !== 4
      || catalog.some(({ hasIcon, disabled }) => !hasIcon || disabled)
      || !catalog.some(({ label }) => label?.includes('微光，5 动力'))
      || !catalog.some(({ label }) => label?.includes('信标，10 动力'))
      || !catalog.some(({ label }) => label?.includes('星轨，20 动力'))
      || !catalog.some(({ label }) => label?.includes('星舰，50 动力'))
      || !balance?.includes('100')
    ) throw new Error('礼物目录的图标、价格、可用状态或余额不完整。')
    await capture(participantPage, '22-gift-catalog', secrets, demo.baseURL)
    await giftDialog.getByRole('button', { name: /微光，5 动力/u }).click()
    await participantPage.getByRole('button', { name: '送礼物' }).filter({ hasText: '余额 95' })
      .waitFor({ timeout: 5_000 })
    await capture(participantPage, '23-gift-sent-balance', secrets, demo.baseURL)
    await assertLocalAndPrivate(participantPage, demo.baseURL, secrets)
    assertBrowserClean()
  } finally {
    await adminContext.close()
    await participantContext.close()
  }
}

let demo = null
let browser = null
let context = null

try {
  if (captureMode) await mkdir(outputDirectory, { recursive: true })
  demo = await startDemoTestStack({ protocolVersion: '2', inProcess: true })
  const launched = await launchBrowser()
  browser = launched.browser
  context = await browser.newContext({
    baseURL: demo.baseURL,
    viewport: VIEWPORT,
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    ...(captureMode ? { recordVideo: { dir: outputDirectory, size: VIEWPORT } } : {}),
  })
  const page = await context.newPage()
  const participant = demo.credentials.participant

  if (captureMode) {
    const video = page.video()
    await runCapturedJourney(page, demo, participant)
    await context.close()
    context = null
    if (video) await video.saveAs(path.join(outputDirectory, 'personal-journey-formal.webm'))
    await runReducedOrbit(browser, demo, participant)
    await runGiftVisual(browser, demo, participant)
    process.stdout.write(`正式个人旅程视觉证据已生成：${outputDirectory}（${launched.label}）。\n`)
  } else {
    const invitation = new URL('/welcome', demo.baseURL)
    invitation.searchParams.set('token', participant.inviteToken)
    await page.goto(invitation.toString())
    await page.bringToFront()
    process.stdout.write('正式个人旅程预览已打开。关闭手机窗口即可清理临时数据并退出。\n')
    await new Promise((resolve) => page.once('close', resolve))
  }
} finally {
  await context?.close().catch(() => {})
  await browser?.close().catch(() => {})
  await demo?.stop().catch(() => {})
}
