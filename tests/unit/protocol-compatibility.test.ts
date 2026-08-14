import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PROTOCOL_ERROR_CODE,
  PROTOCOL_POLICY,
  ProtocolCompatibilityError,
  assertV2CapabilityDiscovery,
  assertV2HandshakeResponse,
  assertProtocolEnvelope,
  createV2HandshakeRequest,
  createProtocolGate,
  isV2RuntimeActive,
} from '../../frontend/src/services/protocol-compatibility.js'
import { createProtocolCapabilityState } from '../../frontend/src/services/protocol-capability-state.js'
import {
  adminApi,
  participantApi,
  protocolCapabilityApi,
  screenApi,
} from '../../frontend/src/services/api.js'

function capabilities(active = false) {
  return {
    v2BusinessWrites: active,
    v2Snapshots: active,
    v2RealtimeEvents: active,
    snapshotFirst: true,
    splitStreams: true,
    v1WriteAcceptedByV2: false,
  }
}

function discovery(active = false) {
  return {
    service: 'sysu-welcome-backend',
    contractVersion: '2',
    activeRuntimeVersion: active ? '2' : '1',
    activationState: active ? 'ACTIVE' : 'CONTRACTS_READY',
    ...(active ? { resetEpoch: 1 } : {}),
    serverTime: '2026-08-13T00:00:00.000Z',
    endpoints: {
      v2Handshake: '/api/v2/handshake',
      v2Realtime: '/ws/v2',
    },
    capabilities: capabilities(active),
  }
}

