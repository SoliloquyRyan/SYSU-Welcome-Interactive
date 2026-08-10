import type { WebSocket } from 'ws'

import type {
  RealtimeEventEnvelope,
  RealtimeStream,
} from '@sysu-welcome/contracts'

import { isParticipantAliasExcludedFor } from './events.js'

const WEBSOCKET_OPEN = 1
const WEBSOCKET_CLOSED = 3
export const MAX_SOCKET_BUFFERED_BYTES = 1024 * 1024

export interface RealtimeHub {
  readonly ready: boolean
  readonly connectionCount: number
  add(
    socket: WebSocket,
    access?: { stream: RealtimeStream; subjectId?: string | null },
    options?: { buffering?: boolean },
  ): void
  remove(socket: WebSocket): void
  send(socket: WebSocket, event: RealtimeEventEnvelope): void
  flushBuffered(
    socket: WebSocket,
    backlog: readonly (RealtimeEventEnvelope & {
      audienceSubjectId?: string | null
    })[],
  ): void
  broadcast(
    events: readonly (RealtimeEventEnvelope & {
      audienceSubjectId?: string | null
    })[],
  ): void
  close(): Promise<void>
}

export function createRealtimeHub(): RealtimeHub {
  type EventWithAudience = RealtimeEventEnvelope & {
    audienceSubjectId?: string | null
  }
  interface ConnectionState {
    stream: RealtimeStream
    subjectId: string | null
    buffer: EventWithAudience[] | null
  }
  const sockets = new Map<
    WebSocket,
    ConnectionState
  >()
  const slowCloseTimers = new Map<WebSocket, NodeJS.Timeout>()
  let ready = true

  const permitted = (
    event: EventWithAudience,
    access: Pick<ConnectionState, 'stream' | 'subjectId'>,
  ): boolean => {
    if (event.stream === 'public') return true
    if (event.stream === 'screen') {
      return !(
        access.stream === 'participant' &&
        isParticipantAliasExcludedFor(
          event.audienceSubjectId,
          access.subjectId,
        )
      )
    }
    if (event.stream === 'admin') return access.stream === 'admin'
    return (
      access.stream === 'participant' &&
      event.audienceSubjectId === access.subjectId
    )
  }

  const publicEnvelope = (event: EventWithAudience): RealtimeEventEnvelope => {
    const { audienceSubjectId: _audience, ...envelope } = event
    return envelope
  }

  const removeSocket = (socket: WebSocket): void => {
    sockets.delete(socket)
    const timer = slowCloseTimers.get(socket)
    if (timer) clearTimeout(timer)
    slowCloseTimers.delete(socket)
  }

  const disconnectSlowSocket = (socket: WebSocket): void => {
    if (slowCloseTimers.has(socket)) return
    sockets.delete(socket)
    socket.close(1013, 'client too slow')
    const timer = setTimeout(() => {
      slowCloseTimers.delete(socket)
      if (socket.readyState !== WEBSOCKET_CLOSED) socket.terminate()
    }, 750)
    timer.unref()
    slowCloseTimers.set(socket, timer)
  }

  const sendPayload = (socket: WebSocket, payload: string): void => {
    if (socket.readyState === WEBSOCKET_OPEN) {
      if (
        socket.bufferedAmount + Buffer.byteLength(payload, 'utf8') >
        MAX_SOCKET_BUFFERED_BYTES
      ) {
        disconnectSlowSocket(socket)
        return
      }
      socket.send(payload)
    }
  }

  const sendEvent = (socket: WebSocket, event: EventWithAudience): void => {
    sendPayload(socket, JSON.stringify(publicEnvelope(event)))
  }

  return {
    get ready() {
      return ready
    },
    get connectionCount() {
      return sockets.size
    },
    add(socket, access = { stream: 'public' }, options = {}) {
      if (!ready) {
        socket.close(1012, 'service restarting')
        return
      }
      sockets.set(socket, {
        stream: access.stream,
        subjectId: access.subjectId ?? null,
        buffer: options.buffering ? [] : null,
      })
    },
    remove(socket) {
      removeSocket(socket)
    },
    send(socket, event) {
      sendEvent(socket, event)
    },
    flushBuffered(socket, backlog) {
      const access = sockets.get(socket)
      if (!access || access.buffer === null) return

      // JavaScript executes this section synchronously. Broadcasts that arrive
      // before it starts are already in `buffer`; broadcasts after it returns
      // observe `buffer = null` and go through the live path.
      const combined = [...backlog, ...access.buffer]
        .filter((event) => permitted(event, access))
        .map((event, index) => ({ event, index }))
        .sort(
          (left, right) =>
            left.event.eventSeq - right.event.eventSeq || left.index - right.index,
        )
      access.buffer = null
      const sentIds = new Set<string>()
      for (const { event } of combined) {
        if (sentIds.has(event.eventId)) continue
        sentIds.add(event.eventId)
        sendEvent(socket, event)
      }
    },
    broadcast(events) {
      for (const event of events) {
        const payload = JSON.stringify(publicEnvelope(event))
        for (const [socket, access] of sockets) {
          if (!permitted(event, access)) continue
          if (access.buffer !== null) {
            access.buffer.push(event)
          } else {
            sendPayload(socket, payload)
          }
        }
      }
    },
    async close() {
      ready = false
      const tracked = new Set([...sockets.keys(), ...slowCloseTimers.keys()])
      for (const timer of slowCloseTimers.values()) clearTimeout(timer)
      slowCloseTimers.clear()
      const closing = [...tracked].map(
        (socket) =>
          new Promise<void>((resolve) => {
            if (socket.readyState === WEBSOCKET_CLOSED) {
              resolve()
              return
            }
            const timeout = setTimeout(() => {
              if (socket.readyState !== WEBSOCKET_CLOSED) socket.terminate()
              resolve()
            }, 750)
            timeout.unref()
            socket.once('close', () => {
              clearTimeout(timeout)
              resolve()
            })
            if (socket.readyState === WEBSOCKET_OPEN) {
              socket.close(1001, 'server shutting down')
            }
          }),
      )
      await Promise.allSettled(closing)
      sockets.clear()
    },
  }
}
