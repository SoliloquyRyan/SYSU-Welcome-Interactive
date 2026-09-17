import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { test, expect } from './support/v2-test.js'
import { createV2HttpClient } from '../load/v2-protocol-client.js'
import { PROGRAM_VISUALS } from '../../frontend/src/rendering/program-visuals.js'

async function prepare(admin: Page, credentials: { username: string; password: string }) {
  await admin.goto('/admin')
  await admin.getByLabel('账号', { exact: true }).fill(credentials.username)
  await admin.getByLabel('密码', { exact: true }).fill(credentials.password)
  await admin.getByRole('button', { name: '登录', exact: true }).click()
  await admin.getByRole('button', { name: '载入本场节目单', exact: true }).click()
  await admin.getByRole('button', { name: '确认应用 25 项', exact: true }).click()
  await admin.getByRole('button', { name: '开始活动', exact: true }).click()
  await admin.getByRole('dialog', { name: '确认操作', exact: true }).getByRole('button', { name: '确定', exact: true }).click()
  await admin.getByRole('button', { name: '02 节目应援', exact: true }).click()
}
async function select(admin: Page, id: string) {
  await admin.getByLabel('当前节目', { exact: true }).selectOption(id)
  await admin.getByRole('button', { name: '设为当前节目', exact: true }).click()
}

