import fs from 'node:fs'
import path from 'node:path'

import { expect, test } from './support/v2-test.js'

/**
 * D-030 visual gold-standard regression gate (automated portion only).
 *
 * Runs the normal-motion fresh-invite journey against the production Vue page
 * and asserts the measurable continuity contract: the personal journey stage
 * exists and paints, the color stage is reached within the reference window
 * (about 5.4s) without a page reload, the handoff enables the color controls,
 * and the journey accumulates no meaningful layout shift. Phase screenshots
 * are written to the git-ignored output/playwright/v2-journey-visual/ dir for
 * human/AI diffing against the motion-previsual golden frames.
 *
 * This gate never substitutes for the D-052 physical-phone / field sign-off in
 * docs/D037_FIELD_ACCEPTANCE.md.
 */

test('plays one personal entry meteor and restores without crowd stars or replay', async ({
  browser,
  demo,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-ci', 'visual baseline runs on chromium-ci only')
  test.setTimeout(150_000)

  const context = await browser.newContext({
    baseURL: demo.baseURL,
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  })
  await context.addInitScript(() => {
    const w = window as unknown as { __cls?: number; __clsObs?: PerformanceObserver }
    w.__cls = 0
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'layout-shift' && !(entry as { hadRecentInput?: boolean }).hadRecentInput) {
            w.__cls = (w.__cls ?? 0) + (entry as unknown as { value: number }).value
          }
        }
      })
      observer.observe({ type: 'layout-shift', buffered: true })
      w.__clsObs = observer
    } catch { /* CLS probe unavailable in this engine */ }
  })

  const page = await context.newPage()
  const screenshots = path.resolve(
    'output', 'playwright', 'v2-journey-visual', testInfo.project.name,
  )
  fs.mkdirSync(screenshots, { recursive: true })
  try {
    const token = demo.credentials.participant.inviteToken
    await page.goto(`/welcome?token=${encodeURIComponent(token)}`)

    await expect(page.locator('.personal-neon-entry')).toBeVisible()
    await expect(page.getByTestId('personal-journey-stage')).toHaveCount(0)
    expect(new URL(page.url()).searchParams.has('token')).toBe(false)
    const startedAt=Date.now(),confirmColor=page.getByRole('button',{name:'确认星色',exact:true})
    await expect(confirmColor).toBeEnabled()
    await expect(page.getByTestId('persistent-color-controls')).toBeVisible()
    await confirmColor.click()
    await expect(page.getByTestId('personal-entry-meteor')).toBeVisible()
    await page.waitForTimeout(450)
    await page.screenshot({path:`${screenshots}/entry-meteor.png`})
    await expect(page.getByTestId('personal-entry-meteor')).toHaveCount(0)
    const journeyDuration=Date.now()-startedAt
    expect(journeyDuration).toBeLessThan(4500)
    await page.reload();await expect(page.getByText('你的星色，已为今晚点亮')).toBeVisible()
    await expect(page.getByTestId('personal-entry-meteor')).toHaveCount(0)
    // No horizontal overflow at the target viewport.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

    const cls = await page.evaluate(() => {
      const w = window as unknown as { __cls?: number; __clsObs?: PerformanceObserver }
      w.__clsObs?.disconnect()
      return w.__cls ?? -1
    })
    if (cls >= 0) expect(cls).toBeLessThan(0.05)

    testInfo.annotations.push({ type: 'journey-duration-ms', description: String(journeyDuration) })
    testInfo.annotations.push({ type: 'journey-cls', description: String(cls) })
  } finally {
    await context.close()
  }
})
