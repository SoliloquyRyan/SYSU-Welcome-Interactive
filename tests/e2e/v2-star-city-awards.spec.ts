import fs from 'node:fs/promises'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './support/v2-test.js'

test('keeps the docked award editor usable and publishes only confirmed star city results', async ({ browser, demo }, testInfo) => {
  test.setTimeout(120_000)
  const output = path.resolve('output/playwright/d105-regression/awards', testInfo.project.name)
  await fs.mkdir(output, { recursive: true })
  const controller = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1600, height: 1000 } })
  const audience = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
  const participant = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 360, height: 640 }, reducedMotion: 'reduce' })
  const admin = await controller.newPage(), screen = await audience.newPage(), phone = await participant.newPage()
  let checkpoint = 'prepare'
  const errors: string[] = []
  for (const page of [admin, screen, phone]) { page.setDefaultTimeout(15_000); page.on('pageerror', e => errors.push(e.name)) }
  const shot = async (page: Page, name: string) => page.screenshot({ path: path.join(output, name + '.png'), fullPage: true })
  const confirm = async (name: string) => {
    await admin.getByRole('button', { name, exact: true }).click()
    await admin.getByRole('dialog', { name: '确认操作', exact: true }).getByRole('button', { name: '确定', exact: true }).click()
  }
  const select = async (id: string) => {
    await admin.getByLabel('当前节目', { exact: true }).selectOption(id)
    await admin.getByRole('button', { name: '设为当前节目', exact: true }).click()
  }
  try {
    await admin.goto('/admin')
    await admin.getByLabel('账号', { exact: true }).fill(demo.credentials.admin.username)
    await admin.getByLabel('密码', { exact: true }).fill(demo.credentials.admin.password)
    await admin.getByRole('button', { name: '登录', exact: true }).click()
    await expect(admin.getByText('实时已连接', { exact: true })).toBeVisible()
    await admin.getByRole('button', { name: '载入本场节目单', exact: true }).click()
    await admin.getByRole('button', { name: '确认应用 25 项', exact: true }).click()
    await expect(admin.locator('.catalog-editor')).toHaveCount(0)
    await confirm('开始活动')
    await admin.getByRole('button', { name: '02 节目应援', exact: true }).click()
    await phone.goto('/welcome?token=' + encodeURIComponent(demo.credentials.participants[0].inviteToken))
    await phone.getByRole('button', { name: '确认星色', exact: true }).click()
    await screen.goto('/screen?motion=reduced')
    checkpoint = 'program award scores'
    await select('ceremony-program-awards')
    await expect(screen.locator('.ceremony-stage')).toHaveAttribute('data-stage-mode', 'AWARD')
    await admin.locator('.score-details summary').click()
    for (const [id, heat] of [['event2026-01', '300'], ['event2026-02', '200'], ['event2026-03', '100']] as const) {
      await admin.locator('#score-edit-' + id).click()
      await admin.locator('#program-heat-input').fill(heat)
      await admin.getByRole('form', { name: '调整动力值' }).getByRole('button', { name: '确定', exact: true }).click()
      await expect(admin.locator('.score-editor')).toHaveCount(0)
    }
    await admin.locator('.score-details summary').click()
    await expect(admin.getByRole('button', { name: '揭晓名单', exact: true })).toBeEnabled()
    await expect(screen.locator('.award-winners')).toHaveCount(0)
    await confirm('揭晓名单')
    await expect(screen.locator('.award-winners li')).toHaveCount(3)
    await expect(screen.locator('.program-stage-background')).toHaveAttribute('data-theme', 'award')
    await shot(admin, 'program-award-console')
    await shot(screen, 'program-award-stage')
    await shot(phone, 'program-award-phone')
    checkpoint = 'host and campus draft'
    await select('ceremony-speech')
    await expect(screen.locator('.ceremony-stage')).toHaveAttribute('data-stage-mode', 'HOST')
    await expect(phone.locator('.program-stage-background')).toHaveAttribute('data-theme', 'host')
    await shot(screen, 'host-stage')
    await select('ceremony-campus-awards')
    await admin.getByLabel('奖项', { exact: true }).selectOption('points-top20')
    await admin.getByRole('button', { name: '录入名单', exact: true }).click()
    await admin.getByLabel('获奖名单', { exact: true }).fill(Array.from({ length: 20 }, (_, i) => '合成获奖者' + (i + 1) + '｜校园图鉴测试记录').join('\n'))
    await admin.getByRole('region', { name: '名单编辑' }).getByRole('button', { name: '确定', exact: true }).click()
    await expect(admin.locator('.award-editor')).toHaveCount(0)
    await admin.getByRole('button', { name: '展示奖项', exact: true }).click()
    await expect(screen.locator('.award-winners')).toHaveCount(0)
    await expect(screen.locator('body')).not.toContainText('合成获奖者1')
    await confirm('揭晓名单')
    await expect(screen.locator('.award-winners li')).toHaveCount(8)
    await admin.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(screen.locator('.award-winners')).toContainText('合成获奖者9')
    await screen.reload()
    await expect(screen.locator('.award-winners')).toContainText('合成获奖者9')
    await admin.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(screen.locator('.award-winners li')).toHaveCount(4)
    await shot(screen, 'campus-page-three')
    checkpoint = 'responsive console'
    for (const width of [1600, 960, 390]) {
      await admin.setViewportSize({ width, height: 900 })
      expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await shot(admin, 'campus-console-' + width)
    }
    expect(errors).toEqual([])
  } catch (error) {
    testInfo.annotations.push({ type: 'failure-checkpoint', description: checkpoint })
    await shot(admin, 'failure-console').catch(() => {})
    throw error
  } finally { await Promise.all([controller.close(), audience.close(), participant.close()]) }
})

test('shows static stars when public protocol discovery is unavailable', async ({ browser, demo }) => {
  const context = await browser.newContext({ baseURL: demo.baseURL, reducedMotion: 'reduce' })
  try {
    await context.route('**/api/protocol-capabilities', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'test unavailable' } }) }))
    const page = await context.newPage()
    for (const route of ['/screen', '/welcome']) {
      await page.goto(route)
      await expect(page.locator('.route-star')).toBeVisible()
      await expect(page.locator('.route-star')).toHaveCSS('animation-name', 'none')
    }
  } finally { await context.close() }
})
