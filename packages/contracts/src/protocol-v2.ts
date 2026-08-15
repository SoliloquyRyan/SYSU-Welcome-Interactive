import { z } from 'zod'

export const V2_PROTOCOL_VERSION = '2' as const
export const V2ProtocolVersionSchema = z.literal(V2_PROTOCOL_VERSION)
export const V2ContractVersionSchema = z.literal('2')
export const V2ActiveRuntimeVersionSchema = z.enum(['1', '2'])
export const V2ActivationStateSchema = z.enum(['CONTRACTS_READY', 'ACTIVE'])
export const V2ResetEpochSchema = z.number().int().positive()
export const V2RevisionSchema = z.number().int().nonnegative()
export const V2StreamSequenceSchema = z.number().int().nonnegative()
export const V2EventStreamSequenceSchema = z.number().int().positive()
export const V2IsoDateTimeSchema = z.string().datetime({ offset: true })
export const V2EntityIdSchema = z.string().min(1).max(128)
export const V2PublicStarIdSchema = z.string().regex(/^[A-Z]-\d{4}$/)
export const V2FormationSlotSchema = z.string().min(1).max(64)
export const V2ColorTemperatureKelvinSchema = z.number().int().min(2400).max(12000)
export const V2DisplayColorSchema = z.string().regex(/^#[0-9A-F]{6}$/i)
export const V2RewardRuleVersionSchema = z.string().min(1).max(64)

const v2VisibleCharacterSegmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
})

function countV2VisibleCharacters(value: string): number {
  return Array.from(v2VisibleCharacterSegmenter.segment(value)).length
}

export const V2BarrageTextSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => countV2VisibleCharacters(value) <= 40, {
    message: 'Barrage text must contain at most 40 visible characters',
  })

const V2CapsuleTextSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => countV2VisibleCharacters(value) <= 80, {
    message: 'Capsule text must contain at most 80 visible characters',
  })

export const V2ModeSchema = z.enum(['REHEARSAL', 'LIVE'])
export const V2RuntimeStatusSchema = z.enum([
  'READY',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
])
export const V2SceneSchema = z.enum([
  'ASSEMBLY',
  'PROGRAM_SUPPORT',
  'COOPERATIVE_LIGHT',
])

const runtimeRevision = { runRevision: V2RevisionSchema }

export const V2RuntimeTupleSchema = z.discriminatedUnion('status', [
  z
    .object({
      mode: V2ModeSchema,
      status: z.literal('READY'),
      currentScene: z.null(),
      ...runtimeRevision,
    })
    .strict(),
  z
    .object({
      mode: V2ModeSchema,
      status: z.literal('RUNNING'),
      currentScene: V2SceneSchema,
      ...runtimeRevision,
    })
    .strict(),
  z
    .object({
      mode: V2ModeSchema,
      status: z.literal('PAUSED'),
      currentScene: V2SceneSchema,
      ...runtimeRevision,
    })
    .strict(),
  z
    .object({
      mode: z.literal('LIVE'),
      status: z.literal('COMPLETED'),
      currentScene: z.literal('COOPERATIVE_LIGHT'),
      ...runtimeRevision,
    })
    .strict(),
])

export function isLegalV2RuntimeTuple(value: unknown): boolean {
  return V2RuntimeTupleSchema.safeParse(value).success
}

export const V2CapsuleProjectionSchema = z
  .object({
    capsuleId: V2EntityIdSchema,
    publicStarId: V2PublicStarIdSchema,
    colorTemperatureKelvin: V2ColorTemperatureKelvinSchema,
    displayColor: V2DisplayColorSchema,
    text: V2CapsuleTextSchema,
  })
  .strict()

function uniqueCapsuleIds(
  capsules: readonly { capsuleId: string }[],
  context: { addIssue(issue: { code: 'custom'; message: string }): void },
): void {
  if (new Set(capsules.map(({ capsuleId }) => capsuleId)).size !== capsules.length) {
    context.addIssue({ code: 'custom', message: 'capsuleId values must be unique' })
  }
}

export const V2CapsuleProjectionListSchema = z
  .array(V2CapsuleProjectionSchema)
  .max(6)
  .superRefine(uniqueCapsuleIds)

export const V2ActiveCapsuleProjectionListSchema = z
  .array(V2CapsuleProjectionSchema)
  .min(1)
  .max(6)
  .superRefine(uniqueCapsuleIds)

export const V2PresentationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('NONE') }).strict(),
  z
    .object({
      type: z.literal('CAPSULE_INSERT'),
      capsules: V2ActiveCapsuleProjectionListSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('FINALE_PREVIEW'),
      rehearsal: z.literal(true),
    })
    .strict(),
])

export const V2PresentationStateSchema = z
  .object({
    presentation: V2PresentationSchema,
    presentationRevision: V2RevisionSchema,
  })
  .strict()

export const V2PublicStarSchema = z
  .object({
    publicStarId: V2PublicStarIdSchema,
    colorTemperatureKelvin: V2ColorTemperatureKelvinSchema,
    displayColor: V2DisplayColorSchema,
    formationSlot: V2FormationSlotSchema,
    started: z.boolean(),
    starRevision: V2RevisionSchema,
    updatedAt: V2IsoDateTimeSchema,
  })
  .strict()

export const V2PublicAggregateSchema = z
  .object({
    activatedCount: z.number().int().nonnegative(),
    publicStarCount: z.number().int().nonnegative(),
    admittedCount: z.number().int().nonnegative(),
    starStartedCount: z.number().int().nonnegative(),
    cooperativeLightCount: z.number().int().nonnegative(),
    totalStarlight: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.activatedCount > 300) {
      context.addIssue({ code: 'custom', path: ['activatedCount'], message: 'activatedCount exceeds capacity' })
    }
    if (value.publicStarCount > value.activatedCount) {
      context.addIssue({ code: 'custom', path: ['publicStarCount'], message: 'publicStarCount exceeds activatedCount' })
    }
    if (value.admittedCount > value.activatedCount) {
      context.addIssue({ code: 'custom', path: ['admittedCount'], message: 'admittedCount exceeds activatedCount' })
    }
    if (value.starStartedCount > value.publicStarCount) {
      context.addIssue({ code: 'custom', path: ['starStartedCount'], message: 'starStartedCount exceeds publicStarCount' })
    }
    if (value.cooperativeLightCount > value.admittedCount) {
      context.addIssue({ code: 'custom', path: ['cooperativeLightCount'], message: 'cooperativeLightCount exceeds admittedCount' })
    }
    if (value.admittedCount > value.publicStarCount) {
      context.addIssue({ code: 'custom', path: ['admittedCount'], message: 'admittedCount exceeds publicStarCount' })
    }
    if (value.starStartedCount > value.admittedCount) {
      context.addIssue({ code: 'custom', path: ['starStartedCount'], message: 'starStartedCount exceeds admittedCount' })
    }
  })

export const V2PublicBarrageSchema = z
  .object({
    barrageId: V2EntityIdSchema,
    text: V2BarrageTextSchema,
    displaySeq: z.number().int().positive(),
    publishedAt: V2IsoDateTimeSchema,
  })
  .strict()

export const V2AdminBarrageSchema = V2PublicBarrageSchema.extend({
  sourceId: V2EntityIdSchema,
}).strict()

