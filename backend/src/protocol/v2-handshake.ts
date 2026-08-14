import {
  V2HandshakeErrorResponseSchema,
  V2HandshakeRequestSchema,
  V2HandshakeResponseSchema,
  V2ProtocolCapabilitiesResponseSchema,
  V2RealtimeErrorFrameSchema,
  V2RealtimeHelloAckSchema,
  V2RealtimeHelloSchema,
  V2RealtimeNotActiveSchema,
} from '@sysu-welcome/contracts'
import type { SqliteDatabase } from '../db/open-database.js'
import { readProtocolRuntime } from '../db/v2-foundation.js'

// These helpers are deliberately lifecycle-aware: before cutover they expose
// contract negotiation only; after cutover the same endpoints truthfully
// advertise the active v2 snapshot and realtime capabilities.
export const V2_CAPABILITIES = Object.freeze({
  v2BusinessWrites: false,
  v2Snapshots: false,
  v2RealtimeEvents: false,
  snapshotFirst: true,
  splitStreams: true,
  v1WriteAcceptedByV2: false,
})

const V2_ACTIVATION = Object.freeze({
  contractVersion: '2' as const,
  activeRuntimeVersion: '1' as const,
  activationState: 'CONTRACTS_READY' as const,
})

const V2_ENDPOINTS = Object.freeze({
  v2Handshake: '/api/v2/handshake',
  v2Realtime: '/ws/v2',
})

type V2HandshakeErrorCode =
  | 'PROTOCOL_VERSION_MISMATCH'
  | 'VALIDATION_FAILED'
  | 'SERVICE_UNAVAILABLE'

function v2Error(
  code: V2HandshakeErrorCode,
  message: string,
  requestId: string,
) {
  return {
    code,
    message,
    requestId,
    retryable: code === 'SERVICE_UNAVAILABLE',
  } as const
}

function lifecycle(database?: SqliteDatabase) {
  const active = database ? readProtocolRuntime(database) : null
  if (active?.activeProtocolVersion === '2' && active.activationState === 'V2_ACTIVE') {
    const resetEpoch = Number(
      database!
        .prepare('SELECT reset_epoch FROM v2_runtime_state WHERE id = 1')
        .pluck()
        .get(),
    )
    return {
      contractVersion: '2' as const,
      activeRuntimeVersion: '2' as const,
      activationState: 'ACTIVE' as const,
      resetEpoch,
      capabilities: {
        v2BusinessWrites: true, v2Snapshots: true, v2RealtimeEvents: true,
        snapshotFirst: true, splitStreams: true, v1WriteAcceptedByV2: false,
      } as const,
    }
  }
  return { ...V2_ACTIVATION, capabilities: V2_CAPABILITIES }
}

export function protocolCapabilities(now: Date, database?: SqliteDatabase) {
  const state = lifecycle(database)
  return V2ProtocolCapabilitiesResponseSchema.parse({
    service: 'sysu-welcome-backend',
    contractVersion: state.contractVersion,
    activeRuntimeVersion: state.activeRuntimeVersion,
    activationState: state.activationState,
    ...(state.activationState === 'ACTIVE' ? { resetEpoch: state.resetEpoch } : {}),
    serverTime: now.toISOString(),
    endpoints: V2_ENDPOINTS,
    capabilities: state.capabilities,
  })
}

export function v2HandshakeError(
  code: V2HandshakeErrorCode,
  message: string,
  requestId: string,
  database?: SqliteDatabase,
) {
  const state = lifecycle(database)
  const resetEpoch = state.activationState === 'ACTIVE'
    ? Number(database!.prepare('SELECT reset_epoch FROM v2_runtime_state WHERE id = 1').pluck().get())
    : null
  return V2HandshakeErrorResponseSchema.parse({
    status: 'error',
    protocolVersion: '2',
    contractVersion: state.contractVersion,
    activeRuntimeVersion: state.activeRuntimeVersion,
    activationState: state.activationState,
    resetEpoch,
    error: v2Error(code, message, requestId),
  })
}

