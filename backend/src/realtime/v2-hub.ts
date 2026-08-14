import type { WebSocket } from 'ws'
import type { V2RealtimeEventEnvelope } from '@sysu-welcome/contracts'

const OPEN = 1

export interface V2RealtimeHub {
  add(
    socket: WebSocket,
    streams: ReadonlyArray<{ streamId: string; streamSeq: number }>,
    buffering?: boolean,
  ): void
  flush(socket: WebSocket, backlog: readonly V2RealtimeEventEnvelope[]): void
  remove(socket: WebSocket): void
  broadcast(events: readonly V2RealtimeEventEnvelope[]): void
  invalidate(frame: unknown, code: number, reason: string): void
  close(): Promise<void>
}

export function createV2RealtimeHub(): V2RealtimeHub {
  const sockets = new Map<WebSocket, {
    streams: Set<string>
    buffer: V2RealtimeEventEnvelope[] | null
    delivered: Map<string, number>
    pending: Map<string, Map<number, V2RealtimeEventEnvelope>>
  }>()
  const deliver = (
    socket: WebSocket,
    state: {
      streams: Set<string>
      buffer: V2RealtimeEventEnvelope[] | null
      delivered: Map<string, number>
      pending: Map<string, Map<number, V2RealtimeEventEnvelope>>
    },
    event: V2RealtimeEventEnvelope,
  ): void => {
    if (!state.streams.has(event.streamId)) return
    const delivered = state.delivered.get(event.streamId) ?? 0
    if (event.streamSeq <= delivered) return
    const pending = state.pending.get(event.streamId) ?? new Map()
    pending.set(event.streamSeq, event)
    state.pending.set(event.streamId, pending)
    let expected = delivered + 1
    while (pending.has(expected)) {
      const next = pending.get(expected)!
      pending.delete(expected)
      if (socket.readyState === OPEN) socket.send(JSON.stringify(next))
      state.delivered.set(event.streamId, expected)
      expected += 1
    }
  }
  return {
    add(socket, streams, buffering = false) {
      sockets.set(socket, {
        streams: new Set(streams.map(({ streamId }) => streamId)),
        buffer: buffering ? [] : null,
        delivered: new Map(streams.map(({ streamId, streamSeq }) => [streamId, streamSeq])),
        pending: new Map(),
      })
    },
    flush(socket, backlog) {
      const state = sockets.get(socket)
      if (!state || state.buffer === null) return
      const combined = [...backlog, ...state.buffer]
      state.buffer = null
      for (const streamId of state.streams) {
        const events = combined
          .filter((event) => event.streamId === streamId)
          .sort((left, right) => left.streamSeq - right.streamSeq)
        for (const event of events) deliver(socket, state, event)
      }
    },
    remove(socket) {
      sockets.delete(socket)
    },
    broadcast(events) {
      for (const event of events) {
        for (const [socket, state] of sockets) {
          if (!state.streams.has(event.streamId)) continue
          if (state.buffer !== null) state.buffer.push(event)
          else if (socket.readyState === OPEN) deliver(socket, state, event)
        }
      }
    },
    invalidate(frame, code, reason) {
      const payload = JSON.stringify(frame)
      for (const [socket] of sockets) {
        if (socket.readyState !== OPEN) continue
        socket.send(payload, (error) => {
          if (error) socket.terminate()
          else socket.close(code, reason)
        })
      }
    },
    async close() {
      await Promise.allSettled([...sockets].map(([socket]) => new Promise<void>((resolve) => {
        if (socket.readyState === 3) return resolve()
        const timeout = setTimeout(() => { if (socket.readyState !== 3) socket.terminate(); resolve() }, 750)
        socket.once('close', () => { clearTimeout(timeout); resolve() })
        if (socket.readyState === OPEN) socket.close(1001, 'server shutting down')
      })))
      sockets.clear()
    },
  }
}
