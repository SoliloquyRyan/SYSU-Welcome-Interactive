import fs from 'node:fs/promises'
import path from 'node:path'
import type { Page, Response } from '@playwright/test'

import { expect, test } from './support/v2-test.js'

async function loginAdmin(page: Page, username: string, password: string) {
  await page.goto('/admin')
  await page.getByLabel('账号', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('实时已连接', { exact: true })).toBeVisible()
}

async function command(page: Page, name: string) {
  const [response]: [Response, void] = await Promise.all([page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/v2/admin/commands'
    && response.request().method() === 'POST'
  ), { timeout: 15_000 }), page.getByRole('button', { name, exact: true }).click({ timeout: 10_000 })])
  expect(response.ok(), `${name} should succeed`).toBe(true)
}

test('runs A/C-style buzzer, B draw and vote, gift batches, star color barrages and the full closing ledger', async ({ browser, demo }, testInfo) => {
  test.setTimeout(150_000)
  let checkpoint = 'login-and-admission'
  const directory = path.resolve('output/d089/browser')
  await fs.mkdir(directory, { recursive: true })
  const adminContext = await browser.newContext({ baseURL: demo.baseURL })
  const screenContext = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
  const phoneAContext = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const phoneBContext = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const admin = await adminContext.newPage()
  const screen = await screenContext.newPage()
  const phoneA = await phoneAContext.newPage()
  const phoneB = await phoneBContext.newPage()
  const errors: string[] = []
  for (const page of [admin, screen, phoneA, phoneB]) page.on('pageerror', error => errors.push(error.message))
  admin.on('dialog', dialog => void dialog.accept())

  try {
    await loginAdmin(admin, demo.credentials.admin.username, demo.credentials.admin.password)
    const catalog = admin.locator('.catalog-panel')
    await catalog.getByRole('button', { name: '载入本场节目单', exact: true }).click()
    await catalog.getByRole('button', { name: '确认应用 25 项', exact: true }).click()

    await phoneA.goto(`/welcome?token=${encodeURIComponent(demo.credentials.participants[0].inviteToken)}`)
    await phoneA.getByRole('slider', { name: '恒星色温' }).press('Home')
    await phoneA.getByRole('button', { name: '确认星色', exact: true }).click()
    await phoneB.goto(`/welcome?token=${encodeURIComponent(demo.credentials.participants[1].inviteToken)}`)
    await phoneB.getByRole('button', { name: '确认星色', exact: true }).click()

    await admin.getByRole('button', { name: '开始活动', exact: true }).click()
    await admin.getByRole('dialog', { name: '确认操作', exact: true }).getByRole('button', { name: '确定', exact: true }).click()
    await admin.getByRole('button', { name: '02 节目应援', exact: true }).click()

    checkpoint = 'interaction-a-buzzer'
    await catalog.getByLabel('当前节目', { exact: true }).selectOption('event2026-07')
    await catalog.getByRole('button', { name: '设为当前节目', exact: true }).click()
    await command(admin, '开始抢答')
    await screen.goto('/screen?motion=reduced')
    await expect(screen.getByText('抢答开放', { exact: true })).toBeVisible()
    await phoneA.getByRole('button', { name: '立即抢答', exact: true }).click()
    const firstStar = demo.credentials.participants[0].publicStarId
    await expect(screen.locator('.v2-buzzer-winner')).toHaveText(firstStar)
    await expect(phoneB.getByText('本轮已结束', { exact: true })).toBeVisible()
    await expect(admin.locator('.buzzer-result')).toContainText(firstStar)
    await screen.screenshot({ path: path.join(directory, 'interaction-a-buzzer-1920.png') })
    await command(admin, '关闭本轮互动')

    checkpoint = 'interaction-c-buzzer'
    await catalog.getByLabel('当前节目', { exact: true }).selectOption('event2026-21')
    await catalog.getByRole('button', { name: '设为当前节目', exact: true }).click()
    await command(admin, '开始抢答')
    await expect(phoneB.getByRole('button', { name: '准备抢答', exact: true })).toBeDisabled()
    await expect(phoneB.getByLabel('抢答倒计时', { exact: true })).toBeVisible()
    await phoneB.getByRole('button', { name: '立即抢答', exact: true }).click()
    const thirdRoundStar = demo.credentials.participants[1].publicStarId
    await expect(screen.locator('.v2-buzzer-winner')).toHaveText(thirdRoundStar)
    await expect(admin.locator('.buzzer-result')).toContainText(thirdRoundStar)
    await expect(phoneA.getByText('本轮已结束', { exact: true })).toBeVisible()
    await screen.screenshot({ path: path.join(directory, 'interaction-c-buzzer-1920.png') })
    await command(admin, '关闭本轮互动')

    checkpoint = 'interaction-b-draw-and-vote'
    await catalog.getByLabel('当前节目', { exact: true }).selectOption('event2026-14')
    await catalog.getByRole('button', { name: '设为当前节目', exact: true }).click()
    await command(admin, '开启观众抽取')
    await command(admin, '抽取一位')
    await expect(admin.locator('.winner-list code')).toHaveCount(1)
    await command(admin, '抽取一位')
    await expect(admin.locator('.winner-list code')).toHaveCount(2)
    const candidates = await admin.locator('.winner-list code').allTextContents()
    await command(admin, '完成抽取')
    await command(admin, '开放观众投票')

    await phoneA.getByLabel(candidates[0]!, { exact: true }).check()
    await phoneA.locator('.live-interaction-card').getByRole('button', { name: '确定', exact: true }).click()
    await phoneB.getByLabel(candidates[1]!, { exact: true }).check()
    await phoneB.locator('.live-interaction-card').getByRole('button', { name: '确定', exact: true }).click()
    await expect(screen.locator('.v2-vote-count strong')).toHaveText('2')
    await expect(screen.locator('.v2-vote-board article > strong')).toHaveText(['—', '—'])
    await expect(admin.locator('.admin-vote-board')).toContainText('已收到 2 票')
    await screen.screenshot({ path: path.join(directory, 'interaction-b-vote-hidden-1920.png') })
    await command(admin, '揭晓投票结果')
    await expect(screen.getByText('本轮结果已经揭晓', { exact: true })).toBeVisible()
    await expect(screen.locator('.v2-vote-board article > strong')).toHaveText(['1', '1'])
    await command(admin, '关闭本轮互动')

    checkpoint = 'gift-batch-and-personal-barrage'
    await catalog.getByLabel('当前节目', { exact: true }).selectOption('event2026-01')
    await catalog.getByRole('button', { name: '设为当前节目', exact: true }).click()
    await phoneA.getByRole('button', { name: '送礼物', exact: true }).click()
    for (let i = 0; i < 4; i++) await phoneA.getByRole('button', { name: '增加礼物数量', exact: true }).click()
    await phoneA.getByRole('button', { name: /微光，单个 1 动力，本次 5 个共 5 动力/u }).click()
    await phoneA.getByRole('dialog', { name: '送礼物', exact: true }).getByRole('button', { name: /发送/u }).click()
    await expect(phoneA.getByRole('button', { name: '送礼物', exact: true })).toContainText('余额 95')
    const giftStats = screen.locator('.v2-gift-room-stats')
    await expect(giftStats).toContainText('微光×5')
    await expect(giftStats.locator('li')).toHaveCount(4)

    const personalBarrage = '我的星色也在舞台上'
    await phoneA.getByRole('textbox', { name: '弹幕', exact: true }).fill(personalBarrage)
    await phoneA.getByRole('button', { name: '星色', exact: true }).click()
    await phoneA.getByRole('button', { name: '我的星色，免费', exact: true }).click()
    await phoneA.getByRole('button', { name: '发送', exact: true }).click()
    const personalFlight = screen.locator('.v2-barrage-stream__item', { hasText: personalBarrage })
    await expect(personalFlight).toBeVisible()
    expect(await personalFlight.getAttribute('style')).toContain('color:')

    checkpoint = 'premium-barrage-confirmation'
    const premiumBarrage = '极光弹幕确认完成'
    await phoneA.getByRole('textbox', { name: '弹幕', exact: true }).fill(premiumBarrage)
    await expect(phoneA.getByRole('group', { name: '弹幕星色', exact: true })).toBeVisible()
    await phoneA.getByRole('button', { name: /极光，首次发送解锁需 10 动力/u }).click()
    await phoneA.getByRole('button', { name: '发送', exact: true }).click()
    const confirm = phoneA.getByRole('alertdialog', { name: '解锁「极光」' })
    await expect(confirm).toContainText('剩余 85 动力')
    await phoneA.screenshot({ path: path.join(directory, 'premium-barrage-confirm-390.png') })
    await confirm.getByRole('button', { name: '确定', exact: true }).click()
    await expect(phoneA.getByRole('button', { name: '送礼物', exact: true })).toContainText('余额 85')
    await expect(screen.locator('.v2-barrage-stream__item', { hasText: premiumBarrage })).toBeVisible()

    checkpoint = 'starship-batch'
    await screen.goto('/screen?motion=full')
    await expect(screen.locator('.v2-screen')).toHaveAttribute('data-motion-state', 'full')
    await phoneA.getByRole('button', { name: '送礼物', exact: true }).click()
    await phoneA.getByRole('button', { name: '增加礼物数量', exact: true }).click()
    await phoneA.getByRole('button', { name: /星舰，单个 20 动力，本次 2 个共 40 动力/u }).click()
    await phoneA.getByRole('dialog', { name: '送礼物', exact: true }).getByRole('button', { name: /发送/u }).click()
    const starship = screen.locator('[data-gift-visual="starship"]')
    await expect(starship).toBeVisible()
    await expect(starship.locator('.gift-starship-flight__portal i')).toHaveCount(3)
    await expect(starship.locator('.gift-starship-flight__particles i')).toHaveCount(22)
    await expect(starship.locator('.gift-starship-flight__caption')).toContainText('×2')
    await starship.evaluate(element => {
      for (const animation of element.getAnimations({ subtree: true })) {
        const duration = Number(animation.effect?.getTiming().duration)
        if (Number.isFinite(duration)) {
          animation.currentTime = duration * .58
          animation.pause()
        }
      }
    })
    await screen.screenshot({ path: path.join(directory, 'starship-and-gift-stats-1920.png') })

    checkpoint = 'closing-ledger'
    await screen.goto('/screen?motion=reduced')
    await admin.getByRole('button', { name: '03 协同点亮', exact: true }).click()
    await command(admin, '预览终章')
    await expect(screen.locator('.closing-credits')).toHaveAttribute('data-phase', 'poster')
    await screen.getByRole('button', { name: '弹幕与礼物回顾', exact: true }).click()
    const recap = screen.locator('.closing-credits__community')
    await expect(recap).toContainText('微光×55 礼物值')
    await expect(recap).toContainText('星舰×240 礼物值')
    await expect(recap).toContainText('2条弹幕·7份礼物·45礼物值')
    await expect(recap).toContainText(personalBarrage)
    await expect(recap).toContainText(premiumBarrage)
    await screen.screenshot({ path: path.join(directory, 'closing-community-ledger-1920.png') })
    await screen.getByRole('button', { name: '返回', exact: true }).click()
    await screen.getByRole('button', { name: '节目与动力值', exact: true }).click()
    await expect(screen.locator('.closing-credits__directory-heading')).toContainText('19 个正式节目')
    await expect(screen.locator('.closing-credits__grid article')).toHaveCount(6)
    expect(errors).toEqual([])
  } catch (error) {
    testInfo.annotations.push({ type: 'failure-checkpoint', description: checkpoint })
    throw error
  } finally {
    await Promise.allSettled([adminContext.close(), screenContext.close(), phoneAContext.close(), phoneBContext.close()])
  }
})
