import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from './support/v2-test.js'
import type { DemoTestStack } from './fixtures/demo-stack.js'

async function prepare(admin: Page, demo: DemoTestStack) {
  await admin.goto('/admin')
  await admin.getByLabel('账号', { exact: true }).fill(demo.credentials.admin.username)
  await admin.getByLabel('密码', { exact: true }).fill(demo.credentials.admin.password)
  await admin.getByRole('button', { name: '登录', exact: true }).click()
  await admin.getByRole('button', { name: '载入本场节目单', exact: true }).click()
  await admin.getByRole('button', { name: '确认应用 25 项', exact: true }).click()
}
async function start(admin: Page) {
  await admin.getByRole('button', { name: '开始活动', exact: true }).click()
  await admin.getByRole('dialog', { name: '确认操作', exact: true }).getByRole('button', { name: '确定', exact: true }).click()
  await admin.getByRole('button', { name: '02 节目应援', exact: true }).click()
}
async function select(admin: Page, id: string) {
  await admin.getByLabel('当前节目', { exact: true }).selectOption(id)
  await admin.getByRole('button', { name: '设为当前节目', exact: true }).click()
}
async function admit(phone: Page, demo: DemoTestStack, index: number) {
  await phone.goto('/welcome?token=' + encodeURIComponent(demo.credentials.participants[index]!.inviteToken))
  await phone.getByRole('slider', { name: '恒星色温' }).press(index ? 'End' : 'Home')
  await phone.getByRole('button', { name: '确认星色', exact: true }).click()
  await expect(phone.getByRole('navigation', { name: '手机端主导航' })).toBeVisible()
}
async function gift(phone: Page, giftId: string, quantity = 1, idempotencyKey = randomUUID()) {
  const before = await (await phone.request.get('/api/v2/participant/snapshot')).json()
  const body = { protocolVersion: '2', resetEpoch: before.resetEpoch, idempotencyKey, expectedParticipantRevision: before.participant.participantRevision, command: 'SEND_GIFT', programId: before.currentProgram.id, giftId, quantity }
  const response = await phone.request.post('/api/v2/participant/commands', { data: body, headers: { Origin: new URL(phone.url()).origin } })
  expect(response.ok(), 'gift HTTP status ' + response.status()).toBe(true)
  return { body, result: await response.json(), before }
}
async function platformFonts(context: BrowserContext, page: Page, selector: string) {
  await expect(page.locator(selector)).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const cdp = await context.newCDPSession(page)
  try {
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument')
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    return (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts
  } finally { await cdp.detach() }
}

test('D106 preserves a confirmed gift when its own HTTP snapshot arrives after the public event', async ({ browser, demo }) => {
  const ac=await browser.newContext({baseURL:demo.baseURL}),pc=await browser.newContext({baseURL:demo.baseURL,viewport:{width:390,height:844},reducedMotion:'no-preference'})
  const admin=await ac.newPage(),phone=await pc.newPage()
  try {
    await prepare(admin,demo);await admit(phone,demo,0);await start(admin);await select(admin,'event2026-03')
    await expect(phone.locator('#view-title')).toContainText('夜航星')
    await expect(phone.locator('.v2-welcome')).toHaveAttribute('data-program-opening','settled')
    await expect(phone.getByRole('button',{name:'送礼物',exact:true})).toBeEnabled()
    await phone.getByRole('button',{name:'送礼物',exact:true}).click()
    const dialog=phone.getByRole('dialog',{name:'送礼物',exact:true})
    await dialog.getByRole('button',{name:/星舰，单个 20 动力/u}).click()
    let eventBeforeResponse=false
    await phone.route('**/api/v2/participant/commands',async route=>{
      if(route.request().postDataJSON()?.command!=='SEND_GIFT'){await route.continue();return}
      const response=await route.fetch()
      await phone.locator('[data-gift-visual="starship"]').waitFor({state:'attached'})
      eventBeforeResponse=true
      await phone.waitForTimeout(600)
      await route.fulfill({response})
    })
    await dialog.getByRole('button',{name:'发送',exact:true}).click()
    await expect(dialog).toBeHidden()
    expect(eventBeforeResponse).toBe(true)
    await expect(phone.locator('[data-gift-visual="starship"]')).toBeVisible()
    await expect(phone.getByRole('button',{name:'送礼物',exact:true})).toContainText('余额 80')
    await expect(phone.locator('[data-gift-visual="starship"]')).toHaveCount(0)
  } catch(error) {
    let detail=String((error as Error).stack)
    for(const value of [demo.credentials.admin.username,demo.credentials.admin.password,...demo.credentials.participants.flatMap(p=>[p.inviteToken,p.studentNumber,p.displayName,p.publicStarId])])detail=detail.replaceAll(value,'[redacted]')
    const out=path.resolve('output/playwright/d106-whitespace-stars',test.info().project.name)
    await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'gift-race-failure.txt'),detail.replace(/https?:\/\/\S+/g,'[url]').slice(0,4000))
    throw error
  } finally {await Promise.allSettled([ac.close(),pc.close()])}
})

