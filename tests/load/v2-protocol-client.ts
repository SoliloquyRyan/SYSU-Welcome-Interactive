import { createRequire } from 'node:module'
import path from 'node:path'

import {
  V2RealtimeEventEnvelopeSchema,
  V2RealtimeHelloAckSchema,
  V2RealtimeServerControlSchema,
  V2RealtimeSubscribedSchema,
  type V2RealtimeEventEnvelope,
} from '../../packages/contracts/src/index.js'
import { BACKEND_ROOT } from '../../backend/src/config.js'

const HTTP_TIMEOUT_MS = 15_000
const SOCKET_TIMEOUT_MS = 20_000

interface WebSocketClientOptions {
  origin: string
  headers?: Record<string, string>
  perMessageDeflate: boolean
}

export interface V2WebSocketLike {
  readonly readyState: number
  on(event: 'open', listener: () => void): this
  on(event: 'message', listener: (data: unknown) => void): this
  on(event: 'close', listener: (code: number) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  once(event: 'close', listener: (code: number) => void): this
  send(data: string): void
  close(code?: number, reason?: string): void
  terminate(): void
}

interface WebSocketConstructor {
  new (
    address: string,
    protocols: readonly string[],
    options: WebSocketClientOptions,
  ): V2WebSocketLike
}

export interface V2HttpResponse<T = unknown> {
  status: number
  body: T
  cookie: string | null
}

export interface V2HttpRequestOptions {
  cookie?: string
  body?: unknown
  timeoutMs?: number
}

export interface V2HttpClient {
  request<T = unknown>(
    operation: string,
    method: 'GET' | 'POST',
    requestPath: string,
    options?: V2HttpRequestOptions,
  ): Promise<V2HttpResponse<T>>
}

export class SanitizedV2ProtocolError extends Error {
  readonly operation: string
  readonly status: number | null
  readonly code: string