describe('frontend protocol compatibility', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the current preview on an explicit v1-only boundary', () => {
    const envelope = { protocolVersion: '1', eventSeq: 1 }

    expect(
      assertProtocolEnvelope(envelope, {
        policy: PROTOCOL_POLICY.V1_PREVIEW,
        context: 'preview event',
      }),
    ).toBe(envelope)
  })

  it.each([
    [{}, PROTOCOL_ERROR_CODE.UPGRADE_REQUIRED],
    [{ protocolVersion: '1' }, PROTOCOL_ERROR_CODE.UPGRADE_REQUIRED],
    [{ protocolVersion: 1 }, PROTOCOL_ERROR_CODE.VERSION_MISMATCH],
    [{ protocolVersion: 2 }, PROTOCOL_ERROR_CODE.VERSION_MISMATCH],
    [{ protocolVersion: '3' }, PROTOCOL_ERROR_CODE.VERSION_MISMATCH],
    [null, PROTOCOL_ERROR_CODE.VERSION_MISMATCH],
  ])('blocks an incompatible v2 payload %#', (payload, code) => {
    expect(() =>
      assertProtocolEnvelope(payload, {
        policy: PROTOCOL_POLICY.V2_REQUIRED,
        context: 'v2 snapshot',
      }),
    ).toThrowError(
      expect.objectContaining({
        name: 'ProtocolCompatibilityError',
        code,
        expectedVersion: '2',
      }),
    )
  })

  it('classifies a v2 event received by the v1 preview as an upgrade boundary', () => {
    expect(() =>
      assertProtocolEnvelope(
        { protocolVersion: '2' },
        { policy: PROTOCOL_POLICY.V1_PREVIEW },
      ),
    ).toThrowError(
      expect.objectContaining({
        code: PROTOCOL_ERROR_CODE.UPGRADE_REQUIRED,
      }),
    )
  })

  it('latches the first protocol failure so realtime cannot silently continue', () => {
    const gate = createProtocolGate(PROTOCOL_POLICY.V1_PREVIEW)

    expect(() =>
      gate.accept({ protocolVersion: '2' }, 'realtime event'),
    ).toThrow(ProtocolCompatibilityError)
    expect(gate.blocked).toBe(true)
    expect(gate.failure).toMatchObject({
      code: PROTOCOL_ERROR_CODE.UPGRADE_REQUIRED,
      context: 'realtime event',
    })
    expect(() =>
      gate.accept({ protocolVersion: '1' }, 'later event'),
    ).toThrow(gate.failure)
  })

  it('requires callers to choose a protocol policy explicitly', () => {
    expect(() =>
      assertProtocolEnvelope({ protocolVersion: '1' }),
    ).toThrow(TypeError)
  })

  it('accepts strict contracts-ready discovery without activating v2 runtime', () => {
    const payload = discovery()

    expect(assertV2CapabilityDiscovery(payload)).toBe(payload)
    expect(payload.capabilities).toMatchObject({
      v2BusinessWrites: false,
      v2Snapshots: false,
      v2RealtimeEvents: false,
    })
  })

  it('accepts the strict active tuple and only then reports v2 runtime active', () => {
    const payload = discovery(true)

    expect(assertV2CapabilityDiscovery(payload)).toBe(payload)
    expect(isV2RuntimeActive(payload)).toBe(true)
    expect(isV2RuntimeActive(discovery())).toBe(false)
  })

  it.each([
    [{ ...discovery(), contractVersion: '1' }, PROTOCOL_ERROR_CODE.UPGRADE_REQUIRED],
    [
      { ...discovery(), contractVersion: undefined },
      PROTOCOL_ERROR_CODE.UPGRADE_REQUIRED,
    ],
    [
      { ...discovery(), activeRuntimeVersion: '2' },
      PROTOCOL_ERROR_CODE.VERSION_MISMATCH,
    ],
    [
      {
        ...discovery(true),
        capabilities: capabilities(false),
      },
      PROTOCOL_ERROR_CODE.VERSION_MISMATCH,
    ],
    [
      {
        ...discovery(),
        capabilities: capabilities(true),
      },
      PROTOCOL_ERROR_CODE.VERSION_MISMATCH,
    ],
    [
      { ...discovery(), unexpected: true },
      PROTOCOL_ERROR_CODE.VERSION_MISMATCH,
    ],
  ])('rejects incompatible or malformed discovery %#', (payload, code) => {
    expect(() => assertV2CapabilityDiscovery(payload)).toThrowError(
      expect.objectContaining({ code }),
    )
  })

  it('builds and validates a strict v2 contracts-ready handshake', () => {
    const request = createV2HandshakeRequest({
      clientSurface: 'WELCOME',
      clientBuild: 'test-build',
    })
    expect(request).toEqual({
      protocolVersion: '2',
      clientSurface: 'WELCOME',
      clientBuild: 'test-build',
    })

    const response = {
      status: 'ok',
      protocolVersion: '2',
      contractVersion: '2',
      activeRuntimeVersion: '1',
      activationState: 'CONTRACTS_READY',
      clientSurface: 'WELCOME',
      serverTime: '2026-08-13T00:00:00.000Z',
      capabilities: capabilities(),
    }
    expect(
      assertV2HandshakeResponse(response, { expectedSurface: 'WELCOME' }),
    ).toBe(response)
    expect(() =>
      assertV2HandshakeResponse(response, { expectedSurface: 'ADMIN' }),
    ).toThrowError(
      expect.objectContaining({
        code: PROTOCOL_ERROR_CODE.VERSION_MISMATCH,
      }),
    )
  })

  it('keeps capability state contracts-ready and never claims v2 runtime is active', async () => {
    const client = {
      discover: async () => discovery(),
      handshake: async (input: { clientSurface: string }) => ({
        status: 'ok',
        protocolVersion: '2',
        contractVersion: '2',
        activeRuntimeVersion: '1',
        activationState: 'CONTRACTS_READY',
        clientSurface: input.clientSurface,
        serverTime: '2026-08-13T00:00:00.000Z',
        capabilities: capabilities(),
      }),
    }
    const state = createProtocolCapabilityState(client)

    await state.discover()
    expect(state.current).toMatchObject({
      status: 'contracts_ready',
      v2RuntimeActive: false,
    })
    await state.handshake({
      clientSurface: 'SCREEN',
      clientBuild: 'test-build',
    })
    expect(state.current).toMatchObject({
      status: 'contracts_ready',
      v2RuntimeActive: false,
      handshake: { activeRuntimeVersion: '1' },
    })
  })

  it('marks capability state active only for the strict active tuple', async () => {
    const activeDiscovery = discovery(true)
    const client = {
      discover: async () => activeDiscovery,
      handshake: async (input: { clientSurface: string }) => ({
        status: 'ok',
        protocolVersion: '2',
        contractVersion: '2',
        activeRuntimeVersion: '2',
        activationState: 'ACTIVE',
        resetEpoch: 1,
        clientSurface: input.clientSurface,
        serverTime: '2026-08-13T00:00:00.000Z',
        capabilities: capabilities(true),
      }),
    }
    const state = createProtocolCapabilityState(client)

    await state.discover()
    expect(state.current).toMatchObject({
      status: 'active',
      v2RuntimeActive: true,
    })
    await state.handshake({
      clientSurface: 'WELCOME',
      clientBuild: 'test-build',
    })
    expect(state.current).toMatchObject({
      status: 'active',
      v2RuntimeActive: true,
    })
  })

  it('uses neutral discovery and strict v2 handshake endpoints without boot integration', async () => {
    const handshakeResponse = {
      status: 'ok',
      protocolVersion: '2',
      contractVersion: '2',
      activeRuntimeVersion: '1',
      activationState: 'CONTRACTS_READY',
      clientSurface: 'ADMIN',
      serverTime: '2026-08-13T00:00:00.000Z',
      capabilities: capabilities(),
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(discovery()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(handshakeResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(protocolCapabilityApi.discover()).resolves.toEqual(discovery())
    await expect(
      protocolCapabilityApi.handshake({
        clientSurface: 'ADMIN',
        clientBuild: 'test-build',
      }),
    ).resolves.toEqual(handshakeResponse)

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/protocol-capabilities',
      expect.objectContaining({ method: 'GET' }),
    )
    const handshakeCall = fetchMock.mock.calls[1]
    expect(handshakeCall[0]).toBe('/api/v2/handshake')
    expect(JSON.parse(handshakeCall[1].body)).toEqual({
      protocolVersion: '2',
      clientSurface: 'ADMIN',
      clientBuild: 'test-build',
    })
  })

  it('classifies a missing discovery endpoint as an explicit upgrade requirement', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'RESOURCE_NOT_FOUND',
              message: 'missing',
            },
          }),
          {
            status: 404,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    )

    await expect(protocolCapabilityApi.discover()).rejects.toMatchObject({
      code: PROTOCOL_ERROR_CODE.UPGRADE_REQUIRED,
      expectedVersion: '2',
    })
  })

  it.each([
    ['participant activation', () => participantApi.activate({ invitationCode: 'test' })],
    ['participant snapshot', () => participantApi.snapshot()],
    ['participant capsule command', () => participantApi.submitCapsuleMessage({})],
    ['participant star temperature command', () => participantApi.lockStarTemperature({})],
    ['participant star start command', () => participantApi.startStar({})],
    ['participant gift command', () => participantApi.sendGift({})],
    ['participant barrage command', () => participantApi.sendBarrage({})],
    ['participant cooperative light command', () => participantApi.light({})],
    ['admin login', () => adminApi.login({ passcode: 'test' })],
    ['admin snapshot', () => adminApi.snapshot()],
    ['admin roles command', () => adminApi.setRoles({})],
    ['admin runtime command', () => adminApi.runtime({})],
    ['admin barrage removal command', () => adminApi.removeBarrage('barrage-id', {})],
    ['admin source block command', () => adminApi.blockSource('source-id', {})],
    ['admin barrage pause command', () => adminApi.pauseBarrages({})],
    ['admin barrage clear command', () => adminApi.clearBarrages({})],
    ['admin capsule moderation command', () => adminApi.moderateCapsule('identity-id', {})],
    ['admin invitation command', () => adminApi.setInvitationStatus('invitation-id', {})],
    ['admin reset command', () => adminApi.reset({})],
    ['screen readiness snapshot', () => screenApi.ready()],
    ['screen snapshot', () => screenApi.snapshot()],
  ])('rejects a v2 payload at the %s v1 snapshot adapter boundary', async (_label, request) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ protocolVersion: '2' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    await expect(request()).rejects.toMatchObject({
      code: PROTOCOL_ERROR_CODE.UPGRADE_REQUIRED,
      expectedVersion: '1',
      actualVersion: '2',
    })
  })

  it.each([
    [{}, null],
    [{ protocolVersion: 1 }, 1],
    [null, null],
  ])('rejects a missing or malformed v1 snapshot version %#', async (payload, actualVersion) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    await expect(participantApi.snapshot()).rejects.toMatchObject({
      code: PROTOCOL_ERROR_CODE.VERSION_MISMATCH,
      expectedVersion: '1',
      actualVersion,
    })
  })

  it.each([
    ['participant logout', () => participantApi.logout()],
    ['admin logout', () => adminApi.logout()],
  ])('does not impose a snapshot protocol envelope on %s', async (_label, request) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    await expect(request()).resolves.toEqual({ status: 'ok' })
  })
})
