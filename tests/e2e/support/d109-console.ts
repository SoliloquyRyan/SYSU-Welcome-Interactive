import {expect,type Page} from '@playwright/test'
export async function adminSnapshot(page:Page){return (await page.request.get(new URL('/api/v2/admin/snapshot',page.url()).href)).json()}
export async function prepareProgram(page:Page,id:string){
 await page.getByRole('button',{name:'节目',exact:true}).click()
 const nav=page.getByRole('navigation',{name:'节目分页'}),card=page.locator(`.rundown-item[data-program-id="${id}"]`)
 while(await nav.getByRole('button',{name:'上一页',exact:true}).isEnabled())await nav.getByRole('button',{name:'上一页',exact:true}).click()
 for(let i=0;i<16&&await card.count()===0;i++)await nav.getByRole('button',{name:'下一页',exact:true}).click()
 await card.click();await expect(card).toHaveAttribute('aria-pressed','true')
}
export async function executePrepared(page:Page){
 const before=await adminSnapshot(page);if(!before.currentProgram&&await page.getByRole('button',{name:'执行选中项',exact:true}).isDisabled())await prepareProgram(page,before.programs[0].id)
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v2/admin/commands'&&r.request().method()==='POST')
 await page.getByRole('button',{name:'执行选中项',exact:true}).click();expect((await response).ok()).toBe(true)
 const s=await adminSnapshot(page)
 await expect.poll(async()=> (await adminSnapshot(page)).currentProgram?.id).toBe(s.currentProgram?.id)
 const tab=s.currentProgram?.kind==='INTERLUDE'?'互动':['AWARD','SPEECH'].includes(s.currentProgram?.kind)?'颁奖':'节目'
 await page.getByRole('button',{name:tab,exact:true}).click()
}
export async function selectProgram(page:Page,id:string){await prepareProgram(page,id);const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v2/admin/commands'&&r.request().method()==='POST');await executePrepared(page);expect((await wait).ok()).toBe(true);await expect.poll(async()=> (await adminSnapshot(page)).currentProgram?.id).toBe(id)}
export async function waitRuntime(page:Page,status:string,scene?:string){
 const statuses:Record<string,string>={'待开始':'READY','运行中':'RUNNING','已暂停':'PAUSED','已完成':'COMPLETED'}
 const scenes:Record<string,string|null>={'尚未开始':null,'01 星海集结':'ASSEMBLY','02 节目应援':'PROGRAM_SUPPORT','03 谢幕准备':'COOPERATIVE_LIGHT'}
 if(status in statuses)await expect.poll(async()=> (await adminSnapshot(page)).runtime.status).toBe(statuses[status])
 const target=scene??status;if(target in scenes)await expect.poll(async()=> (await adminSnapshot(page)).runtime.currentScene).toBe(scenes[target])
}
