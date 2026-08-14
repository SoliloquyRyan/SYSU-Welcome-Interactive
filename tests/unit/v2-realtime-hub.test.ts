import { describe, expect, it } from 'vitest'

import type { V2RealtimeEventEnvelope } from '../../packages/contracts/src/index.js'
import { createV2RealtimeHub } from '../../backend/src/realtime/v2-hub.js'

function aggregateEvent(streamSeq: number): V2RealtimeEventEnvelope {
  return {
    protocolVersion: '2',
    resetEpoch: 2,
    streamId: 'public',
    streamSeq,
    eventId: `2:public:${streamSeq}`,
    name: 'aggregate.changed',
    revision: streamSeq,
    payload: {
      projection: 'PUBLIC_AGGREGATE',
      aggregateRevision: streamSeq,
      aggregate: {
        activatedCount: 0,
        publicStarCount: 0,
        admittedCount: 0,
        starStartedCount: 0,
        cooperativeLightCount: 0,
        totalStarlight: 0,
      },
    },
  }
}

function fakeSocket() {
  const messages: unknown[] = []
  return {
    messages,
    socket: {
      readyState: 1,
      send(value: string) { messages.push(JSON.parse(value) as unknown) },
      close() {},
      terminate() {},
      once() {},
    },
  }
}

describe('v2 realtime hub ordering', () => {
  it('holds a future stream event until the missing predecessor arrives', () => {
    const hub = createV2RealtimeHub()
    const client = fakeSocket()
    hub.add(client.socket as never, [{ streamId: 'public', streamSeq: 0 }])

    hub.broadcast([aggregateEvent(2)])
    expect(client.messages).toEqual([])
    hub.broadcast([aggregateEvent(1), aggregateEvent(2)])

    expect(client.messages).toMatchObject([
      { streamSeq: 1, eventId: '2:public:1' },
      { streamSeq: 2, eventId: '2:public:2' },
    ])
  })

  it('merges snapshot backlog and buffered live events without duplicates', () => {
    const hub = createV2RealtimeHub()
    const client = fakeSocket()
    hub.add(client.socket as never, [{ streamId: 'public', streamSeq: 0 }], true)

    hub.broadcast([aggregateEvent(2), aggregateEvent(1)])
    hub.flush(client.socket as never, [aggregateEvent(1)])
    hub.broadcast([aggregateEvent(2)])

    expect(client.messages).toMatchObject([
      { streamSeq: 1, eventId: '2:public:1' },
      { streamSeq: 2, eventId: '2:public:2' },
    ])
  })

  it('never replays an event at or behind the subscribed snapshot cursor', () => {
    const hub = createV2RealtimeHub()
    const client = fakeSocket()
    hub.add(client.socket as never, [{ streamId: 'public', streamSeq: 2 }], true)

    hub.broadcast([aggregateEvent(2), aggregateEvent(3)])
    hub.flush(client.socket as never, [aggregateEvent(2), aggregateEvent(3)])

    expect(client.messages).toMatchObject([
      { streamSeq: 3, eventId: '2:public:3' },
    ])
  })
})