test('D106 keeps announcement pure, retains background fallbacks, and serves local typography', async ({ browser, demo }, info) => {
  test.setTimeout(150000)
  const out = path.resolve('output/playwright/d106-whitespace-stars', info.project.name)
  await fs.mkdir(out, { recursive: true })
  const ac = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1600, height: 1000 } })
  const sc = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
  const pc = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const admin = await ac.newPage(), screen = await sc.newPage(), phone = await pc.newPage()
  const errors: string[] = []
  for (const p of [admin, screen, phone]) p.on('pageerror', e => errors.push(e.name))
  let checkpoint = 'prepare'
  try {
    await prepare(admin, demo); await admit(phone, demo, 0)
    await phone.evaluate(() => document.fonts.ready)
    const firstFonts = await phone.evaluate(() => performance.getEntriesByType('resource').filter(e => e.name.includes('.woff2')).map(e => ({ path: new URL(e.name).pathname, bytes: (e as PerformanceResourceTiming).decodedBodySize })))
    expect(firstFonts.length).toBeGreaterThan(0)
    expect(firstFonts.every(f => f.path.includes('welcome-sans-sc'))).toBe(true)
    await start(admin); await select(admin, 'event2026-03')
    await screen.goto('/screen?media=overlay&motion=reduced')
    checkpoint = 'three variants'
    for (const [id, variant] of [['event2026-03', 'lyric'], ['event2026-04', 'rhythm'], ['event2026-08', 'instrumental']]) {
      if (id !== 'event2026-03') await select(admin, id!)
      await expect(screen.locator('.v2-program-stage')).toHaveAttribute('data-background-variant', variant!)
      await expect(phone.locator('.program-stage-background')).toHaveAttribute('data-background-variant', variant!)
      await screen.evaluate(() => document.fonts.ready)
      await screen.screenshot({ path: path.join(out, `background-${variant}.png`) })
    }
    checkpoint = 'announcement'
    await admin.getByRole('button', { name: '报幕／主题背景', exact: true }).click()
    await expect(screen.locator('.ceremony-stage')).toHaveAttribute('data-stage-mode', 'HOST')
    await expect(screen.locator('.host-title')).toHaveText('2026迎新晚会')
    await expect(screen.locator('.stage-college-brand')).toBeVisible()
    await expect(screen.locator('.program-stage-title,.v2-gift-room-stats,[data-gift-visual]')).toHaveCount(0)
    await screen.screenshot({ path: path.join(out, 'announcement.png') })
    await screen.reload()
    await expect(screen.locator('.host-title')).toHaveText('2026迎新晚会')
    await expect(screen.locator('.ceremony-stage .program-stage-background')).toBeVisible()
    await admin.getByRole('button', { name: '返回节目', exact: true }).click()
    await expect(screen.locator('.v2-program-stage')).toHaveAttribute('data-background-variant', 'instrumental')
    checkpoint = 'video overlay and speech'
    await select(admin, 'event2026-01')
    await expect(screen.locator('.program-stage-background')).toHaveCount(0)
    expect(await screen.locator('.star-city-atmosphere').evaluate(el => { const c = el as HTMLCanvasElement; return c.getContext('2d')!.getImageData(c.width / 2, c.height / 2, 1, 1).data[3] })).toBe(0)
    await admin.getByRole('button', { name: '报幕／主题背景', exact: true }).click()
    await expect(screen.locator('.ceremony-stage .program-stage-background')).toBeVisible()
    await admin.getByRole('button', { name: '返回节目', exact: true }).click()
    await expect(screen.locator('.program-stage-background')).toHaveCount(0)
    await select(admin, 'ceremony-speech')
    await expect(screen.locator('.host-title')).not.toBeEmpty()
    expect(await screen.locator('.host-title').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Fangxian')
    await screen.evaluate(() => document.fonts.ready)
    const titleFonts = await platformFonts(sc, screen, '.host-title')
    expect(titleFonts.some(f => f.isCustomFont && /FangXian/i.test(f.familyName))).toBe(true)
    expect(titleFonts.some(f => /Smiley/i.test(f.familyName))).toBe(false)
    await screen.screenshot({ path: path.join(out, 'speech-type.png') })
    checkpoint = 'phone controls and dynamic glyphs'
    await select(admin, 'event2026-03')
    await phone.getByRole('textbox', { name: '弹幕', exact: true }).fill('今晚的星光：霁澄，2026 ✨')
    await phone.evaluate(() => document.fonts.ready)
    const families = await phone.locator('h1,h2,button,input,textarea,output').evaluateAll(elements => elements.map(el => getComputedStyle(el).fontFamily))
    expect(families.every(f => f.includes('Welcome Sans SC'))).toBe(true)
    await phone.getByRole('button', { name: '送礼物', exact: true }).click()
    await expect(phone.getByRole('dialog', { name: '送礼物', exact: true })).toBeVisible()
    await phone.screenshot({ path: path.join(out, 'phone-gifts.png') })
    await phone.getByRole('button', { name: '关闭礼物面板', exact: true }).click()
    await expect(phone.getByRole('dialog', { name: '送礼物', exact: true })).toHaveCount(0)
    await phone.screenshot({ path: path.join(out, 'phone-chat.png') })
    await phone.getByRole('button', { name: '档案', exact: true }).click()
    await phone.screenshot({ path: path.join(out, 'phone-archive.png') })
    const phoneFonts = await platformFonts(pc, phone, '.archive-owner')
    await fs.writeFile(path.join(out, 'platform-fonts.json'), JSON.stringify({ phoneFonts, titleFonts }, null, 2))
    expect(phoneFonts.some(f => f.isCustomFont && /Welcome Sans SC/.test(f.familyName))).toBe(true)
    await fs.writeFile(path.join(out, 'font-network.json'), JSON.stringify({ firstFonts, titleFonts, phoneFonts, firstBytes: firstFonts.reduce((n, f) => n + f.bytes, 0), allFonts: await phone.evaluate(() => performance.getEntriesByType('resource').filter(e => e.name.includes('.woff2')).map(e => ({ path: new URL(e.name).pathname, bytes: (e as PerformanceResourceTiming).decodedBodySize }))) }, null, 2))
    await admin.screenshot({ path: path.join(out, 'admin.png') })
    expect(errors).toEqual([])
  } catch (error) {
    info.annotations.push({ type: 'failure-checkpoint', description: checkpoint })
    let detail = String((error as Error).stack ?? (error as Error).message)
    for (const value of [demo.credentials.admin.username, demo.credentials.admin.password, ...demo.credentials.participants.flatMap(p => [p.inviteToken, p.studentNumber, p.displayName, p.publicStarId])]) detail = detail.replaceAll(value, '[redacted]')
    await fs.writeFile(path.join(out, 'failure-' + (info.title.includes('announcement') ? 'background' : 'gifts') + '.txt'), detail.replace(/https?:\/\/\S+/g, '[url]').slice(0, 4000))
    await phone.screenshot({ path: path.join(out, 'failure-phone.png'), timeout: 3000 }).catch(() => {})
    throw error
  }
  finally { await Promise.allSettled([ac.close(), sc.close(), pc.close()]) }
})