export const V2PublicGiftEventSchema = z
  .object({
    giftEventId: V2EntityIdSchema,
    programId: V2EntityIdSchema,
    giftId: V2EntityIdSchema,
    giftName: z.string().trim().min(1).max(80),
    createdAt: V2IsoDateTimeSchema,
  })
  .strict()

export const V2ScreenInteractionStateSchema = z
  .object({
    interactionRevision: V2RevisionSchema,
    barragePaused: z.boolean(),
    displayBatch: z.number().int().nonnegative(),
  })
  .strict()

export const V2AdminFunnelSchema = z
  .object({
    activatedCount: z.number().int().nonnegative(),
    publicStarCount: z.number().int().nonnegative(),
    admittedCount: z.number().int().nonnegative(),
    onboardingPendingCount: z.number().int().nonnegative(),
    capsuleSubmittedCount: z.number().int().nonnegative(),
    capsuleSkippedCount: z.number().int().nonnegative(),
    starStartedCount: z.number().int().nonnegative(),
    cooperativeLightCount: z.number().int().nonnegative(),
    onlineParticipantSessions: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.activatedCount > 300) {
      context.addIssue({ code: 'custom', path: ['activatedCount'], message: 'activatedCount exceeds capacity' })
    }
    for (const [field, count] of [
      ['publicStarCount', value.publicStarCount],
      ['admittedCount', value.admittedCount],
      ['onboardingPendingCount', value.onboardingPendingCount],
      ['capsuleSubmittedCount', value.capsuleSubmittedCount],
      ['capsuleSkippedCount', value.capsuleSkippedCount],
    ] as const) {
      if (count > value.activatedCount) {
        context.addIssue({ code: 'custom', path: [field], message: `${field} exceeds activatedCount` })
      }
    }
    if (value.onboardingPendingCount !== value.activatedCount - value.admittedCount) {
      context.addIssue({ code: 'custom', path: ['onboardingPendingCount'], message: 'onboardingPendingCount is inconsistent' })
    }
    if (value.capsuleSubmittedCount + value.capsuleSkippedCount !== value.admittedCount) {
      context.addIssue({ code: 'custom', path: ['capsuleSubmittedCount'], message: 'capsule decisions must equal admittedCount' })
    }
    if (value.starStartedCount > value.publicStarCount) {
      context.addIssue({ code: 'custom', path: ['starStartedCount'], message: 'starStartedCount exceeds publicStarCount' })
    }
    if (value.cooperativeLightCount > value.admittedCount) {
      context.addIssue({ code: 'custom', path: ['cooperativeLightCount'], message: 'cooperativeLightCount exceeds admittedCount' })
    }
    if (value.admittedCount > value.publicStarCount) {
      context.addIssue({ code: 'custom', path: ['admittedCount'], message: 'admittedCount exceeds publicStarCount' })
    }
    if (value.starStartedCount > value.admittedCount) {
      context.addIssue({ code: 'custom', path: ['starStartedCount'], message: 'starStartedCount exceeds admittedCount' })
    }
  })

export const V2AggregateProjectionSchema = z.discriminatedUnion('projection', [
  z
    .object({
      projection: z.literal('PUBLIC_AGGREGATE'),
      aggregateRevision: V2RevisionSchema,
      aggregate: V2PublicAggregateSchema,
    })
    .strict(),
  z
    .object({
      projection: z.literal('ADMIN_AGGREGATE'),
      aggregateRevision: V2RevisionSchema,
      aggregate: V2AdminFunnelSchema,
    })
    .strict(),
])

export const V2StreamIdSchema = z.union([
  z.literal('public'),
  z.literal('admin'),
  z.string().regex(/^participant:[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
])

export const V2StreamCursorSchema = z
  .object({
    streamId: V2StreamIdSchema,
    streamSeq: V2StreamSequenceSchema,
  })
  .strict()

export const V2RealtimeSubscribeSchema = z
  .object({
    type: z.literal('SUBSCRIBE'),
    protocolVersion: V2ProtocolVersionSchema,
    resetEpoch: V2ResetEpochSchema,
    streams: z.array(V2StreamCursorSchema).min(1).max(2),
  })
  .strict()
  .superRefine((value, context) => {
    const streamIds = value.streams.map(({ streamId }) => streamId)
    if (new Set(streamIds).size !== streamIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['streams'],
        message: 'Each authorized stream can be subscribed only once',
      })
    }
  })

const eventBase = {
  protocolVersion: V2ProtocolVersionSchema,
  resetEpoch: V2ResetEpochSchema,
  streamSeq: V2EventStreamSequenceSchema,
  eventId: V2EntityIdSchema,
  revision: V2RevisionSchema,
}

const publicEvent = <TName extends string, TPayload extends z.ZodType>(
  name: TName,
  payload: TPayload,
) =>
  z
    .object({
      ...eventBase,
      streamId: z.literal('public'),
      name: z.literal(name),
      payload,
    })
    .strict()

