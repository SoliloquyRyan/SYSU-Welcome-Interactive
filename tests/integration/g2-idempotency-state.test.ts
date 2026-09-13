import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  AdminSnapshotSchema,
  ParticipantSnapshotSchema,
  type AdminSnapshot,
} from '../../packages/contracts/src/index.js'
import {
  commandVersion,
  createG2Harness,
  idempotencyKey,
  responseErrorCode,
  type G2Harness,
  type TestResponse,
} from '../helpers/g2-harness.js'

async function loginWithAllRoles(harness: G2Harness): Promise<{
  cookie: string
  snapshot: AdminSnapshot
}> {
  const login = await harness.adminLogin()
  const loginSnapshot = AdminSnapshotSchema.parse(login.response.json())
  const roles = await harness.unsafeRequest(
    {
      method: 'PUT',
      url: '/api/admin/roles',
      headers: { 'idempotency-key': idempotencyKey('state-roles') },
      payload: { ...commandVersion(loginSnapshot), roles: ['ALL'] },
    },
    login.cookie,
  )
  expect(roles.statusCode).toBe(200)
  return {
    cookie: login.cookie,
    snapshot: AdminSnapshotSchema.parse(roles.json()),
  }
}

async function runtime(
  harness: G2Harness,
  cookie: string,
  snapshot: AdminSnapshot,
  command: Record<string, unknown>,
  key: string,
): Promise<TestResponse> {
  return harness.unsafeRequest(
    {
      method: 'POST',
      url: '/api/admin/runtime',
      headers: { 'idempotency-key': key },
      payload: { ...commandVersion(snapshot), ...command },
    },
    cookie,
  )
}

async function prepareStageFour(harness: G2Harness): Promise<{
  participantCookies: [string, string]
  adminCookie: string
  admin: AdminSnapshot
}> {
  const [participantA, participantB] = await Promise.all([
    harness.activate(0, {
      idempotencyKey: idempotencyKey('idem-activate', 1),
    }),
    harness.activate(1, {
      idempotencyKey: idempotencyKey('idem-activate', 2),
    }),
  ])
  const adminSession = await loginWithAllRoles(harness)
  let response = await runtime(
    harness,
    adminSession.cookie,
    adminSession.snapshot,
    { action: 'START', confirmed: true },
    idempotencyKey('idem-runtime', 1),
  )
  expect(response.statusCode).toBe(200)
  let admin = AdminSnapshotSchema.parse(response.json())
  response = await runtime(
    harness,
    adminSession.cookie,
    admin,
    { action: 'JUMP', targetStage: 4, confirmed: true },
    idempotencyKey('idem-runtime', 2),
  )
  expect(response.statusCode).toBe(200)
  admin = AdminSnapshotSchema.parse(response.json())
  response = await runtime(
    harness,
    adminSession.cookie,
    admin,
    { action: 'SET_PROGRAM', programId: 'program-001', confirmed: true },
    idempotencyKey('idem-runtime', 3),
  )
  expect(response.statusCode).toBe(200)
  admin = AdminSnapshotSchema.parse(response.json())
  return {
    participantCookies: [participantA.cookie, participantB.cookie],
    adminCookie: adminSession.cookie,
    admin,
  }
}

