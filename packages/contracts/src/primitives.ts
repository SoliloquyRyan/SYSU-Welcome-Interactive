import { z } from 'zod'

export const ProtocolVersionSchema = z.literal('1')
export const ResetEpochSchema = z.number().int().positive()
export const StageRevisionSchema = z.number().int().nonnegative()
export const EventSequenceSchema = z.number().int().nonnegative()
export const RuntimeStageSchema = z.number().int().min(1).max(6)
export const IsoDateTimeSchema = z.string().datetime({ offset: true })

export type ProtocolVersion = z.infer<typeof ProtocolVersionSchema>
export type ResetEpoch = z.infer<typeof ResetEpochSchema>
export type StageRevision = z.infer<typeof StageRevisionSchema>
export type EventSequence = z.infer<typeof EventSequenceSchema>
export type RuntimeStage = z.infer<typeof RuntimeStageSchema>
