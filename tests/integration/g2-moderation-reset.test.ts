import fs from 'node:fs'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  AdminSnapshotSchema,
  ParticipantSnapshotSchema,
  ScreenSnapshotSchema,
  type AdminSnapshot,
} from '../../packages/contracts/src/index.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import {
  commandVersion,
  createG2Harness,
  idempotencyKey,
  responseErrorCode,
  type G2Harness,
} from '../helpers/g2-harness.js'

async function adminWithRoles(harness: G2Harness): Promise<{
  cookie: string
  snapshot: AdminSnapshot
}> {
  const login = await harness.adminLogin()
  const loginSnapshot = AdminSnapshotSchema.parse(login.response.json())
  const response = await harness.unsafeRequest(
    {
      method: 'PUT',
      url: '/api/admin/roles',
      headers: { 'idempotency-key': idempotencyKey('moderation-roles') },
      payload: { ...commandVersion(loginSnapshot), roles: ['ALL'] },
    },
    login.cookie,
  )
  expect(response.statusCode).toBe(200)
  return {
    cookie: login.cookie,
    snapshot: AdminSnapshotSchema.parse(response.json()),
  }
}

async function adminWrite(
  harness: G2Harness,
  cookie: string,
  snapshot: AdminSnapshot,
  method: 'POST' | 'PUT',
  url: string,
  payload: Record<string, unknown>,
  key: string,
): Promise<AdminSnapshot> {
  const response = await harness.unsafeRequest(
    {
      method,
      url,
      headers: { 'idempotency-key': key },
      payload: { ...commandVersion(snapshot), ...payload },
    },
    cookie,
  )
  expect(response.statusCode).toBe(200)
  return AdminSnapshotSchema.parse(response.json())
}

async function startAndJump(
  harness: G2Harness,
  cookie: string,
  snapshot: AdminSnapshot,
  stage: 1 | 2 | 3 | 4 | 5 | 6,
  sequence: number,
): Promise<AdminSnapshot> {
  let current = snapshot
  if (current.runtime.status === 'READY') {
    current = await adminWrite(
      harness,
      cookie,
      current,
      'POST',
      '/api/admin/runtime',
      { action: 'START', confirmed: true },
      idempotencyKey('moderation-start', sequence),
    )
  }
  if (current.runtime.stage !== stage) {
    current = await adminWrite(
      harness,
      cookie,
      current,
      'POST',
      '/api/admin/runtime',
      { action: 'JUMP', targetStage: stage, confirmed: true },
      idempotencyKey('moderation-jump', sequence),
    )
  }
  return current
}

async function publishBarrage(
  harness: G2Harness,
  cookie: string,
  version: { resetEpoch: number; stageRevision: number },
  text: string,
  sequence: number,
) {
  return harness.unsafeRequest(
    {
      method: 'POST',
      url: '/api/participant/barrages',
      headers: { 'idempotency-key': idempotencyKey('moderation-barrage', sequence) },
      payload: { ...version, text, publicNoticeAccepted: true },
    },
    cookie,
  )
}

