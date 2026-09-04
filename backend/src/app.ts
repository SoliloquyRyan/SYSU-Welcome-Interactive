import websocket from '@fastify/websocket'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  ActivateParticipantRequestSchema,
  AdminLoginRequestSchema,
  AdminRolesRequestSchema,
  ApiErrorResponseSchema,
  BarrageModerationRequestSchema,
  BarragePauseRequestSchema,
  CapsuleModerationRequestSchema,
  BarrageRequestSchema,
  DemoResetRequestSchema,
  CapsuleMessageRequestSchema,
  GiftRequestSchema,
  HealthResponseSchema,
  InvitationStatusRequestSchema,
  ReadyResponseSchema,
  RealtimeStreamSchema,
  RuntimeCommandRequestSchema,
  SessionEndedResponseSchema,
  StageCommandRequestSchema,
  StarTemperatureRequestSchema,
  V2ApiErrorCodeSchema,
  V2ApiErrorResponseSchema,
  V2ActivateParticipantResponseSchema,
  V2AdminCommandResponseSchema,
  V2AdminCommandSchema,
  V2RealtimeErrorFrameSchema,
  V2RealtimeSubscribeSchema,
  V2RealtimeSubscribedSchema,
} from '@sysu-welcome/contracts'
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
} from 'fastify'
import { ZodError } from 'zod'

import {
  authenticateSession,
  revokeSession,
  serializeClearedSessionCookie,
  serializeSessionCookie,
  sessionSecretFromCookie,
  type AuthenticatedSession,
  type SessionType,
} from './auth/session.js'
import { loadConfig, type AppConfig } from './config.js'
import {
  readCredentialContext,
  type CredentialContext,
  verifyAdminPasswordCredential,
} from './db/seed.js'
import { openDatabase } from './db/open-database.js'
import {
  abandonV1ServiceLease,
  acquireV1ServiceLease,
  assertV1RuntimeCompatible,
  completeV1ServiceShutdown,
  executeV1WriteTransaction,
  markV1ServiceListening,
  renewV1ServiceLease,
  resetSyntheticV2Database,
  V2_DESTRUCTIVE_CONFIRMATION,
  V1_SERVICE_LEASE_MS,
  readProtocolRuntime,
} from './db/v2-foundation.js'
import { ApiError, isApiError } from './http/api-error.js'
import { createLoggerOptions } from './logging.js'
import {
  negotiateV2Handshake,
  parseV2RealtimeHello,
  protocolCapabilities,
  v2HandshakeError,
  v2RealtimeError,
  v2RealtimeHelloAck,
  v2RealtimeNotActive,
} from './protocol/v2-handshake.js'
import {
  createResyncRequiredEvent,
  readEventCursor,
  readEventsAfter,
} from './realtime/events.js'
import { createRealtimeHub } from './realtime/hub.js'
import {
  readV2EventsAfter,
  readV2EventStorageCursor,
  readV2LiveEventsAfter,
  V2StreamHistoryUnavailable,
} from './realtime/v2-events.js'
import { createV2RealtimeHub } from './realtime/v2-hub.js'
import { registerNetworkBoundary } from './security/network-boundary.js'
import {
  InMemoryLoginRateLimiter,
  loginSourceIp,
  type LoginKind,
  type LoginRateLimiter,
} from './security/login-rate-limiter.js'
import {
  activateParticipant,
  blockBarrageSource,
  clearBarrages,
  completeCooperativeLight,
  controlRuntime,
  loginAdmin,
  moderateCapsuleCandidate,
  lockStarTemperature,
  publishBarrage,
  removeBarrage,
  resetDemoFromAdmin,
  submitCapsuleMessage,
  sendGift,
  setBarragePaused,
  setInvitationStatus,
  startStar,
  updateAdminRoles,
} from './services/business-commands.js'
import {
  readAdminSnapshot,
  readParticipantSnapshot,
} from './services/business-state.js'
import { requireIdempotencyKey } from './services/idempotency.js'
import { readReadiness } from './services/readiness.js'
import { readScreenSnapshot } from './services/screen-snapshot.js'
import { readV2AdminSnapshot, readV2ParticipantSnapshot, readV2ScreenSnapshot } from './services/v2-snapshots.js'
import {
  activateV2Participant,
  executeV2ParticipantOnboardingCommand,
  V2ParticipantCommandError,
} from './services/v2-participant-onboarding.js'
import {
  executeV2RuntimeCommand,
  V2RuntimeCommandError,
} from './services/v2-runtime-commands.js'

export interface BuildAppOptions {
  config?: AppConfig
  logger?: boolean
  now?: () => Date
  loginRateLimiter?: LoginRateLimiter
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig()
  const now = options.now ?? (() => new Date())
  const app = Fastify({
    logger:
      options.logger === false ? false : createLoggerOptions(config.logLevel),
  })
  const database = openDatabase(config.databasePath)
  const startupProtocol = readProtocolRuntime(database)
  const v2Active = startupProtocol?.activeProtocolVersion === '2' && startupProtocol.activationState === 'V2_ACTIVE'
  const serviceInstanceId = randomUUID()
  let serviceGeneration = 0

  // Structured latency metrics for on-site troubleshooting. Opt-in via
  // DEMO_METRICS=1; disabled by default so tests and CI see zero change.
  const metricsEnabled = process.env.DEMO_METRICS === '1'
  const routeLatencySamples = new Map<string, number[]>()
  const METRICS_SAMPLE_CAP = 500
  if (metricsEnabled) {
    app.addHook('onResponse', async (request, reply) => {
      const route = request.routeOptions?.url ?? request.url.split('?')[0] ?? 'unknown'
      const duration = reply.elapsedTime
      if (!Number.isFinite(duration)) return
      const samples = routeLatencySamples.get(route)
      if (!samples) {
        routeLatencySamples.set(route, [duration])
        return
      }
      if (samples.length >= METRICS_SAMPLE_CAP) samples.shift()
      samples.push(duration)
    })
    const metricsInterval = setInterval(() => {
      if (routeLatencySamples.size === 0) return
      const percentile = (sorted: number[], ratio: number): number => {
        if (sorted.length === 0) return 0
        const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
        return sorted[Math.max(0, index)] ?? 0
      }
      const routes = [...routeLatencySamples.entries()]
        .map(([route, samples]) => {
          const sorted = [...samples].sort((a, b) => a - b)
          return {
            route,
            count: sorted.length,
            p50: Math.round(percentile(sorted, 0.5) * 10) / 10,
            p95: Math.round(percentile(sorted, 0.95) * 10) / 10,
            max: Math.round(sorted.at(-1)! * 10) / 10,
          }
        })
        .sort((left, right) => right.count - left.count)
        .slice(0, 12)
      routeLatencySamples.clear()
      app.log.info(
        { metrics: true, windowMs: 60_000, routes },
        'request latency metrics (ms, last 60s window)',
      )
    }, 60_000)
    metricsInterval.unref()
    app.addHook('onClose', async () => clearInterval(metricsInterval))
  }

