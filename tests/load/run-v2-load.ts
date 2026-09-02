import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import {
  V2ActivateParticipantResponseSchema,
  V2AdminCommandResponseSchema,
  V2AdminSnapshotSchema,
  V2ApiErrorResponseSchema,
  V2ParticipantCommandResponseSchema,
  V2ParticipantSnapshotSchema,
  V2ScreenSnapshotSchema,
  type V2AdminSnapshot,
  type V2ParticipantSnapshot,
  type V2RealtimeEventEnvelope,
  type V2ScreenSnapshot,
} from '../../packages/contracts/src/index.js'
import { BACKEND_ROOT } from '../../backend/src/config.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import { verifyV2Foundation } from '../../backend/src/db/v2-foundation.js'
import { startDemoTestStack, type DemoTestStack } from '../e2e/fixtures/demo-stack.js'
import {
  LOAD_THRESHOLD_MS,
  OperationRecorder,
  assertCondition,
  mapLimit,
  type OperationSummary,
} from './metrics.js'
import {
  SanitizedV2ProtocolError,
  closeV2WebSockets,
  connectRawV2WebSocket,
  connectV2WebSocket,
  createV2HttpClient,
  type V2WebSocketLike,
} from './v2-protocol-client.js'

const PARTICIPANT_COUNT = 300
const PRIMARY_CONCURRENCY = 24
const SOCKET_CONCURRENCY = 32
const REPORT_SCHEMA_VERSION = 2
const REPORT_ROOT = fileURLToPath(new URL('../reports/', import.meta.url))
const REPORT_PATH = path.join(REPORT_ROOT, 'v2-load.json')
const OBSERVATION_TIMEOUT_MS = 20_000
const RESTART_TIMEOUT_MS = 30_000

type OperationName =
  | 'activation'
  | 'colorLock'
  | 'runtimeFanout'
  | 'starStart'
  | 'gift'
  | 'barrage'
  | 'cooperativeLight'

interface LoadParticipant {
  index: number
  cookie: string
  snapshot: V2ParticipantSnapshot
  observer: V2ParticipantObserver | null
}

interface LoadFailure {
  operation: string
  code: string
}

interface DatabaseInvariantReport {
  participantStates: number
  publicStars: number
  admitted: number
  capsulesSubmitted: number
  capsulesSkipped: number
  startedStars: number
  cooperativeLights: number
  ledgerEntries: number
  giftTransactions: number
  publishedBarrages: number
  totalPower: number
  totalStarlight: number
  programHeat: number
  duplicatePublicStarIds: number
  duplicateFormationSlots: number
  duplicateRewardKeys: number
  duplicateIdempotencyRecords: number
  negativeBalances: number
  outOfRangeStarlight: number
  oldEpochRows: number
  privateFieldsInPublicEvents: number
  malformedPublicEvents: number
  foundationReady: boolean
  foundationIssues: number
  passed: boolean
}

function idempotencyKey(operation: string, index: number, suffix = ''): string {
  return `v2-load-${operation}-${String(index).padStart(3, '0')}${suffix}`
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, durationMs)
    timeout.unref()
  })
}

function failureCode(error: unknown): string {
  if (error instanceof SanitizedV2ProtocolError) return error.code
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return error instanceof Error && error.name ? error.name : 'UNKNOWN_ERROR'
}

function recordFailure(
  failures: LoadFailure[],
  operation: string,
  error: unknown,
): void {
  failures.push({
    operation: error instanceof SanitizedV2ProtocolError
      ? error.operation
      : operation,
    code: failureCode(error),
  })
}

function waitForCondition(
  operation: string,
  condition: () => boolean,
  timeoutMs = OBSERVATION_TIMEOUT_MS,
): Promise<number> {
  const startedAt = performance.now()
  if (condition()) return Promise.resolve(0)
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (!condition()) return
      clearInterval(interval)
      clearTimeout(timeout)
      resolve(performance.now() - startedAt)
    }, 5)
    interval.unref()
    const timeout = setTimeout(() => {
      clearInterval(interval)
      reject(new SanitizedV2ProtocolError({ operation, code: 'TIMEOUT' }))
    }, timeoutMs)
    timeout.unref()
  })
}

class V2ScreenObserver {
  publicSeq = 0
  runRevision = 0
  aggregateRevision = 0
  interactionRevision = 0
  rawFrames = 0
  protocolErrors = 0
  duplicateFrames = 0
  privacyErrors = 0
  firstProtocolIssue: { streamId: string; expectedSeq: number; receivedSeq: number; name: string } | null = null
  readonly starRevisions = new Map<string, number>()
  readonly eventCounts = new Map<string, number>()
  readonly barrageTexts = new Set<string>()

  constructor(initial: V2ScreenSnapshot) {
    this.publicSeq = initial.publicSeq
    this.runRevision = initial.runtime.runRevision
    this.aggregateRevision = initial.aggregateRevision
    this.interactionRevision = initial.interaction.interactionRevision
    for (const star of initial.publicStars) {
      this.starRevisions.set(star.publicStarId, star.starRevision)
    }
  }

  accept(event: V2RealtimeEventEnvelope): void {
    this.rawFrames += 1
    if (event.streamId !== 'public') {
      this.protocolErrors += 1
      this.firstProtocolIssue ??= {
        streamId: event.streamId,
        expectedSeq: this.publicSeq + 1,
        receivedSeq: event.streamSeq,
        name: event.name,
      }
      return
    }
    if (event.streamSeq <= this.publicSeq) {
      this.duplicateFrames += 1
      return
    }
    if (event.streamSeq !== this.publicSeq + 1) {
      this.protocolErrors += 1
      this.firstProtocolIssue ??= {
        streamId: event.streamId,
        expectedSeq: this.publicSeq + 1,
        receivedSeq: event.streamSeq,
        name: event.name,
      }
      return
    }
    this.publicSeq = event.streamSeq
    this.eventCounts.set(event.name, (this.eventCounts.get(event.name) ?? 0) + 1)
    if (event.name === 'runtime.changed') {
      this.runRevision = event.payload.runtime.runRevision
    } else if (event.name === 'star.node.upserted') {
      this.starRevisions.set(event.payload.star.publicStarId, event.payload.star.starRevision)
    } else if (event.name === 'aggregate.changed') {
      this.aggregateRevision = event.payload.aggregateRevision
    } else if (
      event.name === 'gift.sent' ||
      event.name === 'barrage.published' ||
      event.name === 'barrage.removed' ||
      event.name === 'barrage.cleared' ||
      event.name === 'barrage.pause.changed' ||
      event.name === 'program.changed'
    ) {
      this.interactionRevision = event.payload.interactionRevision
      if (event.name === 'barrage.published') {
        this.barrageTexts.add(event.payload.barrage.text)
      }
    }
    const serialized = JSON.stringify(event)
    if (
      /"(?:identityId|participantId|studentNumber|displayName|inviteToken|sourceId)"/u
        .test(serialized)
    ) {
      this.privacyErrors += 1
    }
  }

