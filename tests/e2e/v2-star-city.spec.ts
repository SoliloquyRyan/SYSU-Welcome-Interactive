import {prepareProgram,executePrepared,waitRuntime,adminSnapshot} from './support/d109-console.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './support/v2-test.js'

const output = path.resolve('output/playwright/d105-regression/star-city')
async function confirm(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('dialog', { name: '确认操作', exact: true }).getByRole('button', { name: '确定', exact: true }).click()
}
async function shot(page: Page, name: string) { await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }) }

test('reviews the star city surfaces, OBS fallback, and partial combined-operation recovery', async ({ browser, demo }, testInfo) => {
  test.setTimeout(180_000)
  let checkpoint = 'contexts'
  await fs.mkdir(output, { recursive: true })
  const adminContext = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1600, height: 1000 } })
  const phoneContexts = await Promise.all([0, 1].map(() => browser.newContext({ baseURL: demo.baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })))
  const screenContext = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1920, height: 1080 } })
  await screenContext.addInitScript(() => { Object.defineProperty(window, 'obsstudio', { value: {}, configurable: true }) })
  const admin = await adminContext.newPage(), screen = await screenContext.newPage()
  const phones = await Promise.all(phoneContexts.map(context => context.newPage()))
  const errors: string[] = [], commands: string[] = []
  for (const page of [admin, screen, ...phones]) page.on('pageerror', error => errors.push(error.name))
  admin.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/admin/commands')) commands.push(request.postDataJSON().command) })
  try {
    admin.setDefaultTimeout(15_000)
    for (const page of [screen, ...phones]) page.setDefaultTimeout(15_000)
    checkpoint = 'admin login'
    await admin.goto('/admin')
    await admin.getByLabel('账号', { exact: true }).fill(demo.credentials.admin.username)
    await admin.getByLabel('密码', { exact: true }).fill(demo.credentials.admin.password)
    await admin.getByRole('button', { name: '登录', exact: true }).click()
    await expect(admin.getByText('实时已连接', { exact: true })).toBeVisible()
    checkpoint = 'catalog load'
    await admin.getByRole('button', { name: '载入本场节目单', exact: true }).click()
    await admin.getByRole('button', { name: '确认应用 25 项', exact: true }).click()
    await expect(admin.locator('.catalog-editor')).toHaveCount(0)
    checkpoint = 'participant entry'
    for (const [index, phone] of phones.entries()) {
      checkpoint = 'participant ' + index + ' navigate'
      await phone.goto('/welcome?token=' + encodeURIComponent(demo.credentials.participants[index]!.inviteToken))
      checkpoint = 'participant ' + index + ' confirm star'
      await phone.getByRole('button', { name: '确认星色', exact: true }).click()
      checkpoint = 'participant ' + index + ' navigation'
      await expect(phone.getByRole('navigation', { name: '手机端主导航' })).toBeVisible()
    }
    checkpoint = 'combined start'
    await admin.getByLabel('开始模式', { exact: true }).selectOption('LIVE')
    const startIndex = commands.length
    await confirm(admin, '开始活动')
    await waitRuntime(admin,'运行中')
    expect(commands.slice(startIndex)).toEqual(['SET_MODE', 'START'])
    await expect(admin.locator('.workflow-receipt')).toContainText('操作已完成')
    await screen.goto('/screen?motion=reduced')
    await shot(screen, '01-assembly')
    checkpoint = 'program setup'
    await confirm(admin, '进入节目')
    await waitRuntime(admin,'02 节目应援')
    await prepareProgram(admin, 'event2026-01')
    await executePrepared(admin)
    await expect(screen.locator('.v2-screen > .v2-program-stage[data-background-system="mist-star-city"]')).toBeVisible()
    await expect(screen.locator('.ceremony-stage')).toHaveCount(0)
    await expect(phones[0]!.getByRole('textbox', { name: '弹幕', exact: true })).toBeEnabled()
    await shot(admin, '02-admin-program')
    await shot(screen, '03-stage-program')
    await shot(phones[0]!, '04-phone-chat')
    checkpoint = 'phone panels'
    await phones[0]!.getByRole('button', { name: '送礼物', exact: true }).click()
    await shot(phones[0]!, '05-phone-gifts')
    await phones[0]!.getByRole('button', { name: '关闭礼物面板', exact: true }).click()
    await phones[0]!.getByRole('button', { name: '档案', exact: true }).click()
    await shot(phones[0]!, '06-phone-archive')
    await phones[0]!.getByRole('button', { name: '星程', exact: true }).click()

    await screen.goto('/screen?motion=full&settings=1')
    checkpoint = 'audio envelope'
    await expect(screen.locator('[data-background-system="mist-star-city"]')).toBeVisible()
    await screen.evaluate(() => {
      const timer = window.setInterval(() => window.dispatchEvent(new CustomEvent('sysu:audio-envelope', { detail: { version: 1, level: .9, available: true } })), 50)
      Object.assign(window, { starCityTestTimer: timer })
    })
    await expect(screen.getByText('音乐光尘已连接', { exact: true })).toBeVisible()
    await expect.poll(() => screen.locator('.program-stage-background').evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--city-audio')))).toBeGreaterThan(.3)
    await screen.evaluate(() => clearInterval((window as unknown as { starCityTestTimer: number }).starCityTestTimer))
    await expect.poll(() => screen.locator('.program-stage-background').evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--city-audio')))).toBe(0)
    await screen.getByLabel('大屏动效', { exact: true }).selectOption('reduced')
    await screen.evaluate(() => window.dispatchEvent(new CustomEvent('sysu:audio-envelope', { detail: { version: 1, level: 1, available: true } })))
    expect(await screen.locator('.program-stage-background').evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--city-audio')))).toBe(0)
    await screen.goto('/screen?media=overlay&motion=reduced')
    checkpoint = 'overlay transparency'
    await expect(screen.locator('.program-stage-background')).toHaveCount(0)
    const alpha = await screen.locator('.star-city-atmosphere').evaluate(el => { const canvas = el as HTMLCanvasElement; return canvas.getContext('2d')!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data[3] })
    expect(alpha).toBe(0)

    await prepareProgram(admin, 'event2026-14')
    checkpoint = 'manual candidate preparation'
    await expect(admin.locator('.fixed-cue h2')).toContainText('lovesik girls')
    await executePrepared(admin)
    await admin.getByLabel('选手人数',{exact:true}).fill('2')
    let failVote = true
    await admin.route('**/api/v2/admin/commands', async route => {
      if (failVote && route.request().postDataJSON().command === 'OPEN_AUDIENCE_VOTE') {
        failVote = false
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ protocolVersion: '2', error: { code: 'INTERACTION_REVISION_CONFLICT', message: 'State changed' } }) })
      } else await route.continue()
    })
    await confirm(admin, '确认选手并开放投票')
    checkpoint = 'stale vote recovery'
    await expect(admin.getByLabel('选手人数',{exact:true})).toHaveValue('2')
    await expect(admin.getByRole('button', {name:'确认选手并开放投票',exact:true})).toBeEnabled()
    await shot(admin, '07-stale-vote-retry')
    await confirm(admin, '确认选手并开放投票')
    await screen.goto('/screen?motion=reduced')
    await expect(screen.locator('.v2-vote-board article')).toHaveCount(2)
    await shot(screen, '08-stage-vote')
    await shot(phones[0]!, '09-phone-vote')
    await confirm(admin, '关闭投票并揭晓')
    checkpoint = 'reveal and next'
    await expect(admin.getByRole('button', { name: '收起互动并进入下一项', exact: true })).toBeEnabled()
    await confirm(admin, '收起互动并进入下一项')
    await expect(admin.locator('.workflow-receipt')).toContainText('操作已完成')
    await expect(admin.locator('.workflow-receipt')).toContainText('收起互动结果 → 切换下一项')
    for (const page of [admin, ...phones]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await admin.setViewportSize({ width: 960, height: 900 }); await shot(admin, '10-admin-tablet')
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await admin.setViewportSize({ width: 390, height: 844 }); await shot(admin, '11-admin-narrow')
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(errors).toEqual([])
  } catch (error) {
    testInfo.annotations.push({ type: 'failure-checkpoint', description: checkpoint })
    const diagnostic = String((error as Error).message).split('\n').slice(0, 6).join('\n')
      .replace(/https?:\/\/\S+/g, '[url]')
    await fs.writeFile(path.join(output, 'failure.txt'), diagnostic)
    for (const [index, page] of [admin, ...phones].entries()) {
      if (!new URL(page.url()).searchParams.has('token')) await shot(page, 'failure-' + index).catch(() => {})
    }
    throw error
  } finally { await Promise.all([adminContext.close(), screenContext.close(), ...phoneContexts.map(context => context.close())]) }
})
