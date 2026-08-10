import {
  AdminSnapshotSchema,
  ParticipantSnapshotSchema,
  type AdminRole,
  type AdminSnapshot,
  type CommandVersion,
  type ParticipantSnapshot,
} from '@sysu-welcome/contracts'

import type { AuthenticatedSession } from '../auth/session.js'
import type { SqliteDatabase } from '../db/open-database.js'
import { ApiError } from '../http/api-error.js'

export interface RuntimeContext {
  resetEpoch: number
  eventSeq: number
  mode: 'REHEARSAL' | 'LIVE'
  status: 'READY' | 'RUNNING' | 'PAUSED' | 'COMPLETED'
  stage: number
  stageRevision: number
  displayBatch: number
  barragePaused: boolean
  currentProgramId: string | null
  updatedAt: string
}

export interface AggregateState {
  activatedCount: number
  starCreatedCount: number
  starStartedCount: number
  totalStarlight: number
  interactionCount: number
  cooperativeLightCount: number
  eligibleParticipantCount: number
  levelDistribution: {
    activated: number
    connected: number
    resonant: number
    completed: number
  }
}

export function readRuntimeContext(database: SqliteDatabase): RuntimeContext {
  const row = database
    .prepare(
      `SELECT a.reset_epoch AS resetEpoch, a.event_seq AS eventSeq,
              r.mode, r.status, r.stage,
              r.stage_revision AS stageRevision,
              r.display_batch AS displayBatch,
              r.barrage_paused AS barragePaused,
              p.current_program_id AS currentProgramId,
              r.updated_at AS updatedAt
       FROM app_state a
       CROSS JOIN runtime_state r
       CROSS JOIN program_runtime_state p
       WHERE a.id = 1 AND r.id = 1 AND p.id = 1`,
    )
    .get() as
    | (Omit<RuntimeContext, 'barragePaused'> & { barragePaused: number })
    | undefined
  if (!row) throw new Error('Runtime business state is unavailable')
  return { ...row, barragePaused: row.barragePaused === 1 }
}

export function assertCommandVersion(
  runtime: RuntimeContext,
  version: CommandVersion,
): void {
  if (version.resetEpoch !== runtime.resetEpoch) {
    throw new ApiError(
      'RESET_EPOCH_CHANGED',
      'Demo 已重置，请重新载入并登录。',
      409,
      runtime,
    )
  }
  if (version.stageRevision !== runtime.stageRevision) {
    throw new ApiError(
      'STALE_STAGE',
      '现场阶段已经变化，请同步后重试。',
      409,
      runtime,
    )
  }
}

export function requireParticipantStage(
  runtime: RuntimeContext,
  stage: 1 | 3 | 4 | 5,
): void {
  if (runtime.status === 'PAUSED') {
    throw new ApiError(
      'RUNTIME_PAUSED',
      '现场互动已暂停，请等待恢复。',
      409,
      runtime,
    )
  }
  const allowed =
    stage === 1
      ? (runtime.status === 'READY' || runtime.status === 'RUNNING') &&
        runtime.stage === 1
      : runtime.status === 'RUNNING' && runtime.stage === stage
  if (!allowed) {
    throw new ApiError(
      'STAGE_LOCKED',
      '当前阶段尚未开放该操作。',
      409,
      runtime,
    )
  }
}

export function requireFutureMessageStage(runtime: RuntimeContext): void {
  if (runtime.status === 'PAUSED') {
    throw new ApiError(
      'RUNTIME_PAUSED',
      '现场互动已暂停，请等待恢复。',
      409,
      runtime,
    )
  }
  const allowed =
    (runtime.status === 'READY' && runtime.stage === 1) ||
    (runtime.status === 'RUNNING' && (runtime.stage === 1 || runtime.stage === 2))
  if (!allowed) {
    throw new ApiError(
      'STAGE_LOCKED',
      '当前阶段不能保存未来寄语。',
      409,
      runtime,
    )
  }
}

export function requireAdminRole(
  session: AuthenticatedSession,
  required: AdminRole,
): void {
  if (!session.roles.includes('ALL') && !session.roles.includes(required)) {
    throw new ApiError(
      'ROLE_REQUIRED',
      `当前操作需要 ${required} 能力。`,
      403,
    )
  }
}