describe('G2 runtime state machine and idempotent transactions', () => {
  let harness: G2Harness

  beforeEach(async () => {
    harness = await createG2Harness()
  })

  afterEach(async () => {
    await harness.close()
  })

  it('allows rehearsal jumps 1-6 and increments the revision exactly once per change', async () => {
    const adminSession = await loginWithAllRoles(harness)
    let start = await runtime(
      harness,
      adminSession.cookie,
      adminSession.snapshot,
      { action: 'START', confirmed: true },
      idempotencyKey('rehearsal-start'),
    )
    expect(start.statusCode).toBe(200)
    let snapshot = AdminSnapshotSchema.parse(start.json())
    let expectedRevision = snapshot.runtime.stageRevision

    for (const targetStage of [6, 2, 5, 1, 4, 3] as const) {
      const response = await runtime(
        harness,
        adminSession.cookie,
        snapshot,
        { action: 'JUMP', targetStage, confirmed: true },
        idempotencyKey('rehearsal-jump', targetStage),
      )
      expect(response.statusCode).toBe(200)
      snapshot = AdminSnapshotSchema.parse(response.json())
      expectedRevision += 1
      expect(snapshot.runtime).toMatchObject({
        mode: 'REHEARSAL',
        stage: targetStage,
        stageRevision: expectedRevision,
      })
    }
  })

  it('enforces the LIVE forward-only lifecycle, pause semantics and stale revisions', async () => {
    const participant = await harness.activate()
    const adminSession = await loginWithAllRoles(harness)
    let snapshot = adminSession.snapshot

    let response = await runtime(
      harness,
      adminSession.cookie,
      snapshot,
      { action: 'SET_MODE', mode: 'LIVE', confirmed: true },
      idempotencyKey('live-mode'),
    )
    expect(response.statusCode).toBe(200)
    snapshot = AdminSnapshotSchema.parse(response.json())

    const staleVersion = commandVersion(snapshot)
    response = await runtime(
      harness,
      adminSession.cookie,
      snapshot,
      { action: 'START', confirmed: true },
      idempotencyKey('live-start'),
    )
    expect(response.statusCode).toBe(200)
    snapshot = AdminSnapshotSchema.parse(response.json())
    expect(snapshot.runtime).toMatchObject({
      mode: 'LIVE',
      status: 'RUNNING',
      stage: 1,
    })

    const stale = await harness.unsafeRequest(
      {
        method: 'POST',
        url: '/api/admin/runtime',
        headers: { 'idempotency-key': idempotencyKey('stale-runtime') },
        payload: { ...staleVersion, action: 'ADVANCE', confirmed: true },
      },
      adminSession.cookie,
    )
    expect(stale.statusCode).toBe(409)
    expect(responseErrorCode(stale)).toBe('STALE_STAGE')

    const illegalJump = await runtime(
      harness,
      adminSession.cookie,
      snapshot,
      { action: 'JUMP', targetStage: 4, confirmed: true },
      idempotencyKey('live-illegal-jump'),
    )
    expect(illegalJump.statusCode).toBe(409)
    expect(responseErrorCode(illegalJump)).toBe('STAGE_LOCKED')

    response = await runtime(
      harness,
      adminSession.cookie,
      snapshot,
      { action: 'PAUSE' },
      idempotencyKey('live-pause'),
    )
    expect(response.statusCode).toBe(200)
    snapshot = AdminSnapshotSchema.parse(response.json())
    expect(snapshot.runtime.status).toBe('PAUSED')

    const pausedWrite = await harness.unsafeRequest(
      {
        method: 'PUT',
        url: '/api/participant/capsule-message',
        headers: { 'idempotency-key': idempotencyKey('paused-write') },
        payload: {
          ...commandVersion(snapshot),
          text: '暂停时不得写入',
          publicDisplayNoticeAccepted: true,
        },
      },
      participant.cookie,
    )
    expect(pausedWrite.statusCode).toBe(409)
    expect(responseErrorCode(pausedWrite)).toBe('RUNTIME_PAUSED')

    response = await runtime(
      harness,
      adminSession.cookie,
      snapshot,
      { action: 'RESUME' },
      idempotencyKey('live-resume'),
    )
    expect(response.statusCode).toBe(200)
    snapshot = AdminSnapshotSchema.parse(response.json())

    for (const targetStage of [2, 3, 4, 5, 6] as const) {
      response = await runtime(
        harness,
        adminSession.cookie,
        snapshot,
        { action: 'ADVANCE', confirmed: true },
        idempotencyKey('live-advance', targetStage),
      )
      expect(response.statusCode).toBe(200)
      snapshot = AdminSnapshotSchema.parse(response.json())
      expect(snapshot.runtime.stage).toBe(targetStage)
    }

    response = await runtime(
      harness,
      adminSession.cookie,
      snapshot,
      { action: 'COMPLETE', confirmed: true },
      idempotencyKey('live-complete'),
    )
    expect(response.statusCode).toBe(200)
    snapshot = AdminSnapshotSchema.parse(response.json())
    expect(snapshot.runtime.status).toBe('COMPLETED')

    const afterComplete = await runtime(
      harness,
      adminSession.cookie,
      snapshot,
      { action: 'ADVANCE', confirmed: true },
      idempotencyKey('live-after-complete'),
    )
    expect(afterComplete.statusCode).toBe(409)
    expect(responseErrorCode(afterComplete)).toBe('STAGE_LOCKED')
  })

  it('lets only one concurrent command win an expected stage revision', async () => {
    const adminSession = await loginWithAllRoles(harness)
    const start = await runtime(
      harness,
      adminSession.cookie,
      adminSession.snapshot,
      { action: 'START', confirmed: true },
      idempotencyKey('concurrent-start'),
    )
    expect(start.statusCode).toBe(200)
    const running = AdminSnapshotSchema.parse(start.json())
    const options = [2, 3].map((targetStage) =>
      runtime(
        harness,
        adminSession.cookie,
        running,
        { action: 'JUMP', targetStage, confirmed: true },
        idempotencyKey('concurrent-runtime', targetStage),
      ),
    )
    const responses = await Promise.all(options)
    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([
      200,
      409,
    ])
    const conflict = responses.find(({ statusCode }) => statusCode === 409)
    expect(conflict && responseErrorCode(conflict)).toBe('STALE_STAGE')
  })

  it('replays an admin state change before version checks and conflicts on a changed command', async () => {
    const adminSession = await loginWithAllRoles(harness)
    const key = idempotencyKey('admin-command-replay')
    const request = {
      ...commandVersion(adminSession.snapshot),
      action: 'START',
      confirmed: true,
    }
    const send = (payload: Record<string, unknown>) =>
      harness.unsafeRequest(
        {
          method: 'POST',
          url: '/api/admin/runtime',
          headers: { 'idempotency-key': key },
          payload,
        },
        adminSession.cookie,
      )

    const first = await send(request)
    const replay = await send(request)
    const conflict = await send({
      ...request,
      action: 'JUMP',
      targetStage: 2,
    })
    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(200)
    expect(replay.json()).toEqual(first.json())
    expect(conflict.statusCode).toBe(409)
    expect(responseErrorCode(conflict)).toBe('IDEMPOTENCY_CONFLICT')
    expect(AdminSnapshotSchema.parse(first.json()).runtime).toMatchObject({
      status: 'RUNNING',
      stageRevision: adminSession.snapshot.runtime.stageRevision + 1,
    })
  })

  it('replays the same participant command but conflicts on a changed body', async () => {
    const prepared = await prepareStageFour(harness)
    const version = commandVersion(prepared.admin)
    const key = idempotencyKey('barrage-replay')
    const payload = {
      ...version,
      text: '幂等测试弹幕',
      publicNoticeAccepted: true,
    }
    const send = (body: Record<string, unknown>) =>
      harness.unsafeRequest(
        {
          method: 'POST',
          url: '/api/participant/barrages',
          headers: { 'idempotency-key': key },
          payload: body,
        },
        prepared.participantCookies[0],
      )

    const first = await send(payload)
    const replay = await send(payload)
    const conflict = await send({ ...payload, text: '相同键的不同正文' })
    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(200)
    expect(replay.json()).toEqual(first.json())
    expect(conflict.statusCode).toBe(409)
    expect(responseErrorCode(conflict)).toBe('IDEMPOTENCY_CONFLICT')

    const snapshot = ParticipantSnapshotSchema.parse(first.json())
    expect(snapshot.participant.publishedBarrageCount).toBe(1)
    expect(snapshot.participant.starlight).toBe(30)
  })

  it('deducts a concurrent/restarted gift once, never goes negative, and scopes keys by participant', async () => {
    const prepared = await prepareStageFour(harness)
    const version = commandVersion(prepared.admin)
    const sharedKey = idempotencyKey('shared-participant-scope')
    const giftPayload = {
      ...version,
      programId: 'program-001',
      giftId: 'gift-starship',
    }
    const sendGift = (cookie: string, key: string) =>
      harness.unsafeRequest(
        {
          method: 'POST',
          url: '/api/participant/gifts',
          headers: { 'idempotency-key': key },
          payload: giftPayload,
        },
        cookie,
      )

    const concurrentKey = idempotencyKey('concurrent-gift')
    const concurrent = await Promise.all([
      sendGift(prepared.participantCookies[0], concurrentKey),
      sendGift(prepared.participantCookies[0], concurrentKey),
    ])
    expect(concurrent.every(({ statusCode }) => statusCode === 200)).toBe(true)
    expect(concurrent[1].json()).toEqual(concurrent[0].json())
    expect(
      ParticipantSnapshotSchema.parse(concurrent[0].json()).participant
        .powerBalance,
    ).toBe(80)

    await harness.restart()
    const afterRestart = await sendGift(
      prepared.participantCookies[0],
      concurrentKey,
    )
    expect(afterRestart.statusCode).toBe(200)
    expect(afterRestart.json()).toEqual(concurrent[0].json())

    const [participantA, participantB] = await Promise.all([
      sendGift(prepared.participantCookies[0], sharedKey),
      sendGift(prepared.participantCookies[1], sharedKey),
    ])
    expect(participantA.statusCode).toBe(200)
    expect(participantB.statusCode).toBe(200)
    expect(
      ParticipantSnapshotSchema.parse(participantA.json()).participant
        .powerBalance,
    ).toBe(60)
    expect(
      ParticipantSnapshotSchema.parse(participantB.json()).participant
        .powerBalance,
    ).toBe(80)

    for (const sequence of [1, 2, 3]) {
      const drain = await sendGift(
        prepared.participantCookies[0],
        idempotencyKey('drain-starship', sequence),
      )
      expect(drain.statusCode).toBe(200)
    }

    const insufficient = await sendGift(
      prepared.participantCookies[0],
      idempotencyKey('insufficient-gift'),
    )
    expect(insufficient.statusCode).toBe(409)
    expect(responseErrorCode(insufficient)).toBe('INSUFFICIENT_BALANCE')
    const authoritative = await harness.request({
      method: 'GET',
      url: '/api/participant/snapshot',
      headers: { cookie: prepared.participantCookies[0] },
    })
    expect(
      ParticipantSnapshotSchema.parse(authoritative.json()).participant
        .powerBalance,
    ).toBe(0)
  })
})
