import type { BrowserContext } from '@playwright/test'

import {
  activateParticipant,
  expectMinimumControlSize,
  expectNoViewportOverflow,
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

test('cleans the invitation token and restores one participant across mobile devices and refreshes', async ({
  browser,
  demo,
}) => {
  let firstContext: BrowserContext | null = null
  let secondContext: BrowserContext | null = null
  let tokenProbeContext: BrowserContext | null = null
  try {
    tokenProbeContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 393, height: 873 },
      hasTouch: true,
      isMobile: true,
    })
    const tokenProbePage = await tokenProbeContext.newPage()
    await openInvitation(tokenProbePage, demo, demo.credentials.participants[1])
    expect(new URL(tokenProbePage.url()).searchParams.has('token')).toBe(false)
    await tokenProbeContext.close()
    tokenProbeContext = null

    firstContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 393, height: 873 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'reduce',
    })
    const firstPage = await firstContext.newPage()
    await openFallbackActivation(firstPage, demo)

    const nameInput = firstPage.getByLabel('虚构姓名')
    const codeInput = firstPage.getByLabel('合成学号')
    const submitButton = firstPage.getByRole('button', { name: '进入现场' })
    await expectMinimumControlSize(
      firstPage.locator(
        '#display-name, #student-number, button[type="submit"]',
      ),
    )
    await nameInput.fill(demo.credentials.participant.displayName)
    await codeInput.fill(demo.credentials.participant.studentNumber)
    await nameInput.focus()
    await firstPage.keyboard.press('Tab')
    await expect(codeInput).toBeFocused()
    await firstPage.keyboard.press('Tab')
    await expect(submitButton).toBeFocused()
    const focusOutlineVisible = await submitButton.evaluate((element) => {
      const style = getComputedStyle(element)
      return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
    })
    expect(focusOutlineVisible).toBe(true)
    await submitButton.click()
    await expect(
      firstPage.getByRole('heading', { name: /欢迎.*进入智工星河/ }),
    ).toBeVisible()
    const startJourney = firstPage.getByRole('button', { name: '启动星程' })
    await expectMinimumControlSize(startJourney)
    await startJourney.click()
    await expect(
      firstPage.getByRole('heading', { name: '选择你的恒星色温' }),
    ).toBeVisible()
    await expectMinimumControlSize(
      firstPage.getByRole('slider', { name: '恒星色温' }),
    )
    await selectStarTemperature(firstPage, 7350)
    await expect(firstPage.getByRole('button', { name: '退出' })).toBeVisible()
    await expect(firstPage.getByText('实时同步', { exact: true })).toBeVisible()

    const capsuleMessage = `胶囊-${crypto.randomUUID()}`
    await firstPage.getByLabel('时光胶囊留言').fill(capsuleMessage)
    const noticeCheckbox = firstPage.getByRole('checkbox', {
      name: /人工筛选候选池/u,
    })
    const saveButton = firstPage.getByRole('button', { name: '提交时光胶囊' })
    await expect(saveButton).toBeDisabled()
    await noticeCheckbox.check()
    await expect(saveButton).toBeEnabled()
    const saveResponsePromise = firstPage.waitForResponse(
      (response) =>
        response.request().method() === 'PUT'
        && new URL(response.url()).pathname === '/api/participant/capsule-message',
      { timeout: 10_000 },
    )
    await saveButton.click()
    expect((await saveResponsePromise).status()).toBe(200)
    await expect(firstPage.getByText('时光胶囊已提交，现已进入人工筛选候选池。')).toBeVisible()
    await expect(firstPage.locator('.value-grid')).toContainText('40 / 100')
    const firstStarId = await firstPage
      .locator('.participant-bar > div > span')
      .innerText()

    await firstPage.reload()
    await expect(firstPage.getByRole('button', { name: '退出' })).toBeVisible()
    expect(new URL(firstPage.url()).searchParams.has('token')).toBe(false)
    expect(
      (await firstPage.getByLabel('时光胶囊留言').inputValue()) ===
        capsuleMessage,
    ).toBe(true)
    await expect(
      firstPage.getByRole('checkbox', { name: /人工筛选候选池/u }),
    ).toBeChecked()
    const mobileOverflow = await firstPage.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(mobileOverflow).toBeLessThanOrEqual(1)

    secondContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 430, height: 932 },
      hasTouch: true,
      isMobile: true,
    })
    const secondPage = await secondContext.newPage()
    await activateParticipant(secondPage, demo)
    expect(
      (await secondPage.locator('.participant-bar > div > span').innerText()) ===
        firstStarId,
    ).toBe(true)
    expect(
      (await secondPage.getByLabel('时光胶囊留言').inputValue()) ===
        capsuleMessage,
    ).toBe(true)
    await expect(secondPage.locator('.value-grid')).toContainText('40 / 100')
    await secondPage.getByRole('button', { name: '档案' }).click()
    await expect(secondPage.locator('.archive-card')).toContainText('7,350 K')
    expect(new URL(secondPage.url()).searchParams.has('token')).toBe(false)
  } finally {
    await tokenProbeContext?.close()
    await secondContext?.close()
    await firstContext?.close()
  }
})

