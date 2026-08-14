import {
  createRenderer,
  defineComponent,
  ref,
} from '../../frontend/node_modules/vue/index.mjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useV2AdminRealtime } from '../../frontend/src/composables/useV2AdminRealtime.js'

type Listener = (event: any) => void

function eventTarget(initial: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<Listener>>()
  return Object.assign(initial, {
    addEventListener(type: string, listener: Listener) {
      const group = listeners.get(type) ?? new Set()
      group.add(listener)
      listeners.set(type, group)
    },
    dispatchEvent(event: { type: string }) {
      for (const listener of [...(listeners.get(event.type) ?? [])]) listener(event)
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

  addEventListener(type: string, listener: Listener) {
    this.target.addEventListener(type, listener)
  }

  send(value: string) {
    this.sent.push(JSON.parse(value))
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.target.dispatchEvent({ type: 'open' })
  }

  message(frame: unknown) {
    this.target.dispatchEvent({ type: 'message', data: JSON.stringify(frame) })
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push([code, reason])
    this.readyState = FakeWebSocket.CLOSED
    this.target.dispatchEvent({ type: 'close' })
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

function publicEvent(streamSeq: number) {
  return {
    protocolVersion: '2',
    resetEpoch: 4,
    streamId: 'public',
    streamSeq,
    eventId: `4:public:${streamSeq}`,
    name: 'aggregate.changed',
    revision: streamSeq,
    payload: {},
  }
}

function helloAck() {
  return { type: 'HELLO_ACK', protocolVersion: '2' }
}

function subscribed() {
  return {
    type: 'SUBSCRIBED',
    protocolVersion: '2',
    resetEpoch: 4,
    streams: [
      { streamId: 'public', streamSeq: 7 },
      { streamId: 'admin', streamSeq: 11 },
    ],
  }
}

describe('v2 admin realtime frame ordering', () => {
  afterEach(() => {
    FakeWebSocket.instances = []
    vi.unstubAllGlobals()
  })

  it('serializes a burst so an adjacent frame does not look like a gap', async () => {
    vi.stubGlobal('window', eventTarget({
      location: { protocol: 'http:', host: 'localhost:5173' },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    }))
    vi.stubGlobal('WebSocket', FakeWebSocket)

    const snapshot = ref({ resetEpoch: 4, publicSeq: 7, adminSeq: 11 })
    let releaseFirstEventRefresh!: () => void
    const firstEventRefresh = new Promise<void>((resolve) => {
      releaseFirstEventRefresh = () => {
        snapshot.value = { ...snapshot.value, publicSeq: 8 }
        resolve()
      }
    })
    const refresh = vi.fn()
      .mockResolvedValueOnce(snapshot.value)
      .mockImplementationOnce(() => firstEventRefresh)
      .mockImplementationOnce(async () => {
        snapshot.value = { ...snapshot.value, publicSeq: 9 }
        return snapshot.value
      })
    let realtime!: ReturnType<typeof useV2AdminRealtime>
    const app = renderer.createApp(defineComponent({
      setup() {
        realtime = useV2AdminRealtime({ snapshot, refresh })
        return () => null
      },
    }))
    app.mount({ children: [] })

    await realtime.connect()
    expect(FakeWebSocket.instances).toHaveLength(1)
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.message(helloAck())
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2))
    socket.message(subscribed())
    await vi.waitFor(() => expect(realtime.state.value).toBe('online'))

    socket.message(publicEvent(8))
    socket.message(publicEvent(9))
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))

    expect(socket.closeCalls).toEqual([])
    expect(realtime.state.value).toBe('online')
    releaseFirstEventRefresh()
    await vi.waitFor(() => expect(snapshot.value.publicSeq).toBe(9))

    expect(refresh).toHaveBeenCalledTimes(3)
    expect(socket.closeCalls).toEqual([])
    expect(realtime.state.value).toBe('online')

    app.unmount()
  })

  it('fails closed once when the first public frame has a real gap', async () => {
    vi.stubGlobal('window', eventTarget({
      location: { protocol: 'http:', host: 'localhost:5173' },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    }))
    vi.stubGlobal('WebSocket', FakeWebSocket)

    const snapshot = ref({ resetEpoch: 4, publicSeq: 7, adminSeq: 11 })
    let releaseResync!: () => void
    const resync = new Promise<void>((resolve) => { releaseResync = resolve })
    const refresh = vi.fn()
      .mockResolvedValueOnce(snapshot.value)
      .mockImplementationOnce(() => resync)
    let realtime!: ReturnType<typeof useV2AdminRealtime>
    const app = renderer.createApp(defineComponent({
      setup() {
        realtime = useV2AdminRealtime({ snapshot, refresh })
        return () => null
      },
    }))
    app.mount({ children: [] })

    await realtime.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.message(helloAck())
    await vi.waitFor(() => expect(socket.sent).toHaveLength(2))
    socket.message(subscribed())
    await vi.waitFor(() => expect(realtime.state.value).toBe('online'))

    socket.message(publicEvent(9))
    socket.message(publicEvent(8))
    socket.message(publicEvent(10))
    await vi.waitFor(() => expect(realtime.state.value).toBe('syncing'))

    expect(refresh).toHaveBeenCalledTimes(2)
    expect(socket.closeCalls).toEqual([])
    expect(realtime.lastError.value).toContain('序列出现缺口')
    releaseResync()
    await vi.waitFor(() => expect(socket.closeCalls).toEqual([
      [1012, 'admin realtime resync'],
    ]))
    expect(refresh).toHaveBeenCalledTimes(2)

    app.unmount()
  })

  it('ignores a rejected refresh from an old socket after a new socket is online', async () => {
    vi.stubGlobal('window', eventTarget({
      location: { protocol: 'http:', host: 'localhost:5173' },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    }))
    vi.stubGlobal('WebSocket', FakeWebSocket)

    const snapshot = ref({ resetEpoch: 4, publicSeq: 7, adminSeq: 11 })
    let rejectOldRefresh!: (error: Error) => void
    const oldRefresh = new Promise<never>((_resolve, reject) => {
      rejectOldRefresh = reject
    })
    const refresh = vi.fn()
      .mockResolvedValueOnce(snapshot.value)
      .mockImplementationOnce(() => oldRefresh)
      .mockResolvedValueOnce(snapshot.value)
    let realtime!: ReturnType<typeof useV2AdminRealtime>
    const app = renderer.createApp(defineComponent({
      setup() {
        realtime = useV2AdminRealtime({ snapshot, refresh })
        return () => null
      },
    }))
    app.mount({ children: [] })

    await realtime.connect()
    const firstSocket = FakeWebSocket.instances[0]
    firstSocket.open()
    firstSocket.message(helloAck())
    await vi.waitFor(() => expect(firstSocket.sent).toHaveLength(2))
    firstSocket.message(subscribed())
    await vi.waitFor(() => expect(realtime.state.value).toBe('online'))
    firstSocket.message(publicEvent(8))
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))

    firstSocket.close(1006, 'network lost')
    await realtime.connect()
    expect(FakeWebSocket.instances).toHaveLength(2)
    const secondSocket = FakeWebSocket.instances[1]
    secondSocket.open()
    secondSocket.message(helloAck())
    await vi.waitFor(() => expect(secondSocket.sent).toHaveLength(2))
    secondSocket.message(subscribed())
    await vi.waitFor(() => expect(realtime.state.value).toBe('online'))

    rejectOldRefresh(new Error('old socket refresh failed'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(refresh).toHaveBeenCalledTimes(3)
    expect(realtime.state.value).toBe('online')
    expect(realtime.lastError.value).toBe('')
    expect(firstSocket.closeCalls).toEqual([[1006, 'network lost']])
    expect(secondSocket.closeCalls).toEqual([])

    app.unmount()
  })
})
