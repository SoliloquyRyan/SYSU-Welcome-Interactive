import type { BrowserContext, Page } from '@playwright/test'

import {
  activateParticipant,
  expectNoForbiddenDomText,
  expectStage,
  grantAllRoles,
  jumpToStage,
  loginAdmin,
  openFallbackActivation,
  openInvitation,
  selectStarTemperature,
  startRehearsal,
} from './support/demo-actions.js'
import { expect, test } from './support/test.js'

async function expectPersonalValues(
  page: Page,
  power: number,
  starlight: number,
): Promise<void> {
  await expect(page.locator('.value-grid .power')).toHaveText(String(power))
  await expect(page.locator('.value-grid .starlight')).toHaveText(
    `${starlight} / 100`,
  )
}

async function submitCapsuleMessage(page: Page, message: string): Promise<void> {
  await page.getByLabel('时光胶囊留言').fill(message)
  await page.getByRole('checkbox', { name: /人工筛选候选池/u }).check()
  await page
    .getByRole('button', { name: /^(?:提交|更新)时光胶囊$/u })
    .click()
  await expect(
    page.locator('.inline-message.success[role="status"]'),
  ).toContainText('人工筛选候选池')
}

async function replayParticipantCommand(
  page: Page,
  pathname: string,
): Promise<number> {
  return page.evaluate(async (commandPath) => {
    const snapshotResponse = await fetch('/api/participant/snapshot', {
      cache: 'no-store',
      credentials: 'include',
    })
    if (!snapshotResponse.ok) return snapshotResponse.status
    const snapshot = (await snapshotResponse.json()) as {
      runtime?: { resetEpoch?: unknown; stageRevision?: unknown }
    }
    const response = await fetch(commandPath, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        resetEpoch: snapshot.runtime?.resetEpoch,
        stageRevision: snapshot.runtime?.stageRevision,
      }),
    })
    return response.status
  }, pathname)
}

