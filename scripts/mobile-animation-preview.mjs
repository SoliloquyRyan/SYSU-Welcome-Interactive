import { chromium } from '@playwright/test'

import { startDemoTestStack } from '../tests/e2e/fixtures/demo-stack.ts'

const MOBILE_VIEWPORT = { width: 390, height: 844 }
const CONTROL_VIEWPORT = { width: 1180, height: 820 }
const STAGE_NAMES = ['身份激活', '时光胶囊', '星星集结', '节目应援', '协同点亮', '星际档案']

const smokeMode = process.env.DEMO_PREVIEW_SMOKE === '1'

async function launchVisibleBrowser() {
  const candidates = [
    { label: 'Google Chrome', options: { channel: 'chrome' } },
    { label: 'Microsoft Edge', options: { channel: 'msedge' } },
    { label: 'Playwright Chromium', options: {} },
  ]

  const failures = []
  for (const candidate of candidates) {
    try {
      const browser = await chromium.launch({
        ...candidate.options,
        headless: smokeMode,
      })
      return { browser, label: candidate.label }
    } catch {
      failures.push(candidate.label)
    }
  }
  throw new Error(
    `无法打开可见浏览器，已依次尝试：${failures.join('、')}。请先安装 Chrome 或 Edge。`,
  )
}

async function openAdminController(demo, browser) {
  const context = await browser.newContext({
    baseURL: demo.baseURL,
    viewport: CONTROL_VIEWPORT,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const page = await context.newPage()
  await page.goto(new URL('/admin', demo.baseURL).toString())
  await page.getByLabel('共用账号').fill(demo.credentials.admin.username)
  await page.getByLabel('密码').fill(demo.credentials.admin.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('heading', { name: '当前能力' }).waitFor()
  await page.getByText('实时同步', { exact: true }).waitFor()

  const allRole = page.locator('.role-row').filter({ hasText: '全部能力' })
  const grantAll = allRole.getByRole('button', { name: '取得权限' })
  if (await grantAll.isVisible()) {
    await grantAll.click()
  }
  await allRole.getByText('已取得', { exact: true }).waitFor()

  const runtimeStrip = page.locator('.runtime-strip')
  const modeSelect = page.getByLabel('运行模式')
  if ((await modeSelect.inputValue()) !== 'REHEARSAL') {
    await modeSelect.selectOption('REHEARSAL')
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: '应用模式', exact: true }).click()
  }

  if ((await runtimeStrip.innerText()).includes('READY')) {
    await page.getByRole('button', { name: '开始', exact: true }).click()
  }
  await runtimeStrip.filter({ hasText: 'RUNNING' }).waitFor()
  await page.evaluate(() => {
    document.title = '动画阶段控制台 · SYSU Welcome'
  })

  return { context, page }
}

async function jumpToStage(controllerPage, stage) {
  const name = STAGE_NAMES[stage - 1]
  await controllerPage.getByLabel('排练跳转阶段').selectOption(String(stage))
  await controllerPage.getByRole('button', { name: '跳转', exact: true }).click()
  await controllerPage
    .locator('.runtime-strip')
    .filter({ hasText: `${stage} · ${name}` })
    .waitFor()
}

let demo = null
let browser = null
let stopping = false

async function stopPreview() {
  if (stopping) return
  stopping = true
  try {
    await browser?.close()
  } finally {
    await demo?.stop()
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void stopPreview().finally(() => {
      process.exitCode = 0
    })
  })
}

try {
  demo = await startDemoTestStack({ participantCount: 4 })
  const launched = await launchVisibleBrowser()
  browser = launched.browser

  const mobileContext = await browser.newContext({
    baseURL: demo.baseURL,
    viewport: MOBILE_VIEWPORT,
    hasTouch: true,
    isMobile: true,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const page = await mobileContext.newPage()
  const participant = demo.credentials.participant

  await page.goto(new URL('/screen', demo.baseURL).toString())
  await page.evaluate(
    ({ baseURL, inviteToken }) => {
      const invitation = new URL('/welcome', baseURL)
      invitation.searchParams.set('token', inviteToken)
      window.location.assign(invitation.toString())
    },
    { baseURL: demo.baseURL, inviteToken: participant.inviteToken },
  )
  await page
    .getByRole('heading', { name: /欢迎.*进入智工星河/ })
    .waitFor()
  await page.evaluate(() => {
    document.title = '手机端动画预览 · SYSU Welcome'
  })

  const controller = await openAdminController(demo, browser)

  if (smokeMode) {
    await page.getByRole('button', { name: '启动星程' }).click()
    await page.getByRole('heading', { name: '选择你的恒星色温' }).waitFor()
    await page.getByRole('button', { name: '确认星色 · 进入星辰' }).click()
    await page.getByRole('button', { name: '退出' }).waitFor()
    for (let stage = 1; stage <= STAGE_NAMES.length; stage += 1) {
      await jumpToStage(controller.page, stage)
      await page
        .locator('#scene-title')
        .filter({ hasText: new RegExp(`^${STAGE_NAMES[stage - 1]}$`, 'u') })
        .waitFor()
    }
    await browser.close()
  } else {
    process.stdout.write(
      [
        '',
        `动画排练载体已打开（${launched.label}）。`,
        '窗口一：390×844 手机端，当前停在 NFC 核验后的欢迎画面。',
        '窗口二：动画阶段控制台，已登录、取得全部能力并启动排练。',
        '先在手机端点击“启动星程”并确认星色，再到控制台选择阶段 1–6 并点击“跳转”。',
        '两个窗口会通过真实 HTTP/WebSocket 状态实时联动；可用 Alt+Tab 切换。',
        '前端源文件变更会由开发服务器更新；刷新页面可继续调试。',
        '关闭手机端窗口或按 Ctrl+C 将关闭全部窗口、清理临时数据库并退出。',
        '',
      ].join('\n'),
    )

    await new Promise((resolve) => {
      browser.once('disconnected', resolve)
      page.once('close', () => void browser?.close())
    })
  }
} finally {
  await stopPreview()
}
