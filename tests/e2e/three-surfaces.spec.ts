import type { BrowserContext } from '@playwright/test'

import {
  acceptNextDialog,
  activateParticipant,
  expectNoForbiddenDomText,
  expectNoViewportOverflow,
  expectStage,
  grantAllRoles,
  jumpToStage,
  loginAdmin,
  startRehearsal,
} from './support/demo-actions.js'
import { expect, test } from './support/test.js'

async function hasVisibleInfiniteAnimation(
  page: import('@playwright/test').Page,
): Promise<boolean> {
  return page.evaluate(() => {
    const hasInfiniteIteration = (style: CSSStyleDeclaration): boolean => {
      const names = style.animationName.split(',').map((name) => name.trim())
      const iterations = style.animationIterationCount
        .split(',')
        .map((count) => count.trim())
      return names.some(
        (name, index) =>
          name !== 'none' &&
          (iterations[index] ?? iterations[iterations.length - 1]) === 'infinite',
      )
    }

    return Array.from(document.querySelectorAll<HTMLElement>('body *')).some(
      (element) => {
        const style = getComputedStyle(element)
        const visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) !== 0 &&
          element.getClientRects().length > 0
        if (!visible) return false
        return [
          style,
          getComputedStyle(element, '::before'),
          getComputedStyle(element, '::after'),
        ].some(hasInfiniteIteration)
      },
    )
  })
}