test('recovers from generic activation failures and safely replays a lost capsule-message response', async ({
  browser,
  demo,
}) => {
  let participantContext: BrowserContext | null = null
  let screenContext: BrowserContext | null = null
  try {
    participantContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 393, height: 873 },
      hasTouch: true,
      isMobile: true,
    })
    screenContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 1920, height: 1080 },
    })
    const participantPage = await participantContext.newPage()
    const screenPage = await screenContext.newPage()
    const credential = demo.credentials.participant
    const genericFailure = '核验未通过，请确认姓名和合成学号后重试。'

    await openFallbackActivation(participantPage, demo)
    await participantPage
      .getByLabel('虚构姓名')
      .fill(`${credential.displayName}（错误）`)
    await participantPage.getByLabel('合成学号').fill(credential.studentNumber)
    await participantPage.getByRole('button', { name: '进入现场' }).click()
    await expect(participantPage.getByRole('alert')).toHaveText(genericFailure)

    const wrongCode = '99999999'
    await participantPage.getByLabel('虚构姓名').fill(credential.displayName)
    await participantPage.getByLabel('合成学号').fill(wrongCode)
    await participantPage.getByRole('button', { name: '进入现场' }).click()
    await expect(participantPage.getByRole('alert')).toHaveText(genericFailure)

    await participantPage.getByLabel('合成学号').fill(credential.studentNumber)
    await participantPage.getByRole('button', { name: '进入现场' }).click()
    await selectStarTemperature(participantPage, 6500)
    await expect(participantPage.getByRole('button', { name: '退出' })).toBeVisible()
    await expectPersonalValues(participantPage, 100, 20)

    const cookieFlags = (
      await participantContext.cookies(demo.baseURL)
    ).map((cookie) => ({
      hasOpaqueValue: cookie.value.length > 0,
      httpOnly: cookie.httpOnly,
      loopbackDevelopmentCookie: !cookie.secure,
      sameSiteLax: cookie.sameSite === 'Lax',
      rootPath: cookie.path === '/',
    }))
    expect(
      cookieFlags.length === 1 &&
        cookieFlags.every(
          (cookie) =>
            cookie.hasOpaqueValue &&
            cookie.httpOnly &&
            cookie.loopbackDevelopmentCookie &&
            cookie.sameSiteLax &&
            cookie.rootPath,
        ),
    ).toBe(true)

    const firstMessage = `胶囊重试-${crypto.randomUUID().slice(0, 8)}`
    let firstKey: string | null = null
    let observedRequestCount = 0
    let reusedOriginalKey = true
    let responseDropped = false
    await participantPage.route(
      '**/api/participant/capsule-message',
      async (route) => {
        const key = route.request().headers()['idempotency-key']
        observedRequestCount += 1
        if (!key) reusedOriginalKey = false
        else if (firstKey === null) firstKey = key
        else reusedOriginalKey = reusedOriginalKey && key === firstKey

        if (!responseDropped) {
          responseDropped = true
          await route.fetch()
          await route.abort('failed')
          return
        }
        await route.continue()
      },
    )
    await participantPage.getByLabel('时光胶囊留言').fill(firstMessage)
    await participantPage
      .getByRole('checkbox', { name: /人工筛选候选池/u })
      .check()
    await participantPage
      .getByRole('button', { name: '提交时光胶囊' })
      .click()
    await expect(participantPage.getByRole('alert')).toContainText(
      '本地 Demo 服务暂时不可用',
    )
    await participantPage
      .getByRole('button', { name: /^(?:提交|更新)时光胶囊$/u })
      .click()
    await expect(participantPage.locator('.inline-message.success[role="status"]')).toContainText(
      '人工筛选候选池',
    )
    expect(observedRequestCount === 2 && reusedOriginalKey).toBe(true)
    await expectPersonalValues(participantPage, 100, 40)

    const updatedMessage = `胶囊更新-${crypto.randomUUID().slice(0, 8)}`
    await submitCapsuleMessage(participantPage, updatedMessage)
    await expectPersonalValues(participantPage, 100, 40)
    await participantPage.unroute('**/api/participant/capsule-message')

    await participantPage.getByRole('button', { name: '档案', exact: true }).click()
    await expect(participantPage.locator('.capsule-message')).toContainText(
      updatedMessage,
    )
    await screenPage.goto(new URL('/screen', demo.baseURL).toString())
    await expect(screenPage.locator('#screen-title')).toHaveText('身份激活')
    await expectNoForbiddenDomText(
      [screenPage],
      [
        firstMessage,
        updatedMessage,
        credential.displayName,
        credential.studentNumber,
        credential.inviteToken,
      ],
    )
  } finally {
    await screenContext?.close()
    await participantContext?.close()
  }
})

