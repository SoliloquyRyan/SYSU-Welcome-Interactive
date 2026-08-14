import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  HealthResponseSchema,
  V2HandshakeErrorResponseSchema,
  V2HandshakeResponseSchema,
  V2ProtocolCapabilitiesResponseSchema,
  V2RealtimeErrorFrameSchema,
  V2RealtimeHelloAckSchema,
  V2RealtimeNotActiveSchema,
} from '../../packages/contracts/src/index.js'
import {
  createG2Harness,
  TEST_AUTHORITY,
  TEST_ORIGIN,
  type G2Harness,
} from '../helpers/g2-harness.js'

type InjectedSocket = Awaited<ReturnType<G2Harness['app']['injectWS']>>

function decodeMessage(data: unknown): unknown {
  if (typeof data === 'string') return JSON.parse(data)
  if (data instanceof ArrayBuffer) {
    return JSON.parse(Buffer.from(data).toString('utf8'))
  }
  if (ArrayBuffer.isView(data)) {
    return JSON.parse(
      Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8'),
    )
  }
  return JSON.parse(String(data))
}

function waitForClose(
  socket: InjectedSocket,
  timeoutMs = 3_000,
): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Expected v2 WebSocket close was not received')),
      timeoutMs,
    )
    socket.addEventListener(
      'close',
      (event) => {
        clearTimeout(timeout)
        resolve({ code: event.code, reason: event.reason })
      },
      { once: true },
    )
  })
}

async function openV2Socket(harness: G2Harness): Promise<{
  socket: InjectedSocket
  frames: unknown[]
}> {
  const frames: unknown[] = []
  const socket = await harness.app.injectWS(
    '/ws/v2',
    {
      headers: {
        host: TEST_AUTHORITY,
        origin: TEST_ORIGIN,
      },
    },
    {
      onInit(client) {
        client.on('message', (data) => frames.push(decodeMessage(data)))
      },
    },
  )
  return { socket, frames }
}

