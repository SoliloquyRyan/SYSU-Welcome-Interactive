import { createHash, randomBytes, randomUUID } from 'node:crypto'

import {
  ApiErrorResponseSchema,
  type AdminRole,
  type AdminSnapshot,
  type ParticipantSnapshot,
  type RuntimeAction,
} from '@sysu-welcome/contracts'

import {
  createSession,
  replaceAdminSessionRoles,
  type AuthenticatedSession,
  type CreatedSession,
} from '../auth/session.js'
import type { AppConfig } from '../config.js'
import type { SqliteDatabase } from '../db/open-database.js'
import {
  type DemoCredentialContext,
  invitationTokenDigest,
  restoreDemoSeedCatalogInTransaction,
  verifyAdminPasswordCredential,
  verifyDemoCodeCredential,
} from '../db/seed.js'
import { ApiError } from '../http/api-error.js'
import {
  appendDomainEvent,
  createParticipantPublicAlias,
  type StoredRealtimeEvent,
} from '../realtime/events.js'
import {
  assertIdempotencyRequestCompatible,
  executeIdempotentCommand,
  requireIdempotencyKey,
  type IdempotentCommandResult,
} from './idempotency.js'
import {
  assertCommandVersion,
  readAdminSnapshot,
  readAggregateEventPayload,
  readAggregateState,
  readParticipantSnapshot,
  readRuntimeContext,
  requireAdminRole,
  requireCapsuleMessageStage,
  requireParticipantStage,
} from './business-state.js'

type Version = { resetEpoch: number; stageRevision: number }

export interface ActivationResult {
  snapshot: ParticipantSnapshot
  session: CreatedSession
  events: StoredRealtimeEvent[]
}

export interface AdminLoginResult {
  snapshot: AdminSnapshot
  session: CreatedSession
}

export interface BusinessErrorBody {
  status: 'error'
  error: { code: string; message: string; requestId: string }
  resetEpoch?: number
  stageRevision?: number
}

