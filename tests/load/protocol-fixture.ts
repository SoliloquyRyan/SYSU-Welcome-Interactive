import { createRequire } from 'node:module'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { buildApp } from '../../backend/src/app.js'
import { BACKEND_ROOT, type AppConfig } from '../../backend/src/config.js'
import { migrateDatabase } from '../../backend/src/db/migrate.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import {
  readSeedManifest,
  seedDemoDatabase,
  type DemoSeedManifest,
} from '../../backend/src/db/seed.js'

const PARTICIPANT_COUNT = 300
const HTTP_TIMEOUT_MS = 15_000
const SOCKET_TIMEOUT_MS = 15_000

interface WebSocketClientOptions {
  origin: string
  headers?: Record<string, string>
  perMessageDeflate: boolean
}

export interface WebSocketLike {
  readonly readyState: number
  on(event: 'open', listener: () => void): this
  on(event: 'message', listener: (data: unknown) => void): this
  on(event: 'close', listener: (code: number) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  once(event: 'close', listener: (code: number) => void): this
  close(code?: number, reason?: string): void
  terminate(): void
}

interface WebSocketConstructor {
  new (
    address: string,
    protocols: readonly string[],
    options: WebSocketClientOptions,
  ): WebSocketLike
}

export interface RealtimeEnvelope {
  protocolVersion: string
  resetEpoch: number
  stream: 'public' | 'screen' | 'admin' | 'participant'
  eventSeq: number
  eventId: string
  type: string
  committedAt: string
  payload: unknown
}

export interface HttpResponse<T = unknown> {
  status: number
  body: T
  cookie: string | null
}

export interface HttpRequestOptions {
  cookie?: string
  idempotencyKey?: string
  body?: unknown
  timeoutMs?: number
}

export class SanitizedProtocolError extends Error {
  readonly operation: string
  readonly status: number | null
  readonly code: string

  constructor(input: {
    operation: string
    status?: number | null
    code: string
  }) {
    super(`${input.operation} failed (${input.code})`)
    this.name = 'SanitizedProtocolError'
    this.operation = input.operation
    this.status = input.status ?? null
    this.code = input.code
  }
}

function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Unable to reserve a loopback port'))
        return
      }
      const port = address.port
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}

function cookiePair(setCookie: string | null): string | null {
  if (!setCookie) return null
  const separator = setCookie.indexOf(';')
  return separator === -1 ? setCookie : setCookie.slice(0, separator)
}

function apiErrorCode(body: unknown): string {
  if (!body || typeof body !== 'object') return 'INVALID_RESPONSE'
  const error = (body as { error?: unknown }).error
  if (!error || typeof error !== 'object') return 'UNEXPECTED_STATUS'
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : 'UNEXPECTED_STATUS'
}

function transportErrorCode(error: unknown): string {
  const cause =
    error && typeof error === 'object'
      ? (error as { cause?: unknown }).cause
      : undefined
  const rawCode =
    cause && typeof cause === 'object'
      ? (cause as { code?: unknown }).code
      : undefined
  if (typeof rawCode !== 'string') return 'TRANSPORT_ERROR'
  const safeCodes = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
    'UND_ERR_SOCKET',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
  ])
  return safeCodes.has(rawCode) ? `TRANSPORT_${rawCode}` : 'TRANSPORT_ERROR'
}

function parseEnvelope(data: unknown): RealtimeEnvelope {
  const text =
    typeof data === 'string'
      ? data
      : Buffer.isBuffer(data)
        ? data.toString('utf8')
        : data instanceof ArrayBuffer
          ? Buffer.from(data).toString('utf8')
          : String(data)
  const value = JSON.parse(text) as Partial<RealtimeEnvelope>
  if (
    value.protocolVersion !== '1' ||
    typeof value.resetEpoch !== 'number' ||
    typeof value.eventSeq !== 'number' ||
    typeof value.eventId !== 'string' ||
    typeof value.type !== 'string' ||
    typeof value.committedAt !== 'string' ||
    !['public', 'screen', 'admin', 'participant'].includes(value.stream ?? '')
  ) {
    throw new SanitizedProtocolError({
      operation: 'websocket-envelope',
      code: 'INVALID_RESPONSE',
    })
  }
  return value as RealtimeEnvelope
}