test('moves the selected star into the capsule without page scrolling', async ({
  browser,
  demo,
}) => {
  let context: BrowserContext | null = null
  let checkpoint = 'entry'
  try {
    context = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'no-preference',
    })
    const page = await context.newPage()
    await openInvitation(page, demo)
    await expect(
      page.getByRole('heading', { name: /欢迎.*进入智工星河/ }),
    ).toBeVisible()
    await page.getByRole('button', { name: '启动星程' }).click()

    checkpoint = 'temperature'
    await page.getByRole('slider', { name: '恒星色温' }).evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = '7350'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.getByRole('button', { name: '确认星色 · 进入星辰' }).click()
    await expect(
      page.getByRole('heading', { name: '你的星辰正在进入轨道' }),
    ).toBeVisible()
    await expectMinimumControlSize(
      page.getByRole('button', { name: '跳过过场' }),
    )
    await page.getByRole('button', { name: '跳过过场' }).click()

    // A short visual viewport models the space left above a mobile soft keyboard.
    // Secondary telemetry may collapse, but the current task must remain reachable.
    checkpoint = 'compact-mode'
    await page.setViewportSize({ width: 390, height: 560 })
    await expect(page.locator('.portal')).toHaveClass(/portal--compact/u)
    await expect(page.locator('.participant-bar')).toBeHidden()
    await expect(page.locator('.value-grid')).toBeHidden()
    await expect(page.locator('.scene-canvas')).toBeHidden()

    checkpoint = 'capsule-controls'
    const submitButton = page.getByRole('button', { name: '提交时光胶囊' })
    await page.getByLabel('时光胶囊留言').fill('写给此刻，也写给共同抵达的我们。')
    await expect(submitButton).toBeDisabled()
    await page.getByRole('checkbox', { name: /人工筛选候选池/u }).check()
    await expect(submitButton).toBeEnabled()
    await expectMinimumControlSize(submitButton)

    checkpoint = 'compact-viewport'
    const viewport = await page.evaluate(() => {
      const submit = [...document.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('提交时光胶囊'),
      )
      const box = submit?.getBoundingClientRect()
      return {
        widthOverflow: document.documentElement.scrollWidth - window.innerWidth,
        heightOverflow: document.documentElement.scrollHeight - window.innerHeight,
        submitVisible: Boolean(
          box && box.top >= 0 && box.bottom <= window.innerHeight,
        ),
      }
    })
    if (viewport.widthOverflow !== 0) checkpoint = 'compact-width-overflow'
    else if (viewport.heightOverflow !== 0) checkpoint = 'compact-height-overflow'
    else if (!viewport.submitVisible) checkpoint = 'compact-submit-hidden'
    expect(viewport).toEqual({
      widthOverflow: 0,
      heightOverflow: 0,
      submitVisible: true,
    })
  } catch {
    test.info().annotations.push({
      type: 'failure-checkpoint',
      description: checkpoint,
    })
    throw new Error(`Static failure checkpoint: ${checkpoint}`)
  } finally {
    await context?.close()
  }
})

