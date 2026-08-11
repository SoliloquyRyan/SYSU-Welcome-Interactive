import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  AdminSnapshotSchema,
  ParticipantSnapshotSchema,
  ScreenSnapshotSchema,
  type AdminSnapshot,
  type ParticipantSnapshot,
} from '../../packages/contracts/src/index.js'
import {
  commandVersion,
  createG2Harness,
  idempotencyKey,
  responseErrorCode,
  type G2Harness,
} from '../helpers/g2-harness.js'

async function grantAll(
  harness: G2Harness,
  adminCookie: string,
  snapshot: AdminSnapshot,
): Promise<AdminSnapshot> {
  const response = await harness.unsafeRequest(
    {
      method: 'PUT',
      url: '/api/admin/roles',
      headers: { 'idempotency-key': idempotencyKey('grant-all') },
      payload: { ...commandVersion(snapshot), roles: ['ALL'] },
    },
    adminCookie,
  )
  expect(response.statusCode).toBe(200)
  return AdminSnapshotSchema.parse(response.json())
}

async function runtimeCommand(
  harness: G2Harness,
  adminCookie: string,
  snapshot: AdminSnapshot,
  command: Record<string, unknown>,
  sequence: number,
): Promise<AdminSnapshot> {
  const response = await harness.unsafeRequest(
    {
      method: 'POST',
      url: '/api/admin/runtime',
      headers: {
        'idempotency-key': idempotencyKey('runtime', sequence),
      },
      payload: { ...commandVersion(snapshot), ...command },
    },
    adminCookie,
  )
  expect(response.statusCode).toBe(200)
  return AdminSnapshotSchema.parse(response.json())
}

async function participantWrite(
  harness: G2Harness,
  participantCookie: string,
  method: 'POST' | 'PUT',
  url: string,
  version: { resetEpoch: number; stageRevision: number },
  payload: Record<string, unknown>,
  key: string,
): Promise<ParticipantSnapshot> {
  const response = await harness.unsafeRequest(
    {
      method,
      url,
      headers: { 'idempotency-key': key },
      payload: { ...version, ...payload },
    },
    participantCookie,
  )
  expect(response.statusCode).toBe(200)
  return ParticipantSnapshotSchema.parse(response.json())
}