export const V2RealtimeEventEnvelopeSchema = z.union([
  publicEvent(
    'runtime.changed',
    z.object({ runtime: V2RuntimeTupleSchema }).strict(),
  ),
  publicEvent(
    'presentation.changed',
    V2PresentationStateSchema,
  ),
  publicEvent(
    'star.node.upserted',
    z.object({ star: V2PublicStarSchema }).strict(),
  ),
  publicEvent(
    'aggregate.changed',
    z
      .object({
        projection: z.literal('PUBLIC_AGGREGATE'),
        aggregateRevision: V2RevisionSchema,
        aggregate: V2PublicAggregateSchema,
      })
      .strict(),
  ),
  publicEvent(
    'barrage.published',
    z.object({ interactionRevision: V2RevisionSchema, barrage: V2PublicBarrageSchema }).strict(),
  ),
  publicEvent(
    'barrage.removed',
    z.object({ interactionRevision: V2RevisionSchema, barrageIds: z.array(V2EntityIdSchema).min(1).max(8) }).strict(),
  ),
  publicEvent(
    'barrage.cleared',
    z.object({ interactionRevision: V2RevisionSchema, displayBatch: z.number().int().nonnegative() }).strict(),
  ),
  publicEvent(
    'barrage.pause.changed',
    z.object({ interactionRevision: V2RevisionSchema, paused: z.boolean() }).strict(),
  ),
  publicEvent(
    'gift.sent',
    z.object({ interactionRevision: V2RevisionSchema, gift: V2PublicGiftEventSchema }).strict(),
  ),
  publicEvent(
    'program.changed',
    z.object({
      interactionRevision: V2RevisionSchema,
      currentProgram: z.lazy(() => V2ProgramProjectionSchema),
    }).strict(),
  ),
  z
    .object({
      ...eventBase,
      streamId: z.literal('admin'),
      name: z.literal('aggregate.changed'),
      payload: z
        .object({
          projection: z.literal('ADMIN_AGGREGATE'),
          aggregateRevision: V2RevisionSchema,
          aggregate: V2AdminFunnelSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      streamId: z.string().regex(/^participant:[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
      name: z.literal('participant.snapshot.changed'),
      payload: z
        .object({
          projection: z.literal('SELF'),
          participantRevision: V2RevisionSchema,
          requiresSnapshot: z.literal(true),
        })
        .strict(),
    })
    .strict(),
]).superRefine((event, context) => {
  const expectedEventId = `${event.resetEpoch}:${event.streamId}:${event.streamSeq}`
  if (event.eventId !== expectedEventId) {
    context.addIssue({ code: 'custom', path: ['eventId'], message: 'eventId must be derived from resetEpoch, streamId and streamSeq' })
  }
  const payload = event.payload as Record<string, unknown>
  const expectedRevision =
    event.name === 'runtime.changed'
      ? (payload.runtime as { runRevision?: unknown }).runRevision
      : event.name === 'presentation.changed'
        ? payload.presentationRevision
        : event.name === 'star.node.upserted'
          ? (payload.star as { starRevision?: unknown }).starRevision
          : event.name === 'aggregate.changed'
            ? payload.aggregateRevision
            : event.name === 'participant.snapshot.changed'
              ? payload.participantRevision
              : payload.interactionRevision
  if (event.revision !== expectedRevision) {
    context.addIssue({ code: 'custom', path: ['revision'], message: 'event revision must match its payload revision' })
  }
})

export const V2OnboardingStateSchema = z.enum([
  'NEEDS_COLOR',
  'NEEDS_CAPSULE_DECISION',
  'ADMITTED',
])
export const V2CapsuleDecisionSchema = z.enum(['NONE', 'SKIPPED', 'SUBMITTED'])
export const V2CapsuleModerationStatusSchema = z.enum([
  'SUBMITTED',
  'SELECTED',
  'DISPLAYED',
  'REMOVED',
])

export const V2_ALLOWED_ACTIONS = [
  'LOCK_COLOR',
  'UPSERT_CAPSULE',
  'SKIP_CAPSULE',
  'START_STAR',
  'SEND_GIFT',
  'POST_BARRAGE',
  'COOPERATIVE_LIGHT',
] as const
export const V2AllowedActionSchema = z.enum(V2_ALLOWED_ACTIONS)
export type V2AllowedAction = z.infer<typeof V2AllowedActionSchema>

export const V2AllowedActionsSchema = z
  .array(V2AllowedActionSchema)
  .max(V2_ALLOWED_ACTIONS.length)
  .superRefine((actions, context) => {
    const indexes = actions.map((action) => V2_ALLOWED_ACTIONS.indexOf(action))
    if (new Set(actions).size !== actions.length) {
      context.addIssue({ code: 'custom', message: 'allowedActions must be unique' })
    }
    if (indexes.some((value, index) => index > 0 && value <= indexes[index - 1]!)) {
      context.addIssue({
        code: 'custom',
        message: 'allowedActions must use the frozen canonical order',
      })
    }
  })

export const V2RewardSummaryItemSchema = z
  .object({
    eventKey: z.enum([
      'ACTIVATED',
      'CAPSULE_SUBMITTED',
      'STAR_STARTED',
      'FIRST_GIFT',
      'FIRST_BARRAGE',
      'COOPERATIVE_LIGHT',
    ]),
    delta: z.number().int().nonnegative(),
    rewardRuleVersion: V2RewardRuleVersionSchema,
    awardedAt: V2IsoDateTimeSchema,
  })
  .strict()

export const V2ParticipantProjectionSchema = z
  .object({
    participantRevision: V2RevisionSchema,
    onboardingState: V2OnboardingStateSchema,
    displayName: z.string().trim().min(1).max(40),
    personalStarCode: V2PublicStarIdSchema,
    activatedAt: V2IsoDateTimeSchema,
    colorTemperatureKelvin: V2ColorTemperatureKelvinSchema.nullable(),
    displayColor: V2DisplayColorSchema.nullable(),
    colorLockedAt: V2IsoDateTimeSchema.nullable(),
    ownPublicStarId: V2PublicStarIdSchema.nullable(),
    formationSlot: V2FormationSlotSchema.nullable(),
    capsuleDecision: V2CapsuleDecisionSchema,
    capsuleText: V2CapsuleTextSchema.nullable(),
    candidateScopeAcceptedAt: V2IsoDateTimeSchema.nullable(),
    submittedAt: V2IsoDateTimeSchema.nullable(),
    skippedAt: V2IsoDateTimeSchema.nullable(),
    capsuleModerationStatus: V2CapsuleModerationStatusSchema.nullable(),
    admittedAt: V2IsoDateTimeSchema.nullable(),
    admittedScene: V2SceneSchema.nullable(),
    admittedRunRevision: V2RevisionSchema.nullable(),
    started: z.boolean(),
    startedAt: V2IsoDateTimeSchema.nullable(),
    firstGiftRewardedAt: V2IsoDateTimeSchema.nullable(),
    firstBarrageRewardedAt: V2IsoDateTimeSchema.nullable(),
    cooperativeLightAt: V2IsoDateTimeSchema.nullable(),
    powerBalance: z.number().int().min(0).max(100),
    starlight: z.number().int().nonnegative(),
    rewards: z.array(V2RewardSummaryItemSchema).max(6),
    allowedActions: V2AllowedActionsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.ownPublicStarId !== null &&
      value.ownPublicStarId !== value.personalStarCode
    ) {
      context.addIssue({
        code: 'custom',
        path: ['ownPublicStarId'],
        message: 'The public star must use the participant personalStarCode',
      })
    }
    const lockedFacts = [
      value.colorTemperatureKelvin,
      value.displayColor,
      value.colorLockedAt,
      value.ownPublicStarId,
      value.formationSlot,
    ]
    const allLockedFacts = lockedFacts.every((fact) => fact !== null)
    const noLockedFacts = lockedFacts.every((fact) => fact === null)
    const capsuleFacts = [
      value.capsuleText,
      value.candidateScopeAcceptedAt,
      value.submittedAt,
      value.skippedAt,
      value.capsuleModerationStatus,
    ]
    const sceneFacts = [
      value.startedAt,
      value.firstGiftRewardedAt,
      value.firstBarrageRewardedAt,
      value.cooperativeLightAt,
    ]

    if (value.onboardingState === 'NEEDS_COLOR') {
      if (!noLockedFacts || value.capsuleDecision !== 'NONE' || capsuleFacts.some((fact) => fact !== null) || value.admittedAt !== null || value.admittedScene !== null || value.admittedRunRevision !== null || value.started || sceneFacts.some((fact) => fact !== null)) {
        context.addIssue({ code: 'custom', path: ['onboardingState'], message: 'NEEDS_COLOR contains facts from a later state' })
      }
    } else if (value.onboardingState === 'NEEDS_CAPSULE_DECISION') {
      if (!allLockedFacts || value.capsuleDecision !== 'NONE' || capsuleFacts.some((fact) => fact !== null) || value.admittedAt !== null || value.admittedScene !== null || value.admittedRunRevision !== null || value.started || sceneFacts.some((fact) => fact !== null)) {
        context.addIssue({ code: 'custom', path: ['onboardingState'], message: 'NEEDS_CAPSULE_DECISION facts are inconsistent' })
      }
    } else {
      if (!allLockedFacts || value.capsuleDecision === 'NONE' || value.admittedAt === null || value.admittedRunRevision === null) {
        context.addIssue({ code: 'custom', path: ['onboardingState'], message: 'ADMITTED is missing required facts' })
      }
      if (value.capsuleDecision === 'SKIPPED' && (value.skippedAt === null || value.capsuleText !== null || value.candidateScopeAcceptedAt !== null || value.submittedAt !== null || value.capsuleModerationStatus !== null)) {
        context.addIssue({ code: 'custom', path: ['capsuleDecision'], message: 'SKIPPED capsule facts are inconsistent' })
      }
      if (value.capsuleDecision === 'SUBMITTED' && (value.capsuleText === null || value.candidateScopeAcceptedAt === null || value.submittedAt === null || value.capsuleModerationStatus === null)) {
        context.addIssue({ code: 'custom', path: ['capsuleDecision'], message: 'SUBMITTED capsule facts are incomplete' })
      }
    }
    if (value.started !== (value.startedAt !== null)) {
      context.addIssue({ code: 'custom', path: ['startedAt'], message: 'started and startedAt must agree' })
    }
    const rewardKeys = value.rewards.map(({ eventKey }) => eventKey)
    if (new Set(rewardKeys).size !== rewardKeys.length) {
      context.addIssue({
        code: 'custom',
        path: ['rewards'],
        message: 'Each reward eventKey may appear only once',
      })
    }
    if (rewardKeys.filter((eventKey) => eventKey === 'ACTIVATED').length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['rewards'],
        message: 'Every participant projection requires exactly one ACTIVATED reward',
      })
    }
    const rewardTotal = value.rewards.reduce((sum, { delta }) => sum + delta, 0)
    if (value.starlight !== rewardTotal) {
      context.addIssue({
        code: 'custom',
        path: ['starlight'],
        message: 'starlight must equal the sum of reward deltas',
      })
    }
    if (new Set(value.rewards.map(({ rewardRuleVersion }) => rewardRuleVersion)).size !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['rewards'],
        message: 'All reward rows must use one rewardRuleVersion',
      })
    }
    if (
      (value.onboardingState === 'NEEDS_COLOR' ||
        value.onboardingState === 'NEEDS_CAPSULE_DECISION') &&
      value.powerBalance !== 100
    ) {
      context.addIssue({
        code: 'custom',
        path: ['powerBalance'],
        message: 'Pre-admission participants must retain the initial power balance',
      })
    }
  })

