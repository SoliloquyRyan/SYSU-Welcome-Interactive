import { createHash } from 'node:crypto'

import {
  V2AdminCommandResponseSchema,
  V2AdminCommandSchema,
} from '@sysu-welcome/contracts'

import type { SqliteDatabase } from '../db/open-database.js'
import { readProtocolRuntime } from '../db/v2-foundation.js'

const EXPIRY = '9999-12-31T23:59:59.999Z'

type Scene = 'ASSEMBLY' | 'PROGRAM_SUPPORT' | 'COOPERATIVE_LIGHT'
type Mode = 'REHEARSAL' | 'LIVE'
type Status = 'READY' | 'RUNNING' | 'PAUSED' | 'COMPLETED'

interface RuntimeRow {
  resetEpoch: number
  mode: Mode
  status: Status
  currentScene: Scene | null
  runRevision: number
  presentationType: 'NONE' | 'CAPSULE_INSERT' | 'FINALE_PREVIEW'
  presentationRevision: number
  publicAggregateRevision: number
  adminAggregateRevision: number
  publicSeq: number
  adminSeq: number
}

interface InteractionRow {
  interactionRevision: number
  barragePaused: number
  displayBatch: number
}

export interface V2AdminActor {
  sessionShortId: string
  requestId: string
  roles: Array<'STAGE_CONTROLLER' | 'REVIEWER' | 'DEMO_ADMIN' | 'ALL'>
}

export type V2RuntimeCommandErrorCode =
  | 'AUTH_REQUIRED'
  | 'ROLE_REQUIRED'
  | 'PROTOCOL_VERSION_MISMATCH'
  | 'STALE_RESET_EPOCH'
  | 'SCENE_ACTION_INVALID'
  | 'SCENE_TRANSITION_INVALID'
  | 'PRESENTATION_STATE_INVALID'
  | 'RESOURCE_NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'READINESS_CONFIRMATION_REQUIRED'
  | 'IDEMPOTENCY_CONFLICT'

