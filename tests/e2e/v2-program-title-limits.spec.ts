import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { test, expect } from './support/v2-test.js'

test('D106 keeps maximum catalog text inside the screen and loads real local title glyphs', async ({ browser, demo }, info) => {
  const ac=await browser.newContext({baseURL:demo.baseURL})
  const sc=await browser.newContext({baseURL:demo.baseURL,viewport:{width:1920,height:1080},reducedMotion:'reduce'})
  const admin=await ac.newPage(),screen=await sc.newPage()
  const out=path.resolve('output/playwright/d106-whitespace-stars',info.project.name)
  try {
    await admin.goto('/admin')
    await admin.getByLabel('账号',{exact:true}).fill(demo.credentials.admin.username)
    await admin.getByLabel('密码',{exact:true}).fill(demo.credentials.admin.password)
    await admin.getByRole('button',{name:'登录',exact:true}).click()
    await admin.getByRole('button',{name:'载入本场节目单',exact:true}).click()
    await admin.getByRole('button',{name:'确认应用 25 项',exact:true}).click()
    await expect(admin.getByLabel('当前节目',{exact:true}).locator('option')).toHaveCount(25)
    const snapshot=await(await admin.request.get('/api/v2/admin/snapshot')).json()
    const items=snapshot.programs.map((p:any,index:number)=>({id:p.id,order:index+1,title:p.id==='event2026-03'?'夜航星与我们的共同旅程'.repeat(12).slice(0,120):p.title,performers:p.id==='event2026-03'?'星光合唱团与器乐演奏组、'.repeat(24).slice(0,240):p.performers,kind:p.kind,formatLabel:p.formatLabel,durationLabel:p.durationLabel,giftsEnabled:p.giftsEnabled,awardGroup:p.awardGroup}))
    const response=await admin.request.post('/api/v2/admin/commands',{headers:{Origin:demo.requestOrigin},data:{protocolVersion:'2',resetEpoch:snapshot.resetEpoch,idempotencyKey:randomUUID(),command:'UPDATE_PROGRAM_CATALOG',expectedRunRevision:snapshot.runtime.runRevision,expectedInteractionRevision:snapshot.interaction.interactionRevision,expectedCatalogRevision:snapshot.programCatalog.revision,catalog:{label:'合成最长文字检查',items},confirmed:true}})
    expect(response.status()).toBe(200)
    await admin.getByRole('button',{name:'开始活动',exact:true}).click()
    await admin.getByRole('dialog',{name:'确认操作',exact:true}).getByRole('button',{name:'确定',exact:true}).click()
    await admin.getByRole('button',{name:'02 节目应援',exact:true}).click()
    await admin.getByLabel('当前节目',{exact:true}).selectOption('event2026-03')
    await admin.getByRole('button',{name:'设为当前节目',exact:true}).click()
    await screen.goto('/screen?media=overlay&motion=reduced')
    const title=screen.locator('.program-stage-title')
    await expect(title).toHaveAttribute('data-long-title','true')
    await screen.evaluate(()=>document.fonts.ready)
    const box=await title.boundingBox()
    expect(box!.y+box!.height).toBeLessThan(920)
    expect(await title.locator('h2').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
    await fs.mkdir(out,{recursive:true});await screen.screenshot({path:path.join(out,'long-program-text.png')})
    const fonts:any[]=[]
    for(const [id,family] of [['event2026-03','FZZH-FangXianTiS'],['event2026-04','Orbitron'],['event2026-08','Welcome Stage Serif']]){
      if(id !== 'event2026-03') {
        await admin.getByLabel('当前节目',{exact:true}).selectOption(id!)
        await admin.getByRole('button',{name:'设为当前节目',exact:true}).click()
      }
      await expect(title).toHaveAttribute('data-program-id',id!)
      await screen.evaluate(()=>document.fonts.ready)
      const cdp=await sc.newCDPSession(screen)
      await cdp.send('DOM.enable');await cdp.send('CSS.enable')
      const {root}=await cdp.send('DOM.getDocument')
      const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.program-stage-title h2'})
      const used=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts
      expect(used.some(f=>f.isCustomFont&&f.familyName.includes(family!))).toBe(true)
      fonts.push({id,fonts:used});await cdp.detach()
    }
    await fs.writeFile(path.join(out,'title-fonts-and-limits.json'),JSON.stringify({maxTitle:120,maxPerformers:240,box,fonts},null,2))
  } finally {await Promise.allSettled([ac.close(),sc.close()])}
})
