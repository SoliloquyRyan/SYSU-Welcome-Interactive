import type { BrowserContext, Page } from '@playwright/test'

import {
  activateParticipant,
  loginAdmin,
} from './support/demo-actions.js'
import { expect, test } from './support/test.js'

interface RuntimeView {
  mode: 'REHEARSAL' | 'LIVE'
  resetEpoch: number
  stage: number
  stageRevision: number
  status: 'READY' | 'RUNNING' | 'PAUSED' | 'COMPLETED'
}

interface RuntimeResponseView {
  code: string | null
  runtime: RuntimeView | null
  status: number
}

async function readRuntime(page: Page): Promise<RuntimeView> {
  return page.evaluate(async () => {
    const response = await fetch('/api/admin/snapshot', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Admin snapshot failed with ${response.status}`)
    const payload = (await response.json()) as { runtime: RuntimeView }
    const runtime = payload.runtime
    return {
      mode: runtime.mode,
      resetEpoch: runtime.resetEpoch,
      stage: runtime.stage,
      stageRevision: runtime.stageRevision,
      status: runtime.status,
    }
  })
}

async function postRuntime(
  page: Page,
  version: Pick<RuntimeView, 'resetEpoch' | 'stageRevision'>,
  command: Record<string, unknown>,
): Promise<RuntimeResponseView> {
  return page.evaluate(
    async ({ command, version }) => {
      const response = await fetch('/api/admin/runtime', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ ...version, ...command }),
      })
      const payload = (await response.json()) as {
        error?: { code?: string }
        runtime?: RuntimeView
      }
      const runtime = payload.runtime
      return {
        code: payload.error?.code ?? null,
        runtime: runtime
          ? {
              mode: runtime.mode,
              resetEpoch: runtime.resetEpoch,
              stage: runtime.stage,
              stageRevision: runtime.stageRevision,
              status: runtime.status,
            }
          : null,
        status: response.status,
      }
    },
    {
      command,
      version: {
        resetEpoch: version.resetEpoch,
        stageRevision: version.stageRevision,
      },
    },
  )
}

async function waitForRuntime(
  page: Page,
  expected: RuntimeView,
): Promise<RuntimeView> {
  await expect.poll(async () => readRuntime(page)).toEqual(expected)
  return readRuntime(page)
}

async function grantStageController(page: Page): Promise<void> {
  const role = page.locator('.role-row').filter({ hasText: '阶段控制' })
  await role.getByRole('button', { name: '取得权限' }).click()
  await expect(role.getByText('已取得', { exact: true })).toBeVisible()
}

async function expectAdminCookie(
  context: BrowserContext,
  baseURL: string,
): Promise<void> {
  const cookies = await context.cookies(baseURL)
  const cookie = cookies.find(({ name }) => name === 'sysu_welcome_admin')
  expect(Boolean(cookie)).toBe(true)
  expect(Boolean(cookie?.value.length)).toBe(true)
  expect(cookie?.httpOnly === true).toBe(true)
  expect(cookie?.sameSite === 'Lax').toBe(true)
  expect(cookie?.path === '/').toBe(true)
}

async function clickWithConfirmation(
  page: Page,
  buttonName: string,
  expectedMessage: string,
): Promise<void> {
  const dialogPromise = page.waitForEvent('dialog')
  const clickPromise = page
    .getByRole('button', { name: buttonName, exact: true })
    .click()
  const dialog = await dialogPromise
  expect(dialog.type() === 'confirm').toBe(true)
  expect(dialog.message() === expectedMessage).toBe(true)
  await dialog.accept()
  await clickPromise
}

test('enforces the admin boundary and the LIVE forward-only control lifecycle', async ({
  browser,
  demo,
}) => {
  let adminContext: BrowserContext | null = null
  let staleAdminContext: BrowserContext | null = null
  let participantContext: BrowserContext | null = null
  try {
    adminContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 1440, height: 1000 },
    })
    const adminPage = await adminContext.newPage()
    await adminPage.goto(new URL('/admin', demo.baseURL).toString())
    await expect(
      adminPage.getByRole('heading', { name: '登录控制台' }),
    ).toBeVisible()
    expect(await adminPage.locator('#roles-title').count()).toBe(0)
    expect(await adminPage.locator('#runtime-title').count()).toBe(0)
    expect(await adminPage.locator('#metrics-title').count()).toBe(0)

    participantContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 393, height: 873 },
      hasTouch: true,
      isMobile: true,
    })
    const participantPage = await participantContext.newPage()
    await activateParticipant(participantPage, demo)
    const capsuleMessage = `胶囊-${crypto.randomUUID()}`
    await participantPage.getByLabel('时光胶囊留言').fill(capsuleMessage)
    await participantPage
      .getByRole('checkbox', { name: /人工筛选候选池/u })
      .check()
    await participantPage
      .getByRole('button', { name: '提交时光胶囊' })
      .click()
    await expect(
      participantPage.getByText('时光胶囊已提交，现已进入人工筛选候选池。'),
    ).toBeVisible()

    await loginAdmin(adminPage, demo)
    await expect(adminPage.locator('.capsule-list')).toContainText(capsuleMessage)
    await expectAdminCookie(adminContext, demo.baseURL)
    await adminPage.getByLabel('运行模式').selectOption('LIVE')
    for (const buttonName of [
      '应用模式',
      '开始',
      '暂停互动',
      '恢复',
      '现场推进',
      '结束活动',
      '跳转',
    ]) {
      await expect(
        adminPage.getByRole('button', { name: buttonName, exact: true }),
      ).toBeDisabled()
    }

    const withoutRole = await readRuntime(adminPage)
    const forbidden = await postRuntime(adminPage, withoutRole, {
      action: 'START',
      confirmed: false,
    })
    expect(forbidden.status).toBe(403)
    expect(forbidden.code).toBe('ROLE_REQUIRED')
    expect(await readRuntime(adminPage)).toEqual(withoutRole)

    await grantStageController(adminPage)
    staleAdminContext = await browser.newContext({
      baseURL: demo.baseURL,
      viewport: { width: 1280, height: 900 },
    })
    const staleAdminPage = await staleAdminContext.newPage()
    await loginAdmin(staleAdminPage, demo)
    await expectAdminCookie(staleAdminContext, demo.baseURL)
    await grantStageController(staleAdminPage)
    const staleVersion = await readRuntime(staleAdminPage)

    const beforeLive = await readRuntime(adminPage)
    await adminPage.getByLabel('运行模式').selectOption('LIVE')
    await clickWithConfirmation(
      adminPage,
      '应用模式',
      '确认切换为现场模式？',
    )
    let runtime = await waitForRuntime(adminPage, {
      ...beforeLive,
      mode: 'LIVE',
      stageRevision: beforeLive.stageRevision + 1,
    })
    await expect(adminPage.getByLabel('排练跳转阶段')).toBeDisabled()
    await expect(
      adminPage.getByRole('button', { name: '跳转', exact: true }),
    ).toBeDisabled()

    const staleStart = await postRuntime(staleAdminPage, staleVersion, {
      action: 'START',
      confirmed: false,
    })
    expect(staleStart.status).toBe(409)
    expect(staleStart.code).toBe('STALE_STAGE')
    expect(await readRuntime(adminPage)).toEqual(runtime)

    const beforeStart = runtime
    await adminPage.getByRole('button', { name: '开始', exact: true }).click()
    runtime = await waitForRuntime(adminPage, {
      ...beforeStart,
      stageRevision: beforeStart.stageRevision + 1,
      status: 'RUNNING',
    })

    let pauseDialogSeen = false
    const dismissUnexpectedDialog = async (dialog: {
      dismiss(): Promise<void>
    }) => {
      pauseDialogSeen = true
      await dialog.dismiss()
    }
    adminPage.on('dialog', dismissUnexpectedDialog)
    try {
      await adminPage
        .getByRole('button', { name: '暂停互动', exact: true })
        .click()
      runtime = await waitForRuntime(adminPage, {
        ...runtime,
        stageRevision: runtime.stageRevision + 1,
        status: 'PAUSED',
      })
    } finally {
      adminPage.off('dialog', dismissUnexpectedDialog)
    }
    expect(pauseDialogSeen).toBe(false)

    const beforeResume = runtime
    await adminPage.getByRole('button', { name: '恢复', exact: true }).click()
    runtime = await waitForRuntime(adminPage, {
      ...beforeResume,
      stageRevision: beforeResume.stageRevision + 1,
      status: 'RUNNING',
    })

    for (const targetStage of [2, 3, 4, 5, 6]) {
      const beforeAdvance = runtime
      await clickWithConfirmation(
        adminPage,
        '现场推进',
        '确认推进到下一阶段？',
      )
      runtime = await waitForRuntime(adminPage, {
        ...beforeAdvance,
        stage: targetStage,
        stageRevision: beforeAdvance.stageRevision + 1,
      })

      if (targetStage === 2) {
        const backwardJump = await postRuntime(adminPage, runtime, {
          action: 'JUMP',
          confirmed: true,
          targetStage: 1,
        })
        expect(backwardJump.status).toBe(409)
        expect(backwardJump.code).toBe('STAGE_LOCKED')
        expect(await readRuntime(adminPage)).toEqual(runtime)
      }
    }

    const beforeComplete = runtime
    await clickWithConfirmation(
      adminPage,
      '结束活动',
      '确认结束活动？',
    )
    runtime = await waitForRuntime(adminPage, {
      ...beforeComplete,
      stageRevision: beforeComplete.stageRevision + 1,
      status: 'COMPLETED',
    })
    await expect(adminPage.getByRole('heading', { name: '运行概况' })).toBeVisible()
    const operationRows = adminPage.locator(
      '[aria-labelledby="operations-title"] tbody tr',
    )
    await expect(operationRows.first()).toBeVisible()
    expect((await operationRows.count()) > 0).toBe(true)

    const containsForbiddenPrivateState = await adminPage.evaluate(
      ({ forbiddenValues }) => {
        const publicText = document.body.innerText
        return forbiddenValues.some(
          (value) => value.length > 0 && publicText.includes(value),
        )
      },
      {
        forbiddenValues: [
          demo.credentials.admin.password,
          demo.credentials.participant.displayName,
          demo.credentials.participant.studentNumber,
          demo.credentials.participant.inviteToken,
        ],
      },
    )
    expect(containsForbiddenPrivateState).toBe(false)
    expect(runtime).toMatchObject({
      mode: 'LIVE',
      stage: 6,
      status: 'COMPLETED',
    })
  } finally {
    await participantContext?.close()
    await staleAdminContext?.close()
    await adminContext?.close()
  }
})