function expectedAllowedActions(input: {
  runtime: z.infer<typeof V2RuntimeTupleSchema>
  participant: z.infer<typeof V2ParticipantProjectionSchema>
}): V2AllowedAction[] {
  const { runtime, participant } = input
  if (runtime.status === 'PAUSED' || runtime.status === 'COMPLETED') return []
  const actions: V2AllowedAction[] = []
  if (participant.onboardingState === 'NEEDS_COLOR') actions.push('LOCK_COLOR')
  if (
    participant.onboardingState === 'NEEDS_CAPSULE_DECISION' ||
    (participant.onboardingState === 'ADMITTED' &&
      (participant.capsuleDecision === 'SKIPPED' ||
        participant.capsuleDecision === 'SUBMITTED'))
  ) {
    actions.push('UPSERT_CAPSULE')
  }
  if (
    participant.onboardingState === 'NEEDS_CAPSULE_DECISION' &&
    participant.capsuleDecision === 'NONE'
  ) {
    actions.push('SKIP_CAPSULE')
  }
  if (participant.onboardingState !== 'ADMITTED' || runtime.status !== 'RUNNING') {
    return actions
  }
  if (
    runtime.currentScene === 'ASSEMBLY' &&
    !participant.started &&
    (participant.admittedScene === null || participant.admittedScene === 'ASSEMBLY')
  ) {
    actions.push('START_STAR')
  }
  if (runtime.currentScene === 'PROGRAM_SUPPORT') {
    if (
      participant.admittedScene === null ||
      participant.admittedScene === 'ASSEMBLY' ||
      participant.admittedScene === 'PROGRAM_SUPPORT'
    ) {
      actions.push('SEND_GIFT', 'POST_BARRAGE')
    }
  }
  if (
    runtime.currentScene === 'COOPERATIVE_LIGHT' &&
    participant.cooperativeLightAt === null
  ) {
    actions.push('COOPERATIVE_LIGHT')
  }
  return actions
}

export const V2ProgramProjectionSchema = z
  .object({
    id: V2EntityIdSchema,
    title: z.string().min(1).max(120),
    heat: z.number().int().nonnegative(),
    giftCatalog: z
      .array(
        z
          .object({
            id: V2EntityIdSchema,
            name: z.string().trim().min(1).max(80),
            powerCost: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(50)]),
          })
          .strict(),
      )
      .max(16),
  })
  .strict()

export const V2ProgramScheduleItemSchema = z
  .object({
    id: V2EntityIdSchema,
    title: z.string().min(1).max(120),
    order: z.number().int().positive(),
    heat: z.number().int().nonnegative(),
    state: z.enum(['CURRENT', 'NEXT', 'CLOSED', 'UPCOMING']),
  })
  .strict()

export const V2ProgramScheduleSchema = z
  .array(V2ProgramScheduleItemSchema)
  .max(64)
  .superRefine((programs, context) => {
    if (new Set(programs.map(({ id }) => id)).size !== programs.length) {
      context.addIssue({ code: 'custom', message: 'Program ids must be unique' })
    }
    if (new Set(programs.map(({ order }) => order)).size !== programs.length) {
      context.addIssue({ code: 'custom', message: 'Program orders must be unique' })
    }
    if (programs.filter(({ state }) => state === 'CURRENT').length > 1) {
      context.addIssue({ code: 'custom', message: 'At most one program may be CURRENT' })
    }
    if (programs.filter(({ state }) => state === 'NEXT').length > 1) {
      context.addIssue({ code: 'custom', message: 'At most one program may be NEXT' })
    }
  })

interface V2ContractIssue {
  path: Array<string | number>
  message: string
}

function snapshotStateIssues(value: {
  runtime: z.infer<typeof V2RuntimeTupleSchema>
  presentation: z.infer<typeof V2PresentationSchema>
  finalRecap: readonly unknown[]
}): V2ContractIssue[] {
  const issues: V2ContractIssue[] = []
  if (value.runtime.status !== 'RUNNING' && value.presentation.type !== 'NONE') {
    issues.push({
      path: ['presentation'],
      message: 'READY, PAUSED and COMPLETED snapshots require presentation NONE',
    })
  }
  if (
    value.presentation.type === 'FINALE_PREVIEW' &&
    !(
      value.runtime.mode === 'REHEARSAL' &&
      value.runtime.status === 'RUNNING' &&
      value.runtime.currentScene === 'COOPERATIVE_LIGHT'
    )
  ) {
    issues.push({
      path: ['presentation'],
      message: 'FINALE_PREVIEW requires REHEARSAL RUNNING COOPERATIVE_LIGHT',
    })
  }
  if (value.runtime.status !== 'COMPLETED' && value.finalRecap.length !== 0) {
    issues.push({
      path: ['finalRecap'],
      message: 'finalRecap must be empty before COMPLETED',
    })
  }
  return issues
}