describe('G2 deterministic barrage moderation and complete reset', () => {
  let harness: G2Harness

  beforeEach(async () => {
    harness = await createG2Harness()
  })

  afterEach(async () => {
    await harness.close()
  })

  it('rejects sensitive, URL, contact, overlong and over-frequency content without rewarding or publishing it', async () => {
    const participant = await harness.activate()
    const adminSession = await adminWithRoles(harness)
    let admin = await startAndJump(
      harness,
      adminSession.cookie,
      adminSession.snapshot,
      4,
      1,
    )
    const version = commandVersion(admin)

    const rejectedSamples = [
      '这是一条敏感词测试',
      '访问 https://example.invalid',
      '联系 138-0000-0000',
      '微信 abc123',
    ]
    for (const [index, text] of rejectedSamples.entries()) {
      const response = await publishBarrage(
        harness,
        participant.cookie,
        version,
        text,
        index + 1,
      )
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
      expect(responseErrorCode(response)).toBe('CONTENT_REJECTED')
      harness.advance(11_000)
    }

    const overlong = await publishBarrage(
      harness,
      participant.cookie,
      version,
      '长'.repeat(41),
      5,
    )
    expect(overlong.statusCode).toBe(400)
    expect(responseErrorCode(overlong)).toBe('VALIDATION_FAILED')

    const privateSnapshot = await harness.request({
      method: 'GET',
      url: '/api/participant/snapshot',
      headers: { cookie: participant.cookie },
    })
    expect(
      ParticipantSnapshotSchema.parse(privateSnapshot.json()).participant,
    ).toMatchObject({ starlight: 20, publishedBarrageCount: 0 })
    const screen = ScreenSnapshotSchema.parse(
      (
        await harness.request({
          method: 'GET',
          url: '/api/screen/snapshot',
        })
      ).json(),
    )
    expect(screen.publishedBarrages).toEqual([])

    for (const sequence of [6, 7, 8]) {
      const response = await publishBarrage(
        harness,
        participant.cookie,
        version,
        `合规弹幕 ${sequence}`,
        sequence,
      )
      expect(response.statusCode).toBe(200)
    }
    const limited = await publishBarrage(
      harness,
      participant.cookie,
      version,
      '第 4 条过频弹幕',
      9,
    )
    expect(limited.statusCode).toBe(429)
    expect(responseErrorCode(limited)).toBe('RATE_LIMITED')
    const afterRateLimit = ParticipantSnapshotSchema.parse(
      (
        await harness.request({
          method: 'GET',
          url: '/api/participant/snapshot',
          headers: { cookie: participant.cookie },
        })
      ).json(),
    )
    expect(afterRateLimit.participant).toMatchObject({
      starlight: 30,
      publishedBarrageCount: 3,
    })
  })

  it('removes, blocks, pauses and clears only public barrages', async () => {
    const [participantA, participantB] = await Promise.all([
      harness.activate(0, {
        idempotencyKey: idempotencyKey('moderation-activate', 1),
      }),
      harness.activate(1, {
        idempotencyKey: idempotencyKey('moderation-activate', 2),
      }),
    ])
    const adminSession = await adminWithRoles(harness)
    let admin = await startAndJump(
      harness,
      adminSession.cookie,
      adminSession.snapshot,
      4,
      2,
    )
    const version = commandVersion(admin)

    for (const [cookie, text, sequence] of [
      [participantA.cookie, '来源 A 第一条', 10],
      [participantA.cookie, '来源 A 第二条', 11],
      [participantB.cookie, '来源 B 保留条', 12],
    ] as const) {
      expect(
        (await publishBarrage(harness, cookie, version, text, sequence)).statusCode,
      ).toBe(200)
    }

    admin = AdminSnapshotSchema.parse(
      (
        await harness.request({
          method: 'GET',
          url: '/api/admin/snapshot',
          headers: { cookie: adminSession.cookie },
        })
      ).json(),
    )
    const sourceAItems = admin.publishedBarrages.filter(
      ({ text }) => text.startsWith('来源 A'),
    )
    const sourceBItem = admin.publishedBarrages.find(
      ({ text }) => text === '来源 B 保留条',
    )
    expect(sourceAItems).toHaveLength(2)
    expect(sourceBItem).toBeDefined()

    admin = await adminWrite(
      harness,
      adminSession.cookie,
      admin,
      'POST',
      `/api/admin/barrages/${sourceAItems[0].id}/remove`,
      { confirmed: true },
      idempotencyKey('remove-barrage'),
    )
    expect(admin.publishedBarrages.some(({ id }) => id === sourceAItems[0].id)).toBe(
      false,
    )

    admin = await adminWrite(
      harness,
      adminSession.cookie,
      admin,
      'POST',
      `/api/admin/sources/${sourceAItems[1].sourceId}/block`,
      { confirmed: true },
      idempotencyKey('block-source'),
    )
    expect(
      admin.publishedBarrages.some(({ sourceId }) => sourceId === sourceAItems[1].sourceId),
    ).toBe(false)
    expect(admin.publishedBarrages.some(({ id }) => id === sourceBItem?.id)).toBe(true)

    const blocked = await publishBarrage(
      harness,
      participantA.cookie,
      commandVersion(admin),
      '来源 A 被屏蔽后的新内容',
      13,
    )
    expect(blocked.statusCode).toBe(403)
    expect(responseErrorCode(blocked)).toBe('SOURCE_BLOCKED')

    admin = await adminWrite(
      harness,
      adminSession.cookie,
      admin,
      'POST',
      '/api/admin/barrages/pause',
      { paused: true },
      idempotencyKey('pause-barrages', 1),
    )
    const paused = await publishBarrage(
      harness,
      participantB.cookie,
      commandVersion(admin),
      '暂停期间不得发布',
      14,
    )
    expect(paused.statusCode).toBe(409)
    expect(responseErrorCode(paused)).toBe('RUNTIME_PAUSED')

    admin = await adminWrite(
      harness,
      adminSession.cookie,
      admin,
      'POST',
      '/api/admin/barrages/pause',
      { paused: false },
      idempotencyKey('pause-barrages', 2),
    )
    expect(
      (
        await publishBarrage(
          harness,
          participantB.cookie,
          commandVersion(admin),
          '恢复后的公开内容',
          15,
        )
      ).statusCode,
    ).toBe(200)
    admin = AdminSnapshotSchema.parse(
      (
        await harness.request({
          method: 'GET',
          url: '/api/admin/snapshot',
          headers: { cookie: adminSession.cookie },
        })
      ).json(),
    )
    admin = await adminWrite(
      harness,
      adminSession.cookie,
      admin,
      'POST',
      '/api/admin/barrages/clear',
      { confirmed: true },
      idempotencyKey('clear-barrages'),
    )
    expect(admin.publishedBarrages).toEqual([])

    const screen = ScreenSnapshotSchema.parse(
      (
        await harness.request({
          method: 'GET',
          url: '/api/screen/snapshot',
        })
      ).json(),
    )
    expect(screen.publishedBarrages).toEqual([])
    const privateA = await harness.request({
      method: 'GET',
      url: '/api/participant/snapshot',
      headers: { cookie: participantA.cookie },
    })
    expect(privateA.statusCode).toBe(200)
  })

  it('clears every mutable domain, revokes old sessions and preserves fixed invitation credentials', async () => {
    const manifestBefore = fs.readFileSync(harness.config.seedManifestPath, 'utf8')
    const participant = await harness.activate()
    const oldParticipantVersion = commandVersion(participant.response.json())
    const adminSession = await adminWithRoles(harness)
    let admin = await startAndJump(
      harness,
      adminSession.cookie,
      adminSession.snapshot,
      4,
      3,
    )
    admin = await adminWrite(
      harness,
      adminSession.cookie,
      admin,
      'POST',
      '/api/admin/runtime',
      { action: 'SET_PROGRAM', programId: 'program-001', confirmed: true },
      idempotencyKey('reset-program'),
    )
    const version = commandVersion(admin)
    const gift = await harness.unsafeRequest(
      {
        method: 'POST',
        url: '/api/participant/gifts',
        headers: { 'idempotency-key': idempotencyKey('reset-gift') },
        payload: {
          ...version,
          programId: 'program-001',
          giftId: 'gift-beacon',
        },
      },
      participant.cookie,
    )
    expect(gift.statusCode).toBe(200)
    expect(
      (
        await publishBarrage(
          harness,
          participant.cookie,
          version,
          '重置前公开内容',
          20,
        )
      ).statusCode,
    ).toBe(200)

    const reset = await harness.unsafeRequest(
      {
        method: 'POST',
        url: '/api/admin/reset',
        headers: { 'idempotency-key': idempotencyKey('complete-reset') },
        payload: {
          ...commandVersion(admin),
          confirmation: 'RESET DEMO',
        },
      },
      adminSession.cookie,
    )
    expect(reset.statusCode).toBe(200)
    expect(reset.json()).toMatchObject({ status: 'ok', resetEpoch: 2 })
    expect(fs.readFileSync(harness.config.seedManifestPath, 'utf8')).toBe(
      manifestBefore,
    )

    const [oldParticipant, oldAdmin] = await Promise.all([
      harness.request({
        method: 'GET',
        url: '/api/participant/snapshot',
        headers: { cookie: participant.cookie },
      }),
      harness.request({
        method: 'GET',
        url: '/api/admin/snapshot',
        headers: { cookie: adminSession.cookie },
      }),
    ])
    expect(oldParticipant.statusCode).toBe(401)
    expect(oldAdmin.statusCode).toBe(401)

    const screen = ScreenSnapshotSchema.parse(
      (
        await harness.request({ method: 'GET', url: '/api/screen/snapshot' })
      ).json(),
    )
    expect(screen).toMatchObject({
      runtime: {
        resetEpoch: 2,
        stageRevision: 0,
        mode: 'REHEARSAL',
        status: 'READY',
        stage: 1,
      },
      displayBatch: 0,
      publishedBarrages: [],
    })
    expect(screen.programs.every(({ heat }) => heat === 0)).toBe(true)
    expect(screen.aggregates).toMatchObject({
      activatedCount: 0,
      starCreatedCount: 0,
      starStartedCount: 0,
      totalStarlight: 0,
      interactionCount: 0,
      cooperativeLightCount: 0,
      eligibleParticipantCount: 0,
    })

    const database = openDatabase(harness.config.databasePath)
    try {
      const mutableCounts = database
        .prepare(
          `SELECT
             (SELECT count(*) FROM participant_states) AS participantStates,
             (SELECT count(*) FROM value_ledger) AS valueLedger,
             (SELECT count(*) FROM gift_transactions) AS gifts,
             (SELECT count(*) FROM barrages) AS barrages,
             (SELECT count(*) FROM blocked_sources) AS blockedSources,
             (SELECT count(*) FROM cooperative_lights) AS cooperativeLights,
             (SELECT count(*) FROM activation_attempts) AS activationAttempts,
             (SELECT count(*) FROM sessions) AS sessions,
             (SELECT count(*) FROM sessions
                WHERE reset_epoch <> (SELECT reset_epoch FROM app_state WHERE id = 1)
             ) AS staleSessions`,
        )
        .get() as Record<string, number>
      expect(mutableCounts).toMatchObject({
        participantStates: 0,
        valueLedger: 0,
        gifts: 0,
        barrages: 0,
        blockedSources: 0,
        cooperativeLights: 0,
        activationAttempts: 0,
        staleSessions: 0,
      })
      // Reset may rotate the initiating admin onto one fresh current-epoch
      // session, but must not retain either of the old sessions.
      expect(mutableCounts.sessions).toBeLessThanOrEqual(1)
    } finally {
      database.close()
    }

    const reactivated = await harness.activate(0, {
      idempotencyKey: idempotencyKey('reactivate-after-reset'),
    })
    const restored = ParticipantSnapshotSchema.parse(reactivated.response.json())
    expect(restored.participant).toMatchObject({
      powerBalance: 100,
      starlight: 20,
      futureMessage: null,
      futureMessageSaved: false,
      starStarted: false,
      firstGiftCompleted: false,
      firstBarrageCompleted: false,
      cooperativeLightCompleted: false,
      giftCount: 0,
      publishedBarrageCount: 0,
    })
    const staleEpoch = await harness.unsafeRequest(
      {
        method: 'PUT',
        url: '/api/participant/future-message',
        headers: { 'idempotency-key': idempotencyKey('old-reset-epoch') },
        payload: { ...oldParticipantVersion, text: '旧 epoch 写入' },
      },
      reactivated.cookie,
    )
    expect(staleEpoch.statusCode).toBe(409)
    expect(responseErrorCode(staleEpoch)).toBe('RESET_EPOCH_CHANGED')
  })
})