  try {
    if (!v2Active) {
      serviceGeneration = acquireV1ServiceLease(database, serviceInstanceId, now())
    }
  } catch (error) {
    database.close()
    throw error
  }
  let serviceHeartbeat: NodeJS.Timeout | null = null
  let v2EventPoller: NodeJS.Timeout | null = null
  try {
    if (!v2Active) serviceHeartbeat = setInterval(() => {
      if (
        !renewV1ServiceLease(
          database,
          serviceInstanceId,
          serviceGeneration,
          now(),
        )
      ) {
        app.log.error(
          { serviceInstanceId },
          'v1 service registration heartbeat was rejected',
        )
      }
    }, Math.floor(V1_SERVICE_LEASE_MS / 3))
    serviceHeartbeat?.unref()
  app.addHook('onRequest', async (request) => {
    if (!v2Active) {
      assertV1RuntimeCompatible(database)
      return
    }
    const path = request.url.split('?')[0] ?? request.url
    if (
      path !== '/api/health' &&
      path !== '/api/protocol-capabilities' &&
      path !== '/api/v2/handshake' &&
      path !== '/ws/v2' &&
      !path.startsWith('/api/v2/')
    ) {
      throw new ApiError('SERVICE_UNAVAILABLE', '协议 v2 已启用，v1 业务入口已关闭。', 409)
    }
  })
  app.addHook('onListen', async () => {
    if (!v2Active) markV1ServiceListening(
      database,
      serviceInstanceId,
      serviceGeneration,
      now(),
    )
  })
  const realtime = createRealtimeHub()
  const v2Realtime = createV2RealtimeHub()
  let v2PollEpoch = v2Active
    ? Number(database.prepare('SELECT reset_epoch FROM v2_runtime_state WHERE id = 1').pluck().get())
    : 0
  let v2PollStorageRowId = v2Active ? readV2EventStorageCursor(database) : 0
  if (v2Active) {
    v2EventPoller = setInterval(() => {
      try {
        const currentEpoch = Number(database.prepare(
          'SELECT reset_epoch FROM v2_runtime_state WHERE id = 1',
        ).pluck().get())
        if (currentEpoch !== v2PollEpoch) {
          v2PollEpoch = currentEpoch
          v2PollStorageRowId = readV2EventStorageCursor(database)
          v2Realtime.invalidate(V2RealtimeErrorFrameSchema.parse({
            type: 'ERROR', protocolVersion: '2', contractVersion: '2',
            activeRuntimeVersion: '2', activationState: 'ACTIVE', resetEpoch: currentEpoch,
            error: {
              code: 'STALE_RESET_EPOCH', message: '运行纪元已更新，请重新认证并获取全部获授权快照。',
              requestId: `epoch-${currentEpoch}`, retryable: false,
            },
          }), 1012, 'V2_EPOCH_CHANGED')
          return
        }
        const pending = readV2LiveEventsAfter(database, currentEpoch, v2PollStorageRowId)
        if (pending.length > 0) {
          v2PollStorageRowId = pending.at(-1)!.storageRowId
          v2Realtime.broadcast(pending.map(({ event }) => event))
        }
      } catch (error) {
        app.log.error({ error }, 'v2 realtime outbox poll failed')
        if (v2EventPoller) clearInterval(v2EventPoller)
        v2EventPoller = null
        v2Realtime.invalidate(V2RealtimeErrorFrameSchema.parse({
          type: 'ERROR', protocolVersion: '2', contractVersion: '2',
          activeRuntimeVersion: '2', activationState: 'ACTIVE', resetEpoch: v2PollEpoch,
          error: {
            code: 'SERVICE_UNAVAILABLE', message: '实时事件暂时不可用，请重新获取权威快照。',
            requestId: `outbox-${v2PollEpoch}`, retryable: true,
          },
        }), 1011, 'V2_REALTIME_UNAVAILABLE')
      }
    }, 25)
    v2EventPoller.unref()
  }
  let credentialContext: CredentialContext | null = null
  const credentials = (): CredentialContext => {
    credentialContext ??= readCredentialContext(config.seedManifestPath)
    return credentialContext
  }
  const loginRateLimiter =
    options.loginRateLimiter ?? new InMemoryLoginRateLimiter()
  let closeRealtimePromise: Promise<void> | null = null
  const closeRealtime = function (this: FastifyInstance): Promise<void> {
    closeRealtimePromise ??= (async () => {
      await realtime.close()
      await Promise.all(
        [...this.websocketServer.clients].map(
          (socket) =>
            new Promise<void>((resolve) => {
              if (socket.readyState === 3) {
                resolve()
                return
              }
              const finish = () => {
                clearTimeout(terminateTimer)
                resolve()
              }
              const terminateTimer = setTimeout(() => {
                if (socket.readyState !== 3) socket.terminate()
              }, 750)
              socket.once('close', finish)
              if (socket.readyState === 1) {
                socket.close(1001, 'server shutting down')
              } else if (socket.readyState === 0) {
                socket.terminate()
              }
            }),
        ),
      )
      await new Promise<void>((resolve) => {
        this.websocketServer.close(() => resolve())
      })
    })()
    return closeRealtimePromise
  }

  function sessionFor(
    request: FastifyRequest,
    type: SessionType,
  ): AuthenticatedSession | null {
    return authenticateSession(
      database,
      type,
      sessionSecretFromCookie(request.headers.cookie, type),
      now(),
    )
  }

  function requireSession(
    request: FastifyRequest,
    type: SessionType,
  ): AuthenticatedSession {
    const session = sessionFor(request, type)
    if (!session) {
      throw new ApiError(
        'AUTH_REQUIRED',
        type === 'ADMIN'
          ? '请先登录共用后台账号。'
          : '参与者会话已失效，请重新核验。',
        401,
      )
    }
    return session
  }

  function idempotencyKey(request: FastifyRequest): string {
    return requireIdempotencyKey(request.headers['idempotency-key'])
  }

  function v2ParticipantSession(request: FastifyRequest) {
    const secret = sessionSecretFromCookie(request.headers.cookie, 'PARTICIPANT')
    const digest = secret ? createHash('sha256').update(secret, 'utf8').digest('hex') : ''
    return database.prepare(
      `SELECT id, subject_id AS subjectId, reset_epoch AS resetEpoch, expires_at AS expiresAt,
              revoked_at AS revokedAt FROM v2_sessions
       WHERE session_type = 'PARTICIPANT' AND secret_digest = ?`,
    ).get(digest) as {
      id: string; subjectId: string; resetEpoch: number; expiresAt: string; revokedAt: string | null
    } | undefined
  }

  function v2AdminSession(request: FastifyRequest) {
    const secret = sessionSecretFromCookie(request.headers.cookie, 'ADMIN')
    const digest = secret ? createHash('sha256').update(secret, 'utf8').digest('hex') : ''
    return database.prepare(
      `SELECT id, subject_id AS subjectId, reset_epoch AS resetEpoch, short_id AS shortId, roles_json AS rolesJson,
              expires_at AS expiresAt, revoked_at AS revokedAt
       FROM v2_sessions WHERE session_type = 'ADMIN' AND secret_digest = ?`,
    ).get(digest) as {
      id: string; subjectId: string; resetEpoch: number; shortId: string; rolesJson: string; expiresAt: string; revokedAt: string | null
    } | undefined
  }

  function v2SessionValid(
    session: { resetEpoch: number; expiresAt: string; revokedAt: string | null } | undefined,
    resetEpoch?: number,
  ): boolean {
    return Boolean(session && !session.revokedAt && Date.parse(session.expiresAt) > now().getTime() &&
      (resetEpoch === undefined || session.resetEpoch === resetEpoch))
  }

  function createV2AdminSession(accountId: string, timestamp: Date) {
    const secret = randomBytes(32).toString('base64url')
    const expiresAt = new Date(timestamp.getTime() + 8 * 60 * 60 * 1_000).toISOString()
    const epoch = Number(database.prepare('SELECT reset_epoch FROM v2_runtime_state WHERE id = 1').pluck().get())
    database.prepare(
      `INSERT INTO v2_sessions (
         id, session_type, subject_id, secret_digest, roles_json, reset_epoch,
         short_id, read_only, created_at, expires_at, revoked_at
       ) VALUES (?, 'ADMIN', ?, ?, '["ALL"]', ?, ?, 0, ?, ?, NULL)`,
    ).run(randomUUID(), accountId, createHash('sha256').update(secret, 'utf8').digest('hex'),
      epoch, randomBytes(6).toString('hex'), timestamp.toISOString(), expiresAt)
    return secret
  }

  function assertLoginAllowed(
    kind: LoginKind,
    sourceIp: string,
    at: Date,
  ): void {
    const decision = loginRateLimiter.check(kind, sourceIp, at)
    if (!decision.allowed) {
      throw new ApiError(
        'RATE_LIMITED',
        `失败次数过多，请在 ${decision.retryAfterSeconds} 秒后重试。`,
        429,
      )
    }
  }

  function countsAsLoginFailure(error: unknown): boolean {
    return (
      error instanceof ZodError ||
      (isApiError(error) && error.code === 'AUTH_REQUIRED')
    )
  }

  await app.register(websocket, {
    preClose: closeRealtime,
    options: {
      maxPayload: 4_096,
      perMessageDeflate: false,
    },
  })
  registerNetworkBoundary(
    app,
    config.allowedOrigins,
    config.host,
    config.port,
  )

  app.get('/api/health', async () =>
    HealthResponseSchema.parse({
      status: 'ok',
      service: 'sysu-welcome-backend',
      protocolVersion: '1',
      now: now().toISOString(),
    }),
  )

  app.get('/api/protocol-capabilities', async (_request, reply) =>
    reply
      .header('cache-control', 'no-store')
      .send(protocolCapabilities(now(), database)),
  )

  app.post('/api/v2/handshake', { bodyLimit: 4_096 }, async (request, reply) => {
    const result = negotiateV2Handshake(request.body, request.id, now(), database)
    return reply
      .header('cache-control', 'no-store')
      .code(result.accepted ? 200 : result.statusCode)
      .send(result.body)
  })

  app.get('/api/v2/screen/snapshot', async (_request, reply) => {
    if (!v2Active) throw new ApiError('SERVICE_UNAVAILABLE', 'v2 运行时尚未启用。', 409)
    return reply.header('cache-control', 'no-store').send(readV2ScreenSnapshot(database, now()))
  })

  app.get('/api/v2/participant/snapshot', async (request, reply) => {
    if (!v2Active) throw new ApiError('SERVICE_UNAVAILABLE', 'v2 运行时尚未启用。', 409)
    const session = v2ParticipantSession(request)
    if (!session || !v2SessionValid(session)) {
      throw new ApiError('AUTH_REQUIRED', '需要有效的 v2 参与者会话。', 401)
    }
    return reply.header('cache-control', 'no-store').send(readV2ParticipantSnapshot(database, session.subjectId, now()))
  })

  app.get('/api/v2/admin/snapshot', async (request, reply) => {
    if (!v2Active) throw new ApiError('SERVICE_UNAVAILABLE', 'v2 运行时尚未启用。', 409)
    const session = v2AdminSession(request)
    if (!session || !v2SessionValid(session)) {
      throw new ApiError('AUTH_REQUIRED', '需要有效的 v2 后台会话。', 401)
    }
    return reply.header('cache-control', 'no-store').send(readV2AdminSnapshot(database, JSON.parse(session.rolesJson), now()))
  })

  app.post('/api/v2/admin/login', async (request, reply) => {
    if (!v2Active) throw new ApiError('SERVICE_UNAVAILABLE', 'v2 运行时尚未启用。', 409)
    const sourceIp = loginSourceIp(request)
    assertLoginAllowed('admin-login', sourceIp, now())
    try {
      const body = AdminLoginRequestSchema.parse(request.body)
      const account = database.prepare(
        `SELECT id, password_digest AS passwordDigest, enabled
         FROM admin_accounts WHERE username = ?`,
      ).get(body.username.trim()) as { id: string; passwordDigest: string; enabled: number } | undefined
      if (!account || account.enabled !== 1 || !verifyAdminPasswordCredential(
        credentials(), account.id, body.password, account.passwordDigest,
      )) {
        throw new ApiError('AUTH_REQUIRED', '账号或密码无效。', 401)
      }
      const timestamp = now()
      let secret = ''
      database.exec('BEGIN IMMEDIATE')
      try {
        const runtime = readProtocolRuntime(database)
        if (runtime?.activeProtocolVersion !== '2' || runtime.activationState !== 'V2_ACTIVE') {
          throw new ApiError('SERVICE_UNAVAILABLE', 'v2 运行时尚未启用。', 409)
        }
        secret = createV2AdminSession(account.id, timestamp)
        database.exec('COMMIT')
      } catch (error) {
        if (database.inTransaction) database.exec('ROLLBACK')
        throw error
      }
      loginRateLimiter.recordSuccess('admin-login', sourceIp)
      return reply.header('cache-control', 'no-store')
        .header('set-cookie', serializeSessionCookie('ADMIN', secret))
        .send(readV2AdminSnapshot(database, ['ALL'], timestamp))
    } catch (error) {
      if (countsAsLoginFailure(error)) loginRateLimiter.recordFailure('admin-login', sourceIp, now())
      throw error
    }
  })

  app.post('/api/v2/admin/logout', async (request, reply) => {
    if (!v2Active) throw new ApiError('SERVICE_UNAVAILABLE', 'v2 运行时尚未启用。', 409)
    const session = v2AdminSession(request)
    if (session && v2SessionValid(session)) {
      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare('UPDATE v2_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?')
          .run(now().toISOString(), session.id)
        database.exec('COMMIT')
      } catch (error) {
        if (database.inTransaction) database.exec('ROLLBACK')
        throw error
      }
    }
    return reply.header('set-cookie', serializeClearedSessionCookie('ADMIN'))
      .send({ status: 'ok', protocolVersion: '2' })
  })

