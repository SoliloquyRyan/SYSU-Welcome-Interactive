import type { BrowserContext } from '@playwright/test'

import {
  activateParticipant,
  expectMinimumControlSize,
  openInvitation,
} from './support/demo-actions.js'
import { expect, test } from './support/test.js'

test('cleans the invitation token and restores one participant across mobile devices and refreshes', async ({
  browser,
  demo,
}) => {
  let firstContext: BrowserContext | null = null
  let secondContext: BrowserContext | null = null
  try {
    firstContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 393, height: 873 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: 'reduce',
    })
    const firstPage = await firstContext.newPage()
    await openInvitation(firstPage, demo)

    const nameInput = firstPage.getByLabel('虚构姓名')
    const codeInput = firstPage.getByLabel('六位 Demo 码')
    const submitButton = firstPage.getByRole('button', { name: '进入现场' })
    await expectMinimumControlSize(
      firstPage.locator(
        '#display-name, #demo-code, button[type="submit"]',
      ),
    )
    await nameInput.fill(demo.credentials.participant.displayName)
    await codeInput.fill(demo.credentials.participant.demoCode)
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
    await expect(firstPage.getByRole('button', { name: '退出' })).toBeVisible()
    await expect(firstPage.getByText('实时同步', { exact: true })).toBeVisible()

    const privateMessage = `私密-${crypto.randomUUID()}`
    await firstPage.getByLabel('私密未来寄语').fill(privateMessage)
    await firstPage.getByRole('button', { name: '保存私密寄语' }).click()
    await expect(firstPage.getByText('私密寄语已保存，仅你本人可在档案中查看。')).toBeVisible()
    await expect(firstPage.locator('.value-grid')).toContainText('40 / 100')
    const firstStarId = await firstPage
      .locator('.participant-bar > div > span')
      .innerText()

    await firstPage.reload()
    await expect(firstPage.getByRole('button', { name: '退出' })).toBeVisible()
    expect(new URL(firstPage.url()).searchParams.has('token')).toBe(false)
    expect(
      (await firstPage.getByLabel('私密未来寄语').inputValue()) ===
        privateMessage,
    ).toBe(true)
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
      (await secondPage.getByLabel('私密未来寄语').inputValue()) ===
        privateMessage,
    ).toBe(true)
    await expect(secondPage.locator('.value-grid')).toContainText('40 / 100')
    expect(new URL(secondPage.url()).searchParams.has('token')).toBe(false)
  } finally {
    await secondContext?.close()
    await firstContext?.close()
  }
})