function insertLedger(
  database: SqliteDatabase,
  input: {
    identityId: string
    businessKey: string
    reason:
      | 'ACTIVATION'
      | 'CAPSULE_MESSAGE'
      | 'STAR_STARTED'
      | 'FIRST_GIFT'
      | 'FIRST_BARRAGE'
      | 'COOPERATIVE_LIGHT'
      | 'GIFT_SPEND'
    powerDelta?: number
    starlightDelta?: number
    powerAfter: number
    starlightAfter: number
    createdAt: string
  },
): void {
  database
    .prepare(
      `INSERT INTO value_ledger (
         identity_id, business_key, reason, power_delta, starlight_delta,
         power_balance_after, starlight_after, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.identityId,
      input.businessKey,
      input.reason,
      input.powerDelta ?? 0,
      input.starlightDelta ?? 0,
      input.powerAfter,
      input.starlightAfter,
      input.createdAt,
    )
}

function aggregateEvent(
  database: SqliteDatabase,
  committedAt: string,
  type: 'aggregate.updated' | 'cooperation.updated' = 'aggregate.updated',
): StoredRealtimeEvent {
  return appendDomainEvent(database, {
    stream: 'screen',
    type,
    committedAt,
    payload: readAggregateEventPayload(database),
  })
}

function participantInvalidationEvents(
  database: SqliteDatabase,
  identityId: string,
  committedAt: string,
  reason: string,
): StoredRealtimeEvent[] {
  const privateEvent = appendDomainEvent(database, {
    stream: 'participant',
    type: 'participant.snapshot.changed',
    committedAt,
    audienceSubjectId: identityId,
    payload: {
      reason,
      publicAggregate: readAggregateEventPayload(database),
    },
  })
  return [
    createParticipantPublicAlias(privateEvent, identityId),
    privateEvent,
  ]
}

function recordActivationAttempt(
  database: SqliteDatabase,
  outcome: 'SUCCESS' | 'INVALID' | 'REVOKED' | 'LOCKED',
  requestId: string,
  now: Date,
): void {
  database
    .prepare(
      `INSERT INTO activation_attempts (outcome, request_id, created_at)
       VALUES (?, ?, ?)`,
    )
    .run(outcome, requestId, now.toISOString())
}

function genericActivationFailure(): ApiError {
  return new ApiError(
    'AUTH_REQUIRED',
    '入口或核验信息无效，请重新轻触或扫码后再试。',
    401,
  )
}

export function activateParticipant(
  database: SqliteDatabase,
  credentialContext: DemoCredentialContext,
  request: { token: string; displayName: string; demoCode: string },
  idempotencyKey: string,
  requestId: string,
  now: Date = new Date(),
): ActivationResult {
  const identity = database
    .prepare(
      `SELECT i.id, i.display_name AS displayName,
              i.demo_code_digest AS demoCodeDigest,
              i.enabled, t.status AS invitationStatus
       FROM invitation_tokens t
       JOIN synthetic_identities i ON i.id = t.identity_id
       WHERE t.token_digest = ?`,
    )
    .get(invitationTokenDigest(request.token)) as
    | {
        id: string
        displayName: string
        demoCodeDigest: string
        enabled: number
        invitationStatus: 'ACTIVE' | 'REVOKED'
      }
    | undefined

  if (!identity || identity.enabled !== 1) {
    recordActivationAttempt(database, 'INVALID', requestId, now)
    throw genericActivationFailure()
  }
  if (identity.invitationStatus !== 'ACTIVE') {
    recordActivationAttempt(database, 'REVOKED', requestId, now)
    throw genericActivationFailure()
  }
  assertIdempotencyRequestCompatible(database, {
    scope: `participant:activate:${identity.id}`,
    key: idempotencyKey,
    request,
  })
  const validCode = verifyDemoCodeCredential(
    credentialContext,
    identity.id,
    request.demoCode,
    identity.demoCodeDigest,
  )
  if (identity.displayName !== request.displayName.trim() || !validCode) {
    recordActivationAttempt(database, 'INVALID', requestId, now)
    throw genericActivationFailure()
  }

  const existing = database
    .prepare('SELECT 1 AS present FROM participant_states WHERE identity_id = ?')
    .get(identity.id) as { present: number } | undefined
  const runtimeBefore = readRuntimeContext(database)
  if (!existing) {
    const canCreate =
      runtimeBefore.stage === 1 &&
      (runtimeBefore.status === 'READY' || runtimeBefore.status === 'RUNNING')
    if (!canCreate) {
      recordActivationAttempt(database, 'LOCKED', requestId, now)
      throw new ApiError(
        'STAGE_LOCKED',
        '当前不再接受新的参与者激活。',
        409,
        runtimeBefore,
      )
    }
  }

  const command = executeIdempotentCommand(database, {
    scope: `participant:activate:${identity.id}`,
    key: idempotencyKey,
    request,
    now,
    operation: ({ now: commandNow }) => {
      const timestamp = commandNow.toISOString()
      const participantExists = database
        .prepare('SELECT 1 AS present FROM participant_states WHERE identity_id = ?')
        .get(identity.id) as { present: number } | undefined
      const events: StoredRealtimeEvent[] = []
      if (!participantExists) {
        database
          .prepare(
            `INSERT INTO participant_states (
               identity_id, source_id, power_balance, starlight,
               capsule_message, capsule_message_submitted_at,
               capsule_public_notice_at, capsule_candidate_status,
               star_created_at, star_started_at, first_gift_at,
               first_barrage_at, cooperative_light_at,
               activated_at, updated_at
             ) VALUES (
               ?, ?, 100, 20, NULL, NULL, NULL, 'NOT_SUBMITTED',
               ?, NULL, NULL, NULL, NULL, ?, ?
             )`,
          )
          .run(
            identity.id,
            `source-${randomBytes(12).toString('hex')}`,
            timestamp,
            timestamp,
            timestamp,
          )
        insertLedger(database, {
          identityId: identity.id,
          businessKey: `activation:${identity.id}`,
          reason: 'ACTIVATION',
          powerDelta: 100,
          starlightDelta: 20,
          powerAfter: 100,
          starlightAfter: 20,
          createdAt: timestamp,
        })
        const count = (
          database.prepare('SELECT COUNT(*) AS count FROM participant_states').get() as {
            count: number
          }
        ).count
        events.push(
          appendDomainEvent(database, {
            stream: 'screen',
            type: 'participant.activated',
            committedAt: timestamp,
            payload: { activatedCount: count },
          }),
          aggregateEvent(database, timestamp),
        )
      }
      return {
        body: readParticipantSnapshot(database, identity.id, commandNow),
        events,
      }
    },
    onReplay: () => readParticipantSnapshot(database, identity.id, now),
  })

  recordActivationAttempt(database, 'SUCCESS', requestId, now)
  const runtime = readRuntimeContext(database)
  const session = createSession(database, {
    type: 'PARTICIPANT',
    subjectId: identity.id,
    resetEpoch: runtime.resetEpoch,
    now,
  })
  return { snapshot: command.body, session, events: command.events }
}

export function loginAdmin(
  database: SqliteDatabase,
  credentialContext: DemoCredentialContext,
  request: { username: string; password: string },
  now: Date = new Date(),
): AdminLoginResult {
  const account = database
    .prepare(
      `SELECT id, username, password_digest AS passwordDigest, enabled
       FROM admin_accounts WHERE username = ?`,
    )
    .get(request.username.trim()) as
    | { id: string; username: string; passwordDigest: string; enabled: number }
    | undefined
  const valid =
    account?.enabled === 1 &&
    verifyAdminPasswordCredential(
      credentialContext,
      account.id,
      request.password,
      account.passwordDigest,
    )
  if (!account || !valid) {
    throw new ApiError('AUTH_REQUIRED', '账号或密码无效。', 401)
  }
  const runtime = readRuntimeContext(database)
  const session = createSession(database, {
    type: 'ADMIN',
    subjectId: account.id,
    roles: [],
    resetEpoch: runtime.resetEpoch,
    now,
  })
  return { snapshot: readAdminSnapshot(database, session, now), session }
}

function participantCommand(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  scope: string,
  key: string,
  request: Version & Record<string, unknown>,
  now: Date,
  operation: (context: {
    keyDigest: string
    now: Date
    runtime: ReturnType<typeof readRuntimeContext>
  }) => StoredRealtimeEvent[],
): IdempotentCommandResult<ParticipantSnapshot> {
  const result = executeIdempotentCommand(database, {
    scope: `${scope}:${session.subjectId}`,
    key,
    request,
    now,
    operation: ({ keyDigest, now: commandNow }) => {
      const runtime = readRuntimeContext(database)
      assertCommandVersion(runtime, request)
      const events = operation({ keyDigest, now: commandNow, runtime })
      if (events.length > 0) {
        events.push(
          ...participantInvalidationEvents(
            database,
            session.subjectId,
            commandNow.toISOString(),
            scope,
          ),
        )
      }
      return {
        body: readParticipantSnapshot(database, session.subjectId, commandNow),
        events,
      }
    },
  })
  return result
}

export function submitCapsuleMessage(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  request: Version & { text: string; publicDisplayNoticeAccepted: true },
  key: string,
  now: Date = new Date(),
) {
  return participantCommand(
    database,
    session,
    'participant:capsule-message',
    key,
    request,
    now,
    ({ now: commandNow, runtime }) => {
      requireCapsuleMessageStage(runtime)
      const timestamp = commandNow.toISOString()
      const state = database
        .prepare(
          `SELECT power_balance AS powerBalance, starlight,
                  capsule_message_submitted_at AS submittedAt
           FROM participant_states WHERE identity_id = ?`,
        )
        .get(session.subjectId) as {
        powerBalance: number
        starlight: number
        submittedAt: string | null
      }
      const reward = state.submittedAt === null ? 20 : 0
      const nextStarlight = Math.min(100, state.starlight + reward)
      database
        .prepare(
          `UPDATE participant_states
           SET capsule_message = ?,
               capsule_message_submitted_at = COALESCE(capsule_message_submitted_at, ?),
               capsule_public_notice_at = COALESCE(capsule_public_notice_at, ?),
               capsule_candidate_status = 'SUBMITTED',
               starlight = ?, updated_at = ?
           WHERE identity_id = ?`,
        )
        .run(
          request.text,
          timestamp,
          timestamp,
          nextStarlight,
          timestamp,
          session.subjectId,
        )
      if (reward > 0) {
        insertLedger(database, {
          identityId: session.subjectId,
          businessKey: `reward:capsule-message:${session.subjectId}`,
          reason: 'CAPSULE_MESSAGE',
          starlightDelta: reward,
          powerAfter: state.powerBalance,
          starlightAfter: nextStarlight,
          createdAt: timestamp,
        })
        return [aggregateEvent(database, timestamp)]
      }
      // The event contains only anonymous totals and prompts another device
      // belonging to the same participant to refresh its capsule snapshot.
      return [aggregateEvent(database, timestamp)]
    },
  )
}

export function lockStarTemperature(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  request: Version & { temperatureKelvin: number },
  key: string,
  now: Date = new Date(),
) {
  return participantCommand(
    database,
    session,
    'participant:star-temperature',
    key,
    request,
    now,
    ({ now: commandNow, runtime }) => {
      const state = database
        .prepare(
          `SELECT star_temperature_kelvin AS temperatureKelvin,
                  star_temperature_locked_at AS lockedAt
           FROM participant_states WHERE identity_id = ?`,
        )
        .get(session.subjectId) as {
        temperatureKelvin: number | null
        lockedAt: string | null
      }
      if (state.lockedAt !== null) {
        if (state.temperatureKelvin === request.temperatureKelvin) return []
        throw new ApiError(
          'STAR_TEMPERATURE_LOCKED',
          '本场活动的恒星色温已经确认，重置 Demo 后才能重新选择。',
          409,
          runtime,
        )
      }
      const timestamp = commandNow.toISOString()
      database
        .prepare(
          `UPDATE participant_states
           SET star_temperature_kelvin = ?,
               star_temperature_locked_at = ?, updated_at = ?
           WHERE identity_id = ? AND star_temperature_locked_at IS NULL`,
        )
        .run(
          request.temperatureKelvin,
          timestamp,
          timestamp,
          session.subjectId,
        )
      return [aggregateEvent(database, timestamp)]
    },
  )
}

export function startStar(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  request: Version,
  key: string,
  now: Date = new Date(),
) {
  return participantCommand(
    database,
    session,
    'participant:star-start',
    key,
    request,
    now,
    ({ now: commandNow, runtime }) => {
      requireParticipantStage(runtime, 3)
      const timestamp = commandNow.toISOString()
      const state = database
        .prepare(
          `SELECT p.power_balance AS powerBalance, p.starlight,
                  p.star_started_at AS startedAt,
                  i.public_star_id AS publicStarId
           FROM participant_states p
           JOIN synthetic_identities i ON i.id = p.identity_id
           WHERE p.identity_id = ?`,
        )
        .get(session.subjectId) as {
        powerBalance: number
        starlight: number
        startedAt: string | null
        publicStarId: string
      }
      if (state.startedAt) return []
      const nextStarlight = Math.min(100, state.starlight + 20)
      database
        .prepare(
          `UPDATE participant_states
           SET star_started_at = ?, starlight = ?, updated_at = ?
           WHERE identity_id = ? AND star_started_at IS NULL`,
        )
        .run(timestamp, nextStarlight, timestamp, session.subjectId)
      insertLedger(database, {
        identityId: session.subjectId,
        businessKey: `reward:star:${session.subjectId}`,
        reason: 'STAR_STARTED',
        starlightDelta: 20,
        powerAfter: state.powerBalance,
        starlightAfter: nextStarlight,
        createdAt: timestamp,
      })
      const started = readAggregateState(database).starStartedCount
      return [
        appendDomainEvent(database, {
          stream: 'screen',
          type: 'star.started',
          committedAt: timestamp,
          payload: { publicStarId: state.publicStarId, starStartedCount: started },
        }),
        aggregateEvent(database, timestamp),
      ]
    },
  )
}

export function sendGift(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  request: Version & { programId: string; giftId: string },
  key: string,
  now: Date = new Date(),
) {
  return participantCommand(
    database,
    session,
    'participant:gift',
    key,
    request,
    now,
    ({ keyDigest, now: commandNow, runtime }) => {
      requireParticipantStage(runtime, 4)
      if (runtime.currentProgramId !== request.programId) {
        throw new ApiError('STAGE_LOCKED', '该节目当前未开放应援。', 409, runtime)
      }
      const gift = database
        .prepare(
          `SELECT id, power_cost AS powerCost FROM gift_catalog
           WHERE id = ? AND enabled = 1`,
        )
        .get(request.giftId) as
        | { id: string; powerCost: 5 | 10 | 20 | 50 }
        | undefined
      if (!gift) {
        throw new ApiError('VALIDATION_FAILED', '虚拟礼物档位无效。', 400, runtime)
      }
      const state = database
        .prepare(
          `SELECT power_balance AS powerBalance, starlight,
                  first_gift_at AS firstGiftAt
           FROM participant_states WHERE identity_id = ?`,
        )
        .get(session.subjectId) as {
        powerBalance: number
        starlight: number
        firstGiftAt: string | null
      }
      if (state.powerBalance < gift.powerCost) {
        throw new ApiError(
          'INSUFFICIENT_BALANCE',
          '动力值不足，请选择其他礼物。',
          409,
          runtime,
        )
      }
      const timestamp = commandNow.toISOString()
      const nextPower = state.powerBalance - gift.powerCost
      const firstReward = state.firstGiftAt === null ? 10 : 0
      const nextStarlight = Math.min(100, state.starlight + firstReward)
      const transactionId = `gift-${randomUUID()}`
      database
        .prepare(
          `INSERT INTO gift_transactions (
             id, identity_id, program_id, gift_id, power_cost,
             command_key_digest, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          transactionId,
          session.subjectId,
          request.programId,
          request.giftId,
          gift.powerCost,
          keyDigest,
          timestamp,
        )
      database
        .prepare(
          `UPDATE participant_states
           SET power_balance = ?, starlight = ?,
               first_gift_at = COALESCE(first_gift_at, ?), updated_at = ?
           WHERE identity_id = ?`,
        )
        .run(nextPower, nextStarlight, timestamp, timestamp, session.subjectId)
      database
        .prepare(
          `UPDATE program_catalog SET heat = heat + ?, updated_at = ?
           WHERE id = ? AND enabled = 1`,
        )
        .run(gift.powerCost, timestamp, request.programId)
      insertLedger(database, {
        identityId: session.subjectId,
        businessKey: `gift-spend:${session.subjectId}:${keyDigest}`,
        reason: 'GIFT_SPEND',
        powerDelta: -gift.powerCost,
        powerAfter: nextPower,
        starlightAfter: state.starlight,
        createdAt: timestamp,
      })
      if (firstReward > 0) {
        insertLedger(database, {
          identityId: session.subjectId,
          businessKey: `reward:first-gift:${session.subjectId}`,
          reason: 'FIRST_GIFT',
          starlightDelta: firstReward,
          powerAfter: nextPower,
          starlightAfter: nextStarlight,
          createdAt: timestamp,
        })
      }
      const programHeat = (
        database.prepare('SELECT heat FROM program_catalog WHERE id = ?').get(
          request.programId,
        ) as { heat: number }
      ).heat
      return [
        appendDomainEvent(database, {
          stream: 'screen',
          type: 'gift.accepted',
          committedAt: timestamp,
          payload: {
            programId: request.programId,
            giftId: request.giftId,
            powerCost: gift.powerCost,
            programHeat,
          },
        }),
        aggregateEvent(database, timestamp),
      ]
    },
  )
}

