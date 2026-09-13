import path from 'node:path'
import type { BrowserContext, Page, Response } from '@playwright/test'

import { expect, test } from './support/v2-test.js'

const capturePath = (name: string) => process.env.V2_CINEMA_ARTIFACT_DIR
  ? path.join(process.env.V2_CINEMA_ARTIFACT_DIR, path.basename(name)) : name

async function expectNoForbiddenText(
  pages: readonly Page[],
  forbidden: readonly string[],
): Promise<void> {
  for (const page of pages) {
    const body = await page.locator('body').innerText()
    for (const value of forbidden) expect(body).not.toContain(value)
  }
}

async function confirmAction(page: Page, buttonName: string, answer = '确定'): Promise<string> {
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '确认操作', exact: true })
  await expect(dialog).toBeVisible()
  const message = await dialog.locator('#action-dialog-message').innerText()
  await dialog.getByRole('button', { name: answer, exact: true }).click()
  await expect(dialog).not.toBeVisible()
  return message
}

async function loginAdmin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: '排练后台登录' })).toBeVisible()
  await page.getByLabel('账号').fill(username)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '现场控制台' })).toBeVisible()
  await expect(page.getByText('实时已连接', { exact: true })).toBeVisible()
}

async function waitForRuntime(page: Page, status: string, scene: string): Promise<void> {
  await expect(page.locator('.runtime-facts')).toContainText(status)
  await expect(page.locator('.runtime-facts')).toContainText(scene)
}

async function advance(page: Page): Promise<void> {
  await confirmAction(page, '推进下一场景')
}

async function clickAdminCommand(page: Page, buttonName: string): Promise<void> {
  const responsePromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/api/v2/admin/commands'
    && response.request().method() === 'POST'
  ), { timeout: 5_000 })
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  let response: Response
  try {
    response = await responsePromise
  } catch (error) {
    const button = page.getByRole('button', { name: buttonName, exact: true })
    throw new Error(
      `Admin command “${buttonName}” produced no request; disabled=${await button.isDisabled()}; page=${(await page.locator('body').innerText()).slice(0, 500)}.`,
      { cause: error },
    )
  }
  if (response.ok()) return
  let code = 'UNKNOWN'
  try { code = (await response.json())?.error?.code ?? code } catch { /* sanitized checkpoint */ }
  throw new Error(`Admin command “${buttonName}” failed with ${response.status()} ${code}.`)
}

