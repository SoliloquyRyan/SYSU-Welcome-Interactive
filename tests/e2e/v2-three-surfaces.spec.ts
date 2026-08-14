import type { BrowserContext, Page, Response } from '@playwright/test'

import { expect, test } from './support/v2-test.js'

async function expectNoForbiddenText(
  pages: readonly Page[],
  forbidden: readonly string[],
): Promise<void> {
  for (const page of pages) {
    const body = await page.locator('body').innerText()
    for (const value of forbidden) expect(body).not.toContain(value)
  }
}

async function acceptNextDialog(page: Page): Promise<void> {
  page.once('dialog', async (dialog) => dialog.accept())
}

async function loginAdmin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: '共用 Demo 后台登录' })).toBeVisible()
  await page.getByLabel('账号').fill(username)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '三场景控制台' })).toBeVisible()
  await expect(page.getByText('权威实时已连接')).toBeVisible()
}

async function waitForRuntime(page: Page, status: string, scene: string): Promise<void> {
  await expect(page.locator('.runtime-facts')).toContainText(status)
  await expect(page.locator('.runtime-facts')).toContainText(scene)
}

async function advance(page: Page): Promise<void> {
  await acceptNextDialog(page)
  await page.getByRole('button', { name: '推进下一场景' }).click()
}

async function clickAdminCommand(page: Page, buttonName: string): Promise<void> {
  const responsePromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/v2/admin/commands'
    && response.request().method() === 'POST'
  ), { timeout: 5_000 })
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  let response: Response
  try {
    response = await responsePromise
  } catch (error) {
    const button = page.getByRole('button', { name: buttonName, exact: true })
    throw new Error(
      `Admin command “${buttonName}” produced no request; disabled=${await button.isDisabled()}; page=${(await page.locator('body').innerText()).slice(0, 500)}.`,
      { cause: error },
    )
  }
  if (response.ok()) return
  let code = 'UNKNOWN'
  try { code = (await response.json())?.error?.code ?? code } catch { /* sanitized checkpoint */ }
  throw new Error(`Admin command “${buttonName}” failed with ${response.status()} ${code}.`)
}

