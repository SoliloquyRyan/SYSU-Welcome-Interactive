import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {test,expect,type Page} from '@playwright/test'
import {startProtectedEventStack} from './fixtures/protected-event-stack.js'
import {V2AdminCommandSchema} from '../../packages/contracts/src/protocol-v2.js'


test.describe('D-109 half-screen and one-form admission',()=>{
  test.setTimeout(240000)
  let stack:Awaited<ReturnType<typeof startProtectedEventStack>>
  test.beforeEach(async()=>{stack=await startProtectedEventStack()})
  test.afterEach(async()=>{await stack?.stop()})
  async function adminLogin(page:Page){await page.goto(stack.baseURL+'/admin');await page.getByLabel('账号',{exact:true}).fill(stack.credentials.username);await page.getByLabel('密码',{exact:true}).fill(stack.credentials.password);await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByText('实时已连接',{exact:true})).toBeVisible()}
  async function snapshot(page:Page){return (await page.request.get(stack.baseURL+'/api/v2/admin/snapshot')).json()}
  async function control(page:Page,command:string,extra:Record<string,unknown>={},status=200){
    const s=await snapshot(page), schema=V2AdminCommandSchema.options.find(s=>s.shape.command.value===command)!
    const all:Record<string,unknown>={protocolVersion:'2',resetEpoch:s.resetEpoch,idempotencyKey:randomUUID(),command,
      expectedRunRevision:s.runtime.runRevision,expectedInteractionRevision:s.interaction.interactionRevision,
      expectedPresentationRevision:s.presentationRevision,expectedStageRevision:s.stage.revision,expectedCatalogRevision:s.programCatalog.revision,confirmed:true,overrideReadinessWarnings:true,...extra}
    const body=Object.fromEntries(Object.entries(all).filter(([k])=>Object.hasOwn(schema.shape,k)))
    const r=await page.request.post(stack.baseURL+'/api/v2/admin/commands',{headers:{Origin:stack.baseURL},data:body})
    expect(r.status(),command).toBe(status);return r.json()
  }
  async function fits(page:Page){
    const result=await page.evaluate(()=>({scroll:document.documentElement.scrollHeight,height:innerHeight,
      clipped:Array.from(document.querySelectorAll<HTMLElement>('.v2-admin button')).filter(e=>e.getClientRects().length&&!e.closest('dialog:not([open])')&&!e.closest('.editor-list')).filter(e=>{const r=e.getBoundingClientRect();return r.bottom>innerHeight+1||r.top<0||r.right>innerWidth+1}).map(e=>e.textContent?.trim())}))
    expect(result.scroll).toBeLessThanOrEqual(result.height);expect(result.clipped).toEqual([])
  }
  test('keeps controls reachable at both half-screen sizes and walks all 25 stable items',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await adminLogin(page)
    await page.getByRole('button',{name:'载入本场节目单'}).click()
    await page.getByRole('button',{name:'确认应用 25 项'}).click()
    const confirm=page.locator('.action-dialog[open]'); if(await confirm.isVisible())await confirm.getByRole('button',{name:'确定',exact:true}).click()
    await expect.poll(async()=> (await snapshot(page)).programs.length).toBe(25)
    const out=path.resolve('output/playwright/d109',info.project.name);await fs.mkdir(out,{recursive:true})
    for(const viewport of [{width:960,height:900},{width:800,height:700}]){
      await page.setViewportSize(viewport)
      for(const name of ['节目','互动','颁奖','弹幕','管理']){await page.getByRole('button',{name,exact:true}).click();await fits(page)}
      await expect(page.locator('.account-counts>div')).toHaveCount(3);await expect(page.locator('.account-counts')).toContainText('游客');await page.getByRole('button',{name:'节目',exact:true}).click();await page.screenshot({path:path.join(out,`admin-${viewport.width}.png`)})
    }
    await page.getByRole('button',{name:'编辑当前目录',exact:true}).click();await expect(page.getByRole('button',{name:'确认应用 25 项'})).toBeVisible();await fits(page);await page.getByRole('button',{name:'取消预览'}).click()
    expect(await page.locator('iframe').count()).toBe(0)
    const admittedPhone=await page.context().newPage();await admittedPhone.goto(stack.baseURL+'/welcome');await admittedPhone.getByRole('button',{name:'游客参与',exact:true}).click();await admittedPhone.getByLabel('昵称',{exact:true}).fill('轮次恢复合成来宾');await admittedPhone.getByRole('button',{name:'确认星色并进入',exact:true}).click();await expect(admittedPhone.getByRole('button',{name:'核验学生身份'})).toBeVisible()
    await control(page,'SET_MODE',{targetMode:'LIVE'});await control(page,'START');await control(page,'ADVANCE')
    const items=(await snapshot(page)).programs;expect(items).toHaveLength(25);expect(items.filter((i:any)=>i.kind==='PERFORMANCE')).toHaveLength(19)
    expect(items.find((i:any)=>i.id==='event2026-03').performers).toBe('王奇琦')
    for(const item of items){
      await control(page,'SET_PROGRAM',{programId:item.id})
      await expect(page.locator('.fixed-cue h2')).toHaveText(item.title)
      await control(page,'SET_STAGE_MODE',{mode:'HOST'});await expect(page.locator('.fixed-cue')).toContainText('报幕／主题背景')
      if(item.kind==='PERFORMANCE'||item.kind==='INTERLUDE')await control(page,'SET_STAGE_MODE',{mode:'PROGRAM'})
      if(item.displayCode==='A'){
        await page.getByRole('button',{name:'互动',exact:true}).click();await control(page,'OPEN_BUZZER',{segmentCode:'A',prompt:'合成抢答'});await fits(page)
        await control(page,'SET_PROGRAM',{programId:items[0].id},409);await control(page,'CLOSE_LIVE_INTERACTION')
      }
      if(item.displayCode==='B'){
        await page.getByRole('button',{name:'互动',exact:true}).click();await page.getByLabel('选手人数',{exact:true}).fill('12');await fits(page)
        await control(page,'OPEN_AUDIENCE_VOTE',{prompt:'合成投票',candidates:Array.from({length:12},(_,i)=>`${i+1}号选手`)})
        await control(page,'REVEAL_AUDIENCE_VOTE');await control(page,'CLOSE_LIVE_INTERACTION')
      }
      if(item.displayCode==='C'){await control(page,'OPEN_BUZZER',{segmentCode:'C',prompt:'不允许的命令'},409);await expect(page.getByRole('button',{name:'开始抢答',exact:true})).toHaveCount(0)}
      if(item.kind==='AWARD'){await page.getByRole('button',{name:'颁奖',exact:true}).click();await fits(page)}
      if(item.kind==='SPEECH')expect(item.durationLabel).toContain('8')
    }
    await control(page,'COMPLETE');await expect(page.getByRole('button',{name:'归档并重置本轮'})).toBeEnabled()
    await page.getByRole('button',{name:'归档并重置本轮'}).click();await page.locator('.action-dialog textarea').fill('重新开场');await page.locator('.action-dialog').getByRole('button',{name:'确定',exact:true}).click()
    await expect.poll(async()=> (await snapshot(page)).resetEpoch).toBe(2);expect((await snapshot(page)).runtime.status).toBe('READY');await fits(page)
    await expect(admittedPhone.getByLabel('姓名',{exact:true})).toBeVisible();await expect(admittedPhone.getByRole('button',{name:'核验学生身份'})).toHaveCount(0);await admittedPhone.getByLabel('姓名',{exact:true}).fill(stack.records[0]!.displayName);await admittedPhone.getByLabel('8 位学号',{exact:true}).fill(stack.records[0]!.studentNumber);await admittedPhone.getByRole('button',{name:'确认星色并进入',exact:true}).click();await expect(admittedPhone.getByText('你的星色，已为今晚点亮')).toBeVisible();expect((await(await admittedPhone.request.get(stack.baseURL+'/api/v2/participant/snapshot')).json()).resetEpoch).toBe(2);await admittedPhone.close()
    await page.screenshot({path:path.join(out,'admin-reset.png')});expect(errors).toEqual([])
  })
  test('retries a definitively stale reset with the latest revision and archives only once',async({page})=>{
    await adminLogin(page)
    let changed=false
    await page.route('**/api/v2/admin/commands',async route=>{
      if(route.request().postDataJSON()?.command==='RESET_FORMAL_ROUND'&&!changed){
        changed=true;await control(page,'SET_MODE',{targetMode:'LIVE'})
      }
      await route.continue()
    })
    const confirmReset=async()=>{await page.getByRole('button',{name:'归档并重置本轮'}).click();await page.locator('.action-dialog textarea').fill('重新开场');await page.locator('.action-dialog').getByRole('button',{name:'确定',exact:true}).click()}
    await confirmReset();await expect(page.locator('.console-footer')).toContainText('状态已经更新')
    expect((await snapshot(page)).resetEpoch).toBe(1)
    await confirmReset();await expect.poll(async()=>(await snapshot(page)).resetEpoch).toBe(2)
    const after=await snapshot(page);expect(after.roundArchives).toHaveLength(1);expect(after.runtime.mode).toBe('LIVE')
  })
  test('atomically admits a guest, restores its browser identity and switches to a student without merging',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:390,height:844});await page.goto(stack.baseURL+'/welcome')
    await expect(page.getByRole('button',{name:'确认星色并进入'})).toBeVisible();await expect(page.getByLabel('8 位学号',{exact:true})).toBeVisible();expect(await page.locator('.personal-journey-stage').count()).toBe(0)
    await page.getByRole('button',{name:'游客参与',exact:true}).click();await page.getByLabel('昵称',{exact:true}).fill('合成来宾');await page.locator('#entry-star-color').fill('9000')
    await page.getByRole('button',{name:'确认星色并进入'}).click();await expect(page.getByTestId('personal-entry-meteor')).toBeVisible()
    const own=await (await page.request.get(stack.baseURL+'/api/v2/participant/snapshot')).json();expect(own.participant.accountType).toBe('GUEST');expect(own.participant.powerBalance).toBe(100)
    await expect(page.getByTestId('personal-entry-meteor')).toHaveCount(0);await page.reload();await expect(page.getByRole('button',{name:'核验学生身份'})).toBeVisible();expect(await page.getByTestId('personal-entry-meteor').count()).toBe(0)
    const restored=await(await page.request.get(stack.baseURL+'/api/v2/participant/snapshot')).json();expect(restored.participantStreamId).toBe(own.participantStreamId)
    await page.getByRole('button',{name:'核验学生身份'}).click();await page.getByLabel('姓名',{exact:true}).fill(stack.records[0]!.displayName);await page.getByLabel('8 位学号',{exact:true}).fill('11111111');await page.getByRole('button',{name:'确认星色并进入'}).click();await expect(page.getByLabel('8 位学号',{exact:true})).toHaveValue('11111111')
    await page.getByLabel('8 位学号',{exact:true}).fill(stack.records[0]!.studentNumber);await page.getByRole('button',{name:'确认星色并进入'}).click();await expect(page.getByRole('button',{name:'核验学生身份'})).toHaveCount(0)
    const student=await(await page.request.get(stack.baseURL+'/api/v2/participant/snapshot')).json();expect(student.participant.accountType).toBe('STUDENT');expect(student.participantStreamId).not.toBe(own.participantStreamId);expect(student.participant.powerBalance).toBe(100)
    await expect(page.getByRole('button',{name:'退出登录'})).toHaveCount(0)
    const out=path.resolve('output/playwright/d109',info.project.name);await fs.mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,'phone-personal.png')});expect(errors).toEqual([])
  })
  test('keeps the one-form entry usable on a small screen, uses Noto and settles reduced motion',async({page},info)=>{
    await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:320,height:568});await page.goto(stack.baseURL+'/welcome')
    const submit=page.getByRole('button',{name:'确认星色并进入',exact:true})
    for(const item of [page.getByLabel('姓名',{exact:true}),page.getByLabel('8 位学号',{exact:true}),page.locator('#entry-star-color'),submit]){
      await item.scrollIntoViewIfNeeded();const box=await item.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(await item.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit)})).toBe(true)
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.evaluate(()=>document.fonts.ready)
    const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.entry-form-heading strong'})
    const fonts=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;expect(fonts.some(f=>f.isCustomFont&&f.familyName==='Welcome Sans SC')).toBe(true);await cdp.detach()
    await page.getByLabel('姓名',{exact:true}).fill(stack.records[0]!.displayName);await page.setViewportSize({width:320,height:360});await page.getByLabel('8 位学号',{exact:true}).fill(stack.records[0]!.studentNumber);await page.locator('#entry-star-color').fill('12000');await submit.click()
    await expect(page.getByText('你的星色，已为今晚点亮')).toBeVisible();await expect(page.getByTestId('personal-entry-meteor')).toHaveCount(0)
    const out=path.resolve('output/playwright/d109',info.project.name);await fs.mkdir(out,{recursive:true});await page.setViewportSize({width:320,height:568});await page.screenshot({path:path.join(out,'phone-small-reduced.png')});await fs.writeFile(path.join(out,'phone-fonts.json'),JSON.stringify(fonts,null,2))
  })

})