export class V2RuntimeCommandError extends Error {
  constructor(
    readonly code: V2RuntimeCommandErrorCode,
    message: string,
    readonly statusCode: number,
    readonly details?: { anonymousFunnel: ReturnType<typeof readFunnel>; warnings: string[] },
  ) {
    super(message)
    this.name = 'V2RuntimeCommandError'
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function readRuntime(database: SqliteDatabase): RuntimeRow {
  const protocol = readProtocolRuntime(database)
  if (protocol?.activeProtocolVersion !== '2' || protocol.activationState !== 'V2_ACTIVE') {
    throw new V2RuntimeCommandError(
      'PROTOCOL_VERSION_MISMATCH',
      '当前数据库尚未启用协议 v2。',
      409,
    )
  }
  return database.prepare(
    `SELECT reset_epoch AS resetEpoch, mode, status,
            current_scene AS currentScene, run_revision AS runRevision,
            presentation_type AS presentationType,
            presentation_revision AS presentationRevision,
            public_aggregate_revision AS publicAggregateRevision,
            admin_aggregate_revision AS adminAggregateRevision,
            public_seq AS publicSeq, admin_seq AS adminSeq
     FROM v2_runtime_state WHERE id = 1`,
  ).get() as RuntimeRow
}

function tuple(runtime: RuntimeRow) {
  return {
    mode: runtime.mode,
    status: runtime.status,
    currentScene: runtime.currentScene,
    runRevision: runtime.runRevision,
  }
}

function presentation(database: SqliteDatabase, runtime: RuntimeRow) {
  if (runtime.presentationType === 'NONE') return { type: 'NONE' as const }
  if (runtime.presentationType === 'FINALE_PREVIEW') {
    return { type: 'FINALE_PREVIEW' as const, rehearsal: true as const }
  }
  const capsules = database.prepare(
    `SELECT capsule.capsule_id AS capsuleId, star.public_star_id AS publicStarId,
            star.color_temperature_kelvin AS colorTemperatureKelvin,
            star.display_color AS displayColor, capsule.text
     FROM v2_capsules capsule
     JOIN v2_public_stars star ON star.reset_epoch = capsule.reset_epoch
       AND star.identity_id = capsule.identity_id
     WHERE capsule.reset_epoch = ? AND capsule.moderation_status = 'DISPLAYED'
     ORDER BY capsule.submitted_at LIMIT 6`,
  ).all(runtime.resetEpoch)
  return { type: 'CAPSULE_INSERT' as const, capsules }
}

function readFunnel(database: SqliteDatabase, resetEpoch: number, now: Date) {
  const row = database.prepare(
    `SELECT
       count(*) AS activatedCount,
       sum(CASE WHEN color_locked_at IS NOT NULL THEN 1 ELSE 0 END) AS publicStarCount,
       sum(CASE WHEN onboarding_state = 'ADMITTED' THEN 1 ELSE 0 END) AS admittedCount,
       sum(CASE WHEN onboarding_state != 'ADMITTED' THEN 1 ELSE 0 END) AS onboardingPendingCount,
       sum(CASE WHEN capsule_decision = 'SUBMITTED' THEN 1 ELSE 0 END) AS capsuleSubmittedCount,
       sum(CASE WHEN capsule_decision = 'SKIPPED' THEN 1 ELSE 0 END) AS capsuleSkippedCount,
       sum(CASE WHEN started_at IS NOT NULL THEN 1 ELSE 0 END) AS starStartedCount,
       sum(CASE WHEN cooperative_light_at IS NOT NULL THEN 1 ELSE 0 END) AS cooperativeLightCount
     FROM v2_participant_states WHERE reset_epoch = ?`,
  ).get(resetEpoch) as Record<string, number | null>
  const onlineParticipantSessions = Number(database.prepare(
    `SELECT count(DISTINCT subject_id) FROM v2_sessions
     WHERE reset_epoch = ? AND session_type = 'PARTICIPANT'
       AND revoked_at IS NULL AND expires_at > ?`,
  ).pluck().get(resetEpoch, now.toISOString()))
  return {
    activatedCount: Number(row.activatedCount ?? 0),
    publicStarCount: Number(row.publicStarCount ?? 0),
    admittedCount: Number(row.admittedCount ?? 0),
    onboardingPendingCount: Number(row.onboardingPendingCount ?? 0),
    capsuleSubmittedCount: Number(row.capsuleSubmittedCount ?? 0),
    capsuleSkippedCount: Number(row.capsuleSkippedCount ?? 0),
    starStartedCount: Number(row.starStartedCount ?? 0),
    cooperativeLightCount: Number(row.cooperativeLightCount ?? 0),
    onlineParticipantSessions,
  }
}

function readinessWarnings(
  database: SqliteDatabase,
  runtime: RuntimeRow,
  command: string,
  funnel: ReturnType<typeof readFunnel>,
) {
  const warnings: string[] = []
  if ((command === 'ADVANCE' || command === 'COMPLETE') && funnel.onboardingPendingCount > 0) {
    warnings.push('ONBOARDING_PENDING')
  }
  if (command === 'ADVANCE' && runtime.currentScene === 'ASSEMBLY') {
    const pending = Number(database.prepare(
      `SELECT count(*) FROM v2_participant_states
       WHERE reset_epoch = ? AND onboarding_state = 'ADMITTED'
         AND (admitted_scene IS NULL OR admitted_scene = 'ASSEMBLY')
         AND started_at IS NULL`,
    ).pluck().get(runtime.resetEpoch))
    if (pending > 0) warnings.push('STAR_START_PENDING')
  }
  if (command === 'COMPLETE') {
    const pending = Number(database.prepare(
      `SELECT count(*) FROM v2_participant_states
       WHERE reset_epoch = ? AND onboarding_state = 'ADMITTED'
         AND cooperative_light_at IS NULL`,
    ).pluck().get(runtime.resetEpoch))
    if (pending > 0) warnings.push('COOPERATIVE_LIGHT_PENDING')
  }
  return warnings
}

function nextSeq(database: SqliteDatabase, resetEpoch: number, streamId: string) {
  database.prepare(
    `INSERT INTO v2_stream_cursors (reset_epoch, stream_id, stream_seq)
     VALUES (?, ?, 0) ON CONFLICT(reset_epoch, stream_id) DO NOTHING`,
  ).run(resetEpoch, streamId)
  database.prepare(
    `UPDATE v2_stream_cursors SET stream_seq = stream_seq + 1
     WHERE reset_epoch = ? AND stream_id = ?`,
  ).run(resetEpoch, streamId)
  return Number(database.prepare(
    `SELECT stream_seq FROM v2_stream_cursors WHERE reset_epoch = ? AND stream_id = ?`,
  ).pluck().get(resetEpoch, streamId))
}

function appendEvent(
  database: SqliteDatabase,
  runtime: RuntimeRow,
  name: 'runtime.changed' | 'presentation.changed',
  revision: number,
  payload: unknown,
  timestamp: string,
) {
  const seq = nextSeq(database, runtime.resetEpoch, 'public')
  database.prepare(
    `INSERT INTO v2_domain_events (
       reset_epoch, stream_id, stream_seq, event_id, event_name,
       revision, payload_json, committed_at
     ) VALUES (?, 'public', ?, ?, ?, ?, ?, ?)`,
  ).run(runtime.resetEpoch, seq, `${runtime.resetEpoch}:public:${seq}`, name, revision, JSON.stringify(payload), timestamp)
  database.prepare('UPDATE v2_runtime_state SET public_seq = ? WHERE id = 1').run(seq)
}

function appendProgramChanged(
  database: SqliteDatabase,
  runtime: RuntimeRow,
  program: { id: string; title: string; heat: number; giftCatalog: unknown[] },
  revision: number,
  timestamp: string,
) {
  const seq = nextSeq(database, runtime.resetEpoch, 'public')
  database.prepare(
    `INSERT INTO v2_domain_events (
       reset_epoch, stream_id, stream_seq, event_id, event_name,
       revision, payload_json, committed_at
     ) VALUES (?, 'public', ?, ?, 'program.changed', ?, ?, ?)`,
  ).run(runtime.resetEpoch, seq, `${runtime.resetEpoch}:public:${seq}`, revision,
    JSON.stringify({ interactionRevision: revision, currentProgram: program }), timestamp)
  database.prepare('UPDATE v2_runtime_state SET public_seq = ? WHERE id = 1').run(seq)
}

function interaction(database: SqliteDatabase, resetEpoch: number): InteractionRow {
  return database.prepare(
    `SELECT interaction_revision AS interactionRevision,
            barrage_paused AS barragePaused, display_batch AS displayBatch
     FROM v2_screen_interaction_state WHERE reset_epoch = ?`,
  ).get(resetEpoch) as InteractionRow
}

function appendInteractionEvent(
  database: SqliteDatabase,
  runtime: RuntimeRow,
  revision: number,
  name: 'barrage.removed' | 'barrage.cleared' | 'barrage.pause.changed',
  payload: unknown,
  timestamp: string,
) {
  const seq = nextSeq(database, runtime.resetEpoch, 'public')
  database.prepare(
    `INSERT INTO v2_domain_events (
       reset_epoch, stream_id, stream_seq, event_id, event_name,
       revision, payload_json, committed_at
     ) VALUES (?, 'public', ?, ?, ?, ?, ?, ?)`,
  ).run(runtime.resetEpoch, seq, `${runtime.resetEpoch}:public:${seq}`, name,
    revision, JSON.stringify(payload), timestamp)
  database.prepare('UPDATE v2_runtime_state SET public_seq = ? WHERE id = 1').run(seq)
}

function clearPresentation(database: SqliteDatabase, runtime: RuntimeRow, timestamp: string) {
  if (runtime.presentationType === 'NONE') return runtime.presentationRevision
  if (runtime.presentationType === 'CAPSULE_INSERT') {
    const participants = database.prepare(
      `SELECT participant.identity_id AS identityId,
              participant.participant_revision AS participantRevision
       FROM v2_capsules capsule JOIN v2_participant_states participant
         ON participant.reset_epoch = capsule.reset_epoch
        AND participant.identity_id = capsule.identity_id
       WHERE capsule.reset_epoch = ? AND capsule.moderation_status = 'DISPLAYED'`,
    ).all(runtime.resetEpoch) as Array<{ identityId: string; participantRevision: number }>
    database.prepare(
      `UPDATE v2_capsules SET moderation_status = 'SELECTED', updated_at = ?
       WHERE reset_epoch = ? AND moderation_status = 'DISPLAYED'`,
    ).run(timestamp, runtime.resetEpoch)
    for (const participant of participants) {
      database.prepare(
        `UPDATE v2_participant_states SET participant_revision = participant_revision + 1,
             updated_at = ? WHERE reset_epoch = ? AND identity_id = ?`,
      ).run(timestamp, runtime.resetEpoch, participant.identityId)
      const revision = participant.participantRevision + 1
      const seq = nextSeq(database, runtime.resetEpoch, `participant:${participant.identityId}`)
      database.prepare(
        `INSERT INTO v2_domain_events (
           reset_epoch, stream_id, stream_seq, event_id, event_name,
           revision, payload_json, committed_at
         ) VALUES (?, ?, ?, ?, 'participant.snapshot.changed', ?, ?, ?)`,
      ).run(runtime.resetEpoch, `participant:${participant.identityId}`, seq,
        `${runtime.resetEpoch}:participant:${participant.identityId}:${seq}`,
        revision, JSON.stringify({ projection: 'SELF', participantRevision: revision, requiresSnapshot: true }), timestamp)
    }
  }
  const nextRevision = runtime.presentationRevision + 1
  database.prepare(
    `UPDATE v2_runtime_state SET presentation_type = 'NONE',
       presentation_revision = ?, updated_at = ? WHERE id = 1`,
  ).run(nextRevision, timestamp)
  appendEvent(database, runtime, 'presentation.changed', nextRevision, {
    presentation: { type: 'NONE' },
    presentationRevision: nextRevision,
  }, timestamp)
  return nextRevision
}

function requireRole(actor: V2AdminActor, role: V2AdminActor['roles'][number], message: string) {
  if (!actor.roles.includes('ALL') && !actor.roles.includes(role)) {
    throw new V2RuntimeCommandError('ROLE_REQUIRED', message, 403)
  }
}

function appendParticipantInvalidation(
  database: SqliteDatabase,
  runtime: RuntimeRow,
  identityId: string,
  revision: number,
  timestamp: string,
) {
  const streamId = `participant:${identityId}`
  const seq = nextSeq(database, runtime.resetEpoch, streamId)
  database.prepare(
    `INSERT INTO v2_domain_events (
       reset_epoch, stream_id, stream_seq, event_id, event_name,
       revision, payload_json, committed_at
     ) VALUES (?, ?, ?, ?, 'participant.snapshot.changed', ?, ?, ?)`,
  ).run(runtime.resetEpoch, streamId, seq, `${runtime.resetEpoch}:${streamId}:${seq}`,
    revision, JSON.stringify({ projection: 'SELF', participantRevision: revision, requiresSnapshot: true }), timestamp)
}

function appendAdminInvalidation(
  database: SqliteDatabase,
  runtime: RuntimeRow,
  now: Date,
) {
  const revision = runtime.adminAggregateRevision + 1
  const timestamp = now.toISOString()
  database.prepare(
    `UPDATE v2_runtime_state SET admin_aggregate_revision = ?, updated_at = ? WHERE id = 1`,
  ).run(revision, timestamp)
  const seq = nextSeq(database, runtime.resetEpoch, 'admin')
  database.prepare(
    `INSERT INTO v2_domain_events (
       reset_epoch, stream_id, stream_seq, event_id, event_name,
       revision, payload_json, committed_at
     ) VALUES (?, 'admin', ?, ?, 'aggregate.changed', ?, ?, ?)`,
  ).run(runtime.resetEpoch, seq, `${runtime.resetEpoch}:admin:${seq}`, revision,
    JSON.stringify({
      projection: 'ADMIN_AGGREGATE', aggregateRevision: revision,
      aggregate: readFunnel(database, runtime.resetEpoch, now),
    }), timestamp)
  database.prepare('UPDATE v2_runtime_state SET admin_seq = ? WHERE id = 1').run(seq)
}

export function executeV2RuntimeCommand(
  database: SqliteDatabase,
  actor: V2AdminActor,
  input: unknown,
  now: Date = new Date(),
) {
  const request = V2AdminCommandSchema.parse(input)
  const reviewerCommands = new Set([
    'SELECT_CAPSULE', 'SHOW_CAPSULE_INSERT', 'REMOVE_CAPSULE',
    'SET_BARRAGE_PAUSED', 'REMOVE_BARRAGE', 'BLOCK_BARRAGE_SOURCE',
  ])
  if (reviewerCommands.has(request.command)) {
    requireRole(actor, 'REVIEWER', '需要内容审核权限。')
  } else if (request.command === 'CLEAR_PRESENTATION' || request.command === 'CLEAR_BARRAGES') {
    if (!actor.roles.includes('ALL') && !actor.roles.includes('REVIEWER') &&
        !actor.roles.includes('STAGE_CONTROLLER') && !actor.roles.includes('DEMO_ADMIN')) {
      throw new V2RuntimeCommandError('ROLE_REQUIRED', '需要内容审核或阶段控制权限。', 403)
    }
  } else if (request.command === 'RESET_DEMO') {
    requireRole(actor, 'DEMO_ADMIN', '需要 Demo 管理权限。')
  } else {
    requireRole(actor, 'STAGE_CONTROLLER', '需要阶段控制权限。')
  }
  if (request.command === 'RESET_DEMO') {
    throw new V2RuntimeCommandError('SCENE_TRANSITION_INVALID', '该命令不属于 V2-04 运行时范围。', 409)
  }
  database.exec('BEGIN IMMEDIATE')
  try {
    const runtime = readRuntime(database)
    if (runtime.resetEpoch !== request.resetEpoch) {
      throw new V2RuntimeCommandError('STALE_RESET_EPOCH', '运行代际已变化。', 409)
    }
    const keyDigest = sha256(request.idempotencyKey)
    const requestDigest = sha256(canonical(request))
    const scope = 'admin:runtime'
    const stored = database.prepare(
      `SELECT request_digest AS requestDigest, response_body_json AS body
       FROM v2_idempotency_records
       WHERE reset_epoch = ? AND scope = ? AND key_digest = ?`,
    ).get(runtime.resetEpoch, scope, keyDigest) as { requestDigest: string; body: string } | undefined
    if (stored) {
      if (stored.requestDigest !== requestDigest) {
        throw new V2RuntimeCommandError('IDEMPOTENCY_CONFLICT', '幂等键已用于其他请求。', 409)
      }
      const replay = { ...JSON.parse(stored.body), replayed: true }
      database.exec('COMMIT')
      return V2AdminCommandResponseSchema.parse(replay)
    }
    if ('expectedRunRevision' in request && request.expectedRunRevision !== runtime.runRevision) {
      throw new V2RuntimeCommandError('REVISION_CONFLICT', '运行状态已变化。', 409)
    }
    if ('expectedPresentationRevision' in request && request.expectedPresentationRevision !== runtime.presentationRevision) {
      throw new V2RuntimeCommandError('REVISION_CONFLICT', '投影状态已变化。', 409)
    }
    const timestamp = now.toISOString()
    const currentInteraction = interaction(database, runtime.resetEpoch)
    if (
      'expectedInteractionRevision' in request &&
      request.expectedInteractionRevision !== currentInteraction.interactionRevision
    ) {
      throw new V2RuntimeCommandError('REVISION_CONFLICT', '公共互动状态已变化。', 409)
    }
    const beforeRunRevision = runtime.runRevision
    const beforePresentationRevision = runtime.presentationRevision
    const funnel = readFunnel(database, runtime.resetEpoch, now)
    const warnings = readinessWarnings(database, runtime, request.command, funnel)
    if (
      warnings.length > 0 &&
      (request.command === 'ADVANCE' || request.command === 'COMPLETE') &&
      !request.overrideReadinessWarnings
    ) {
      throw new V2RuntimeCommandError(
        'READINESS_CONFIRMATION_REQUIRED',
        '仍有参与者未完成当前准备项，请明确确认后继续。',
        409,
        { anonymousFunnel: funnel, warnings },
      )
    }

    let nextMode = runtime.mode
    let nextStatus = runtime.status
    let nextScene = runtime.currentScene
    let nextRunRevision = runtime.runRevision
    let nextPresentationRevision = runtime.presentationRevision
    let completedAt: string | null = null
    let updateRuntimeTuple = true
    if (request.command === 'SET_BARRAGE_PAUSED') {
      updateRuntimeTuple = false
      if (runtime.status === 'COMPLETED') {
        throw new V2RuntimeCommandError('PRESENTATION_STATE_INVALID', '活动结束后无需变更弹幕接收状态。', 409)
      }
      if ((currentInteraction.barragePaused === 1) !== request.paused) {
        const interactionRevision = currentInteraction.interactionRevision + 1
        database.prepare(
          `UPDATE v2_screen_interaction_state
           SET interaction_revision = ?, barrage_paused = ?, updated_at = ?
           WHERE reset_epoch = ?`,
        ).run(interactionRevision, request.paused ? 1 : 0, timestamp, runtime.resetEpoch)
      appendInteractionEvent(database, runtime, interactionRevision, 'barrage.pause.changed', {
          interactionRevision, paused: request.paused,
        }, timestamp)
      }
      database.prepare(
        `INSERT INTO v2_screen_moderation_audit (
           reset_epoch, action, target_id, reason, session_short_id, request_id, created_at
         ) VALUES (?, 'SET_BARRAGE_PAUSED', NULL, ?, ?, ?, ?)`,
      ).run(runtime.resetEpoch, request.paused ? '暂停新弹幕发布' : '恢复新弹幕发布',
        actor.sessionShortId, actor.requestId, timestamp)
    } else if (request.command === 'REMOVE_BARRAGE') {
      updateRuntimeTuple = false
      const publication = database.prepare(
        `SELECT status FROM v2_barrage_publications
         WHERE reset_epoch = ? AND barrage_id = ?`,
      ).get(runtime.resetEpoch, request.barrageId) as { status: string } | undefined
      if (!publication || publication.status !== 'PUBLISHED') {
        throw new V2RuntimeCommandError('RESOURCE_NOT_FOUND', '弹幕不存在或已经下屏。', 404)
      }
      const interactionRevision = currentInteraction.interactionRevision + 1
      database.prepare(
        `UPDATE v2_barrage_publications
         SET status = 'REMOVED', removed_at = ?, removed_reason = ?,
             removed_by_session_short_id = ?
         WHERE reset_epoch = ? AND barrage_id = ?`,
      ).run(timestamp, request.reason, actor.sessionShortId, runtime.resetEpoch, request.barrageId)
      database.prepare(
        `UPDATE v2_screen_interaction_state
         SET interaction_revision = ?, updated_at = ? WHERE reset_epoch = ?`,
      ).run(interactionRevision, timestamp, runtime.resetEpoch)
      appendInteractionEvent(database, runtime, interactionRevision, 'barrage.removed', {
        interactionRevision, barrageIds: [request.barrageId],
      }, timestamp)
      database.prepare(
        `INSERT INTO v2_screen_moderation_audit (
           reset_epoch, action, target_id, reason, session_short_id, request_id, created_at
         ) VALUES (?, 'REMOVE_BARRAGE', ?, ?, ?, ?, ?)`,
      ).run(runtime.resetEpoch, request.barrageId, request.reason,
        actor.sessionShortId, actor.requestId, timestamp)
    } else if (request.command === 'BLOCK_BARRAGE_SOURCE') {
      updateRuntimeTuple = false
      const source = database.prepare(
        `SELECT source_id AS sourceId FROM v2_public_sources
         WHERE reset_epoch = ? AND source_id = ?`,
      ).get(runtime.resetEpoch, request.sourceId)
      if (!source) throw new V2RuntimeCommandError('RESOURCE_NOT_FOUND', '匿名来源不存在。', 404)
      database.prepare(
        `UPDATE v2_public_sources SET blocked_at = COALESCE(blocked_at, ?),
            blocked_by_session_short_id = COALESCE(blocked_by_session_short_id, ?)
         WHERE reset_epoch = ? AND source_id = ?`,
      ).run(timestamp, actor.sessionShortId, runtime.resetEpoch, request.sourceId)
      const visible = database.prepare(
        `SELECT barrage_id AS barrageId FROM v2_barrage_publications
         WHERE reset_epoch = ? AND source_id = ? AND status = 'PUBLISHED'
         ORDER BY display_seq DESC LIMIT 8`,
      ).all(runtime.resetEpoch, request.sourceId) as Array<{ barrageId: string }>
      database.prepare(
        `UPDATE v2_barrage_publications
         SET status = 'REMOVED', removed_at = ?, removed_reason = ?,
             removed_by_session_short_id = ?
         WHERE reset_epoch = ? AND source_id = ? AND status = 'PUBLISHED'`,
      ).run(timestamp, request.reason, actor.sessionShortId,
        runtime.resetEpoch, request.sourceId)
      if (visible.length > 0) {
        const ids = visible.map(({ barrageId }) => barrageId)
        const interactionRevision = currentInteraction.interactionRevision + 1
        database.prepare(
          `UPDATE v2_screen_interaction_state
           SET interaction_revision = ?, updated_at = ? WHERE reset_epoch = ?`,
        ).run(interactionRevision, timestamp, runtime.resetEpoch)
        appendInteractionEvent(database, runtime, interactionRevision, 'barrage.removed', {
          interactionRevision, barrageIds: ids,
        }, timestamp)
      }
      database.prepare(
        `INSERT INTO v2_screen_moderation_audit (
           reset_epoch, action, target_id, reason, session_short_id, request_id, created_at
         ) VALUES (?, 'BLOCK_BARRAGE_SOURCE', ?, ?, ?, ?, ?)`,
      ).run(runtime.resetEpoch, request.sourceId, request.reason,
        actor.sessionShortId, actor.requestId, timestamp)
    } else if (request.command === 'CLEAR_BARRAGES') {
      updateRuntimeTuple = false
      database.prepare(
        `UPDATE v2_barrage_publications
         SET status = 'REMOVED', removed_at = ?, removed_reason = ?,
             removed_by_session_short_id = ?
         WHERE reset_epoch = ? AND status = 'PUBLISHED'`,
      ).run(timestamp, request.reason, actor.sessionShortId, runtime.resetEpoch)
      const interactionRevision = currentInteraction.interactionRevision + 1
      const displayBatch = currentInteraction.displayBatch + 1
      database.prepare(
        `UPDATE v2_screen_interaction_state
         SET interaction_revision = ?, display_batch = ?, updated_at = ?
         WHERE reset_epoch = ?`,
      ).run(interactionRevision, displayBatch, timestamp, runtime.resetEpoch)
      appendInteractionEvent(database, runtime, interactionRevision, 'barrage.cleared', {
        interactionRevision, displayBatch,
      }, timestamp)
      database.prepare(
        `INSERT INTO v2_screen_moderation_audit (
           reset_epoch, action, target_id, reason, session_short_id, request_id, created_at
         ) VALUES (?, 'CLEAR_BARRAGES', NULL, ?, ?, ?, ?)`,
      ).run(runtime.resetEpoch, request.reason, actor.sessionShortId,
        actor.requestId, timestamp)
    } else if (request.command === 'SELECT_CAPSULE') {
      updateRuntimeTuple = false
      if (runtime.status === 'COMPLETED') throw new V2RuntimeCommandError('PRESENTATION_STATE_INVALID', '活动结束后不能再选择新胶囊。', 409)
      const candidate = database.prepare(
        `SELECT capsule.identity_id AS identityId, capsule.moderation_status AS moderationStatus,
                participant.participant_revision AS participantRevision
         FROM v2_capsules capsule JOIN v2_participant_states participant
           ON participant.reset_epoch = capsule.reset_epoch AND participant.identity_id = capsule.identity_id
         WHERE capsule.reset_epoch = ? AND capsule.capsule_id = ?`,
      ).get(runtime.resetEpoch, request.capsuleId) as { identityId: string; moderationStatus: string; participantRevision: number } | undefined
      if (!candidate) throw new V2RuntimeCommandError('PRESENTATION_STATE_INVALID', '候选胶囊不存在。', 404)
      if (candidate.participantRevision !== request.expectedParticipantRevision) throw new V2RuntimeCommandError('REVISION_CONFLICT', '候选内容已变化。', 409)
      if (candidate.moderationStatus !== 'SUBMITTED') throw new V2RuntimeCommandError('PRESENTATION_STATE_INVALID', '只有待审核胶囊可以选中。', 409)
      const revision = candidate.participantRevision + 1
      database.prepare(`UPDATE v2_capsules SET moderation_status = 'SELECTED', updated_at = ? WHERE reset_epoch = ? AND capsule_id = ?`).run(timestamp, runtime.resetEpoch, request.capsuleId)
      database.prepare(`UPDATE v2_participant_states SET participant_revision = ?, updated_at = ? WHERE reset_epoch = ? AND identity_id = ?`).run(revision, timestamp, runtime.resetEpoch, candidate.identityId)
      appendParticipantInvalidation(database, runtime, candidate.identityId, revision, timestamp)
      appendAdminInvalidation(database, runtime, now)
    } else if (request.command === 'SHOW_CAPSULE_INSERT') {
      updateRuntimeTuple = false
      if (runtime.status !== 'RUNNING' || runtime.presentationType !== 'NONE') throw new V2RuntimeCommandError('PRESENTATION_STATE_INVALID', '仅运行中且无活动投影时可插播胶囊。', 409)
      const placeholders = request.capsuleIds.map(() => '?').join(',')
      const candidates = database.prepare(
        `SELECT capsule.capsule_id AS capsuleId, capsule.identity_id AS identityId,
                capsule.moderation_status AS moderationStatus,
                participant.participant_revision AS participantRevision
         FROM v2_capsules capsule JOIN v2_participant_states participant
           ON participant.reset_epoch = capsule.reset_epoch AND participant.identity_id = capsule.identity_id
         WHERE capsule.reset_epoch = ? AND capsule.capsule_id IN (${placeholders})`,
      ).all(runtime.resetEpoch, ...request.capsuleIds) as Array<{ capsuleId: string; identityId: string; moderationStatus: string; participantRevision: number }>
      if (candidates.length !== request.capsuleIds.length || candidates.some(({ moderationStatus }) => moderationStatus !== 'SELECTED')) {
        throw new V2RuntimeCommandError('PRESENTATION_STATE_INVALID', '插播集合必须全部是已选中的胶囊。', 409)
      }
      for (const candidate of candidates) {
        const revision = candidate.participantRevision + 1
        database.prepare(`UPDATE v2_capsules SET moderation_status = 'DISPLAYED', updated_at = ? WHERE reset_epoch = ? AND capsule_id = ?`).run(timestamp, runtime.resetEpoch, candidate.capsuleId)
        database.prepare(`UPDATE v2_participant_states SET participant_revision = ?, updated_at = ? WHERE reset_epoch = ? AND identity_id = ?`).run(revision, timestamp, runtime.resetEpoch, candidate.identityId)
        appendParticipantInvalidation(database, runtime, candidate.identityId, revision, timestamp)
      }
      nextPresentationRevision += 1
      database.prepare(`UPDATE v2_runtime_state SET presentation_type = 'CAPSULE_INSERT', presentation_revision = ?, updated_at = ? WHERE id = 1`).run(nextPresentationRevision, timestamp)
      const activeRuntime = { ...runtime, presentationType: 'CAPSULE_INSERT' as const, presentationRevision: nextPresentationRevision }
      appendEvent(database, runtime, 'presentation.changed', nextPresentationRevision, {
        presentation: presentation(database, activeRuntime), presentationRevision: nextPresentationRevision,
      }, timestamp)
      appendAdminInvalidation(database, runtime, now)
    } else if (request.command === 'REMOVE_CAPSULE') {
      updateRuntimeTuple = false
      const candidate = database.prepare(
        `SELECT capsule.identity_id AS identityId, capsule.moderation_status AS moderationStatus,
                participant.participant_revision AS participantRevision
         FROM v2_capsules capsule JOIN v2_participant_states participant
           ON participant.reset_epoch = capsule.reset_epoch AND participant.identity_id = capsule.identity_id
         WHERE capsule.reset_epoch = ? AND capsule.capsule_id = ?`,
      ).get(runtime.resetEpoch, request.capsuleId) as { identityId: string; moderationStatus: string; participantRevision: number } | undefined
      if (!candidate || candidate.moderationStatus === 'REMOVED') throw new V2RuntimeCommandError('PRESENTATION_STATE_INVALID', '该胶囊已撤下或不存在。', 409)
      if (candidate.participantRevision !== request.expectedParticipantRevision || request.expectedPresentationRevision !== runtime.presentationRevision) throw new V2RuntimeCommandError('REVISION_CONFLICT', '候选或投影状态已变化。', 409)
      const revision = candidate.participantRevision + 1
      database.prepare(`UPDATE v2_capsules SET moderation_status = 'REMOVED', updated_at = ? WHERE reset_epoch = ? AND capsule_id = ?`).run(timestamp, runtime.resetEpoch, request.capsuleId)
      database.prepare(`UPDATE v2_participant_states SET participant_revision = ?, updated_at = ? WHERE reset_epoch = ? AND identity_id = ?`).run(revision, timestamp, runtime.resetEpoch, candidate.identityId)
      appendParticipantInvalidation(database, runtime, candidate.identityId, revision, timestamp)
      if (candidate.moderationStatus === 'DISPLAYED') {
        if (runtime.status === 'COMPLETED') {
          database.prepare(
            `DELETE FROM v2_final_recap_capsules WHERE reset_epoch = ? AND capsule_id = ?`,
          ).run(runtime.resetEpoch, request.capsuleId)
        }
        const remaining = Number(database.prepare(`SELECT count(*) FROM v2_capsules WHERE reset_epoch = ? AND moderation_status = 'DISPLAYED'`).pluck().get(runtime.resetEpoch))
        nextPresentationRevision += 1
        const nextType = runtime.status === 'COMPLETED' || remaining === 0 ? 'NONE' : 'CAPSULE_INSERT'
        database.prepare(`UPDATE v2_runtime_state SET presentation_type = ?, presentation_revision = ?, updated_at = ? WHERE id = 1`).run(nextType, nextPresentationRevision, timestamp)
        const activeRuntime = { ...runtime, presentationType: nextType as RuntimeRow['presentationType'], presentationRevision: nextPresentationRevision }
        appendEvent(database, runtime, 'presentation.changed', nextPresentationRevision, {
          presentation: presentation(database, activeRuntime), presentationRevision: nextPresentationRevision,
        }, timestamp)
      }
      appendAdminInvalidation(database, runtime, now)
      database.prepare(
        `INSERT INTO admin_operation_records (
           session_short_id, roles_json, action, result, request_id, created_at
         ) VALUES (?, ?, 'V2_REMOVE_CAPSULE', ?, ?, ?)`,
      ).run(actor.sessionShortId, JSON.stringify(actor.roles),
        JSON.stringify({ capsuleId: request.capsuleId, reason: request.reason }), actor.requestId, timestamp)
    } else if (request.command === 'SET_MODE') {
      if (runtime.status !== 'READY' || runtime.currentScene !== null) throw new V2RuntimeCommandError('SCENE_TRANSITION_INVALID', '只能在 READY 切换模式。', 409)
      nextMode = request.targetMode
      if (nextMode !== runtime.mode) nextRunRevision += 1
    } else if (request.command === 'START') {
      if (runtime.status !== 'READY' || runtime.currentScene !== null) throw new V2RuntimeCommandError('SCENE_TRANSITION_INVALID', '只能从 READY 启动。', 409)
      nextStatus = 'RUNNING'; nextScene = 'ASSEMBLY'; nextRunRevision += 1
    } else if (request.command === 'SET_PROGRAM') {
      updateRuntimeTuple = false
      if (runtime.status !== 'RUNNING' || runtime.currentScene !== 'PROGRAM_SUPPORT') {
        throw new V2RuntimeCommandError('SCENE_ACTION_INVALID', '只有节目支持场景可以切换当前节目。', 409)
      }
      const program = database.prepare(
        `SELECT id, title, heat FROM program_catalog WHERE id = ? AND enabled = 1`,
      ).get(request.programId) as { id: string; title: string; heat: number } | undefined
      if (!program) {
        throw new V2RuntimeCommandError('RESOURCE_NOT_FOUND', '节目不存在或尚未启用。', 404)
      }
      const previousProgramId = database.prepare(
        'SELECT current_program_id FROM program_runtime_state WHERE id = 1',
      ).pluck().get() as string | null
      if (previousProgramId !== program.id) {
        database.prepare(
          `UPDATE program_runtime_state SET current_program_id = ?, updated_at = ? WHERE id = 1`,
        ).run(program.id, timestamp)
        const interactionRevision = currentInteraction.interactionRevision + 1
        database.prepare(
          `UPDATE v2_screen_interaction_state SET interaction_revision = ?, updated_at = ?
           WHERE reset_epoch = ?`,
        ).run(interactionRevision, timestamp, runtime.resetEpoch)
        const giftCatalog = database.prepare(
          `SELECT id, name, power_cost AS powerCost
           FROM gift_catalog WHERE enabled = 1 ORDER BY sort_order`,
        ).all()
        appendProgramChanged(database, runtime, { ...program, giftCatalog }, interactionRevision, timestamp)
        appendAdminInvalidation(database, runtime, now)
      }
    } else if (request.command === 'SET_SCENE') {
      if (runtime.mode !== 'REHEARSAL' || runtime.status !== 'RUNNING') throw new V2RuntimeCommandError('SCENE_TRANSITION_INVALID', '排练运行时才可切换场景。', 409)
      nextPresentationRevision = clearPresentation(database, runtime, timestamp)
      nextScene = request.targetScene
      if (nextScene !== runtime.currentScene) nextRunRevision += 1
    } else if (request.command === 'ADVANCE') {
      if (runtime.mode !== 'LIVE' || runtime.status !== 'RUNNING' || runtime.currentScene === 'COOPERATIVE_LIGHT') throw new V2RuntimeCommandError('SCENE_TRANSITION_INVALID', 'LIVE 只能顺序推进三个场景。', 409)
      nextPresentationRevision = clearPresentation(database, runtime, timestamp)
      nextScene = runtime.currentScene === 'ASSEMBLY' ? 'PROGRAM_SUPPORT' : 'COOPERATIVE_LIGHT'
      nextRunRevision += 1
    } else if (request.command === 'PAUSE') {
      if (runtime.status !== 'RUNNING') throw new V2RuntimeCommandError('SCENE_TRANSITION_INVALID', '仅 RUNNING 可暂停。', 409)
      nextPresentationRevision = clearPresentation(database, runtime, timestamp)
      nextStatus = 'PAUSED'; nextRunRevision += 1
    } else if (request.command === 'RESUME') {
      if (runtime.status !== 'PAUSED') throw new V2RuntimeCommandError('SCENE_TRANSITION_INVALID', '仅 PAUSED 可恢复。', 409)
      nextStatus = 'RUNNING'; nextRunRevision += 1
    } else if (request.command === 'PREVIEW_FINALE') {
      updateRuntimeTuple = false
      if (runtime.mode !== 'REHEARSAL' || runtime.status !== 'RUNNING' || runtime.currentScene !== 'COOPERATIVE_LIGHT' || runtime.presentationType !== 'NONE') {
        throw new V2RuntimeCommandError('PRESENTATION_STATE_INVALID', '终章预演只允许在排练协同点亮且无活动投影时开始。', 409)
      }
      nextPresentationRevision += 1
      database.prepare(
        `UPDATE v2_runtime_state SET presentation_type = 'FINALE_PREVIEW',
           presentation_revision = ?, updated_at = ? WHERE id = 1`,
      ).run(nextPresentationRevision, timestamp)
      appendEvent(database, runtime, 'presentation.changed', nextPresentationRevision, {
        presentation: { type: 'FINALE_PREVIEW', rehearsal: true },
        presentationRevision: nextPresentationRevision,
      }, timestamp)
    } else if (request.command === 'CLEAR_PRESENTATION') {
      updateRuntimeTuple = false
      if (runtime.presentationType === 'NONE') throw new V2RuntimeCommandError('PRESENTATION_STATE_INVALID', '当前没有活动投影。', 409)
      nextPresentationRevision = clearPresentation(database, runtime, timestamp)
    } else {
      if (runtime.mode !== 'LIVE' || runtime.status !== 'RUNNING' || runtime.currentScene !== 'COOPERATIVE_LIGHT') throw new V2RuntimeCommandError('SCENE_TRANSITION_INVALID', '只能从 LIVE 协同点亮场景完成活动。', 409)
      const displayed = database.prepare(
        `SELECT capsule.capsule_id AS capsuleId, star.public_star_id AS publicStarId,
                star.color_temperature_kelvin AS colorTemperatureKelvin,
                star.display_color AS displayColor, capsule.text
         FROM v2_capsules capsule JOIN v2_public_stars star
           ON star.reset_epoch = capsule.reset_epoch AND star.identity_id = capsule.identity_id
         WHERE capsule.reset_epoch = ? AND capsule.moderation_status = 'DISPLAYED'
         ORDER BY capsule.submitted_at LIMIT 6`,
      ).all(runtime.resetEpoch) as Array<Record<string, unknown>>
      displayed.forEach((capsule, index) => {
        database.prepare(
          `INSERT INTO v2_final_recap_capsules (
             reset_epoch, position, capsule_id, public_star_id,
             color_temperature_kelvin, display_color, text, captured_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(runtime.resetEpoch, index + 1, capsule.capsuleId, capsule.publicStarId,
          capsule.colorTemperatureKelvin, capsule.displayColor, capsule.text, timestamp)
      })
      if (runtime.presentationType !== 'NONE') {
        nextPresentationRevision = runtime.presentationRevision + 1
        appendEvent(database, runtime, 'presentation.changed', nextPresentationRevision, {
          presentation: { type: 'NONE' }, presentationRevision: nextPresentationRevision,
        }, timestamp)
      }
      nextStatus = 'COMPLETED'; nextScene = 'COOPERATIVE_LIGHT'; nextRunRevision += 1
      completedAt = timestamp
    }

    if (updateRuntimeTuple) {
      database.prepare(
        `UPDATE v2_runtime_state SET mode = ?, status = ?, current_scene = ?,
           run_revision = ?, presentation_type = 'NONE', presentation_revision = ?,
           completed_at = ?, updated_at = ? WHERE id = 1`,
      ).run(nextMode, nextStatus, nextScene, nextRunRevision,
        nextPresentationRevision, completedAt, timestamp)
      if (nextRunRevision !== runtime.runRevision) {
        appendEvent(database, runtime, 'runtime.changed', nextRunRevision, {
          runtime: { mode: nextMode, status: nextStatus, currentScene: nextScene, runRevision: nextRunRevision },
        }, timestamp)
      }
    }

    const current = readRuntime(database)
    const currentFunnel = readFunnel(database, current.resetEpoch, now)
    const currentWarnings = readinessWarnings(database, current, request.command, currentFunnel)
    const response = V2AdminCommandResponseSchema.parse({
      status: 'ok', protocolVersion: '2', resetEpoch: current.resetEpoch,
      command: request.command, replayed: false, runtime: tuple(current),
      presentation: presentation(database, current),
      presentationRevision: current.presentationRevision,
      interactionRevision: interaction(database, current.resetEpoch).interactionRevision,
      aggregateRevision: current.adminAggregateRevision,
      funnel: currentFunnel, readinessWarnings: currentWarnings,
    })
    database.prepare(
      `INSERT INTO v2_idempotency_records (
         reset_epoch, scope, key_digest, request_digest, response_status,
         response_body_json, created_at, expires_at
       ) VALUES (?, ?, ?, ?, 200, ?, ?, ?)`,
    ).run(current.resetEpoch, scope, keyDigest, requestDigest, JSON.stringify(response), timestamp, EXPIRY)
    const receipt = database.prepare(
      `INSERT INTO v2_control_receipts (
         reset_epoch, idempotency_key_digest, command, result,
         before_run_revision, after_run_revision,
         before_presentation_revision, after_presentation_revision,
         session_short_id, roles_json, request_id, created_at
       ) VALUES (?, ?, ?, 'APPLIED', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(current.resetEpoch, keyDigest, request.command, beforeRunRevision,
      current.runRevision, beforePresentationRevision, current.presentationRevision,
      actor.sessionShortId, JSON.stringify(actor.roles), actor.requestId, timestamp)
    database.prepare(
      `INSERT INTO v2_control_audit_context (
         receipt_id, readiness_warnings_json, funnel_json,
         override_readiness_warnings, live_completion
       ) VALUES (?, ?, ?, ?, ?)`,
    ).run(Number(receipt.lastInsertRowid), JSON.stringify(warnings), JSON.stringify(funnel),
      'overrideReadinessWarnings' in request && request.overrideReadinessWarnings ? 1 : 0,
      request.command === 'COMPLETE' ? 1 : 0)
    database.exec('COMMIT')
    return response
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw error
  }
}