  app.post('/api/v2/participant/activate', async (request, reply) => {
    if (!v2Active) throw new ApiError('SERVICE_UNAVAILABLE', 'v2 运行时尚未启用。', 409)
    const sourceIp = loginSourceIp(request)
    const attemptAt = now()
    assertLoginAllowed('participant-activation', sourceIp, attemptAt)
    try {
      const result = activateV2Participant(database, credentials(), request.body, attemptAt)
      loginRateLimiter.recordSuccess('participant-activation', sourceIp)
      return reply
        .header('cache-control', 'no-store')
        .header('set-cookie', serializeSessionCookie('PARTICIPANT', result.session.secret))
        .send(V2ActivateParticipantResponseSchema.parse({
          status: 'ok',
          protocolVersion: '2',
          activationCreated: result.activated,
          snapshot: result.snapshot,
        }))
    } catch (error) {
      if (countsAsLoginFailure(error)) {
        loginRateLimiter.recordFailure('participant-activation', sourceIp, attemptAt)
      }
      throw error
    }
  })

  app.post('/api/v2/participant/logout', async (request, reply) => {
    if (!v2Active) throw new ApiError('SERVICE_UNAVAILABLE', 'v2 运行时尚未启用。', 409)
    const session = v2ParticipantSession(request)
    if (session) {
      database.exec('BEGIN IMMEDIATE')
      try {
        database.prepare(
          'UPDATE v2_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?',
        ).run(now().toISOString(), session.id)
        database.exec('COMMIT')
      } catch (error) {
        if (database.inTransaction) database.exec('ROLLBACK')
        throw error
      }
    }
    return reply
      .header('set-cookie', serializeClearedSessionCookie('PARTICIPANT'))
      .send({ status: 'ok', protocolVersion: '2' })
  })

