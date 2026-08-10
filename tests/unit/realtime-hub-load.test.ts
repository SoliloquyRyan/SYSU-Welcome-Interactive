import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createRealtimeHub,
  MAX_SOCKET_BUFFERED_BYTES,
} from '../../backend/src/realtime/hub.js'

function event() {
  return {
    protocolVersion: '1' as const,
    resetEpoch: 1,
    stream: 'screen' as const,
    eventSeq: 1,
    eventId: 'event-load-guard',
    type: 'aggregate.updated',
    committedAt: '2026-08-10T00:00:00.000Z',
    payload: {
      activatedCount: 1,
      starStartedCount: 0,
      totalStarlight: 20,
      interactionCount: 0,
      cooperativeLightCount: 0,
      eligibleParticipantCount: 1,
    },
  }
}

function socket(bufferedAmount = 0) {
  return {
    readyState: 1,
    bufferedAmount,
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
  } as unknown as Parameters<ReturnType<typeof createRealtimeHub>['add']>[0]
}

describe('realtime load guard', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('disconnects a slow consumer instead of growing its send queue', () => {
    vi.useFakeTimers()
    const socket = {
      readyState: 1,
      bufferedAmount: MAX_SOCKET_BUFFERED_BYTES + 1,
      send: vi.fn(),
      close: vi.fn(),
      terminate: vi.fn(),
    } as unknown as Parameters<ReturnType<typeof createRealtimeHub>['add']>[0]
    const hub = createRealtimeHub()
    hub.add(socket)

    hub.broadcast([event()])

    expect(socket.send).not.toHaveBeenCalled()
    expect(socket.close).toHaveBeenCalledWith(1013, 'client too slow')
    expect(hub.connectionCount).toBe(0)
    vi.advanceTimersByTime(750)
    expect(socket.terminate).toHaveBeenCalledOnce()
  })

  it('treats the current payload as part of the hard queue limit', () => {
    vi.useFakeTimers()
    const slowSocket = socket(MAX_SOCKET_BUFFERED_BYTES - 1)
    const hub = createRealtimeHub()
    hub.add(slowSocket)

    hub.broadcast([event()])

    expect(slowSocket.send).not.toHaveBeenCalled()
    expect(slowSocket.close).toHaveBeenCalledWith(1013, 'client too slow')
    hub.remove(slowSocket)
    vi.runAllTimers()
    expect(slowSocket.terminate).not.toHaveBeenCalled()
  })

  it('serializes a live event once and never exposes its audience marker', () => {
    const first = socket()
    const second = socket()
    const hub = createRealtimeHub()
    hub.add(first, { stream: 'screen' })
    hub.add(second, { stream: 'public' })
    const stringify = vi.spyOn(JSON, 'stringify')

    hub.broadcast([{ ...event(), audienceSubjectId: 'internal-only' }])

    expect(stringify).toHaveBeenCalledOnce()
    expect(first.send).toHaveBeenCalledOnce()
    expect(second.send).toHaveBeenCalledOnce()
    const payload = vi.mocked(first.send).mock.calls[0]?.[0]
    expect(typeof payload).toBe('string')
    expect(String(payload)).not.toContain('audienceSubjectId')
    expect(String(payload)).not.toContain('internal-only')
    stringify.mockRestore()
    hub.remove(first)
    hub.remove(second)
  })
})
