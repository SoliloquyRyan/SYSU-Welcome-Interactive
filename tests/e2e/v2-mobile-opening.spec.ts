import fs from 'node:fs/promises'
import path from 'node:path'
import {test,expect} from './support/v2-test.js'

test('crossfades the retained phone galaxy into the preloaded city and settles after refresh',async({browser,demo},info)=>{
  const ac=await browser.newContext({baseURL:demo.baseURL}),pc=await browser.newContext({baseURL:demo.baseURL,viewport:{width:390,height:844}})
  const admin=await ac.newPage(),phone=await pc.newPage(),out=path.resolve('output/playwright/d108/mobile-opening',info.project.name)
  await fs.mkdir(out,{recursive:true})
  try{
    await admin.goto('/admin');await admin.getByLabel('账号',{exact:true}).fill(demo.credentials.admin.username);await admin.getByLabel('密码',{exact:true}).fill(demo.credentials.admin.password);await admin.getByRole('button',{name:'登录',exact:true}).click()
    await phone.goto('/welcome?token='+encodeURIComponent(demo.credentials.participants[0].inviteToken))
    await phone.getByRole('button',{name:'确认星色',exact:true}).click()
    await expect(phone.locator('.is-preloaded-background .city-panorama')).toHaveCount(1)
    await expect(phone.locator('.v2-welcome')).not.toHaveClass(/is-color-confirming|is-orbit-handoff/)
    await admin.getByRole('button',{name:'开始活动',exact:true}).click();await admin.getByRole('dialog').getByRole('button',{name:'确定',exact:true}).click()
    await expect(phone.getByRole('button',{name:'启动我的星',exact:true})).toBeVisible()
    await admin.getByRole('button',{name:'02 节目应援',exact:true}).click()
    await expect(phone.locator('.v2-welcome')).toHaveAttribute('data-program-opening','playing')
    await expect(phone.locator('.is-opening-galaxy')).toHaveCount(1)
    await expect(phone.locator('.is-opening-city')).toHaveCount(1)
    await phone.waitForTimeout(850)
    const opacity=await phone.locator('.is-opening-galaxy').evaluate(el=>Number(getComputedStyle(el).opacity))
    expect(opacity).toBeGreaterThan(0);expect(opacity).toBeLessThan(1)
    await phone.screenshot({path:path.join(out,'mid-transition.png')})
    await expect(phone.locator('.v2-welcome')).toHaveAttribute('data-program-opening','settled')
    await expect(phone.locator('.is-preloaded-background')).toHaveCount(0)
    await phone.reload();await expect(phone.locator('.v2-welcome')).toHaveAttribute('data-program-opening','settled')
    await expect(phone.locator('.is-opening-galaxy')).toHaveCount(0)
    await phone.screenshot({path:path.join(out,'settled.png')})
  }finally{await Promise.allSettled([ac.close(),pc.close()])}
})
