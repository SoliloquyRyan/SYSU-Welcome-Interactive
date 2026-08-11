import type { BrowserContext } from '@playwright/test'

import {
  acceptNextDialog,
  activateParticipant,
  grantAllRoles,
  jumpToStage,
  loginAdmin,
  startRehearsal,
} from './support/demo-actions.js'
import { expect, test } from './support/test.js'

function epochFrom(text: string): number {
  const match = text.match(/\bE(\d+)\b/u)
  if (!match) throw new Error('Public runtime footer omitted its reset epoch')
  return Number(match[1])
}

function revisionFrom(text: string): number {
  const match = text.match(/\bR(\d+)\b/u)
  if (!match) throw new Error('Admin runtime strip omitted its stage revision')
  return Number(match[1])
}

test('locks offline writes, recovers one database after restart, safely retries a lost response, and converges after reset', async ({
  browser,
  demo,
}) => {
  let checkpoint = 'create-contexts'
  let participantContext: BrowserContext | null = null
  let adminContext: BrowserContext | null = null
  let staleAdminContext: BrowserContext | null = null
  let screenContext: BrowserContext | null = null
  try {
    participantContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 393, height: 873 },
      hasTouch: true,
      isMobile: true,
    })
    adminContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 1440, height: 1000 },
    })
    staleAdminContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 1280, height: 900 },
    })
    screenContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 1920, height: 1080 },
    })
    const participantPage = await participantContext.newPage()
    const adminPage = await adminContext.newPage()
    const staleAdminPage = await staleAdminContext.newPage()
    const screenPage = await screenContext.newPage()

    checkpoint = 'prepare-stage-4'
    await activateParticipant(participantPage, demo)
    await loginAdmin(adminPage, demo)
    await loginAdmin(staleAdminPage, demo)
    await grantAllRoles(adminPage)
    await startRehearsal(adminPage)
    await jumpToStage(adminPage, 4)
    await adminPage.getByLabel('当前节目').selectOption('program-001')
    await adminPage.getByRole('button', { name: '设为当前' }).click()
    await participantPage.getByRole('button', { name: '星程', exact: true }).click()
    await participantPage.getByRole('button', { name: '礼物' }).click()
    await participantPage.getByRole('button', { name: '微光 · 5' }).click()
    await expect(participantPage.locator('.value-grid')).toContainText('95')

    checkpoint = 'open-screen'
    await screenPage.goto(new URL('/screen', demo.baseURL).toString())
    await expect(screenPage.getByText('热度 5', { exact: true })).toBeVisible()

    checkpoint = 'offline-locks'
    await Promise.all([
      participantContext.setOffline(true),
      screenContext.setOffline(true),
    ])
    await expect(
      participantPage.getByText('设备离线', { exact: true }),
    ).toBeVisible()
    await expect(
      participantPage.getByRole('button', { name: '礼物' }),
    ).toBeDisabled()
    await expect(screenPage.locator('.safe-banner')).toContainText(
      '实时连接中断',
    )
    await expect(screenPage.getByText('热度 5', { exact: true })).toBeVisible()

    checkpoint = 'online-recovery'
    await Promise.all([
      participantContext.setOffline(false),
      screenContext.setOffline(false),
    ])
    await expect(
      participantPage.getByText('实时同步', { exact: true }),
    ).toBeVisible()
    await expect(screenPage.getByText('实时', { exact: true })).toBeVisible()
    await expect(screenPage.locator('.safe-banner')).toHaveCount(0)
    await expect(participantPage.locator('.value-grid')).toContainText('95')

    checkpoint = 'backend-restart-disconnect'
    const restart = demo.restartBackend()
    await expect(screenPage.locator('.safe-banner')).toContainText(
      '实时连接中断',
    )
    await restart
    await expect(screenPage.getByText('实时', { exact: true })).toBeVisible()
    await expect(
      participantPage.getByText('实时同步', { exact: true }),
    ).toBeVisible()
    await expect(
      adminPage.getByText('实时同步', { exact: true }),
    ).toBeVisible()
    await expect(participantPage.locator('.value-grid')).toContainText('95')
    await expect(screenPage.getByText('热度 5', { exact: true })).toBeVisible()

    checkpoint = 'lost-response-ready'
    const jumpButton = adminPage.getByRole('button', {
      name: '跳转',
      exact: true,
    })
    await expect(jumpButton).toBeEnabled()
    const beforeRevision = revisionFrom(
      await adminPage.locator('.runtime-strip').innerText(),
    )
    const observedKeys: string[] = []
    let responseDropped = false
    await adminPage.route('**/api/admin/runtime', async (route) => {
      const key = route.request().headers()['idempotency-key']
      if (key) observedKeys.push(key)
      if (!responseDropped) {
        responseDropped = true
        await route.fetch()
        await route.abort('failed')
        return
      }
      await route.continue()
    })
    await adminPage.getByLabel('排练跳转阶段').selectOption('5')
    checkpoint = 'lost-response-first-attempt'
    await jumpButton.click()
    await expect(adminPage.locator('.uncertain-command')).toBeVisible()
    await expect(
      adminPage.getByRole('button', { name: '暂停互动' }),
    ).toBeDisabled()
    checkpoint = 'lost-response-safe-retry'
    await adminPage
      .getByRole('button', { name: '安全重试原操作' })
      .click()
    await expect(adminPage.locator('.uncertain-command')).toHaveCount(0)
    await expect(adminPage.getByText('原操作已安全确认', { exact: false })).toBeVisible()
    expect(observedKeys.length).toBe(2)
    expect(observedKeys[0] === observedKeys[1]).toBe(true)
    checkpoint = 'lost-response-invariants'
    const afterRevision = revisionFrom(
      await adminPage.locator('.runtime-strip').innerText(),
    )
    expect(afterRevision).toBe(beforeRevision + 1)
    await expect(
      screenPage.getByRole('heading', { name: '协同点亮', exact: true }),
    ).toBeVisible()
    await adminPage.unroute('**/api/admin/runtime')

    checkpoint = 'reset-convergence'
    const beforeEpoch = epochFrom(
      await screenPage.locator('.screen-footer').innerText(),
    )
    await acceptNextDialog(adminPage)
    await adminPage.getByRole('button', { name: '重置 Demo' }).click()
    await expect(adminPage.locator('.runtime-strip')).toContainText(
      `E${beforeEpoch + 1}`,
    )
    await expect(screenPage.locator('.screen-footer')).toContainText(
      `E${beforeEpoch + 1}`,
    )
    await expect(screenPage.getByRole('heading', { name: '身份激活' })).toBeVisible()

    checkpoint = 'old-session-rejection'
    const oldParticipantStatus = await participantPage.evaluate(async () => {
      const response = await fetch('/api/participant/snapshot', {
        credentials: 'include',
        cache: 'no-store',
      })
      return response.status
    })
    expect(oldParticipantStatus).toBe(401)
    const oldAdminStatus = await staleAdminPage.evaluate(async () => {
      const response = await fetch('/api/admin/snapshot', {
        credentials: 'include',
        cache: 'no-store',
      })
      return response.status
    })
    expect(oldAdminStatus).toBe(401)
    checkpoint = 'post-reset-entry'
    await participantPage.reload()
    await expect(
      participantPage.getByRole('heading', {
        name: '请重新轻触邀请函或扫描二维码',
      }),
    ).toBeVisible()
    expect(new URL(participantPage.url()).searchParams.has('token')).toBe(false)

    checkpoint = 'post-reset-reactivation'
    await activateParticipant(participantPage, demo)
    await expect(participantPage.locator('.value-grid')).toContainText('100')
    await expect(participantPage.locator('.value-grid')).toContainText('20 / 100')
    await expect(screenPage.locator('.activation-scene .hero-number')).toHaveText('1')
    expect(new URL(participantPage.url()).searchParams.has('token')).toBe(false)
  } catch {
    test.info().annotations.push({
      type: 'failure-checkpoint',
      description: checkpoint,
    })
    throw new Error(`Static checkpoint failed: ${checkpoint}`)
  } finally {
    await screenContext?.close()
    await staleAdminContext?.close()
    await adminContext?.close()
    await participantContext?.close()
  }
})