function publicProjectionIssues(value: {
  publicStars: readonly z.infer<typeof V2PublicStarSchema>[]
  aggregate: z.infer<typeof V2PublicAggregateSchema>
}): V2ContractIssue[] {
  const issues: V2ContractIssue[] = []
  const starIds = value.publicStars.map(({ publicStarId }) => publicStarId)
  const slots = value.publicStars.map(({ formationSlot }) => formationSlot)
  if (new Set(starIds).size !== starIds.length) {
    issues.push({ path: ['publicStars'], message: 'publicStarId values must be unique' })
  }
  if (new Set(slots).size !== slots.length) {
    issues.push({ path: ['publicStars'], message: 'formationSlot values must be unique' })
  }
  if (value.aggregate.publicStarCount !== value.publicStars.length) {
    issues.push({
      path: ['aggregate', 'publicStarCount'],
      message: 'publicStarCount must equal the publicStars array length',
    })
  }
  const startedCount = value.publicStars.filter(({ started }) => started).length
  if (value.aggregate.starStartedCount !== startedCount) {
    issues.push({
      path: ['aggregate', 'starStartedCount'],
      message: 'starStartedCount must equal the started public star count',
    })
  }
  if (value.aggregate.admittedCount > value.aggregate.publicStarCount) {
    issues.push({
      path: ['aggregate', 'admittedCount'],
      message: 'admittedCount cannot exceed publicStarCount',
    })
  }
  if (value.aggregate.starStartedCount > value.aggregate.admittedCount) {
    issues.push({
      path: ['aggregate', 'starStartedCount'],
      message: 'starStartedCount cannot exceed admittedCount',
    })
  }
  if (value.aggregate.cooperativeLightCount > value.aggregate.admittedCount) {
    issues.push({
      path: ['aggregate', 'cooperativeLightCount'],
      message: 'cooperativeLightCount cannot exceed admittedCount',
    })
  }
  return issues
}

function addContractIssues(
  issues: readonly V2ContractIssue[],
  context: { addIssue(issue: { code: 'custom'; path: Array<string | number>; message: string }): void },
): void {
  for (const issue of issues) context.addIssue({ code: 'custom', ...issue })
}

const snapshotBase = {
  status: z.literal('ok'),
  protocolVersion: V2ProtocolVersionSchema,
  resetEpoch: V2ResetEpochSchema,
  generatedAt: V2IsoDateTimeSchema,
  runtime: V2RuntimeTupleSchema,
  presentation: V2PresentationSchema,
  presentationRevision: V2RevisionSchema,
  rewardRuleVersion: V2RewardRuleVersionSchema,
}

export const V2ScreenSnapshotSchema = z
  .object({
    ...snapshotBase,
    publicSeq: V2StreamSequenceSchema,
    publicStars: z.array(V2PublicStarSchema).max(300),
    aggregateRevision: V2RevisionSchema,
    aggregate: V2PublicAggregateSchema,
    currentProgram: V2ProgramProjectionSchema.nullable(),
    interaction: V2ScreenInteractionStateSchema,
    publishedBarrages: z.array(V2PublicBarrageSchema).max(8),
    finalRecap: V2CapsuleProjectionListSchema,
  })
  .strict()
  .superRefine((value, context) => {
    addContractIssues(snapshotStateIssues(value), context)
    addContractIssues(publicProjectionIssues(value), context)
  })

export const V2ParticipantSnapshotSchema = z
  .object({
    ...snapshotBase,
    publicSeq: V2StreamSequenceSchema,
    participantSeq: V2StreamSequenceSchema,
    participantStreamId: z.string().regex(/^participant:[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
    participant: V2ParticipantProjectionSchema,
    publicStars: z.array(V2PublicStarSchema).max(300),
    aggregateRevision: V2RevisionSchema,
    aggregate: V2PublicAggregateSchema,
    currentProgram: V2ProgramProjectionSchema.nullable(),
    programs: V2ProgramScheduleSchema,
    interaction: V2ScreenInteractionStateSchema,
    finalRecap: V2CapsuleProjectionListSchema,
  })
  .strict()
  .superRefine((value, context) => {
    addContractIssues(snapshotStateIssues(value), context)
    addContractIssues(publicProjectionIssues(value), context)
    const expected = expectedAllowedActions(value)
    if (JSON.stringify(value.participant.allowedActions) !== JSON.stringify(expected)) {
      context.addIssue({
        code: 'custom',
        path: ['participant', 'allowedActions'],
        message: 'allowedActions do not match the authoritative v2 state',
      })
    }
    if (value.participant.ownPublicStarId !== null) {
      const ownStar = value.publicStars.find(
        ({ publicStarId }) => publicStarId === value.participant.ownPublicStarId,
      )
      if (!ownStar) {
        context.addIssue({
          code: 'custom',
          path: ['participant', 'ownPublicStarId'],
          message: 'The locked participant star must exist in publicStars',
        })
      } else if (
        ownStar.colorTemperatureKelvin !== value.participant.colorTemperatureKelvin ||
        ownStar.displayColor !== value.participant.displayColor ||
        ownStar.formationSlot !== value.participant.formationSlot ||
        ownStar.started !== value.participant.started
      ) {
        context.addIssue({
          code: 'custom',
          path: ['participant', 'ownPublicStarId'],
          message: 'Participant and public star color, slot and started facts must agree',
        })
      }
    }
    if (value.participant.rewards[0]?.rewardRuleVersion !== value.rewardRuleVersion) {
      context.addIssue({
        code: 'custom',
        path: ['participant', 'rewards'],
        message: 'Every reward row must use the snapshot rewardRuleVersion',
      })
    }
    const currentPrograms = value.programs.filter(({ state }) => state === 'CURRENT')
    if (
      (value.currentProgram === null && currentPrograms.length !== 0) ||
      (value.currentProgram !== null &&
        (currentPrograms.length !== 1 || currentPrograms[0]?.id !== value.currentProgram.id))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['programs'],
        message: 'The participant schedule CURRENT item must match currentProgram',
      })
    }
  })

export const V2AdminRoleSchema = z.enum([
  'STAGE_CONTROLLER',
  'REVIEWER',
  'DEMO_ADMIN',
  'ALL',
])
export const V2ReadinessWarningSchema = z.enum([
  'ONBOARDING_PENDING',
  'STAR_START_PENDING',
  'COOPERATIVE_LIGHT_PENDING',
])

export const V2AdminCapsuleCandidateSchema = z
  .object({
    capsuleId: V2EntityIdSchema,
    publicStarId: V2PublicStarIdSchema,
    colorTemperatureKelvin: V2ColorTemperatureKelvinSchema,
    displayColor: V2DisplayColorSchema,
    text: V2CapsuleTextSchema,
    moderationStatus: V2CapsuleModerationStatusSchema,
    participantRevision: V2RevisionSchema,
    submittedAt: V2IsoDateTimeSchema,
    updatedAt: V2IsoDateTimeSchema,
  })
  .strict()

