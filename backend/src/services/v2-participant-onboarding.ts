import { readV2Stage, readV2AwardSummaries, readV2Awards } from './v2-ceremony.js'
import { readCurrentV2Program, readV2ProgramSchedule } from './v2-program-catalog.js'
import { readV2ClosingRecap } from './v2-closing-recap.js'
import { currentInteractionCode, readLiveInteractionRow, readV2LiveInteraction } from './v2-live-interactions.js'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

import {
  V2ActivateParticipantRequestSchema,
  V2ParticipantSnapshotSchema,
  V2ParticipantCommandResponseSchema,
  V2ParticipantCommandSchema,
  type V2ParticipantSnapshot,
  type V2RuntimeTuple,
} from '@sysu-welcome/contracts'

import type { CredentialContext } from '../db/seed.js'
import {
  invitationTokenDigest,
  verifyStudentNumberCredential,
} from '../db/seed.js'
import { databaseTableExists, type SqliteDatabase } from '../db/open-database.js'
import {
  readProtocolRuntime,
} from '../db/v2-foundation.js'

const PARTICIPANT_SESSION_SECONDS = 12 * 60 * 60
const IDEMPOTENCY_EXPIRY = '9999-12-31T23:59:59.999Z'

const SPECTRAL_STOPS = [
  [2400, [255, 118, 86]],
  [3600, [255, 171, 98]],
  [5000, [255, 217, 139]],
  [6500, [255, 244, 220]],
  [9000, [220, 234, 255]],
  [12000, [169, 204, 255]],
] as const

export type V2ParticipantCommandErrorCode =
  | 'AUTH_REQUIRED'
  | 'PROTOCOL_VERSION_MISMATCH'
  | 'STALE_RESET_EPOCH'
  | 'RUNTIME_PAUSED'
  | 'RUNTIME_COMPLETED'
  | 'STAR_CAPACITY_REACHED'
  | 'ONBOARDING_STATE_INVALID'
  | 'SCENE_ACTION_INVALID'
  | 'REVISION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INSUFFICIENT_BALANCE'
  | 'CONTENT_REJECTED'
  | 'SOURCE_BLOCKED'
  | 'RATE_LIMITED'
  | 'RESOURCE_NOT_FOUND'

export class V2ParticipantCommandError extends Error {
  constructor(
    readonly code: V2ParticipantCommandErrorCode,
    message: string,
    readonly statusCode: number,
    readonly resetEpoch: number | null = null,
  ) {
    super(message)
    this.name = 'V2ParticipantCommandError'
  }
}

export interface V2CreatedParticipantSession {
  id: string
  secret: string
  identityId: string
  resetEpoch: number
  readOnly: boolean
  shortId: string
  createdAt: string
  expiresAt: string
}

export interface V2ActivationResult {
  snapshot: V2ParticipantSnapshot
  session: V2CreatedParticipantSession
  activated: boolean
}

interface RuntimeRow {
  resetEpoch: number
  mode: 'REHEARSAL' | 'LIVE'
  status: 'READY' | 'RUNNING' | 'PAUSED' | 'COMPLETED'
  currentScene: 'ASSEMBLY' | 'PROGRAM_SUPPORT' | 'COOPERATIVE_LIGHT' | null
  runRevision: number
  presentationType: 'NONE' | 'CAPSULE_INSERT' | 'RAFFLE' | 'FINALE_PREVIEW'
  presentationRevision: number
  publicAggregateRevision: number
  adminAggregateRevision: number
  rewardRuleVersion: string
  publicSeq: number
  adminSeq: number
}

interface IdentityRow {
  identityId: string
  enabled: number
  invitationStatus: 'ACTIVE' | 'REVOKED'
}

interface ParticipantRow {
  identityId: string
  participantRevision: number
  onboardingState: 'NEEDS_COLOR' | 'NEEDS_CAPSULE_DECISION' | 'ADMITTED'
  displayName: string
  activatedAt: string
  colorTemperatureKelvin: number | null
  displayColor: string | null
  colorLockedAt: string | null
  publicStarId: string
  formationSlot: string
  capsuleDecision: 'NONE' | 'SKIPPED' | 'SUBMITTED'
  capsuleSkippedAt: string | null
  admittedAt: string | null
  admittedScene: RuntimeRow['currentScene']
  admittedRunRevision: number | null
  startedAt: string | null
  firstGiftAt: string | null
  firstBarrageAt: string | null
  cooperativeLightAt: string | null
  powerBalance: number
  starlight: number
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

function requestDigest(value: unknown): string {
  return sha256(JSON.stringify(stableValue(value)))
}

function readRuntime(database: SqliteDatabase): RuntimeRow {
  const protocol = readProtocolRuntime(database)
  if (
    protocol?.activeProtocolVersion !== '2' ||
    protocol.activationState !== 'V2_ACTIVE'
  ) {
    throw new V2ParticipantCommandError(
      'PROTOCOL_VERSION_MISMATCH',
      '参与者 v2 命令只可在协议 v2 运行时执行。',
      409,
    )
  }
  const runtime = database
    .prepare(
      `SELECT reset_epoch AS resetEpoch, mode, status,
              current_scene AS currentScene, run_revision AS runRevision,
              CASE WHEN presentation_type = 'CAPSULE_INSERT' THEN 'RAFFLE'
                   ELSE presentation_type END AS presentationType,
              presentation_revision AS presentationRevision,
              public_aggregate_revision AS publicAggregateRevision,
              admin_aggregate_revision AS adminAggregateRevision,
              reward_rule_version AS rewardRuleVersion,
              public_seq AS publicSeq, admin_seq AS adminSeq
       FROM v2_runtime_state WHERE id = 1`,
    )
    .get() as RuntimeRow | undefined
  if (!runtime) {
    throw new V2ParticipantCommandError(
      'PROTOCOL_VERSION_MISMATCH',
      '协议 v2 运行状态缺失。',
      503,
    )
  }
  return runtime
}

function assertExpectedEpoch(runtime: RuntimeRow, resetEpoch: number): void {
  if (resetEpoch !== runtime.resetEpoch) {
    throw new V2ParticipantCommandError(
      'STALE_RESET_EPOCH',
      '活动已重置，请重新核验并获取最新状态。',
      409,
      runtime.resetEpoch,
    )
  }
}

function assertParticipantWriteOpen(runtime: RuntimeRow): void {
  if (runtime.status === 'PAUSED') {
    throw new V2ParticipantCommandError(
      'RUNTIME_PAUSED',
      '现场已暂停，当前输入会保留，但不会自动提交。',
      409,
      runtime.resetEpoch,
    )
  }
  if (runtime.status === 'COMPLETED') {
    throw new V2ParticipantCommandError(
      'RUNTIME_COMPLETED',
      '本场活动已结束，参与者资料已冻结。',
      409,
      runtime.resetEpoch,
    )
  }
}

function readParticipant(database: SqliteDatabase, identityId: string): ParticipantRow {
  const participant = database
    .prepare(
       `SELECT participant.identity_id AS identityId,
              participant.participant_revision AS participantRevision,
              participant.onboarding_state AS onboardingState,
              identity.display_name AS displayName,
              participant.activated_at AS activatedAt,
              participant.color_temperature_kelvin AS colorTemperatureKelvin,
              participant.display_color AS displayColor,
              participant.color_locked_at AS colorLockedAt,
              slot.public_star_id AS publicStarId,
              slot.formation_slot AS formationSlot,
              participant.capsule_decision AS capsuleDecision,
              participant.capsule_skipped_at AS capsuleSkippedAt,
              participant.admitted_at AS admittedAt,
              participant.admitted_scene AS admittedScene,
              participant.admitted_run_revision AS admittedRunRevision,
              participant.started_at AS startedAt,
              participant.first_gift_at AS firstGiftAt,
              participant.first_barrage_at AS firstBarrageAt,
              participant.cooperative_light_at AS cooperativeLightAt,
              participant.power_balance AS powerBalance,
              participant.starlight
       FROM v2_participant_states participant
       JOIN synthetic_identities identity ON identity.id = participant.identity_id
       JOIN v2_identity_slots slot ON slot.identity_id = participant.identity_id
       WHERE participant.identity_id = ?`,
    )
    .get(identityId) as ParticipantRow | undefined
  if (!participant) {
    throw new V2ParticipantCommandError(
      'AUTH_REQUIRED',
      '参与者身份尚未在当前活动中激活。',
      401,
    )
  }
  return participant
}

function channelToHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0')
}

