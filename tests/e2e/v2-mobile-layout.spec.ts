import fs from 'node:fs'
import path from 'node:path'
import type { Locator, Page } from '@playwright/test'

import { expect, test } from './support/v2-test.js'

async function reachable(control: Locator) {
  await control.scrollIntoViewIfNeeded({ timeout: 10_000 })
  const bounds = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return {
      width: rect.width, height: rect.height,
      visible: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
      receivesPointer: element === hit || element.contains(hit),
    }
  })
  expect(bounds.width).toBeGreaterThanOrEqual(44)
  expect(bounds.height).toBeGreaterThanOrEqual(44)
  expect(bounds.visible).toBe(true)
  expect(bounds.receivesPointer).toBe(true)
}

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - innerWidth,
    vertical: document.documentElement.scrollHeight - innerHeight,
  }))).toEqual({ horizontal: 0, vertical: 0 })
}

test('keeps mobile controls reachable and builds a memento only from confirmed participation', async ({ browser, demo }, testInfo) => {
  test.setTimeout(150_000)
  const context = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const unconfirmedContext = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const adminContext = await browser.newContext({ baseURL: demo.baseURL })
  const page = await context.newPage()
  const unconfirmed = await unconfirmedContext.newPage()
  const admin = await adminContext.newPage()
  const errors: string[] = []
  for (const surface of [page, unconfirmed, admin]) surface.on('pageerror', (error) => errors.push(error.name))
  const output = path.resolve(process.env.V2_MOBILE_ARTIFACT_DIR ?? 'output/playwright/mobile-20260906', testInfo.project.name)
  fs.mkdirSync(output, { recursive: true })
  let checkpoint = 'color-keyboard-and-layout'
  try {
    await page.goto(`/welcome?token=${encodeURIComponent(demo.credentials.participants[0].inviteToken)}`)
    const slider = page.getByRole('slider', { name: '恒星色温' })
    const confirm = page.getByRole('button', { name: '确认星色', exact: true })
    await expect(confirm).toBeEnabled()
    await page.screenshot({ path: path.join(output, 'color-default.png') })
    await slider.focus()
    await slider.press('Home')
    await expect(slider).toHaveValue('2400')
    await slider.press('End')
    await expect(slider).toHaveValue('12000')
    await slider.press('ArrowLeft')
    await expect(slider).toHaveValue('11950')
    await expect(slider).toHaveAttribute('aria-valuetext', '11,950 开尔文')
    await slider.blur()
    await page.screenshot({ path: path.join(output, 'color.png') })
    for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(viewport)
      await reachable(slider)
      await reachable(confirm)
      await expect(page.getByText('确认后本场不可更改', { exact: true })).toBeVisible()
      await noPageOverflow(page)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    for (const scale of ['125%', '200%']) {
      await page.evaluate((fontSize) => { document.documentElement.style.fontSize = fontSize }, scale)
      await reachable(slider)
      await reachable(confirm)
      await noPageOverflow(page)
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = '' })
    checkpoint = 'admission-and-program'
    await confirm.click()
    await expect(page.getByText('1 颗星，已在这里相遇')).toBeVisible()
    await unconfirmed.goto(`/welcome?token=${encodeURIComponent(demo.credentials.participants[1].inviteToken)}`)
    await expect(unconfirmed.getByRole('button', { name: '确认星色', exact: true })).toBeEnabled()

    await admin.goto('/admin')
    await admin.getByLabel('账号', { exact: true }).fill(demo.credentials.admin.username)
    await admin.getByLabel('密码', { exact: true }).fill(demo.credentials.admin.password)
    await admin.getByRole('button', { name: '登录', exact: true }).click()
    await expect(admin.getByText('实时已连接', { exact: true })).toBeVisible()
    admin.on('dialog', (dialog) => void dialog.accept())
    await admin.getByRole('button', { name: '切换为现场', exact: true }).click()
    await admin.getByRole('dialog', { name: '确认操作', exact: true }).getByRole('button', { name: '确定', exact: true }).click()
    await expect(admin.locator('.runtime-facts')).toContainText('现场')
    await admin.getByRole('button', { name: '开始活动', exact: true }).click()
    await admin.getByRole('dialog', { name: '确认操作', exact: true }).getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByRole('button', { name: '启动我的星', exact: true })).toBeVisible()
    await admin.getByRole('button', { name: '推进下一场景', exact: true }).click()
    await admin.getByRole('dialog', { name: '确认操作', exact: true }).getByRole('button', { name: '确定', exact: true }).click()
    await expect(admin.locator('.runtime-facts')).toContainText('02 节目应援')
    await admin.getByRole('button', { name: '设为当前节目', exact: true }).click()
    const input = page.getByRole('textbox', { name: '弹幕', exact: true })
    await expect(input).toBeEnabled()
    await page.screenshot({ path: path.join(output, 'program.png') })
    await input.fill('这是一条未提交的合成草稿')
    await page.setViewportSize({ width: 390, height: 420 })
    await expect(page.locator('.v2-welcome')).toHaveClass(/is-keyboard/u)
    await reachable(input)
    await reachable(page.getByRole('button', { name: '发送', exact: true }))
    // An in-viewport box can still be clipped by its scroll container or covered by navigation.
    await expect.poll(() => input.evaluate((element) => {
      const r = element.getBoundingClientRect()
      return [r.top + 4, r.bottom - 4].every(y => document.elementFromPoint(r.x + r.width / 2, y) === element)
    })).toBe(true)
    await expect(page.getByRole('navigation', { name: '手机端主导航' })).toBeHidden()

    await noPageOverflow(page)
    await page.screenshot({ path: path.join(output, 'keyboard.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await input.blur()
    checkpoint = 'archive-help'
    await page.getByRole('button', { name: '档案', exact: true }).click()
    const powerHelp = page.getByRole('button', { name: '动力', exact: true })
    await reachable(powerHelp)
    await powerHelp.click()
    await expect(page.getByRole('tooltip')).toContainText('可用于节目礼物')
    await page.getByRole('button', { name: '星程', exact: true }).click()

    checkpoint = 'completed-memento'
    await admin.getByRole('button', { name: '推进下一场景', exact: true }).click()
    await admin.getByRole('dialog', { name: '确认操作', exact: true }).getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByRole('button', { name: '参与全场点亮', exact: true })).toBeVisible()
    await admin.getByRole('button', { name: '结束并锁定终章', exact: true }).click()
    await admin.getByRole('dialog', { name: '确认操作', exact: true }).getByRole('button', { name: '确定', exact: true }).click()
    const memento = page.getByRole('region', { name: '今夜的个人纪念' })
    await expect(memento).toBeVisible()
    await expect(page.locator('.dock-message--warning')).toHaveCount(0)
    await expect(memento.getByRole('listitem')).toHaveText(['抵达星河'])
    await expect(memento).toContainText('11,950 K')
    const emptyMemento = unconfirmed.getByRole('region', { name: '今夜的个人纪念' })
    await expect(emptyMemento).toContainText('星色尚未确认')
    await expect(emptyMemento).toContainText('你尚未完成入场')
    await expect(emptyMemento.getByRole('listitem')).toHaveCount(0)
    await page.screenshot({ path: path.join(output, 'memento.png') })
    for (const viewport of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(viewport)
      await reachable(page.getByRole('button', { name: '查看个人档案' }))
      await reachable(page.getByRole('button', { name: '节目单', exact: true }))
      await noPageOverflow(page)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    await reachable(page.getByRole('button', { name: '查看个人档案' }))
    await noPageOverflow(page)
    await page.evaluate(() => { document.documentElement.style.fontSize = '' })
    await page.reload()
    await expect(memento.getByRole('listitem')).toHaveText(['抵达星河'])
    const canvas = page.locator('.personal-journey-stage__canvas')
    const before = await canvas.screenshot()
    await page.waitForTimeout(300)
    expect((await canvas.screenshot()).equals(before)).toBe(true)
    await page.getByRole('button', { name: '查看个人档案' }).click()
    await expect(page.getByRole('heading', { name: '星际档案', exact: true })).toBeVisible()
    expect(errors).toEqual([])
  } catch (error) {
    testInfo.annotations.push({ type: 'failure-checkpoint', description: checkpoint })
    throw error
  } finally {
    await context.close()
    await unconfirmedContext.close()
    await adminContext.close()
  }
})

test('loads the local phone font without leaking it to other surfaces and remains usable when it fails', async ({ browser, demo }) => {
  const context = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const fallbackContext = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })
  const fontPaths = new Set<string>()
  let blockedFontRequests = 0
  context.on('request', (request) => {
    if (request.resourceType() === 'font') fontPaths.add(new URL(request.url()).pathname)
  })
  await fallbackContext.route(/welcome-sans-sc-ui.*\.woff2(?:\?.*)?$/u, async (route) => {
    if (route.request().resourceType() !== 'font') return route.continue()
    blockedFontRequests += 1
    await route.abort('failed')
  })
  const page = await context.newPage()
  const fallback = await fallbackContext.newPage()
  try {
    await page.goto('/admin')
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
    await page.goto('/screen')
    await expect(page.locator('canvas').first()).toBeAttached()
    expect(fontPaths.size).toBe(0)

    await page.goto(`/welcome?token=${encodeURIComponent(demo.credentials.participants[0].inviteToken)}`)
    await expect(page.getByRole('button', { name: '确认星色', exact: true })).toBeEnabled()
    await expect.poll(() => page.evaluate(() => Array.from(document.fonts).some((font) =>
      font.family.replaceAll('"', '') === 'Welcome Sans SC' && font.status === 'loaded',
    ))).toBe(true)
    expect(fontPaths.size).toBe(1)
    expect([...fontPaths][0]).toContain('welcome-sans-sc-ui')
    const requestOrigins = await page.evaluate(() => performance.getEntriesByType('resource')
      .filter((entry) => entry.name.includes('welcome-sans-sc-ui') && entry.name.includes('.woff2'))
      .map((entry) => new URL(entry.name).origin))
    expect(requestOrigins.length).toBeGreaterThan(0)
    expect(requestOrigins.every((origin: string) => origin === new URL(demo.baseURL).origin)).toBe(true)
    const license = await page.request.get('/licenses/welcome-sans-sc-OFL.txt')
    expect(license.ok()).toBe(true)
    expect(await license.text()).toContain('SIL OPEN FONT LICENSE')

    await fallback.goto(`/welcome?token=${encodeURIComponent(demo.credentials.participants[1].inviteToken)}`)
    const confirm = fallback.getByRole('button', { name: '确认星色', exact: true })
    await expect(confirm).toBeEnabled()
    expect(blockedFontRequests).toBeGreaterThan(0)
    await expect(fallback.getByRole('heading', { name: '为你的星选择颜色', exact: true })).toBeVisible()
    await reachable(confirm)
    await noPageOverflow(fallback)
    await confirm.click()
    await expect(fallback.getByText('1 颗星，已在这里相遇')).toBeVisible()
    await fallback.getByRole('button', { name: '档案', exact: true }).click()
    await expect(fallback.getByRole('heading', { name: '星际档案', exact: true })).toBeVisible()
  } finally {
    await context.close()
    await fallbackContext.close()
  }
})
