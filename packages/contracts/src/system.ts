import { z } from 'zod'

import { ApiErrorSchema } from './errors.js'
import {
  IsoDateTimeSchema,
  ProtocolVersionSchema,
  ResetEpochSchema,
  StageRevisionSchema,
} from './primitives.js'

export const ServiceNameSchema = z.literal('sysu-welcome-backend')

export const HealthResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: ServiceNameSchema,
    protocolVersion: ProtocolVersionSchema,
    now: IsoDateTimeSchema,
  })
  .strict()

export const ReadyCheckSchema = z.enum(['ready', 'not_ready'])

export const ReadyResponseSchema = z
  .object({
    status: z.enum(['ready', 'not_ready']),
    service: ServiceNameSchema,
    protocolVersion: ProtocolVersionSchema,
    now: IsoDateTimeSchema,
    checks: z
      .object({
        database: ReadyCheckSchema,
        migrations: ReadyCheckSchema,
        seed: ReadyCheckSchema,
        realtime: ReadyCheckSchema,
      })
      .strict(),
    schemaVersion: z.number().int().nonnegative().nullable(),
    seedVersion: z.string().min(1).max(64).nullable(),
    seedParticipantCount: z.number().int().nonnegative(),
    resetEpoch: ResetEpochSchema.nullable(),
    stageRevision: StageRevisionSchema.nullable(),
    error: ApiErrorSchema.optional(),
  })
  .strict()

export type HealthResponse = z.infer<typeof HealthResponseSchema>
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>