test('D106 confirms four gifts with locked colors, preserves phone controls, and clears on interruption', async ({ browser, demo }, info) => {
  test.setTimeout(150000)
  const out = path.resolve('output/playwright/d106-whitespace-stars', info.project.name)
  await fs.mkdir(out, { recursive: true })
  const ac = await browser.newContext({ baseURL: demo.baseURL })
  const sc = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1920, height: 1080 }, ...(info.project.name === 'chromium-ci' ? { recordVideo: { dir: path.join(out, 'recordings'), size: { width: 1920, height: 1080 } } } : {}) })
  const pc = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const senderContext = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const admin = await ac.newPage(), screen = await sc.newPage(), phone = await pc.newPage(), sender = await senderContext.newPage()
  const videoStart = Date.now(), videoCues: { id: string; seconds: number; duration: number }[] = []
  const errors: string[] = []
  for (const p of [admin, screen, phone, sender]) p.on('pageerror', e => errors.push(e.name))
  let checkpoint = 'prepare'
  try {
    await prepare(admin, demo); await admit(phone, demo, 0); await admit(sender, demo, 1)
    await start(admin); await select(admin, 'event2026-03')
    await screen.goto('/screen?motion=full')
    await expect(screen.locator('.v2-program-stage')).toBeVisible()
    await expect(screen.locator('.ceremony-stage')).toHaveCount(0)
    pc.setDefaultTimeout(10000)
    await phone.emulateMedia({ reducedMotion: 'no-preference' })
    await phone.getByRole('textbox', { name: '弹幕', exact: true }).fill('保留正在输入的星光')
    await phone.getByRole('button', { name: '星色', exact: true }).click()
    checkpoint = 'four gift effects'
    for (const [id, hold] of [['glimmer', 250], ['beacon', 420], ['orbit', 650], ['starship', 1000]] as const) {
      videoCues.push({ id, seconds: (Date.now() - videoStart) / 1000, duration: ({ glimmer: .8, beacon: 1.4, orbit: 1.6, starship: 2.4 })[id] })
      const sent = await gift(sender, 'gift-' + id)
      const effect = screen.locator(`[data-gift-visual="${id}"]`)
      await expect(effect).toBeVisible()
      await expect(effect).toHaveAttribute('data-gift-quantity', '1')
      expect(await effect.evaluate(el => (el as HTMLElement).style.getPropertyValue('--gift-color'))).toBe(sent.before.participant.displayColor.toUpperCase())
      await expect(phone.locator(`[data-gift-visual="${id}"]`)).toBeAttached()
      await expect(phone.getByRole('group', { name: '弹幕星色', exact: true })).toBeVisible()
      await expect(phone.getByRole('textbox', { name: '弹幕', exact: true })).toHaveValue('保留正在输入的星光')
      if (id === 'starship') {
        expect(await effect.locator('.gift-small-ship').evaluate(el => el.getBoundingClientRect().width)).toBe(72)
        expect(await phone.locator('.gift-small-ship').evaluate(el => el.getBoundingClientRect().width)).toBe(24)
      }
      await screen.waitForTimeout(hold)
      await screen.screenshot({ path: path.join(out, `gift-${id}.png`) })
      await expect(effect).toHaveCount(0)
    }
    checkpoint = 'batch and idempotency'
    await phone.getByRole('button', { name: '送礼物', exact: true }).click()
    const batch = await gift(sender, 'gift-beacon', 3)
    await expect(screen.locator('[data-gift-visual="beacon"]')).toHaveAttribute('data-gift-quantity', '3')
    await expect(phone.getByRole('dialog', { name: '送礼物', exact: true })).toBeVisible()
    await expect(screen.locator('[data-gift-visual="beacon"]')).toHaveCount(0)
    const repeated = await sender.request.post('/api/v2/participant/commands', { data: batch.body, headers: { Origin: new URL(sender.url()).origin } })
    expect(repeated.ok()).toBe(true)
    expect((await repeated.json()).participant.powerBalance).toBe(batch.result.participant.powerBalance)
    await expect(screen.locator('[data-gift-visual]')).toHaveCount(0)
    checkpoint = 'third ship and pause'
    await gift(phone, 'gift-starship')
    await expect(screen.locator('[data-gift-visual="starship"]')).toBeVisible()
    await expect(screen.locator('[data-gift-visual="starship"]')).toHaveCount(0)
    await gift(phone, 'gift-starship')
    await expect(screen.locator('[data-gift-visual="starship"]')).toBeVisible()
    // This is the third batch in this program; the legacy showStarship flag is false.
    await pc.setOffline(true)
    await expect(phone.locator('[data-gift-visual]')).toHaveCount(0)
    await admin.getByRole('button', { name: '暂停', exact: true }).click()
    await expect(screen.locator('[data-gift-visual]')).toHaveCount(0)
    await expect(phone.locator('[data-gift-visual]')).toHaveCount(0)
    await admin.getByRole('button', { name: '恢复运行', exact: true }).click()
    await pc.setOffline(false)
    await screen.reload()
    await expect(screen.locator('.v2-program-stage')).toBeVisible()
    await expect(screen.locator('[data-gift-visual]')).toHaveCount(0)
    checkpoint = 'static gift and program change'
    await screen.goto('/screen?motion=reduced')
    await expect(screen.locator('.v2-program-stage')).toBeVisible()
    await expect(screen.locator('.v2-signal')).toHaveCount(0)
    await phone.emulateMedia({ reducedMotion: 'reduce' })
    await gift(sender, 'gift-orbit')
    await expect(screen.locator('.gift-static-star')).toBeVisible()
    const animations = await screen.locator('.gift-sky').evaluate(el => el.getAnimations({ subtree: true }).length)
    expect(animations).toBe(0)
    await select(admin, 'event2026-04')
    await expect(screen.locator('[data-gift-visual]')).toHaveCount(0)
    expect(errors).toEqual([])
  } catch (error) {
    info.annotations.push({ type: 'failure-checkpoint', description: checkpoint })
    let detail = String((error as Error).stack ?? (error as Error).message)
    for (const value of [demo.credentials.admin.username, demo.credentials.admin.password, ...demo.credentials.participants.flatMap(p => [p.inviteToken, p.studentNumber, p.displayName, p.publicStarId])]) detail = detail.replaceAll(value, '[redacted]')
    await fs.writeFile(path.join(out, 'failure-' + (info.title.includes('announcement') ? 'background' : 'gifts') + '.txt'), detail.replace(/https?:\/\/\S+/g, '[url]').slice(0, 4000))
    await phone.screenshot({ path: path.join(out, 'failure-phone.png'), timeout: 3000 }).catch(() => {})
    throw error
  }
  finally {
    const video = screen.video()
    await fs.writeFile(path.join(out, 'gift-video-cues.json'), JSON.stringify(videoCues, null, 2))
    await Promise.allSettled([ac.close(), sc.close(), pc.close(), senderContext.close()])
    if (video) await video.saveAs(path.join(out, 'four-gifts.webm'))
  }
})
