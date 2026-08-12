import { z } from 'zod'

import {
  EventSequenceSchema,
  IsoDateTimeSchema,
  ProtocolVersionSchema,
  StarTemperatureKelvinSchema,
} from './primitives.js'
import { RuntimeSnapshotSchema } from './runtime.js'

export const CapsuleDisplayTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => Array.from(value).length <= 80, {
    message: '时光胶囊最多 80 个可见字符',
  })

export const ScreenProgramSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().min(1).max(80),
    order: z.number().int().positive(),
    heat: z.number().int().nonnegative(),
  })
  .strict()

export const ScreenAggregatesSchema = z
  .object({
    activatedCount: z.number().int().nonnegative(),
    starCreatedCount: z.number().int().nonnegative(),
    starStartedCount: z.number().int().nonnegative(),
    totalStarlight: z.number().int().nonnegative(),
    interactionCount: z.number().int().nonnegative(),
    cooperativeLightCount: z.number().int().nonnegative(),
    eligibleParticipantCount: z.number().int().nonnegative(),
    levelDistribution: z
      .object({
        activated: z.number().int().nonnegative(),
        connected: z.number().int().nonnegative(),
        resonant: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
      })
      .strict()
      .default({ activated: 0, connected: 0, resonant: 0, completed: 0 }),
  })
  .strict()

export const ScreenStarNodeSchema = z
  .object({
    id: z.string().min(1).max(40),
    visualSeed: z.string().regex(/^[a-f0-9]{32}$/),
    starTemperatureKelvin: StarTemperatureKelvinSchema.nullable(),
    started: z.boolean(),
  })
  .strict()

export const ScreenCapsuleSchema = z
  .object({
    publicStarId: z.string().min(1).max(40),
    starTemperatureKelvin: StarTemperatureKelvinSchema.nullable(),
    text: CapsuleDisplayTextSchema,
  })
  .strict()

export const PublishedBarrageSchema = z
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
  .strict()

export const ScreenSnapshotSchema = z
  .object({
    protocolVersion: ProtocolVersionSchema,
    generatedAt: IsoDateTimeSchema,
    eventSeq: EventSequenceSchema,
    runtime: RuntimeSnapshotSchema.extend({
      currentProgramId: z.string().min(1).max(64).nullable().default(null),
    }).strict(),
    displayBatch: z.number().int().nonnegative(),
    programs: z.array(ScreenProgramSchema),
    aggregates: ScreenAggregatesSchema,
    starNodes: z.array(ScreenStarNodeSchema).default([]),
    displayedCapsules: z.array(ScreenCapsuleSchema).max(6).default([]),
    publishedBarrages: z.array(PublishedBarrageSchema),
  })
  .strict()

export type ScreenProgram = z.infer<typeof ScreenProgramSchema>
export type ScreenAggregates = z.infer<typeof ScreenAggregatesSchema>
export type PublishedBarrage = z.infer<typeof PublishedBarrageSchema>
export type ScreenStarNode = z.infer<typeof ScreenStarNodeSchema>
export type ScreenCapsule = z.infer<typeof ScreenCapsuleSchema>
export type ScreenSnapshot = z.infer<typeof ScreenSnapshotSchema>