function resolveWebSocketConstructor(): WebSocketConstructor {
  const backendRequire = createRequire(
    path.resolve(BACKEND_ROOT, 'package.json'),
  )
  const pluginEntry = backendRequire.resolve('@fastify/websocket')
  const pluginRequire = createRequire(pluginEntry)
  return pluginRequire('ws') as WebSocketConstructor
}

export interface LoadFixture {
  readonly config: AppConfig
  readonly manifest: DemoSeedManifest
  readonly origin: string
  readonly baseUrl: string
  readonly temporaryDirectory: string
  request<T = unknown>(
    operation: string,
    method: 'GET' | 'POST' | 'PUT',
    requestPath: string,
    options?: HttpRequestOptions,
  ): Promise<HttpResponse<T>>
  connectWebSocket(input: {
    stream: 'screen' | 'participant'
    resetEpoch: number
    afterEventSeq: number
    cookie?: string
    onEnvelope(envelope: RealtimeEnvelope): void
    onClose?(code: number): void
  }): Promise<WebSocketLike>
  restart(): Promise<void>
  close(): Promise<void>
}

function removeLoadTemporaryDirectory(temporaryDirectory: string): void {
  const resolvedRoot = path.resolve(temporaryDirectory)
  const resolvedTemp = path.resolve(os.tmpdir())
  if (
    resolvedRoot === resolvedTemp ||
    !resolvedRoot.startsWith(`${resolvedTemp}${path.sep}`) ||
    !path.basename(resolvedRoot).startsWith('sysu-welcome-g4-')
  ) {
    throw new Error('Refusing to remove an unexpected load-test directory')
  }
  fs.rmSync(resolvedRoot, { recursive: true, force: true })
}

