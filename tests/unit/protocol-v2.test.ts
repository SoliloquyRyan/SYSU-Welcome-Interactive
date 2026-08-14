import { describe, expect, it } from 'vitest'

import {
  ProtocolVersionSchema,
  V2AdminSnapshotSchema,
  V2AdminCommandSchema,
  V2ApiErrorResponseSchema,
  V2ApiErrorSchema,
  V2_ERROR_CODES,
  V2HandshakeRequestSchema,
  V2ParticipantCommandSchema,
  V2ParticipantProjectionSchema,
  V2ParticipantSnapshotSchema,
  V2ProtocolCapabilitiesResponseSchema,
  V2ProtocolLifecycleSchema,
  V2PublicAggregateSchema,
  V2RealtimeEventEnvelopeSchema,
  V2RealtimeHelloAckSchema,
  V2RuntimeTupleSchema,
  V2ScreenSnapshotSchema,
} from '../../packages/contracts/src/index.js'

const NOW = '2026-08-13T04:00:00.000Z'

const CONTRACTS_READY = {
  contractVersion: '2' as const,
  activeRuntimeVersion: '1' as const,
  activationState: 'CONTRACTS_READY' as const,
  capabilities: {
    v2BusinessWrites: false as const,
    v2Snapshots: false as const,
    v2RealtimeEvents: false as const,
    snapshotFirst: true as const,
    splitStreams: true as const,
    v1WriteAcceptedByV2: false as const,
  },
}

const ACTIVE = {
  contractVersion: '2' as const,
  activeRuntimeVersion: '2' as const,
  activationState: 'ACTIVE' as const,
  capabilities: {
    v2BusinessWrites: true as const,
    v2Snapshots: true as const,
    v2RealtimeEvents: true as const,
    snapshotFirst: true as const,
    splitStreams: true as const,
    v1WriteAcceptedByV2: false as const,
  },
}

function readyRuntime(runRevision = 0) {
  return {
    mode: 'REHEARSAL' as const,
    status: 'READY' as const,
    currentScene: null,
    runRevision,
  }
}

function needsColorParticipant() {
  return {
    participantRevision: 1,
    onboardingState: 'NEEDS_COLOR' as const,
    activatedAt: NOW,
    colorTemperatureKelvin: null,
    displayColor: null,
    colorLockedAt: null,
    ownPublicStarId: null,
    formationSlot: null,
    capsuleDecision: 'NONE' as const,
    capsuleText: null,
    candidateScopeAcceptedAt: null,
    submittedAt: null,
    skippedAt: null,
    capsuleModerationStatus: null,
    admittedAt: null,
    admittedScene: null,
    admittedRunRevision: null,
    started: false,
    startedAt: null,
    firstGiftRewardedAt: null,
    firstBarrageRewardedAt: null,
    cooperativeLightAt: null,
    powerBalance: 100,
    starlight: 20,
    rewards: [
      {
        eventKey: 'ACTIVATED' as const,
        delta: 20,
        rewardRuleVersion: 'demo-v2-r1',
        awardedAt: NOW,
      },
    ],
    allowedActions: ['LOCK_COLOR' as const],
  }
}

function participantSnapshot() {
  return {
    status: 'ok' as const,
    protocolVersion: '2' as const,
    resetEpoch: 1,
    generatedAt: NOW,
    runtime: readyRuntime(),
    presentation: { type: 'NONE' as const },
    presentationRevision: 0,
    rewardRuleVersion: 'demo-v2-r1',
    publicSeq: 0,
    participantSeq: 0,
    participantStreamId: 'participant:synthetic-001',
    participant: needsColorParticipant(),
    publicStars: [],
    aggregateRevision: 1,
    aggregate: {
      activatedCount: 1,
      publicStarCount: 0,
      admittedCount: 0,
      starStartedCount: 0,
      cooperativeLightCount: 0,
      totalStarlight: 20,
    },
    currentProgram: null,
    programs: [],
    interaction: { interactionRevision: 0, barragePaused: false, displayBatch: 0 },
    finalRecap: [],
  }
}

function publicStar() {
  return {
    publicStarId: 'L-4821' as const,
    colorTemperatureKelvin: 5800,
    displayColor: '#FFF4DF',
    formationSlot: 'slot-001',
    started: false,
    starRevision: 1,
    updatedAt: NOW,
  }
}