const SENSITIVE_TERMS = ['辱骂', '暴力威胁', '违禁', '敏感词'] as const
const URL_PATTERN = /(?:https?:\/\/|www\.|(?:[a-z0-9-]+\.)+(?:com|cn|net|org|io|xyz)\b)/iu
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu
const CONTACT_PATTERN = /(?:微信|wechat|\bvx\b|qq|电话|手机号)\s*[:：号-]?\s*[a-z0-9_-]{4,}/iu

export function evaluateBarrageText(text: string): {
  normalized: string
  rejectionReason: string | null
} {
  const normalized = text.normalize('NFKC').trim()
  if (Array.from(normalized).length > 40) {
    return { normalized, rejectionReason: 'TOO_LONG' }
  }
  const compact = normalized.replace(/[\s-]/gu, '')
  if (/1[3-9]\d{9}/u.test(compact)) {
    return { normalized, rejectionReason: 'PHONE_NUMBER' }
  }
  if (URL_PATTERN.test(normalized)) {
    return { normalized, rejectionReason: 'LINK' }
  }
  if (EMAIL_PATTERN.test(normalized) || CONTACT_PATTERN.test(normalized)) {
    return { normalized, rejectionReason: 'CONTACT' }
  }
  const folded = normalized.toLocaleLowerCase('zh-CN')
  if (SENSITIVE_TERMS.some((term) => folded.includes(term))) {
    return { normalized, rejectionReason: 'SENSITIVE_TERM' }
  }
  return { normalized, rejectionReason: null }
}

