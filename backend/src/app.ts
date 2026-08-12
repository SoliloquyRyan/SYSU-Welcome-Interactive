import websocket from '@fastify/websocket'
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
  readDemoCredentialContext,
  type DemoCredentialContext,
} from './db/seed.js'
import { openDatabase } from './db/open-database.js'
import { ApiError, isApiError } from './http/api-error.js'
import { createLoggerOptions } from './logging.js'
import {
  createResyncRequiredEvent,
  readEventCursor,
  readEventsAfter,
} from './realtime/events.js'
import { createRealtimeHub } from './realtime/hub.js'
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
  const realtime = createRealtimeHub()
  let credentialContext: DemoCredentialContext | null = null
  const credentials = (): DemoCredentialContext => {
    credentialContext ??= readDemoCredentialContext(config.seedManifestPath)
    return credentialContext
  }
  const loginRateLimiter =
    options.loginRateLimiter ?? new InMemoryLoginRateLimiter()
  const closeRealtime = async function (
    this: FastifyInstance,
  ): Promise<void> {
    await realtime.close()
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve()
      }
      const timeout = setTimeout(finish, 1_000)
      timeout.unref()
      this.websocketServer.close(finish)
    })
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
    const body = ApiErrorResponseSchema.parse({
      status: 'error',
      error: {
        code: 'VALIDATION_FAILED',
        message: '请求的本地 Demo 接口不存在。',
        requestId: request.id,
      },
    })
    return reply.code(404).send(body)
  })

  app.setErrorHandler(async (error, request, reply) => {
    if (reply.sent) return
    const known = isApiError(error)
    const validation = error instanceof ZodError
    const statusCode = known ? error.statusCode : validation ? 400 : 500
    const code = known
      ? error.code
      : validation
        ? ('VALIDATION_FAILED' as const)
        : ('SERVICE_UNAVAILABLE' as const)
    const routeUrl = request.routeOptions.url ?? request.url.split('?')[0] ?? '/'
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
            : '本地 Demo 服务暂时不可用。',
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
    database.close()
  })

  return app
}
