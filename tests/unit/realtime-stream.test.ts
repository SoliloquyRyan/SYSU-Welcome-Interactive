import { createRenderer, defineComponent } from '../../frontend/node_modules/vue/index.mjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PROTOCOL_POLICY,
  isEventVisibleToRealtimeAccess,
  realtimeStateAfterNetworkChange,
  useRealtime,
} from '../../frontend/src/composables/useRealtime.js'

function createFakeEventTarget(initial = {}) {
  const listeners = new Map<string, Set<(event: any) => void>>()
  return Object.assign(initial, {
    addEventListener(type: string, listener: (event: any) => void) {
      const group = listeners.get(type) ?? new Set()
      group.add(listener)
      listeners.set(type, group)
    },
    removeEventListener(type: string, listener: (event: any) => void) {
      listeners.get(type)?.delete(listener)
    },
    dispatchEvent(event: { type: string }) {
      for (const listener of listeners.get(event.type) ?? []) listener(event)
    },
  })
}

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  url: string
  readyState = FakeWebSocket.CONNECTING
  closeCalls: Array<[number | undefined, string | undefined]> = []
  listeners = new Map<string, Set<(event: any) => void>>()

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: (event: any) => void) {
    const group = this.listeners.get(type) ?? new Set()
    group.add(listener)
    this.listeners.set(type, group)
  }

  emit(type: string, event: any = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.emit('open')
  }

  message(payload: unknown) {
    this.emit('message', { data: JSON.stringify(payload) })
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push([code, reason])
    this.readyState = FakeWebSocket.CLOSED
    this.emit('close', { code, reason })
  }
}

const renderer = createRenderer({
  patchProp() {},
  insert(child: any, parent: any) {
    parent.children ??= []
    parent.children.push(child)
  },
  remove() {},
  createElement() {
    return { children: [] }
  },
  createText(text: string) {
    return { text }
  },
  createComment(text: string) {
    return { text }
  },
  setText(node: any, text: string) {
    node.text = text
  },
  setElementText(node: any, text: string) {
    node.text = text
  },
  parentNode() {
    return null
  },
  nextSibling() {
    return null
  },
  querySelector() {
    return null
  },
  setScopeId() {},
  cloneNode(node: any) {
    return { ...node }
  },
  insertStaticContent() {
    return [{}, {}]
  },
})

async function flushPromises() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

describe('realtime access stream visibility', () => {
  afterEach(() => {
    FakeWebSocket.instances = []
    vi.unstubAllGlobals()
  })

  it.each([
    ['public', 'public'],
    ['public', 'screen'],
    ['screen', 'public'],
    ['screen', 'screen'],
    ['participant', 'public'],
    ['participant', 'screen'],
    ['participant', 'participant'],
    ['admin', 'public'],
    ['admin', 'screen'],
    ['admin', 'admin'],
  ])('allows %s access to consume %s envelopes', (access, event) => {
    expect(isEventVisibleToRealtimeAccess(access, event)).toBe(true)
  })

  it.each([
    ['public', 'participant'],
    ['public', 'admin'],
    ['screen', 'participant'],
    ['screen', 'admin'],
    ['participant', 'admin'],
    ['admin', 'participant'],
    ['unknown', 'screen'],
  ])('keeps %s access from consuming %s envelopes', (access, event) => {
    expect(isEventVisibleToRealtimeAccess(access, event)).toBe(false)
  })

  it.each(['offline', 'idle', 'reconnecting'])(
    'keeps the protocol error persistent instead of changing to %s',
    (nextState) => {
      expect(realtimeStateAfterNetworkChange(nextState, true)).toBe(
        'protocol_error',
      )
      expect(realtimeStateAfterNetworkChange(nextState, false)).toBe(nextState)
    },
  )

  it('closes and permanently blocks a live v1 socket after a v2 event', async () => {
    const windowTarget = createFakeEventTarget({
      location: { protocol: 'http:', host: 'localhost:5173' },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    })
    const documentTarget = createFakeEventTarget({
      visibilityState: 'visible',
    })
    vi.stubGlobal('window', windowTarget)
    vi.stubGlobal('document', documentTarget)
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('WebSocket', FakeWebSocket)

    const resync = vi.fn().mockResolvedValue({
      protocolVersion: '1',
      eventSeq: 0,
      runtime: { resetEpoch: 7 },
    })
    let realtime!: ReturnType<typeof useRealtime>
    const app = renderer.createApp(
      defineComponent({
        setup() {
          realtime = useRealtime({
            stream: 'participant',
            resync,
            onEvent: vi.fn(),
            protocolPolicy: PROTOCOL_POLICY.V1_PREVIEW,
          })
          return () => null
        },
      }),
    )

    app.mount({ children: [] })
    await flushPromises()
    expect(FakeWebSocket.instances).toHaveLength(1)

    const socket = FakeWebSocket.instances[0]
    socket.open()
    expect(realtime.state.value).toBe('online')
    expect(realtime.canWrite.value).toBe(true)

    socket.message({ protocolVersion: '2', eventSeq: 1 })
    await flushPromises()

    expect(realtime.state.value).toBe('protocol_error')
    expect(realtime.synced.value).toBe(false)
    expect(realtime.canWrite.value).toBe(false)
    expect(realtime.protocolError.value).toMatchObject({
      code: 'UPGRADE_REQUIRED',
      expectedVersion: '1',
      actualVersion: '2',
    })
    expect(realtime.lastError.value).toContain('不兼容')
    expect(socket.closeCalls).toEqual([[1000, 'protocol mismatch']])

    const latchedMessage = realtime.lastError.value
    windowTarget.dispatchEvent({ type: 'offline' })
    windowTarget.dispatchEvent({ type: 'online' })
    documentTarget.dispatchEvent({ type: 'visibilitychange' })
    await flushPromises()

    expect(realtime.state.value).toBe('protocol_error')
    expect(realtime.lastError.value).toBe(latchedMessage)
    expect(resync).toHaveBeenCalledTimes(1)
    expect(FakeWebSocket.instances).toHaveLength(1)

    app.unmount()
  })
})
