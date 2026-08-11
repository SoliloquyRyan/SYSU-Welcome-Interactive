import { z } from 'zod'

import { ResetEpochSchema, StageRevisionSchema } from './primitives.js'

export const ApiErrorCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'ROLE_REQUIRED',
  'RATE_LIMITED',
  'VALIDATION_FAILED',
  'IDEMPOTENCY_CONFLICT',
  'STALE_STAGE',
  'RESET_EPOCH_CHANGED',
  'RUNTIME_PAUSED',
  'STAGE_LOCKED',
  'STAR_TEMPERATURE_LOCKED',
  'INSUFFICIENT_BALANCE',
  'CONTENT_REJECTED',
  'SOURCE_BLOCKED',
  'SERVICE_UNAVAILABLE',
])

export const ApiErrorSchema = z
  .object({
    code: ApiErrorCodeSchema,
    message: z.string().min(1).max(240),
    requestId: z.string().min(1).max(128),
  })
  .strict()

export const ApiErrorResponseSchema = z
  .object({
    status: z.literal('error'),
    error: ApiErrorSchema,
    resetEpoch: ResetEpochSchema.optional(),
    stageRevision: StageRevisionSchema.optional(),
  })
  .strict()

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>
export type ApiError = z.infer<typeof ApiErrorSchema>
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>
