import { z } from 'zod'

import {
  EventSequenceSchema,
  IsoDateTimeSchema,
  ProtocolVersionSchema,
  ResetEpochSchema,
} from './primitives.js'

export const RealtimeStreamSchema = z.enum([
  'public',
  'screen',
  'admin',
  'participant',
])

export const RealtimeEventEnvelopeSchema = z
  .object({
    protocolVersion: ProtocolVersionSchema,
    resetEpoch: ResetEpochSchema,
    stream: RealtimeStreamSchema,
    eventSeq: EventSequenceSchema,
    eventId: z.string().min(1).max(128),
    type: z.string().min(1).max(96),
    committedAt: IsoDateTimeSchema,
    payload: z.unknown(),
  })
  .strict()

export type RealtimeStream = z.infer<typeof RealtimeStreamSchema>
export type RealtimeEventEnvelope = z.infer<
  typeof RealtimeEventEnvelopeSchema
>

const EventBaseSchema = z.object({
  protocolVersion: ProtocolVersionSchema,
  resetEpoch: ResetEpochSchema,
  eventSeq: EventSequenceSchema,
  eventId: z.string().min(1).max(128),
  committedAt: IsoDateTimeSchema,
})

function screenEvent<TType extends string, TPayload extends z.ZodType>(
  type: TType,
  payload: TPayload,
) {
  return EventBaseSchema.extend({
    stream: z.literal('screen'),
    type: z.literal(type),
    payload,
  }).strict()
}

const AggregatePayloadSchema = z
  .object({
    activatedCount: z.number().int().nonnegative(),
    starStartedCount: z.number().int().nonnegative(),
    totalStarlight: z.number().int().nonnegative(),
    interactionCount: z.number().int().nonnegative(),
    cooperativeLightCount: z.number().int().nonnegative(),
    eligibleParticipantCount: z.number().int().nonnegative(),
  })
  .strict()

export const G2RealtimeEventEnvelopeSchema = z.discriminatedUnion('type', [
  screenEvent(
    'runtime.stage.changed',
    z
      .object({
        mode: z.enum(['REHEARSAL', 'LIVE']),
        status: z.enum(['READY', 'RUNNING', 'PAUSED', 'COMPLETED']),
        stage: z.number().int().min(1).max(6),
        stageRevision: z.number().int().nonnegative(),
        currentProgramId: z.string().min(1).max(64).nullable(),
      })
      .strict(),
  ),
  screenEvent(
    'runtime.status.changed',
    z
      .object({
        mode: z.enum(['REHEARSAL', 'LIVE']),
        status: z.enum(['READY', 'RUNNING', 'PAUSED', 'COMPLETED']),
        stage: z.number().int().min(1).max(6),
        stageRevision: z.number().int().nonnegative(),
      })
      .strict(),
  ),
  screenEvent(
    'program.changed',
    z
      .object({
        programId: z.string().min(1).max(64),
        stageRevision: z.number().int().nonnegative(),
      })
      .strict(),
  ),
  screenEvent(
    'participant.activated',
    z.object({ activatedCount: z.number().int().nonnegative() }).strict(),
  ),
  screenEvent('aggregate.updated', AggregatePayloadSchema),
  screenEvent(
    'star.started',
    z
      .object({
        publicStarId: z.string().min(1).max(40),
        starStartedCount: z.number().int().nonnegative(),
      })
      .strict(),
  ),
  screenEvent(
    'gift.accepted',
    z
      .object({
        programId: z.string().min(1).max(64),
        giftId: z.string().min(1).max(64),
        powerCost: z.union([
          z.literal(5),
          z.literal(10),
          z.literal(20),
          z.literal(50),
        ]),
        programHeat: z.number().int().nonnegative(),
      })
      .strict(),
  ),
  screenEvent(
    'barrage.published',
    z
      .object({
        barrage: z
          .object({
            id: z.string().min(1).max(64),
            text: z
              .string()
              .min(1)
              .max(120)
              .refine((value) => Array.from(value).length <= 40),
            displaySeq: z.number().int().nonnegative(),
            publishedAt: IsoDateTimeSchema,
          })
          .strict(),
      })
      .strict(),
  ),
  screenEvent(
    'barrage.removed',
    z.object({ barrageIds: z.array(z.string().min(1).max(64)) }).strict(),
  ),
  screenEvent(
    'source.blocked',
    z
      .object({
        sourceId: z.string().min(1).max(64),
        barrageIds: z.array(z.string().min(1).max(64)),
      })
      .strict(),
  ),
  screenEvent(
    'barrage.cleared',
    z
      .object({
        displayBatch: z.number().int().nonnegative(),
        stageRevision: z.number().int().nonnegative(),
      })
      .strict(),
  ),
  screenEvent(
    'barrage.pause.changed',
    z
      .object({
        paused: z.boolean(),
        stageRevision: z.number().int().nonnegative(),
      })
      .strict(),
  ),
  screenEvent('cooperation.updated', AggregatePayloadSchema),
  screenEvent(
    'demo.reset',
    z
      .object({
        previousResetEpoch: ResetEpochSchema,
      })
      .strict(),
  ),
  screenEvent(
    'resync.required',
    z
      .object({
        reason: z.enum(['EPOCH_CHANGED', 'EVENT_GAP', 'HISTORY_UNAVAILABLE']),
      })
      .strict(),
  ),
])

export type G2RealtimeEventEnvelope = z.infer<
  typeof G2RealtimeEventEnvelopeSchema
>
