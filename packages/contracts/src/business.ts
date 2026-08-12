import { z } from 'zod'

import {
  EventSequenceSchema,
  IsoDateTimeSchema,
  ProtocolVersionSchema,
  ResetEpochSchema,
  RuntimeStageSchema,
  StarTemperatureKelvinSchema,
  StageRevisionSchema,
} from './primitives.js'
import { RuntimeSnapshotSchema } from './runtime.js'
import {
  PublishedBarrageSchema,
  ScreenProgramSchema,
} from './snapshot.js'

const CapsuleMessageTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => Array.from(value).length <= 80, {
    message: '时光胶囊最多 80 个可见字符',
  })

const BarrageTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => Array.from(value).length <= 40, {
    message: '弹幕最多 40 个可见字符',
  })

export const AdminRoleSchema = z.enum([
  'REVIEWER',
  'STAGE_CONTROLLER',
  'DEMO_ADMIN',
  'ALL',
])

export const CommandVersionSchema = z
  .object({
    resetEpoch: ResetEpochSchema,
    stageRevision: StageRevisionSchema,
  })
  .strict()

export const ParticipantProgramSchema = ScreenProgramSchema.extend({
  state: z.enum(['CURRENT', 'NEXT', 'CLOSED', 'UPCOMING']),
}).strict()

export const GiftOptionSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(40),
    order: z.number().int().positive(),
    powerCost: z.union([
      z.literal(5),
      z.literal(10),
      z.literal(20),
      z.literal(50),
    ]),
  })
  .strict()

export const ParticipantPrivateStateSchema = z
  .object({
    id: z.string().min(1).max(64),
    displayName: z.string().min(1).max(40),
    publicStarId: z.string().min(1).max(40),
    visualSeed: z.string().regex(/^[a-f0-9]{32}$/),
    starTemperatureKelvin: StarTemperatureKelvinSchema.nullable(),
    starTemperatureLocked: z.boolean(),
    powerBalance: z.number().int().nonnegative(),
    starlight: z.number().int().min(0).max(100),
    activatedAt: IsoDateTimeSchema,
    capsuleMessage: CapsuleMessageTextSchema.nullable(),
    capsuleMessageSubmitted: z.boolean(),
    capsulePublicNoticeAccepted: z.boolean(),
    capsuleCandidateStatus: z.enum([
      'NOT_SUBMITTED',
      'LEGACY_PRIVATE',
      'SUBMITTED',
      'SELECTED',
      'DISPLAYED',
      'REMOVED',
    ]),
    starStarted: z.boolean(),
    firstGiftCompleted: z.boolean(),
    firstBarrageCompleted: z.boolean(),
    cooperativeLightCompleted: z.boolean(),
    giftCount: z.number().int().nonnegative(),
    publishedBarrageCount: z.number().int().nonnegative(),
    interactionCount: z.number().int().nonnegative(),
  })
  .strict()

export const ParticipantGiftHistorySchema = z
  .object({
    id: z.string().min(1).max(64),
    programTitle: z.string().min(1).max(80),
    giftName: z.string().min(1).max(40),
    powerCost: z.union([
      z.literal(5),
      z.literal(10),
      z.literal(20),
      z.literal(50),
    ]),
    createdAt: IsoDateTimeSchema,
  })
  .strict()

export const ParticipantSnapshotSchema = z
  .object({
    status: z.literal('ok'),
    protocolVersion: ProtocolVersionSchema,
    generatedAt: IsoDateTimeSchema,
    eventSeq: EventSequenceSchema,
    runtime: RuntimeSnapshotSchema.extend({
      currentProgramId: z.string().min(1).max(64).nullable(),
    }).strict(),
    participant: ParticipantPrivateStateSchema,
    programs: z.array(ParticipantProgramSchema),
    gifts: z.array(GiftOptionSchema),
    giftHistory: z.array(ParticipantGiftHistorySchema).default([]),
    archiveAvailable: z.boolean(),
  })
  .strict()

export const ActivateParticipantRequestSchema = z.discriminatedUnion('method', [
  z
    .object({
      method: z.literal('INVITATION_TOKEN'),
      token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    })
    .strict(),
  z
    .object({
      method: z.literal('STUDENT_ID'),
      displayName: z.string().trim().min(1).max(40),
      studentNumber: z.string().regex(/^\d{8,20}$/),
    })
    .strict(),
])

export const CapsuleMessageRequestSchema = CommandVersionSchema.extend({
  text: CapsuleMessageTextSchema,
  publicDisplayNoticeAccepted: z.literal(true),
}).strict()

export const StarTemperatureRequestSchema = CommandVersionSchema.extend({
  temperatureKelvin: StarTemperatureKelvinSchema,
}).strict()