test('runs the v2 welcome, screen and admin surfaces through one authoritative lifecycle', async ({
  browser,
  demo,
}) => {
  // This covers all three surfaces, real motions, restart and many screenshots.
  // Keep shot-duration assertions strict while allowing the full QA run to finish.
  test.setTimeout(210_000)
  let participantContext: BrowserContext | null = null
  let screenContext: BrowserContext | null = null
  let adminContext: BrowserContext | null = null
  try {
    participantContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    })
    screenContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 1920, height: 1080 },
      reducedMotion: 'reduce',
    })
    adminContext = await browser.newContext({ baseURL: demo.baseURL })
    const participantPage = await participantContext.newPage()
    const screenPage = await screenContext.newPage()
    const adminPage = await adminContext.newPage()
    const credential = demo.credentials.participants[0]
    const barrage = 'v2 三端合成弹幕'

    await screenPage.goto('/screen')
    await expect(screenPage.locator('.v2-screen')).toHaveAttribute('data-motion-policy', 'full')
    await expect(screenPage.locator('.v2-screen')).toHaveAttribute('data-system-reduced-motion', 'true')
    await expect(screenPage.locator('.v2-screen')).toHaveAttribute('data-motion-state', 'full')
    await expect(screenPage.getByRole('heading', { name: '星海集结' })).toBeVisible()
    await expect(screenPage.locator('.v2-screen')).toHaveAttribute(
      'data-screen-palette',
      'orbital-signal-spectrum',
    )
    await expect(screenPage.locator('.v2-count')).toHaveCount(0)
    await expect(screenPage.locator('.screen-arrival-count strong')).toHaveText('0')
    await expect(screenPage.getByText(/\/ 300 颗真实星点/u)).toHaveCount(0)
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-galaxy-structure',
      'inclined-flowing-spiral',
    )
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-decorative-stars',
      '420',
    )
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-visual-reference-stars',
      '220',
    )
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-density-system',
      'layered-spiral',
    )
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-arrival-style',
      'offscreen-meteor-orbital-capture',
    )
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-galaxy-breath',
      'ambient-multiphase',
    )
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-assembly-motion',
      'flowing',
    )
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-active-arrival-meteors',
      '0',
    )
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-render-target-fps',
      '30',
    )
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-render-cadence',
      'ambient-30hz',
    )

    await participantPage.goto(`/welcome?token=${encodeURIComponent(credential.inviteToken)}`)
    await expect(participantPage.locator('.v2-welcome')).toHaveAttribute(
      'data-visual-palette',
      'orbital-signal-spectrum',
    )
    await expect(participantPage.getByRole('heading', { name: '为你的星选择颜色' })).toBeVisible()
    expect(new URL(participantPage.url()).searchParams.has('token')).toBe(false)
    await participantPage.getByRole('button', { name: '确认星色' }).click()
    await expect(participantPage.getByText('1 颗星，已在这里相遇')).toBeVisible()
    await expect(screenPage.locator('.v2-count')).toHaveCount(0)
    await expect(screenPage.locator('.screen-arrival-count strong')).toHaveText('1')
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-active-arrival-meteors',
      '1',
      { timeout: 2_000 },
    )
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-assembly-motion',
      'flowing',
    )
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-active-arrival-meteors',
      '0',
      { timeout: 3_000 },
    )
    await screenPage.reload()
    await expect(screenPage.locator('.screen-arrival-count strong')).toHaveText('1')

    await loginAdmin(
      adminPage,
      demo.credentials.admin.username,
      demo.credentials.admin.password,
    )
    await expect(adminPage.locator('.metrics')).toContainText('1')
    await expectNoForbiddenText(
      [adminPage, screenPage],
      [credential.displayName, credential.studentNumber, credential.inviteToken],
    )
    await expectNoForbiddenText([screenPage], [credential.publicStarId])

    const catalogPanel = adminPage.locator('.catalog-panel')
    await catalogPanel.getByRole('button', { name: '载入本场节目单', exact: true }).click()
    await catalogPanel.getByRole('button', { name: '确认应用 25 项', exact: true }).click()
    await confirmAction(adminPage, '切换为现场')
    await waitForRuntime(adminPage, '待开始', '尚未开始')
    await confirmAction(adminPage, '开始活动')
    await waitForRuntime(adminPage, '运行中', '01 星海集结')
    await expect(participantPage.getByRole('button', { name: '启动我的星' })).toBeVisible()
    await participantPage.getByRole('button', { name: '启动我的星' }).click()
    await expect(participantPage.getByText('星星已启动')).toBeVisible()

    await clickAdminCommand(adminPage, '暂停')
    await waitForRuntime(adminPage, '已暂停', '01 星海集结')
    await expect(participantPage.getByText('现场已暂停')).toBeVisible()
    await expect(participantPage.getByRole('button', { name: '启动我的星' })).toHaveCount(0)
    await adminPage.getByRole('button', { name: '恢复运行' }).click()
    await waitForRuntime(adminPage, '运行中', '01 星海集结')

    await participantPage.getByRole('button', {name:'开启星海序曲'}).click()
    await expect(participantPage.getByRole('button', {name:'关闭音乐'})).toBeVisible()
    await screenPage.screenshot({path: capturePath('output/overnight-20260907/screen-galaxy.png')})
    // Measure the transition in the projection browser. Host time around the
    // admin command, screenshots and assertion round-trips is not shot duration.
    await screenPage.evaluate(() => {
      const stage = document.querySelector('.v2-screen')!
      const state = window as typeof window & { observedProgramTransitionMs?: number }
      delete state.observedProgramTransitionMs
      let startedAt: number | undefined
      const observer = new MutationObserver(() => {
        const phase = stage.getAttribute('data-scene-transition')
        if (phase === 'ASSEMBLY->PROGRAM_SUPPORT' && startedAt === undefined) startedAt = performance.now()
        if (phase === 'idle' && startedAt !== undefined) {
          state.observedProgramTransitionMs = performance.now() - startedAt
          observer.disconnect()
        }
      })
      observer.observe(stage, { attributes: true, attributeFilter: ['data-scene-transition'] })
    })
    await advance(adminPage)
    await waitForRuntime(adminPage, '运行中', '02 节目应援')
    await expect(screenPage.locator('.v2-screen')).toHaveClass(/scene-program_support/u)
    await expect(screenPage.locator('.screen-arrival-count')).toHaveCount(0)
    await expect(screenPage.locator('.v2-screen')).toHaveAttribute(
      'data-scene-transition',
      'ASSEMBLY->PROGRAM_SUPPORT',
    )
    await expect(screenPage.locator('.v2-screen')).toHaveAttribute(
      'data-program-transition-style',
      'stellar-collapse-supernova-reveal',
    )
    await expect(screenPage.locator('.v2-screen')).toHaveAttribute(
      'data-transition-architecture',
      'native-webgl2-supernova-with-canvas2d-fallback',
    )
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-render-target-fps',
      '60',
    )
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute(
      'data-render-cadence',
      'cinematic-vsync',
    )
    await expect(screenPage.locator(
      '.v2-scene-transition__gate, .v2-scene-transition__horizon, .v2-scene-transition__core',
    )).toHaveCount(0)
    await expect(screenPage.locator('.v2-barrage-stream')).toHaveCount(0)
    await screenPage.screenshot({ path: capturePath(`output/playwright/screen-motion-20260906/${test.info().project.name}-transition.png`) })
    await expect(screenPage.locator('.v2-screen')).toHaveAttribute(
      'data-scene-transition',
      'idle',
      { timeout: 16_000 },
    )
    expect(await screenPage.locator('canvas.v2-galaxy').getAttribute('data-supernova-engine'))
      .toMatch(/^(webgl2-cinematic-depth-field|canvas2d-supernova-fallback)$/u)
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute('data-render-target-fps', '0')
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute('data-render-cadence', 'idle')
    const observedProgramTransitionMs = await screenPage.evaluate(() => (window as typeof window & { observedProgramTransitionMs?: number }).observedProgramTransitionMs)
    expect(observedProgramTransitionMs).toBeGreaterThanOrEqual(11_500)
    expect(observedProgramTransitionMs).toBeLessThan(15_500)
    await expect(screenPage.locator('.v2-barrage-panel')).toHaveCount(0)
    await expect(screenPage.locator('.v2-barrage-stream')).toHaveCount(0)
    await expect(screenPage.locator('.v2-scene-copy')).toHaveCount(0)
    await expect(screenPage.locator('.v2-gifts')).toHaveCount(0)
    // The shared stage background replaces the galaxy after the opening.
    // Its canvas stays transparent and idle in both ordinary and OBS views.
    const canvasAlpha = () => screenPage.locator('canvas.v2-galaxy').evaluate((element: HTMLCanvasElement) =>
      element.getContext('2d')!.getImageData(element.width / 2, element.height / 2, 1, 1).data[3])
    expect(await canvasAlpha()).toBe(0)
    await expect(screenPage.locator('.ceremony-stage .program-stage-background')).toBeVisible()
    await screenPage.evaluate(async () => {
      const modulePath = '/src/router/index.js'
      const { default: router } = await import(modulePath)
      await router.replace('/screen?media=overlay')
    })
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute('data-render-target-fps', '0')
    expect(await canvasAlpha()).toBe(0)
    await screenPage.evaluate(async () => {
      const modulePath = '/src/router/index.js'
      const { default: router } = await import(modulePath)
      await router.replace('/screen')
    })
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute('data-render-target-fps', '0')

    await catalogPanel.getByLabel('当前节目', { exact: true }).selectOption('event2026-14')
    await catalogPanel.getByRole('button', { name: '设为当前节目', exact: true }).click()
    await clickAdminCommand(adminPage, '开启观众抽取')
    await expect(participantPage.getByRole('region', { name: '正在抽取上台观众' })).toBeVisible()
    await expect(screenPage.getByRole('heading', { name: '上台观众抽取' })).toBeVisible()
    // Start observing before the command: the controller's HTTP round-trip can
    // finish after a short rolling animation on a busy machine.
    await screenPage.locator('.v2-raffle').evaluate((element, code) => {
      type Frame = { rolling: boolean; historyVisible: boolean; winnerVisible: boolean }
      const state = window as typeof window & { observedRaffleFrames?: Frame[] }
      state.observedRaffleFrames = []
      const observer = new MutationObserver(() => {
        const frame = {
          rolling: element.classList.contains('is-rolling'),
          historyVisible: Boolean(element.querySelector('.v2-raffle__history')),
          winnerVisible: (element as HTMLElement).innerText.includes(code),
        }
        state.observedRaffleFrames!.push(frame)
        if (element.classList.contains('is-revealed')) observer.disconnect()
      })
      observer.observe(element, { attributes: true, childList: true, characterData: true, subtree: true })
    }, credential.publicStarId)
    await clickAdminCommand(adminPage, '抽取一位')
    await expect.poll(() => screenPage.evaluate(() => (window as typeof window & {
      observedRaffleFrames?: Array<{ rolling: boolean; historyVisible: boolean; winnerVisible: boolean }>
    }).observedRaffleFrames?.some(frame => frame.rolling))).toBe(true)
    const rollingFrames = await screenPage.evaluate(() => (window as typeof window & {
      observedRaffleFrames?: Array<{ rolling: boolean; historyVisible: boolean; winnerVisible: boolean }>
    }).observedRaffleFrames!.filter(frame => frame.rolling))
    for (const frame of rollingFrames) expect(frame).toEqual({ rolling: true, historyVisible: false, winnerVisible: false })
    await expect(screenPage.locator('.v2-raffle__code')).toHaveText(credential.publicStarId)
    await expect(adminPage.locator('.winner-list')).toContainText(credential.displayName)
    await expect(adminPage.locator('.winner-list')).toContainText(credential.publicStarId)
    await clickAdminCommand(adminPage, '完成抽取')
    await expect(screenPage.locator('.v2-raffle')).toHaveCount(0)

    // Interaction B stays outside the formal program gift accounting.
    await expect(participantPage.getByRole('button', { name: '送礼物', exact: true })).toHaveCount(0)
    await expect(participantPage.getByRole('dialog', { name: '送礼物', exact: true })).toHaveCount(0)

    await catalogPanel.getByLabel('当前节目', { exact: true }).selectOption('event2026-01')
    await catalogPanel.getByRole('button', { name: '设为当前节目', exact: true }).click()
    const selectedProgram = await catalogPanel.getByLabel('当前节目', { exact: true }).locator('option:checked').innerText()
    const selectedTitle = selectedProgram.split('·')[1]?.trim()
    expect(selectedTitle).toBeTruthy()
    await expect(participantPage.locator('#view-title')).toContainText(selectedTitle!)
    await expect(participantPage.locator('.dock-toast')).toHaveCount(0)
    await participantPage.screenshot({ path: capturePath('output/playwright/mobile-20260906/program-final-390.png') })
    await expect(screenPage.getByRole('heading', { name: selectedTitle! })).toHaveCount(0)
    await expect(screenPage.locator('.v2-barrage-panel')).toHaveCount(0)
    await expect(screenPage.locator('.v2-barrage-stream')).toHaveCount(0)

    await participantPage.getByRole('button', { name: '送礼物' }).click()
    const giftDialog = participantPage.getByRole('dialog', { name: '送礼物', exact: true })
    await expect(giftDialog).toBeVisible()
    await expect(giftDialog.locator('.gift-balance output')).toContainText('100')
    await expect(giftDialog.locator('.gift-grid button')).toHaveCount(4)
    await expect(giftDialog.locator('.gift-signal-icon')).toHaveCount(4)
    await expect(giftDialog.getByRole('button', { name: /微光，单个 1 动力/u })).toBeEnabled()
    await expect(giftDialog.getByRole('button', { name: /信标，单个 5 动力/u })).toBeEnabled()
    await expect(giftDialog.getByRole('button', { name: /星轨，单个 10 动力/u })).toBeEnabled()
    await expect(giftDialog.getByRole('button', { name: /星舰，单个 20 动力/u })).toBeEnabled()
    await giftDialog.getByRole('button', { name: /星舰，单个 20 动力/u }).click()
    await giftDialog.getByRole('button', { name: /发送/u }).click()
    await expect(participantPage.locator('[data-gift-visual="starship"]')).toBeVisible()
    await expect(screenPage.locator('[data-gift-visual="starship"]')).toBeVisible()
    await expect(participantPage.getByRole('button', { name: '送礼物' })).toContainText('余额 80')
    await expect(participantPage.locator('.current-program-gifts')).toContainText('星舰')
    await expect(participantPage.locator('.current-program-gifts')).toContainText('20 礼物值')
    expect(await participantPage.evaluate(() => window.scrollY)).toBe(0)
    await screenPage.screenshot({path: capturePath('output/overnight-20260907/screen-program.png')})
    await participantPage.screenshot({path: capturePath('output/overnight-20260907/mobile-program.png')})
    await expect(screenPage.locator('.v2-gifts')).toHaveCount(0)
    await participantPage.getByLabel('弹幕', { exact: true }).fill(barrage)
    // Observe while this transient node is attached, before the sender's request.
    await screenPage.evaluate((text) => {
      type Evidence = { moved: boolean; style?: { backgroundColor: string; backgroundImage: string; borderLeftWidth: string } }
      const state = window as typeof window & { observedBarrage?: Evidence }
      delete state.observedBarrage
      const observer = new MutationObserver(() => {
        const element = [...document.querySelectorAll<HTMLElement>('.v2-barrage-stream__item')].find(el => el.textContent?.includes(text))
        if (!element) return
        observer.disconnect()
        const initialX = element.getBoundingClientRect().x
        const startedAt = performance.now()
        function sample() {
          if (!element!.isConnected) { state.observedBarrage = { moved: false }; return }
          if (element!.getBoundingClientRect().x < initialX - 80) {
            const style = getComputedStyle(element!)
            state.observedBarrage = { moved: true, style: { backgroundColor: style.backgroundColor,
              backgroundImage: style.backgroundImage, borderLeftWidth: style.borderLeftWidth } }
          } else if (performance.now() - startedAt < 15_000) requestAnimationFrame(sample)
          else state.observedBarrage = { moved: false }
        }
        requestAnimationFrame(sample)
      })
      observer.observe(document.querySelector('.v2-screen')!, { subtree: true, childList: true })
    }, barrage)
    const flyingBarrage = screenPage.locator('.v2-barrage-stream__item', { hasText: barrage })
    await participantPage.getByRole('button', { name: '发送', exact: true }).click()
    await expect(participantPage.locator('.mobile-live-barrage')).toContainText(barrage)
    await expect.poll(() => screenPage.evaluate(() => (window as typeof window & {
      observedBarrage?: { moved: boolean; style?: { backgroundColor: string; backgroundImage: string; borderLeftWidth: string } }
    }).observedBarrage)).toEqual({ moved: true, style: {
      backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', borderLeftWidth: '0px',
    } })
    await expect(screenPage.locator('.v2-barrage-panel')).toHaveCount(0)
    await expect(adminPage.locator('.barrage-list')).toContainText(barrage)
    await expect(adminPage.locator('.barrage-list')).toContainText(credential.publicStarId)
    await expect(participantPage.locator('.mobile-chat-sender')).toContainText(credential.publicStarId)
    expect(await participantPage.evaluate(() => window.scrollY)).toBe(0)
    await participantPage.screenshot({ path: capturePath('output/overnight-20260907/mobile-chat-transparent.png') })
    await participantPage.getByRole('button', { name: '档案', exact: true }).click()
    await expect(participantPage.locator('.archive-gift-list')).toContainText(selectedTitle!)
    await expect(participantPage.locator('.archive-gift-list')).toContainText('星舰 × 1')
    await expect(participantPage.locator('.archive-barrage-list')).toContainText(barrage)
    await expect(participantPage.locator('[data-gift-visual="starship"]')).toHaveCount(0)
    expect(await participantPage.evaluate(() => window.scrollY)).toBe(0)
    await participantPage.screenshot({ path: capturePath('output/overnight-20260907/mobile-archive-history.png') })
    await participantPage.getByRole('button', { name: '星程', exact: true }).click()
    await expect(participantPage.locator('input[type=checkbox]')).toHaveCount(0)
    await expectNoForbiddenText([screenPage], [credential.publicStarId])
    await flyingBarrage.waitFor({ state: 'detached', timeout: 15_000 })
    await expect(screenPage.locator('.v2-barrage-stream')).toHaveCount(0)

    await advance(adminPage)
    await waitForRuntime(adminPage, '运行中', '03 协同点亮')
    await expect(screenPage.getByRole('progressbar', { name: '协同点亮进度' })).toHaveAttribute('aria-valuenow', '0')
    await participantPage.getByRole('button', { name: '参与全场点亮' }).click()
    await expect(participantPage.getByText('点亮已完成')).toBeVisible()
    await expect(screenPage.getByRole('progressbar', { name: '协同点亮进度' })).toHaveAttribute('aria-valuenow', '1')
    await expect(screenPage.locator('canvas.v2-galaxy')).toHaveAttribute('data-cooperative-count', '1')

    await demo.restartBackend()
    await expect(screenPage.getByRole('heading', { name: '协同点亮' })).toBeVisible()
    await expect(participantPage.getByText('点亮已完成')).toBeVisible()
    await expect(adminPage.getByText('实时已连接', { exact: true })).toBeVisible()
    await expect(screenPage.getByRole('progressbar', { name: '协同点亮进度' })).toHaveAttribute('aria-valuenow', '1')

    await confirmAction(adminPage, '结束并锁定终章')
    // This follows a backend restart: a recovered COMPLETED snapshot must show
    // the poster without replaying missed shots. Fresh live motion has its own test.
    await expect(screenPage.locator('.v2-screen')).toHaveClass(/is-completed/u)
    await expect(screenPage.locator('.closing-credits')).toBeVisible()
    await screenPage.screenshot({ path: capturePath(`output/playwright/screen-motion-20260906/${test.info().project.name}-finale.png`) })
    await expect(participantPage.getByText('本场活动已结束', { exact: true })).toBeVisible()
    const memento = participantPage.getByRole('region', { name: '今夜的个人纪念' })
    await expect(memento).toContainText(credential.displayName)
    await expect(memento.getByRole('listitem')).toHaveText(['抵达星河', '启动恒星', '送出应援', '留下欢呼', '一起点亮'])
    await expect(participantPage.locator('.dock-toast')).toHaveCount(0)
    await participantPage.screenshot({ path: capturePath('output/playwright/mobile-20260906/memento-complete.png') })
    await waitForRuntime(adminPage, '已完成', '03 协同点亮')
    await expectNoForbiddenText(
      [screenPage],
      [credential.publicStarId, credential.displayName, credential.studentNumber, credential.inviteToken],
    )
    const skipCredits = screenPage.getByRole('button', { name: '跳过片尾' })
    if (await skipCredits.isVisible()) await skipCredits.click()
    await expect(screenPage.locator('.v2-finale__copy h1')).toHaveCSS('opacity', '1')
    await expect(screenPage.locator('.closing-credits__metrics div').last()).toContainText('1')
    await screenPage.screenshot({path: capturePath('output/overnight-20260907/screen-finale.png')})
    await screenPage.screenshot({ path: capturePath(`output/playwright/screen-motion-20260906/${test.info().project.name}-finale-settled.png`) })
    await screenPage.reload()
    await expect(screenPage.locator('.v2-finale__copy h1')).toHaveCSS('opacity', '1')
    expect(await screenPage.locator('.v2-finale').evaluate((element: HTMLElement) => element.style.opacity)).toBe('')

    const screenPrivacy = await screenPage.evaluate(() => ({
      clickableStars: document.querySelectorAll('button[aria-label*="星号"], [data-public-star-id]').length,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }))
    expect(screenPrivacy).toEqual({ clickableStars: 0, horizontalOverflow: 0, verticalOverflow: 0 })
    const mobileLayout = await participantPage.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      stageLine: document.body.innerText.includes('06 / 06') || document.body.innerText.includes('RUNNING'),
      normalRealtimeLabel: document.body.innerText.includes('实时同步'),
    }))
    expect(mobileLayout).toEqual({
      horizontalOverflow: 0,
      verticalOverflow: 0,
      stageLine: false,
      normalRealtimeLabel: false,
    })
  } finally {
    await Promise.allSettled([
      participantContext?.close() ?? Promise.resolve(),
      screenContext?.close() ?? Promise.resolve(),
      adminContext?.close() ?? Promise.resolve(),
    ])
  }
})