  count(name: string): number {
    return this.eventCounts.get(name) ?? 0
  }
}

class V2ParticipantObserver {
  publicSeq: number
  participantSeq: number
  participantRevision: number
  runRevision: number
  rawFrames = 0
  protocolErrors = 0
  duplicateFrames = 0
  firstProtocolIssue: { streamId: string; expectedSeq: number; receivedSeq: number; name: string } | null = null

  constructor(readonly streamId: string, snapshot: V2ParticipantSnapshot) {
    this.publicSeq = snapshot.publicSeq
    this.participantSeq = snapshot.participantSeq
    this.participantRevision = snapshot.participant.participantRevision
    this.runRevision = snapshot.runtime.runRevision
  }

  accept(event: V2RealtimeEventEnvelope): void {
    this.rawFrames += 1
    if (event.streamId === 'public') {
      if (event.streamSeq <= this.publicSeq) {
        this.duplicateFrames += 1
        return
      }
      if (event.streamSeq !== this.publicSeq + 1) {
        this.protocolErrors += 1
        this.firstProtocolIssue ??= {
          streamId: event.streamId,
          expectedSeq: this.publicSeq + 1,
          receivedSeq: event.streamSeq,
          name: event.name,
        }
        return
      }
      this.publicSeq = event.streamSeq
      if (event.name === 'runtime.changed') {
        this.runRevision = event.payload.runtime.runRevision
      }
      return
    }
    if (event.streamId === this.streamId) {
      if (event.streamSeq <= this.participantSeq) {
        this.duplicateFrames += 1
        return
      }
      if (event.streamSeq !== this.participantSeq + 1) {
        this.protocolErrors += 1
        this.firstProtocolIssue ??= {
          streamId: event.streamId,
          expectedSeq: this.participantSeq + 1,
          receivedSeq: event.streamSeq,
          name: event.name,
        }
        return
      }
      this.participantSeq = event.streamSeq
      if (event.name === 'participant.snapshot.changed') {
        this.participantRevision = event.payload.participantRevision
      }
      return
    }
    this.protocolErrors += 1
    this.firstProtocolIssue ??= {
      streamId: event.streamId,
      expectedSeq: -1,
      receivedSeq: event.streamSeq,
      name: event.name,
    }
  }
}

function scalar(database: ReturnType<typeof openDatabase>, sql: string): number {
  return Number(database.prepare(sql).pluck().get())
}

function readDatabaseInvariants(
  stack: DemoTestStack,
  expectedEpoch: number,
): DatabaseInvariantReport {
  const database = openDatabase(stack.databasePath)
  try {
    const foundation = verifyV2Foundation(database, {
      migrationsPath: path.join(BACKEND_ROOT, 'migrations'),
      manifestPath: stack.manifestPath,
      participantCount: PARTICIPANT_COUNT,
    })
    const report: DatabaseInvariantReport = {
      participantStates: scalar(database, 'SELECT count(*) FROM v2_participant_states'),
      publicStars: scalar(database, 'SELECT count(*) FROM v2_public_stars'),
      admitted: scalar(database, "SELECT count(*) FROM v2_participant_states WHERE onboarding_state='ADMITTED'"),
      capsulesSubmitted: scalar(database, "SELECT count(*) FROM v2_participant_states WHERE capsule_decision='SUBMITTED'"),
      capsulesSkipped: scalar(database, "SELECT count(*) FROM v2_participant_states WHERE capsule_decision='SKIPPED'"),
      startedStars: scalar(database, 'SELECT count(*) FROM v2_participant_states WHERE started_at IS NOT NULL'),
      cooperativeLights: scalar(database, 'SELECT count(*) FROM v2_participant_states WHERE cooperative_light_at IS NOT NULL'),
      ledgerEntries: scalar(database, 'SELECT count(*) FROM v2_reward_ledger'),
      giftTransactions: scalar(database, 'SELECT count(*) FROM v2_gift_transactions'),
      publishedBarrages: scalar(database, "SELECT count(*) FROM v2_barrage_publications WHERE status='PUBLISHED'"),
      totalPower: scalar(database, 'SELECT COALESCE(sum(power_balance),0) FROM v2_participant_states'),
      totalStarlight: scalar(database, 'SELECT COALESCE(sum(starlight),0) FROM v2_participant_states'),
      programHeat: scalar(database, 'SELECT COALESCE(sum(heat),0) FROM program_catalog'),
      duplicatePublicStarIds: scalar(database, 'SELECT count(*) FROM (SELECT public_star_id FROM v2_public_stars GROUP BY public_star_id HAVING count(*)>1)'),
      duplicateFormationSlots: scalar(database, 'SELECT count(*) FROM (SELECT formation_slot FROM v2_public_stars GROUP BY formation_slot HAVING count(*)>1)'),
      duplicateRewardKeys: scalar(database, 'SELECT count(*) FROM (SELECT reset_epoch,identity_id,event_key FROM v2_reward_ledger GROUP BY reset_epoch,identity_id,event_key HAVING count(*)>1)'),
      duplicateIdempotencyRecords: scalar(database, 'SELECT count(*) FROM (SELECT reset_epoch,scope,key_digest FROM v2_idempotency_records GROUP BY reset_epoch,scope,key_digest HAVING count(*)>1)'),
      negativeBalances: scalar(database, 'SELECT count(*) FROM v2_participant_states WHERE power_balance<0'),
      outOfRangeStarlight: scalar(database, 'SELECT count(*) FROM v2_participant_states WHERE starlight<0 OR starlight>100'),
      oldEpochRows: 0,
      privateFieldsInPublicEvents: scalar(database, `SELECT count(*) FROM v2_domain_events WHERE stream_id='public' AND (payload_json LIKE '%identityId%' OR payload_json LIKE '%participantId%' OR payload_json LIKE '%studentNumber%' OR payload_json LIKE '%displayName%' OR payload_json LIKE '%inviteToken%' OR payload_json LIKE '%sourceId%')`),
      malformedPublicEvents: scalar(database, `SELECT count(*) FROM v2_domain_events WHERE stream_id='public' AND event_name NOT IN ('runtime.changed','presentation.changed','star.node.upserted','aggregate.changed','barrage.published','barrage.removed','barrage.cleared','barrage.pause.changed','gift.sent','program.changed')`),
      foundationReady: foundation.ready,
      foundationIssues: foundation.issues.length,
      passed: false,
    }
    for (const table of [
      'v2_participant_states', 'v2_reward_ledger', 'v2_public_stars',
      'v2_capsules', 'v2_sessions', 'v2_idempotency_records',
      'v2_stream_cursors', 'v2_domain_events', 'v2_control_receipts',
      'v2_gift_transactions', 'v2_barrages', 'v2_final_recap_capsules',
      'v2_screen_interaction_state', 'v2_public_sources',
      'v2_barrage_publications', 'v2_screen_moderation_audit',
      'v2_raffle_state', 'v2_raffle_draws',
    ]) {
      report.oldEpochRows += scalar(
        database,
        `SELECT count(*) FROM ${table} WHERE reset_epoch != ${Number(expectedEpoch)}`,
      )
    }
    report.passed =
      report.participantStates === PARTICIPANT_COUNT &&
      report.publicStars === PARTICIPANT_COUNT &&
      report.admitted === PARTICIPANT_COUNT &&
      report.capsulesSubmitted === 0 &&
      report.capsulesSkipped === PARTICIPANT_COUNT &&
      report.startedStars === PARTICIPANT_COUNT &&
      report.cooperativeLights === PARTICIPANT_COUNT &&
      report.ledgerEntries === 1_500 &&
      report.giftTransactions === 1_200 &&
      report.publishedBarrages === PARTICIPANT_COUNT &&
      report.totalPower === PARTICIPANT_COUNT * 15 &&
      report.totalStarlight === 30_000 &&
      report.programHeat === PARTICIPANT_COUNT * 85 &&
      report.duplicatePublicStarIds === 0 &&
      report.duplicateFormationSlots === 0 &&
      report.duplicateRewardKeys === 0 &&
      report.duplicateIdempotencyRecords === 0 &&
      report.negativeBalances === 0 &&
      report.outOfRangeStarlight === 0 &&
      report.oldEpochRows === 0 &&
      report.privateFieldsInPublicEvents === 0 &&
      report.malformedPublicEvents === 0 &&
      report.foundationReady &&
      report.foundationIssues === 0
    return report
  } finally {
    database.close()
  }
}