export function negotiateV2Handshake(
  input: unknown,
  requestId: string,
  now: Date,
  database?: SqliteDatabase,
):
  | { accepted: true; body: unknown }
  | { accepted: false; statusCode: 400 | 409; body: unknown } {
  const requestedVersion =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as { protocolVersion?: unknown }).protocolVersion
      : undefined
  if (requestedVersion !== '2') {
    return {
      accepted: false,
      statusCode: 409,
      body: v2HandshakeError(
        'PROTOCOL_VERSION_MISMATCH',
        '此入口只接受协议 v2；请先完成明确的版本协商。',
        requestId,
        database,
      ),
    }
  }

  const parsed = V2HandshakeRequestSchema.safeParse(input)
  if (!parsed.success) {
    return {
      accepted: false,
      statusCode: 400,
      body: v2HandshakeError(
        'VALIDATION_FAILED',
        'v2 握手字段无效；不得混入 v1 阶段或其他未声明字段。',
        requestId,
        database,
      ),
    }
  }

  const state = lifecycle(database)
  return {
    accepted: true,
    body: V2HandshakeResponseSchema.parse({
      status: 'ok',
      protocolVersion: '2',
      contractVersion: state.contractVersion,
      activeRuntimeVersion: state.activeRuntimeVersion,
      activationState: state.activationState,
      ...(state.activationState === 'ACTIVE' ? { resetEpoch: state.resetEpoch } : {}),
      clientSurface: parsed.data.clientSurface,
      serverTime: now.toISOString(),
      capabilities: state.capabilities,
    }),
  }
}

export function parseV2RealtimeHello(
  input: unknown,
  requestId: string,
  database?: SqliteDatabase,
):
  | { accepted: true; hello: unknown }
  | { accepted: false; frame: unknown } {
  const requestedVersion =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as { protocolVersion?: unknown }).protocolVersion
      : undefined
  if (requestedVersion !== '2') {
    return {
      accepted: false,
      frame: v2RealtimeError(
        'PROTOCOL_VERSION_MISMATCH',
        'WebSocket 首帧必须明确声明协议 v2。',
        requestId,
        database,
      ),
    }
  }

  const parsed = V2RealtimeHelloSchema.safeParse(input)
  if (!parsed.success) {
    return {
      accepted: false,
      frame: v2RealtimeError(
        'VALIDATION_FAILED',
        'WebSocket v2 HELLO 字段无效。',
        requestId,
        database,
      ),
    }
  }
  return { accepted: true, hello: parsed.data }
}

export function v2RealtimeError(
  code: V2HandshakeErrorCode,
  message: string,
  requestId: string,
  database?: SqliteDatabase,
) {
  const state = lifecycle(database)
  const resetEpoch = state.activationState === 'ACTIVE'
    ? Number(database!.prepare('SELECT reset_epoch FROM v2_runtime_state WHERE id = 1').pluck().get())
    : null
  return V2RealtimeErrorFrameSchema.parse({
    type: 'ERROR',
    protocolVersion: '2',
    contractVersion: state.contractVersion,
    activeRuntimeVersion: state.activeRuntimeVersion,
    activationState: state.activationState,
    resetEpoch,
    error: v2Error(code, message, requestId),
  })
}

export function v2RealtimeHelloAck(hello: unknown, now: Date, database?: SqliteDatabase) {
  const parsed = V2RealtimeHelloSchema.parse(hello)
  const state = lifecycle(database)
  const resetEpoch = state.activationState === 'ACTIVE'
    ? Number(database!.prepare('SELECT reset_epoch FROM v2_runtime_state WHERE id = 1').pluck().get())
    : undefined
  return V2RealtimeHelloAckSchema.parse({
    type: 'HELLO_ACK',
    protocolVersion: '2',
    contractVersion: state.contractVersion,
    activeRuntimeVersion: state.activeRuntimeVersion,
    activationState: state.activationState,
    ...(resetEpoch === undefined ? {} : { resetEpoch }),
    clientSurface: parsed.clientSurface,
    serverTime: now.toISOString(),
    capabilities: state.capabilities,
  })
}

export function isV2RuntimeActive(database: SqliteDatabase): boolean {
  return lifecycle(database).activationState === 'ACTIVE'
}

export function v2RealtimeNotActive() {
  return V2RealtimeNotActiveSchema.parse({
    type: 'NOT_ACTIVE',
    protocolVersion: '2',
    activeRuntimeVersion: '1',
    activationState: 'CONTRACTS_READY',
    reason: 'V2_RUNTIME_NOT_ACTIVE',
  })
}