export const V2AdminSnapshotSchema = z
  .object({
    ...snapshotBase,
    publicSeq: V2StreamSequenceSchema,
    adminSeq: V2StreamSequenceSchema,
    roles: z.array(V2AdminRoleSchema).min(1).max(4),
    aggregateRevision: V2RevisionSchema,
    funnel: V2AdminFunnelSchema,
    readinessWarnings: z.array(V2ReadinessWarningSchema).max(3),
    interaction: V2ScreenInteractionStateSchema,
    publishedBarrages: z.array(V2AdminBarrageSchema).max(8),
    capsuleCandidates: z.array(V2AdminCapsuleCandidateSchema).max(300),
    lastControlReceipt: z
      .object({
        command: z.string().min(1).max(64),
        result: z.enum(['APPLIED', 'REPLAYED']),
        beforeRunRevision: V2RevisionSchema,
        afterRunRevision: V2RevisionSchema,
        beforePresentationRevision: V2RevisionSchema,
        afterPresentationRevision: V2RevisionSchema,
        at: V2IsoDateTimeSchema,
      })
      .strict()
      .nullable(),
    currentProgram: V2ProgramProjectionSchema.nullable(),
    programs: V2ProgramScheduleSchema,
    finalRecap: V2CapsuleProjectionListSchema,
  })
  .strict()
  .superRefine((value, context) => {
    addContractIssues(snapshotStateIssues(value), context)
    const currentPrograms = value.programs.filter(({ state }) => state === 'CURRENT')
    if (
      (value.currentProgram === null && currentPrograms.length !== 0) ||
      (value.currentProgram !== null &&
        (currentPrograms.length !== 1 || currentPrograms[0]?.id !== value.currentProgram.id))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['programs'],
        message: 'The admin schedule CURRENT item must match currentProgram',
      })
    }
  })

const v2WriteBase = {
  protocolVersion: V2ProtocolVersionSchema,
  resetEpoch: V2ResetEpochSchema,
  idempotencyKey: z.string().min(8).max(128),
}

export const V2ActivateParticipantRequestSchema = z.discriminatedUnion(
  'method',
  [
    z
      .object({
        ...v2WriteBase,
        method: z.literal('INVITATION_TOKEN'),
        token: z.string().min(32).max(128),
      })
      .strict(),
    z
      .object({
        ...v2WriteBase,
        method: z.literal('ASSISTED_SYNTHETIC'),
        displayName: z.string().trim().min(1).max(40),
        studentNumber: z.string().regex(/^2026\d{8}$/),
      })
      .strict(),
  ],
)

export const V2ActivateParticipantResponseSchema = z
  .object({
    status: z.literal('ok'),
    protocolVersion: V2ProtocolVersionSchema,
    activationCreated: z.boolean(),
    snapshot: V2ParticipantSnapshotSchema,
  })
  .strict()

export const V2_PARTICIPANT_COMMANDS = [
  'LOCK_COLOR',
  'UPSERT_CAPSULE',
  'SKIP_CAPSULE',
  'START_STAR',
  'SEND_GIFT',
  'POST_BARRAGE',
  'COOPERATIVE_LIGHT',
] as const

const participantCommandBase = {
  ...v2WriteBase,
  expectedParticipantRevision: V2RevisionSchema,
}

export const V2ParticipantCommandSchema = z.discriminatedUnion('command', [
  z
    .object({
      ...participantCommandBase,
      command: z.literal('LOCK_COLOR'),
      colorTemperatureKelvin: V2ColorTemperatureKelvinSchema,
    })
    .strict(),
  z
    .object({
      ...participantCommandBase,
      command: z.literal('UPSERT_CAPSULE'),
      text: V2CapsuleTextSchema,
      candidateScopeAccepted: z.literal(true),
    })
    .strict(),
  z
    .object({ ...participantCommandBase, command: z.literal('SKIP_CAPSULE') })
    .strict(),
  z
    .object({ ...participantCommandBase, command: z.literal('START_STAR') })
    .strict(),
  z
    .object({
      ...participantCommandBase,
      command: z.literal('SEND_GIFT'),
      programId: V2EntityIdSchema,
      giftId: V2EntityIdSchema,
    })
    .strict(),
  z
    .object({
      ...participantCommandBase,
      command: z.literal('POST_BARRAGE'),
      text: V2BarrageTextSchema,
    })
    .strict(),
  z
    .object({
      ...participantCommandBase,
      command: z.literal('COOPERATIVE_LIGHT'),
    })
    .strict(),
])

export const V2_ADMIN_COMMANDS = [
  'SET_MODE',
  'START',
  'SET_SCENE',
  'SET_PROGRAM',
  'ADVANCE',
  'PAUSE',
  'RESUME',
  'COMPLETE',
  'PREVIEW_FINALE',
  'SELECT_CAPSULE',
  'SHOW_CAPSULE_INSERT',
  'REMOVE_CAPSULE',
  'CLEAR_PRESENTATION',
  'SET_BARRAGE_PAUSED',
  'REMOVE_BARRAGE',
  'BLOCK_BARRAGE_SOURCE',
  'CLEAR_BARRAGES',
  'RESET_DEMO',
] as const

const runtimeCommandBase = {
  ...v2WriteBase,
  expectedRunRevision: V2RevisionSchema,
}
const presentationCommandBase = {
  ...runtimeCommandBase,
  expectedPresentationRevision: V2RevisionSchema,
}