  app.post('/api/v2/participant/commands', async (request, reply) => {
    if (!v2Active) throw new ApiError('SERVICE_UNAVAILABLE', 'v2 运行时尚未启用。', 409)
    const session = v2ParticipantSession(request)
    if (!session || !v2SessionValid(session)) {
      throw new ApiError('AUTH_REQUIRED', '需要有效的 v2 参与者会话。', 401)
    }
    return reply.header('cache-control', 'no-store').send(
      executeV2ParticipantOnboardingCommand(database, session.subjectId, request.body, now()),
    )
  })

  app.post('/api/v2/admin/commands', async (request, reply) => {
    if (!v2Active) throw new ApiError('SERVICE_UNAVAILABLE', 'v2 运行时尚未启用。', 409)
    const session = v2AdminSession(request)
    if (!session || !v2SessionValid(session)) {
      throw new ApiError('AUTH_REQUIRED', '需要有效的 v2 后台会话。', 401)
    }
    const parsed = V2AdminCommandSchema.parse(request.body)
    if (parsed.command === 'RESET_DEMO') {
      const roles = JSON.parse(session.rolesJson) as string[]
      if (!roles.includes('ALL') && !roles.includes('DEMO_ADMIN')) {
        throw new ApiError('ROLE_REQUIRED', '需要 Demo 管理权限。', 403)
      }
      const beforeReset = database.prepare(
        `SELECT run_revision AS runRevision,
                presentation_revision AS presentationRevision
         FROM v2_runtime_state WHERE id = 1`,
      ).get() as { runRevision: number; presentationRevision: number }
      let secret = ''
      const result = resetSyntheticV2Database(database, {
        migrationsPath: config.migrationsPath,
        manifestPath: config.seedManifestPath,
        participantCount: config.seedParticipantCount,
        confirmation: V2_DESTRUCTIVE_CONFIRMATION,
        now,
        beforeVerify: ({ resetEpoch, timestamp }) => {
          secret = createV2AdminSession(session.subjectId, new Date(timestamp))
          const receipt = database.prepare(
            `INSERT INTO v2_control_receipts (
               reset_epoch, idempotency_key_digest, command, result,
               before_run_revision, after_run_revision,
               before_presentation_revision, after_presentation_revision,
               session_short_id, roles_json, request_id, created_at
             ) VALUES (?, ?, 'RESET_DEMO', 'APPLIED', ?, 0, ?, 0, ?, ?, ?, ?)`,
          ).run(
            resetEpoch,
            createHash('sha256').update(parsed.idempotencyKey, 'utf8').digest('hex'),
            beforeReset.runRevision,
            beforeReset.presentationRevision,
            session.shortId,
            JSON.stringify(roles),
            request.id,
            timestamp,
          )
          database.prepare(
            `INSERT INTO v2_control_audit_context (
               receipt_id, readiness_warnings_json, funnel_json,
               override_readiness_warnings, live_completion
             ) VALUES (?, '[]', ?, 0, 0)`,
          ).run(Number(receipt.lastInsertRowid), JSON.stringify({
            activatedCount: 0,
            publicStarCount: 0,
            admittedCount: 0,
            onboardingPendingCount: 0,
            capsuleSubmittedCount: 0,
            capsuleSkippedCount: 0,
            starStartedCount: 0,
            cooperativeLightCount: 0,
            onlineParticipantSessions: 0,
          }))
        },
      })
      const adminSnapshot = readV2AdminSnapshot(database, ['ALL'], now())
      return reply.header('cache-control', 'no-store')
        .header('set-cookie', serializeSessionCookie('ADMIN', secret))
        .send(V2AdminCommandResponseSchema.parse({
          status: 'ok', protocolVersion: '2', resetEpoch: result.resetEpoch,
          command: 'RESET_DEMO', replayed: false, runtime: adminSnapshot.runtime,
          presentation: adminSnapshot.presentation,
          presentationRevision: adminSnapshot.presentationRevision,
          interactionRevision: adminSnapshot.interaction.interactionRevision,
          aggregateRevision: adminSnapshot.aggregateRevision,
          funnel: adminSnapshot.funnel, readinessWarnings: adminSnapshot.readinessWarnings,
        }))
    }
    return reply.header('cache-control', 'no-store').send(executeV2RuntimeCommand(
      database,
      {
        sessionShortId: session.shortId,
        requestId: request.id,
        roles: JSON.parse(session.rolesJson),
      },
      parsed,
      now(),
    ))
  })