function readPostResetOldEpochRows(stack: DemoTestStack, oldEpoch: number): number {
  const database = openDatabase(stack.databasePath)
  try {
    return [
      'v2_participant_states', 'v2_reward_ledger', 'v2_public_stars',
      'v2_capsules', 'v2_sessions', 'v2_idempotency_records',
      'v2_domain_events', 'v2_gift_transactions', 'v2_barrages',
      'v2_barrage_publications', 'v2_public_sources',
      'v2_raffle_state', 'v2_raffle_draws',
    ].reduce(
      (sum, table) => sum + scalar(database, `SELECT count(*) FROM ${table} WHERE reset_epoch=${Number(oldEpoch)}`),
      0,
    )
  } finally {
    database.close()
  }
}

function collectStringLeaves(value: unknown, output = new Set<string>()): Set<string> {
  if (typeof value === 'string') output.add(value)
  else if (Array.isArray(value)) for (const item of value) collectStringLeaves(item, output)
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStringLeaves(item, output)
    }
  }
  return output
}

function reportPrivacyAudit(report: unknown, stack: DemoTestStack | null): boolean {
  if (!stack) return false
  const forbidden = new Set<string>()
  for (let index = 0; index < stack.credentials.participants.length; index += 1) {
    const participant = stack.credentials.participants[index]!
    forbidden.add(participant.inviteToken)
    forbidden.add(participant.displayName)
    forbidden.add(participant.studentNumber)
    forbidden.add(`v2-load-barrage-${String(index).padStart(3, '0')}`)
  }
  forbidden.add(stack.credentials.admin.username)
  forbidden.add(stack.credentials.admin.password)
  const strings = collectStringLeaves(report)
  return [...strings].every((value) => !forbidden.has(value))
}

async function closeAndWait(
  sockets: readonly V2WebSocketLike[],
  expectedClosed: number,
): Promise<number> {
  closeV2WebSockets(sockets)
  await waitForCondition(
    'websocket-close',
    () => sockets.filter((socket) => socket.readyState === 3).length >= expectedClosed,
    RESTART_TIMEOUT_MS,
  )
  return sockets.filter((socket) => socket.readyState === 3).length
}