export const V2AdminCommandSchema = z.discriminatedUnion('command', [
  z
    .object({
      ...runtimeCommandBase,
      command: z.literal('SET_MODE'),
      targetMode: V2ModeSchema,
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({ ...runtimeCommandBase, command: z.literal('START'), confirmed: z.literal(true) })
    .strict(),
  z
    .object({
      ...runtimeCommandBase,
      command: z.literal('SET_PROGRAM'),
      expectedInteractionRevision: V2RevisionSchema,
      programId: V2EntityIdSchema,
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...presentationCommandBase,
      command: z.literal('SET_SCENE'),
      targetScene: V2SceneSchema,
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...presentationCommandBase,
      command: z.literal('ADVANCE'),
      confirmed: z.literal(true),
      overrideReadinessWarnings: z.boolean(),
    })
    .strict(),
  z
    .object({ ...presentationCommandBase, command: z.literal('PAUSE'), confirmed: z.literal(true) })
    .strict(),
  z
    .object({ ...runtimeCommandBase, command: z.literal('RESUME'), confirmed: z.literal(true) })
    .strict(),
  z
    .object({
      ...presentationCommandBase,
      command: z.literal('COMPLETE'),
      confirmed: z.literal(true),
      overrideReadinessWarnings: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...presentationCommandBase,
      command: z.literal('PREVIEW_FINALE'),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...v2WriteBase,
      command: z.literal('SELECT_CAPSULE'),
      capsuleId: V2EntityIdSchema,
      expectedParticipantRevision: V2RevisionSchema,
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...presentationCommandBase,
      command: z.literal('SHOW_CAPSULE_INSERT'),
      capsuleIds: z
        .array(V2EntityIdSchema)
        .min(1)
        .max(6)
        .superRefine((capsuleIds, context) => {
          if (new Set(capsuleIds).size !== capsuleIds.length) {
            context.addIssue({
              code: 'custom',
              message: 'capsuleIds must be unique',
            })
          }
        }),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...v2WriteBase,
      command: z.literal('REMOVE_CAPSULE'),
      capsuleId: V2EntityIdSchema,
      expectedParticipantRevision: V2RevisionSchema,
      expectedPresentationRevision: V2RevisionSchema,
      reason: z.string().trim().min(1).max(240),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...presentationCommandBase,
      command: z.literal('CLEAR_PRESENTATION'),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...v2WriteBase,
      command: z.literal('SET_BARRAGE_PAUSED'),
      expectedInteractionRevision: V2RevisionSchema,
      paused: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...v2WriteBase,
      command: z.literal('REMOVE_BARRAGE'),
      expectedInteractionRevision: V2RevisionSchema,
      barrageId: V2EntityIdSchema,
      reason: z.string().trim().min(1).max(240),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...v2WriteBase,
      command: z.literal('BLOCK_BARRAGE_SOURCE'),
      expectedInteractionRevision: V2RevisionSchema,
      sourceId: V2EntityIdSchema,
      reason: z.string().trim().min(1).max(240),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...v2WriteBase,
      command: z.literal('CLEAR_BARRAGES'),
      expectedInteractionRevision: V2RevisionSchema,
      reason: z.string().trim().min(1).max(240),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      ...v2WriteBase,
      command: z.literal('RESET_DEMO'),
      confirmation: z.literal('RESET DEMO'),
      syntheticDataConfirmed: z.literal(true),
    })
    .strict(),
])

export const V2WriteCommandSchema = z.union([
  V2ParticipantCommandSchema,
  V2AdminCommandSchema,
])

export const V2ParticipantCommandResponseSchema = z
  .object({
    status: z.literal('ok'),
    protocolVersion: V2ProtocolVersionSchema,
    resetEpoch: V2ResetEpochSchema,
    command: z.enum(V2_PARTICIPANT_COMMANDS),
    replayed: z.boolean(),
    runtime: V2RuntimeTupleSchema,
    presentation: V2PresentationSchema,
    presentationRevision: V2RevisionSchema,
    participant: V2ParticipantProjectionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const expected = expectedAllowedActions(value)
    if (JSON.stringify(value.participant.allowedActions) !== JSON.stringify(expected)) {
      context.addIssue({
        code: 'custom',
        path: ['participant', 'allowedActions'],
        message: 'allowedActions do not match the authoritative v2 state',
      })
    }
  })

export const V2AdminCommandResponseSchema = z
  .object({
    status: z.literal('ok'),
    protocolVersion: V2ProtocolVersionSchema,
    resetEpoch: V2ResetEpochSchema,
    command: z.enum(V2_ADMIN_COMMANDS),
    replayed: z.boolean(),
    runtime: V2RuntimeTupleSchema,
    presentation: V2PresentationSchema,
    presentationRevision: V2RevisionSchema,
    interactionRevision: V2RevisionSchema,
    aggregateRevision: V2RevisionSchema,
    funnel: V2AdminFunnelSchema,
    readinessWarnings: z.array(V2ReadinessWarningSchema).max(3),
  })
  .strict()

export const V2_ERROR_CODES = [
  'AUTH_REQUIRED',
  'ROLE_REQUIRED',
  'VALIDATION_FAILED',
  'PROTOCOL_VERSION_MISMATCH',
  'STALE_RESET_EPOCH',
  'RUNTIME_PAUSED',
  'RUNTIME_COMPLETED',
  'STAR_CAPACITY_REACHED',
  'ONBOARDING_STATE_INVALID',
  'SCENE_TRANSITION_INVALID',
  'SCENE_ACTION_INVALID',
  'PRESENTATION_STATE_INVALID',
  'RESOURCE_NOT_FOUND',
  'REVISION_CONFLICT',
  'READINESS_CONFIRMATION_REQUIRED',
  'IDEMPOTENCY_CONFLICT',
  'INSUFFICIENT_BALANCE',
  'CONTENT_REJECTED',
  'SOURCE_BLOCKED',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'RESYNC_REQUIRED',
] as const
export const V2ApiErrorCodeSchema = z.enum(V2_ERROR_CODES)

export const V2ApiErrorSchema = z
  .object({
    code: V2ApiErrorCodeSchema,
    message: z.string().min(1).max(240),
    requestId: z.string().min(1).max(128),
    retryable: z.boolean(),
    resync: z
      .object({
        streamId: V2StreamIdSchema,
        snapshotRequired: z.literal(true),
      })
      .strict()
      .optional(),
    details: z
      .object({
        anonymousFunnel: V2AdminFunnelSchema,
        warnings: z.array(V2ReadinessWarningSchema).min(1).max(3),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.code === 'RESYNC_REQUIRED' && value.resync === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['resync'],
        message: 'RESYNC_REQUIRED must identify the affected stream',
      })
    }
    if (value.code !== 'RESYNC_REQUIRED' && value.resync !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['resync'],
        message: 'Only RESYNC_REQUIRED may carry resync instructions',
      })
    }
    if (
      value.code === 'READINESS_CONFIRMATION_REQUIRED' &&
      value.details === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['details'],
        message: 'READINESS_CONFIRMATION_REQUIRED must carry the latest anonymous funnel and warnings',
      })
    }
    if (
      value.code !== 'READINESS_CONFIRMATION_REQUIRED' &&
      value.details !== undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['details'],
        message: 'Only READINESS_CONFIRMATION_REQUIRED may carry readiness details',
      })
    }
    if (
      (value.code === 'RATE_LIMITED' || value.code === 'SERVICE_UNAVAILABLE') &&
      !value.retryable
    ) {
      context.addIssue({
        code: 'custom',
        path: ['retryable'],
        message: `${value.code} must be marked retryable`,
      })
    }
  })

export const V2SnapshotRecoveryHintSchema = z.discriminatedUnion('scope', [
  z
    .object({
      snapshotRequired: z.literal(true),
      scope: z.literal('ALL_AUTHORIZED'),
    })
    .strict(),
  z
    .object({
      snapshotRequired: z.literal(true),
      scope: z.literal('STREAM'),
      streamId: V2StreamIdSchema,
    })
    .strict(),
])

export const V2ApiErrorResponseSchema = z
  .object({
    status: z.literal('error'),
    protocolVersion: V2ProtocolVersionSchema,
    resetEpoch: V2ResetEpochSchema,
    error: V2ApiErrorSchema,
    recovery: V2SnapshotRecoveryHintSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.error.code === 'RESYNC_REQUIRED' &&
      (value.recovery.scope !== 'STREAM' ||
        value.recovery.streamId !== value.error.resync?.streamId)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['recovery'],
        message: 'RESYNC_REQUIRED recovery must identify the same affected stream',
      })
    }
    if (
      value.error.code === 'STALE_RESET_EPOCH' &&
      value.recovery.scope !== 'ALL_AUTHORIZED'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['recovery'],
        message: 'STALE_RESET_EPOCH requires all authorized snapshots',
      })
    }
  })

export const V2ClientSurfaceSchema = z.enum(['WELCOME', 'SCREEN', 'ADMIN'])
export const V2ContractsReadyCapabilitiesSchema = z
  .object({
    v2BusinessWrites: z.literal(false),
    v2Snapshots: z.literal(false),
    v2RealtimeEvents: z.literal(false),
    snapshotFirst: z.literal(true),
    splitStreams: z.literal(true),
    v1WriteAcceptedByV2: z.literal(false),
  })
  .strict()

export const V2ActiveCapabilitiesSchema = z
  .object({
    v2BusinessWrites: z.literal(true),
    v2Snapshots: z.literal(true),
    v2RealtimeEvents: z.literal(true),
    snapshotFirst: z.literal(true),
    splitStreams: z.literal(true),
    v1WriteAcceptedByV2: z.literal(false),
  })
  .strict()

export const V2CapabilitiesSchema = z.union([
  V2ContractsReadyCapabilitiesSchema,
  V2ActiveCapabilitiesSchema,
])