test('keeps two participants independent across stage locks, four gift tiers, rewards, and final aggregates', async ({
  browser,
  demo,
}) => {
  let participantAContext: BrowserContext | null = null
  let participantBContext: BrowserContext | null = null
  let repeatedAContext: BrowserContext | null = null
  let adminContext: BrowserContext | null = null
  let screenContext: BrowserContext | null = null
  let safeCheckpoint = 'context setup'
  try {
    participantAContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 393, height: 873 },
      hasTouch: true,
      isMobile: true,
    })
    participantBContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 393, height: 873 },
      hasTouch: true,
      isMobile: true,
    })
    repeatedAContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 393, height: 873 },
    })
    adminContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 1440, height: 1000 },
    })
    screenContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 1920, height: 1080 },
    })

    const participantAPage = await participantAContext.newPage()
    const participantBPage = await participantBContext.newPage()
    const repeatedAPage = await repeatedAContext.newPage()
    const adminPage = await adminContext.newPage()
    const screenPage = await screenContext.newPage()
    const [participantA, participantB] = demo.credentials.participants
    const capsuleMessageA = `胶囊甲-${crypto.randomUUID().slice(0, 8)}`
    const capsuleMessageB = `胶囊乙-${crypto.randomUUID().slice(0, 8)}`

    await screenPage.goto(new URL('/screen', demo.baseURL).toString())
    await activateParticipant(participantAPage, demo, participantA)
    await activateParticipant(participantBPage, demo, participantB)
    await activateParticipant(repeatedAPage, demo, participantA)
    safeCheckpoint = 'screen activation aggregate'
    await expect(screenPage.locator('.activation-scene .hero-number')).toHaveText('2')
    safeCheckpoint = 'participant A initial values'
    await expectPersonalValues(participantAPage, 100, 20)
    safeCheckpoint = 'participant B initial values'
    await expectPersonalValues(participantBPage, 100, 20)

    await submitCapsuleMessage(participantAPage, capsuleMessageA)
    await submitCapsuleMessage(participantBPage, capsuleMessageB)
    safeCheckpoint = 'private message rewards'
    await expectPersonalValues(participantAPage, 100, 40)
    await expectPersonalValues(participantBPage, 100, 40)

    await loginAdmin(adminPage, demo)
    await grantAllRoles(adminPage)
    await startRehearsal(adminPage)
    await jumpToStage(adminPage, 4)
    await adminPage.getByLabel('当前节目').selectOption('program-001')
    await adminPage.getByRole('button', { name: '设为当前' }).click()
    safeCheckpoint = 'program current title'
    await expect(screenPage.locator('#program-title')).toHaveText('轨道序章')

    await jumpToStage(adminPage, 3)
    await expectStage(participantAPage, '星星集结')
    await participantAPage.getByRole('button', { name: '节目单', exact: true }).click()
    await expect(participantAPage.getByText('只读', { exact: true })).toBeVisible()
    await expect(
      participantAPage.getByText('下一节目：协同回声', { exact: true }),
    ).toBeVisible()
    await expect(participantAPage.getByRole('button', { name: '礼物' })).toHaveCount(0)
    await expect(participantAPage.getByLabel('弹幕内容')).toHaveCount(0)
    safeCheckpoint = 'non-stage-four read only'

    await participantAPage.getByRole('button', { name: '星程', exact: true }).click()
    await participantAPage.getByRole('button', { name: '启动我的星星' }).click()
    await participantBPage.getByRole('button', { name: '启动我的星星' }).click()
    await expectPersonalValues(participantAPage, 100, 60)
    await expectPersonalValues(participantBPage, 100, 60)
    await expect(
      participantAPage.getByRole('button', { name: '星星已启动' }),
    ).toBeDisabled()
    await expect(
      repeatedAPage.getByRole('button', { name: '星星已启动' }),
    ).toBeDisabled()
    await expect(screenPage.getByText('2 / 2', { exact: true })).toBeVisible()
    safeCheckpoint = 'two independent stars'
    expect(
      await replayParticipantCommand(
        repeatedAPage,
        '/api/participant/star/start',
      ),
    ).toBe(200)
    await expect(screenPage.getByText('2 / 2', { exact: true })).toBeVisible()
    safeCheckpoint = 'duplicate star guard'

    await jumpToStage(adminPage, 4)
    await participantAPage.getByRole('button', { name: '节目单', exact: true }).click()
    await expect(participantAPage.getByText('互动开放', { exact: true })).toBeVisible()
    await expect(
      participantAPage.getByRole('heading', { name: '轨道序章' }),
    ).toBeVisible()
    await expect(
      participantAPage.getByText('下一节目：协同回声', { exact: true }),
    ).toBeVisible()
    await participantAPage.getByRole('button', { name: '星程', exact: true }).click()

    for (const [giftName, expectedPower] of [
      ['微光 · 5', 95],
      ['信标 · 10', 85],
      ['星轨 · 20', 65],
      ['星舰 · 50', 15],
    ] as const) {
      await participantAPage.getByRole('button', { name: '礼物' }).click()
      await participantAPage.getByRole('button', { name: giftName }).click()
      await expectPersonalValues(participantAPage, expectedPower, 70)
    }
    await expect(screenPage.getByText('热度 85', { exact: true })).toBeVisible()
    safeCheckpoint = 'four gift tiers'

    const rejectedBarrage = `https://invalid-${crypto.randomUUID().slice(0, 8)}.example`
    await participantAPage.getByLabel('弹幕内容').fill(rejectedBarrage)
    await participantAPage
      .getByText('我知道这条内容会以匿名形式公开出现在现场大屏。')
      .click()
    await participantAPage.getByRole('button', { name: '匿名发送' }).click()
    await expect(participantAPage.getByRole('alert')).toBeVisible()
    await expectPersonalValues(participantAPage, 15, 70)
    await expectNoForbiddenDomText([screenPage], [rejectedBarrage])
    safeCheckpoint = 'rejected barrage reward guard'

    const publishedBarrage = `并肩启航-${crypto.randomUUID().slice(0, 8)}`
    await participantAPage.getByLabel('弹幕内容').fill(publishedBarrage)
    await participantAPage.getByRole('button', { name: '匿名发送' }).click()
    await expectPersonalValues(participantAPage, 15, 80)
    await expect(
      screenPage.locator('.barrage-board li').filter({ hasText: publishedBarrage }),
    ).toBeVisible()
    safeCheckpoint = 'first published barrage reward'

    await jumpToStage(adminPage, 5)
    await participantAPage.getByRole('button', { name: '星程', exact: true }).click()
    await expectStage(participantAPage, '协同点亮')
    await participantAPage.getByRole('button', { name: '参与全场点亮' }).click()
    await expectPersonalValues(participantAPage, 15, 100)
    await expect(
      participantAPage.getByRole('button', { name: '点亮已完成' }),
    ).toBeDisabled()
    await expect(screenPage.getByText('1 / 2 位有效参与者已点亮')).toBeVisible()
    safeCheckpoint = 'first cooperative light'
    expect(
      await replayParticipantCommand(
        repeatedAPage,
        '/api/participant/cooperative-light',
      ),
    ).toBe(200)
    await expect(screenPage.getByText('1 / 2 位有效参与者已点亮')).toBeVisible()
    safeCheckpoint = 'duplicate cooperative light guard'

    await participantBPage.getByRole('button', { name: '参与全场点亮' }).click()
    await expectPersonalValues(participantBPage, 100, 80)
    await expect(screenPage.getByText('100%', { exact: true })).toBeVisible()
    await expect(screenPage.getByText('2 / 2 位有效参与者已点亮')).toBeVisible()
    safeCheckpoint = 'second cooperative light'

    await jumpToStage(adminPage, 6)
    await expectStage(participantAPage, '星际档案')
    await participantAPage.getByRole('button', { name: '查看个人档案' }).click()
    const archive = participantAPage.locator('.archive-card')
    await expect(archive).toContainText('动力值15')
    await expect(archive).toContainText('星光值100 / 100')
    await expect(archive).toContainText('互动次数7')
    await expect(archive).toContainText('礼物次数4')
    await expect(archive).toContainText('公开弹幕1')
    await expect(archive).toContainText(capsuleMessageA)

    const collective = screenPage.locator('.archive-metrics')
    await expect(collective).toContainText('激活人数2')
    await expect(collective).toContainText('星光总量180')
    await expect(collective).toContainText('互动次数9')
    await expect(collective).toContainText('完成点亮2')
    await expectNoForbiddenDomText(
      [screenPage],
      [
        capsuleMessageA,
        capsuleMessageB,
        participantA.displayName,
        participantA.studentNumber,
        participantA.inviteToken,
        participantB.displayName,
        participantB.studentNumber,
        participantB.inviteToken,
      ],
    )
    safeCheckpoint = 'final private and collective archives'
  } catch {
    throw new Error(`G3 participant evidence failed at ${safeCheckpoint}`)
  } finally {
    await screenContext?.close()
    await adminContext?.close()
    await repeatedAContext?.close()
    await participantBContext?.close()
    await participantAContext?.close()
  }
})
