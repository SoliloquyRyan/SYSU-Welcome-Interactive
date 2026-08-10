import type { BrowserContext, Page } from '@playwright/test'

import {
  acceptNextDialog,
  activateParticipant,
  grantAllRoles,
  loginAdmin,
} from './support/demo-actions.js'
import { expect, test } from './support/test.js'

interface Signal {
  promise: Promise<void>
  resolve(): void
}

function signal(): Signal {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function waitForSignal(
  pending: Promise<void>,
  description: string,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${description} did not arrive in time`)),
          10_000,
        )
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function settleBrowserDelivery(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
  await page.waitForTimeout(100)
}

async function watchForPrivateParticipantDom(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.documentElement
    root.dataset.privateStateReappeared = 'false'
    const observer = new MutationObserver(() => {
      if (
        document.querySelector(
          '.participant-bar, #future-message, .archive-card',
        )
      ) {
        root.dataset.privateStateReappeared = 'true'
      }
    })
    observer.observe(root, { childList: true, subtree: true })
    window.setTimeout(() => observer.disconnect(), 2_000)
  })
}

test('does not restore participant private state when an old snapshot arrives after logout', async ({
  browser,
  demo,
}) => {
  let participantContext: BrowserContext | null = null
  let peerContext: BrowserContext | null = null
  const releaseOldSnapshot = signal()
  const snapshotReturned = signal()
  const snapshotDelivered = signal()
  try {
    participantContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 393, height: 873 },
      hasTouch: true,
      isMobile: true,
    })
    peerContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 430, height: 932 },
      hasTouch: true,
      isMobile: true,
    })
    const participantPage = await participantContext.newPage()
    const peerPage = await peerContext.newPage()
    await activateParticipant(participantPage, demo)
    await activateParticipant(peerPage, demo)

    let interceptNextSnapshot = true
    await participantPage.route(
      '**/api/participant/snapshot',
      async (route) => {
        if (!interceptNextSnapshot) {
          await route.continue()
          return
        }
        interceptNextSnapshot = false
        const response = await route.fetch()
        snapshotReturned.resolve()
        await releaseOldSnapshot.promise
        await route.fulfill({ response })
        snapshotDelivered.resolve()
      },
    )

    await peerPage
      .getByLabel('私密未来寄语')
      .fill(`race-${crypto.randomUUID()}`)
    await peerPage
      .getByRole('button', { name: '保存私密寄语' })
      .click()
    await waitForSignal(snapshotReturned.promise, 'participant snapshot')

    await participantPage.getByRole('button', { name: '退出' }).click()
    await expect(
      participantPage.getByRole('heading', {
        name: '请重新轻触邀请函或扫描二维码',
      }),
    ).toBeVisible()
    await watchForPrivateParticipantDom(participantPage)

    releaseOldSnapshot.resolve()
    await waitForSignal(snapshotDelivered.promise, 'delayed participant snapshot')
    await settleBrowserDelivery(participantPage)

    await expect(
      participantPage.getByRole('heading', {
        name: '请重新轻触邀请函或扫描二维码',
      }),
    ).toBeVisible()
    await expect(participantPage.locator('.participant-bar')).toHaveCount(0)
    await expect(participantPage.locator('#future-message')).toHaveCount(0)
    expect(
      await participantPage
        .locator('html')
        .getAttribute('data-private-state-reappeared'),
    ).toBe('false')
  } finally {
    releaseOldSnapshot.resolve()
    await peerContext?.close()
    await participantContext?.close()
  }
})

test('replays a gated admin connection after logout and fast login', async ({
  browser,
  demo,
}) => {
  let adminContext: BrowserContext | null = null
  const releaseOldSnapshot = signal()
  const snapshotReturned = signal()
  const snapshotDelivered = signal()
  try {
    adminContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 1440, height: 1000 },
    })
    const adminPage = await adminContext.newPage()
    await loginAdmin(adminPage, demo)

    let interceptNextSnapshot = true
    await adminPage.route('**/api/admin/snapshot', async (route) => {
      if (!interceptNextSnapshot) {
        await route.continue()
        return
      }
      interceptNextSnapshot = false
      const response = await route.fetch()
      snapshotReturned.resolve()
      await releaseOldSnapshot.promise
      await route.fulfill({ response })
      snapshotDelivered.resolve()
    })

    await adminContext.setOffline(true)
    await expect(adminPage.getByText('离线', { exact: true })).toBeVisible()
    await adminContext.setOffline(false)
    await waitForSignal(snapshotReturned.promise, 'admin resync snapshot')

    await adminPage.getByRole('button', { name: '退出' }).click()
    await expect(
      adminPage.getByRole('heading', { name: '登录控制台' }),
    ).toBeVisible()
    await adminPage
      .getByLabel('共用账号')
      .fill(demo.credentials.admin.username)
    await adminPage.getByLabel('密码').fill(demo.credentials.admin.password)
    await adminPage
      .getByRole('button', { name: '登录', exact: true })
      .click()
    await expect(
      adminPage.getByRole('heading', { name: '当前能力' }),
    ).toBeVisible()

    releaseOldSnapshot.resolve()
    await waitForSignal(snapshotDelivered.promise, 'delayed admin snapshot')
    await expect(adminPage.getByText('实时同步', { exact: true })).toBeVisible()

    const allRole = adminPage
      .locator('.role-row')
      .filter({ hasText: '全部能力' })
    const acquireRole = allRole.getByRole('button', { name: '取得权限' })
    await expect(acquireRole).toBeEnabled()
    await acquireRole.click()
    await expect(allRole.getByText('已取得', { exact: true })).toBeVisible()
  } finally {
    releaseOldSnapshot.resolve()
    await adminContext?.close()
  }
})

test('clears participant private DOM when an external reset expires the session', async ({
  browser,
  demo,
}) => {
  let participantContext: BrowserContext | null = null
  let adminContext: BrowserContext | null = null
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
    const participantPage = await participantContext.newPage()
    const adminPage = await adminContext.newPage()
    await activateParticipant(participantPage, demo)
    await loginAdmin(adminPage, demo)
    await grantAllRoles(adminPage)
    await expect(participantPage.locator('.participant-bar')).toBeVisible()

    await acceptNextDialog(adminPage)
    await adminPage.getByRole('button', { name: '重置 Demo' }).click()

    await expect(
      participantPage.getByRole('heading', {
        name: '请重新轻触邀请函或扫描二维码',
      }),
    ).toBeVisible()
    await expect(participantPage.locator('.participant-bar')).toHaveCount(0)
    await expect(participantPage.locator('#future-message')).toHaveCount(0)
    await expect(
      participantPage.getByRole('button', { name: '退出' }),
    ).toHaveCount(0)
  } finally {
    await adminContext?.close()
    await participantContext?.close()
  }
})