test('keeps static barrages readable and full motion working without GSAP under system reduce', async ({ browser, demo }) => {
  const contexts: BrowserContext[] = []
  try {
    const controller = await browser.newContext({ baseURL: demo.baseURL })
    const projection = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
    const participant = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const fallback = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
    contexts.push(controller, projection, participant, fallback)
    const admin = await controller.newPage()
    const screen = await projection.newPage()
    const phone = await participant.newPage()
    const cssScreen = await fallback.newPage()
    const pageErrors: string[] = []
    for (const page of [screen, cssScreen]) page.on('pageerror', (error) => pageErrors.push(error.message))
    let blockedGsapRequests = 0
    await cssScreen.route('**/*gsap*', async (route) => {
      blockedGsapRequests += 1
      await route.abort('failed')
    })
    await screen.goto('/screen?motion=reduced&settings=1')
    await expect(screen.locator('.v2-screen')).toHaveAttribute('data-motion-state', 'static')
    await screen.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(screen.locator('.v2-screen')).toHaveAttribute('data-motion-state', 'static')
    await loginAdmin(admin, demo.credentials.admin.username, demo.credentials.admin.password)
    await confirmAction(admin, '切换为现场')
    await confirmAction(admin, '开始活动')
    const credential = demo.credentials.participants[0]!
    await phone.goto(`/welcome?token=${encodeURIComponent(credential.inviteToken)}`)
    await phone.getByRole('button', { name: '确认星色' }).click()
    await expect(phone.getByRole('button', { name: '启动我的星' })).toBeVisible()
    await advance(admin)
    await waitForRuntime(admin, '运行中', '02 节目应援')
    await admin.locator('.catalog-panel').getByRole('button', { name: '设为当前节目', exact: true }).click()
    await expect(screen.locator('.v2-screen')).toHaveAttribute('data-scene-transition', 'idle')
    await cssScreen.goto('/screen')
    await expect(cssScreen.locator('.v2-screen')).toHaveClass(/scene-program_support/u)
    await expect(cssScreen.locator('.v2-signal')).toHaveCount(0)
    expect(blockedGsapRequests).toBeGreaterThan(0)
    await expect(cssScreen.locator('.v2-screen')).not.toHaveClass(/is-gsap-ready/u)
    const barrage = '静态正文与完整飘屏合成验收'
    // Observe the flight in its own page from appearance. Cross-page phone
    // assertions can otherwise consume most of the real 9.8-second flight.
    const flightMotion = cssScreen.evaluate(async (text) => {
      const deadline = performance.now() + 20_000
      while (performance.now() < deadline) {
        const item = [...document.querySelectorAll<HTMLElement>('[data-barrage-id]')]
          .find(element => element.textContent?.includes(text))
        if (item) {
          const before = item.getBoundingClientRect().x
          const style = getComputedStyle(item)
          const background = style.backgroundImage, duration = parseFloat(style.animationDuration)
          await new Promise(resolve => setTimeout(resolve, 800))
          return { before, after: item.getBoundingClientRect().x, connected: item.isConnected, background, duration }
        }
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      return null
    }, barrage).catch(() => null)
    await phone.getByRole('button', { name: '星色', exact: true }).click()
    await phone.getByRole('button', { name: '星云，首次发送解锁需 10 动力', exact: true }).click()
    await phone.getByLabel('弹幕', { exact: true }).fill(barrage)
    await phone.getByRole('button', { name: '发送', exact: true }).click()
    await phone.getByRole('alertdialog', { name: '解锁「星云」' }).getByRole('button', { name: '确定', exact: true }).click()
    // Sending closes the palette; its stored selection and unlocked state remain.
    await expect(phone.getByRole('button', { name: '星云，免费', exact: true, includeHidden: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(phone.locator('.mobile-live-barrage')).toContainText(barrage)
    const staticText = screen.locator('[data-barrage-id]', { hasText: barrage })
    const movingText = cssScreen.locator('[data-barrage-id]', { hasText: barrage })
    await expect(staticText).toBeVisible()
    await expect(movingText).toBeVisible()
    const motionSample = await flightMotion
    expect(motionSample).not.toBeNull()
    expect(motionSample!.connected).toBe(true)
    expect(motionSample!.background).toContain('linear-gradient')
    const staticStyle = await staticText.evaluate((element) => {
      const style = getComputedStyle(element)
      return { animation: style.animationName, transform: style.transform, opacity: style.opacity }
    })
    expect(staticStyle).toEqual({ animation: 'none', transform: 'none', opacity: '1' })
    const staticBox = await staticText.boundingBox()
    expect(motionSample!.after).toBeLessThan(motionSample!.before - 100)
    await screen.waitForTimeout(200)
    expect(await staticText.boundingBox()).toEqual(staticBox)
    expect(motionSample!.duration).toBeGreaterThan(9)
    await screen.screenshot({ path: capturePath(`output/playwright/screen-motion-20260906/${test.info().project.name}-static.png`) })
    await cssScreen.screenshot({ path: capturePath(`output/playwright/screen-motion-20260906/${test.info().project.name}-css-barrage.png`) })
    await staticText.waitFor({ state: 'detached', timeout: 13_000 })
    await movingText.waitFor({ state: 'detached', timeout: 3_000 })
    // Capture the persistent mobile chat after measuring the short-lived flight;
    // PNG encoding must not consume the time window for its geometry assertions.
    await phone.screenshot({path: capturePath('output/overnight-20260907/mobile-gradient.png')})
    await screen.getByLabel('大屏动效', { exact: true }).selectOption('system')
    await expect(screen.locator('.v2-screen')).toHaveAttribute('data-motion-state', 'full')
    await screen.emulateMedia({ reducedMotion: 'reduce' })
    await expect(screen.locator('.v2-screen')).toHaveAttribute('data-motion-state', 'static')
    await screen.getByLabel('大屏动效', { exact: true }).selectOption('full')
    await expect(screen.locator('.v2-screen')).toHaveAttribute('data-motion-state', 'full')
    await screen.reload()
    await expect(screen.locator('.v2-screen')).toHaveAttribute('data-motion-state', 'full')
    await expect(screen.locator('[data-barrage-id]')).toHaveCount(0)
    await screen.getByRole('button', { name: '隐藏设置' }).click()
    await expect(screen.getByRole('complementary', { name: '大屏动效设置' })).toHaveCount(0)
    await screen.evaluate(async () => {
      const modulePath = '/src/router/index.js'
      const { default: router } = await import(modulePath)
      await router.push('/welcome')
    })
    await expect(screen.locator('html')).not.toHaveClass(/v2-stage-motion-full/u)
    expect(pageErrors).toEqual([])
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()))
  }
})

test('settles interrupted transitions and animates rehearsal finale without changing completion', async ({ browser, demo }) => {
  const contexts: BrowserContext[] = []
  try {
    const controller = await browser.newContext({ baseURL: demo.baseURL })
    const projection = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
    contexts.push(controller, projection)
    const admin = await controller.newPage()
    const screen = await projection.newPage()
    const pageErrors: string[] = []
    screen.on('pageerror', (error) => pageErrors.push(error.message))
    await screen.goto('/screen?media=overlay')
    await expect(screen.locator('.v2-screen')).toHaveClass(/is-gsap-ready/u)
    await loginAdmin(admin, demo.credentials.admin.username, demo.credentials.admin.password)
    await confirmAction(admin, '开始活动')
    await admin.getByRole('button', { name: '02 节目应援', exact: true }).click()
    await expect(screen.locator('.v2-screen')).toHaveAttribute('data-scene-transition', 'ASSEMBLY->PROGRAM_SUPPORT')
    await clickAdminCommand(admin, '暂停')
    await expect(screen.locator('.v2-screen')).toHaveAttribute('data-scene-transition', 'idle')
    await expect(screen.locator('canvas.v2-galaxy')).toHaveAttribute('data-render-target-fps', '0')
    await clickAdminCommand(admin, '恢复运行')
    await expect(screen.locator('.v2-screen')).toHaveAttribute('data-scene-transition', 'idle')
    await admin.getByRole('button', { name: '03 协同点亮', exact: true }).click()
    await expect(screen.locator('.v2-screen')).toHaveAttribute('data-scene-transition', 'idle')
    await clickAdminCommand(admin, '预览终章')
    await expect(screen.getByRole('heading', { name: '把今夜，写进星河' })).toBeVisible()
    await expect(screen.locator('.closing-credits')).toHaveAttribute('data-phase', 'intro')
    await screen.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(screen.locator('.v2-finale__copy h1')).toHaveCSS('opacity', '1')
    await expect(screen.locator('.closing-credits')).toHaveAttribute('data-phase', 'poster')
    expect(await screen.locator('.closing-credits').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0)
    await screen.evaluate(() => {
      Reflect.deleteProperty(document, 'hidden')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(await screen.locator('.v2-finale').evaluate((element: HTMLElement) => element.style.opacity)).toBe('')
    await screen.reload()
    await expect(screen.getByRole('heading', { name: '愿我们在更远的星海重逢' })).toBeVisible()
    expect(await screen.locator('.v2-finale').evaluate((element: HTMLElement) => element.style.opacity)).toBe('')
    await waitForRuntime(admin, '运行中', '03 协同点亮')
    expect(pageErrors).toEqual([])
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()))
  }
})

test('queues rapid raffle draws, restores static feedback and confirms incomplete completion once', async ({ browser, demo }) => {
  const contexts: BrowserContext[] = []
  try {
    const controller = await browser.newContext({ baseURL: demo.baseURL })
    const projection = await browser.newContext({ baseURL: demo.baseURL, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
    contexts.push(controller, projection)
    const admin = await controller.newPage()
    const screen = await projection.newPage()
    const pageErrors: string[] = []
    screen.on('pageerror', (error) => pageErrors.push(error.message))
    const dialogs: string[] = []
    const recordedAction = async (buttonName: string, answer = '确定') => {
      dialogs.push(await confirmAction(admin, buttonName, answer))
    }
    await screen.goto('/screen?motion=system')
    await loginAdmin(admin, demo.credentials.admin.username, demo.credentials.admin.password)
    const catalogPanel = admin.locator('.catalog-panel')
    await catalogPanel.getByRole('button', { name: '载入本场节目单', exact: true }).click()
    await catalogPanel.getByRole('button', { name: '确认应用 25 项', exact: true }).click()
    await recordedAction('切换为现场')
    await recordedAction('开始活动')
    await waitForRuntime(admin, '运行中', '01 星海集结')
    const phones: Page[] = []
    for (const credential of demo.credentials.participants.slice(0, 3)) {
      const context = await browser.newContext({ baseURL: demo.baseURL, reducedMotion: 'reduce', viewport: { width: 390, height: 844 } })
      contexts.push(context)
      const phone = await context.newPage()
      phones.push(phone)
      await phone.goto(`/welcome?token=${encodeURIComponent(credential.inviteToken)}`)
      await phone.getByRole('button', { name: '确认星色' }).click()
      await expect(phone.getByRole('button', { name: '启动我的星' })).toBeVisible()
    }
    // None has START_STAR; its readiness warning belongs in the same dialog.
    await expect(admin.locator('.warning-list')).toContainText('尚未启动恒星')
    const beforeAdvance = dialogs.length
    await recordedAction('推进下一场景')
    await waitForRuntime(admin, '运行中', '02 节目应援')
    expect(dialogs.length - beforeAdvance).toBe(1)
    expect(dialogs.at(-1)).toContain('尚未启动恒星')
    await screen.emulateMedia({ reducedMotion: 'no-preference' })
    await catalogPanel.getByLabel('当前节目', { exact: true }).selectOption('event2026-14')
    await catalogPanel.getByRole('button', { name: '设为当前节目', exact: true }).click()
    await clickAdminCommand(admin, '开启观众抽取')
    await clickAdminCommand(admin, '抽取一位')
    await expect(admin.locator('.winner-list code')).toHaveCount(1)
    const first = await admin.locator('.winner-list code').first().innerText()
    await clickAdminCommand(admin, '抽取一位')
    await expect(admin.locator('.winner-list code')).toHaveCount(2)
    const second = await admin.locator('.winner-list code').first().innerText()
    expect(first).not.toBe(second)
    await expect(screen.locator('.v2-raffle')).toHaveClass(/is-rolling/u)
    await expect(screen.locator('.v2-raffle__history')).toHaveCount(0)
    await expectNoForbiddenText([screen], [first, second])
    await expect(screen.locator('.v2-raffle__code')).toHaveText(first)
    await expect(screen.locator('.v2-raffle__history')).toContainText(first)
    await expect(screen.locator('.v2-raffle__history')).not.toContainText(second)
    await expect(screen.locator('.v2-raffle__code')).toHaveText(second)
    await expect(screen.locator('.v2-raffle__history li')).toHaveCount(2)
    // Interrupt a third result by reloading: restore all persisted winners once.
    await clickAdminCommand(admin, '抽取一位')
    await expect(screen.locator('.v2-raffle')).toHaveClass(/is-rolling/u)
    await screen.reload()
    await expect(screen.locator('.v2-raffle')).toHaveClass(/is-revealed/u)
    await expect(screen.locator('.v2-raffle')).not.toHaveClass(/is-live-reveal/u)
    expect(await screen.locator('.v2-raffle__code').evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
    await expect(screen.locator('.v2-raffle__history li')).toHaveCount(3)
    await clickAdminCommand(admin, '完成抽取')
    await screen.emulateMedia({ reducedMotion: 'reduce' })
    await recordedAction('推进下一场景')
    await waitForRuntime(admin, '运行中', '03 协同点亮')
    const progress = screen.getByRole('progressbar', { name: '协同点亮进度' })
    const canvas = screen.locator('canvas.v2-galaxy')
    await expect(progress).toHaveAttribute('aria-valuenow', '0')
    await expect(progress).toHaveAttribute('aria-valuemax', '3')
    const pixels = () => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())
    const beforePixels = await pixels()
    await phones[0]!.getByRole('button', { name: '参与全场点亮' }).click()
    await expect(progress).toHaveAttribute('aria-valuenow', '1')
    await expect(canvas).toHaveAttribute('data-cooperative-count', '1')
    await expect.poll(pixels).not.toBe(beforePixels)
    const afterPixels = await pixels()
    await screen.waitForTimeout(300)
    expect(await pixels()).toBe(afterPixels)
    await screen.reload()
    await expect(progress).toHaveAttribute('aria-valuenow', '1')
    await expect(canvas).toHaveAttribute('data-cooperative-feedback', 'static')
    await expect(admin.locator('.warning-list')).toContainText('尚未完成协同点亮')
    const beforeComplete = dialogs.length
    await recordedAction('结束并锁定终章', '返回')
    await waitForRuntime(admin, '运行中', '03 协同点亮')
    expect(dialogs.length - beforeComplete).toBe(1)
    await recordedAction('结束并锁定终章')
    await waitForRuntime(admin, '已完成', '03 协同点亮')
    expect(dialogs.length - beforeComplete).toBe(2)
    expect(dialogs.at(-1)).toContain('尚未完成协同点亮')
    expect(pageErrors).toEqual([])
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()))
  }
})