describe('V2-01 protocol discovery and negotiation', () => {
  let harness: G2Harness

  beforeEach(async () => {
    harness = await createG2Harness()
  })

  afterEach(async () => {
    await harness.close()
  })

  it('discovers v2 contracts without claiming that v2 business is active', async () => {
    const response = await harness.request({
      method: 'GET',
      url: '/api/protocol-capabilities',
    })
    const body = V2ProtocolCapabilitiesResponseSchema.parse(response.json())

    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(body).toMatchObject({
      contractVersion: '2',
      activeRuntimeVersion: '1',
      activationState: 'CONTRACTS_READY',
      endpoints: {
        v2Handshake: '/api/v2/handshake',
        v2Realtime: '/ws/v2',
      },
      capabilities: {
        v2BusinessWrites: false,
        v2Snapshots: false,
        v2RealtimeEvents: false,
        v1WriteAcceptedByV2: false,
      },
    })

    const legacyHealth = HealthResponseSchema.parse(
      (
        await harness.request({ method: 'GET', url: '/api/health' })
      ).json(),
    )
    expect(legacyHealth.protocolVersion).toBe('1')
  })

  it('accepts only a strict v2 HTTP handshake and keeps business disabled', async () => {
    const response = await harness.unsafeRequest({
      method: 'POST',
      url: '/api/v2/handshake',
      payload: {
        protocolVersion: '2',
        clientSurface: 'WELCOME',
        clientBuild: 'v2-01-test',
      },
    })
    const body = V2HandshakeResponseSchema.parse(response.json())

    expect(response.statusCode).toBe(200)
    expect(body).toMatchObject({
      status: 'ok',
      protocolVersion: '2',
      contractVersion: '2',
      activeRuntimeVersion: '1',
      activationState: 'CONTRACTS_READY',
      clientSurface: 'WELCOME',
      capabilities: {
        v2BusinessWrites: false,
        v2Snapshots: false,
        v2RealtimeEvents: false,
      },
    })
  })

  it.each([
    ['missing', { clientSurface: 'SCREEN', clientBuild: 'v2-01-test' }],
    [
      'v1',
      {
        protocolVersion: '1',
        clientSurface: 'SCREEN',
        clientBuild: 'v2-01-test',
      },
    ],
  ])('rejects a %s HTTP protocol version explicitly', async (_label, payload) => {
    const response = await harness.unsafeRequest({
      method: 'POST',
      url: '/api/v2/handshake',
      payload,
    })
    const body = V2HandshakeErrorResponseSchema.parse(response.json())

    expect(response.statusCode).toBe(409)
    expect(body).toMatchObject({
      protocolVersion: '2',
      contractVersion: '2',
      activeRuntimeVersion: '1',
      activationState: 'CONTRACTS_READY',
      resetEpoch: null,
      error: {
        code: 'PROTOCOL_VERSION_MISMATCH',
        retryable: false,
      },
    })
  })

  it('rejects v1 stage fields through the strict v2 schema', async () => {
    const response = await harness.unsafeRequest({
      method: 'POST',
      url: '/api/v2/handshake',
      payload: {
        protocolVersion: '2',
        clientSurface: 'ADMIN',
        clientBuild: 'v2-01-test',
        stage: 1,
      },
    })
    const body = V2HandshakeErrorResponseSchema.parse(response.json())

    expect(response.statusCode).toBe(400)
    expect(body.error.code).toBe('VALIDATION_FAILED')
  })

  it.each([
    {
      label: 'malformed JSON',
      contentType: 'application/json',
      payload: '{protocolVersion:',
      statusCode: 400,
    },
    {
      label: 'unsupported content type',
      contentType: 'application/xml',
      payload: '<hello protocolVersion=2 />',
      statusCode: 415,
    },
    {
      label: 'oversized body',
      contentType: 'application/json',
      payload: JSON.stringify({
        protocolVersion: '2',
        clientSurface: 'WELCOME',
        clientBuild: 'x'.repeat(5_000),
      }),
      statusCode: 413,
    },
  ])('keeps $label failures inside the v2 error envelope', async (testCase) => {
    const response = await harness.unsafeRequest({
      method: 'POST',
      url: '/api/v2/handshake',
      headers: { 'content-type': testCase.contentType },
      payload: testCase.payload,
    })
    const body = V2HandshakeErrorResponseSchema.parse(response.json())

    expect(response.statusCode).toBe(testCase.statusCode)
    expect(body).toMatchObject({
      protocolVersion: '2',
      contractVersion: '2',
      activeRuntimeVersion: '1',
      activationState: 'CONTRACTS_READY',
      resetEpoch: null,
      error: {
        code: 'VALIDATION_FAILED',
        retryable: false,
      },
    })
  })

  it('reports unexpected handshake failures as retryable v2 service errors', async () => {
    const toISOString = vi
      .spyOn(Date.prototype, 'toISOString')
      .mockImplementationOnce(() => {
        throw new Error('synthetic handshake failure')
      })
    let response
    try {
      response = await harness.unsafeRequest({
        method: 'POST',
        url: '/api/v2/handshake',
        payload: {
          protocolVersion: '2',
          clientSurface: 'WELCOME',
          clientBuild: 'v2-01-test',
        },
      })
    } finally {
      toISOString.mockRestore()
    }
    const body = V2HandshakeErrorResponseSchema.parse(response.json())

    expect(response.statusCode).toBe(500)
    expect(body).toMatchObject({
      protocolVersion: '2',
      activeRuntimeVersion: '1',
      activationState: 'CONTRACTS_READY',
      resetEpoch: null,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        retryable: true,
      },
    })
  })

  it('rejects a v1 WebSocket HELLO before sending any business fact', async () => {
    const { socket, frames } = await openV2Socket(harness)
    const closed = waitForClose(socket)
    socket.send(
      JSON.stringify({
        type: 'HELLO',
        protocolVersion: '1',
        clientSurface: 'SCREEN',
        clientBuild: 'v1-preview',
      }),
    )

    await expect(closed).resolves.toEqual({
      code: 1008,
      reason: 'V2_PROTOCOL_REJECTED',
    })
    expect(frames).toHaveLength(1)
    const error = V2RealtimeErrorFrameSchema.parse(frames[0])
    expect(error.error.code).toBe('PROTOCOL_VERSION_MISMATCH')
    expect(JSON.stringify(frames)).not.toContain('eventSeq')
    expect(JSON.stringify(frames)).not.toContain('runtime.stage.changed')
  })

  it('acknowledges v2 HELLO, declares NOT_ACTIVE and never joins the v1 hub', async () => {
    const { socket, frames } = await openV2Socket(harness)
    const closed = waitForClose(socket)
    socket.send(
      JSON.stringify({
        type: 'HELLO',
        protocolVersion: '2',
        clientSurface: 'SCREEN',
        clientBuild: 'v2-01-test',
      }),
    )

    await expect(closed).resolves.toEqual({
      code: 1013,
      reason: 'V2_RUNTIME_NOT_ACTIVE',
    })
    expect(frames).toHaveLength(2)
    const ack = V2RealtimeHelloAckSchema.parse(frames[0])
    const notActive = V2RealtimeNotActiveSchema.parse(frames[1])
    expect(ack).toMatchObject({
      protocolVersion: '2',
      activeRuntimeVersion: '1',
      activationState: 'CONTRACTS_READY',
      capabilities: { v2RealtimeEvents: false },
    })
    expect(notActive.reason).toBe('V2_RUNTIME_NOT_ACTIVE')
    expect(JSON.stringify(frames)).not.toContain('eventSeq')
    expect(JSON.stringify(frames)).not.toContain('payload')
  })

  it('times out a socket that never negotiates without leaking a fact', async () => {
    const { socket, frames } = await openV2Socket(harness)

    await expect(waitForClose(socket)).resolves.toEqual({
      code: 1008,
      reason: 'V2_HELLO_REQUIRED',
    })
    expect(frames).toHaveLength(1)
    const error = V2RealtimeErrorFrameSchema.parse(frames[0])
    expect(error.error.code).toBe('PROTOCOL_VERSION_MISMATCH')
    expect(JSON.stringify(frames)).not.toContain('eventSeq')
  })
})
