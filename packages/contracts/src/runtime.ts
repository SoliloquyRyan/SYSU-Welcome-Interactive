import { z } from 'zod'

import {
  IsoDateTimeSchema,
  ResetEpochSchema,
  RuntimeStageSchema,
  StageRevisionSchema,
} from './primitives.js'

export const RuntimeModeSchema = z.enum(['REHEARSAL', 'LIVE'])
export const RuntimeStatusSchema = z.enum([
  'READY',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
])

export const RuntimeSnapshotSchema = z
  .object({
    resetEpoch: ResetEpochSchema,
    stageRevision: StageRevisionSchema,
    mode: RuntimeModeSchema,
    status: RuntimeStatusSchema,
    stage: RuntimeStageSchema,
    barragePaused: z.boolean(),
    updatedAt: IsoDateTimeSchema,
  })
  .strict()

export type RuntimeMode = z.infer<typeof RuntimeModeSchema>
export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>
export type RuntimeSnapshot = z.infer<typeof RuntimeSnapshotSchema>