function screenSnapshot() {
  return {
    status: 'ok' as const,
    protocolVersion: '2' as const,
    resetEpoch: 1,
    generatedAt: NOW,
    runtime: readyRuntime(),
    presentation: { type: 'NONE' as const },
    presentationRevision: 0,
    rewardRuleVersion: 'demo-v2-r1',
    publicSeq: 0,
    publicStars: [],
    aggregateRevision: 0,
    aggregate: {
      activatedCount: 0,
      publicStarCount: 0,
      admittedCount: 0,
      starStartedCount: 0,
      cooperativeLightCount: 0,
      totalStarlight: 0,
    },
    currentProgram: null,
    interaction: { interactionRevision: 0, barragePaused: false, displayBatch: 0 },
    publishedBarrages: [],
    finalRecap: [],
  }
}

function adminSnapshot() {
  return {
    status: 'ok' as const,
    protocolVersion: '2' as const,
    resetEpoch: 1,
    generatedAt: NOW,
    runtime: readyRuntime(),
    presentation: { type: 'NONE' as const },
    presentationRevision: 0,
    rewardRuleVersion: 'demo-v2-r1',
    publicSeq: 0,
    adminSeq: 0,
    roles: ['ALL' as const],
    aggregateRevision: 0,
    funnel: {
      activatedCount: 0,
      publicStarCount: 0,
      admittedCount: 0,
      onboardingPendingCount: 0,
      capsuleSubmittedCount: 0,
      capsuleSkippedCount: 0,
      starStartedCount: 0,
      cooperativeLightCount: 0,
      onlineParticipantSessions: 0,
    },
    readinessWarnings: [],
    interaction: { interactionRevision: 0, barragePaused: false, displayBatch: 0 },
    publishedBarrages: [],
    capsuleCandidates: [],
    lastControlReceipt: null,
    currentProgram: null,
    programs: [],
    finalRecap: [],
  }
}

const readinessDetails = {
  anonymousFunnel: {
    activatedCount: 1,
    publicStarCount: 1,
    admittedCount: 0,
    onboardingPendingCount: 1,
    capsuleSubmittedCount: 0,
    capsuleSkippedCount: 0,
    starStartedCount: 0,
    cooperativeLightCount: 0,
    onlineParticipantSessions: 1,
  },
  warnings: ['ONBOARDING_PENDING' as const],
}