test('D106 restores one admitted star per person and all nineteen program presentations', async ({ browser, demo }, info) => {
  test.setTimeout(180000)
  const out = path.resolve('output/playwright/d106-whitespace-stars', info.project.name)
  await fs.mkdir(out, { recursive: true })
  const ac = await browser.newContext({ baseURL: demo.baseURL })
  const sc = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
  const pc = await browser.newContext({ baseURL: demo.baseURL, viewport: {width:390,height:844}, reducedMotion:'no-preference', recordVideo:{dir:path.join(out,'phone-video'),size:{width:390,height:844}} })
  let phone: Page | undefined
  const admin = await ac.newPage(), screen = await sc.newPage()
  const errors: string[] = []
  screen.on('pageerror', error => errors.push(error.name))
  const api = createV2HttpClient(demo.backendOrigin, demo.requestOrigin)
  const index: unknown[] = []
  let senderCookie = ''
  try {
    await prepare(admin, demo.credentials.admin); await select(admin, 'event2026-03')
    const snapshot = await (await admin.request.get('/api/v2/admin/snapshot')).json()
    await screen.goto('/screen?media=overlay&motion=reduced')
    const sky = screen.locator('.star-city-atmosphere')
    await expect(sky).toHaveAttribute('data-audience-star-count', '0')
    await expect(sky).toHaveAttribute('data-decorative-star-count', '0')
    await screen.screenshot({ path: path.join(out, 'audience-0.png') })
    for (let i = 0; i < 300; i++) {
      const activate = await api.request<any>('admit', 'POST', '/api/v2/participant/activate', { body: { protocolVersion: '2', resetEpoch: snapshot.resetEpoch, idempotencyKey: randomUUID(), method: 'INVITATION_TOKEN', token: demo.credentials.participants[i]!.inviteToken } })
      expect(activate.status).toBe(200)
      const body = { protocolVersion: '2', resetEpoch: snapshot.resetEpoch, idempotencyKey: randomUUID(), expectedParticipantRevision: activate.body.snapshot.participant.participantRevision, command: 'LOCK_COLOR', colorTemperatureKelvin: [2400,4000,5800,8000,12000][i%5] }
      const result = await api.request('lock', 'POST', '/api/v2/participant/commands', { cookie: activate.cookie!, body })
      expect(result.status).toBe(200)
      if (i === 0) {
        senderCookie = activate.cookie!
        expect((await api.request('repeat-lock', 'POST', '/api/v2/participant/commands', { cookie: activate.cookie!, body })).status).toBe(200)
        await expect(sky).toHaveAttribute('data-audience-star-count', '1')
        await screen.screenshot({ path: path.join(out, 'audience-1.png') })
      }
      if (i === 219) { await expect(sky).toHaveAttribute('data-audience-star-count', '220'); await screen.screenshot({ path: path.join(out, 'audience-220.png') }) }
    }
    await expect(sky).toHaveAttribute('data-audience-star-count', '300')
    await screen.screenshot({ path: path.join(out, 'audience-300.png') })
    await screen.reload(); await expect(sky).toHaveAttribute('data-audience-star-count', '300')
    await sc.setOffline(true); await sc.setOffline(false)
    await expect(sky).toHaveAttribute('data-audience-star-count', '300')
    for (const [id, visual] of Object.entries(PROGRAM_VISUALS)) {
      await select(admin, id)
      const current = (await (await admin.request.get('/api/v2/admin/snapshot')).json()).currentProgram
      const title = screen.locator('.program-stage-title')
      if (visual.art) {
        await expect(screen.locator('.v2-program-stage')).toHaveAttribute('data-program-art', visual.art)
        await expect(title).toHaveAttribute('data-title-persistent', 'true')
        await expect(title.locator('h2')).toHaveText(current.title)
        await expect(title.locator('p')).toHaveText(current.performers)
        await screen.reload(); await expect(title.locator('h2')).toHaveText(current.title)
        const art = await screen.locator('.city-panorama').evaluate(el => getComputedStyle(el).backgroundImage)
        expect(art).toContain(visual.art + '-screen')
      } else {
        await expect(screen.locator('.program-stage-background')).toHaveCount(0)
        await expect(title).toHaveAttribute('data-title-persistent', 'false')
        expect(await sky.evaluate(el => { const c = el as HTMLCanvasElement; return c.getContext('2d')!.getImageData(c.width / 2,c.height / 2,1,1).data[3] })).toBe(0)
      }
      await screen.evaluate(() => document.fonts.ready)
      const bounds = await title.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(1920)
      expect(bounds!.y+bounds!.height).toBeLessThan(visual.art ? 980 : 1060)
      await screen.screenshot({ path: path.join(out, id + '.png'), omitBackground: !visual.art })
      index.push({ id, title: current.title, mode: visual.mode, art: visual.art, font: visual.font, titlePersistent: !!visual.art, actualFamily: await title.locator('h2').evaluate(el => getComputedStyle(el).fontFamily) })
    }
    // Full-frame faint population stays present; only a local safe star wakes for a gift.
    await select(admin, 'event2026-01')
    await screen.goto('/screen?media=overlay&motion=full')
    await expect(sky).toHaveAttribute('data-star-placement', 'video-dormant')
    await expect(sky).toHaveAttribute('data-projected-star-count', '300')
    await expect(screen.locator('.v2-signal')).toHaveCount(0)
    phone = await pc.newPage()
    await phone.goto('/welcome?token='+encodeURIComponent(demo.credentials.participants[1]!.inviteToken))
    const phoneSky = phone.locator('.star-city-atmosphere')
    await expect(phoneSky).toHaveAttribute('data-projected-star-count','300')
    await phone.getByRole('textbox',{name:'弹幕',exact:true}).fill('星光还在，输入也保留')
    await phone.screenshot({path:path.join(out,'phone-300.png')})
    await screen.screenshot({ path: path.join(out, 'video-rest.png'), omitBackground: true })
    const sender = await api.request<any>('sender', 'GET', '/api/v2/participant/snapshot', { cookie:senderCookie })
    const sent = await api.request('gift', 'POST', '/api/v2/participant/commands', { cookie:senderCookie,
      body:{ protocolVersion:'2', resetEpoch:sender.body.resetEpoch, idempotencyKey:randomUUID(), expectedParticipantRevision:sender.body.participant.participantRevision, command:'SEND_GIFT', programId:'event2026-01', giftId:'gift-beacon', quantity:1 } })
    expect(sent.status).toBe(200)
    const effect = screen.locator('[data-gift-visual="beacon"]')
    await expect(effect).toBeVisible()
    const anchor = await effect.evaluate(el => ({ x:parseFloat((el as HTMLElement).style.getPropertyValue('--gift-x'))/100, y:parseFloat((el as HTMLElement).style.getPropertyValue('--gift-y'))/100 }))
    const peak = () => sky.evaluate((el,p) => { const c=el as HTMLCanvasElement, data=c.getContext('2d')!.getImageData(Math.round(p.x*c.width)-4,Math.round(p.y*c.height)-4,9,9).data; return Math.max(...Array.from(data).filter((_,i)=>i%4===3)) }, anchor)
    await expect.poll(peak, {intervals:[30,30,50]}).toBeGreaterThan(70)
    const litAlpha = await peak()
    const phoneEffect = phone.locator('[data-gift-visual="beacon"]')
    await expect(phoneEffect).toBeVisible()
    const phoneAnchor = await phoneEffect.evaluate(el => ({ x:parseFloat((el as HTMLElement).style.getPropertyValue('--gift-x'))/100, y:parseFloat((el as HTMLElement).style.getPropertyValue('--gift-y'))/100 }))
    const phonePeak = () => phoneSky.evaluate((el,p) => { const c=el as HTMLCanvasElement, data=c.getContext('2d')!.getImageData(Math.round(p.x*c.width)-2,Math.round(p.y*c.height)-2,5,5).data; return Math.max(...Array.from(data).filter((_,i)=>i%4===3)) },phoneAnchor)
    await expect.poll(phonePeak, {intervals:[20,30,30]}).toBeGreaterThan(110)
    const phoneLitAlpha = await phonePeak()
    await phone.screenshot({path:path.join(out,'phone-300-gift.png')})
    await screen.screenshot({ path:path.join(out,'video-gift.png'), omitBackground:true })
    await expect(effect).toHaveCount(0)
    await expect.poll(peak).toBeLessThan(30)
    const restingAlpha = await peak()
    await expect(phoneEffect).toHaveCount(0)
    const phoneRestAlpha = await phonePeak()
    expect(phoneRestAlpha).toBeLessThan(30)
    expect(phoneRestAlpha).toBeLessThan(phoneLitAlpha)
    await expect(phone.getByRole('textbox',{name:'弹幕',exact:true})).toHaveValue('星光还在，输入也保留')
    await screen.screenshot({ path:path.join(out,'video-return.png'), omitBackground:true })
    await fs.writeFile(path.join(out,'video-star-response.json'),JSON.stringify({ admitted:300,projected:300,litAlpha,restingAlpha,phoneLitAlpha,phoneRestAlpha,localOnly:true,realConfirmedGift:true },null,2))
    await screen.goto('/screen?media=overlay&motion=reduced')
    await select(admin, 'event2026-03')
    await screen.waitForTimeout(8800)
    await expect(screen.locator('.program-stage-title')).toBeVisible()
    await admin.getByRole('button', { name: '报幕／主题背景', exact: true }).click()
    await expect(screen.locator('.program-stage-title')).toHaveCount(0)
    await expect(sky).toHaveAttribute('data-audience-star-count', '300')
    await screen.screenshot({ path: path.join(out, 'theme-300.png') })
    await admin.getByRole('button', { name: '返回节目', exact: true }).click()
    await expect(screen.locator('.program-stage-title')).toHaveAttribute('data-title-persistent', 'true')
    expect(errors).toEqual([])
    await fs.writeFile(path.join(out, 'program-index.json'), JSON.stringify(index, null, 2))
  } catch (error) {
    let detail = String((error as Error).stack)
    for (const value of [demo.credentials.admin.username, demo.credentials.admin.password, ...demo.credentials.participants.flatMap(p => [p.inviteToken,p.studentNumber,p.displayName,p.publicStarId])]) detail = detail.replaceAll(value,'[redacted]')
    await fs.writeFile(path.join(out, 'audience-failure.txt'), detail.replace(/https?:\/\/\S+/g,'[url]'))
    throw error
  } finally {
    const video = phone?.video()
    await Promise.allSettled([ac.close(), sc.close(), pc.close()])
    if (video) await video.saveAs(path.join(out,'phone-stars-gift.webm'))
  }
})