test('keeps the live composer and gift sheet reachable above a short mobile viewport', async ({
  browser,
  demo,
}) => {
  let participantContext: BrowserContext | null = null
  let adminContext: BrowserContext | null = null
  let checkpoint = 'setup'
  try {
    participantContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 390, height: 844 },
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
    await startRehearsal(adminPage)
    await jumpToStage(adminPage, 4)
    await expectStage(participantPage, '节目应援')

    checkpoint = 'short-viewport-focus'
    await participantPage.setViewportSize({ width: 390, height: 420 })
    const composer = participantPage.getByLabel('弹幕内容')
    await composer.focus()
    await expect(participantPage.locator('.portal')).toHaveClass(
      /portal--composer-focused/u,
    )
    await expectNoViewportOverflow(participantPage)
    await expectMinimumControlSize(
      participantPage.locator('.live-dock input, .live-dock button, .check-row'),
    )
    const portraitLayout = await participantPage.evaluate(() => {
      const dock = document.querySelector('.live-dock')?.getBoundingClientRect()
      return {
        dockVisible: Boolean(
          dock && dock.top >= 0 && dock.bottom <= window.innerHeight,
        ),
        activeInput: document.activeElement?.id === 'barrage-text',
      }
    })
    expect(portraitLayout).toEqual({ dockVisible: true, activeInput: true })

    checkpoint = 'gift-sheet-focus'
    const giftTrigger = participantPage.getByRole('button', { name: '礼物' })
    await giftTrigger.click()
    checkpoint = 'gift-sheet-visible'
    const giftDialog = participantPage.getByRole('dialog', {
      name: '选择一束星光',
    })
    await expect(giftDialog).toBeVisible()
    checkpoint = 'gift-sheet-initial-focus'
    await expect(
      participantPage.getByRole('button', { name: '关闭礼物面板' }).last(),
    ).toBeFocused()
    await participantPage.keyboard.press('Shift+Tab')
    await expect(giftDialog.getByRole('button').last()).toBeFocused()
    await participantPage.keyboard.press('Tab')
    await expect(
      participantPage.getByRole('button', { name: '关闭礼物面板' }).last(),
    ).toBeFocused()
    checkpoint = 'gift-sheet-control-size'
    await expectMinimumControlSize(giftDialog.getByRole('button'))
    checkpoint = 'gift-sheet-bounds'
    await expect
      .poll(() =>
        giftDialog.evaluate((element) => {
          const box = element.getBoundingClientRect()
          return box.top >= 0 && box.bottom <= window.innerHeight
        }),
      )
      .toBe(true)
    checkpoint = 'gift-sheet-escape'
    await participantPage.keyboard.press('Escape')
    await expect(giftDialog).toHaveCount(0)
    checkpoint = 'gift-sheet-return-focus'
    await expect(giftTrigger).toBeFocused()

    checkpoint = 'small-phone-viewport'
    await participantPage.setViewportSize({ width: 375, height: 667 })
    await composer.focus()
    await expectNoViewportOverflow(participantPage)
    await expectMinimumControlSize(
      participantPage.locator('.live-dock input, .live-dock button'),
    )

    checkpoint = 'enlarged-text-viewport'
    await participantPage.setViewportSize({ width: 390, height: 420 })
    await participantPage.evaluate(() => {
      document.documentElement.style.fontSize = '20px'
    })
    await composer.focus()
    await expectNoViewportOverflow(participantPage)
    const enlargedDockVisible = await participantPage
      .locator('.live-dock')
      .evaluate((element) => {
        const box = element.getBoundingClientRect()
        return box.top >= 0 && box.bottom <= window.innerHeight
      })
    expect(enlargedDockVisible).toBe(true)

    checkpoint = 'landscape-viewport'
    await participantPage.evaluate(() => {
      document.documentElement.style.fontSize = ''
    })
    await participantPage.setViewportSize({ width: 667, height: 375 })
    await composer.focus()
    await expectNoViewportOverflow(participantPage)
    const landscapeDockVisible = await participantPage
      .locator('.live-dock')
      .evaluate((element) => {
        const box = element.getBoundingClientRect()
        return box.top >= 0 && box.bottom <= window.innerHeight
      })
    expect(landscapeDockVisible).toBe(true)
  } catch {
    test.info().annotations.push({
      type: 'failure-checkpoint',
      description: checkpoint,
    })
    throw new Error(`Static failure checkpoint: ${checkpoint}`)
  } finally {
    await participantContext?.close()
    await adminContext?.close()
  }
})
