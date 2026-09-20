import fs from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {test,expect,type Page} from '@playwright/test'
import {startProtectedEventStack} from './fixtures/protected-event-stack.js'
import {V2AdminCommandSchema} from '../../packages/contracts/src/protocol-v2.js'

test('D119 mobile archive, full-width chat, stage privacy and unified controls',async({browser})=>{
  test.setTimeout(240000)
  const stack=await startProtectedEventStack(), errors:string[]=[]
  const ctx=await browser.newContext(), admin=await ctx.newPage(), screen=await ctx.newPage(), phone=await ctx.newPage()
  ctx.setDefaultTimeout(15000)
  for(const p of [admin,screen,phone])p.on('pageerror',e=>errors.push(e.message))
  const snap=async()=> (await admin.request.get(stack.baseURL+'/api/v2/admin/snapshot')).json()
  const command=async(command:string,extra:Record<string,unknown>={})=>{
    const s=await snap(), schema=V2AdminCommandSchema.options.find(x=>x.shape.command.value===command)!
    const all:Record<string,unknown>={protocolVersion:'2',resetEpoch:s.resetEpoch,idempotencyKey:randomUUID(),command,expectedRunRevision:s.runtime.runRevision,expectedStageRevision:s.stage.revision,expectedInteractionRevision:s.interaction.interactionRevision,expectedPresentationRevision:s.presentationRevision,expectedCatalogRevision:s.programCatalog.revision,confirmed:true,overrideReadinessWarnings:true,...extra}
    const r=await admin.request.post(stack.baseURL+'/api/v2/admin/commands',{headers:{Origin:stack.baseURL},data:Object.fromEntries(Object.entries(all).filter(([k])=>Object.hasOwn(schema.shape,k)))})
    expect(r.status(),command+' '+await r.text()).toBe(200)
  }
  const reachable=async(p:Page,selector:string)=>{
    const el=p.locator(selector);await el.scrollIntoViewIfNeeded();await expect(el).toBeVisible()
    const b=(await el.boundingBox())!, v=p.viewportSize()!
    expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(v.width+1)
    expect(b.y).toBeGreaterThanOrEqual(0);expect(b.y+b.height).toBeLessThanOrEqual(v.height+1)
  }
  try{
    await fs.mkdir('output/playwright/d119',{recursive:true})
    await admin.setViewportSize({width:960,height:900});await admin.goto(stack.baseURL+'/admin')
    await admin.getByLabel('账号',{exact:true}).fill(stack.credentials.username);await admin.getByLabel('密码',{exact:true}).fill(stack.credentials.password);await admin.getByRole('button',{name:'登录',exact:true}).click();await expect(admin.getByText('实时已连接',{exact:true})).toBeVisible()
    await admin.getByRole('button',{name:'载入本场节目单'}).click();await admin.getByRole('button',{name:'确认应用 25 项'}).click()
    const dialog=admin.locator('.action-dialog[open]');if(await dialog.isVisible())await dialog.getByRole('button',{name:'确定',exact:true}).click()
    await expect.poll(async()=>(await snap()).programs.length).toBe(25)
    await command('SET_MODE',{targetMode:'LIVE'});await command('START')
    await screen.setViewportSize({width:1920,height:1080});await screen.goto(stack.baseURL+'/screen')
    await expect(screen.locator('.screen-arrival-count')).toBeVisible()
    await phone.setViewportSize({width:390,height:844});await phone.goto(stack.baseURL+'/welcome')
    await phone.getByRole('button',{name:'游客参与',exact:true}).click();await phone.getByLabel('昵称',{exact:true}).fill('合成验收游客')
    await Promise.all([expect(phone.getByTestId('personal-entry-meteor')).toBeVisible(),expect(screen.locator('.screen-arrival-meteor')).toBeVisible(),phone.getByRole('button',{name:'确认星色并进入'}).click()])
    await expect(phone.getByTestId('personal-entry-meteor')).toHaveCount(0)
    await command('SET_PROGRAM',{programId:'event2026-01'})
    await expect(screen.locator('.screen-arrival-count')).toHaveCount(0)
    await expect(phone.getByRole('button',{name:'核验学生身份'})).toHaveCount(0)
    for(const v of [{width:390,height:844},{width:375,height:667},{width:320,height:568},{width:390,height:420}]){
      await phone.setViewportSize(v)
      await expect(phone.locator('.program-composer')).toBeVisible()
      const b=(await phone.locator('.program-composer').boundingBox())!;expect(b.width).toBeGreaterThan(v.width*.8)
      expect(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await phone.getByRole('button',{name:'档案',exact:true}).click();await phone.getByRole('button',{name:'核验学生身份',exact:true}).click()
      await phone.getByLabel('姓名',{exact:true}).fill(stack.records[0]!.displayName);await phone.getByLabel('8 位学号',{exact:true}).fill('11111111')
      await reachable(phone,'[data-testid="student-verification-submit"]');await phone.getByTestId('student-verification-submit').click()
      await expect(phone.locator('[role="alert"]')).toBeVisible();await reachable(phone,'.entry-switch')
      await phone.screenshot({path:`output/playwright/d119/verification-${v.width}-${v.height}.png`})
      await phone.getByRole('button',{name:'返回档案',exact:true}).click();await phone.getByRole('button',{name:'星程',exact:true}).click()
    }
    await phone.setViewportSize({width:390,height:844})
    await phone.locator('.program-composer input[type="text"]').fill('合成弹幕验收')
    await phone.getByRole('button',{name:'发送弹幕',exact:true}).click();await expect(phone.locator('.program-composer input[type="text"]')).toHaveValue('')
    await phone.screenshot({path:'output/playwright/d119/chat.png'})
    await phone.getByRole('button',{name:'档案',exact:true}).click();await phone.getByRole('button',{name:'核验学生身份',exact:true}).click()
    await phone.getByLabel('姓名',{exact:true}).fill(stack.records[0]!.displayName);await phone.getByLabel('8 位学号',{exact:true}).fill(stack.records[0]!.studentNumber);await phone.getByTestId('student-verification-submit').click()
    await expect.poll(async()=> (await(await phone.request.get(stack.baseURL+'/api/v2/participant/snapshot')).json()).participant.accountType).toBe('STUDENT')
    await command('SET_STAGE_MODE',{mode:'HOST'});await screen.reload();await expect(screen.locator('.screen-arrival-count')).toHaveCount(0)
    await command('SET_PROGRAM',{programId:'event2026-07'});await admin.getByRole('button',{name:'互动',exact:true}).click()
    for(const v of [{width:960,height:900},{width:800,height:700},{width:390,height:844}]){
      await admin.setViewportSize(v);await expect(admin.getByRole('button',{name:'报幕／主题背景',exact:true})).toHaveCount(1)
      await reachable(admin,'.interaction-stage-actions button:first-child');await reachable(admin,'.interaction-operation .control-actions button:last-child')
      const buttons=await admin.locator('.interaction-tab button').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().height));expect(buttons.every(h=>h>=44)).toBe(true)
      await admin.screenshot({path:`output/playwright/d119/admin-${v.width}.png`})
    }
    await admin.getByRole('button',{name:'报幕／主题背景',exact:true}).click();await expect.poll(async()=>(await snap()).stage.mode).toBe('HOST')
    await admin.getByLabel('待执行节目',{exact:true}).selectOption('event2026-08');await admin.getByRole('button',{name:'执行选中项',exact:true}).click();await expect.poll(async()=>(await snap()).currentProgram.id).toBe('event2026-08')
    await command('SET_PROGRAM',{programId:'ceremony-campus-awards'})
    const award=(await snap()).awards.find((a:any)=>a.id==='points-top20')
    await command('SAVE_AWARD',{awardId:award.id,group:award.group,title:award.title,expectedAwardRevision:award.revision,entries:Array.from({length:20},(_,i)=>({name:'合成获奖者'+(i+1),detail:'不得公开的班级备注'+i})),confirmed:true})
    await command('SELECT_AWARD',{awardId:'points-top20'});await expect(screen.locator('.award-winners li')).toHaveCount(0)
    await command('REVEAL_AWARD');await expect(screen.locator('.award-winners li')).toHaveCount(8);await expect(screen.locator('body')).toContainText('合成获奖者1');await expect(screen.locator('body')).not.toContainText('不得公开')
    const publicData=await(await screen.request.get(stack.baseURL+'/api/v2/screen/snapshot')).text();expect(publicData).not.toContain('不得公开')
    await command('SET_AWARD_PAGE',{page:2});await screen.reload();await expect(screen.locator('.award-winners li')).toHaveCount(4);await expect(screen.locator('body')).toContainText('合成获奖者20')
    await screen.screenshot({path:'output/playwright/d119/award.png'});expect(errors).toEqual([])
  }finally{await ctx.close();await stack.stop()}
})