async function run(): Promise<void> {
  const startedAt = new Date()
  const wallStarted = performance.now()
  let stack: DemoTestStack | null = null
  let status: 'passed' | 'failed' = 'failed'
  let topLevelFailure: string | null = null
  let preResetInvariants: DatabaseInvariantReport | null = null
  let postResetOldEpochRows: number | null = null
  let initialOpened = 0
  let restartDisconnects = 0
  let recoveredOpened = 0
  let temporaryDirectoryRemoved = false
  let protocolErrors = 0
  let expectedEpochInvalidations = 0
  let duplicateFrames = 0
  let firstProtocolIssue: {
    streamId: string
    expectedSeq: number
    receivedSeq: number
    name: string
  } | null = null
  let privacyErrors = 0
  let screenRawFrames = 0
  let participantRawFrames = 0
  let replayInvariantPreserved = false
  let staleParticipantSessionRejected = false
  let oldEpochRejected = false
  let fixedCredentialReactivation = false
  let resetDurationMs: number | null = null
  const failures: LoadFailure[] = []
  const sockets: V2WebSocketLike[] = []
  const participants: LoadParticipant[] = []
  const recorders: Record<OperationName, OperationRecorder> = {
    activation: new OperationRecorder(),
    colorLock: new OperationRecorder(),
    runtimeFanout: new OperationRecorder(),
    starStart: new OperationRecorder(),
    gift: new OperationRecorder(),
    barrage: new OperationRecorder(),
    cooperativeLight: new OperationRecorder(),
  }
  let screenObserver: V2ScreenObserver | null = null

  try {
    stack = await startDemoTestStack({
      protocolVersion: '2',
      participantCount: PARTICIPANT_COUNT,
      inProcess: true,
      startupTimeoutMs: 60_000,
    })
    const client = createV2HttpClient(stack.backendOrigin, stack.requestOrigin)
    let screen = V2ScreenSnapshotSchema.parse((await client.request(
      'screen-initial', 'GET', '/api/v2/screen/snapshot',
    )).body)
    const initialEpoch = screen.resetEpoch
    screenObserver = new V2ScreenObserver(screen)
    sockets.push(await connectV2WebSocket({
      baseUrl: stack.backendOrigin,
      requestOrigin: stack.requestOrigin,
      clientSurface: 'SCREEN',
      resetEpoch: initialEpoch,
      streams: [{ streamId: 'public', streamSeq: screen.publicSeq }],
      onEvent: (event) => screenObserver!.accept(event),
      onProtocolError: () => { protocolErrors += 1 },
      onControlError: (code) => {
        if (code === 'STALE_RESET_EPOCH') expectedEpochInvalidations += 1
        else protocolErrors += 1
      },
    }))

    const adminLogin = await client.request<V2AdminSnapshot>(
      'admin-login', 'POST', '/api/v2/admin/login',
      { body: stack.credentials.admin },
    )
    let adminCookie = adminLogin.cookie
    assertCondition(adminCookie, 'Admin login did not issue a session')
    let admin = V2AdminSnapshotSchema.parse(adminLogin.body)

    const activated = await mapLimit(
      stack.credentials.participants,
      PRIMARY_CONCURRENCY,
      async (credential, index) => {
        const started = performance.now()
        try {
          const response = await client.request(
            'participant-activation', 'POST', '/api/v2/participant/activate',
            { body: {
              protocolVersion: '2', resetEpoch: initialEpoch,
              idempotencyKey: idempotencyKey('activate', index),
              method: 'INVITATION_TOKEN', token: credential.inviteToken,
            } },
          )
          const body = V2ActivateParticipantResponseSchema.parse(response.body)
          assertCondition(response.cookie, 'Activation did not issue a session')
          await waitForCondition(
            'activation-public-observation',
            () => screenObserver!.publicSeq >= body.snapshot.publicSeq,
          )
          recorders.activation.success(performance.now() - started)
          return {
            index,
            cookie: response.cookie,
            snapshot: body.snapshot,
            observer: null,
          } satisfies LoadParticipant
        } catch (error) {
          recorders.activation.failure()
          recordFailure(failures, 'activation', error)
          throw error
        }
      },
    )
    participants.push(...activated)

    const refreshedParticipants = await mapLimit(
      participants,
      PRIMARY_CONCURRENCY,
      async (participant) => V2ParticipantSnapshotSchema.parse((await client.request(
        'participant-snapshot-before-websocket',
        'GET',
        '/api/v2/participant/snapshot',
        { cookie: participant.cookie },
      )).body),
    )
    await mapLimit(participants, SOCKET_CONCURRENCY, async (participant, index) => {
      const snapshot = refreshedParticipants[index]!
      participant.snapshot = snapshot
      participant.observer = new V2ParticipantObserver(snapshot.participantStreamId, snapshot)
      const socket = await connectV2WebSocket({
        baseUrl: stack!.backendOrigin,
        requestOrigin: stack!.requestOrigin,
        cookie: participant.cookie,
        clientSurface: 'WELCOME',
        resetEpoch: initialEpoch,
        streams: [
          { streamId: 'public', streamSeq: snapshot.publicSeq },
          { streamId: snapshot.participantStreamId, streamSeq: snapshot.participantSeq },
        ],
        onEvent: (event) => participant.observer!.accept(event),
        onProtocolError: () => { protocolErrors += 1 },
        onControlError: (code) => {
          if (code === 'STALE_RESET_EPOCH') expectedEpochInvalidations += 1
          else protocolErrors += 1
        },
      })
      sockets.push(socket)
    })
    initialOpened = sockets.length
    assertCondition(initialOpened === 301, 'V2 load did not open 301 sockets')

    await mapLimit(participants, PRIMARY_CONCURRENCY, async (participant) => {
      const started = performance.now()
      try {
        const response = V2ParticipantCommandResponseSchema.parse((await client.request(
          'lock-color', 'POST', '/api/v2/participant/commands',
          { cookie: participant.cookie, body: {
            protocolVersion: '2', resetEpoch: initialEpoch,
            idempotencyKey: idempotencyKey('lock-color', participant.index),
            expectedParticipantRevision: participant.snapshot.participant.participantRevision,
            command: 'LOCK_COLOR',
            colorTemperatureKelvin: 2400 + (participant.index % 97) * 90,
          } },
        )).body)
        participant.snapshot = V2ParticipantSnapshotSchema.parse((await client.request(
          'snapshot-after-color', 'GET', '/api/v2/participant/snapshot',
          { cookie: participant.cookie },
        )).body)
        await Promise.all([
          waitForCondition('color-private-observation', () =>
            participant.observer!.participantRevision >= response.participant.participantRevision),
          waitForCondition('color-public-observation', () => {
            const publicStarId = response.participant.ownPublicStarId
            return publicStarId !== null &&
              (screenObserver!.starRevisions.get(publicStarId) ?? -1) >= 1
          }),
        ])
        recorders.colorLock.success(performance.now() - started)
      } catch (error) {
        recorders.colorLock.failure()
        recordFailure(failures, 'colorLock', error)
        throw error
      }
    })

    admin = V2AdminSnapshotSchema.parse((await client.request(
      'admin-before-runtime', 'GET', '/api/v2/admin/snapshot', { cookie: adminCookie },
    )).body)
    const applyAdmin = async (
      operation: string,
      body: Record<string, unknown>,
      observeRuntime = true,
    ): Promise<void> => {
      const started = performance.now()
      const response = V2AdminCommandResponseSchema.parse((await client.request(
        operation, 'POST', '/api/v2/admin/commands',
        { cookie: adminCookie!, body },
      )).body)
      if (observeRuntime) {
        await Promise.all([
          waitForCondition(`${operation}-screen`, () =>
            screenObserver!.runRevision >= response.runtime.runRevision),
          ...participants.map((participant) => waitForCondition(
            `${operation}-participant`,
            () => participant.observer!.runRevision >= response.runtime.runRevision,
          )),
        ])
        recorders.runtimeFanout.success(performance.now() - started)
      }
      admin = V2AdminSnapshotSchema.parse((await client.request(
        `${operation}-snapshot`, 'GET', '/api/v2/admin/snapshot',
        { cookie: adminCookie! },
      )).body)
    }

    await applyAdmin('set-live', {
      protocolVersion: '2', resetEpoch: initialEpoch,
      idempotencyKey: idempotencyKey('set-live', 0),
      command: 'SET_MODE', expectedRunRevision: admin.runtime.runRevision,
      targetMode: 'LIVE', confirmed: true,
    })
    await applyAdmin('start', {
      protocolVersion: '2', resetEpoch: initialEpoch,
      idempotencyKey: idempotencyKey('start', 0),
      command: 'START', expectedRunRevision: admin.runtime.runRevision,
      confirmed: true,
    })

    await mapLimit(participants, PRIMARY_CONCURRENCY, async (participant) => {
      const started = performance.now()
      try {
        const beforeStarRevision = screenObserver!.starRevisions.get(
          participant.snapshot.participant.ownPublicStarId!,
        ) ?? 0
        const response = V2ParticipantCommandResponseSchema.parse((await client.request(
          'start-star', 'POST', '/api/v2/participant/commands',
          { cookie: participant.cookie, body: {
            protocolVersion: '2', resetEpoch: initialEpoch,
            idempotencyKey: idempotencyKey('start-star', participant.index),
            expectedParticipantRevision: participant.snapshot.participant.participantRevision,
            command: 'START_STAR',
          } },
        )).body)
        await Promise.all([
          waitForCondition('start-star-private', () =>
            participant.observer!.participantRevision >= response.participant.participantRevision),
          waitForCondition('start-star-public', () =>
            (screenObserver!.starRevisions.get(response.participant.ownPublicStarId!) ?? 0) >
              beforeStarRevision),
        ])
        participant.snapshot = V2ParticipantSnapshotSchema.parse((await client.request(
          'snapshot-after-start-star', 'GET', '/api/v2/participant/snapshot',
          { cookie: participant.cookie },
        )).body)
        recorders.starStart.success(performance.now() - started)
      } catch (error) {
        recorders.starStart.failure()
        recordFailure(failures, 'starStart', error)
        throw error
      }
    })

    await applyAdmin('pause', {
      protocolVersion: '2', resetEpoch: initialEpoch,
      idempotencyKey: idempotencyKey('pause', 0), command: 'PAUSE',
      expectedRunRevision: admin.runtime.runRevision,
      expectedPresentationRevision: admin.presentationRevision, confirmed: true,
    })
    const pausedParticipant = participants[0]!
    try {
      await client.request('paused-write-probe', 'POST', '/api/v2/participant/commands', {
        cookie: pausedParticipant.cookie,
        body: {
          protocolVersion: '2', resetEpoch: initialEpoch,
          idempotencyKey: idempotencyKey('paused-probe', 0),
          expectedParticipantRevision: pausedParticipant.snapshot.participant.participantRevision,
          command: 'START_STAR',
        },
      })
      throw new Error('Paused participant write unexpectedly succeeded')
    } catch (error) {
      assertCondition(
        error instanceof SanitizedV2ProtocolError && error.code === 'RUNTIME_PAUSED',
        'Paused participant write returned the wrong error',
      )
    }
    await applyAdmin('resume', {
      protocolVersion: '2', resetEpoch: initialEpoch,
      idempotencyKey: idempotencyKey('resume', 0), command: 'RESUME',
      expectedRunRevision: admin.runtime.runRevision, confirmed: true,
    })
    await applyAdmin('advance-program', {
      protocolVersion: '2', resetEpoch: initialEpoch,
      idempotencyKey: idempotencyKey('advance-program', 0), command: 'ADVANCE',
      expectedRunRevision: admin.runtime.runRevision,
      expectedPresentationRevision: admin.presentationRevision,
      confirmed: true, overrideReadinessWarnings: false,
    })

    const programId = admin.programs[0]?.id
    assertCondition(programId, 'No synthetic program is available')
    await applyAdmin('set-program', {
      protocolVersion: '2', resetEpoch: initialEpoch,
      idempotencyKey: idempotencyKey('set-program', 0), command: 'SET_PROGRAM',
      expectedRunRevision: admin.runtime.runRevision,
      expectedInteractionRevision: admin.interaction.interactionRevision,
      programId, confirmed: true,
    }, false)
    const programSnapshot = V2ParticipantSnapshotSchema.parse((await client.request(
      'program-participant-snapshot', 'GET', '/api/v2/participant/snapshot',
      { cookie: participants[0]!.cookie },
    )).body)
    const gifts = programSnapshot.currentProgram?.giftCatalog
    assertCondition(gifts?.length === 4, 'The v2 load requires the four fixed gift costs')

    for (const participant of participants) {
      participant.snapshot = V2ParticipantSnapshotSchema.parse((await client.request(
        'snapshot-before-gifts', 'GET', '/api/v2/participant/snapshot',
        { cookie: participant.cookie },
      )).body)
    }
    for (let giftIndex = 0; giftIndex < gifts.length; giftIndex += 1) {
      const gift = gifts[giftIndex]!
      for (let offset = 0; offset < participants.length; offset += PRIMARY_CONCURRENCY) {
        const wave = participants.slice(offset, offset + PRIMARY_CONCURRENCY)
        const beforeCount = screenObserver.count('gift.sent')
        const waveStarted = performance.now()
        await Promise.all(wave.map(async (participant) => {
          try {
            const response = V2ParticipantCommandResponseSchema.parse((await client.request(
              'send-gift', 'POST', '/api/v2/participant/commands',
              { cookie: participant.cookie, body: {
                protocolVersion: '2', resetEpoch: initialEpoch,
                idempotencyKey: idempotencyKey('gift', participant.index, `-${giftIndex}`),
                expectedParticipantRevision: participant.snapshot.participant.participantRevision,
                command: 'SEND_GIFT', programId, giftId: gift.id,
              } },
            )).body)
            participant.snapshot = { ...participant.snapshot, participant: response.participant }
            await waitForCondition('gift-private', () =>
              participant.observer!.participantRevision >= response.participant.participantRevision)
          } catch (error) {
            recorders.gift.failure()
            recordFailure(failures, 'gift', error)
            throw error
          }
        }))
        await waitForCondition('gift-public-wave', () =>
          screenObserver!.count('gift.sent') >= beforeCount + wave.length)
        const duration = performance.now() - waveStarted
        for (let index = 0; index < wave.length; index += 1) {
          recorders.gift.success(duration)
        }
      }
    }

    const replayParticipant = participants[0]!
    const replayGiftBody = {
      protocolVersion: '2', resetEpoch: initialEpoch,
      idempotencyKey: idempotencyKey('gift', 0, '-0'),
      expectedParticipantRevision: replayParticipant.snapshot.participant.participantRevision - 4,
      command: 'SEND_GIFT', programId, giftId: gifts[0]!.id,
    }
    const beforeReplayGiftCount = screenObserver.count('gift.sent')
    const beforeReplaySnapshot = V2ParticipantSnapshotSchema.parse((await client.request(
      'snapshot-before-replay', 'GET', '/api/v2/participant/snapshot',
      { cookie: replayParticipant.cookie },
    )).body)
    const replay = V2ParticipantCommandResponseSchema.parse((await client.request(
      'gift-replay', 'POST', '/api/v2/participant/commands',
      { cookie: replayParticipant.cookie, body: replayGiftBody },
    )).body)
    const afterReplaySnapshot = V2ParticipantSnapshotSchema.parse((await client.request(
      'snapshot-after-replay', 'GET', '/api/v2/participant/snapshot',
      { cookie: replayParticipant.cookie },
    )).body)
    replayInvariantPreserved = replay.replayed &&
      beforeReplaySnapshot.participant.powerBalance === afterReplaySnapshot.participant.powerBalance &&
      beforeReplaySnapshot.participant.starlight === afterReplaySnapshot.participant.starlight &&
      screenObserver.count('gift.sent') === beforeReplayGiftCount
    try {
      await client.request('gift-idempotency-conflict', 'POST', '/api/v2/participant/commands', {
        cookie: replayParticipant.cookie,
        body: { ...replayGiftBody, giftId: gifts[1]!.id },
      })
      throw new Error('Idempotency conflict unexpectedly succeeded')
    } catch (error) {
      assertCondition(
        error instanceof SanitizedV2ProtocolError && error.code === 'IDEMPOTENCY_CONFLICT',
        'Idempotency conflict returned the wrong error',
      )
    }

    for (const participant of participants) {
      participant.snapshot = V2ParticipantSnapshotSchema.parse((await client.request(
        'snapshot-before-barrage', 'GET', '/api/v2/participant/snapshot',
        { cookie: participant.cookie },
      )).body)
    }
    const barrageWaves = Array.from({ length: Math.ceil(PARTICIPANT_COUNT / 10) })
    for (let wave = 0; wave < barrageWaves.length; wave += 1) {
      const waveParticipants = participants.slice(wave * 10, wave * 10 + 10)
      const waveStarted = performance.now()
      await Promise.all(waveParticipants.map(async (participant) => {
        const text = `v2-load-barrage-${String(participant.index).padStart(3, '0')}`
        try {
          const response = V2ParticipantCommandResponseSchema.parse((await client.request(
            'post-barrage', 'POST', '/api/v2/participant/commands',
            { cookie: participant.cookie, body: {
              protocolVersion: '2', resetEpoch: initialEpoch,
              idempotencyKey: idempotencyKey('barrage', participant.index),
              expectedParticipantRevision: participant.snapshot.participant.participantRevision,
              command: 'POST_BARRAGE', text,
            } },
          )).body)
          participant.snapshot = { ...participant.snapshot, participant: response.participant }
          await Promise.all([
            waitForCondition('barrage-private', () =>
              participant.observer!.participantRevision >= response.participant.participantRevision),
            waitForCondition('barrage-public', () => screenObserver!.barrageTexts.has(text)),
          ])
        } catch (error) {
          recorders.barrage.failure()
          recordFailure(failures, 'barrage', error)
          throw error
        }
      }))
      const duration = performance.now() - waveStarted
      for (let index = 0; index < waveParticipants.length; index += 1) {
        recorders.barrage.success(duration)
      }
      if (wave < barrageWaves.length - 1) await sleep(1_020)
    }

    await applyAdmin('advance-cooperative', {
      protocolVersion: '2', resetEpoch: initialEpoch,
      idempotencyKey: idempotencyKey('advance-cooperative', 0), command: 'ADVANCE',
      expectedRunRevision: admin.runtime.runRevision,
      expectedPresentationRevision: admin.presentationRevision,
      confirmed: true, overrideReadinessWarnings: false,
    })
    for (const participant of participants) {
      participant.snapshot = V2ParticipantSnapshotSchema.parse((await client.request(
        'snapshot-before-light', 'GET', '/api/v2/participant/snapshot',
        { cookie: participant.cookie },
      )).body)
    }
    await mapLimit(participants, PRIMARY_CONCURRENCY, async (participant) => {
      const started = performance.now()
      try {
        const response = V2ParticipantCommandResponseSchema.parse((await client.request(
          'cooperative-light', 'POST', '/api/v2/participant/commands',
          { cookie: participant.cookie, body: {
            protocolVersion: '2', resetEpoch: initialEpoch,
            idempotencyKey: idempotencyKey('light', participant.index),
            expectedParticipantRevision: participant.snapshot.participant.participantRevision,
            command: 'COOPERATIVE_LIGHT',
          } },
        )).body)
        await waitForCondition('light-private', () =>
          participant.observer!.participantRevision >= response.participant.participantRevision)
        participant.snapshot = { ...participant.snapshot, participant: response.participant }
        recorders.cooperativeLight.success(performance.now() - started)
      } catch (error) {
        recorders.cooperativeLight.failure()
        recordFailure(failures, 'cooperativeLight', error)
        throw error
      }
    })
    screen = V2ScreenSnapshotSchema.parse((await client.request(
      'screen-before-complete', 'GET', '/api/v2/screen/snapshot',
    )).body)
    await waitForCondition('light-public-aggregate', () =>
      screenObserver!.aggregateRevision >= screen.aggregateRevision)

    await applyAdmin('complete', {
      protocolVersion: '2', resetEpoch: initialEpoch,
      idempotencyKey: idempotencyKey('complete', 0), command: 'COMPLETE',
      expectedRunRevision: admin.runtime.runRevision,
      expectedPresentationRevision: admin.presentationRevision,
      confirmed: true, overrideReadinessWarnings: false,
    })
    preResetInvariants = readDatabaseInvariants(stack, initialEpoch)
    assertCondition(preResetInvariants.passed, 'V2 database invariants failed')
    assertCondition(replayInvariantPreserved, 'V2 idempotency replay changed persisted state')

    screenRawFrames = screenObserver.rawFrames
    participantRawFrames = participants.reduce(
      (sum, participant) => sum + (participant.observer?.rawFrames ?? 0),
      0,
    )
    protocolErrors += screenObserver.protocolErrors + participants.reduce(
      (sum, participant) => sum + (participant.observer?.protocolErrors ?? 0),
      0,
    )
    duplicateFrames += screenObserver.duplicateFrames + participants.reduce(
      (sum, participant) => sum + (participant.observer?.duplicateFrames ?? 0),
      0,
    )
    firstProtocolIssue = screenObserver.firstProtocolIssue ??
      participants.find((participant) => participant.observer?.firstProtocolIssue)
        ?.observer?.firstProtocolIssue ?? null
    privacyErrors += screenObserver.privacyErrors

    const oldSockets = [...sockets]
    await stack.restartBackend()
    await waitForCondition(
      'restart-websocket-close',
      () => oldSockets.filter((socket) => socket.readyState === 3).length === oldSockets.length,
      RESTART_TIMEOUT_MS,
    )
    restartDisconnects = oldSockets.filter((socket) => socket.readyState === 3).length
    sockets.length = 0
    screen = V2ScreenSnapshotSchema.parse((await client.request(
      'screen-after-restart', 'GET', '/api/v2/screen/snapshot',
    )).body)
    screenObserver = new V2ScreenObserver(screen)
    sockets.push(await connectV2WebSocket({
      baseUrl: stack.backendOrigin,
      requestOrigin: stack.requestOrigin,
      clientSurface: 'SCREEN',
      resetEpoch: initialEpoch,
      streams: [{ streamId: 'public', streamSeq: screen.publicSeq }],
      onEvent: (event) => screenObserver!.accept(event),
      onProtocolError: () => { protocolErrors += 1 },
      onControlError: (code) => {
        if (code === 'STALE_RESET_EPOCH') expectedEpochInvalidations += 1
        else protocolErrors += 1
      },
    }))
    await mapLimit(participants, SOCKET_CONCURRENCY, async (participant) => {
      participant.snapshot = V2ParticipantSnapshotSchema.parse((await client.request(
        'participant-after-restart', 'GET', '/api/v2/participant/snapshot',
        { cookie: participant.cookie },
      )).body)
      participant.observer = new V2ParticipantObserver(
        participant.snapshot.participantStreamId,
        participant.snapshot,
      )
      sockets.push(await connectV2WebSocket({
        baseUrl: stack!.backendOrigin,
        requestOrigin: stack!.requestOrigin,
        cookie: participant.cookie,
        clientSurface: 'WELCOME',
        resetEpoch: initialEpoch,
        streams: [
          { streamId: 'public', streamSeq: participant.snapshot.publicSeq },
          { streamId: participant.snapshot.participantStreamId, streamSeq: participant.snapshot.participantSeq },
        ],
        onEvent: (event) => participant.observer!.accept(event),
        onProtocolError: () => { protocolErrors += 1 },
        onControlError: (code) => {
          if (code === 'STALE_RESET_EPOCH') expectedEpochInvalidations += 1
          else protocolErrors += 1
        },
      }))
    })
    recoveredOpened = sockets.length
    assertCondition(recoveredOpened === 301, 'V2 sockets did not recover after restart')
    assertCondition(screen.aggregate.cooperativeLightCount === PARTICIPANT_COUNT, 'Screen state did not persist through restart')

    const oldCookie = participants[0]!.cookie
    const rawFrames: unknown[] = []
    const rawSocket = await connectRawV2WebSocket({
      baseUrl: stack.backendOrigin,
      requestOrigin: stack.requestOrigin,
      onFrame: (frame) => rawFrames.push(frame),
    })
    rawSocket.send(JSON.stringify({
      type: 'HELLO', protocolVersion: '2', clientSurface: 'SCREEN', clientBuild: 'v2-09-old-epoch',
    }))
    await waitForCondition('old-epoch-hello', () => rawFrames.some((frame) =>
      Boolean(frame && typeof frame === 'object' && (frame as { type?: unknown }).type === 'HELLO_ACK')))
    rawSocket.send(JSON.stringify({
      type: 'SUBSCRIBE', protocolVersion: '2', resetEpoch: initialEpoch,
      streams: [{ streamId: 'public', streamSeq: screen.publicSeq }],
    }))
    await waitForCondition('old-epoch-subscribed', () => rawFrames.some((frame) =>
      Boolean(frame && typeof frame === 'object' && (frame as { type?: unknown }).type === 'SUBSCRIBED')))

    const resetStarted = performance.now()
    const resetResponse = V2AdminCommandResponseSchema.parse((await client.request(
      'reset-demo', 'POST', '/api/v2/admin/commands',
      { cookie: adminCookie, timeoutMs: RESTART_TIMEOUT_MS, body: {
        protocolVersion: '2', resetEpoch: initialEpoch,
        idempotencyKey: idempotencyKey('reset', 0), command: 'RESET_DEMO',
        confirmation: 'RESET DEMO', syntheticDataConfirmed: true,
      } },
    )).body)
    resetDurationMs = Math.round((performance.now() - resetStarted) * 100) / 100
    adminCookie = (await client.request(
      'admin-login-after-reset', 'POST', '/api/v2/admin/login',
      { body: stack.credentials.admin },
    )).cookie
    assertCondition(resetResponse.resetEpoch === initialEpoch + 1, 'Reset did not advance epoch')
    try {
      await client.request('stale-participant-session', 'GET', '/api/v2/participant/snapshot', { cookie: oldCookie })
    } catch (error) {
      staleParticipantSessionRejected =
        error instanceof SanitizedV2ProtocolError && error.code === 'AUTH_REQUIRED'
    }
    await waitForCondition('old-epoch-error-frame', () => rawFrames.some((frame) => {
      if (!frame || typeof frame !== 'object') return false
      const type = (frame as { type?: unknown }).type
      if (type !== 'ERROR') return false
      const code = (frame as { error?: { code?: unknown } }).error?.code
      return code === 'STALE_RESET_EPOCH'
    }))
    oldEpochRejected = true
    await waitForCondition(
      'reset-epoch-invalidation-fanout',
      () => expectedEpochInvalidations === PARTICIPANT_COUNT + 1,
    )
    rawSocket.close(1000, 'old epoch verified')
    const reactivation = V2ActivateParticipantResponseSchema.parse((await client.request(
      'fixed-credential-reactivation', 'POST', '/api/v2/participant/activate',
      { body: {
        protocolVersion: '2', resetEpoch: initialEpoch + 1,
        idempotencyKey: idempotencyKey('reactivate', 0),
        method: 'INVITATION_TOKEN', token: stack.credentials.participants[0]!.inviteToken,
      } },
    )).body)
    fixedCredentialReactivation = reactivation.activationCreated &&
      reactivation.snapshot.participant.onboardingState === 'NEEDS_COLOR'
    postResetOldEpochRows = readPostResetOldEpochRows(stack, initialEpoch)
    assertCondition(postResetOldEpochRows === 0, 'Reset left old epoch rows')
    assertCondition(staleParticipantSessionRejected, 'Reset did not revoke participant sessions')
    assertCondition(oldEpochRejected, 'Realtime did not reject the old epoch')
    assertCondition(fixedCredentialReactivation, 'Fixed synthetic credential did not reactivate')
    assertCondition(protocolErrors === 0, 'Realtime protocol errors were observed')
    assertCondition(privacyErrors === 0, 'Private fields were observed in public realtime events')
    status = 'passed'
  } catch (error) {
    topLevelFailure = failureCode(error)
    recordFailure(failures, 'runner', error)
  } finally {
    closeV2WebSockets(sockets)
    if (stack) {
      const temporaryRoot = path.dirname(stack.manifestPath)
      try {
        await stack.stop()
        temporaryDirectoryRemoved = !fs.existsSync(temporaryRoot)
      } catch (error) {
        status = 'failed'
        recordFailure(failures, 'cleanup', error)
        topLevelFailure ??= failureCode(error)
      }
    }
    const operations = Object.fromEntries(
      Object.entries(recorders).map(([name, recorder]) => [name, recorder.summary()]),
    ) as Record<string, OperationSummary>
    if (Object.values(operations).some((operation) => !operation.thresholdPassed)) {
      status = 'failed'
      topLevelFailure ??= 'LATENCY_THRESHOLD_FAILED'
    }
    const finishedAt = new Date()
    const packageJson = JSON.parse(fs.readFileSync(
      fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8',
    )) as { version?: string; packageManager?: string }
    const report = {
      schemaVersion: REPORT_SCHEMA_VERSION,
      status,
      applicationVersion: packageJson.version ?? 'unknown',
      protocolVersion: '2',
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.round((performance.now() - wallStarted) * 100) / 100,
      environment: {
        platform: process.platform,
        release: os.release(),
        architecture: process.arch,
        node: process.version,
        packageManager: packageJson.packageManager ?? 'unknown',
        cpuCount: os.cpus().length,
        transport: 'real-loopback-http-websocket',
        participantCount: PARTICIPANT_COUNT,
        primaryConcurrency: PRIMARY_CONCURRENCY,
      },
      latencySemantics:
        'client command start to committed HTTP response plus the corresponding private or public authoritative v2 observation; gift samples conservatively use each 300-command public batch completion',
      thresholdMs: LOAD_THRESHOLD_MS,
      operations,
      websocket: {
        targetConcurrentConnections: 301,
        targetLogicalStreams: 601,
        initialOpened,
        disconnectsDuringRestart: restartDisconnects,
        recoveredOpened,
        screenRawFrames,
        participantRawFrames,
        protocolErrors,
        expectedEpochInvalidations,
        duplicateFramesIgnored: duplicateFrames,
        firstProtocolIssue,
        privacyErrors,
      },
      idempotency: {
        replayedSamples: 1,
        conflictSamples: 1,
        persistedStateUnchanged: replayInvariantPreserved,
      },
      recovery: {
        persistedDatabaseRestarted: restartDisconnects === 301,
        socketsRecovered: recoveredOpened === 301,
        resetDurationMs,
        resetTimeoutMs: RESTART_TIMEOUT_MS,
        staleParticipantSessionRejected,
        oldEpochRejected,
        fixedCredentialReactivation,
      },
      cleanup: { temporaryDirectoryRemoved },
      invariants: preResetInvariants,
      postReset: { oldEpochRows: postResetOldEpochRows },
      failures,
      topLevelFailure,
      privacy: {
        containsCredentials: false,
        containsDisplayNames: false,
        containsCapsuleBodies: false,
        containsBarrageBodies: false,
        publicEventPrivateFieldViolations: privacyErrors,
        auditPassed: false,
      },
    }
    report.privacy.auditPassed = reportPrivacyAudit(report, stack)
    if (!report.privacy.auditPassed) {
      status = 'failed'
      report.status = 'failed'
      report.topLevelFailure = 'REPORT_PRIVACY_VIOLATION'
      recordFailure(failures, 'report-privacy', new SanitizedV2ProtocolError({
        operation: 'report-privacy', code: 'REPORT_PRIVACY_VIOLATION',
      }))
    }
    fs.mkdirSync(REPORT_ROOT, { recursive: true })
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8', mode: 0o600,
    })
    process.stdout.write(`${JSON.stringify({
      status,
      report: path.relative(process.cwd(), REPORT_PATH).replaceAll('\\', '/'),
      durationMs: report.durationMs,
      operations,
      websocket: report.websocket,
      invariantPassed: preResetInvariants?.passed ?? false,
      recovery: report.recovery,
      cleanup: report.cleanup,
      topLevelFailure: report.topLevelFailure,
    }, null, 2)}\n`)
    if (status !== 'passed') process.exitCode = 1
  }
}

await run()