function displayColorForKelvin(kelvin: number): string {
  const upperIndex = SPECTRAL_STOPS.findIndex(([stop]) => stop >= kelvin)
  if (upperIndex <= 0) {
    return `#${SPECTRAL_STOPS[0]![1].map(channelToHex).join('')}`
  }
  const [upperKelvin, upperColor] = SPECTRAL_STOPS[upperIndex]!
  const [lowerKelvin, lowerColor] = SPECTRAL_STOPS[upperIndex - 1]!
  const ratio = (kelvin - lowerKelvin) / (upperKelvin - lowerKelvin)
  return `#${lowerColor
    .map((channel, index) =>
      channelToHex(channel + (upperColor[index]! - channel) * ratio),
    )
    .join('')}`
}

function readPublicAggregate(database: SqliteDatabase, resetEpoch: number) {
  return database
    .prepare(
      `SELECT
         (SELECT count(*) FROM v2_participant_states WHERE reset_epoch = ?) AS activatedCount,
         (SELECT count(*) FROM v2_public_stars WHERE reset_epoch = ?) AS publicStarCount,
         (SELECT count(*) FROM v2_participant_states WHERE reset_epoch = ? AND onboarding_state = 'ADMITTED') AS admittedCount,
         (SELECT count(*) FROM v2_public_stars WHERE reset_epoch = ? AND started = 1) AS starStartedCount,
         (SELECT count(*) FROM v2_participant_states WHERE reset_epoch = ? AND cooperative_light_at IS NOT NULL) AS cooperativeLightCount,
         (SELECT COALESCE(sum(starlight), 0) FROM v2_participant_states WHERE reset_epoch = ?) AS totalStarlight`,
    )
    .get(resetEpoch, resetEpoch, resetEpoch, resetEpoch, resetEpoch, resetEpoch) as {
    activatedCount: number
    publicStarCount: number
    admittedCount: number
    starStartedCount: number
    cooperativeLightCount: number
    totalStarlight: number
  }
}

function readAdminFunnel(
  database: SqliteDatabase,
  resetEpoch: number,
  now: Date,
) {
  const publicAggregate = readPublicAggregate(database, resetEpoch)
  const capsuleCounts = database
    .prepare(
      `SELECT
         sum(CASE WHEN capsule_decision = 'SUBMITTED' THEN 1 ELSE 0 END) AS submitted,
         sum(CASE WHEN capsule_decision = 'SKIPPED' THEN 1 ELSE 0 END) AS skipped
       FROM v2_participant_states WHERE reset_epoch = ?`,
    )
    .get(resetEpoch) as { submitted: number | null; skipped: number | null }
  const onlineParticipantSessions = Number(
    database
      .prepare(
        `SELECT count(DISTINCT subject_id) FROM v2_sessions
         WHERE reset_epoch = ? AND session_type = 'PARTICIPANT'
           AND revoked_at IS NULL AND expires_at > ?`,
      )
      .pluck()
      .get(resetEpoch, now.toISOString()),
  )
  return {
    activatedCount: publicAggregate.activatedCount,
    publicStarCount: publicAggregate.publicStarCount,
    admittedCount: publicAggregate.admittedCount,
    onboardingPendingCount:
      publicAggregate.activatedCount - publicAggregate.admittedCount,
    capsuleSubmittedCount: Number(capsuleCounts.submitted ?? 0),
    capsuleSkippedCount: Number(capsuleCounts.skipped ?? 0),
    starStartedCount: publicAggregate.starStartedCount,
    cooperativeLightCount: publicAggregate.cooperativeLightCount,
    onlineParticipantSessions,
  }
}

function nextStreamSequence(
  database: SqliteDatabase,
  resetEpoch: number,
  streamId: string,
): number {
  database
    .prepare(
      `INSERT INTO v2_stream_cursors (reset_epoch, stream_id, stream_seq)
       VALUES (?, ?, 0)
       ON CONFLICT(reset_epoch, stream_id) DO NOTHING`,
    )
    .run(resetEpoch, streamId)
  database
    .prepare(
      `UPDATE v2_stream_cursors SET stream_seq = stream_seq + 1
       WHERE reset_epoch = ? AND stream_id = ?`,
    )
    .run(resetEpoch, streamId)
  return Number(
    database
      .prepare(
        `SELECT stream_seq FROM v2_stream_cursors
         WHERE reset_epoch = ? AND stream_id = ?`,
      )
      .pluck()
      .get(resetEpoch, streamId),
  )
}