function publicCommandError(
  code: 'CONTENT_REJECTED' | 'RATE_LIMITED' | 'SOURCE_BLOCKED' | 'RUNTIME_PAUSED',
  message: string,
  requestId: string,
  runtime: ReturnType<typeof readRuntimeContext>,
): BusinessErrorBody {
  return ApiErrorResponseSchema.parse({
    status: 'error',
    error: { code, message, requestId },
    resetEpoch: runtime.resetEpoch,
    stageRevision: runtime.stageRevision,
  }) as BusinessErrorBody
}

export function publishBarrage(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  request: Version & { text: string; publicNoticeAccepted: true },
  key: string,
  requestId: string,
  now: Date = new Date(),
): IdempotentCommandResult<ParticipantSnapshot | BusinessErrorBody> {
  return executeIdempotentCommand<ParticipantSnapshot | BusinessErrorBody>(database, {
    scope: `participant:barrage:${session.subjectId}`,
    key,
    request,
    now,
    operation: ({ keyDigest, now: commandNow }) => {
      const runtime = readRuntimeContext(database)
      assertCommandVersion(runtime, request)
      requireParticipantStage(runtime, 4)
      const timestamp = commandNow.toISOString()
      const participant = database
        .prepare(
          `SELECT source_id AS sourceId, power_balance AS powerBalance,
                  starlight, first_barrage_at AS firstBarrageAt
           FROM participant_states WHERE identity_id = ?`,
        )
        .get(session.subjectId) as {
        sourceId: string
        powerBalance: number
        starlight: number
        firstBarrageAt: string | null
      }
      const blocked = database
        .prepare('SELECT 1 AS present FROM blocked_sources WHERE identity_id = ?')
        .get(session.subjectId)
      if (blocked) {
        return {
          body: publicCommandError(
            'SOURCE_BLOCKED',
            '该匿名来源已被暂停发布公共内容。',
            requestId,
            runtime,
          ),
          statusCode: 403,
        }
      }
      if (runtime.barragePaused) {
        return {
          body: publicCommandError(
            'RUNTIME_PAUSED',
            '新弹幕发布已暂停。',
            requestId,
            runtime,
          ),
          statusCode: 409,
        }
      }
      const recent = (
        database
          .prepare(
            `SELECT COUNT(*) AS count FROM barrages
             WHERE identity_id = ?
               AND julianday(created_at) >= julianday(?) - (10.0 / 86400.0)`,
          )
          .get(session.subjectId, timestamp) as { count: number }
      ).count
      const content = evaluateBarrageText(request.text)
      const rateLimited = recent >= 3
      const rejectionReason = rateLimited ? 'RATE_LIMIT' : content.rejectionReason
      const id = `barrage-${randomUUID()}`
      const displayBatch = runtime.displayBatch
      if (rejectionReason) {
        database
          .prepare(
            `INSERT INTO barrages (
               id, identity_id, source_id, text, status, rejection_reason,
               command_key_digest, display_seq, display_batch,
               created_at, published_at, removed_at
             ) VALUES (?, ?, ?, ?, 'REJECTED_BY_RULE', ?, ?, NULL, ?, ?, NULL, NULL)`,
          )
          .run(
            id,
            session.subjectId,
            participant.sourceId,
            content.normalized,
            rejectionReason,
            keyDigest,
            displayBatch,
            timestamp,
          )
        return {
          body: publicCommandError(
            rateLimited ? 'RATE_LIMITED' : 'CONTENT_REJECTED',
            rateLimited
              ? '发送过于频繁，请稍后再试。'
              : '内容包含链接、联系方式或不适合公开展示的信息，请修改后重试。',
            requestId,
            runtime,
          ),
          statusCode: rateLimited ? 429 : 422,
        }
      }
      const displaySeq = (
        database.prepare(
          'SELECT COALESCE(MAX(display_seq), 0) + 1 AS next FROM barrages',
        ).get() as { next: number }
      ).next
      database
        .prepare(
          `INSERT INTO barrages (
             id, identity_id, source_id, text, status, rejection_reason,
             command_key_digest, display_seq, display_batch,
             created_at, published_at, removed_at
           ) VALUES (?, ?, ?, ?, 'PUBLISHED', NULL, ?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          id,
          session.subjectId,
          participant.sourceId,
          content.normalized,
          keyDigest,
          displaySeq,
          displayBatch,
          timestamp,
          timestamp,
        )
      const firstReward = participant.firstBarrageAt === null ? 10 : 0
      const nextStarlight = Math.min(100, participant.starlight + firstReward)
      database
        .prepare(
          `UPDATE participant_states
           SET first_barrage_at = COALESCE(first_barrage_at, ?),
               starlight = ?, updated_at = ? WHERE identity_id = ?`,
        )
        .run(timestamp, nextStarlight, timestamp, session.subjectId)
      if (firstReward > 0) {
        insertLedger(database, {
          identityId: session.subjectId,
          businessKey: `reward:first-barrage:${session.subjectId}`,
          reason: 'FIRST_BARRAGE',
          starlightDelta: firstReward,
          powerAfter: participant.powerBalance,
          starlightAfter: nextStarlight,
          createdAt: timestamp,
        })
      }
      const events = [
        appendDomainEvent(database, {
          stream: 'screen',
          type: 'barrage.published',
          committedAt: timestamp,
          payload: {
            barrage: { id, text: content.normalized, displaySeq, publishedAt: timestamp },
          },
        }),
        aggregateEvent(database, timestamp),
      ]
      events.push(
        ...participantInvalidationEvents(
          database,
          session.subjectId,
          timestamp,
          'participant:barrage',
        ),
      )
      return {
        body: readParticipantSnapshot(database, session.subjectId, commandNow),
        events,
      }
    },
  })
}

export function completeCooperativeLight(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  request: Version,
  key: string,
  now: Date = new Date(),
) {
  return participantCommand(
    database,
    session,
    'participant:cooperative-light',
    key,
    request,
    now,
    ({ now: commandNow, runtime }) => {
      requireParticipantStage(runtime, 5)
      const state = database
        .prepare(
          `SELECT power_balance AS powerBalance, starlight,
                  cooperative_light_at AS completedAt
           FROM participant_states WHERE identity_id = ?`,
        )
        .get(session.subjectId) as {
        powerBalance: number
        starlight: number
        completedAt: string | null
      }
      if (state.completedAt) return []
      const timestamp = commandNow.toISOString()
      const nextStarlight = Math.min(100, state.starlight + 20)
      database
        .prepare(
          `INSERT INTO cooperative_lights (identity_id, business_key, completed_at)
           VALUES (?, ?, ?)`,
        )
        .run(session.subjectId, `cooperation:${session.subjectId}`, timestamp)
      database
        .prepare(
          `UPDATE participant_states
           SET cooperative_light_at = ?, starlight = ?, updated_at = ?
           WHERE identity_id = ?`,
        )
        .run(timestamp, nextStarlight, timestamp, session.subjectId)
      insertLedger(database, {
        identityId: session.subjectId,
        businessKey: `reward:cooperation:${session.subjectId}`,
        reason: 'COOPERATIVE_LIGHT',
        starlightDelta: 20,
        powerAfter: state.powerBalance,
        starlightAfter: nextStarlight,
        createdAt: timestamp,
      })
      return [aggregateEvent(database, timestamp, 'cooperation.updated')]
    },
  )
}

function recordAdminOperation(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  action: string,
  result: string,
  requestId: string,
  timestamp: string,
): void {
  database
    .prepare(
      `INSERT INTO admin_operation_records (
         session_short_id, roles_json, action, result, request_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      session.shortId,
      JSON.stringify(session.roles),
      action,
      result,
      requestId,
      timestamp,
    )
}

function adminCommand(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  scope: string,
  key: string,
  request: Version & Record<string, unknown>,
  requestId: string,
  now: Date,
  operation: (context: {
    keyDigest: string
    now: Date
    runtime: ReturnType<typeof readRuntimeContext>
  }) => { events?: StoredRealtimeEvent[]; session?: AuthenticatedSession },
) {
  return executeIdempotentCommand(database, {
    scope: `${scope}:${session.id}`,
    key,
    request,
    now,
    operation: ({ keyDigest, now: commandNow }) => {
      const runtime = readRuntimeContext(database)
      assertCommandVersion(runtime, request)
      const result = operation({ keyDigest, now: commandNow, runtime })
      const effectiveSession = result.session ?? session
      recordAdminOperation(
        database,
        effectiveSession,
        scope,
        'SUCCESS',
        requestId,
        commandNow.toISOString(),
      )
      return {
        body: readAdminSnapshot(database, effectiveSession, commandNow),
        events: result.events ?? [],
      }
    },
  })
}

export function updateAdminRoles(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  request: Version & { roles: AdminRole[] },
  key: string,
  requestId: string,
  now: Date = new Date(),
) {
  return adminCommand(
    database,
    session,
    'admin:roles',
    key,
    request,
    requestId,
    now,
    ({ now: commandNow }) => {
      const roles = replaceAdminSessionRoles(database, session.id, request.roles)
      return {
        session: { ...session, roles },
        events: [aggregateEvent(database, commandNow.toISOString())],
      }
    },
  )
}

export function controlRuntime(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  request: Version & {
    action: RuntimeAction
    mode?: 'REHEARSAL' | 'LIVE' | undefined
    targetStage?: number | undefined
    programId?: string | undefined
    confirmed: boolean
  },
  key: string,
  requestId: string,
  now: Date = new Date(),
) {
  requireAdminRole(session, 'STAGE_CONTROLLER')
  return adminCommand(
    database,
    session,
    'admin:runtime',
    key,
    request,
    requestId,
    now,
    ({ now: commandNow, runtime }) => {
      const timestamp = commandNow.toISOString()
      let mode = runtime.mode
      let status = runtime.status
      let stage = runtime.stage
      let currentProgramId = runtime.currentProgramId
      let eventType: 'runtime.stage.changed' | 'runtime.status.changed' | 'program.changed'

      switch (request.action) {
        case 'SET_MODE':
          if (!request.confirmed || !request.mode || runtime.status !== 'READY') {
            throw new ApiError('STAGE_LOCKED', '只有 READY 状态可确认切换模式。', 409, runtime)
          }
          mode = request.mode
          eventType = 'runtime.stage.changed'
          break
        case 'START':
          if (runtime.status !== 'READY') {
            throw new ApiError('STAGE_LOCKED', '当前状态不能开始。', 409, runtime)
          }
          status = 'RUNNING'
          eventType = 'runtime.status.changed'
          break
        case 'PAUSE':
          if (runtime.status !== 'RUNNING') {
            throw new ApiError('STAGE_LOCKED', '只有运行中可以暂停。', 409, runtime)
          }
          status = 'PAUSED'
          eventType = 'runtime.status.changed'
          break
        case 'RESUME':
          if (runtime.status !== 'PAUSED') {
            throw new ApiError('STAGE_LOCKED', '当前状态不能恢复。', 409, runtime)
          }
          status = 'RUNNING'
          eventType = 'runtime.status.changed'
          break
        case 'JUMP':
          if (
            runtime.mode !== 'REHEARSAL' ||
            runtime.status !== 'RUNNING' ||
            !request.targetStage
          ) {
            throw new ApiError('STAGE_LOCKED', '排练运行中才可跳转阶段。', 409, runtime)
          }
          stage = request.targetStage
          eventType = 'runtime.stage.changed'
          break
        case 'ADVANCE':
          if (
            !request.confirmed ||
            runtime.mode !== 'LIVE' ||
            runtime.status !== 'RUNNING' ||
            runtime.stage >= 6
          ) {
            throw new ApiError('STAGE_LOCKED', '现场模式只能向下一阶段推进。', 409, runtime)
          }
          stage = runtime.stage + 1
          eventType = 'runtime.stage.changed'
          break
        case 'COMPLETE':
          if (
            !request.confirmed ||
            runtime.status !== 'RUNNING' ||
            runtime.stage !== 6
          ) {
            throw new ApiError('STAGE_LOCKED', '只有第 6 阶段可确认完成。', 409, runtime)
          }
          status = 'COMPLETED'
          eventType = 'runtime.status.changed'
          break
        case 'SET_PROGRAM': {
          if (runtime.status !== 'RUNNING' || runtime.stage !== 4 || !request.programId) {
            throw new ApiError('STAGE_LOCKED', '节目只可在第 4 阶段切换。', 409, runtime)
          }
          const program = database
            .prepare(
              `SELECT target.id, target.sort_order AS targetOrder,
                      current.sort_order AS currentOrder
               FROM program_catalog target
               LEFT JOIN program_catalog current ON current.id = ?
               WHERE target.id = ? AND target.enabled = 1`,
            )
            .get(runtime.currentProgramId, request.programId) as
            | { id: string; targetOrder: number; currentOrder: number | null }
            | undefined
          if (!program) {
            throw new ApiError('VALIDATION_FAILED', '节目不存在或未启用。', 400, runtime)
          }
          if (
            runtime.mode === 'LIVE' &&
            program.currentOrder !== null &&
            program.targetOrder <= program.currentOrder
          ) {
            throw new ApiError('STAGE_LOCKED', '现场节目只能向前切换。', 409, runtime)
          }
          currentProgramId = request.programId
          eventType = 'program.changed'
          break
        }
      }

      database
        .prepare(
          `UPDATE runtime_state
           SET mode = ?, status = ?, stage = ?,
               stage_revision = stage_revision + 1, updated_at = ?
           WHERE id = 1`,
        )
        .run(mode, status, stage, timestamp)
      if (currentProgramId !== runtime.currentProgramId) {
        database
          .prepare(
            `UPDATE program_runtime_state
             SET current_program_id = ?, updated_at = ? WHERE id = 1`,
          )
          .run(currentProgramId, timestamp)
      }
      const revision = runtime.stageRevision + 1
      const payload =
        eventType === 'program.changed'
          ? { programId: currentProgramId, stageRevision: revision }
          : eventType === 'runtime.status.changed'
            ? { mode, status, stage, stageRevision: revision }
            : { mode, status, stage, stageRevision: revision, currentProgramId }
      return {
        events: [
          appendDomainEvent(database, {
            stream: 'screen',
            type: eventType,
            committedAt: timestamp,
            payload,
          }),
        ],
      }
    },
  )
}

export function removeBarrage(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  barrageId: string,
  request: Version & { confirmed: boolean },
  key: string,
  requestId: string,
  now: Date = new Date(),
) {
  requireAdminRole(session, 'REVIEWER')
  return adminCommand(
    database,
    session,
    `admin:barrage-remove:${barrageId}`,
    key,
    request,
    requestId,
    now,
    ({ now: commandNow }) => {
      const timestamp = commandNow.toISOString()
      const changed = database
        .prepare(
          `UPDATE barrages SET status = 'REMOVED', removed_at = ?
           WHERE id = ? AND status = 'PUBLISHED'`,
        )
        .run(timestamp, barrageId).changes
      return {
        events:
          changed === 1
            ? [
                appendDomainEvent(database, {
                  stream: 'screen',
                  type: 'barrage.removed',
                  committedAt: timestamp,
                  payload: { barrageIds: [barrageId] },
                }),
              ]
            : [],
      }
    },
  )
}

export function blockBarrageSource(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  sourceId: string,
  request: Version & { confirmed: boolean },
  key: string,
  requestId: string,
  now: Date = new Date(),
) {
  requireAdminRole(session, 'REVIEWER')
  return adminCommand(
    database,
    session,
    `admin:source-block:${sourceId}`,
    key,
    request,
    requestId,
    now,
    ({ now: commandNow }) => {
      const timestamp = commandNow.toISOString()
      const source = database
        .prepare(
          `SELECT identity_id AS identityId FROM participant_states
           WHERE source_id = ?`,
        )
        .get(sourceId) as { identityId: string } | undefined
      if (!source) {
        throw new ApiError('VALIDATION_FAILED', '匿名来源不存在。', 404)
      }
      database
        .prepare(
          `INSERT INTO blocked_sources (
             identity_id, source_id, blocked_by_session_short_id, blocked_at
           ) VALUES (?, ?, ?, ?)
           ON CONFLICT(identity_id) DO NOTHING`,
        )
        .run(source.identityId, sourceId, session.shortId, timestamp)
      const ids = (
        database
          .prepare(
            `SELECT id FROM barrages
             WHERE identity_id = ? AND status = 'PUBLISHED'`,
          )
          .all(source.identityId) as Array<{ id: string }>
      ).map(({ id }) => id)
      database
        .prepare(
          `UPDATE barrages SET status = 'REMOVED', removed_at = ?
           WHERE identity_id = ? AND status = 'PUBLISHED'`,
        )
        .run(timestamp, source.identityId)
      return {
        events: [
          appendDomainEvent(database, {
            stream: 'screen',
            type: 'source.blocked',
            committedAt: timestamp,
            payload: { sourceId, barrageIds: ids },
          }),
        ],
      }
    },
  )
}

export function setBarragePaused(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  request: Version & { paused: boolean },
  key: string,
  requestId: string,
  now: Date = new Date(),
) {
  requireAdminRole(session, 'REVIEWER')
  return adminCommand(
    database,
    session,
    'admin:barrage-pause',
    key,
    request,
    requestId,
    now,
    ({ now: commandNow, runtime }) => {
      const timestamp = commandNow.toISOString()
      if (runtime.barragePaused === request.paused) return {}
      database
        .prepare(
          `UPDATE runtime_state SET barrage_paused = ?,
             stage_revision = stage_revision + 1, updated_at = ? WHERE id = 1`,
        )
        .run(request.paused ? 1 : 0, timestamp)
      return {
        events: [
          appendDomainEvent(database, {
            stream: 'screen',
            type: 'barrage.pause.changed',
            committedAt: timestamp,
            payload: {
              paused: request.paused,
              stageRevision: runtime.stageRevision + 1,
            },
          }),
        ],
      }
    },
  )
}

export function clearBarrages(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  request: Version & { confirmed: boolean },
  key: string,
  requestId: string,
  now: Date = new Date(),
) {
  requireAdminRole(session, 'DEMO_ADMIN')
  if (!request.confirmed) {
    throw new ApiError('VALIDATION_FAILED', '紧急清屏需要确认。', 400)
  }
  return adminCommand(
    database,
    session,
    'admin:barrage-clear',
    key,
    request,
    requestId,
    now,
    ({ now: commandNow, runtime }) => {
      const timestamp = commandNow.toISOString()
      database
        .prepare(
          `UPDATE barrages SET status = 'REMOVED', removed_at = ?
           WHERE status = 'PUBLISHED'`,
        )
        .run(timestamp)
      const displayBatch = runtime.displayBatch + 1
      database
        .prepare(
          `UPDATE runtime_state
           SET display_batch = ?, stage_revision = stage_revision + 1,
               updated_at = ? WHERE id = 1`,
        )
        .run(displayBatch, timestamp)
      return {
        events: [
          appendDomainEvent(database, {
            stream: 'screen',
            type: 'barrage.cleared',
            committedAt: timestamp,
            payload: {
              displayBatch,
              stageRevision: runtime.stageRevision + 1,
            },
          }),
        ],
      }
    },
  )
}

export function setInvitationStatus(
  database: SqliteDatabase,
  session: AuthenticatedSession,
  invitationId: string,
  request: Version & { status: 'ACTIVE' | 'REVOKED'; confirmed: true },
  key: string,
  requestId: string,
  now: Date = new Date(),
) {
  requireAdminRole(session, 'DEMO_ADMIN')
  return adminCommand(
    database,
    session,
    `admin:invitation-status:${invitationId}`,
    key,
    request,
    requestId,
    now,
    ({ now: commandNow }) => {
      const changed = database
        .prepare(
          `UPDATE invitation_tokens SET status = ?, updated_at = ? WHERE id = ?`,
        )
        .run(request.status, commandNow.toISOString(), invitationId).changes
      if (changed !== 1) {
        throw new ApiError('VALIDATION_FAILED', '邀请入口不存在。', 404)
      }
      return {
        events: [aggregateEvent(database, commandNow.toISOString())],
      }
    },
  )
}

function stableJson(value: unknown): string {
  const stable = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(stable)
    if (entry && typeof entry === 'object') {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, stable(child)]),
      )
    }
    return entry
  }
  return JSON.stringify(stable(value))
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function resetDemoFromAdmin(
  database: SqliteDatabase,
  config: AppConfig,
  session: AuthenticatedSession,
  request: Version & { confirmation: 'RESET DEMO' },
  keyValue: string,
  requestId: string,
  now: Date = new Date(),
): {
  body: { status: 'ok'; resetEpoch: number }
  events: StoredRealtimeEvent[]
  session: CreatedSession
  replayed: boolean
} {
  requireAdminRole(session, 'DEMO_ADMIN')
  const key = requireIdempotencyKey(keyValue)
  const keyDigest = hash(key)
  const requestDigest = hash(stableJson(request))
  const timestamp = now.toISOString()
  const scope = 'admin:reset'

  database.exec('BEGIN IMMEDIATE')
  try {
    const runtime = readRuntimeContext(database)
    const prior = database
      .prepare(
        `SELECT request_digest AS requestDigest,
                response_body_json AS responseBodyJson
         FROM idempotency_records
         WHERE reset_epoch = ? AND scope = ? AND key_digest = ?`,
      )
      .get(runtime.resetEpoch, scope, keyDigest) as
      | { requestDigest: string; responseBodyJson: string }
      | undefined
    if (prior) {
      if (prior.requestDigest !== requestDigest) {
        throw new ApiError(
          'IDEMPOTENCY_CONFLICT',
          '该重置键已经用于不同请求。',
          409,
          runtime,
        )
      }
      database.exec('COMMIT')
      return {
        body: JSON.parse(prior.responseBodyJson) as {
          status: 'ok'
          resetEpoch: number
        },
        events: [],
        session: { ...session, secret: '' },
        replayed: true,
      }
    }

    assertCommandVersion(runtime, request)
    database
      .prepare('UPDATE app_state SET is_resetting = 1, updated_at = ? WHERE id = 1')
      .run(timestamp)
    restoreDemoSeedCatalogInTransaction(
      database,
      {
        manifestPath: config.seedManifestPath,
        participantCount: config.seedParticipantCount,
      },
      timestamp,
    )
    database.exec(`
      DELETE FROM blocked_sources;
      DELETE FROM cooperative_lights;
      DELETE FROM barrages;
      DELETE FROM gift_transactions;
      DELETE FROM value_ledger;
      DELETE FROM participant_states;
      DELETE FROM activation_attempts;
      DELETE FROM sessions;
      DELETE FROM idempotency_records;
      DELETE FROM domain_events;
      DELETE FROM admin_operation_records;
    `)
    database
      .prepare(
        `UPDATE runtime_state
         SET mode = 'REHEARSAL', status = 'READY', stage = 1,
             stage_revision = 0, display_batch = 0, barrage_paused = 0,
             updated_at = ? WHERE id = 1`,
      )
      .run(timestamp)
    database
      .prepare(
        `UPDATE app_state
         SET reset_epoch = reset_epoch + 1, event_seq = 0,
             is_resetting = 0, updated_at = ? WHERE id = 1`,
      )
      .run(timestamp)
    const resetEpoch = runtime.resetEpoch + 1
    const replacementSession = createSession(database, {
      type: 'ADMIN',
      subjectId: session.subjectId,
      roles: session.roles,
      resetEpoch,
      now,
    })
    const event = appendDomainEvent(database, {
      stream: 'screen',
      type: 'demo.reset',
      committedAt: timestamp,
      payload: { previousResetEpoch: runtime.resetEpoch },
    })
    const body = { status: 'ok' as const, resetEpoch }
    database
      .prepare(
        `INSERT INTO idempotency_records (
           reset_epoch, scope, key_digest, request_digest,
           response_status, response_body_json, created_at, expires_at
         ) VALUES (?, ?, ?, ?, 200, ?, ?, '9999-12-31T23:59:59.999Z')`,
      )
      .run(
        resetEpoch,
        scope,
        keyDigest,
        requestDigest,
        JSON.stringify(body),
        timestamp,
      )
    recordAdminOperation(
      database,
      replacementSession,
      'admin:reset',
      'SUCCESS',
      requestId,
      timestamp,
    )
    database.exec('COMMIT')
    return {
      body,
      events: [event],
      session: replacementSession,
      replayed: false,
    }
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw error
  }
}
