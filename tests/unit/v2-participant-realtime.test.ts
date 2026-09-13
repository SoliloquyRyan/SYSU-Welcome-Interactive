import {
  createRenderer,
  defineComponent,
  ref,
} from '../../frontend/node_modules/vue/index.mjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useV2ParticipantRealtime, participantEventFrameValid } from '../../frontend/src/composables/useV2ParticipantRealtime.js'

type Listener = (event: any) => void

function eventTarget(initial: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<{ listener: Listener; once: boolean }>>()
  return Object.assign(initial, {
    addEventListener(type: string, listener: Listener, options?: { once?: boolean }) {
      const group = listeners.get(type) ?? new Set()
      group.add({ listener, once: options?.once === true })
      listeners.set(type, group)
    },
    removeEventListener(type: string, listener: Listener) {
      const group = listeners.get(type)
      if (!group) return
      for (const entry of group) {
        if (entry.listener === listener) group.delete(entry)
      }
    },
    dispatchEvent(event: { type: string }) {
      const group = listeners.get(event.type)
      if (!group) return true
      for (const entry of [...group]) {
        entry.listener(event)
        if (entry.once) group.delete(entry)
      }
      return true
    },
  })
}

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.CONNECTING
  sent: unknown[] = []
  closeCalls: Array<[number | undefined, string | undefined]> = []
  private target = eventTarget()

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: Listener, options?: { once?: boolean }) {
    this.target.addEventListener(type, listener, options)
  }

  dispatchEvent(event: { type: string }) {
    return this.target.dispatchEvent(event)
  }

  send(value: string) {
    this.sent.push(JSON.parse(value))
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.dispatchEvent({ type: 'open' })
  }

  message(frame: unknown) {
    this.dispatchEvent({ type: 'message', data: JSON.stringify(frame) })
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push([code, reason])
    this.readyState = FakeWebSocket.CLOSED
    this.dispatchEvent({ type: 'close' })
  }
}

const renderer = createRenderer({
  patchProp() {},
  insert(child: any, parent: any) {
    parent.children ??= []
    parent.children.push(child)
  },
  remove() {},
  createElement() { return { children: [] } },
  createText() { return {} },
  createComment() { return {} },
  setText() {},
  setElementText() {},
  parentNode() { return null },
  nextSibling() { return null },
  querySelector() { return null },
  setScopeId() {},
  insertStaticContent() { return [null, null] },
})

function activeHelloAck() {
  return {
    type: 'HELLO_ACK',
    protocolVersion: '2',
    contractVersion: '2',
    activeRuntimeVersion: '2',
    activationState: 'ACTIVE',
    resetEpoch: 4,
    clientSurface: 'WELCOME',
    serverTime: '2026-08-14T03:00:00.000Z',
    capabilities: {
      v2BusinessWrites: true,
      v2Snapshots: true,
      v2RealtimeEvents: true,
      snapshotFirst: true,
      splitStreams: true,
      v1WriteAcceptedByV2: false,
    },
  }
}