export const V2ProtocolLifecycleSchema = z.discriminatedUnion(
  'activationState',
  [
    z
      .object({
        contractVersion: V2ContractVersionSchema,
        activeRuntimeVersion: z.literal('1'),
        activationState: z.literal('CONTRACTS_READY'),
        capabilities: V2ContractsReadyCapabilitiesSchema,
      })
      .strict(),
    z
      .object({
        contractVersion: V2ContractVersionSchema,
        activeRuntimeVersion: z.literal('2'),
        activationState: z.literal('ACTIVE'),
        capabilities: V2ActiveCapabilitiesSchema,
      })
      .strict(),
  ],
)

const capabilityResponseBase = {
  service: z.literal('sysu-welcome-backend'),
  serverTime: V2IsoDateTimeSchema,
  endpoints: z
    .object({
      v2Handshake: z.literal('/api/v2/handshake'),
      v2Realtime: z.literal('/ws/v2'),
    })
    .strict(),
}

export const V2ProtocolCapabilitiesResponseSchema = z.discriminatedUnion(
  'activationState',
  [
    z.object({
      ...capabilityResponseBase,
      contractVersion: V2ContractVersionSchema,
      activeRuntimeVersion: z.literal('1'),
      activationState: z.literal('CONTRACTS_READY'),
      capabilities: V2ContractsReadyCapabilitiesSchema,
    }).strict(),
    z.object({
      ...capabilityResponseBase,
      contractVersion: V2ContractVersionSchema,
      activeRuntimeVersion: z.literal('2'),
      activationState: z.literal('ACTIVE'),
      resetEpoch: V2ResetEpochSchema,
      capabilities: V2ActiveCapabilitiesSchema,
    }).strict(),
  ],
)

export const V2HandshakeRequestSchema = z
  .object({
    protocolVersion: V2ProtocolVersionSchema,
    clientSurface: V2ClientSurfaceSchema,
    clientBuild: z.string().min(1).max(64),
  })
  .strict()

const handshakeResponseBase = {
  status: z.literal('ok'),
  protocolVersion: V2ProtocolVersionSchema,
  contractVersion: V2ContractVersionSchema,
  clientSurface: V2ClientSurfaceSchema,
  serverTime: V2IsoDateTimeSchema,
}

export const V2HandshakeResponseSchema = z.discriminatedUnion(
  'activationState',
  [
    z.object({
      ...handshakeResponseBase,
      activeRuntimeVersion: z.literal('1'),
      activationState: z.literal('CONTRACTS_READY'),
      capabilities: V2ContractsReadyCapabilitiesSchema,
    }).strict(),
    z.object({
      ...handshakeResponseBase,
      activeRuntimeVersion: z.literal('2'),
      activationState: z.literal('ACTIVE'),
      resetEpoch: V2ResetEpochSchema,
      capabilities: V2ActiveCapabilitiesSchema,
    }).strict(),
  ],
)

const handshakeErrorBase = {
  status: z.literal('error'),
  protocolVersion: V2ProtocolVersionSchema,
  contractVersion: V2ContractVersionSchema,
  error: V2ApiErrorSchema,
}

export const V2HandshakeErrorResponseSchema = z.discriminatedUnion(
  'activationState',
  [
    z.object({
      ...handshakeErrorBase,
      activeRuntimeVersion: z.literal('1'),
      activationState: z.literal('CONTRACTS_READY'),
      resetEpoch: z.null(),
    }).strict(),
    z.object({
      ...handshakeErrorBase,
      activeRuntimeVersion: z.literal('2'),
      activationState: z.literal('ACTIVE'),
      resetEpoch: V2ResetEpochSchema,
    }).strict(),
  ],
)

export const V2RealtimeHelloSchema = z
  .object({
    type: z.literal('HELLO'),
    protocolVersion: V2ProtocolVersionSchema,
    clientSurface: V2ClientSurfaceSchema,
    clientBuild: z.string().min(1).max(64),
  })
  .strict()

const helloAckBase = {
  type: z.literal('HELLO_ACK'),
  protocolVersion: V2ProtocolVersionSchema,
  contractVersion: V2ContractVersionSchema,
  clientSurface: V2ClientSurfaceSchema,
  serverTime: V2IsoDateTimeSchema,
}

// V2-01 negotiates a control-only socket while the runtime is still v1. The
// ACTIVE subscription acknowledgement (epoch + accepted cursors) is a V2-05
// contract and must not be implied by this frame.
export const V2RealtimeHelloAckSchema = z
  .discriminatedUnion('activationState', [
    z.object({
      ...helloAckBase,
      activeRuntimeVersion: z.literal('1'),
      activationState: z.literal('CONTRACTS_READY'),
      capabilities: V2ContractsReadyCapabilitiesSchema,
    }).strict(),
    z.object({
      ...helloAckBase,
      activeRuntimeVersion: z.literal('2'),
      activationState: z.literal('ACTIVE'),
      resetEpoch: V2ResetEpochSchema,
      capabilities: V2ActiveCapabilitiesSchema,
    }).strict(),
  ])

export const V2RealtimeSubscribedSchema = z
  .object({
    type: z.literal('SUBSCRIBED'),
    protocolVersion: V2ProtocolVersionSchema,
    resetEpoch: V2ResetEpochSchema,
    streams: z.array(V2StreamCursorSchema).min(1).max(2),
  })
  .strict()

const realtimeErrorBase = {
  type: z.literal('ERROR'),
  protocolVersion: V2ProtocolVersionSchema,
  contractVersion: V2ContractVersionSchema,
  error: V2ApiErrorSchema,
}

export const V2RealtimeErrorFrameSchema = z.discriminatedUnion(
  'activationState',
  [
    z.object({
      ...realtimeErrorBase,
      activeRuntimeVersion: z.literal('1'),
      activationState: z.literal('CONTRACTS_READY'),
      resetEpoch: z.null(),
    }).strict(),
    z.object({
      ...realtimeErrorBase,
      activeRuntimeVersion: z.literal('2'),
      activationState: z.literal('ACTIVE'),
      resetEpoch: V2ResetEpochSchema,
    }).strict(),
  ],
)

export const V2RealtimeNotActiveSchema = z
  .object({
    type: z.literal('NOT_ACTIVE'),
    protocolVersion: V2ProtocolVersionSchema,
    activeRuntimeVersion: z.literal('1'),
    activationState: z.literal('CONTRACTS_READY'),
    reason: z.literal('V2_RUNTIME_NOT_ACTIVE'),
  })
  .strict()

export const V2RealtimeServerControlSchema = z.union([
  V2RealtimeHelloAckSchema,
  V2RealtimeSubscribedSchema,
  V2RealtimeErrorFrameSchema,
  V2RealtimeNotActiveSchema,
])

export type V2RuntimeTuple = z.infer<typeof V2RuntimeTupleSchema>
export type V2RealtimeEventEnvelope = z.infer<
  typeof V2RealtimeEventEnvelopeSchema
>
export type V2ParticipantSnapshot = z.infer<typeof V2ParticipantSnapshotSchema>
export type V2ScreenSnapshot = z.infer<typeof V2ScreenSnapshotSchema>
export type V2AdminSnapshot = z.infer<typeof V2AdminSnapshotSchema>
export type V2ApiErrorCode = z.infer<typeof V2ApiErrorCodeSchema>