function readPrograms(database: SqliteDatabase, currentProgramId: string | null) {
  const rows = database
    .prepare(
      `SELECT id, title, sort_order AS sortOrder, heat
       FROM program_catalog WHERE enabled = 1 ORDER BY sort_order`,
    )
    .all() as Array<{
    id: string
    title: string
    sortOrder: number
    heat: number
  }>
  const currentIndex = rows.findIndex(({ id }) => id === currentProgramId)
  return rows.map((row, index) => ({
    id: row.id,
    title: row.title,
    order: row.sortOrder,
    heat: row.heat,
    state:
      index === currentIndex
        ? ('CURRENT' as const)
        : currentIndex >= 0 && index === currentIndex + 1
          ? ('NEXT' as const)
          : currentIndex >= 0 && index < currentIndex
            ? ('CLOSED' as const)
            : ('UPCOMING' as const),
  }))
}

function readGifts(database: SqliteDatabase) {
  return database
    .prepare(
      `SELECT id, name, sort_order AS "order", power_cost AS powerCost
       FROM gift_catalog WHERE enabled = 1 ORDER BY sort_order`,
    )
    .all() as Array<{
    id: string
    name: string
    order: number
    powerCost: 5 | 10 | 20 | 50
  }>
}

export function readAggregateState(database: SqliteDatabase): AggregateState {
  const row = database
    .prepare(
      `SELECT
         COUNT(*) AS activatedCount,
         COUNT(*) AS starCreatedCount,
         COALESCE(SUM(CASE WHEN star_started_at IS NOT NULL THEN 1 ELSE 0 END), 0)
           AS starStartedCount,
         COALESCE(SUM(starlight), 0) AS totalStarlight,
         COUNT(*) AS eligibleParticipantCount,
         COALESCE(SUM(CASE WHEN cooperative_light_at IS NOT NULL THEN 1 ELSE 0 END), 0)
           AS cooperativeLightCount,
         COALESCE(SUM(CASE WHEN starlight BETWEEN 0 AND 39 THEN 1 ELSE 0 END), 0)
           AS levelActivated,
         COALESCE(SUM(CASE WHEN starlight BETWEEN 40 AND 69 THEN 1 ELSE 0 END), 0)
           AS levelConnected,
         COALESCE(SUM(CASE WHEN starlight BETWEEN 70 AND 99 THEN 1 ELSE 0 END), 0)
           AS levelResonant,
         COALESCE(SUM(CASE WHEN starlight = 100 THEN 1 ELSE 0 END), 0)
           AS levelCompleted
       FROM participant_states`,
    )
    .get() as {
    activatedCount: number
    starCreatedCount: number
    starStartedCount: number
    totalStarlight: number
    eligibleParticipantCount: number
    cooperativeLightCount: number
    levelActivated: number
    levelConnected: number
    levelResonant: number
    levelCompleted: number
  }
  const interactions = database
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM participant_states WHERE star_started_at IS NOT NULL) +
         (SELECT COUNT(*) FROM gift_transactions) +
         (SELECT COUNT(*) FROM barrages WHERE status IN ('PUBLISHED', 'REMOVED')
                                      AND rejection_reason IS NULL) +
         (SELECT COUNT(*) FROM cooperative_lights) AS count`,
    )
    .get() as { count: number }
  return {
    activatedCount: row.activatedCount,
    starCreatedCount: row.starCreatedCount,
    starStartedCount: row.starStartedCount,
    totalStarlight: row.totalStarlight,
    interactionCount: interactions.count,
    cooperativeLightCount: row.cooperativeLightCount,
    eligibleParticipantCount: row.eligibleParticipantCount,
    levelDistribution: {
      activated: row.levelActivated,
      connected: row.levelConnected,
      resonant: row.levelResonant,
      completed: row.levelCompleted,
    },
  }
}

export function readAggregateEventPayload(database: SqliteDatabase) {
  const aggregate = readAggregateState(database)
  return {
    activatedCount: aggregate.activatedCount,
    starStartedCount: aggregate.starStartedCount,
    totalStarlight: aggregate.totalStarlight,
    interactionCount: aggregate.interactionCount,
    cooperativeLightCount: aggregate.cooperativeLightCount,
    eligibleParticipantCount: aggregate.eligibleParticipantCount,
  }
}

export function readParticipantSnapshot(
  database: SqliteDatabase,
  identityId: string,
  now: Date = new Date(),
): ParticipantSnapshot {
  const runtime = readRuntimeContext(database)
  const participant = database
    .prepare(
      `SELECT p.identity_id AS id, i.display_name AS displayName,
              i.public_star_id AS publicStarId, i.visual_seed AS visualSeed,
              p.power_balance AS powerBalance, p.starlight,
              p.activated_at AS activatedAt, p.future_message AS futureMessage,
              p.future_message_saved_at AS futureMessageSavedAt,
              p.star_started_at AS starStartedAt,
              p.first_gift_at AS firstGiftAt,
              p.first_barrage_at AS firstBarrageAt,
              p.cooperative_light_at AS cooperativeLightAt,
              (SELECT COUNT(*) FROM gift_transactions g
               WHERE g.identity_id = p.identity_id) AS giftCount,
              (SELECT COUNT(*) FROM barrages b
               WHERE b.identity_id = p.identity_id
                 AND b.status IN ('PUBLISHED', 'REMOVED')
                 AND b.rejection_reason IS NULL) AS publishedBarrageCount
       FROM participant_states p
       JOIN synthetic_identities i ON i.id = p.identity_id
       WHERE p.identity_id = ?`,
    )
    .get(identityId) as
    | {
        id: string
        displayName: string
        publicStarId: string
        visualSeed: string
        powerBalance: number
        starlight: number
        activatedAt: string
        futureMessage: string | null
        futureMessageSavedAt: string | null
        starStartedAt: string | null
        firstGiftAt: string | null
        firstBarrageAt: string | null
        cooperativeLightAt: string | null
        giftCount: number
        publishedBarrageCount: number
      }
    | undefined
  if (!participant) {
    throw new ApiError('AUTH_REQUIRED', '参与者会话已失效，请重新核验。', 401)
  }
  const giftHistory = database
    .prepare(
      `SELECT t.id, p.title AS programTitle, g.name AS giftName,
              t.power_cost AS powerCost, t.created_at AS createdAt
       FROM gift_transactions t
       JOIN program_catalog p ON p.id = t.program_id
       JOIN gift_catalog g ON g.id = t.gift_id
       WHERE t.identity_id = ?
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT 100`,
    )
    .all(identityId)
  const interactionCount =
    (participant.starStartedAt ? 1 : 0) +
    participant.giftCount +
    participant.publishedBarrageCount +
    (participant.cooperativeLightAt ? 1 : 0)

  return ParticipantSnapshotSchema.parse({
    status: 'ok',
    protocolVersion: '1',
    generatedAt: now.toISOString(),
    eventSeq: runtime.eventSeq,
    runtime: {
      resetEpoch: runtime.resetEpoch,
      stageRevision: runtime.stageRevision,
      mode: runtime.mode,
      status: runtime.status,
      stage: runtime.stage,
      barragePaused: runtime.barragePaused,
      updatedAt: runtime.updatedAt,
      currentProgramId: runtime.currentProgramId,
    },
    participant: {
      id: participant.id,
      displayName: participant.displayName,
      publicStarId: participant.publicStarId,
      visualSeed: participant.visualSeed,
      powerBalance: participant.powerBalance,
      starlight: participant.starlight,
      activatedAt: participant.activatedAt,
      futureMessage: participant.futureMessage,
      futureMessageSaved: participant.futureMessageSavedAt !== null,
      starStarted: participant.starStartedAt !== null,
      firstGiftCompleted: participant.firstGiftAt !== null,
      firstBarrageCompleted: participant.firstBarrageAt !== null,
      cooperativeLightCompleted: participant.cooperativeLightAt !== null,
      giftCount: participant.giftCount,
      publishedBarrageCount: participant.publishedBarrageCount,
      interactionCount,
    },
    programs: readPrograms(database, runtime.currentProgramId),
    gifts: readGifts(database),
    giftHistory,
    archiveAvailable: runtime.stage === 6 || runtime.status === 'COMPLETED',
  })
}

function parseRoles(value: string): AdminRole[] {
  try {
    return JSON.parse(value) as AdminRole[]
  } catch {
    return []
  }
}

export function readAdminSnapshot(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  now: Date = new Date(),
): AdminSnapshot {
  const runtime = readRuntimeContext(database)
  const nowIso = now.toISOString()
  const metrics = database
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM participant_states) AS activatedCount,
         (SELECT COUNT(*) FROM sessions s, app_state a
          WHERE a.id = 1 AND s.session_type = 'PARTICIPANT'
            AND s.reset_epoch = a.reset_epoch AND s.revoked_at IS NULL
            AND s.expires_at > ?) AS onlineParticipantSessions,
         (SELECT COUNT(*) FROM sessions s, app_state a
          WHERE a.id = 1 AND s.session_type = 'ADMIN'
            AND s.reset_epoch = a.reset_epoch AND s.revoked_at IS NULL
            AND s.expires_at > ?) AS onlineAdminSessions,
         (SELECT COUNT(*) FROM activation_attempts WHERE outcome = 'SUCCESS')
           AS successfulActivations,
         (SELECT COUNT(*) FROM activation_attempts WHERE outcome != 'SUCCESS')
           AS invalidEntryAttempts,
         (SELECT COUNT(*) FROM barrages WHERE status = 'PUBLISHED')
           AS publishedBarrageCount,
         (SELECT COUNT(*) FROM barrages WHERE status = 'REMOVED')
           AS removedBarrageCount,
         (SELECT COUNT(*) FROM blocked_sources) AS blockedSourceCount,
         ((SELECT COUNT(*) FROM activation_attempts
           WHERE outcome != 'SUCCESS'
             AND julianday(created_at) >= julianday(?) - (1.0 / 24.0)) +
          (SELECT COUNT(*) FROM admin_operation_records
           WHERE result != 'SUCCESS'
             AND julianday(created_at) >= julianday(?) - (1.0 / 24.0)))
           AS recentFailureCount`,
    )
    .get(nowIso, nowIso, nowIso, nowIso)
  const publishedBarrages = database
    .prepare(
      `SELECT id, text, display_seq AS displaySeq,
              published_at AS publishedAt, source_id AS sourceId
       FROM barrages WHERE status = 'PUBLISHED'
       ORDER BY display_seq DESC LIMIT 100`,
    )
    .all()
  const invitations = database
    .prepare(
      `SELECT id, identity_id AS identityId, token_hint AS tokenHint, status
       FROM invitation_tokens ORDER BY id`,
    )
    .all()
  const recentOperations = (
    database
      .prepare(
        `SELECT session_short_id AS sessionShortId, roles_json AS rolesJson,
                action, result, created_at AS createdAt
         FROM admin_operation_records
         ORDER BY id DESC LIMIT 50`,
      )
      .all() as Array<{
      sessionShortId: string
      rolesJson: string
      action: string
      result: string
      createdAt: string
    }>
  ).map(({ rolesJson, ...row }) => ({ ...row, roles: parseRoles(rolesJson) }))

  return AdminSnapshotSchema.parse({
    status: 'ok',
    protocolVersion: '1',
    generatedAt: now.toISOString(),
    eventSeq: runtime.eventSeq,
    session: { shortId: session.shortId, roles: session.roles },
    runtime: {
      resetEpoch: runtime.resetEpoch,
      stageRevision: runtime.stageRevision,
      mode: runtime.mode,
      status: runtime.status,
      stage: runtime.stage,
      barragePaused: runtime.barragePaused,
      updatedAt: runtime.updatedAt,
      currentProgramId: runtime.currentProgramId,
    },
    metrics,
    programs: readPrograms(database, runtime.currentProgramId),
    gifts: readGifts(database),
    publishedBarrages,
    invitations,
    recentOperations,
  })
}