export async function createLoadFixture(): Promise<LoadFixture> {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'sysu-welcome-g4-'),
  )
  let app: Awaited<ReturnType<typeof buildApp>> | null = null
  let setup: {
    port: number
    origin: string
    config: AppConfig
    manifest: DemoSeedManifest
  } | null = null

  try {
    const port = await reserveLoopbackPort()
    const origin = `http://127.0.0.1:${port}`
    const config: AppConfig = {
      host: '127.0.0.1',
      port,
      databasePath: path.join(temporaryDirectory, 'demo.sqlite'),
      seedManifestPath: path.join(temporaryDirectory, 'demo-seed-manifest.json'),
      migrationsPath: path.join(BACKEND_ROOT, 'migrations'),
      allowedOrigins: [origin],
      logLevel: 'silent',
      seedParticipantCount: PARTICIPANT_COUNT,
    }

    const database = openDatabase(config.databasePath)
    try {
      migrateDatabase(database, config.migrationsPath)
      seedDemoDatabase(database, {
        manifestPath: config.seedManifestPath,
        participantCount: PARTICIPANT_COUNT,
      })
    } finally {
      database.close()
    }
    const manifest = readSeedManifest(config.seedManifestPath)
    app = await buildApp({ config, logger: false })
    await app.listen({ host: config.host, port: config.port })
    setup = { port, origin, config, manifest }
  } catch (error) {
    let cleanupError: unknown = null
    if (app) {
      try {
        await app.close()
      } catch (closeError) {
        cleanupError = closeError
      }
      app = null
    }
    try {
      removeLoadTemporaryDirectory(temporaryDirectory)
    } catch (removeError) {
      cleanupError ??= removeError
    }
    if (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Load fixture setup and cleanup both failed',
      )
    }
    throw error
  }
  if (!setup || !app) throw new Error('Load fixture setup did not complete')

  const { port, origin, config, manifest } = setup
  let closed = false

  const start = async (): Promise<void> => {
    app = await buildApp({ config, logger: false })
    await app.listen({ host: config.host, port: config.port })
  }
  const request: LoadFixture['request'] = async (
    operation,
    method,
    requestPath,
    options = {},
  ) => {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? HTTP_TIMEOUT_MS,
    )
    timeout.unref()
    try {
      const headers: Record<string, string> = {
        accept: 'application/json',
        origin,
      }
      if (options.cookie) headers.cookie = options.cookie
      if (options.idempotencyKey) {
        headers['idempotency-key'] = options.idempotencyKey
      }
      if (options.body !== undefined) headers['content-type'] = 'application/json'
      const response = await fetch(`${origin}${requestPath}`, {
        method,
        headers,
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
        signal: controller.signal,
      })
      let body: unknown
      try {
        body = await response.json()
      } catch {
        throw new SanitizedProtocolError({
          operation,
          status: response.status,
          code: 'INVALID_RESPONSE',
        })
      }
      if (!response.ok) {
        throw new SanitizedProtocolError({
          operation,
          status: response.status,
          code: apiErrorCode(body),
        })
      }
      return {
        status: response.status,
        body: body as never,
        cookie: cookiePair(response.headers.get('set-cookie')),
      }
    } catch (error) {
      if (error instanceof SanitizedProtocolError) throw error
      throw new SanitizedProtocolError({
        operation,
        code:
          error instanceof Error && error.name === 'AbortError'
            ? 'TIMEOUT'
            : transportErrorCode(error),
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    config,
    manifest,
    origin,
    baseUrl: origin,
    temporaryDirectory,
    request,
    async connectWebSocket(input) {
      const WebSocketClient = resolveWebSocketConstructor()
      const query = new URLSearchParams({
        stream: input.stream,
        resetEpoch: String(input.resetEpoch),
        afterEventSeq: String(input.afterEventSeq),
      })
      const socket = new WebSocketClient(
        `ws://127.0.0.1:${port}/ws?${query.toString()}`,
        [],
        {
          origin,
          ...(input.cookie ? { headers: { cookie: input.cookie } } : {}),
          perMessageDeflate: false,
        },
      )
      socket.on('message', (data) => {
        try {
          input.onEnvelope(parseEnvelope(data))
        } catch {
          input.onEnvelope({
            protocolVersion: '1',
            resetEpoch: 0,
            stream: 'public',
            eventSeq: 0,
            eventId: 'invalid',
            type: '__invalid__',
            committedAt: new Date(0).toISOString(),
            payload: null,
          })
        }
      })
      if (input.onClose) socket.on('close', input.onClose)
      await new Promise<void>((resolve, reject) => {
        let settled = false
        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          socket.terminate()
          reject(
            new SanitizedProtocolError({
              operation: `websocket-${input.stream}`,
              code: 'TIMEOUT',
            }),
          )
        }, SOCKET_TIMEOUT_MS)
        timeout.unref()
        socket.on('open', () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          resolve()
        })
        socket.on('error', () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          reject(
            new SanitizedProtocolError({
              operation: `websocket-${input.stream}`,
              code: 'TRANSPORT_ERROR',
            }),
          )
        })
      })
      return socket
    },
    async restart() {
      if (!app) throw new Error('Load fixture is unavailable')
      await app.close()
      app = null
      await start()
    },
    async close() {
      if (closed) return
      closed = true
      let closeError: unknown = null
      if (app) {
        try {
          await app.close()
        } catch (error) {
          closeError = error
        }
        app = null
      }
      let removeError: unknown = null
      try {
        removeLoadTemporaryDirectory(temporaryDirectory)
      } catch (error) {
        removeError = error
      }
      if (closeError && removeError) {
        throw new AggregateError(
          [closeError, removeError],
          'Load fixture shutdown and cleanup both failed',
        )
      }
      if (closeError) throw closeError
      if (removeError) throw removeError
    },
  }
}

export function closeWebSockets(sockets: readonly WebSocketLike[]): void {
  for (const socket of sockets) {
    if (socket.readyState === 0 || socket.readyState === 1) {
      socket.close(1000, 'load test complete')
    }
  }
}
