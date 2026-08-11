import { chromium } from '@playwright/test'

import { startDemoTestStack } from '../tests/e2e/fixtures/demo-stack.ts'

const MOBILE_VIEWPORT = { width: 390, height: 844 }

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

  const context = await browser.newContext({
    baseURL: demo.baseURL,
    viewport: MOBILE_VIEWPORT,
    hasTouch: true,
    isMobile: true,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  const page = await context.newPage()
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
    .getByRole('heading', { name: '使用邀请函上的合成信息核验' })
    .waitFor()
  await page.getByLabel('虚构姓名').fill(participant.displayName)
  await page.getByLabel('六位 Demo 码').fill(participant.demoCode)
  await page.getByRole('button', { name: '进入现场' }).click()
  await page.getByRole('heading', { name: /欢迎.*进入智工星河/ }).waitFor()

  if (smokeMode) {
    await browser.close()
  } else {
    process.stdout.write(
      [
        '',
        `手机端动画预览已打开（${launched.label}，390×844）。`,
        '页面停在 NFC 核验后的欢迎画面；点击“启动星程”进入恒星色温选择。',
        '确认星色后，即可继续查看既有的星辰入轨过场与主界面。',
        '前端源文件变更会由开发服务器更新；刷新页面可继续调试。',
        '关闭浏览器或按 Ctrl+C 将清理临时数据库并退出。',
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
