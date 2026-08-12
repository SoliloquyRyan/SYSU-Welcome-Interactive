import { describe, expect, it } from 'vitest'

import {
  ActivateParticipantRequestSchema,
  AdminLoginRequestSchema,
  AdminSnapshotSchema,
  BarrageRequestSchema,
  DemoResetRequestSchema,
  CapsuleMessageRequestSchema,
  G2RealtimeEventEnvelopeSchema,
  GiftRequestSchema,
  ParticipantSnapshotSchema,
  RuntimeCommandRequestSchema,
  ScreenSnapshotSchema,
  StarTemperatureRequestSchema,
} from '../../packages/contracts/src/index.js'

const NOW = '2026-08-10T04:00:00.000Z'
const VERSION = { resetEpoch: 1, stageRevision: 0 }

function runtime() {
  return {
    ...VERSION,
    mode: 'REHEARSAL' as const,
    status: 'READY' as const,
    stage: 1,
    barragePaused: false,
    updatedAt: NOW,
    currentProgramId: null,
  }
}

function participantSnapshot() {
  return {
    status: 'ok' as const,
    protocolVersion: '1' as const,
    generatedAt: NOW,
    eventSeq: 0,
    runtime: runtime(),
    participant: {
      id: 'synthetic-001',
      displayName: '合成访客',
      publicStarId: 'STAR-001',
      visualSeed: 'a'.repeat(32),
      starTemperatureKelvin: null,
      starTemperatureLocked: false,
      powerBalance: 100,
      starlight: 20,
      activatedAt: NOW,
      capsuleMessage: null,
      capsuleMessageSubmitted: false,
      capsulePublicNoticeAccepted: false,
      capsuleCandidateStatus: 'NOT_SUBMITTED',
      starStarted: false,
      firstGiftCompleted: false,
      firstBarrageCompleted: false,
      cooperativeLightCompleted: false,
      giftCount: 0,
      publishedBarrageCount: 0,
      interactionCount: 0,
    },
    programs: [],
    gifts: [],
    giftHistory: [],
    archiveAvailable: false,
  }
}

function adminSnapshot() {
  return {
    status: 'ok' as const,
    protocolVersion: '1' as const,
    generatedAt: NOW,
    eventSeq: 0,
    session: { shortId: 'A001', roles: ['ALL' as const] },
    runtime: runtime(),
    metrics: {
      activatedCount: 1,
      onlineParticipantSessions: 1,
      onlineAdminSessions: 1,
      successfulActivations: 1,
      invalidEntryAttempts: 0,
      publishedBarrageCount: 0,
      removedBarrageCount: 0,
      blockedSourceCount: 0,
      recentFailureCount: 0,
    },
    programs: [],
    gifts: [],
    publishedBarrages: [],
    invitations: [],
    recentOperations: [],
  }
}