export const StageCommandRequestSchema = CommandVersionSchema

export const GiftRequestSchema = CommandVersionSchema.extend({
  programId: z.string().min(1).max(64),
  giftId: z.string().min(1).max(64),
}).strict()

export const BarrageRequestSchema = CommandVersionSchema.extend({
  text: BarrageTextSchema,
  publicNoticeAccepted: z.literal(true),
}).strict()

export const AdminLoginRequestSchema = z
  .object({
    username: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(128),
  })
  .strict()

export const AdminSessionSchema = z
  .object({
    shortId: z.string().min(1).max(32),
    roles: z.array(AdminRoleSchema),
  })
  .strict()

export const AdminRolesRequestSchema = CommandVersionSchema.extend({
  roles: z.array(AdminRoleSchema).min(1).max(4),
}).strict()

export const RuntimeActionSchema = z.enum([
  'SET_MODE',
  'START',
  'PAUSE',
  'RESUME',
  'JUMP',
  'ADVANCE',
  'COMPLETE',
  'SET_PROGRAM',
])

export const RuntimeCommandRequestSchema = CommandVersionSchema.extend({
  action: RuntimeActionSchema,
  mode: z.enum(['REHEARSAL', 'LIVE']).optional(),
  targetStage: RuntimeStageSchema.optional(),
  programId: z.string().min(1).max(64).optional(),
  confirmed: z.boolean().default(false),
}).strict()

export const BarrageModerationRequestSchema = CommandVersionSchema.extend({
  confirmed: z.boolean().default(false),
}).strict()

export const BarragePauseRequestSchema = CommandVersionSchema.extend({
  paused: z.boolean(),
}).strict()

export const InvitationStatusRequestSchema = CommandVersionSchema.extend({
  status: z.enum(['ACTIVE', 'REVOKED']),
  confirmed: z.literal(true),
}).strict()

export const DemoResetRequestSchema = CommandVersionSchema.extend({
  confirmation: z.literal('RESET DEMO'),
}).strict()

export const AdminBarrageSchema = PublishedBarrageSchema.extend({
  sourceId: z.string().min(1).max(64),
}).strict()

export const AdminInvitationSchema = z
  .object({
    id: z.string().min(1).max(64),
    identityId: z.string().min(1).max(64),
    tokenHint: z.string().min(1).max(16),
    status: z.enum(['ACTIVE', 'REVOKED']),
  })
  .strict()

export const AdminMetricsSchema = z
  .object({
    activatedCount: z.number().int().nonnegative(),
    onlineParticipantSessions: z.number().int().nonnegative(),
    onlineAdminSessions: z.number().int().nonnegative(),
    successfulActivations: z.number().int().nonnegative(),
    invalidEntryAttempts: z.number().int().nonnegative(),
    publishedBarrageCount: z.number().int().nonnegative(),
    removedBarrageCount: z.number().int().nonnegative(),
    blockedSourceCount: z.number().int().nonnegative(),
    recentFailureCount: z.number().int().nonnegative(),
  })
  .strict()

export const AdminOperationSchema = z
  .object({
    sessionShortId: z.string().min(1).max(32),
    roles: z.array(AdminRoleSchema),
    action: z.string().min(1).max(96),
    result: z.string().min(1).max(64),
    createdAt: IsoDateTimeSchema,
  })
  .strict()

export const AdminSnapshotSchema = z
  .object({
    status: z.literal('ok'),
    protocolVersion: ProtocolVersionSchema,
    generatedAt: IsoDateTimeSchema,
    eventSeq: EventSequenceSchema,
    session: AdminSessionSchema,
    runtime: RuntimeSnapshotSchema.extend({
      currentProgramId: z.string().min(1).max(64).nullable(),
    }).strict(),
    metrics: AdminMetricsSchema,
    programs: z.array(ParticipantProgramSchema),
    gifts: z.array(GiftOptionSchema),
    publishedBarrages: z.array(AdminBarrageSchema),
    invitations: z.array(AdminInvitationSchema),
    recentOperations: z.array(AdminOperationSchema),
  })
  .strict()

export const SessionEndedResponseSchema = z
  .object({
    status: z.literal('ok'),
  })
  .strict()

export type AdminRole = z.infer<typeof AdminRoleSchema>
export type CommandVersion = z.infer<typeof CommandVersionSchema>
export type ParticipantSnapshot = z.infer<typeof ParticipantSnapshotSchema>
export type ActivateParticipantRequest = z.infer<typeof ActivateParticipantRequestSchema>
export type AdminSnapshot = z.infer<typeof AdminSnapshotSchema>
export type RuntimeAction = z.infer<typeof RuntimeActionSchema>