describe('v2 participant realtime fail-closed handling', () => {
  it('accepts the authoritative empty current program after catalog replacement but rejects a missing field', () => {
    const current = { resetEpoch: 4, participantStreamId: 'participant:synthetic-001' }
    const frame = { protocolVersion: '2', resetEpoch: 4, streamId: 'public', streamSeq: 8,
      eventId: '4:public:8', name: 'program.changed', revision: 6,
      payload: { interactionRevision: 6, currentProgram: null } }
    expect(participantEventFrameValid(current, frame)).toBe(true)
    expect(participantEventFrameValid(current, { ...frame, payload: { interactionRevision: 6 } })).toBe(false)
  })

  afterEach(() => {
    FakeWebSocket.instances = []
    vi.unstubAllGlobals()
  })

  it.each(['barrage.published', 'gift.sent'])('delivers %s once when a command snapshot overtakes the websocket event', async (eventName) => {
    const windowTarget = eventTarget({
      location: { protocol: 'http:', host: 'localhost:5173' },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    })
    vi.stubGlobal('window', windowTarget)
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('WebSocket', FakeWebSocket)

    const snapshot = ref({
      resetEpoch: 4,
      publicSeq: 7,
      participantSeq: 11,
      participantStreamId: 'participant:synthetic-001',
    })
    const refresh = vi.fn().mockResolvedValue(snapshot.value)
    const onPublicEvent = vi.fn()
    let realtime!: ReturnType<typeof useV2ParticipantRealtime>
    const app = renderer.createApp(defineComponent({
      setup() {
        realtime = useV2ParticipantRealtime({ snapshot, refresh, onPublicEvent })
        return () => null
      },
    }))
    app.mount({ children: [] })

    const connected = realtime.connect()
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.message(activeHelloAck())
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2))
    socket.message({
      type: 'SUBSCRIBED',
      protocolVersion: '2',
      resetEpoch: 4,
      streams: [
        { streamId: 'public', streamSeq: 7 },
        { streamId: 'participant:synthetic-001', streamSeq: 11 },
      ],
    })

    await expect(connected).resolves.toBe(true)
    expect(realtime.state.value).toBe('online')

    snapshot.value.publicSeq = 9
    const frame = {
      protocolVersion: '2', resetEpoch: 4, streamId: 'public', streamSeq: 8,
      eventId: '4:public:8', name: eventName, revision: 6,
      payload: eventName === 'gift.sent'
        ? { interactionRevision: 6, gift: { giftEventId: 'gift-8', giftId: 'gift-starship', programId: 'program-1', sentCount: 1 } }
        : { interactionRevision: 6, barrage: { barrageId: 'chat-8', text: 'hello', publicStarId: 'Z-0001' } },
    }
    socket.message(frame)
    await vi.waitFor(() => expect(onPublicEvent).toHaveBeenCalledTimes(1))
    socket.message(frame)
    const cleared = { ...frame, streamSeq: 9, eventId: '4:public:9', name: 'barrage.cleared', revision: 7,
      payload: { interactionRevision: 7, displayBatch: 2 } }
    socket.message(cleared)
    await vi.waitFor(() => expect(onPublicEvent).toHaveBeenCalledTimes(2))
    expect(onPublicEvent.mock.calls[1][0]).toEqual(cleared)
    expect(snapshot.value.publicSeq).toBe(9)
    expect(refresh).toHaveBeenCalledTimes(1)
    app.unmount()
  })

  it('resyncs and closes when an incompatible event arrives after online', async () => {
    const windowTarget = eventTarget({
      location: { protocol: 'http:', host: 'localhost:5173' },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    })
    vi.stubGlobal('window', windowTarget)
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('WebSocket', FakeWebSocket)

    const snapshot = ref({
      resetEpoch: 4,
      publicSeq: 7,
      participantSeq: 11,
      participantStreamId: 'participant:synthetic-001',
    })
    const refresh = vi.fn().mockResolvedValue(snapshot.value)
    const onPublicEvent = vi.fn()
    let realtime!: ReturnType<typeof useV2ParticipantRealtime>
    const app = renderer.createApp(defineComponent({
      setup() {
        realtime = useV2ParticipantRealtime({ snapshot, refresh, onPublicEvent })
        return () => null
      },
    }))
    app.mount({ children: [] })

    const connected = realtime.connect()
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.message(activeHelloAck())
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2))
    socket.message({
      type: 'SUBSCRIBED',
      protocolVersion: '2',
      resetEpoch: 4,
      streams: [
        { streamId: 'public', streamSeq: 7 },
        { streamId: 'participant:synthetic-001', streamSeq: 11 },
      ],
    })

    await expect(connected).resolves.toBe(true)
    expect(realtime.state.value).toBe('online')

    socket.message({
      protocolVersion: '1',
      resetEpoch: 4,
      streamId: 'public',
      streamSeq: 8,
      eventId: '4:public:8',
      name: 'aggregate.changed',
      revision: 6,
      payload: {
        projection: 'PUBLIC_AGGREGATE', aggregateRevision: 6, aggregate: {},
      },
    })

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(socket.closeCalls).toContainEqual([
      1012, 'participant resync',
    ]))
    expect(realtime.state.value).not.toBe('online')
    expect(realtime.lastError.value).toContain('实时事件帧无效')
    expect(onPublicEvent).not.toHaveBeenCalled()

    app.unmount()
  })
})