describe('G2 strict business contracts', () => {
  it.each([
    {
      schema: ActivateParticipantRequestSchema,
      value: {
        method: 'INVITATION_TOKEN',
        token: 'a'.repeat(43),
      },
    },
    {
      schema: AdminLoginRequestSchema,
      value: { username: 'demo-admin', password: 'synthetic-password' },
    },
    {
      schema: CapsuleMessageRequestSchema,
      value: {
        ...VERSION,
        text: '给未来的一句话',
        publicDisplayNoticeAccepted: true,
      },
    },
    {
      schema: StarTemperatureRequestSchema,
      value: { ...VERSION, temperatureKelvin: 5800 },
    },
    {
      schema: GiftRequestSchema,
      value: { ...VERSION, programId: 'program-001', giftId: 'gift-glimmer' },
    },
    {
      schema: BarrageRequestSchema,
      value: { ...VERSION, text: '一起抵达', publicNoticeAccepted: true },
    },
    {
      schema: RuntimeCommandRequestSchema,
      value: { ...VERSION, action: 'START', confirmed: true },
    },
    {
      schema: DemoResetRequestSchema,
      value: { ...VERSION, confirmation: 'RESET DEMO' },
    },
  ])('rejects unknown fields in every public write DTO', ({ schema, value }) => {
    expect(schema.parse(value)).toEqual(value)
    expect(() => schema.parse({ ...value, unexpected: 'private' })).toThrow()
  })

  it('enforces credential and content boundary values', () => {
    expect(() =>
      ActivateParticipantRequestSchema.parse({
        method: 'INVITATION_TOKEN',
        token: 'short',
      }),
    ).toThrow()
    expect(() =>
      ActivateParticipantRequestSchema.parse({
        method: 'STUDENT_ID',
        displayName: '合成访客',
        studentNumber: '2026ABCD',
      }),
    ).toThrow()
    expect(
      ActivateParticipantRequestSchema.parse({
        method: 'STUDENT_ID',
        displayName: '合成访客',
        studentNumber: '202600000001',
      }),
    ).toEqual({
      method: 'STUDENT_ID',
      displayName: '合成访客',
      studentNumber: '202600000001',
    })
    expect(() =>
      CapsuleMessageRequestSchema.parse({
        ...VERSION,
        text: '寄'.repeat(81),
        publicDisplayNoticeAccepted: true,
      }),
    ).toThrow()
    expect(() =>
      CapsuleMessageRequestSchema.parse({
        ...VERSION,
        text: '还没有确认公开候选告知',
        publicDisplayNoticeAccepted: false,
      }),
    ).toThrow()
    expect(() =>
      BarrageRequestSchema.parse({
        ...VERSION,
        text: '没有公开告知确认',
        publicNoticeAccepted: false,
      }),
    ).toThrow()
    expect(() =>
      StarTemperatureRequestSchema.parse({
        ...VERSION,
        temperatureKelvin: 12050,
      }),
    ).toThrow()
  })

  it('keeps participant and admin snapshots strict at every private boundary', () => {
    const participant = participantSnapshot()
    const admin = adminSnapshot()
    expect(ParticipantSnapshotSchema.parse(participant)).toEqual(participant)
    expect(AdminSnapshotSchema.parse(admin)).toEqual(admin)

    expect(() =>
      ParticipantSnapshotSchema.parse({
        ...participant,
        participant: {
          ...participant.participant,
          inviteToken: 'forbidden',
        },
      }),
    ).toThrow()
    expect(() =>
      AdminSnapshotSchema.parse({
        ...admin,
        session: {
          ...admin.session,
          cookie: 'forbidden',
        },
      }),
    ).toThrow()
    expect(() =>
      AdminSnapshotSchema.parse({
        ...admin,
        capsuleMessages: ['forbidden'],
      }),
    ).toThrow()
  })

  it('keeps screen snapshots aggregate-only and rejects private identity fields', () => {
    const screen = {
      protocolVersion: '1',
      generatedAt: NOW,
      eventSeq: 0,
      runtime: runtime(),
      displayBatch: 0,
      programs: [],
      aggregates: {
        activatedCount: 1,
        starCreatedCount: 1,
        starStartedCount: 0,
        totalStarlight: 20,
        interactionCount: 0,
        cooperativeLightCount: 0,
        eligibleParticipantCount: 1,
        levelDistribution: {
          activated: 1,
          connected: 0,
          resonant: 0,
          completed: 0,
        },
      },
      starNodes: [],
      publishedBarrages: [],
    }
    expect(ScreenSnapshotSchema.parse(screen)).toEqual(screen)

    for (const field of [
      'displayName',
      'capsuleMessage',
      'studentNumber',
      'inviteToken',
      'cookie',
      'password',
    ]) {
      expect(() =>
        ScreenSnapshotSchema.parse({ ...screen, [field]: 'forbidden' }),
      ).toThrow()
    }
  })

  it('accepts only the frozen, strict G2 screen event vocabulary', () => {
    const event = {
      protocolVersion: '1',
      resetEpoch: 1,
      stream: 'screen',
      eventSeq: 1,
      eventId: 'event-001',
      type: 'star.started',
      committedAt: NOW,
      payload: { publicStarId: 'STAR-001', starStartedCount: 1 },
    }
    expect(G2RealtimeEventEnvelopeSchema.parse(event)).toEqual(event)
    expect(() =>
      G2RealtimeEventEnvelopeSchema.parse({
        ...event,
        payload: { ...event.payload, displayName: 'forbidden' },
      }),
    ).toThrow()
    expect(() =>
      G2RealtimeEventEnvelopeSchema.parse({
        ...event,
        type: 'unfrozen.event',
      }),
    ).toThrow()
  })
})
