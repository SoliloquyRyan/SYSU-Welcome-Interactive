import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openDatabase } from '../../backend/src/db/open-database.js'
import {
  AdminSnapshotSchema,
  G2RealtimeEventEnvelopeSchema,
  ParticipantSnapshotSchema,
  RealtimeEventEnvelopeSchema,
  ScreenSnapshotSchema,
  type AdminSnapshot,
} from '../../packages/contracts/src/index.js'
import {
  commandVersion,
  createG2Harness,
  idempotencyKey,
  TEST_AUTHORITY,
  TEST_ORIGIN,
  type G2Harness,
} from '../helpers/g2-harness.js'

type InjectedSocket = Awaited<ReturnType<G2Harness['app']['injectWS']>>
const bufferedMessages = new WeakMap<InjectedSocket, unknown[]>()
const trackedSockets = new Set<InjectedSocket>()

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

function waitForMessage<T = unknown>(
  socket: InjectedSocket,
  predicate: (value: unknown) => value is T,
  timeoutMs = 5_000,
): Promise<T> {
  const buffered = bufferedMessages.get(socket) ?? []
  const bufferedIndex = buffered.findIndex(predicate)
  if (bufferedIndex !== -1) {
    return Promise.resolve(buffered.splice(bufferedIndex, 1)[0] as T)
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener('message', onMessage)
      reject(new Error('Expected WebSocket fact was not received'))
    }, timeoutMs)
    const onMessage = (event: MessageEvent) => {
      let value: unknown
      try {
        value = decodeMessage(event.data)
      } catch {
        return
      }
      if (!predicate(value)) return
      const queued = bufferedMessages.get(socket)
      const queuedIndex = queued?.findIndex(predicate) ?? -1
      if (queued && queuedIndex !== -1) queued.splice(queuedIndex, 1)
      clearTimeout(timeout)
      socket.removeEventListener('message', onMessage)
      resolve(value)
    }
    socket.addEventListener('message', onMessage)
  })
}