describe('G2 six-stage participant and screen flow', () => {
  let harness: G2Harness

  beforeEach(async () => {
    harness = await createG2Harness()
  })

  afterEach(async () => {
    await harness.close()
  })

  it('completes all six stages with exact double-value rewards and public privacy', async () => {
    const activation = await harness.activate()
    let participant = ParticipantSnapshotSchema.parse(activation.response.json())
    expect(participant.participant).toMatchObject({
      powerBalance: 100,
      starlight: 20,
      capsuleMessageSubmitted: false,
      capsulePublicNoticeAccepted: false,
      capsuleCandidateStatus: 'NOT_SUBMITTED',
      starStarted: false,
      firstGiftCompleted: false,
      firstBarrageCompleted: false,
      cooperativeLightCompleted: false,
    })

    const adminLogin = await harness.adminLogin()
    let admin = await grantAll(
      harness,
      adminLogin.cookie,
      AdminSnapshotSchema.parse(adminLogin.response.json()),
    )
    admin = await runtimeCommand(
      harness,
      adminLogin.cookie,
      admin,
      { action: 'START', confirmed: true },
      1,
    )

    admin = await runtimeCommand(
      harness,
      adminLogin.cookie,
      admin,
      { action: 'JUMP', targetStage: 2, confirmed: true },
      2,
    )
    participant = await participantWrite(
      harness,
      activation.cookie,
      'PUT',
      '/api/participant/capsule-message',
      commandVersion(admin),
      {
        text: '写给未来的合成寄语',
        publicDisplayNoticeAccepted: true,
      },
      idempotencyKey('capsule-message', 1),
    )
    expect(participant.participant).toMatchObject({
      capsuleMessage: '写给未来的合成寄语',
      capsuleMessageSubmitted: true,
      capsulePublicNoticeAccepted: true,
      capsuleCandidateStatus: 'SUBMITTED',
      starlight: 40,
    })
    participant = await participantWrite(
      harness,
      activation.cookie,
      'PUT',
      '/api/participant/capsule-message',
      commandVersion(admin),
      {
        text: '更新后的时光胶囊',
        publicDisplayNoticeAccepted: true,
      },
      idempotencyKey('capsule-message', 2),
    )
    expect(participant.participant.capsuleMessage).toBe('更新后的时光胶囊')
    expect(participant.participant.starlight).toBe(40)

    admin = await runtimeCommand(
      harness,
      adminLogin.cookie,
      admin,
      { action: 'JUMP', targetStage: 3, confirmed: true },
      3,
    )
    participant = await participantWrite(
      harness,
      activation.cookie,
      'POST',
      '/api/participant/star/start',
      commandVersion(admin),
      {},
      idempotencyKey('star-start'),
    )
    expect(participant.participant).toMatchObject({
      starStarted: true,
      starlight: 60,
    })

    admin = await runtimeCommand(
      harness,
      adminLogin.cookie,
      admin,
      { action: 'JUMP', targetStage: 4, confirmed: true },
      4,
    )
    admin = await runtimeCommand(
      harness,
      adminLogin.cookie,
      admin,
      {
        action: 'SET_PROGRAM',
        programId: 'program-001',
        confirmed: true,
      },
      5,
    )
    participant = await participantWrite(
      harness,
      activation.cookie,
      'POST',
      '/api/participant/gifts',
      commandVersion(admin),
      { programId: 'program-001', giftId: 'gift-glimmer' },
      idempotencyKey('first-gift'),
    )
    expect(participant.participant).toMatchObject({
      powerBalance: 95,
      starlight: 70,
      firstGiftCompleted: true,
      giftCount: 1,
    })
    expect(participant.giftHistory).toHaveLength(1)

    participant = await participantWrite(
      harness,
      activation.cookie,
      'POST',
      '/api/participant/barrages',
      commandVersion(admin),
      { text: '一起抵达新起点', publicNoticeAccepted: true },
      idempotencyKey('first-barrage'),
    )
    expect(participant.participant).toMatchObject({
      starlight: 80,
      firstBarrageCompleted: true,
      publishedBarrageCount: 1,
    })

    admin = await runtimeCommand(
      harness,
      adminLogin.cookie,
      admin,
      { action: 'JUMP', targetStage: 5, confirmed: true },
      6,
    )
    participant = await participantWrite(
      harness,
      activation.cookie,
      'POST',
      '/api/participant/cooperative-light',
      commandVersion(admin),
      {},
      idempotencyKey('cooperative-light'),
    )
    expect(participant.participant).toMatchObject({
      starlight: 100,
      cooperativeLightCompleted: true,
    })

    admin = await runtimeCommand(
      harness,
      adminLogin.cookie,
      admin,
      { action: 'JUMP', targetStage: 6, confirmed: true },
      7,
    )
    const finalParticipantResponse = await harness.request({
      method: 'GET',
      url: '/api/participant/snapshot',
      headers: { cookie: activation.cookie },
    })
    const finalParticipant = ParticipantSnapshotSchema.parse(
      finalParticipantResponse.json(),
    )
    expect(finalParticipant.runtime.stage).toBe(6)
    expect(finalParticipant.archiveAvailable).toBe(true)
    expect(finalParticipant.participant.starlight).toBe(100)
    expect(finalParticipant.participant.powerBalance).toBe(95)

    const screenResponse = await harness.request({
      method: 'GET',
      url: '/api/screen/snapshot',
    })
    const screen = ScreenSnapshotSchema.parse(screenResponse.json())
    expect(screen.runtime.stage).toBe(6)
    expect(screen.aggregates).toMatchObject({
      activatedCount: 1,
      starCreatedCount: 1,
      starStartedCount: 1,
      totalStarlight: 100,
      cooperativeLightCount: 1,
      eligibleParticipantCount: 1,
    })
    expect(screen.programs.find(({ id }) => id === 'program-001')?.heat).toBe(5)
    expect(screen.publishedBarrages).toHaveLength(1)
    const publicJson = JSON.stringify(screen)
    expect(publicJson).not.toContain(finalParticipant.participant.displayName)
    expect(publicJson).not.toContain('更新后的时光胶囊')
    expect(publicJson).not.toContain(harness.manifest.participants[0].demoCode)
    expect(publicJson).not.toContain(harness.manifest.participants[0].inviteToken)
  })

  it('locks participant actions to their stages and keeps reads available', async () => {
    const activation = await harness.activate()
    const participant = ParticipantSnapshotSchema.parse(activation.response.json())
    const wrongStage = await harness.unsafeRequest(
      {
        method: 'POST',
        url: '/api/participant/star/start',
        headers: { 'idempotency-key': idempotencyKey('wrong-stage-star') },
        payload: commandVersion(participant),
      },
      activation.cookie,
    )
    expect(wrongStage.statusCode).toBe(409)
    expect(responseErrorCode(wrongStage)).toBe('STAGE_LOCKED')

    const snapshot = await harness.request({
      method: 'GET',
      url: '/api/participant/snapshot',
      headers: { cookie: activation.cookie },
    })
    expect(snapshot.statusCode).toBe(200)
    expect(
      ParticipantSnapshotSchema.parse(snapshot.json()).participant.starlight,
    ).toBe(20)
  })

  it('locks one stellar temperature across sessions and projects it anonymously', async () => {
    const activation = await harness.activate()
    const initial = ParticipantSnapshotSchema.parse(activation.response.json())
    expect(initial.participant).toMatchObject({
      starTemperatureKelvin: null,
      starTemperatureLocked: false,
    })

    const selectedResponse = await harness.unsafeRequest(
      {
        method: 'PUT',
        url: '/api/participant/star-temperature',
        headers: { 'idempotency-key': idempotencyKey('star-temperature') },
        payload: {
          ...commandVersion(initial),
          temperatureKelvin: 7350,
        },
      },
      activation.cookie,
    )
    expect(selectedResponse.statusCode).toBe(200)
    const selected = ParticipantSnapshotSchema.parse(selectedResponse.json())
    expect(selected.participant).toMatchObject({
      starTemperatureKelvin: 7350,
      starTemperatureLocked: true,
    })

    const sameValue = await harness.unsafeRequest(
      {
        method: 'PUT',
        url: '/api/participant/star-temperature',
        headers: { 'idempotency-key': idempotencyKey('star-temperature', 2) },
        payload: {
          ...commandVersion(selected),
          temperatureKelvin: 7350,
        },
      },
      activation.cookie,
    )
    expect(sameValue.statusCode).toBe(200)

    const changedValue = await harness.unsafeRequest(
      {
        method: 'PUT',
        url: '/api/participant/star-temperature',
        headers: { 'idempotency-key': idempotencyKey('star-temperature', 3) },
        payload: {
          ...commandVersion(selected),
          temperatureKelvin: 9200,
        },
      },
      activation.cookie,
    )
    expect(changedValue.statusCode).toBe(409)
    expect(responseErrorCode(changedValue)).toBe('STAR_TEMPERATURE_LOCKED')

    const secondDevice = await harness.activate(0, {
      idempotencyKey: idempotencyKey('second-device-activation'),
    })
    expect(
      ParticipantSnapshotSchema.parse(secondDevice.response.json()).participant,
    ).toMatchObject({
      starTemperatureKelvin: 7350,
      starTemperatureLocked: true,
    })

    const screen = ScreenSnapshotSchema.parse(
      (
        await harness.request({ method: 'GET', url: '/api/screen/snapshot' })
      ).json(),
    )
    expect(screen.starNodes).toEqual([
      expect.objectContaining({
        id: selected.participant.publicStarId,
        starTemperatureKelvin: 7350,
      }),
    ])
    expect(JSON.stringify(screen)).not.toContain(selected.participant.displayName)
  })
})