test('runs the v2 welcome, screen and admin surfaces through one authoritative lifecycle', async ({
  browser,
  demo,
}) => {
  test.setTimeout(150_000)
  let participantContext: BrowserContext | null = null
  let screenContext: BrowserContext | null = null
  let adminContext: BrowserContext | null = null
  try {
    participantContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    })
    screenContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 1920, height: 1080 },
      reducedMotion: 'reduce',
    })
    adminContext = await browser.newContext({ baseURL: demo.baseURL })
    const participantPage = await participantContext.newPage()
    const screenPage = await screenContext.newPage()
    const adminPage = await adminContext.newPage()
    const credential = demo.credentials.participants[0]
    const capsule = 'v2 三浏览器合成胶囊'
    const barrage = 'v2 三端合成弹幕'

    await screenPage.goto('/screen')
    await expect(screenPage.getByRole('heading', { name: '星海集结' })).toBeVisible()
    await expect(screenPage.getByText('0', { exact: true }).first()).toBeVisible()

    await participantPage.goto(`/welcome?token=${encodeURIComponent(credential.inviteToken)}`)
    await expect(participantPage.getByRole('heading', { name: '为你的星选择颜色' })).toBeVisible()
    expect(new URL(participantPage.url()).searchParams.has('token')).toBe(false)
    await participantPage.getByRole('button', { name: '确认星色' }).click()
    await expect(participantPage.getByRole('heading', { name: /留一句话\s*给未来/u })).toBeVisible()
    await participantPage.getByLabel('时光胶囊').fill(capsule)
    await participantPage.getByLabel(/我同意这段文字进入人工审核候选池/u).check()
    await participantPage.getByRole('button', { name: '提交并进入现场' }).click()
    await expect(participantPage.getByText('1 颗真实星已抵达')).toBeVisible()
    await expect(screenPage.getByText('/ 300 颗真实星点')).toBeVisible()

    await loginAdmin(
      adminPage,
      demo.credentials.admin.username,
      demo.credentials.admin.password,
    )
    await expect(adminPage.locator('.metrics')).toContainText('1')
    await expect(adminPage.locator('.capsule-list')).toContainText(capsule)
    await expectNoForbiddenText(
      [adminPage, screenPage],
      [credential.displayName, credential.studentNumber, credential.inviteToken],
    )
    await expectNoForbiddenText([screenPage], [credential.publicStarId, capsule])

    await acceptNextDialog(adminPage)
    await adminPage.getByRole('button', { name: '切换为现场' }).click()
    await waitForRuntime(adminPage, '待开始', '尚未开始')
    await acceptNextDialog(adminPage)
    await adminPage.getByRole('button', { name: '开始活动' }).click()
    await waitForRuntime(adminPage, '运行中', '01 星海集结')
    await expect(participantPage.getByRole('button', { name: '启动我的星' })).toBeVisible()
    await participantPage.getByRole('button', { name: '启动我的星' }).click()
    await expect(participantPage.getByText('星星已启动')).toBeVisible()

    await clickAdminCommand(adminPage, '暂停')
    await waitForRuntime(adminPage, '已暂停', '01 星海集结')
    await expect(participantPage.getByText('现场已暂停')).toBeVisible()
    await expect(participantPage.getByRole('button', { name: '启动我的星' })).toHaveCount(0)
    await adminPage.getByRole('button', { name: '恢复运行' }).click()
    await waitForRuntime(adminPage, '运行中', '01 星海集结')

    await advance(adminPage)
    await waitForRuntime(adminPage, '运行中', '02 节目应援')
    await expect(screenPage.locator('.v2-screen')).toHaveClass(/scene-program_support/u)

    // The information panel must remain reachable before an admin chooses a
    // current program. Sending stays unavailable and explains why.
    await participantPage.getByRole('button', { name: '送礼物' }).click()
    const unavailableGiftDialog = participantPage.getByRole('dialog', { name: '为节目送出礼物' })
    await expect(unavailableGiftDialog).toBeVisible()
    await expect(unavailableGiftDialog).toContainText('当前节目暂不接收礼物')
    await expect(unavailableGiftDialog.locator('.gift-grid button')).toHaveCount(0)
    await unavailableGiftDialog.getByRole('button', { name: '关闭礼物面板' }).click()

    await adminPage.getByLabel('当前节目').selectOption({ index: 0 })
    await adminPage.getByRole('button', { name: '设为当前节目' }).click()
    const selectedProgram = await adminPage.getByLabel('当前节目').locator('option:checked').innerText()
    const selectedTitle = selectedProgram.split('·')[1]?.trim()
    expect(selectedTitle).toBeTruthy()
    await expect(screenPage.getByRole('heading', { name: selectedTitle! })).toBeVisible()

    await participantPage.getByRole('button', { name: '送礼物' }).click()
    const giftDialog = participantPage.getByRole('dialog', { name: '为节目送出礼物' })
    await expect(giftDialog).toBeVisible()
    await expect(giftDialog.locator('.gift-balance output')).toContainText('100')
    await expect(giftDialog.locator('.gift-grid button')).toHaveCount(4)
    await expect(giftDialog.locator('.gift-signal-icon')).toHaveCount(4)
    await expect(giftDialog.getByRole('button', { name: /微光，5 动力/u })).toBeEnabled()
    await expect(giftDialog.getByRole('button', { name: /信标，10 动力/u })).toBeEnabled()
    await expect(giftDialog.getByRole('button', { name: /星轨，20 动力/u })).toBeEnabled()
    await expect(giftDialog.getByRole('button', { name: /星舰，50 动力/u })).toBeEnabled()
    await giftDialog.locator('.gift-grid button').first().click()
    await expect(participantPage.getByRole('button', { name: '送礼物' })).toContainText('余额 95')
    await expect(screenPage.locator('.v2-gifts')).not.toBeEmpty()
    await participantPage.getByLabel('匿名弹幕').fill(barrage)
    await participantPage.getByLabel(/匿名公开上屏/u).check()
    await participantPage.getByRole('button', { name: '发送', exact: true }).click()
    await expect(screenPage.getByText(barrage)).toBeVisible()
    await expect(adminPage.locator('.barrage-list')).toContainText(barrage)
    await expectNoForbiddenText([screenPage], [credential.publicStarId])

    await advance(adminPage)
    await waitForRuntime(adminPage, '运行中', '03 协同点亮')
    await participantPage.getByRole('button', { name: '参与全场点亮' }).click()
    await expect(participantPage.getByText('点亮已完成')).toBeVisible()

    await demo.restartBackend()
    await expect(screenPage.getByRole('heading', { name: '协同点亮' })).toBeVisible()
    await expect(participantPage.getByText('点亮已完成')).toBeVisible()
    await expect(adminPage.getByText('权威实时已连接')).toBeVisible()

    await acceptNextDialog(adminPage)
    await adminPage.getByRole('button', { name: '结束并锁定终章' }).click()
    await expect(screenPage.getByRole('heading', { name: '今夜的星河，已经成形' })).toBeVisible()
    await expect(participantPage.getByText('本场活动已结束', { exact: true })).toBeVisible()
    await waitForRuntime(adminPage, '已完成', '03 协同点亮')
    await expectNoForbiddenText(
      [screenPage],
      [credential.publicStarId, credential.displayName, credential.studentNumber, credential.inviteToken],
    )

    const screenPrivacy = await screenPage.evaluate(() => ({
      clickableStars: document.querySelectorAll('button[aria-label*="星号"], [data-public-star-id]').length,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }))
    expect(screenPrivacy).toEqual({ clickableStars: 0, horizontalOverflow: 0, verticalOverflow: 0 })
    const mobileLayout = await participantPage.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      stageLine: document.body.innerText.includes('06 / 06') || document.body.innerText.includes('RUNNING'),
      normalRealtimeLabel: document.body.innerText.includes('实时同步'),
    }))
    expect(mobileLayout).toEqual({
      horizontalOverflow: 0,
      verticalOverflow: 0,
      stageLine: false,
      normalRealtimeLabel: false,
    })
  } finally {
    await Promise.allSettled([
      participantContext?.close() ?? Promise.resolve(),
      screenContext?.close() ?? Promise.resolve(),
      adminContext?.close() ?? Promise.resolve(),
    ])
  }
})
