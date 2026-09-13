import { expect, test } from './support/v2-test.js'

test('previews a stable show catalog and keeps interludes separate from program gifts after restart', async ({ browser, demo }, testInfo) => {
  let checkpoint = 'login-and-import-validation'
  const adminContext = await browser.newContext({ baseURL: demo.baseURL })
  const otherContext = await browser.newContext({ baseURL: demo.baseURL })
  const phoneContext = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const admin = await adminContext.newPage()
  const other = await otherContext.newPage()
  const phone = await phoneContext.newPage()
  const errors: string[] = []
  for (const page of [admin, other, phone]) page.on('pageerror', (error) => errors.push(error.message))
  admin.on('dialog', (dialog) => { void dialog.accept() })
  try {
    await admin.goto('/admin')
    await admin.getByLabel('账号', { exact: true }).fill(demo.credentials.admin.username)
    await admin.getByLabel('密码', { exact: true }).fill(demo.credentials.admin.password)
    await admin.getByRole('button', { name: '登录', exact: true }).click()
    const panel = admin.locator('.catalog-panel')
    await expect(panel.getByRole('button', { name: '载入本场节目单' })).toBeEnabled()
    await panel.locator('.catalog-import summary').click()
    await panel.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"label":"invalid","items":[]}') })
    await expect(panel.getByRole('alert')).toContainText('1–64 项')
    checkpoint = 'preview-and-reorder'
    await panel.getByRole('button', { name: '载入本场节目单' }).click()
    await expect(panel.locator('.editor-list li')).toHaveCount(25)
    await expect(panel.getByLabel('第 21 项类型', { exact: true })).toHaveValue('INTERLUDE')
    // Trusted LAN HTTP may not expose randomUUID; reuse the existing fallback.
    await admin.evaluate(() => { Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }) })
    await panel.getByRole('button', { name: '添加一项', exact: true }).click()
    await expect(panel.locator('.editor-list li')).toHaveCount(26)
    await panel.getByRole('button', { name: '移出第 26 项', exact: true }).click()
    await expect(panel.locator('.editor-list li')).toHaveCount(25)
    await panel.getByRole('button', { name: '取消预览' }).click()
    await expect(panel.locator('.catalog-overview summary')).toContainText('3 项')
    await panel.getByRole('button', { name: '载入本场节目单' }).click()
    await panel.getByLabel('第 1 项名称', { exact: true }).fill('lovesik girls（彩排）')
    await panel.getByLabel('第 1 项表演者', { exact: true }).fill('彩排甲、彩排乙')
    await panel.getByRole('button', { name: '下移第 1 项', exact: true }).click()
    await expect(panel.getByLabel('第 2 项名称', { exact: true })).toHaveValue('lovesik girls（彩排）')
    await expect(panel.getByLabel('第 2 项表演者', { exact: true })).toHaveValue('彩排甲、彩排乙')
    checkpoint = 'apply-preset'
    await panel.getByRole('button', { name: '确认应用 25 项', exact: true }).click()
    await expect(panel.locator('.catalog-editor')).toHaveCount(0)
    await expect(panel.locator('.catalog-overview summary')).toContainText('25 项')

    checkpoint = 'concurrent-editor-conflict'
    await other.goto('/admin')
    await other.getByLabel('账号', { exact: true }).fill(demo.credentials.admin.username)
    await other.getByLabel('密码', { exact: true }).fill(demo.credentials.admin.password)
    await other.getByRole('button', { name: '登录', exact: true }).click()
    await other.getByRole('button', { name: '编辑当前目录' }).click()
    await panel.getByRole('button', { name: '编辑当前目录' }).click()
    await panel.getByLabel('第 2 项名称', { exact: true }).fill('lovesik girls')
    await panel.getByRole('button', { name: '确认应用 25 项', exact: true }).click()
    await expect(other.getByRole('alert')).toContainText('此预览已过期')
    await expect(other.getByRole('button', { name: '确认应用 25 项' })).toBeDisabled()

    checkpoint = 'participant-gift'
    await phone.goto(`/welcome?token=${encodeURIComponent(demo.credentials.participants[0].inviteToken)}`)
    await phone.getByRole('button', { name: '确认星色', exact: true }).click()
    checkpoint = 'start-and-select-program'
    await admin.getByRole('button', { name: '开始活动', exact: true }).click()
    await admin.getByRole('dialog').getByRole('button',{name:'确定',exact:true}).click()
    await admin.getByRole('button', { name: '02 节目应援', exact: true }).click()
    await expect(panel.getByRole('button', { name: '编辑当前目录' })).toHaveCount(0)
    await expect(panel.locator('.catalog-editor')).toHaveCount(0)
    await panel.getByLabel('当前节目', { exact: true }).selectOption('event2026-01')
    await panel.getByRole('button', { name: '设为当前节目', exact: true }).click()
    await expect(phone.locator('#view-title')).toContainText('lovesik girls')
    await expect(phone.getByText('彩排甲、彩排乙', { exact: true })).toBeVisible()
    checkpoint = 'send-first-gift'
    await phone.getByRole('button', { name: /送礼物/ }).click()
    await phone.locator('.gift-grid button').first().click()
    await phone.getByRole('dialog').getByRole('button',{name:/发送/}).click()
    // D-071: every gift deducts its face value, including the first 1-point gift.
    await expect(phone.getByRole('button', { name: '送礼物', exact: true })).toContainText('余额 99')
    await expect(phone.getByRole('dialog')).toHaveCount(0)
    checkpoint = 'interlude-gift-block'
    await panel.getByLabel('当前节目', { exact: true }).selectOption('event2026-07')
    await panel.getByRole('button', { name: '设为当前节目', exact: true }).click()
    await expect(phone.getByRole('heading', { name: '互动环节一 · 歌名 decoder', exact: true })).toBeVisible()
    await expect(phone.locator('#view-title')).toContainText('互动环节一')
    await expect(phone.getByRole('button', { name: '送礼物', exact:true })).toHaveCount(0)
    await panel.getByLabel('当前节目', { exact: true }).selectOption('event2026-21')
    await panel.getByRole('button', { name: '设为当前节目', exact: true }).click()
    await expect(panel.locator('.interlude-notice')).toContainText('互动环节三')
    await phone.getByRole('button', { name: '节目单', exact: true }).click()
    await expect(phone.locator('.program-list li')).toHaveCount(25)
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
      await phone.setViewportSize(viewport)
      expect(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
    }
    checkpoint = 'restart-persistence'
    await demo.restartBackend()
    await phone.reload()
    await expect(phone.locator('#view-title')).toContainText('互动环节三')
    await admin.reload()
    await expect(admin.locator('.program-cues')).toContainText('节目颁奖')
    await expect(admin.locator('.catalog-overview summary')).toContainText('25 项')
    expect(errors).toEqual([])
  } catch (error) {
    testInfo.annotations.push({ type: 'failure-checkpoint', description: checkpoint })
    throw error
  } finally {
    await phoneContext.close()
    await otherContext.close()
    await adminContext.close()
  }
})