  app.get('/api/ready', async (request, reply) => {
    const body = ReadyResponseSchema.parse(
      readReadiness(database, config, realtime, request.id, now),
    )
    return reply.code(body.status === 'ready' ? 200 : 503).send(body)
  })

  app.get('/api/screen/snapshot', async (request, reply) => {
    const readiness = readReadiness(
      database,
      config,
      realtime,
      request.id,
      now,
    )
    if (readiness.status !== 'ready') {
      return reply.code(503).send(readiness)
    }
    return readScreenSnapshot(database, now)
  })

  app.post('/api/participant/activate', async (request, reply) => {
    const attemptAt = now()
    const sourceIp = loginSourceIp(request)
    const kind = 'participant-activation' as const
    assertLoginAllowed(kind, sourceIp, attemptAt)
    let result: ReturnType<typeof activateParticipant>
    try {
      const body = ActivateParticipantRequestSchema.parse(request.body)
      result = activateParticipant(
        database,
        credentials(),
        body,
        idempotencyKey(request),
        request.id,
        attemptAt,
      )
    } catch (error) {
      if (countsAsLoginFailure(error)) {
        loginRateLimiter.recordFailure(kind, sourceIp, attemptAt)
      }
      throw error
    }
    loginRateLimiter.recordSuccess(kind, sourceIp)
    realtime.broadcast(result.events)
    return reply
      .header('cache-control', 'no-store')
      .header(
        'set-cookie',
        serializeSessionCookie('PARTICIPANT', result.session.secret),
      )
      .send(result.snapshot)
  })

  app.get('/api/participant/snapshot', async (request, reply) => {
    const session = requireSession(request, 'PARTICIPANT')
    return reply
      .header('cache-control', 'no-store')
      .send(readParticipantSnapshot(database, session.subjectId, now()))
  })

  app.post('/api/participant/logout', async (request, reply) => {
    const session = sessionFor(request, 'PARTICIPANT')
    if (session) revokeSession(database, session.id, now())
    return reply
      .header('set-cookie', serializeClearedSessionCookie('PARTICIPANT'))
      .send(SessionEndedResponseSchema.parse({ status: 'ok' }))
  })