  constructor(input: { operation: string; status?: number | null; code: string }) {
    super(`${input.operation} failed (${input.code})`)
    this.name = 'SanitizedV2ProtocolError'
    this.operation = input.operation
    this.status = input.status ?? null
    this.code = input.code
  }
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
  if (error instanceof Error && error.name === 'AbortError') return 'TIMEOUT'
  const cause = error && typeof error === 'object'
    ? (error as { cause?: unknown }).cause
    : undefined
  const rawCode = cause && typeof cause === 'object'
    ? (cause as { code?: unknown }).code
    : undefined
  const allowed = new Set([
    'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
    'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  ])
  return typeof rawCode === 'string' && allowed.has(rawCode)
    ? `TRANSPORT_${rawCode}`
    : 'TRANSPORT_ERROR'
}

function resolveWebSocketConstructor(): WebSocketConstructor {
  const backendRequire = createRequire(path.resolve(BACKEND_ROOT, 'package.json'))
  const pluginEntry = backendRequire.resolve('@fastify/websocket')
  return createRequire(pluginEntry)('ws') as WebSocketConstructor
}

function parseJsonFrame(data: unknown): unknown {
  const text = typeof data === 'string'
    ? data
    : Buffer.isBuffer(data)
      ? data.toString('utf8')
      : data instanceof ArrayBuffer
        ? Buffer.from(data).toString('utf8')
        : String(data)
  return JSON.parse(text) as unknown
}

export function createV2HttpClient(
  baseUrl: string,
  requestOrigin = baseUrl,
): V2HttpClient {
  return {
    async request<T>(
      operation: string,
      method: 'GET' | 'POST',
      requestPath: string,
      options: V2HttpRequestOptions = {},
    ): Promise<V2HttpResponse<T>> {
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? HTTP_TIMEOUT_MS,
      )
      timeout.unref()
      try {
        const headers: Record<string, string> = {
          accept: 'application/json',
          origin: requestOrigin,
        }
        if (options.cookie) headers.cookie = options.cookie
        if (options.body !== undefined) headers['content-type'] = 'application/json'
        const response = await fetch(`${baseUrl}${requestPath}`, {
          method,
          headers,
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
          signal: controller.signal,
        })
        let body: unknown
        try {
          body = await response.json()
        } catch {
          throw new SanitizedV2ProtocolError({
            operation,
            status: response.status,
            code: 'INVALID_RESPONSE',
          })
        }
        if (!response.ok) {
          throw new SanitizedV2ProtocolError({
            operation,
            status: response.status,
            code: apiErrorCode(body),
          })
        }
        return {
          status: response.status,
          body: body as T,
          cookie: cookiePair(response.headers.get('set-cookie')),
        }
      } catch (error) {
        if (error instanceof SanitizedV2ProtocolError) throw error
        throw new SanitizedV2ProtocolError({
          operation,
          code: transportErrorCode(error),
        })
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

export async function connectV2WebSocket(input: {
  baseUrl: string
  requestOrigin?: string
  cookie?: string
  clientSurface: 'WELCOME' | 'SCREEN' | 'ADMIN'
  resetEpoch: number
  streams: ReadonlyArray<{ streamId: string; streamSeq: number }>
  onEvent(event: V2RealtimeEventEnvelope): void
  onProtocolError?(code: string): void
  onControlError?(code: string): void
  onClose?(code: number): void
}): Promise<V2WebSocketLike> {
  const WebSocketClient = resolveWebSocketConstructor()
  const socket = new WebSocketClient(
    input.baseUrl.replace(/^http:/u, 'ws:') + '/ws/v2',
    [],
    {
      origin: input.requestOrigin ?? input.baseUrl,
      ...(input.cookie ? { headers: { cookie: input.cookie } } : {}),
      perMessageDeflate: false,
    },
  )
  if (input.onClose) socket.on('close', input.onClose)

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let helloAccepted = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      socket.terminate()
      reject(new SanitizedV2ProtocolError({
        operation: `websocket-${input.clientSurface.toLowerCase()}`,
        code: 'TIMEOUT',
      }))
    }, SOCKET_TIMEOUT_MS)
    timeout.unref()
    const fail = (code: string, protocolViolation = true) => {
      if (protocolViolation) input.onProtocolError?.(code)
      if (settled) {
        if (protocolViolation) socket.terminate()
        return
      }
      settled = true
      clearTimeout(timeout)
      socket.terminate()
      reject(new SanitizedV2ProtocolError({
        operation: `websocket-${input.clientSurface.toLowerCase()}`,
        code,
      }))
    }

    socket.on('open', () => {
      socket.send(JSON.stringify({
        type: 'HELLO',
        protocolVersion: '2',
        clientSurface: input.clientSurface,
        clientBuild: 'v2-09-load',
      }))
    })
    socket.on('message', (data) => {
      let frame: unknown
      try {
        frame = parseJsonFrame(data)
      } catch {
        fail('INVALID_JSON_FRAME')
        return
      }
      const event = V2RealtimeEventEnvelopeSchema.safeParse(frame)
      if (event.success) {
        input.onEvent(event.data)
        return
      }
      const control = V2RealtimeServerControlSchema.safeParse(frame)
      if (!control.success) {
        fail('INVALID_PROTOCOL_FRAME')
        return
      }
      if (control.data.type === 'HELLO_ACK') {
        const hello = V2RealtimeHelloAckSchema.parse(control.data)
        if (hello.activationState !== 'ACTIVE' || hello.resetEpoch !== input.resetEpoch) {
          fail('V2_RUNTIME_NOT_ACTIVE')
          return
        }
        helloAccepted = true
        socket.send(JSON.stringify({
          type: 'SUBSCRIBE',
          protocolVersion: '2',
          resetEpoch: input.resetEpoch,
          streams: input.streams,
        }))
        return
      }
      if (control.data.type === 'SUBSCRIBED') {
        if (!helloAccepted) {
          fail('SUBSCRIBED_BEFORE_HELLO_ACK')
          return
        }
        const subscribed = V2RealtimeSubscribedSchema.parse(control.data)
        if (subscribed.resetEpoch !== input.resetEpoch) {
          fail('SUBSCRIBED_WRONG_EPOCH')
          return
        }
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          resolve()
        }
        return
      }
      if (control.data.type === 'ERROR') {
        input.onControlError?.(control.data.error.code)
        fail(control.data.error.code, false)
        return
      }
      fail('V2_RUNTIME_NOT_ACTIVE')
    })
    socket.on('error', () => fail('TRANSPORT_ERROR'))
    socket.on('close', (code) => {
      if (!settled) fail(`SOCKET_CLOSED_${code}`)
    })
  })
  return socket
}

export async function connectRawV2WebSocket(input: {
  baseUrl: string
  requestOrigin?: string
  cookie?: string
  onFrame(frame: unknown): void
  onClose?(code: number): void
}): Promise<V2WebSocketLike> {
  const WebSocketClient = resolveWebSocketConstructor()
  const socket = new WebSocketClient(
    input.baseUrl.replace(/^http:/u, 'ws:') + '/ws/v2',
    [],
    {
      origin: input.requestOrigin ?? input.baseUrl,
      ...(input.cookie ? { headers: { cookie: input.cookie } } : {}),
      perMessageDeflate: false,
    },
  )
  socket.on('message', (data) => {
    try {
      input.onFrame(parseJsonFrame(data))
    } catch {
      input.onFrame({ type: '__INVALID_JSON_FRAME__' })
    }
  })
  if (input.onClose) socket.on('close', input.onClose)
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      socket.terminate()
      reject(new SanitizedV2ProtocolError({
        operation: 'websocket-raw',
        code: 'TIMEOUT',
      }))
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
      reject(new SanitizedV2ProtocolError({
        operation: 'websocket-raw',
        code: 'TRANSPORT_ERROR',
      }))
    })
  })
  return socket
}

export function closeV2WebSockets(sockets: readonly V2WebSocketLike[]): void {
  for (const socket of sockets) {
    if (socket.readyState === 0 || socket.readyState === 1) {
      socket.close(1000, 'v2 load complete')
    }
  }
}