test('D106 resets controlled envelope modulation on silence, pause, program change, disconnect and reduced motion', async ({ browser, demo }, info) => {
  const ac = await browser.newContext({ baseURL: demo.baseURL })
  const sc = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1920, height: 1080 } })
  // Controlled browser input only. Real OBS evidence is recorded separately.
  await sc.addInitScript(() => { (window as any).obsstudio = {} })
  const admin = await ac.newPage(), screen = await sc.newPage()
  const audio = () => screen.evaluate(() => Number((document.querySelector('.star-city-atmosphere')?.parentElement as HTMLElement)?.style.getPropertyValue('--city-audio') || 0))
  const pulse = () => screen.evaluate(() => { (window as any).__qaAudio = setInterval(() => dispatchEvent(new CustomEvent('sysu:audio-envelope', { detail: { version:1,level:.9,available:true } })),50) })
  const stop = () => screen.evaluate(() => clearInterval((window as any).__qaAudio))
  try {
    await prepare(admin, demo.credentials.admin); await select(admin, 'event2026-03')
    await screen.goto('/screen?media=overlay&motion=full')
    await expect(screen.locator('.v2-program-stage')).toBeVisible()
    await pulse(); await expect.poll(audio).toBeGreaterThan(.3)
    await stop(); await expect.poll(audio, { timeout: 2500 }).toBe(0)
    await pulse(); await expect.poll(audio).toBeGreaterThan(.3)
    await admin.getByRole('button', { name: '暂停', exact: true }).click(); await expect.poll(audio).toBe(0)
    await stop(); await admin.getByRole('button', { name: '恢复运行', exact: true }).click(); expect(await audio()).toBe(0)
    await pulse(); await expect.poll(audio).toBeGreaterThan(.3); await stop()
    await select(admin, 'event2026-01'); await expect(screen.locator('.program-stage-background')).toHaveCount(0); await expect.poll(audio).toBe(0)
    await pulse(); await expect.poll(audio).toBeGreaterThan(.25)
    await sc.setOffline(true); await expect.poll(audio).toBe(0); await stop(); await sc.setOffline(false)
    await screen.goto('/screen?media=overlay&motion=reduced'); await pulse(); await screen.waitForTimeout(600); expect(await audio()).toBe(0)
    await stop()
    await fs.writeFile(path.resolve('output/playwright/d106-whitespace-stars', info.project.name, 'controlled-audio.json'), JSON.stringify({ input: 'synthetic-browser-envelope', status:'passed', realObs:false }))
  } catch (error) {
    let detail = String((error as Error).stack)
    for (const value of [demo.credentials.admin.username, demo.credentials.admin.password, ...demo.credentials.participants.flatMap(p => [p.inviteToken,p.studentNumber,p.displayName,p.publicStarId])]) detail = detail.replaceAll(value,'[redacted]')
    const out = path.resolve('output/playwright/d106-whitespace-stars', info.project.name)
    await fs.mkdir(out,{recursive:true}); await fs.writeFile(path.join(out,'audio-failure.txt'),detail.replace(/https?:\/\/\S+/g,'[url]'))
    throw error
  } finally { await Promise.allSettled([ac.close(), sc.close()]) }
})