function appendEvent(
  database: SqliteDatabase,
  input: {
    resetEpoch: number
    streamId: string
    name: string
    revision: number
    payload: unknown
    timestamp: string
  },
): void {
  const streamSeq = nextStreamSequence(
    database,
    input.resetEpoch,
    input.streamId,
  )
  database
    .prepare(
      `INSERT INTO v2_domain_events (
         reset_epoch, stream_id, stream_seq, event_id, event_name,
         revision, payload_json, committed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.resetEpoch,
      input.streamId,
      streamSeq,
      `${input.resetEpoch}:${input.streamId}:${streamSeq}`,
      input.name,
      input.revision,
      JSON.stringify(input.payload),
      input.timestamp,
    )
}

function appendParticipantEvent(
  database: SqliteDatabase,
  identityId: string,
  resetEpoch: number,
  participantRevision: number,
  timestamp: string,
): void {
  appendEvent(database, {
    resetEpoch,
    streamId: `participant:${identityId}`,
    name: 'participant.snapshot.changed',
    revision: participantRevision,
    payload: {
      projection: 'SELF',
      participantRevision,
      requiresSnapshot: true,
    },
    timestamp,
  })
}

function appendAggregateEvents(
  database: SqliteDatabase,
  runtime: RuntimeRow,
  now: Date,
): void {
  const publicAggregateRevision = runtime.publicAggregateRevision + 1
  const adminAggregateRevision = runtime.adminAggregateRevision + 1
  const timestamp = now.toISOString()
  database
    .prepare(
      `UPDATE v2_runtime_state
       SET public_aggregate_revision = ?, admin_aggregate_revision = ?,
           updated_at = ? WHERE id = 1`,
    )
    .run(publicAggregateRevision, adminAggregateRevision, timestamp)
  appendEvent(database, {
    resetEpoch: runtime.resetEpoch,
    streamId: 'public',
    name: 'aggregate.changed',
    revision: publicAggregateRevision,
    payload: {
      projection: 'PUBLIC_AGGREGATE',
      aggregateRevision: publicAggregateRevision,
      aggregate: readPublicAggregate(database, runtime.resetEpoch),
    },
    timestamp,
  })
  appendEvent(database, {
    resetEpoch: runtime.resetEpoch,
    streamId: 'admin',
    name: 'aggregate.changed',
    revision: adminAggregateRevision,
    payload: {
      projection: 'ADMIN_AGGREGATE',
      aggregateRevision: adminAggregateRevision,
      aggregate: readAdminFunnel(database, runtime.resetEpoch, now),
    },
    timestamp,
  })
  const publicSeq = Number(
    database
      .prepare(
        `SELECT stream_seq FROM v2_stream_cursors
         WHERE reset_epoch = ? AND stream_id = 'public'`,
      )
      .pluck()
      .get(runtime.resetEpoch),
  )
  const adminSeq = Number(
    database
      .prepare(
        `SELECT stream_seq FROM v2_stream_cursors
         WHERE reset_epoch = ? AND stream_id = 'admin'`,
      )
      .pluck()
      .get(runtime.resetEpoch),
  )
  database
    .prepare(
      'UPDATE v2_runtime_state SET public_seq = ?, admin_seq = ? WHERE id = 1',
    )
    .run(publicSeq, adminSeq)
}

/**
 * Schema maintenance can legitimately reshape an existing participant
 * projection while every service is stopped. Publish snapshot-required
 * invalidations before the upgrade commits so persisted revisions and event
 * streams remain monotonic for the next connection.
 */
export function reconcileV2ProjectionEventsAfterMaintenance(
  database: SqliteDatabase,
  now: Date,
): void {
  if (!database.inTransaction) {
    throw new Error('V2 projection reconciliation requires an active transaction')
  }
  const runtime = readRuntime(database)
  const changedParticipants = database
    .prepare(
      `SELECT participant.identity_id AS identityId,
              participant.participant_revision AS participantRevision
       FROM v2_participant_states participant
       WHERE participant.participant_revision != COALESCE((
         SELECT event.revision
         FROM v2_domain_events event
         WHERE event.reset_epoch = participant.reset_epoch
           AND event.stream_id = 'participant:' || participant.identity_id
           AND event.event_name = 'participant.snapshot.changed'
         ORDER BY event.stream_seq DESC LIMIT 1
       ), -1)
       ORDER BY participant.identity_id`,
    )
    .all() as Array<{ identityId: string; participantRevision: number }>
  if (changedParticipants.length === 0) return

  const timestamp = now.toISOString()
  database
    .prepare(
      `UPDATE v2_sessions
       SET revoked_at = COALESCE(revoked_at, ?)
       WHERE reset_epoch = ?`,
    )
    .run(timestamp, runtime.resetEpoch)
  database
    .prepare('DELETE FROM v2_idempotency_records WHERE reset_epoch = ?')
    .run(runtime.resetEpoch)
  for (const participant of changedParticipants) {
    appendParticipantEvent(
      database,
      participant.identityId,
      runtime.resetEpoch,
      participant.participantRevision,
      timestamp,
    )
  }
  appendAggregateEvents(database, runtime, now)
}

function appendStarEvent(
  database: SqliteDatabase,
  runtime: RuntimeRow,
  identityId: string,
  timestamp: string,
): void {
  const storedStar = database
    .prepare(
      `SELECT public_star_id AS publicStarId,
              color_temperature_kelvin AS colorTemperatureKelvin,
              display_color AS displayColor, formation_slot AS formationSlot,
              started = 1 AS started, star_revision AS starRevision,
              updated_at AS updatedAt
       FROM v2_public_stars WHERE identity_id = ?`,
    )
    .get(identityId) as Record<string, unknown> & {
    starRevision: number
    started: number
  }
  const star = { ...storedStar, started: storedStar.started === 1 }
  const revision = storedStar.starRevision
  appendEvent(database, {
    resetEpoch: runtime.resetEpoch,
    streamId: 'public',
    name: 'star.node.upserted',
    revision,
    payload: { star },
    timestamp,
  })
  const publicSeq = Number(
    database
      .prepare(
        `SELECT stream_seq FROM v2_stream_cursors
         WHERE reset_epoch = ? AND stream_id = 'public'`,
      )
      .pluck()
      .get(runtime.resetEpoch),
  )
  database
    .prepare('UPDATE v2_runtime_state SET public_seq = ? WHERE id = 1')
    .run(publicSeq)
}

const V2_SENSITIVE_TERMS = ['辱骂', '暴力威胁', '违禁', '敏感词'] as const
const V2_URL_PATTERN = /(?:https?:\/\/|www\.|(?:[a-z0-9-]+\.)+(?:com|cn|net|org|io|xyz)\b)/iu
const V2_EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu
const V2_CONTACT_PATTERN = /(?:微信|wechat|\bvx\b|qq|电话|手机号)\s*[:：号-]?\s*[a-z0-9_-]{4,}/iu

function normalizeBarrageText(text: string): string {
  const normalized = text.normalize('NFKC').trim()
  const compact = normalized.replace(/[\s-]/gu, '')
  const folded = normalized.toLocaleLowerCase('zh-CN')
  if (
    /1[3-9]\d{9}/u.test(compact) ||
    V2_URL_PATTERN.test(normalized) ||
    V2_EMAIL_PATTERN.test(normalized) ||
    V2_CONTACT_PATTERN.test(normalized) ||
    V2_SENSITIVE_TERMS.some((term) => folded.includes(term))
  ) {
    throw new V2ParticipantCommandError(
      'CONTENT_REJECTED',
      '内容包含链接、联系方式或不适合公开展示的信息，请修改后重试。',
      422,
    )
  }
  return normalized
}

function interactionState(database: SqliteDatabase, resetEpoch: number) {
  return database.prepare(
    `SELECT interaction_revision AS interactionRevision,
            barrage_paused AS barragePaused, display_batch AS displayBatch,
            next_display_seq AS nextDisplaySeq
     FROM v2_screen_interaction_state WHERE reset_epoch = ?`,
  ).get(resetEpoch) as {
    interactionRevision: number
    barragePaused: number
    displayBatch: number
    nextDisplaySeq: number
  }
}

function appendInteractionEvent(
  database: SqliteDatabase,
  runtime: RuntimeRow,
  revision: number,
  name: string,
  payload: unknown,
  timestamp: string,
): void {
  appendEvent(database, {
    resetEpoch: runtime.resetEpoch,
    streamId: 'public',
    name,
    revision,
    payload,
    timestamp,
  })
  const publicSeq = Number(database.prepare(
    `SELECT stream_seq FROM v2_stream_cursors
     WHERE reset_epoch = ? AND stream_id = 'public'`,
  ).pluck().get(runtime.resetEpoch))
  database.prepare('UPDATE v2_runtime_state SET public_seq = ? WHERE id = 1').run(publicSeq)
}

function presentationFor(database: SqliteDatabase, runtime: RuntimeRow) {
  if (runtime.presentationType === 'NONE') return { type: 'NONE' as const }
  if (runtime.presentationType === 'RAFFLE') return { type: 'RAFFLE' as const }
  if (runtime.presentationType === 'FINALE_PREVIEW') {
    return { type: 'FINALE_PREVIEW' as const, rehearsal: true as const }
  }
  const capsules = database
    .prepare(
      `SELECT capsule.capsule_id AS capsuleId,
              star.public_star_id AS publicStarId,
              star.color_temperature_kelvin AS colorTemperatureKelvin,
              star.display_color AS displayColor, capsule.text
       FROM v2_capsules capsule
       JOIN v2_public_stars star
         ON star.reset_epoch = capsule.reset_epoch
        AND star.identity_id = capsule.identity_id
       WHERE capsule.reset_epoch = ? AND capsule.moderation_status = 'DISPLAYED'
       ORDER BY capsule.submitted_at LIMIT 6`,
    )
    .all(runtime.resetEpoch)
  return { type: 'CAPSULE_INSERT' as const, capsules }
}

function runtimeTuple(runtime: RuntimeRow): V2RuntimeTuple {
  return {
    mode: runtime.mode,
    status: runtime.status,
    currentScene: runtime.currentScene,
    runRevision: runtime.runRevision,
  } as V2RuntimeTuple
}

function allowedActions(database: SqliteDatabase, runtime: RuntimeRow, participant: ParticipantRow) {
  if (runtime.status === 'PAUSED' || runtime.status === 'COMPLETED') return []
  const actions: string[] = []
  if (participant.onboardingState === 'NEEDS_COLOR') actions.push('LOCK_COLOR')
  if (participant.onboardingState !== 'ADMITTED' || runtime.status !== 'RUNNING') {
    return actions
  }
  if (
    runtime.currentScene === 'ASSEMBLY' &&
    participant.startedAt === null &&
    (participant.admittedScene === null || participant.admittedScene === 'ASSEMBLY')
  ) {
    actions.push('START_STAR')
  }
  if (
    runtime.currentScene === 'PROGRAM_SUPPORT' &&
    (participant.admittedScene === null ||
      participant.admittedScene === 'ASSEMBLY' ||
      participant.admittedScene === 'PROGRAM_SUPPORT')
  ) {
    const current = readCurrentV2Program(database)
    if (!current || current.kind === 'PERFORMANCE' && current.giftsEnabled !== false) actions.push('SEND_GIFT')
    actions.push('POST_BARRAGE')
    const live = readV2LiveInteraction(database, runtime.resetEpoch, { identityId: participant.identityId })
    if (live.phase === 'BUZZER_OPEN' && !live.participation.hasBuzzed) actions.push('BUZZ_IN')
    if (live.phase === 'VOTE_OPEN' && !live.participation.hasVoted) actions.push('CAST_AUDIENCE_VOTE')
  }
  if (
    runtime.currentScene === 'COOPERATIVE_LIGHT' &&
    participant.cooperativeLightAt === null
  ) {
    actions.push('COOPERATIVE_LIGHT')
  }
  return actions
}

function participantProjection(
  database: SqliteDatabase,
  runtime: RuntimeRow,
  identityId: string,
) {
  const participant = readParticipant(database, identityId)
  const capsule = database
    .prepare(
      `SELECT text, candidate_scope_accepted_at AS candidateScopeAcceptedAt,
              submitted_at AS submittedAt, moderation_status AS moderationStatus
       FROM v2_capsules WHERE reset_epoch = ? AND identity_id = ?`,
    )
    .get(runtime.resetEpoch, identityId) as
    | {
        text: string
        candidateScopeAcceptedAt: string
        submittedAt: string
        moderationStatus: 'SUBMITTED' | 'SELECTED' | 'DISPLAYED' | 'REMOVED'
      }
    | undefined
  const rewards = database
    .prepare(
      `SELECT event_key AS eventKey, delta,
              reward_rule_version AS rewardRuleVersion,
              created_at AS awardedAt
       FROM v2_reward_ledger
       WHERE reset_epoch = ? AND identity_id = ? ORDER BY id`,
    )
    .all(runtime.resetEpoch, identityId)
  const giftHistory = databaseTableExists(database, 'v2_program_catalog') ? database
    .prepare(
      `SELECT gift_tx.program_id AS programId,
              program.title AS programTitle,
              gift_tx.gift_id AS giftId,
              gift.name AS giftName,
              COUNT(*) AS quantity,
              SUM(gift_tx.power_cost) AS totalPower,
              MAX(gift_tx.created_at) AS lastSentAt
       FROM v2_gift_transactions gift_tx
       JOIN v2_program_catalog program ON program.id = gift_tx.program_id
       JOIN gift_catalog gift ON gift.id = gift_tx.gift_id
       WHERE gift_tx.reset_epoch = ? AND gift_tx.identity_id = ?
       GROUP BY gift_tx.program_id, program.title,
                gift_tx.gift_id, gift.name
       ORDER BY MAX(gift_tx.created_at) DESC
       LIMIT 128`,
    )
    .all(runtime.resetEpoch, identityId) : []
  const barrageHistory = databaseTableExists(database, 'v2_interaction_unlocks') ? database
    .prepare(
      `SELECT barrage.id AS barrageId, barrage.text,
              CASE WHEN barrage.custom_color IS NOT NULL THEN 'personal' ELSE barrage.color_style END AS colorStyle,
              barrage.custom_color AS customColor,
              CASE WHEN publication.status = 'REMOVED'
                THEN 'REMOVED' ELSE 'PUBLISHED' END AS status,
              barrage.created_at AS createdAt
       FROM v2_barrages barrage
       LEFT JOIN v2_barrage_publications publication
         ON publication.barrage_id = barrage.id
        AND publication.reset_epoch = barrage.reset_epoch
       WHERE barrage.reset_epoch = ? AND barrage.identity_id = ?
       ORDER BY barrage.created_at DESC
       LIMIT 100`,
    )
    .all(runtime.resetEpoch, identityId) : []
  return {
    participantRevision: participant.participantRevision,
    onboardingState: participant.onboardingState,
    displayName: participant.displayName,
    personalStarCode: participant.publicStarId,
    activatedAt: participant.activatedAt,
    colorTemperatureKelvin: participant.colorTemperatureKelvin,
    displayColor: participant.displayColor,
    colorLockedAt: participant.colorLockedAt,
    ownPublicStarId:
      participant.colorLockedAt === null ? null : participant.publicStarId,
    formationSlot:
      participant.colorLockedAt === null ? null : participant.formationSlot,
    capsuleDecision: participant.capsuleDecision,
    capsuleText: capsule?.text ?? null,
    candidateScopeAcceptedAt: capsule?.candidateScopeAcceptedAt ?? null,
    submittedAt: capsule?.submittedAt ?? null,
    skippedAt: participant.capsuleSkippedAt,
    capsuleModerationStatus: capsule?.moderationStatus ?? null,
    admittedAt: participant.admittedAt,
    admittedScene: participant.admittedScene,
    admittedRunRevision: participant.admittedRunRevision,
    started: participant.startedAt !== null,
    startedAt: participant.startedAt,
    firstGiftRewardedAt: participant.firstGiftAt,
    firstBarrageRewardedAt: participant.firstBarrageAt,
    cooperativeLightAt: participant.cooperativeLightAt,
    powerBalance: participant.powerBalance,
    unlockedBarrageStyles: databaseTableExists(database, 'v2_interaction_unlocks') ? database.prepare("SELECT item_key FROM v2_interaction_unlocks WHERE reset_epoch = ? AND identity_id = ? AND kind = 'STYLE'").pluck().all(runtime.resetEpoch, identityId) : [],
    programAllowance: 0,
    giftHistory,
    barrageHistory,
    starlight: participant.starlight,
    rewards,
    allowedActions: allowedActions(database, runtime, participant),
  }
}

function publicStars(database: SqliteDatabase, resetEpoch: number) {
  return (database
    .prepare(
      `SELECT public_star_id AS publicStarId,
              color_temperature_kelvin AS colorTemperatureKelvin,
              display_color AS displayColor, formation_slot AS formationSlot,
              started = 1 AS started, star_revision AS starRevision,
              updated_at AS updatedAt
       FROM v2_public_stars WHERE reset_epoch = ? ORDER BY formation_slot`,
    )
    .all(resetEpoch) as Array<Record<string, unknown> & { started: number }>).map(
      (star) => ({ ...star, started: star.started === 1 }),
    )
}

function finalRecap(database: SqliteDatabase, resetEpoch: number) {
  return database
    .prepare(
      `SELECT capsule_id AS capsuleId, public_star_id AS publicStarId,
              color_temperature_kelvin AS colorTemperatureKelvin,
              display_color AS displayColor, text
       FROM v2_final_recap_capsules
       WHERE reset_epoch = ? ORDER BY position`,
    )
    .all(resetEpoch)
}




function participantInteraction(database: SqliteDatabase, resetEpoch: number) {
  const row = database.prepare(
    `SELECT interaction_revision AS interactionRevision,
            barrage_paused AS barragePaused, display_batch AS displayBatch
     FROM v2_screen_interaction_state WHERE reset_epoch = ?`,
  ).get(resetEpoch) as {
    interactionRevision: number
    barragePaused: number
    displayBatch: number
  }
  return { ...row, barragePaused: row.barragePaused === 1 }
}

function participantPublishedBarrages(database: SqliteDatabase, resetEpoch: number) {
  if (!databaseTableExists(database, 'v2_interaction_unlocks')) return []
  return database.prepare(
    `SELECT barrage.id AS barrageId, barrage.text,
            star.public_star_id AS publicStarId,
            CASE WHEN barrage.custom_color IS NOT NULL THEN 'personal' ELSE barrage.color_style END AS colorStyle,
            barrage.custom_color AS customColor,
            publication.display_seq AS displaySeq,
            publication.published_at AS publishedAt
     FROM v2_barrage_publications publication
     JOIN v2_barrages barrage ON barrage.id = publication.barrage_id
     JOIN v2_public_stars star
       ON star.identity_id = barrage.identity_id
      AND star.reset_epoch = barrage.reset_epoch
     JOIN v2_screen_interaction_state state
       ON state.reset_epoch = publication.reset_epoch
     WHERE publication.reset_epoch = ?
       AND publication.status = 'PUBLISHED'
       AND publication.display_batch = state.display_batch
     ORDER BY publication.display_seq DESC
     LIMIT 8`,
  ).all(resetEpoch).reverse()
}

export function readV2ParticipantSnapshot(
  database: SqliteDatabase,
  identityId: string,
  now: Date = new Date(),
): V2ParticipantSnapshot {
  const runtime = readRuntime(database)
  const participantSeq = Number(
    database
      .prepare(
        `SELECT stream_seq FROM v2_stream_cursors
         WHERE reset_epoch = ? AND stream_id = ?`,
      )
      .pluck()
      .get(runtime.resetEpoch, `participant:${identityId}`) ?? 0,
  )
  return V2ParticipantSnapshotSchema.parse({
    status: 'ok',
    protocolVersion: '2',
    resetEpoch: runtime.resetEpoch,
    generatedAt: now.toISOString(),
    runtime: runtimeTuple(runtime),
    presentation: presentationFor(database, runtime),
    presentationRevision: runtime.presentationRevision,
    rewardRuleVersion: runtime.rewardRuleVersion,
    publicSeq: runtime.publicSeq,
    participantSeq,
    participantStreamId: `participant:${identityId}`,
    participant: participantProjection(database, runtime, identityId),
    publicStars: publicStars(database, runtime.resetEpoch),
    aggregateRevision: runtime.publicAggregateRevision,
    aggregate: readPublicAggregate(database, runtime.resetEpoch),
    currentProgram: readCurrentV2Program(database),
    programs: readV2ProgramSchedule(database),
    stage: readV2Stage(database),
    awards: readV2AwardSummaries(database),
    interaction: participantInteraction(database, runtime.resetEpoch),
    liveInteraction: readV2LiveInteraction(database, runtime.resetEpoch, { identityId }),
    publishedBarrages: participantPublishedBarrages(database, runtime.resetEpoch),
    finalRecap: finalRecap(database, runtime.resetEpoch),
    closingRecap: readV2ClosingRecap(database, runtime.resetEpoch,
      runtime.status === 'COMPLETED' || runtime.presentationType === 'FINALE_PREVIEW'),
  })
}

function createParticipantSession(
  database: SqliteDatabase,
  identityId: string,
  runtime: RuntimeRow,
  now: Date,
): V2CreatedParticipantSession {
  const id = randomUUID()
  const secret = randomBytes(32).toString('base64url')
  const shortId = randomBytes(6).toString('hex')
  const expiresAt = new Date(now.getTime() + PARTICIPANT_SESSION_SECONDS * 1000)
  database
    .prepare(
      `INSERT INTO v2_sessions (
         id, session_type, subject_id, secret_digest, roles_json,
         reset_epoch, short_id, read_only, created_at, expires_at, revoked_at
       ) VALUES (?, 'PARTICIPANT', ?, ?, '[]', ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      id,
      identityId,
      sha256(secret),
      runtime.resetEpoch,
      shortId,
      runtime.status === 'PAUSED' || runtime.status === 'COMPLETED' ? 1 : 0,
      now.toISOString(),
      expiresAt.toISOString(),
    )
  return {
    id,
    secret,
    identityId,
    resetEpoch: runtime.resetEpoch,
    readOnly: runtime.status === 'PAUSED' || runtime.status === 'COMPLETED',
    shortId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  }
}

function resolveIdentity(
  database: SqliteDatabase,
  credentials: CredentialContext,
  request: ReturnType<typeof V2ActivateParticipantRequestSchema.parse>,
): IdentityRow | undefined {
  if (request.method === 'INVITATION_TOKEN') {
    return database
      .prepare(
        `SELECT identity.id AS identityId, identity.enabled,
                token.status AS invitationStatus
         FROM invitation_tokens token
         JOIN synthetic_identities identity ON identity.id = token.identity_id
         WHERE token.token_digest = ?`,
      )
      .get(invitationTokenDigest(request.token)) as IdentityRow | undefined
  }
  const candidates = database
    .prepare(
      `SELECT identity.id AS identityId, identity.enabled,
              token.status AS invitationStatus,
              identity.student_number_digest AS studentNumberDigest
       FROM synthetic_identities identity
       JOIN invitation_tokens token ON token.identity_id = identity.id
       WHERE identity.display_name = ?`,
    )
    .all(request.displayName) as Array<
    IdentityRow & { studentNumberDigest: string }
  >
  const credentialCandidates = request.studentNumber.length === 8
    ? [request.studentNumber, `2026${request.studentNumber}`]
    : [request.studentNumber]
  return candidates.find((candidate) =>
    credentialCandidates.some((studentNumber) =>
      verifyStudentNumberCredential(
        credentials,
        candidate.identityId,
        studentNumber,
        candidate.studentNumberDigest,
      ),
    ),
  )
}

function assertIdempotency(
  database: SqliteDatabase,
  input: {
    resetEpoch: number
    scope: string
    key: string
    request: unknown
  },
): { replayed: boolean; keyDigest: string } {
  const keyDigest = sha256(input.key)
  const digest = requestDigest(input.request)
  const stored = database
    .prepare(
      `SELECT request_digest AS requestDigest
       FROM v2_idempotency_records
       WHERE reset_epoch = ? AND scope = ? AND key_digest = ?`,
    )
    .get(input.resetEpoch, input.scope, keyDigest) as
    | { requestDigest: string }
    | undefined
  if (!stored) return { replayed: false, keyDigest }
  if (stored.requestDigest !== digest) {
    throw new V2ParticipantCommandError(
      'IDEMPOTENCY_CONFLICT',
      '该幂等键已经用于不同请求。',
      409,
      input.resetEpoch,
    )
  }
  return { replayed: true, keyDigest }
}

function saveIdempotency(
  database: SqliteDatabase,
  input: {
    resetEpoch: number
    scope: string
    keyDigest: string
    request: unknown
    body: unknown
    now: Date
  },
): void {
  database
    .prepare(
      `INSERT INTO v2_idempotency_records (
         reset_epoch, scope, key_digest, request_digest, response_status,
         response_body_json, created_at, expires_at
       ) VALUES (?, ?, ?, ?, 200, ?, ?, ?)`,
    )
    .run(
      input.resetEpoch,
      input.scope,
      input.keyDigest,
      requestDigest(input.request),
      JSON.stringify(input.body),
      input.now.toISOString(),
      IDEMPOTENCY_EXPIRY,
    )
}

export function activateV2Participant(
  database: SqliteDatabase,
  credentials: CredentialContext,
  input: unknown,
  now: Date = new Date(),
): V2ActivationResult {
  const request = V2ActivateParticipantRequestSchema.parse(input)
  const identity = resolveIdentity(database, credentials, request)
  if (
    !identity ||
    identity.enabled !== 1 ||
    identity.invitationStatus !== 'ACTIVE'
  ) {
    throw new V2ParticipantCommandError(
      'AUTH_REQUIRED',
      '入口或核验信息无效，请重新轻触或扫码。',
      401,
    )
  }

  database.exec('BEGIN IMMEDIATE')
  try {
    const runtime = readRuntime(database)
    assertExpectedEpoch(runtime, request.resetEpoch)
    const existing = database
      .prepare(
        `SELECT 1 FROM v2_participant_states
         WHERE reset_epoch = ? AND identity_id = ?`,
      )
      .get(runtime.resetEpoch, identity.identityId)
    if (!existing) assertParticipantWriteOpen(runtime)

    const idempotency = assertIdempotency(database, {
      resetEpoch: runtime.resetEpoch,
      scope: `participant:activate:${identity.identityId}`,
      key: request.idempotencyKey,
      request,
    })
    let activated = false
    if (!existing && !idempotency.replayed) {
      const slot = database
        .prepare(
          `SELECT reserved_reset_epoch AS reservedResetEpoch
           FROM v2_identity_slots WHERE identity_id = ?`,
        )
        .get(identity.identityId) as
        | { reservedResetEpoch: number | null }
        | undefined
      if (!slot) {
        throw new V2ParticipantCommandError(
          'STAR_CAPACITY_REACHED',
          '公共星系名额已满，无法建立新的参与者状态。',
          409,
          runtime.resetEpoch,
        )
      }
      if (
        slot.reservedResetEpoch !== null &&
        slot.reservedResetEpoch !== runtime.resetEpoch
      ) {
        throw new V2ParticipantCommandError(
          'STAR_CAPACITY_REACHED',
          '公共星系名额暂不可用。',
          409,
          runtime.resetEpoch,
        )
      }
      const timestamp = now.toISOString()
      database
        .prepare(
          `UPDATE v2_identity_slots
           SET reserved_reset_epoch = ?, reserved_at = ?
           WHERE identity_id = ? AND reserved_reset_epoch IS NULL`,
        )
        .run(runtime.resetEpoch, timestamp, identity.identityId)
      database
        .prepare(
          `INSERT INTO v2_participant_states (
             identity_id, reset_epoch, participant_revision, onboarding_state,
             activated_at, color_temperature_kelvin, display_color,
             color_locked_at, capsule_decision, capsule_skipped_at,
             admitted_at, admitted_scene, admitted_run_revision,
             started_at, first_gift_at, first_barrage_at,
             cooperative_light_at, power_balance, starlight, updated_at
           ) VALUES (
             ?, ?, 1, 'NEEDS_COLOR', ?, NULL, NULL, NULL, 'NONE', NULL,
             NULL, NULL, NULL, NULL, NULL, NULL, NULL, 100, 0, ?
           )`,
        )
        .run(identity.identityId, runtime.resetEpoch, timestamp, timestamp)
      database
        .prepare(
          `INSERT INTO v2_reward_ledger (
             reset_epoch, identity_id, event_key, delta,
             reward_rule_version, created_at
           ) VALUES (?, ?, 'ACTIVATED', 0, ?, ?)`,
        )
        .run(
          runtime.resetEpoch,
          identity.identityId,
          runtime.rewardRuleVersion,
          timestamp,
        )
      appendParticipantEvent(
        database,
        identity.identityId,
        runtime.resetEpoch,
        1,
        timestamp,
      )
      appendAggregateEvents(database, runtime, now)
      activated = true
    }

    if (!idempotency.replayed) {
      saveIdempotency(database, {
        resetEpoch: runtime.resetEpoch,
        scope: `participant:activate:${identity.identityId}`,
        keyDigest: idempotency.keyDigest,
        request,
        body: { identityId: identity.identityId, activated },
        now,
      })
    }
    const currentRuntime = readRuntime(database)
    const session = createParticipantSession(
      database,
      identity.identityId,
      currentRuntime,
      now,
    )
    const snapshot = readV2ParticipantSnapshot(
      database,
      identity.identityId,
      now,
    )
    database.exec('COMMIT')
    return { snapshot, session, activated }
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw error
  }
}

export function executeV2ParticipantOnboardingCommand(
  database: SqliteDatabase,
  identityId: string,
  input: unknown,
  now: Date = new Date(),
) {
  const request = V2ParticipantCommandSchema.parse(input)
  database.exec('BEGIN IMMEDIATE')
  try {
    const runtime = readRuntime(database)
    assertExpectedEpoch(runtime, request.resetEpoch)
    assertParticipantWriteOpen(runtime)
    if (request.command === 'UPSERT_CAPSULE' || request.command === 'SKIP_CAPSULE') {
      throw new V2ParticipantCommandError(
        'ONBOARDING_STATE_INVALID',
        '时光胶囊功能已下线；锁定星色后会直接进入现场。',
        409,
        runtime.resetEpoch,
      )
    }
    const participant = readParticipant(database, identityId)
    const scope = `participant:${request.command.toLowerCase()}:${identityId}`
    const idempotency = assertIdempotency(database, {
      resetEpoch: runtime.resetEpoch,
      scope,
      key: request.idempotencyKey,
      request,
    })
  if (idempotency.replayed) {
      const stored = database
        .prepare(
          `SELECT response_body_json AS body
           FROM v2_idempotency_records
           WHERE reset_epoch = ? AND scope = ? AND key_digest = ?`,
        )
        .get(runtime.resetEpoch, scope, idempotency.keyDigest) as { body: string }
      const replay = {
        ...(JSON.parse(stored.body) as Record<string, unknown>),
        replayed: true,
      }
      database.exec('COMMIT')
      return V2ParticipantCommandResponseSchema.parse(replay)
    }
    if (
      request.command === 'LOCK_COLOR' &&
      participant.onboardingState !== 'NEEDS_COLOR' &&
      participant.colorTemperatureKelvin === request.colorTemperatureKelvin
    ) {
      const currentRuntime = readRuntime(database)
      const response = V2ParticipantCommandResponseSchema.parse({
        status: 'ok',
        protocolVersion: '2',
        resetEpoch: currentRuntime.resetEpoch,
        command: request.command,
        replayed: false,
        runtime: runtimeTuple(currentRuntime),
        presentation: presentationFor(database, currentRuntime),
        presentationRevision: currentRuntime.presentationRevision,
        currentProgram: readCurrentV2Program(database),
        liveInteraction: readV2LiveInteraction(database, currentRuntime.resetEpoch, { identityId }),
        participant: participantProjection(database, currentRuntime, identityId),
      })
      saveIdempotency(database, {
        resetEpoch: runtime.resetEpoch,
        scope,
        keyDigest: idempotency.keyDigest,
        request,
        body: response,
        now,
      })
      database.exec('COMMIT')
      return response
    }
    if (participant.participantRevision !== request.expectedParticipantRevision) {
      throw new V2ParticipantCommandError(
        'REVISION_CONFLICT',
        '参与者状态已变化，请刷新后重试。',
        409,
        runtime.resetEpoch,
      )
    }

    const timestamp = now.toISOString()
    let aggregateChanged = false
    if (
      request.command === 'START_STAR' ||
      request.command === 'SEND_GIFT' ||
      request.command === 'POST_BARRAGE' ||
      request.command === 'BUZZ_IN' ||
      request.command === 'CAST_AUDIENCE_VOTE' ||
      request.command === 'COOPERATIVE_LIGHT'
    ) {
      if (participant.onboardingState !== 'ADMITTED' || runtime.status !== 'RUNNING') {
        throw new V2ParticipantCommandError(
          'SCENE_ACTION_INVALID',
          '请先完成个人入场，并在当前全场场景执行操作。',
          409,
          runtime.resetEpoch,
        )
      }
      const admittedForProgram =
        participant.admittedScene === null ||
        participant.admittedScene === 'ASSEMBLY' ||
        participant.admittedScene === 'PROGRAM_SUPPORT'
      const sceneAllowed =
        (request.command === 'START_STAR' &&
          runtime.currentScene === 'ASSEMBLY' &&
          (participant.admittedScene === null || participant.admittedScene === 'ASSEMBLY')) ||
        ((request.command === 'SEND_GIFT' || request.command === 'POST_BARRAGE' ||
          request.command === 'BUZZ_IN' || request.command === 'CAST_AUDIENCE_VOTE') &&
          runtime.currentScene === 'PROGRAM_SUPPORT' && admittedForProgram) ||
        (request.command === 'COOPERATIVE_LIGHT' &&
          runtime.currentScene === 'COOPERATIVE_LIGHT')
      if (!sceneAllowed) {
        throw new V2ParticipantCommandError(
          'SCENE_ACTION_INVALID',
          '该操作不属于当前场景，错过的场景任务不会补发。',
          409,
          runtime.resetEpoch,
        )
      }

      const revision = participant.participantRevision + 1
      let nextPower = participant.powerBalance
      const nextStarlight = participant.starlight // Retired: keep historical balance, no new points.
      let firstReward = false
      if (request.command === 'START_STAR') {
        if (participant.startedAt !== null) {
          throw new V2ParticipantCommandError(
            'SCENE_ACTION_INVALID',
            '恒星已经启动。',
            409,
            runtime.resetEpoch,
          )
        }
        database.prepare(
          `UPDATE v2_participant_states
           SET participant_revision = ?, started_at = ?, starlight = ?, updated_at = ?
           WHERE reset_epoch = ? AND identity_id = ?`,
        ).run(revision, timestamp, nextStarlight, timestamp, runtime.resetEpoch, identityId)
        database.prepare(
          `UPDATE v2_public_stars SET started = 1,
             star_revision = star_revision + 1, updated_at = ?
           WHERE reset_epoch = ? AND identity_id = ?`,
        ).run(timestamp, runtime.resetEpoch, identityId)
        database.prepare(
          `INSERT INTO v2_reward_ledger (
             reset_epoch, identity_id, event_key, delta, reward_rule_version, created_at
           ) VALUES (?, ?, 'STAR_STARTED', 0, ?, ?)`,
        ).run(runtime.resetEpoch, identityId, runtime.rewardRuleVersion, timestamp)
        appendStarEvent(database, runtime, identityId, timestamp)
        firstReward = true
      } else if (request.command === 'SEND_GIFT') {
        const current = readCurrentV2Program(database)
        if (current && (current.kind !== 'PERFORMANCE' || !current.giftsEnabled)) {
          throw new V2ParticipantCommandError('SCENE_ACTION_INVALID', '当前环节不接收礼物。', 409, runtime.resetEpoch)
        }
        const program = database.prepare(
          `SELECT program.id, program.title
           FROM v2_program_catalog program
           JOIN v2_program_catalog_state state ON state.current_program_id = program.id
           WHERE program.id = ? AND program.enabled = 1 AND program.kind = 'PERFORMANCE'`,
        ).get(request.programId) as { id: string; title: string } | undefined
        const gift = database.prepare(
          'SELECT id, name, power_cost AS powerCost FROM gift_catalog WHERE id = ? AND enabled = 1',
        ).get(request.giftId) as { id: string; name: string; powerCost: number } | undefined
        if (!program || !gift) {
          throw new V2ParticipantCommandError(
            'RESOURCE_NOT_FOUND',
            '节目或礼物不存在。',
            404,
            runtime.resetEpoch,
          )
        }
        const totalPower = gift.powerCost * request.quantity
        if (participant.powerBalance < totalPower) {
          throw new V2ParticipantCommandError(
            'INSUFFICIENT_BALANCE',
            '动力值不足，无法送出该礼物。',
            409,
            runtime.resetEpoch,
          )
        }
        nextPower -= totalPower
        firstReward = participant.firstGiftAt === null
        const giftEventId = `gift:${randomUUID()}`
        const insertGift = database.prepare(
          `INSERT INTO v2_gift_transactions (
             id, reset_epoch, identity_id, program_id, gift_id, power_cost, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        for (let index = 0; index < request.quantity; index += 1) {
          insertGift.run(`${giftEventId}:${index + 1}`, runtime.resetEpoch, identityId,
            request.programId, request.giftId, gift.powerCost, timestamp)
        }
        database.prepare(
          `UPDATE v2_program_catalog SET heat = heat + ?, updated_at = ? WHERE id = ?`,
        ).run(totalPower, timestamp, program.id)
        database.prepare(
          `UPDATE v2_participant_states SET participant_revision = ?,
             first_gift_at = COALESCE(first_gift_at, ?), power_balance = ?,
             starlight = ?, updated_at = ?
           WHERE reset_epoch = ? AND identity_id = ?`,
        ).run(revision, timestamp, nextPower, nextStarlight, timestamp, runtime.resetEpoch, identityId)
        if (firstReward) {
          database.prepare(
            `INSERT INTO v2_reward_ledger (
               reset_epoch, identity_id, event_key, delta, reward_rule_version, created_at
             ) VALUES (?, ?, 'FIRST_GIFT', 0, ?, ?)`,
          ).run(runtime.resetEpoch, identityId, runtime.rewardRuleVersion, timestamp)
        }
        const interaction = interactionState(database, runtime.resetEpoch)
        const interactionRevision = interaction.interactionRevision + 1
        database.prepare(
          `UPDATE v2_screen_interaction_state
           SET interaction_revision = ?, updated_at = ? WHERE reset_epoch = ?`,
        ).run(interactionRevision, timestamp, runtime.resetEpoch)
        const sentCount = Number(database.prepare(
          `SELECT COUNT(*) FROM v2_gift_transactions
           WHERE reset_epoch = ? AND program_id = ? AND gift_id = ?`,
        ).pluck().get(runtime.resetEpoch, program.id, gift.id))
        appendInteractionEvent(database, runtime, interactionRevision, 'gift.sent', {
          interactionRevision,
          gift: {
            giftEventId,
            showStarship: gift.id === 'gift-starship' && Number(database.prepare(
              "SELECT COUNT(DISTINCT CASE WHEN substr(id, 1, 5) = 'gift:' THEN substr(id, 1, 41) ELSE id END) FROM v2_gift_transactions WHERE reset_epoch = ? AND program_id = ? AND gift_id = ?",
            ).pluck().get(runtime.resetEpoch, program.id, gift.id)) <= 2,
            programId: program.id,
            giftId: gift.id,
            giftName: gift.name,
            powerCost: gift.powerCost,
            quantity: request.quantity,
            totalPower,
            sentCount,
            createdAt: timestamp,
          },
        }, timestamp)
      } else if (request.command === 'POST_BARRAGE') {
        const normalized = normalizeBarrageText(request.text)
        const interaction = interactionState(database, runtime.resetEpoch)
        if (interaction.barragePaused === 1) {
          throw new V2ParticipantCommandError(
            'RUNTIME_PAUSED',
            '新弹幕发布已暂停。',
            409,
            runtime.resetEpoch,
          )
        }
        let source = database.prepare(
          `SELECT source_id AS sourceId, blocked_at AS blockedAt
           FROM v2_public_sources WHERE reset_epoch = ? AND identity_id = ?`,
        ).get(runtime.resetEpoch, identityId) as { sourceId: string; blockedAt: string | null } | undefined
        if (!source) {
          source = { sourceId: `src_${randomBytes(18).toString('base64url')}`, blockedAt: null }
          database.prepare(
            `INSERT INTO v2_public_sources (
               reset_epoch, identity_id, source_id, created_at, blocked_at,
               blocked_by_session_short_id
             ) VALUES (?, ?, ?, ?, NULL, NULL)`,
          ).run(runtime.resetEpoch, identityId, source.sourceId, timestamp)
        }
        if (source.blockedAt !== null) {
          throw new V2ParticipantCommandError(
            'SOURCE_BLOCKED',
            '该匿名来源已被暂停发布公共内容。',
            403,
            runtime.resetEpoch,
          )
        }
        const participantRecent = Number(database.prepare(
          `SELECT count(*) FROM v2_barrages
           WHERE reset_epoch = ? AND identity_id = ?
             AND julianday(created_at) >= julianday(?) - (10.0 / 86400.0)`,
        ).pluck().get(runtime.resetEpoch, identityId, timestamp))
        const globalRecent = Number(database.prepare(
          `SELECT count(*) FROM v2_barrage_publications
           WHERE reset_epoch = ? AND status = 'PUBLISHED'
             AND julianday(published_at) >= julianday(?) - (1.0 / 86400.0)`,
        ).pluck().get(runtime.resetEpoch, timestamp))
        if (participantRecent >= 3 || globalRecent >= 12) {
          throw new V2ParticipantCommandError(
            'RATE_LIMITED',
            '发送过于频繁，请稍后再试。',
            429,
            runtime.resetEpoch,
          )
        }
        const colorStyle = request.colorStyle
        const customColor = colorStyle === 'personal' ? participant.displayColor : null
        const paidStyle = ['aurora', 'sunset', 'nebula'].includes(colorStyle)
        const unlocked = database.prepare("SELECT 1 FROM v2_interaction_unlocks WHERE reset_epoch = ? AND identity_id = ? AND kind = 'STYLE' AND item_key = ?").get(runtime.resetEpoch, identityId, colorStyle)
        if (paidStyle && !unlocked) {
          if (nextPower < 10) throw new V2ParticipantCommandError('INSUFFICIENT_BALANCE', '解锁渐变星色需要 10 动力。', 409, runtime.resetEpoch)
          nextPower -= 10
          database.prepare("INSERT INTO v2_interaction_unlocks VALUES (?, ?, 'STYLE', ?, -10, ?)").run(runtime.resetEpoch, identityId, colorStyle, timestamp)
        }
        firstReward = participant.firstBarrageAt === null
        const barrageId = `barrage:${randomUUID()}`
        database.prepare(
          `INSERT INTO v2_barrages (id, reset_epoch, identity_id, text, created_at, color_style, custom_color)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(barrageId, runtime.resetEpoch, identityId, normalized, timestamp,
          colorStyle === 'personal' ? 'white' : colorStyle, customColor)
        database.prepare(
          `INSERT INTO v2_barrage_publications (
             barrage_id, reset_epoch, source_id, status, display_seq,
             display_batch, published_at, removed_at, removed_reason,
             removed_by_session_short_id
           ) VALUES (?, ?, ?, 'PUBLISHED', ?, ?, ?, NULL, NULL, NULL)`,
        ).run(barrageId, runtime.resetEpoch, source.sourceId, interaction.nextDisplaySeq, interaction.displayBatch, timestamp)
        database.prepare(
          `UPDATE v2_participant_states SET participant_revision = ?,
             first_barrage_at = COALESCE(first_barrage_at, ?), starlight = ?, power_balance = ?, updated_at = ?
           WHERE reset_epoch = ? AND identity_id = ?`,
        ).run(revision, timestamp, nextStarlight, nextPower, timestamp, runtime.resetEpoch, identityId)
        if (firstReward) {
          database.prepare(
            `INSERT INTO v2_reward_ledger (
               reset_epoch, identity_id, event_key, delta, reward_rule_version, created_at
             ) VALUES (?, ?, 'FIRST_BARRAGE', 0, ?, ?)`,
          ).run(runtime.resetEpoch, identityId, runtime.rewardRuleVersion, timestamp)
        }
        const interactionRevision = interaction.interactionRevision + 1
        database.prepare(
          `UPDATE v2_screen_interaction_state
           SET interaction_revision = ?, next_display_seq = next_display_seq + 1,
               updated_at = ? WHERE reset_epoch = ?`,
        ).run(interactionRevision, timestamp, runtime.resetEpoch)
        appendInteractionEvent(database, runtime, interactionRevision, 'barrage.published', {
          interactionRevision,
          barrage: {
            barrageId,
            text: normalized,
            publicStarId: participant.publicStarId,
            colorStyle,
            customColor,
            displaySeq: interaction.nextDisplaySeq,
            publishedAt: timestamp,
          },
        }, timestamp)
      } else if (request.command === 'BUZZ_IN') {
        const live = readLiveInteractionRow(database, runtime.resetEpoch)
        const segmentCode = currentInteractionCode(database)
        if (live.phase !== 'BUZZER_OPEN' || !live.segmentCode || segmentCode !== live.segmentCode) {
          throw new V2ParticipantCommandError('SCENE_ACTION_INVALID', '本轮抢答尚未开放或已经锁定。', 409, runtime.resetEpoch)
        }
        if (!live.openedAt || now.getTime() < Date.parse(live.openedAt) + 3000) {
          throw new V2ParticipantCommandError('SCENE_ACTION_INVALID', '倒计时尚未结束。', 409, runtime.resetEpoch)
        }
        const responseSequence = Number(database.prepare(`SELECT COALESCE(MAX(response_sequence), 0) + 1
          FROM v2_buzzer_entries WHERE reset_epoch = ? AND round_number = ?`)
          .pluck().get(runtime.resetEpoch, live.roundNumber))
        database.prepare(`INSERT INTO v2_buzzer_entries (
          id, reset_epoch, round_number, segment_code, identity_id,
          response_sequence, responded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(`buzz:${randomUUID()}`, runtime.resetEpoch,
          live.roundNumber, live.segmentCode, identityId, responseSequence, timestamp)
        const interaction = interactionState(database, runtime.resetEpoch)
        const interactionRevision = interaction.interactionRevision + 1
        database.prepare(`UPDATE v2_live_interaction_state SET phase = 'BUZZER_LOCKED',
          revision = ?, updated_at = ? WHERE reset_epoch = ?`)
          .run(interactionRevision, timestamp, runtime.resetEpoch)
        database.prepare(`UPDATE v2_screen_interaction_state SET interaction_revision = ?,
          updated_at = ? WHERE reset_epoch = ?`).run(interactionRevision, timestamp, runtime.resetEpoch)
        database.prepare(`UPDATE v2_participant_states SET participant_revision = ?, updated_at = ?
          WHERE reset_epoch = ? AND identity_id = ?`).run(revision, timestamp, runtime.resetEpoch, identityId)
        appendInteractionEvent(database, runtime, interactionRevision, 'live.interaction.changed', {
          interactionRevision,
          liveInteraction: readV2LiveInteraction(database, runtime.resetEpoch),
        }, timestamp)
      } else if (request.command === 'CAST_AUDIENCE_VOTE') {
        const live = readLiveInteractionRow(database, runtime.resetEpoch)
        if (live.phase !== 'VOTE_OPEN' || live.segmentCode !== 'B' || currentInteractionCode(database) !== 'B') {
          throw new V2ParticipantCommandError('SCENE_ACTION_INVALID', '观众投票尚未开放或已经结束。', 409, runtime.resetEpoch)
        }
        const existingVote = database.prepare(`SELECT 1 FROM v2_audience_votes
          WHERE reset_epoch = ? AND round_number = ? AND identity_id = ?`)
          .get(runtime.resetEpoch, live.roundNumber, identityId)
        if (existingVote) throw new V2ParticipantCommandError('SCENE_ACTION_INVALID', '本轮已经投过票。', 409, runtime.resetEpoch)
        const candidate = database.prepare(`SELECT draw.identity_id AS identityId
          FROM v2_raffle_draws draw JOIN v2_identity_slots slot ON slot.identity_id = draw.identity_id
          WHERE draw.reset_epoch = ? AND slot.public_star_id = ? AND draw.draw_sequence <= 12`)
          .get(runtime.resetEpoch, request.candidateStarId) as { identityId: string } | undefined
        if (!candidate) throw new V2ParticipantCommandError('RESOURCE_NOT_FOUND', '该星号不在本轮上台候选中。', 404, runtime.resetEpoch)
        database.prepare(`INSERT INTO v2_audience_votes (
          id, reset_epoch, round_number, identity_id, candidate_identity_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`).run(`vote:${randomUUID()}`, runtime.resetEpoch,
          live.roundNumber, identityId, candidate.identityId, timestamp)
        const interaction = interactionState(database, runtime.resetEpoch)
        const interactionRevision = interaction.interactionRevision + 1
        database.prepare(`UPDATE v2_live_interaction_state SET revision = ?, updated_at = ?
          WHERE reset_epoch = ?`).run(interactionRevision, timestamp, runtime.resetEpoch)
        database.prepare(`UPDATE v2_screen_interaction_state SET interaction_revision = ?,
          updated_at = ? WHERE reset_epoch = ?`).run(interactionRevision, timestamp, runtime.resetEpoch)
        database.prepare(`UPDATE v2_participant_states SET participant_revision = ?, updated_at = ?
          WHERE reset_epoch = ? AND identity_id = ?`).run(revision, timestamp, runtime.resetEpoch, identityId)
        appendInteractionEvent(database, runtime, interactionRevision, 'live.interaction.changed', {
          interactionRevision,
          liveInteraction: readV2LiveInteraction(database, runtime.resetEpoch),
        }, timestamp)
      } else {
        if (participant.cooperativeLightAt !== null) {
          throw new V2ParticipantCommandError(
            'SCENE_ACTION_INVALID',
            '协同点亮已经完成。',
            409,
            runtime.resetEpoch,
          )
        }
        database.prepare(
          `UPDATE v2_participant_states SET participant_revision = ?,
             cooperative_light_at = ?, starlight = ?, updated_at = ?
           WHERE reset_epoch = ? AND identity_id = ?`,
        ).run(revision, timestamp, nextStarlight, timestamp, runtime.resetEpoch, identityId)
        database.prepare(
          `INSERT INTO v2_reward_ledger (
             reset_epoch, identity_id, event_key, delta, reward_rule_version, created_at
           ) VALUES (?, ?, 'COOPERATIVE_LIGHT', 0, ?, ?)`,
        ).run(runtime.resetEpoch, identityId, runtime.rewardRuleVersion, timestamp)
        firstReward = true
      }
      appendParticipantEvent(database, identityId, runtime.resetEpoch, revision, timestamp)
      aggregateChanged =
        request.command === 'START_STAR' ||
        request.command === 'COOPERATIVE_LIGHT' || firstReward
    } else if (request.command === 'LOCK_COLOR') {
      if (participant.onboardingState !== 'NEEDS_COLOR') {
        throw new V2ParticipantCommandError(
          'ONBOARDING_STATE_INVALID',
          '恒星颜色已经锁定，不能改为其他颜色。',
          409,
          runtime.resetEpoch,
        )
      } else {
        const revision = participant.participantRevision + 1
        const displayColor = displayColorForKelvin(
          request.colorTemperatureKelvin,
        )
        database
          .prepare(
            `UPDATE v2_participant_states
             SET participant_revision = ?, onboarding_state = 'ADMITTED',
                 color_temperature_kelvin = ?, display_color = ?,
                 color_locked_at = ?, capsule_decision = 'SKIPPED',
                 capsule_skipped_at = ?, admitted_at = ?, admitted_scene = ?,
                 admitted_run_revision = ?, updated_at = ?
             WHERE identity_id = ? AND reset_epoch = ?`,
          )
          .run(
            revision,
            request.colorTemperatureKelvin,
            displayColor,
            timestamp,
            timestamp,
            timestamp,
            runtime.currentScene,
            runtime.runRevision,
            timestamp,
            identityId,
            runtime.resetEpoch,
          )
        database
          .prepare(
            `INSERT INTO v2_public_stars (
               identity_id, reset_epoch, public_star_id,
               color_temperature_kelvin, display_color, formation_slot,
               started, star_revision, updated_at
             ) SELECT ?, ?, public_star_id, ?, ?, formation_slot, 0, 1, ?
               FROM v2_identity_slots WHERE identity_id = ?`,
          )
          .run(
            identityId,
            runtime.resetEpoch,
            request.colorTemperatureKelvin,
            displayColor,
            timestamp,
            identityId,
          )
        appendStarEvent(database, runtime, identityId, timestamp)
        appendParticipantEvent(
          database,
          identityId,
          runtime.resetEpoch,
          revision,
          timestamp,
        )
        aggregateChanged = true
      }
    }

    if (aggregateChanged) appendAggregateEvents(database, runtime, now)
    const currentRuntime = readRuntime(database)
    const response = V2ParticipantCommandResponseSchema.parse({
      status: 'ok',
      protocolVersion: '2',
      resetEpoch: currentRuntime.resetEpoch,
      command: request.command,
      replayed: false,
      runtime: runtimeTuple(currentRuntime),
      presentation: presentationFor(database, currentRuntime),
      presentationRevision: currentRuntime.presentationRevision,
      currentProgram: readCurrentV2Program(database),
      liveInteraction: readV2LiveInteraction(database, currentRuntime.resetEpoch, { identityId }),
      participant: participantProjection(database, currentRuntime, identityId),
    })
    saveIdempotency(database, {
      resetEpoch: runtime.resetEpoch,
      scope,
      keyDigest: idempotency.keyDigest,
      request,
      body: response,
      now,
    })
    database.exec('COMMIT')
    return response
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw error
  }
}