describe('protocol v2 shared contract', () => {
  it('keeps v1 isolated while requiring the string v2 version', () => {
    expect(ProtocolVersionSchema.parse('1')).toBe('1')
    expect(() => ProtocolVersionSchema.parse('2')).toThrow()
    expect(
      V2HandshakeRequestSchema.parse({
        protocolVersion: '2',
        clientSurface: 'WELCOME',
        clientBuild: 'v2-01-test',
      }).protocolVersion,
    ).toBe('2')
    for (const protocolVersion of [2, '1', undefined]) {
      expect(() =>
        V2HandshakeRequestSchema.parse({
          protocolVersion,
          clientSurface: 'WELCOME',
          clientBuild: 'v2-01-test',
        }),
      ).toThrow()
    }
  })

  it('accepts only the four frozen runtime tuple families', () => {
    for (const tuple of [
      readyRuntime(),
      {
        mode: 'LIVE',
        status: 'RUNNING',
        currentScene: 'ASSEMBLY',
        runRevision: 1,
      },
      {
        mode: 'REHEARSAL',
        status: 'PAUSED',
        currentScene: 'PROGRAM_SUPPORT',
        runRevision: 2,
      },
      {
        mode: 'LIVE',
        status: 'COMPLETED',
        currentScene: 'COOPERATIVE_LIGHT',
        runRevision: 3,
      },
    ]) {
      expect(V2RuntimeTupleSchema.safeParse(tuple).success).toBe(true)
    }
    for (const tuple of [
      { ...readyRuntime(), currentScene: 'ASSEMBLY' },
      { ...readyRuntime(), status: 'RUNNING' },
      {
        mode: 'REHEARSAL',
        status: 'COMPLETED',
        currentScene: 'COOPERATIVE_LIGHT',
        runRevision: 3,
      },
      {
        mode: 'LIVE',
        status: 'COMPLETED',
        currentScene: 'PROGRAM_SUPPORT',
        runRevision: 3,
      },
      { ...readyRuntime(), stage: 1 },
    ]) {
      expect(V2RuntimeTupleSchema.safeParse(tuple).success).toBe(false)
    }
  })

  it('models cutover as a strict two-state lifecycle and rejects mixed claims', () => {
    expect(V2ProtocolLifecycleSchema.parse(CONTRACTS_READY)).toEqual(
      CONTRACTS_READY,
    )
    expect(V2ProtocolLifecycleSchema.parse(ACTIVE)).toEqual(ACTIVE)
    expect(() =>
      V2ProtocolLifecycleSchema.parse({
        ...CONTRACTS_READY,
        activeRuntimeVersion: '2',
      }),
    ).toThrow()
    expect(() =>
      V2ProtocolLifecycleSchema.parse({
        ...ACTIVE,
        capabilities: CONTRACTS_READY.capabilities,
      }),
    ).toThrow()

    const discovery = {
      service: 'sysu-welcome-backend',
      ...CONTRACTS_READY,
      serverTime: NOW,
      endpoints: {
        v2Handshake: '/api/v2/handshake',
        v2Realtime: '/ws/v2',
      },
    }
    expect(V2ProtocolCapabilitiesResponseSchema.parse(discovery)).toEqual(
      discovery,
    )
    expect(
      V2ProtocolCapabilitiesResponseSchema.parse({
        ...discovery,
        ...ACTIVE,
        resetEpoch: 1,
      }).activationState,
    ).toBe('ACTIVE')
    expect(
      V2RealtimeHelloAckSchema.safeParse({
        type: 'HELLO_ACK',
        protocolVersion: '2',
        ...ACTIVE,
        clientSurface: 'SCREEN',
        serverTime: NOW,
      }).success,
    ).toBe(false)
  })

  it('freezes exactly the 22 documented v2 error codes', () => {
    expect(V2_ERROR_CODES).toHaveLength(22)
    expect(new Set(V2_ERROR_CODES).size).toBe(22)
    expect(V2_ERROR_CODES).toContain('PROTOCOL_VERSION_MISMATCH')
    expect(V2_ERROR_CODES).toContain('RESYNC_REQUIRED')
    expect(V2_ERROR_CODES).not.toContain('STALE_STAGE')
    for (const code of V2_ERROR_CODES) {
      expect(
        V2ApiErrorSchema.safeParse({
          code,
          message: '合成错误说明',
          requestId: 'request-001',
          retryable:
            code === 'RATE_LIMITED' || code === 'SERVICE_UNAVAILABLE',
          ...(code === 'RESYNC_REQUIRED'
            ? {
                resync: {
                  streamId: 'public',
                  snapshotRequired: true,
                },
              }
            : {}),
          ...(code === 'READINESS_CONFIRMATION_REQUIRED'
            ? { details: readinessDetails }
            : {}),
        }).success,
      ).toBe(true)
    }
    expect(
      V2ApiErrorSchema.safeParse({
        code: 'READINESS_CONFIRMATION_REQUIRED',
        message: '需要确认匿名就绪警告。',
        requestId: 'request-readiness',
        retryable: false,
      }).success,
    ).toBe(false)
    for (const code of ['RATE_LIMITED', 'SERVICE_UNAVAILABLE'] as const) {
      expect(
        V2ApiErrorSchema.safeParse({
          code,
          message: '请稍后重试。',
          requestId: `request-${code}`,
          retryable: false,
        }).success,
      ).toBe(false)
    }
  })

  it('enforces onboarding fact consistency and started timestamps', () => {
    const needsColor = needsColorParticipant()
    expect(V2ParticipantProjectionSchema.parse(needsColor)).toEqual(needsColor)
    expect(() =>
      V2ParticipantProjectionSchema.parse({
        ...needsColor,
        colorTemperatureKelvin: 5800,
      }),
    ).toThrow()

    const needsCapsule = {
      ...needsColor,
      participantRevision: 2,
      onboardingState: 'NEEDS_CAPSULE_DECISION' as const,
      colorTemperatureKelvin: 5800,
      displayColor: '#FFF4DF',
      colorLockedAt: NOW,
      ownPublicStarId: 'L-4821',
      formationSlot: 'slot-001',
      allowedActions: ['UPSERT_CAPSULE', 'SKIP_CAPSULE'] as const,
    }
    expect(V2ParticipantProjectionSchema.safeParse(needsCapsule).success).toBe(
      true,
    )
    expect(
      V2ParticipantProjectionSchema.safeParse({
        ...needsCapsule,
        ownPublicStarId: null,
      }).success,
    ).toBe(false)

    const admitted = {
      ...needsCapsule,
      participantRevision: 3,
      onboardingState: 'ADMITTED' as const,
      capsuleDecision: 'SKIPPED' as const,
      skippedAt: NOW,
      admittedAt: NOW,
      admittedScene: 'ASSEMBLY' as const,
      admittedRunRevision: 1,
      allowedActions: ['UPSERT_CAPSULE'] as const,
    }
    expect(V2ParticipantProjectionSchema.safeParse(admitted).success).toBe(true)
    expect(
      V2ParticipantProjectionSchema.safeParse({
        ...admitted,
        admittedScene: null,
      }).success,
    ).toBe(true)
    expect(
      V2ParticipantProjectionSchema.safeParse({
        ...admitted,
        started: true,
        startedAt: null,
      }).success,
    ).toBe(false)
  })

  it('validates allowedActions against the authoritative snapshot state', () => {
    const snapshot = participantSnapshot()
    expect(V2ParticipantSnapshotSchema.parse(snapshot)).toEqual(snapshot)
    expect(() =>
      V2ParticipantSnapshotSchema.parse({
        ...snapshot,
        participant: {
          ...snapshot.participant,
          allowedActions: ['START_STAR'],
        },
      }),
    ).toThrow()
    expect(() =>
      V2ParticipantSnapshotSchema.parse({
        ...snapshot,
        streams: { public: 0, participant: 0 },
      }),
    ).toThrow()

    const admitted = {
      ...needsColorParticipant(),
      participantRevision: 3,
      onboardingState: 'ADMITTED' as const,
      colorTemperatureKelvin: 5800,
      displayColor: '#FFF4DF',
      colorLockedAt: NOW,
      ownPublicStarId: 'L-4821',
      formationSlot: 'slot-001',
      capsuleDecision: 'SKIPPED' as const,
      skippedAt: NOW,
      admittedAt: NOW,
      admittedScene: 'PROGRAM_SUPPORT' as const,
      admittedRunRevision: 4,
      allowedActions: ['UPSERT_CAPSULE'] as const,
    }
    const rehearsalReturn = {
      ...snapshot,
      runtime: {
        mode: 'REHEARSAL' as const,
        status: 'RUNNING' as const,
        currentScene: 'ASSEMBLY' as const,
        runRevision: 8,
      },
      participant: admitted,
      publicStars: [publicStar()],
      aggregate: {
        activatedCount: 1,
        publicStarCount: 1,
        admittedCount: 1,
        starStartedCount: 0,
        cooperativeLightCount: 0,
        totalStarlight: 20,
      },
    }
    expect(V2ParticipantSnapshotSchema.safeParse(rehearsalReturn).success).toBe(
      true,
    )
    expect(
      V2ParticipantSnapshotSchema.safeParse({
        ...rehearsalReturn,
        participant: {
          ...admitted,
          allowedActions: ['UPSERT_CAPSULE', 'START_STAR'],
        },
      }).success,
    ).toBe(false)
    expect(
      V2ParticipantSnapshotSchema.safeParse({
        ...snapshot,
        participant: {
          ...snapshot.participant,
          rewards: [],
          starlight: 0,
        },
      }).success,
    ).toBe(false)
    expect(
      V2ParticipantSnapshotSchema.safeParse({
        ...rehearsalReturn,
        participant: {
          ...admitted,
          admittedScene: null,
          allowedActions: ['UPSERT_CAPSULE', 'START_STAR'],
        },
      }).success,
    ).toBe(true)
  })

  it('requires deterministic event ids and matching entity revisions', () => {
    const runtimeEvent = {
      protocolVersion: '2',
      resetEpoch: 1,
      streamId: 'public',
      streamSeq: 4,
      eventId: '1:public:4',
      name: 'runtime.changed',
      revision: 2,
      payload: { runtime: readyRuntime(2) },
    }
    expect(V2RealtimeEventEnvelopeSchema.parse(runtimeEvent)).toEqual(
      runtimeEvent,
    )
    expect(() =>
      V2RealtimeEventEnvelopeSchema.parse({
        ...runtimeEvent,
        eventId: 'random-event-id',
      }),
    ).toThrow()
    expect(() =>
      V2RealtimeEventEnvelopeSchema.parse({
        ...runtimeEvent,
        revision: 3,
      }),
    ).toThrow()
    expect(() =>
      V2RealtimeEventEnvelopeSchema.parse({
        ...runtimeEvent,
        streamSeq: 0,
        eventId: '1:public:0',
      }),
    ).toThrow()
    expect(() =>
      V2RealtimeEventEnvelopeSchema.parse({
        ...runtimeEvent,
        eventSeq: 4,
      }),
    ).toThrow()

    const privateEvent = {
      protocolVersion: '2',
      resetEpoch: 1,
      streamId: 'participant:synthetic-001',
      streamSeq: 1,
      eventId: '1:participant:synthetic-001:1',
      name: 'participant.snapshot.changed',
      revision: 3,
      payload: {
        projection: 'SELF',
        participantRevision: 3,
        requiresSnapshot: true,
      },
    }
    expect(V2RealtimeEventEnvelopeSchema.parse(privateEvent)).toEqual(
      privateEvent,
    )
    expect(() =>
      V2RealtimeEventEnvelopeSchema.parse({
        ...privateEvent,
        payload: { ...privateEvent.payload, capsuleText: '不得进入事件' },
      }),
    ).toThrow()

    const barrageEvent = {
      protocolVersion: '2', resetEpoch: 1, streamId: 'public', streamSeq: 5,
      eventId: '1:public:5', name: 'barrage.published', revision: 7,
      payload: {
        interactionRevision: 7,
        barrage: {
          barrageId: 'barrage-001', text: '匿名应援', displaySeq: 1, publishedAt: NOW,
        },
      },
    }
    expect(V2RealtimeEventEnvelopeSchema.safeParse(barrageEvent).success).toBe(true)
    expect(V2RealtimeEventEnvelopeSchema.safeParse({
      ...barrageEvent,
      payload: {
        ...barrageEvent.payload,
        barrage: { ...barrageEvent.payload.barrage, sourceId: 'src_private' },
      },
    }).success).toBe(false)

    const giftEvent = {
      protocolVersion: '2', resetEpoch: 1, streamId: 'public', streamSeq: 6,
      eventId: '1:public:6', name: 'gift.sent', revision: 8,
      payload: {
        interactionRevision: 8,
        gift: {
          giftEventId: 'gift-001', programId: 'program-001', giftId: 'starship',
          giftName: '星际飞船', createdAt: NOW,
        },
      },
    }
    expect(V2RealtimeEventEnvelopeSchema.safeParse(giftEvent).success).toBe(true)
    expect(V2RealtimeEventEnvelopeSchema.safeParse({
      ...giftEvent,
      payload: {
        ...giftEvent.payload,
        gift: { ...giftEvent.payload.gift, publicStarId: 'L-4821' },
      },
    }).success).toBe(false)
  })

  it('rejects v1 stage fields and unknown fields in every v2 write family', () => {
    const participantCommand = {
      protocolVersion: '2',
      resetEpoch: 1,
      idempotencyKey: 'participant-command-001',
      expectedParticipantRevision: 1,
      command: 'LOCK_COLOR',
      colorTemperatureKelvin: 5800,
    }
    expect(V2ParticipantCommandSchema.parse(participantCommand)).toEqual(
      participantCommand,
    )
    expect(() =>
      V2ParticipantCommandSchema.parse({ ...participantCommand, stage: 1 }),
    ).toThrow()

    const adminCommand = {
      protocolVersion: '2',
      resetEpoch: 1,
      idempotencyKey: 'admin-command-001',
      expectedRunRevision: 0,
      command: 'START',
      confirmed: true,
    }
    expect(V2AdminCommandSchema.parse(adminCommand)).toEqual(adminCommand)
    expect(() =>
      V2AdminCommandSchema.parse({
        ...adminCommand,
        stageRevision: 0,
      }),
    ).toThrow()

    const setProgram = {
      protocolVersion: '2' as const,
      resetEpoch: 1,
      idempotencyKey: 'set-program-command-001',
      command: 'SET_PROGRAM' as const,
      expectedRunRevision: 3,
      expectedInteractionRevision: 0,
      programId: 'program-001',
      confirmed: true as const,
    }
    expect(V2AdminCommandSchema.parse(setProgram)).toEqual(setProgram)
    const { expectedInteractionRevision: _interactionRevision, ...staleProgram } = setProgram
    expect(V2AdminCommandSchema.safeParse(staleProgram).success).toBe(false)
  })

  it('rejects impossible aggregate relationships before they reach a surface', () => {
    const snapshot = participantSnapshot()
    expect(() =>
      V2ParticipantSnapshotSchema.parse({
        ...snapshot,
        aggregate: {
          ...snapshot.aggregate,
          publicStarCount: 2,
        },
      }),
    ).toThrow()
    expect(() =>
      V2ParticipantSnapshotSchema.parse({
        ...snapshot,
        aggregate: {
          ...snapshot.aggregate,
          activatedCount: 301,
        },
      }),
    ).toThrow()
  })

  it('requires presentation revisions on every runtime command that can clear presentation', () => {
    const base = {
      protocolVersion: '2' as const,
      resetEpoch: 1,
      idempotencyKey: 'presentation-clear-001',
      expectedRunRevision: 4,
      expectedPresentationRevision: 2,
      confirmed: true as const,
    }
    const commands = [
      { ...base, command: 'SET_SCENE' as const, targetScene: 'ASSEMBLY' as const },
      {
        ...base,
        command: 'ADVANCE' as const,
        overrideReadinessWarnings: false,
      },
      { ...base, command: 'PAUSE' as const },
    ]
    for (const command of commands) {
      expect(V2AdminCommandSchema.safeParse(command).success).toBe(true)
      const { expectedPresentationRevision: _omitted, ...missingRevision } = command
      expect(V2AdminCommandSchema.safeParse(missingRevision).success).toBe(false)
    }
    expect(
      V2AdminCommandSchema.safeParse({
        ...base,
        command: 'SHOW_CAPSULE_INSERT',
        capsuleIds: ['capsule-001', 'capsule-001'],
      }).success,
    ).toBe(false)
  })

  it('counts combined emoji as visible grapheme characters for capsule and barrage limits', () => {
    const combinedEmoji = '👨‍👩‍👧‍👦'
    const base = {
      protocolVersion: '2' as const,
      resetEpoch: 1,
      idempotencyKey: 'visible-character-boundary-001',
      expectedParticipantRevision: 1,
    }

    expect(
      V2ParticipantCommandSchema.safeParse({
        ...base,
        command: 'UPSERT_CAPSULE',
        text: combinedEmoji.repeat(80),
        candidateScopeAccepted: true,
      }).success,
    ).toBe(true)
    expect(
      V2ParticipantCommandSchema.safeParse({
        ...base,
        command: 'UPSERT_CAPSULE',
        text: combinedEmoji.repeat(81),
        candidateScopeAccepted: true,
      }).success,
    ).toBe(false)
    expect(
      V2ParticipantCommandSchema.safeParse({
        ...base,
        command: 'POST_BARRAGE',
        text: combinedEmoji.repeat(40),
      }).success,
    ).toBe(true)
    expect(
      V2ParticipantCommandSchema.safeParse({
        ...base,
        command: 'POST_BARRAGE',
        text: combinedEmoji.repeat(41),
      }).success,
    ).toBe(false)
  })

  it('cross-checks public star arrays, aggregates and the participant own star', () => {
    const star = publicStar()
    const populated = {
      ...screenSnapshot(),
      publicStars: [star],
      aggregate: {
        activatedCount: 1,
        publicStarCount: 1,
        admittedCount: 0,
        starStartedCount: 0,
        cooperativeLightCount: 0,
        totalStarlight: 20,
      },
    }
    expect(V2ScreenSnapshotSchema.safeParse(populated).success).toBe(true)
    expect(
      V2ScreenSnapshotSchema.safeParse({
        ...populated,
        aggregate: { ...populated.aggregate, publicStarCount: 0 },
      }).success,
    ).toBe(false)
    expect(
      V2PublicAggregateSchema.safeParse({
        activatedCount: 1,
        publicStarCount: 0,
        admittedCount: 1,
        starStartedCount: 1,
        cooperativeLightCount: 1,
        totalStarlight: 20,
      }).success,
    ).toBe(false)
    expect(
      V2ScreenSnapshotSchema.safeParse({
        ...populated,
        aggregate: { ...populated.aggregate, starStartedCount: 1 },
      }).success,
    ).toBe(false)
    const secondStar = {
      ...star,
      publicStarId: 'M-4822' as const,
      formationSlot: 'slot-002',
    }
    const twoStars = {
      ...populated,
      publicStars: [star, secondStar],
      aggregate: {
        ...populated.aggregate,
        activatedCount: 2,
        publicStarCount: 2,
      },
    }
    expect(V2ScreenSnapshotSchema.safeParse(twoStars).success).toBe(true)
    expect(
      V2ScreenSnapshotSchema.safeParse({
        ...twoStars,
        publicStars: [star, { ...secondStar, publicStarId: star.publicStarId }],
      }).success,
    ).toBe(false)
    expect(
      V2ScreenSnapshotSchema.safeParse({
        ...twoStars,
        publicStars: [star, { ...secondStar, formationSlot: star.formationSlot }],
      }).success,
    ).toBe(false)

    const lockedParticipant = {
      ...needsColorParticipant(),
      participantRevision: 2,
      onboardingState: 'NEEDS_CAPSULE_DECISION' as const,
      colorTemperatureKelvin: 5800,
      displayColor: '#FFF4DF',
      colorLockedAt: NOW,
      ownPublicStarId: star.publicStarId,
      formationSlot: star.formationSlot,
      allowedActions: ['UPSERT_CAPSULE', 'SKIP_CAPSULE'] as const,
    }
    const participant = {
      ...participantSnapshot(),
      participant: lockedParticipant,
      publicStars: [star],
      aggregate: populated.aggregate,
    }
    expect(V2ParticipantSnapshotSchema.safeParse(participant).success).toBe(true)
    expect(
      V2ParticipantSnapshotSchema.safeParse({
        ...participant,
        publicStars: [{ ...star, formationSlot: 'slot-mismatch' }],
      }).success,
    ).toBe(false)
  })

  it('keeps presentations and final recap consistent with the runtime tuple', () => {
    const capsule = {
      capsuleId: 'capsule-001',
      publicStarId: 'L-4821',
      colorTemperatureKelvin: 5800,
      displayColor: '#FFF4DF',
      text: '合成时光胶囊',
    }
    const ready = screenSnapshot()
    expect(
      V2ScreenSnapshotSchema.safeParse({
        ...ready,
        presentation: { type: 'CAPSULE_INSERT', capsules: [capsule] },
      }).success,
    ).toBe(false)
    expect(
      V2ScreenSnapshotSchema.safeParse({
        ...ready,
        finalRecap: [capsule],
      }).success,
    ).toBe(false)
    for (const runtime of [
      {
        mode: 'REHEARSAL',
        status: 'PAUSED',
        currentScene: 'ASSEMBLY',
        runRevision: 2,
      },
      {
        mode: 'LIVE',
        status: 'COMPLETED',
        currentScene: 'COOPERATIVE_LIGHT',
        runRevision: 4,
      },
    ] as const) {
      expect(
        V2ScreenSnapshotSchema.safeParse({
          ...ready,
          runtime,
          presentation: { type: 'CAPSULE_INSERT', capsules: [capsule] },
        }).success,
      ).toBe(false)
    }

    const finalePreview = {
      ...ready,
      runtime: {
        mode: 'REHEARSAL' as const,
        status: 'RUNNING' as const,
        currentScene: 'COOPERATIVE_LIGHT' as const,
        runRevision: 3,
      },
      presentation: { type: 'FINALE_PREVIEW' as const, rehearsal: true as const },
    }
    expect(V2ScreenSnapshotSchema.safeParse(finalePreview).success).toBe(true)
    expect(
      V2ScreenSnapshotSchema.safeParse({
        ...finalePreview,
        runtime: { ...finalePreview.runtime, mode: 'LIVE' },
      }).success,
    ).toBe(false)
    expect(
      V2ScreenSnapshotSchema.safeParse({
        ...ready,
        runtime: {
          mode: 'LIVE',
          status: 'COMPLETED',
          currentScene: 'COOPERATIVE_LIGHT',
          runRevision: 4,
        },
        finalRecap: [capsule, capsule],
      }).success,
    ).toBe(false)
  })

  it('cross-checks reward rows, starlight, rule version and initial power', () => {
    const snapshot = participantSnapshot()
    expect(V2ParticipantSnapshotSchema.safeParse(snapshot).success).toBe(true)
    expect(
      V2ParticipantSnapshotSchema.safeParse({
        ...snapshot,
        participant: { ...snapshot.participant, powerBalance: 101 },
      }).success,
    ).toBe(false)
    expect(
      V2ParticipantSnapshotSchema.safeParse({
        ...snapshot,
        participant: { ...snapshot.participant, starlight: 19 },
      }).success,
    ).toBe(false)
    expect(
      V2ParticipantSnapshotSchema.safeParse({
        ...snapshot,
        participant: {
          ...snapshot.participant,
          rewards: [
            snapshot.participant.rewards[0],
            snapshot.participant.rewards[0],
          ],
          starlight: 40,
        },
      }).success,
    ).toBe(false)
    expect(
      V2ParticipantSnapshotSchema.safeParse({
        ...snapshot,
        participant: {
          ...snapshot.participant,
          rewards: [
            {
              ...snapshot.participant.rewards[0],
              rewardRuleVersion: 'demo-v2-r2',
            },
          ],
        },
      }).success,
    ).toBe(false)
  })

  it('prevents late rehearsal entrants from gaining earlier-scene actions', () => {
    const star = publicStar()
    const admitted = {
      ...needsColorParticipant(),
      participantRevision: 3,
      onboardingState: 'ADMITTED' as const,
      colorTemperatureKelvin: star.colorTemperatureKelvin,
      displayColor: star.displayColor,
      colorLockedAt: NOW,
      ownPublicStarId: star.publicStarId,
      formationSlot: star.formationSlot,
      capsuleDecision: 'SKIPPED' as const,
      skippedAt: NOW,
      admittedAt: NOW,
      admittedScene: 'COOPERATIVE_LIGHT' as const,
      admittedRunRevision: 9,
      allowedActions: ['UPSERT_CAPSULE'] as const,
    }
    const returnedToProgram = {
      ...participantSnapshot(),
      runtime: {
        mode: 'REHEARSAL' as const,
        status: 'RUNNING' as const,
        currentScene: 'PROGRAM_SUPPORT' as const,
        runRevision: 10,
      },
      participant: admitted,
      publicStars: [star],
      aggregate: {
        activatedCount: 1,
        publicStarCount: 1,
        admittedCount: 1,
        starStartedCount: 0,
        cooperativeLightCount: 0,
        totalStarlight: 20,
      },
    }
    expect(V2ParticipantSnapshotSchema.safeParse(returnedToProgram).success).toBe(
      true,
    )
    expect(
      V2ParticipantSnapshotSchema.safeParse({
        ...returnedToProgram,
        participant: {
          ...admitted,
          allowedActions: ['UPSERT_CAPSULE', 'SEND_GIFT', 'POST_BARRAGE'],
        },
      }).success,
    ).toBe(false)
  })

  it('requires snapshot recovery hints on active v2 business errors', () => {
    const base = {
      status: 'error' as const,
      protocolVersion: '2' as const,
      resetEpoch: 1,
      error: {
        code: 'REVISION_CONFLICT' as const,
        message: 'revision 已变化。',
        requestId: 'request-revision',
        retryable: false,
      },
      recovery: {
        snapshotRequired: true as const,
        scope: 'ALL_AUTHORIZED' as const,
      },
    }
    expect(V2ApiErrorResponseSchema.safeParse(base).success).toBe(true)
    const { recovery: _missing, ...withoutRecovery } = base
    expect(V2ApiErrorResponseSchema.safeParse(withoutRecovery).success).toBe(
      false,
    )
    const resync = {
      ...base,
      error: {
        code: 'RESYNC_REQUIRED' as const,
        message: '需要重拉 public 流。',
        requestId: 'request-resync',
        retryable: false,
        resync: { streamId: 'public' as const, snapshotRequired: true as const },
      },
      recovery: {
        snapshotRequired: true as const,
        scope: 'STREAM' as const,
        streamId: 'public' as const,
      },
    }
    expect(V2ApiErrorResponseSchema.safeParse(resync).success).toBe(true)
    expect(
      V2ApiErrorResponseSchema.safeParse({
        ...resync,
        recovery: { ...resync.recovery, streamId: 'admin' },
      }).success,
    ).toBe(false)
  })

  it('keeps the anonymous admin funnel arithmetically consistent', () => {
    const admin = adminSnapshot()
    expect(V2AdminSnapshotSchema.safeParse(admin).success).toBe(true)
    expect(
      V2AdminSnapshotSchema.safeParse({
        ...admin,
        funnel: {
          ...admin.funnel,
          activatedCount: 1,
          publicStarCount: 1,
          admittedCount: 1,
          onboardingPendingCount: 0,
          capsuleSubmittedCount: 0,
          capsuleSkippedCount: 0,
        },
      }).success,
    ).toBe(false)
  })
})