test('completes six stages across welcome, admin, and screen with privacy and moderation intact', async ({
  browser,
  demo,
}) => {
  let checkpoint = 'create-contexts'
  let participantContext: BrowserContext | null = null
  let adminContext: BrowserContext | null = null
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
    screenContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 1920, height: 1080 },
      reducedMotion: 'reduce',
    })
    const participantPage = await participantContext.newPage()
    const adminPage = await adminContext.newPage()
    const screenPage = await screenContext.newPage()

    checkpoint = 'open-surfaces'
    await screenPage.goto(new URL('/screen', demo.baseURL).toString())
    await expect(screenPage.getByRole('heading', { name: '身份激活' })).toBeVisible()
    await expect(screenPage.getByText('减少动态效果', { exact: true })).toBeVisible()
    await activateParticipant(participantPage, demo)

    checkpoint = 'save-private-message'
    const privateMessage = `私密-${crypto.randomUUID()}`
    await participantPage.getByLabel('私密未来寄语').fill(privateMessage)
    await participantPage.getByRole('button', { name: '保存私密寄语' }).click()
    await expect(participantPage.locator('.value-grid')).toContainText('40 / 100')

    checkpoint = 'admin-start-rehearsal'
    await loginAdmin(adminPage, demo)
    await grantAllRoles(adminPage)
    await expectNoForbiddenDomText(
      [adminPage, screenPage],
      [
        privateMessage,
        demo.credentials.participant.displayName,
        demo.credentials.participant.demoCode,
        demo.credentials.participant.inviteToken,
      ],
    )
    await startRehearsal(adminPage)

    checkpoint = 'stage-2'
    await jumpToStage(adminPage, 2)
    await expectStage(participantPage, '未来寄语')
    await expectStage(screenPage, '未来寄语')
    await expectNoForbiddenDomText([adminPage, screenPage], [privateMessage])

    checkpoint = 'stage-3'
    await jumpToStage(adminPage, 3)
    await expectStage(participantPage, '星星集结')
    await participantPage.getByRole('button', { name: '启动我的星星' }).click()
    await expect(participantPage.locator('.value-grid .starlight')).toHaveText(
      '60 / 100',
    )
    await expect(
      participantPage.getByRole('button', { name: '星星已启动' }),
    ).toBeDisabled()
    await expect(screenPage.locator('#screen-title')).toHaveText('星星集结')
    await expect(screenPage.locator('#star-title')).toBeVisible()
    await expect(screenPage.getByText('1 / 1', { exact: true })).toBeVisible()
    expect(await hasVisibleInfiniteAnimation(screenPage)).toBe(false)

    checkpoint = 'stage-4-gift'
    await jumpToStage(adminPage, 4)
    await expectStage(participantPage, '节目应援')
    await expectStage(screenPage, '节目应援')
    await adminPage.getByLabel('当前节目').selectOption('program-001')
    await adminPage.getByRole('button', { name: '设为当前' }).click()
    await participantPage.getByRole('button', { name: '节目', exact: true }).click()
    await participantPage.getByRole('button', { name: '微光 · 5' }).click()
    await expect(participantPage.locator('.value-grid .power')).toHaveText('95')
    await expect(participantPage.locator('.value-grid .starlight')).toHaveText(
      '70 / 100',
    )
    await expect(screenPage.getByText('热度 5', { exact: true })).toBeVisible()
    await expect(screenPage.locator('.gift-feed')).toContainText('+5')

    checkpoint = 'stage-4-rejected-barrage'
    const rejectedBarrage = `www.invalid-${crypto.randomUUID().slice(0, 8)}.example`
    await participantPage.getByLabel('弹幕内容').fill(rejectedBarrage)
    await participantPage
      .getByText('我知道这条内容会以匿名形式公开出现在现场大屏。')
      .click()
    await participantPage.getByRole('button', { name: '匿名发送' }).click()
    await expect(participantPage.getByRole('alert')).toBeVisible()
    await expect(participantPage.locator('.value-grid .starlight')).toHaveText(
      '70 / 100',
    )
    await expectNoForbiddenDomText([adminPage, screenPage], [rejectedBarrage])

    checkpoint = 'stage-4-publish-and-moderate'
    const publishedBarrage = `合规-${crypto.randomUUID().slice(0, 8)}`
    await participantPage.getByLabel('弹幕内容').fill(publishedBarrage)
    await participantPage.getByRole('button', { name: '匿名发送' }).click()
    await expect(participantPage.locator('.value-grid .starlight')).toHaveText(
      '80 / 100',
    )
    await expect(
      screenPage.locator('.barrage-board li').filter({ hasText: publishedBarrage }),
    ).toBeVisible()
    const publishedRow = adminPage
      .locator('.moderation-list li')
      .filter({ hasText: publishedBarrage })
    await expect(publishedRow).toBeVisible()
    await publishedRow.getByRole('button', { name: '下屏' }).click()
    await expect(screenPage.locator('.barrage-board')).not.toContainText(
      publishedBarrage,
    )

    checkpoint = 'stage-4-pause-and-resume'
    await adminPage.getByRole('button', { name: '暂停新弹幕' }).click()
    await expect(
      adminPage.getByRole('button', { name: '恢复新弹幕' }),
    ).toBeVisible()
    await expect(screenPage.getByText('暂停接收', { exact: true })).toBeVisible()
    await expect(
      participantPage.getByRole('button', { name: '弹幕已暂停' }),
    ).toBeDisabled()
    await adminPage.getByRole('button', { name: '恢复新弹幕' }).click()
    await expect(
      adminPage.getByRole('button', { name: '暂停新弹幕' }),
    ).toBeVisible()
    await expect(screenPage.getByText('暂停接收', { exact: true })).toHaveCount(0)
    await expect(
      participantPage.getByRole('button', { name: '匿名发送' }),
    ).toBeEnabled()

    checkpoint = 'stage-4-emergency-clear'
    const resumedBarrage = `恢复-${crypto.randomUUID().slice(0, 8)}`
    await participantPage.getByLabel('弹幕内容').fill(resumedBarrage)
    await participantPage.getByRole('button', { name: '匿名发送' }).click()
    await expect(
      screenPage.locator('.barrage-board li').filter({ hasText: resumedBarrage }),
    ).toBeVisible()
    await acceptNextDialog(adminPage)
    await adminPage.getByRole('button', { name: '紧急清屏' }).click()
    await expect(screenPage.locator('.barrage-board')).not.toContainText(
      resumedBarrage,
    )
    await expect(adminPage.locator('.moderation-list')).toHaveCount(0)

    // The content limiter uses a real ten-second rolling window. Waiting for
    // its public contract keeps the following source-block evidence distinct.
    checkpoint = 'stage-4-block-source'
    await participantPage.waitForTimeout(10_500)
    checkpoint = 'stage-4-block-source-submit'
    const blockedBarrage = `来源-${crypto.randomUUID().slice(0, 8)}`
    await participantPage.getByLabel('弹幕内容').fill(blockedBarrage)
    const blockedResponsePromise = participantPage.waitForResponse(
      (response) =>
        response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/participant/barrages',
    )
    await participantPage.getByRole('button', { name: '匿名发送' }).click()
    const blockedResponse = await blockedResponsePromise
    if (!blockedResponse.ok()) {
      const responseBody = (await blockedResponse.json().catch(() => null)) as {
        error?: { code?: unknown }
      } | null
      const safeCode = responseBody?.error?.code
      checkpoint = safeCode === 'STALE_STAGE'
        ? 'stage-4-block-source-submit-stale-stage'
        : safeCode === 'RATE_LIMITED'
          ? 'stage-4-block-source-submit-rate-limited'
          : 'stage-4-block-source-submit-other-rejection'
      throw new Error('Static response category: barrage submission rejected')
    }
    const blockedRow = adminPage
      .locator('.moderation-list li')
      .filter({ hasText: blockedBarrage })
    checkpoint = 'stage-4-block-source-admin-visible'
    try {
      await expect(blockedRow).toBeVisible()
    } catch {
      const participantAlertVisible = await participantPage
        .getByRole('alert')
        .isVisible()
      const screenRowVisible = await screenPage
        .locator('.barrage-board li')
        .filter({ hasText: blockedBarrage })
        .isVisible()
      checkpoint = participantAlertVisible
        ? 'stage-4-block-source-participant-alert'
        : screenRowVisible
          ? 'stage-4-block-source-admin-stale'
          : 'stage-4-block-source-not-propagated'
      throw new Error(`Static propagation category: ${checkpoint}`)
    }
    checkpoint = 'stage-4-block-source-command'
    await acceptNextDialog(adminPage)
    await blockedRow.getByRole('button', { name: '屏蔽来源' }).click()
    checkpoint = 'stage-4-block-source-screen-hidden'
    await expect(screenPage.locator('.barrage-board')).not.toContainText(
      blockedBarrage,
    )
    checkpoint = 'stage-4-block-source-retry'
    const blockedRetry = `屏蔽后-${crypto.randomUUID().slice(0, 8)}`
    await participantPage.getByLabel('弹幕内容').fill(blockedRetry)
    await participantPage.getByRole('button', { name: '匿名发送' }).click()
    await expect(participantPage.getByRole('alert')).toContainText(
      '当前入口已暂停发送公开弹幕',
    )
    checkpoint = 'stage-4-block-source-invariants'
    await expect(participantPage.locator('.value-grid .starlight')).toHaveText(
      '80 / 100',
    )
    await expectNoForbiddenDomText([adminPage, screenPage], [blockedRetry])
    await expectNoViewportOverflow(screenPage)

    checkpoint = 'stage-5'
    await jumpToStage(adminPage, 5)
    await participantPage.getByRole('button', { name: '现场', exact: true }).click()
    await expectStage(participantPage, '协同点亮')
    await participantPage.getByRole('button', { name: '参与全场点亮' }).click()
    await expect(participantPage.locator('.value-grid .starlight')).toHaveText(
      '100 / 100',
    )
    await expect(
      participantPage.getByRole('button', { name: '点亮已完成' }),
    ).toBeDisabled()
    await expect(screenPage.getByText('100%', { exact: true })).toBeVisible()
    await expect(screenPage.getByText('1 / 1 位有效参与者已点亮')).toBeVisible()

    checkpoint = 'stage-6'
    await jumpToStage(adminPage, 6)
    await expectStage(participantPage, '星际档案')
    await expectStage(screenPage, '星际档案')
    await participantPage.getByRole('button', { name: '查看个人档案' }).click()
    await expect(participantPage.getByRole('heading', { name: '个人星际档案' })).toBeVisible()
    const archive = participantPage.locator('.archive-card')
    await expect(archive).toContainText('动力值95')
    await expect(archive).toContainText('星光值100 / 100')
    await expect(archive).toContainText('互动次数6')
    await expect(archive).toContainText('礼物次数1')
    await expect(archive).toContainText('公开弹幕3')
    await expect(archive).toContainText(privateMessage)
    const collective = screenPage.locator('.archive-metrics')
    await expect(collective).toContainText('激活人数1')
    await expect(collective).toContainText('星光总量100')
    await expect(collective).toContainText('互动次数6')
    await expect(collective).toContainText('完成点亮1')
    expect(await hasVisibleInfiniteAnimation(screenPage)).toBe(false)
    await expectNoForbiddenDomText(
      [adminPage, screenPage],
      [
        privateMessage,
        demo.credentials.participant.displayName,
        demo.credentials.participant.demoCode,
        demo.credentials.participant.inviteToken,
      ],
    )
    await expectNoViewportOverflow(screenPage)
  } catch {
    test.info().annotations.push({
      type: 'failure-checkpoint',
      description: checkpoint,
    })
    throw new Error(`Static checkpoint failed: ${checkpoint}`)
  } finally {
    await screenContext?.close()
    await adminContext?.close()
    await participantContext?.close()
  }
})