function expectNoMessage(
  socket: InjectedSocket,
  predicate: (value: unknown) => boolean,
  timeoutMs = 200,
): Promise<boolean> {
  return new Promise((resolve) => {
    let matched = (bufferedMessages.get(socket) ?? []).some(predicate)
    const onMessage = (event: MessageEvent) => {
      try {
        if (predicate(decodeMessage(event.data))) matched = true
      } catch {
        // An invalid frame is handled by the strict positive-path assertions.
      }
    }
    socket.addEventListener('message', onMessage)
    setTimeout(() => {
      socket.removeEventListener('message', onMessage)
      resolve(
        !matched && !(bufferedMessages.get(socket) ?? []).some(predicate),
      )
    }, timeoutMs)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function closeSocket(socket: InjectedSocket): Promise<void> {
  if (socket.readyState === 3) return Promise.resolve()
  return new Promise((resolve) => {
    socket.addEventListener('close', () => resolve(), { once: true })
    socket.close()
  })
}

function waitForClose(
  socket: InjectedSocket,
  timeoutMs = 5_000,
): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Expected WebSocket close was not received'))
    }, timeoutMs)
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

async function openSocket(
  harness: G2Harness,
  query: string,
  cookie?: string,
): Promise<InjectedSocket> {
  const queue: unknown[] = []
  const socket = await harness.app.injectWS(
    `/ws?${query}`,
    {
      headers: {
        host: TEST_AUTHORITY,
        origin: TEST_ORIGIN,
        ...(cookie ? { cookie } : {}),
      },
    },
    {
      onInit(client) {
        client.on('message', (data) => {
          try {
            queue.push(decodeMessage(data))
          } catch {
            // Strict positive-path assertions report invalid frames.
          }
        })
      },
    },
  )
  bufferedMessages.set(socket, queue)
  trackedSockets.add(socket)
  return socket
}

async function prepareStageFour(harness: G2Harness): Promise<{
  participantCookies: [string, string]
  adminCookie: string
  admin: AdminSnapshot
}> {
  const [participantA, participantB] = await Promise.all([
    harness.activate(0, {
      idempotencyKey: idempotencyKey('ws-activate', 1),
    }),
    harness.activate(1, {
      idempotencyKey: idempotencyKey('ws-activate', 2),
    }),
  ])
  const login = await harness.adminLogin()
  let admin = AdminSnapshotSchema.parse(login.response.json())
  let response = await harness.unsafeRequest(
    {
      method: 'PUT',
      url: '/api/admin/roles',
      headers: { 'idempotency-key': idempotencyKey('ws-roles') },
      payload: { ...commandVersion(admin), roles: ['ALL'] },
    },
    login.cookie,
  )
  expect(response.statusCode).toBe(200)
  admin = AdminSnapshotSchema.parse(response.json())
  for (const [sequence, command] of [
    [1, { action: 'START', confirmed: true }],
    [2, { action: 'JUMP', targetStage: 4, confirmed: true }],
    [3, { action: 'SET_PROGRAM', programId: 'program-001', confirmed: true }],
  ] as const) {
    response = await harness.unsafeRequest(
      {
        method: 'POST',
        url: '/api/admin/runtime',
        headers: { 'idempotency-key': idempotencyKey('ws-runtime', sequence) },
        payload: { ...commandVersion(admin), ...command },
      },
      login.cookie,
    )
    expect(response.statusCode).toBe(200)
    admin = AdminSnapshotSchema.parse(response.json())
  }
  return {
    participantCookies: [participantA.cookie, participantB.cookie],
    adminCookie: login.cookie,
    admin,
  }
}

async function sendGift(
  harness: G2Harness,
  cookie: string,
  version: { resetEpoch: number; stageRevision: number },
  sequence: number,
  giftId = 'gift-glimmer',
) {
  return harness.unsafeRequest(
    {
      method: 'POST',
      url: '/api/participant/gifts',
      headers: { 'idempotency-key': idempotencyKey('ws-gift', sequence) },
      payload: { ...version, programId: 'program-001', giftId },
    },
    cookie,
  )
}

describe('G2 committed WebSocket facts and high-water recovery', () => {
  let harness: G2Harness

  beforeEach(async () => {
    harness = await createG2Harness()
  })

  afterEach(async () => {
    for (const socket of trackedSockets) {
      socket.terminate()
    }
    trackedSockets.clear()
    await harness.close()
  })

  it('broadcasts a strict anonymous fact only after a successful commit', async () => {
    const prepared = await prepareStageFour(harness)
    const screen = ScreenSnapshotSchema.parse(
      (
        await harness.request({ method: 'GET', url: '/api/screen/snapshot' })
      ).json(),
    )
    const socket = await openSocket(
      harness,
      `stream=screen&resetEpoch=${screen.runtime.resetEpoch}&afterEventSeq=${screen.eventSeq}`,
    )
    const eventPromise = waitForMessage(
      socket,
      (value): value is Record<string, unknown> =>
        isRecord(value) && value.type === 'gift.accepted',
    )
    const response = await sendGift(
      harness,
      prepared.participantCookies[0],
      commandVersion(prepared.admin),
      1,
    )
    expect(response.statusCode).toBe(200)
    const event = G2RealtimeEventEnvelopeSchema.parse(await eventPromise)
    expect(event).toMatchObject({
      stream: 'screen',
      resetEpoch: screen.runtime.resetEpoch,
      type: 'gift.accepted',
      payload: {
        programId: 'program-001',
        giftId: 'gift-glimmer',
        powerCost: 5,
      },
    })
    expect(event.eventSeq).toBeGreaterThan(screen.eventSeq)
    const publicEvent = JSON.stringify(event)
    for (const participant of harness.manifest.participants.slice(0, 2)) {
      expect(publicEvent).not.toContain(participant.displayName)
      expect(publicEvent).not.toContain(participant.demoCode)
      expect(publicEvent).not.toContain(participant.inviteToken)
    }

    socket.close()

    for (const [sequence, giftId] of [
      [2, 'gift-starship'],
      [3, 'gift-orbit'],
      [4, 'gift-orbit'],
      [5, 'gift-glimmer'],
    ] as const) {
      expect(
        (
          await sendGift(
            harness,
            prepared.participantCookies[0],
            commandVersion(prepared.admin),
            sequence,
            giftId,
          )
        ).statusCode,
      ).toBe(200)
    }
    const authoritative = ParticipantSnapshotSchema.parse(
      (
        await harness.request({
          method: 'GET',
          url: '/api/participant/snapshot',
          headers: { cookie: prepared.participantCookies[0] },
        })
      ).json(),
    )
    expect(authoritative.participant.powerBalance).toBe(0)
    const failedHighWater = authoritative.eventSeq
    const noFactSocket = await openSocket(
      harness,
      `stream=screen&resetEpoch=${authoritative.runtime.resetEpoch}&afterEventSeq=${failedHighWater}`,
    )
    const noFact = expectNoMessage(
      noFactSocket,
      (value) => isRecord(value) && value.type === 'gift.accepted',
    )
    const rejected = await sendGift(
      harness,
      prepared.participantCookies[0],
      commandVersion(prepared.admin),
      6,
    )
    expect(rejected.statusCode).toBe(409)
    expect(await noFact).toBe(true)
    noFactSocket.close()
  })

  it('replays every committed fact after snapshot high-water without gaps or duplicates', async () => {
    const prepared = await prepareStageFour(harness)
    const before = ScreenSnapshotSchema.parse(
      (
        await harness.request({ method: 'GET', url: '/api/screen/snapshot' })
      ).json(),
    )

    expect(
      (
        await sendGift(
          harness,
          prepared.participantCookies[0],
          commandVersion(prepared.admin),
          10,
        )
      ).statusCode,
    ).toBe(200)
    const barrage = await harness.unsafeRequest(
      {
        method: 'POST',
        url: '/api/participant/barrages',
        headers: { 'idempotency-key': idempotencyKey('ws-barrage') },
        payload: {
          ...commandVersion(prepared.admin),
          text: '断线恢复测试',
          publicNoticeAccepted: true,
        },
      },
      prepared.participantCookies[0],
    )
    expect(barrage.statusCode).toBe(200)

    const after = ScreenSnapshotSchema.parse(
      (
        await harness.request({ method: 'GET', url: '/api/screen/snapshot' })
      ).json(),
    )
    expect(after.eventSeq).toBeGreaterThan(before.eventSeq)
    const socket = await openSocket(
      harness,
      `stream=screen&resetEpoch=${before.runtime.resetEpoch}&afterEventSeq=${before.eventSeq}`,
    )
    const received: Array<{ eventSeq: number; type: string }> = []
    while ((received.at(-1)?.eventSeq ?? before.eventSeq) < after.eventSeq) {
      const parsed = G2RealtimeEventEnvelopeSchema.parse(
        await waitForMessage(
          socket,
          (value): value is Record<string, unknown> =>
            isRecord(value) && typeof value.eventSeq === 'number',
        ),
      )
      received.push({ eventSeq: parsed.eventSeq, type: parsed.type })
    }
    expect(received[0]?.eventSeq).toBe(before.eventSeq + 1)
    expect(received.at(-1)?.eventSeq).toBe(after.eventSeq)
    expect(received.map(({ eventSeq }) => eventSeq)).toEqual(
      Array.from(
        { length: after.eventSeq - before.eventSeq },
        (_, index) => before.eventSeq + index + 1,
      ),
    )
    expect(new Set(received.map(({ eventSeq }) => eventSeq)).size).toBe(
      received.length,
    )
    expect(received.some(({ type }) => type === 'gift.accepted')).toBe(true)
    expect(received.some(({ type }) => type === 'barrage.published')).toBe(true)
    socket.close()
  })

  it('rejects a cursor older than the retained replay window instead of going online after a partial backlog', async () => {
    const before = ScreenSnapshotSchema.parse(
      (
        await harness.request({ method: 'GET', url: '/api/screen/snapshot' })
      ).json(),
    )
    const eventCount = 5_001
    const finalEventSeq = before.eventSeq + eventCount
    const committedAt = harness.now().toISOString()
    const aggregatePayload = JSON.stringify({
      activatedCount: 0,
      starStartedCount: 0,
      totalStarlight: 0,
      interactionCount: 0,
      cooperativeLightCount: 0,
      eligibleParticipantCount: 0,
    })
    const database = openDatabase(harness.config.databasePath)
    try {
      const insertEvent = database.prepare(
        `INSERT INTO domain_events (
           event_seq, event_id, reset_epoch, stream, event_type,
           payload_json, committed_at, audience_subject_id
         ) VALUES (?, ?, ?, 'screen', 'aggregate.updated', ?, ?, NULL)`,
      )
      database.transaction(() => {
        for (
          let eventSeq = before.eventSeq + 1;
          eventSeq <= finalEventSeq;
          eventSeq += 1
        ) {
          insertEvent.run(
            eventSeq,
            `history-unavailable-${eventSeq}`,
            before.runtime.resetEpoch,
            aggregatePayload,
            committedAt,
          )
        }
        database
          .prepare(
            `UPDATE app_state
             SET event_seq = ?, updated_at = ?
             WHERE id = 1`,
          )
          .run(finalEventSeq, committedAt)
      })()
    } finally {
      database.close()
    }

    const socket = await openSocket(
      harness,
      `stream=screen&resetEpoch=${before.runtime.resetEpoch}&afterEventSeq=${before.eventSeq}`,
    )
    const closePromise = waitForClose(socket)
    const firstFrame = G2RealtimeEventEnvelopeSchema.parse(
      await waitForMessage(
        socket,
        (value): value is Record<string, unknown> => isRecord(value),
      ),
    )

    expect(firstFrame).toMatchObject({
      resetEpoch: before.runtime.resetEpoch,
      stream: 'screen',
      eventSeq: finalEventSeq,
      type: 'resync.required',
      payload: { reason: 'HISTORY_UNAVAILABLE' },
    })
    expect(await closePromise).toEqual({
      code: 1012,
      reason: 'resync required',
    })
    expect(bufferedMessages.get(socket)).toEqual([])
  })

  it('never loses or duplicates facts while switching from backlog replay to the live hub', async () => {
    const prepared = await prepareStageFour(harness)

    for (let round = 0; round < 6; round += 1) {
      const cursor = ScreenSnapshotSchema.parse(
        (
          await harness.request({ method: 'GET', url: '/api/screen/snapshot' })
        ).json(),
      )
      const backlog = await sendGift(
        harness,
        prepared.participantCookies[0],
        commandVersion(prepared.admin),
        100 + round * 2,
      )
      expect(backlog.statusCode).toBe(200)

      const query = `stream=screen&resetEpoch=${cursor.runtime.resetEpoch}&afterEventSeq=${cursor.eventSeq}`
      let socket: InjectedSocket
      let liveResponse: Awaited<ReturnType<typeof sendGift>>
      if (round % 2 === 0) {
        ;[socket, liveResponse] = await Promise.all([
          openSocket(harness, query),
          sendGift(
            harness,
            prepared.participantCookies[0],
            commandVersion(prepared.admin),
            101 + round * 2,
          ),
        ])
      } else {
        const [response, connection] = await Promise.all([
          sendGift(
            harness,
            prepared.participantCookies[0],
            commandVersion(prepared.admin),
            101 + round * 2,
          ),
          openSocket(harness, query),
        ])
        liveResponse = response
        socket = connection
      }
      expect(liveResponse.statusCode).toBe(200)

      const finalSnapshot = ScreenSnapshotSchema.parse(
        (
          await harness.request({ method: 'GET', url: '/api/screen/snapshot' })
        ).json(),
      )
      const events: Array<{ eventSeq: number; type: string }> = []
      let resyncReason: string | null = null
      while (
        resyncReason === null &&
        (events.at(-1)?.eventSeq ?? cursor.eventSeq) < finalSnapshot.eventSeq
      ) {
        const raw = await waitForMessage(
          socket,
          (value): value is Record<string, unknown> =>
            isRecord(value) && typeof value.eventSeq === 'number',
        )
        const parsed = G2RealtimeEventEnvelopeSchema.parse(raw)
        if (parsed.type === 'resync.required') {
          resyncReason = parsed.payload.reason
          break
        }
        events.push({ eventSeq: parsed.eventSeq, type: parsed.type })
      }

      if (resyncReason === null) {
        const expectedSequences = Array.from(
          { length: finalSnapshot.eventSeq - cursor.eventSeq },
          (_, index) => cursor.eventSeq + index + 1,
        )
        expect(events.map(({ eventSeq }) => eventSeq)).toEqual(
          expectedSequences,
        )
        expect(new Set(events.map(({ eventSeq }) => eventSeq)).size).toBe(
          events.length,
        )
        expect(events.filter(({ type }) => type === 'gift.accepted')).toHaveLength(
          2,
        )
      } else {
        expect([
          'EPOCH_CHANGED',
          'EVENT_GAP',
          'HISTORY_UNAVAILABLE',
        ]).toContain(resyncReason)
      }
      socket.close()
    }
  })

  it('isolates authenticated participant streams and private HTTP state by subject', async () => {
    const prepared = await prepareStageFour(harness)
    const [snapshotA, snapshotB] = await Promise.all(
      prepared.participantCookies.map(async (cookie) =>
        ParticipantSnapshotSchema.parse(
          (
            await harness.request({
              method: 'GET',
              url: '/api/participant/snapshot',
              headers: { cookie },
            })
          ).json(),
        ),
      ),
    )
    const [socketA, socketB] = await Promise.all([
      openSocket(
        harness,
        `stream=participant&resetEpoch=${snapshotA.runtime.resetEpoch}&afterEventSeq=${snapshotA.eventSeq}`,
        prepared.participantCookies[0],
      ),
      openSocket(
        harness,
        `stream=participant&resetEpoch=${snapshotB.runtime.resetEpoch}&afterEventSeq=${snapshotB.eventSeq}`,
        prepared.participantCookies[1],
      ),
    ])
    const eventForA = waitForMessage(
      socketA,
      (value): value is Record<string, unknown> =>
        isRecord(value) && value.stream === 'participant',
    )
    const nothingForB = expectNoMessage(
      socketB,
      (value) => isRecord(value) && value.stream === 'participant',
      300,
    )
    expect(
      (
        await sendGift(
          harness,
          prepared.participantCookies[0],
          commandVersion(prepared.admin),
          20,
        )
      ).statusCode,
    ).toBe(200)
    const privateEvent = RealtimeEventEnvelopeSchema.parse(await eventForA)
    expect(privateEvent.stream).toBe('participant')
    const privateJson = JSON.stringify(privateEvent)
    expect(privateJson).not.toContain(harness.manifest.participants[1].displayName)
    expect(privateJson).not.toContain(harness.manifest.participants[1].demoCode)
    expect(privateJson).not.toContain(harness.manifest.participants[1].inviteToken)
    expect(await nothingForB).toBe(true)
    const [afterA, afterB] = await Promise.all(
      prepared.participantCookies.map(async (cookie) =>
        ParticipantSnapshotSchema.parse(
          (
            await harness.request({
              method: 'GET',
              url: '/api/participant/snapshot',
              headers: { cookie },
            })
          ).json(),
        ),
      ),
    )
    expect(afterA.participant.powerBalance).toBe(95)
    expect(afterB.participant.powerBalance).toBe(100)
    socketA.close()
    socketB.close()
  })

  it('recovers disconnected participant-private state from the authoritative snapshot before resuming live invalidations', async () => {
    const activation = await harness.activate(0, {
      idempotencyKey: idempotencyKey('private-recovery-activate'),
    })
    const initial = ParticipantSnapshotSchema.parse(activation.response.json())
    const disconnectedSocket = await openSocket(
      harness,
      `stream=participant&resetEpoch=${initial.runtime.resetEpoch}&afterEventSeq=${initial.eventSeq}`,
      activation.cookie,
    )
    await closeSocket(disconnectedSocket)

    const firstSave = await harness.unsafeRequest(
      {
        method: 'PUT',
        url: '/api/participant/future-message',
        headers: { 'idempotency-key': idempotencyKey('private-recovery', 1) },
        payload: {
          ...commandVersion(initial),
          text: '断线期间保存的合成寄语',
        },
      },
      activation.cookie,
    )
    expect(firstSave.statusCode).toBe(200)
    const committed = ParticipantSnapshotSchema.parse(firstSave.json())
    expect(committed.eventSeq).toBeGreaterThan(initial.eventSeq)

    const recovered = ParticipantSnapshotSchema.parse(
      (
        await harness.request({
          method: 'GET',
          url: '/api/participant/snapshot',
          headers: { cookie: activation.cookie },
        })
      ).json(),
    )
    expect(recovered.eventSeq).toBe(committed.eventSeq)
    expect(recovered.participant).toMatchObject({
      futureMessage: '断线期间保存的合成寄语',
      futureMessageSaved: true,
      starlight: 40,
    })

    const resumedSocket = await openSocket(
      harness,
      `stream=participant&resetEpoch=${recovered.runtime.resetEpoch}&afterEventSeq=${recovered.eventSeq}`,
      activation.cookie,
    )
    const liveInvalidation = waitForMessage(
      resumedSocket,
      (value): value is Record<string, unknown> =>
        isRecord(value) &&
        value.stream === 'participant' &&
        value.type === 'participant.snapshot.changed',
    )
    const secondSave = await harness.unsafeRequest(
      {
        method: 'PUT',
        url: '/api/participant/future-message',
        headers: { 'idempotency-key': idempotencyKey('private-recovery', 2) },
        payload: {
          ...commandVersion(recovered),
          text: '恢复连接后的更新寄语',
        },
      },
      activation.cookie,
    )
    expect(secondSave.statusCode).toBe(200)
    const invalidation = RealtimeEventEnvelopeSchema.parse(
      await liveInvalidation,
    )
    expect(invalidation).toMatchObject({
      resetEpoch: recovered.runtime.resetEpoch,
      stream: 'participant',
      type: 'participant.snapshot.changed',
      payload: {},
    })
    expect(
      ParticipantSnapshotSchema.parse(secondSave.json()).participant
        .futureMessage,
    ).toBe('恢复连接后的更新寄语')
    resumedSocket.close()
  })

  it('requires resync when a client reconnects with an old reset epoch', async () => {
    const prepared = await prepareStageFour(harness)
    const before = ScreenSnapshotSchema.parse(
      (
        await harness.request({ method: 'GET', url: '/api/screen/snapshot' })
      ).json(),
    )
    const reset = await harness.unsafeRequest(
      {
        method: 'POST',
        url: '/api/admin/reset',
        headers: { 'idempotency-key': idempotencyKey('ws-reset') },
        payload: {
          ...commandVersion(prepared.admin),
          confirmation: 'RESET DEMO',
        },
      },
      prepared.adminCookie,
    )
    expect(reset.statusCode).toBe(200)

    const socket = await openSocket(
      harness,
      `stream=screen&resetEpoch=${before.runtime.resetEpoch}&afterEventSeq=${before.eventSeq}`,
    )
    const event = G2RealtimeEventEnvelopeSchema.parse(
      await waitForMessage(
        socket,
        (value): value is Record<string, unknown> =>
          isRecord(value) && value.type === 'resync.required',
      ),
    )
    expect(event).toMatchObject({
      resetEpoch: before.runtime.resetEpoch + 1,
      stream: 'screen',
      type: 'resync.required',
      payload: { reason: 'EPOCH_CHANGED' },
    })
    socket.close()

    const reactivated = await harness.activate(0, {
      idempotencyKey: idempotencyKey('ws-reset-reactivate'),
    })
    const participantSocket = await openSocket(
      harness,
      `stream=participant&resetEpoch=${before.runtime.resetEpoch}&afterEventSeq=${before.eventSeq}`,
      reactivated.cookie,
    )
    const participantResync = G2RealtimeEventEnvelopeSchema.parse(
      await waitForMessage(
        participantSocket,
        (value): value is Record<string, unknown> =>
          isRecord(value) && value.type === 'resync.required',
      ),
    )
    expect(participantResync).toMatchObject({
      resetEpoch: before.runtime.resetEpoch + 1,
      type: 'resync.required',
      payload: { reason: 'EPOCH_CHANGED' },
    })
    participantSocket.close()
  })
})
