import type { Locator, Page } from '@playwright/test'

import type {
  DemoParticipantCredentials,
  DemoTestStack,
} from '../fixtures/demo-stack.js'
import { expect } from './test.js'

const STAGE_NAMES = [
  '身份激活',
  '时光胶囊',
  '星星集结',
  '节目应援',
  '协同点亮',
  '星际档案',
] as const

function absoluteUrl(baseURL: string, pathname: string): string {
  return new URL(pathname, baseURL).toString()
}

export async function openInvitation(
  page: Page,
  demo: DemoTestStack,
  participant: DemoParticipantCredentials = demo.credentials.participant,
): Promise<void> {
  await page.goto(absoluteUrl(demo.baseURL, '/screen'))
  await page.evaluate(
    ({ baseURL, inviteToken }) => {
      const invitation = new URL('/welcome', baseURL)
      invitation.searchParams.set('token', inviteToken)
      window.location.assign(invitation.toString())
    },
    {
      baseURL: demo.baseURL,
      inviteToken: participant.inviteToken,
    },
  )
  await expect(
    page.getByRole('heading', { name: '使用邀请函上的合成信息核验' }),
  ).toBeVisible()
  const currentUrl = new URL(page.url())
  expect(currentUrl.pathname).toBe('/welcome')
  expect(currentUrl.searchParams.has('token')).toBe(false)
}

export async function activateParticipant(
  page: Page,
  demo: DemoTestStack,
  participant: DemoParticipantCredentials = demo.credentials.participant,
): Promise<void> {
  await openInvitation(page, demo, participant)
  await page.getByLabel('虚构姓名').fill(participant.displayName)
  await page.getByLabel('六位 Demo 码').fill(participant.demoCode)
  await page.getByRole('button', { name: '进入现场' }).click()
  const startJourney = page.getByRole('button', { name: '启动星程' })
  const confirmTemperature = page.getByRole('button', {
    name: '确认星色 · 进入星辰',
  })
  const exitButton = page.getByRole('button', { name: '退出' })
  await expect(startJourney.or(confirmTemperature).or(exitButton)).toBeVisible()
  if (!(await exitButton.isVisible())) {
    await selectStarTemperature(page)
  }
  await expect(exitButton).toBeVisible()
  await expect(page.getByText('实时同步', { exact: true })).toBeVisible()
}

export async function selectStarTemperature(
  page: Page,
  kelvin = 5800,
): Promise<void> {
  const startJourney = page.getByRole('button', { name: '启动星程' })
  const temperatureHeading = page.getByRole('heading', {
    name: '选择你的恒星色温',
  })
  const exitButton = page.getByRole('button', { name: '退出' })
  await expect(startJourney.or(temperatureHeading)).toBeVisible()
  if (await startJourney.isVisible()) await startJourney.click()
  await expect(temperatureHeading.or(exitButton)).toBeVisible()
  if (await exitButton.isVisible()) return
  const range = page.getByRole('slider', { name: '恒星色温' })
  await range.evaluate((element, nextKelvin) => {
    const input = element as HTMLInputElement
    input.value = String(nextKelvin)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, kelvin)
  await expect(page.locator('output[for="star-temperature"]')).toContainText(
    kelvin.toLocaleString('zh-CN'),
  )
  await page
    .getByRole('button', { name: '确认星色 · 进入星辰' })
    .click()
  await expect(page.getByRole('button', { name: '退出' })).toBeVisible()
}

export async function loginAdmin(
  page: Page,
  demo: DemoTestStack,
): Promise<void> {
  await page.goto(absoluteUrl(demo.baseURL, '/admin'))
  await page
    .getByLabel('共用账号')
    .fill(demo.credentials.admin.username)
  await page.getByLabel('密码').fill(demo.credentials.admin.password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '当前能力' })).toBeVisible()
  await expect(page.getByText('实时同步', { exact: true })).toBeVisible()
}

export async function grantAllRoles(page: Page): Promise<void> {
  const allRole = page.locator('.role-row').filter({ hasText: '全部能力' })
  await allRole.getByRole('button', { name: '取得权限' }).click()
  await expect(allRole.getByText('已取得', { exact: true })).toBeVisible()
}

export async function startRehearsal(page: Page): Promise<void> {
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await expect(page.locator('.runtime-strip')).toContainText('RUNNING')
}

export async function jumpToStage(page: Page, stage: number): Promise<void> {
  const stageName = STAGE_NAMES[stage - 1]
  if (!stageName) throw new Error('Synthetic stage is outside the G3 range')
  await page.getByLabel('排练跳转阶段').selectOption(String(stage))
  await page.getByRole('button', { name: '跳转', exact: true }).click()
  await expect(page.locator('.runtime-strip')).toContainText(
    `${stage} · ${stageName}`,
  )
}

export async function expectStage(
  page: Page,
  stageName: (typeof STAGE_NAMES)[number],
): Promise<void> {
  await expect(
    page
      .locator('#scene-title, #screen-title')
      .filter({ hasText: new RegExp(`^${stageName}$`, 'u') }),
  ).toBeVisible()
}

export async function expectNoForbiddenDomText(
  pages: Page[],
  forbiddenValues: string[],
): Promise<void> {
  for (const page of pages) {
    const bodyText = await page.locator('body').innerText()
    expect(
      forbiddenValues.every(
        (value) => value.length === 0 || !bodyText.includes(value),
      ),
    ).toBe(true)
  }
}

export async function expectNoViewportOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    horizontal:
      Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) -
      window.innerWidth,
    vertical:
      Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      ) - window.innerHeight,
  }))
  expect(overflow.horizontal).toBeLessThanOrEqual(1)
  expect(overflow.vertical).toBeLessThanOrEqual(1)
}

export async function expectMinimumControlSize(
  controls: Locator,
  minimum = 44,
): Promise<void> {
  const count = await controls.count()
  expect(count).toBeGreaterThan(0)
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index)
    if (!(await control.isVisible())) continue
    const box = await control.boundingBox()
    expect(box !== null).toBe(true)
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(minimum)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(minimum)
  }
}

export async function acceptNextDialog(page: Page): Promise<void> {
  page.once('dialog', async (dialog) => dialog.accept())
}