  app.put('/api/participant/capsule-message', async (request, reply) => {
    const session = requireSession(request, 'PARTICIPANT')
    const body = CapsuleMessageRequestSchema.parse(request.body)
    const result = submitCapsuleMessage(
      database,
      session,
      body,
      idempotencyKey(request),
      now(),
    )
    realtime.broadcast(result.events)
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.put('/api/participant/star-temperature', async (request, reply) => {
    const session = requireSession(request, 'PARTICIPANT')
    const body = StarTemperatureRequestSchema.parse(request.body)
    const result = lockStarTemperature(
      database,
      session,
      body,
      idempotencyKey(request),
      now(),
    )
    realtime.broadcast(result.events)
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.post('/api/participant/star/start', async (request, reply) => {
    const session = requireSession(request, 'PARTICIPANT')
    const body = StageCommandRequestSchema.parse(request.body)
    const result = startStar(
      database,
      session,
      body,
      idempotencyKey(request),
      now(),
    )
    realtime.broadcast(result.events)
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.post('/api/participant/gifts', async (request, reply) => {
    const session = requireSession(request, 'PARTICIPANT')
    const body = GiftRequestSchema.parse(request.body)
    const result = sendGift(
      database,
      session,
      body,
      idempotencyKey(request),
      now(),
    )
    realtime.broadcast(result.events)
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.post('/api/participant/barrages', async (request, reply) => {
    const session = requireSession(request, 'PARTICIPANT')
    const body = BarrageRequestSchema.parse(request.body)
    const result = publishBarrage(
      database,
      session,
      body,
      idempotencyKey(request),
      request.id,
      now(),
    )
    realtime.broadcast(result.events)
    return reply
      .header('cache-control', 'no-store')
      .code(result.statusCode)
      .send(result.body)
  })

  app.post('/api/participant/cooperative-light', async (request, reply) => {
    const session = requireSession(request, 'PARTICIPANT')
    const body = StageCommandRequestSchema.parse(request.body)
    const result = completeCooperativeLight(
      database,
      session,
      body,
      idempotencyKey(request),
      now(),
    )
    realtime.broadcast(result.events)
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.post('/api/admin/login', async (request, reply) => {
    const attemptAt = now()
    const sourceIp = loginSourceIp(request)
    const kind = 'admin-login' as const
    assertLoginAllowed(kind, sourceIp, attemptAt)
    let result: ReturnType<typeof loginAdmin>
    try {
      const body = AdminLoginRequestSchema.parse(request.body)
      result = loginAdmin(database, credentials(), body, attemptAt)
    } catch (error) {
      if (countsAsLoginFailure(error)) {
        loginRateLimiter.recordFailure(kind, sourceIp, attemptAt)
      }
      throw error
    }
    loginRateLimiter.recordSuccess(kind, sourceIp)
    return reply
      .header('cache-control', 'no-store')
      .header('set-cookie', serializeSessionCookie('ADMIN', result.session.secret))
      .send(result.snapshot)
  })

  app.post('/api/admin/logout', async (request, reply) => {
    const session = sessionFor(request, 'ADMIN')
    if (session) revokeSession(database, session.id, now())
    return reply
      .header('set-cookie', serializeClearedSessionCookie('ADMIN'))
      .send(SessionEndedResponseSchema.parse({ status: 'ok' }))
  })

  app.get('/api/admin/snapshot', async (request, reply) => {
    const session = requireSession(request, 'ADMIN')
    return reply
      .header('cache-control', 'no-store')
      .send(readAdminSnapshot(database, session, now()))
  })

  app.put('/api/admin/roles', async (request, reply) => {
    const session = requireSession(request, 'ADMIN')
    const body = AdminRolesRequestSchema.parse(request.body)
    const result = updateAdminRoles(
      database,
      session,
      body,
      idempotencyKey(request),
      request.id,
      now(),
    )
    realtime.broadcast(result.events)
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.post('/api/admin/runtime', async (request, reply) => {
    const session = requireSession(request, 'ADMIN')
    const body = RuntimeCommandRequestSchema.parse(request.body)
    const result = controlRuntime(
      database,
      session,
      body,
      idempotencyKey(request),
      request.id,
      now(),
    )
    realtime.broadcast(result.events)
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.post('/api/admin/barrages/:id/remove', async (request, reply) => {
    const session = requireSession(request, 'ADMIN')
    const { id } = request.params as { id: string }
    const body = BarrageModerationRequestSchema.parse(request.body)
    const result = removeBarrage(
      database,
      session,
      id,
      body,
      idempotencyKey(request),
      request.id,
      now(),
    )
    realtime.broadcast(result.events)
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.post('/api/admin/capsules/:identityId/moderate', async (request, reply) => {
    const session = requireSession(request, 'ADMIN')
    const { identityId } = request.params as { identityId: string }
    const body = CapsuleModerationRequestSchema.parse(request.body)
    const result = moderateCapsuleCandidate(
      database,
      session,
      identityId,
      body,
      idempotencyKey(request),
      request.id,
      now(),
    )
    realtime.broadcast(result.events)
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.post('/api/admin/sources/:sourceId/block', async (request, reply) => {
    const session = requireSession(request, 'ADMIN')
    const { sourceId } = request.params as { sourceId: string }
    const body = BarrageModerationRequestSchema.parse(request.body)
    const result = blockBarrageSource(
      database,
      session,
      sourceId,
      body,
      idempotencyKey(request),
      request.id,
      now(),
    )
    realtime.broadcast(result.events)
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.post('/api/admin/barrages/pause', async (request, reply) => {
    const session = requireSession(request, 'ADMIN')
    const body = BarragePauseRequestSchema.parse(request.body)
    const result = setBarragePaused(
      database,
      session,
      body,
      idempotencyKey(request),
      request.id,
      now(),
    )
    realtime.broadcast(result.events)
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.post('/api/admin/barrages/clear', async (request, reply) => {
    const session = requireSession(request, 'ADMIN')
    const body = BarrageModerationRequestSchema.parse(request.body)
    const result = clearBarrages(
      database,
      session,
      body,
      idempotencyKey(request),
      request.id,
      now(),
    )
    realtime.broadcast(result.events)
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.post('/api/admin/invitations/:id/status', async (request, reply) => {
    const session = requireSession(request, 'ADMIN')
    const { id } = request.params as { id: string }
    const body = InvitationStatusRequestSchema.parse(request.body)
    const result = setInvitationStatus(
      database,
      session,
      id,
      body,
      idempotencyKey(request),
      request.id,
      now(),
    )
    realtime.broadcast(result.events)
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.post('/api/admin/reset', async (request, reply) => {
    const session = requireSession(request, 'ADMIN')
    const body = DemoResetRequestSchema.parse(request.body)
    const result = resetDemoFromAdmin(
      database,
      config,
      session,
      body,
      idempotencyKey(request),
      request.id,
      now(),
    )
    realtime.broadcast(result.events)
    if (!result.replayed) {
      reply.header(
        'set-cookie',
        serializeSessionCookie('ADMIN', result.session.secret),
      )
    }
    return reply.header('cache-control', 'no-store').send(result.body)
  })

  app.get('/ws/v2', { websocket: true }, (socket, request) => {
    let settled = false
    const finish = (
      frames: readonly unknown[],
      closeCode: number,
      closeReason: string,
    ): void => {
      if (settled) return
      settled = true
      clearTimeout(helloTimeout)
      let index = 0
      const sendNext = (): void => {
        if (socket.readyState !== 1) return
        const frame = frames[index]
        index += 1
        if (frame === undefined) {
          socket.close(closeCode, closeReason)
          return
        }
        socket.send(JSON.stringify(frame), (error) => {
          if (error) {
            socket.terminate()
            return
          }
          sendNext()
        })
      }
      sendNext()
    }
	      const helloTimeout = setTimeout(() => {
      finish(
        [
          v2RealtimeError(
            'PROTOCOL_VERSION_MISMATCH',
            'WebSocket v2 连接必须先发送明确的 HELLO 首帧。',
	            request.id,
	            database,
          ),
        ],
        1008,
        'V2_HELLO_REQUIRED',
      )
    }, 1_500)
    helloTimeout.unref()

    socket.once('message', (data, isBinary) => {
      if (settled) return
      let input: unknown
      if (!isBinary) {
        try {
          input = JSON.parse(data.toString())
        } catch {
          finish(
            [
              v2RealtimeError(
                'VALIDATION_FAILED',
                'WebSocket v2 HELLO 必须是合法 JSON。',
	                request.id,
	                database,
              ),
            ],
            1008,
            'V2_HELLO_INVALID',
          )
          return
        }
      }
      if (isBinary) {
        finish(
          [
            v2RealtimeError(
              'VALIDATION_FAILED',
              'WebSocket v2 HELLO 不接受二进制帧。',
	              request.id,
	              database,
            ),
          ],
          1008,
          'V2_HELLO_INVALID',
        )
        return
      }

	      const negotiation = parseV2RealtimeHello(input, request.id, database)
      if (!negotiation.accepted) {
        finish(
          [negotiation.frame],
          1008,
          'V2_PROTOCOL_REJECTED',
        )
        return
      }
      if (!v2Active) {
        finish([v2RealtimeHelloAck(negotiation.hello, now(), database), v2RealtimeNotActive()], 1013, 'V2_RUNTIME_NOT_ACTIVE')
        return
      }
	      settled = true
	      clearTimeout(helloTimeout)
	      socket.send(JSON.stringify(v2RealtimeHelloAck(negotiation.hello, now(), database)))
	      const subscribeTimeout = setTimeout(() => {
	        socket.close(1008, 'V2_SUBSCRIBE_REQUIRED')
	      }, 1_500)
	      subscribeTimeout.unref()
	      socket.once('message', (subscribeData, subscribeBinary) => {
	        clearTimeout(subscribeTimeout)
        if (subscribeBinary) return socket.close(1008, 'V2_SUBSCRIBE_INVALID')
        let raw: unknown
        try { raw = JSON.parse(subscribeData.toString()) } catch { return socket.close(1008, 'V2_SUBSCRIBE_INVALID') }
        const parsed = V2RealtimeSubscribeSchema.safeParse(raw)
        if (!parsed.success) return socket.close(1008, 'V2_SUBSCRIBE_INVALID')
        const epoch = Number(database.prepare('SELECT reset_epoch FROM v2_runtime_state WHERE id = 1').pluck().get())
	        if (parsed.data.resetEpoch !== epoch) {
	          socket.send(JSON.stringify(V2RealtimeErrorFrameSchema.parse({
	            type: 'ERROR', protocolVersion: '2', contractVersion: '2',
	            activeRuntimeVersion: '2', activationState: 'ACTIVE', resetEpoch: epoch,
	            error: {
	              code: 'STALE_RESET_EPOCH',
	              message: '运行纪元已更新，请重新认证并获取全部获授权快照。',
	              requestId: request.id, retryable: false,
	            },
	          })), () => socket.close(1008, 'V2_EPOCH_CHANGED'))
	          return
	        }
        const surface = (negotiation.hello as { clientSurface: 'WELCOME' | 'SCREEN' | 'ADMIN' }).clientSurface
	        const participantSession = v2ParticipantSession(request)
	        const participantId = v2SessionValid(participantSession, epoch)
	          ? participantSession!.subjectId
	          : undefined
	        const adminSession = v2AdminSession(request)
	        const adminAuthorized = v2SessionValid(adminSession, epoch)
	        const allowed = surface === 'SCREEN' ? ['public']
	          : surface === 'ADMIN' && adminAuthorized ? ['public', 'admin']
	          : participantId ? ['public', `participant:${participantId}`] : []
	        if (allowed.length === 0 || parsed.data.streams.some(({ streamId }) => !allowed.includes(streamId))) {
	          socket.send(JSON.stringify(V2RealtimeErrorFrameSchema.parse({
	            type: 'ERROR', protocolVersion: '2', contractVersion: '2',
	            activeRuntimeVersion: '2', activationState: 'ACTIVE', resetEpoch: epoch,
	            error: {
	              code: surface === 'SCREEN' ? 'ROLE_REQUIRED' : 'AUTH_REQUIRED',
	              message: '当前会话无权订阅所请求的实时流。',
	              requestId: request.id, retryable: false,
	            },
	          })), () => socket.close(1008, 'V2_STREAM_FORBIDDEN'))
	          return
	        }
	        const requestedStreams = parsed.data.streams.map(({ streamId }) => streamId)
	        v2Realtime.add(socket, parsed.data.streams, true)
        try {
          const backlog = parsed.data.streams.flatMap(({ streamId, streamSeq }) =>
            readV2EventsAfter(database, epoch, streamId, streamSeq))
	          const accepted = parsed.data.streams.map(({ streamId, streamSeq }) => ({
	            streamId,
	            streamSeq: backlog
	              .filter((event) => event.streamId === streamId)
	              .reduce((maximum, event) => Math.max(maximum, event.streamSeq), streamSeq),
	          }))
          socket.send(JSON.stringify(V2RealtimeSubscribedSchema.parse({
            type: 'SUBSCRIBED', protocolVersion: '2', resetEpoch: epoch, streams: accepted,
          })))
          v2Realtime.flush(socket, backlog)
        } catch (error) {
          v2Realtime.remove(socket)
          if (error instanceof V2StreamHistoryUnavailable) {
	            socket.send(JSON.stringify(V2RealtimeErrorFrameSchema.parse({
	              type: 'ERROR', protocolVersion: '2', contractVersion: '2',
              activeRuntimeVersion: '2', activationState: 'ACTIVE', resetEpoch: epoch,
              error: { code: 'RESYNC_REQUIRED', message: '该流历史不可续订，请重取对应快照。', requestId: request.id, retryable: false,
                resync: { streamId: error.streamId, snapshotRequired: true } },
	            })))
          }
          socket.close(1008, 'V2_RESYNC_REQUIRED')
        }
      })
	      socket.once('close', () => { clearTimeout(subscribeTimeout); v2Realtime.remove(socket) })
    })
    socket.once('close', () => clearTimeout(helloTimeout))
    socket.once('error', () => clearTimeout(helloTimeout))
  })

  app.get('/ws', { websocket: true }, (socket, request) => {
    const query = request.query as Record<string, string | undefined>
    const streamResult = RealtimeStreamSchema.safeParse(query.stream ?? 'public')
    const afterEventSeq = Number(query.afterEventSeq ?? '0')
    const requestedEpoch =
      query.resetEpoch === undefined ? null : Number(query.resetEpoch)
    if (
      !streamResult.success ||
      !Number.isSafeInteger(afterEventSeq) ||
      afterEventSeq < 0 ||
      (requestedEpoch !== null &&
        (!Number.isSafeInteger(requestedEpoch) || requestedEpoch < 1))
    ) {
      socket.close(1008, 'invalid realtime cursor')
      return
    }
    const stream = streamResult.data
    const session =
      stream === 'participant'
        ? sessionFor(request, 'PARTICIPANT')
        : stream === 'admin'
          ? sessionFor(request, 'ADMIN')
          : null
    if ((stream === 'participant' || stream === 'admin') && !session) {
      socket.close(1008, 'authenticated realtime stream required')
      return
    }
    const cursor = readEventCursor(database)
    const sendResyncAndClose = (
      reason: 'EPOCH_CHANGED' | 'EVENT_GAP' | 'HISTORY_UNAVAILABLE',
    ): void => {
      const event = createResyncRequiredEvent(database, reason, now())
      // Track the socket in a permanently buffering state so no live fact is
      // delivered after the resync decision, while shutdown can still
      // terminate a client that refuses the close handshake.
      realtime.add(socket, { stream: 'screen' }, { buffering: true })
      socket.on('close', () => realtime.remove(socket))
      socket.on('error', () => realtime.remove(socket))
      setImmediate(() => {
        if (socket.readyState !== 1) return
        socket.send(JSON.stringify(event), (error) => {
          if (error) {
            socket.terminate()
            return
          }
          socket.close(1012, 'resync required')
          const terminateTimer = setTimeout(() => {
            if (socket.readyState !== 3) socket.terminate()
          }, 750)
          terminateTimer.unref()
          socket.once('close', () => clearTimeout(terminateTimer))
        })
      })
    }
    if (requestedEpoch !== null && requestedEpoch !== cursor.resetEpoch) {
      sendResyncAndClose('EPOCH_CHANGED')
      return
    }
    if (afterEventSeq > cursor.eventSeq) {
      sendResyncAndClose('EVENT_GAP')
      return
    }
    const backlog = readEventsAfter(database, {
      stream,
      afterEventSeq,
      subjectId: session?.subjectId ?? null,
      limit: 5_000,
    })
    const replayStartsContinuously =
      backlog.length === 0
        ? afterEventSeq === cursor.eventSeq
        : backlog[0]?.eventSeq === afterEventSeq + 1
    const replayHighWater = backlog.at(-1)?.eventSeq ?? afterEventSeq
    if (!replayStartsContinuously || replayHighWater < cursor.eventSeq) {
      sendResyncAndClose('HISTORY_UNAVAILABLE')
      return
    }
    const access = { stream, subjectId: session?.subjectId ?? null }
    realtime.add(socket, access, { buffering: true })
    setImmediate(() => realtime.flushBuffered(socket, backlog))
    socket.on('message', () => {
      socket.close(1008, 'G1 public channel is read-only')
    })
    socket.on('close', () => realtime.remove(socket))
    socket.on('error', () => realtime.remove(socket))
  })

	  app.setNotFoundHandler(async (request, reply) => {
	    const routeUrl = request.url.split('?')[0] ?? request.url
	    if (routeUrl.startsWith('/api/v2/')) {
	      const epoch = Number(database.prepare(
	        'SELECT reset_epoch FROM v2_runtime_state WHERE id = 1',
	      ).pluck().get() ?? 1)
	      return reply.code(404).send(V2ApiErrorResponseSchema.parse({
	        status: 'error', protocolVersion: '2', resetEpoch: epoch,
	        error: {
	          code: 'RESOURCE_NOT_FOUND', message: '请求的 v2 现场接口不存在。',
	          requestId: request.id, retryable: false,
	        },
	        recovery: { snapshotRequired: true, scope: 'ALL_AUTHORIZED' },
	      }))
	    }
	    const body = ApiErrorResponseSchema.parse({
      status: 'error',
      error: {
        code: 'VALIDATION_FAILED',
        message: '请求的现场接口不存在。',
        requestId: request.id,
      },
    })
    return reply.code(404).send(body)
  })

	  app.setErrorHandler(async (error, request, reply) => {
    if (reply.sent) return
	    const v2DomainError = error instanceof V2ParticipantCommandError || error instanceof V2RuntimeCommandError
	    const known = isApiError(error)
	    const validation = error instanceof ZodError
	    const statusCode = known || v2DomainError ? error.statusCode : validation ? 400 : 500
	    const code = known || v2DomainError
	      ? error.code
      : validation
        ? ('VALIDATION_FAILED' as const)
        : ('SERVICE_UNAVAILABLE' as const)
    const routeUrl = request.routeOptions.url ?? request.url.split('?')[0] ?? '/'
	    if (routeUrl === '/api/v2/handshake') {
      const frameworkStatus = (error as { statusCode?: unknown }).statusCode
      const framework4xx =
        typeof frameworkStatus === 'number' &&
        frameworkStatus >= 400 &&
        frameworkStatus < 500
      const handshakeStatus = framework4xx
        ? frameworkStatus
        : validation
          ? 400
          : 500
      const handshakeCode =
        framework4xx || validation
          ? ('VALIDATION_FAILED' as const)
          : ('SERVICE_UNAVAILABLE' as const)
      const handshakeLog = {
        requestId: request.id,
        route: routeUrl,
        statusCode: handshakeStatus,
        code: handshakeCode,
      }
      if (handshakeCode === 'SERVICE_UNAVAILABLE') {
        request.log.error(handshakeLog, 'v2 handshake failed unexpectedly')
      } else {
        request.log.warn(handshakeLog, 'v2 handshake rejected before negotiation')
      }
      return reply.code(handshakeStatus).send(
        v2HandshakeError(
          handshakeCode,
          handshakeCode === 'VALIDATION_FAILED'
            ? 'v2 握手请求无法解析；请检查 JSON、内容类型和请求大小。'
            : 'v2 握手服务暂时不可用，请稍后安全重试。',
	          request.id,
	          database,
	        ),
	      )
	    }
	    if (routeUrl.startsWith('/api/v2/')) {
	      const epoch = Number(database.prepare(
	        'SELECT reset_epoch FROM v2_runtime_state WHERE id = 1',
	      ).pluck().get() ?? 1)
	      const v2Code = V2ApiErrorCodeSchema.safeParse(code).success
	        ? code
	        : ('SERVICE_UNAVAILABLE' as const)
	      return reply.code(statusCode).send(V2ApiErrorResponseSchema.parse({
	        status: 'error', protocolVersion: '2', resetEpoch: epoch,
	        error: {
	          code: v2Code,
	          message: known || v2DomainError ? error.message : validation
	            ? '请求格式或字段无效，请检查后重试。'
	            : 'v2 现场服务暂时不可用。',
	          requestId: request.id,
	          retryable: v2Code === 'RATE_LIMITED' || v2Code === 'SERVICE_UNAVAILABLE',
	          ...(error instanceof V2RuntimeCommandError && error.details
	            ? { details: error.details }
	            : {}),
	        },
	        recovery: { snapshotRequired: true, scope: 'ALL_AUTHORIZED' },
	      }))
	    }
    if (
      request.method !== 'GET' &&
      request.method !== 'HEAD' &&
      routeUrl.startsWith('/api/admin/') &&
      routeUrl !== '/api/admin/login' &&
      routeUrl !== '/api/admin/logout'
    ) {
      try {
        const adminSession = sessionFor(request, 'ADMIN')
        if (adminSession) {
          executeV1WriteTransaction(database, () => {
            database
              .prepare(
                `INSERT INTO admin_operation_records (
                   session_short_id, roles_json, action, result,
                   request_id, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?)`,
              )
              .run(
                adminSession.shortId,
                JSON.stringify(adminSession.roles),
                routeUrl,
                code,
                request.id,
                now().toISOString(),
              )
          })
        }
      } catch {
        // Failure accounting must never replace the original public error.
      }
    }
    request.log.error(
      {
        requestId: request.id,
        method: request.method,
        route: routeUrl,
        statusCode,
        code,
      },
      'request failed',
    )
    const body = ApiErrorResponseSchema.parse({
      status: 'error',
      error: {
        code,
        message: known
          ? error.message
          : validation
            ? '请求格式或字段无效，请检查后重试。'
            : '现场服务暂时不可用。',
        requestId: request.id,
      },
      ...(known && error.resetEpoch !== undefined
        ? { resetEpoch: error.resetEpoch }
        : {}),
      ...(known && error.stageRevision !== undefined
        ? { stageRevision: error.stageRevision }
        : {}),
    })
    return reply.code(statusCode).send(body)
  })

	  app.addHook('onClose', async () => {
	    if (serviceHeartbeat) clearInterval(serviceHeartbeat)
	    if (v2EventPoller) clearInterval(v2EventPoller)
    await Promise.all([closeRealtime.call(app), v2Realtime.close()])
    try {
      if (v2Active) return
      const runtime = database
        .prepare(
          `SELECT v1_service_listen_generation
           FROM protocol_runtime WHERE id = 1`,
        )
        .pluck()
        .get() as number | null
      if (runtime === serviceGeneration) {
        completeV1ServiceShutdown(
          database,
          serviceInstanceId,
          serviceGeneration,
          now(),
        )
      } else {
        abandonV1ServiceLease(
          database,
          serviceInstanceId,
          serviceGeneration,
          now(),
        )
      }
    } finally {
      database.close()
    }
  })

  return app
	  } catch (error) {
	    if (serviceHeartbeat) clearInterval(serviceHeartbeat)
	    if (v2EventPoller) clearInterval(v2EventPoller)
    try {
      if (!v2Active) abandonV1ServiceLease(database, serviceInstanceId, serviceGeneration, now())
    } finally {
      if (database.open) database.close()
    }
    throw error
  }
}
