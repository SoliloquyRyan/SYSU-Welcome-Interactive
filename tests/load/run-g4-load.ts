import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import { openDatabase } from '../../backend/src/db/open-database.js'
import {
  LOAD_THRESHOLD_MS,
  OperationRecorder,
  assertCondition,
  mapLimit,
  type OperationSummary,
} from './metrics.js'
import {
  SanitizedProtocolError,
  closeWebSockets,
  createLoadFixture,
  type HttpRequestOptions,
  type LoadFixture,
  type RealtimeEnvelope,
  type WebSocketLike,
} from './protocol-fixture.js'

const PARTICIPANT_COUNT = 300
const PRIMARY_CONCURRENCY = 24
const CONNECTION_CONCURRENCY = 50
const RECOVERY_CONCURRENCY = 50
const STAGE_SAMPLE_COUNT = 20
const AUTHORITY_TIMEOUT_MS = 30_000
const REPORT_SCHEMA_VERSION = 1
const REPORT_ROOT = fileURLToPath(new URL('../reports/', import.meta.url))
const REPORT_PATH = path.join(REPORT_ROOT, 'g4-load.json')

interface RuntimeSnapshot {
  resetEpoch: number
  stageRevision: number
  mode: 'REHEARSAL' | 'LIVE'
  status: 'READY' | 'RUNNING' | 'PAUSED' | 'COMPLETED'
  stage: number
  barragePaused: boolean
  currentProgramId: string | null
}

interface ParticipantSnapshot {
  status: 'ok'
  eventSeq: number
  runtime: RuntimeSnapshot
  participant: {
    id: string
    powerBalance: number
    starlight: number
    capsuleMessage: string | null
    capsuleMessageSubmitted: boolean
    capsulePublicNoticeAccepted: boolean
    capsuleCandidateStatus:
      | 'NOT_SUBMITTED'
      | 'LEGACY_PRIVATE'
      | 'SUBMITTED'
      | 'SELECTED'
      | 'DISPLAYED'
      | 'REMOVED'
    starStarted: boolean
    firstGiftCompleted: boolean
    firstBarrageCompleted: boolean
    cooperativeLightCompleted: boolean
    giftCount: number
    publishedBarrageCount: number
  }
  giftHistory: unknown[]
}

interface ScreenSnapshot {
  eventSeq: number
  runtime: RuntimeSnapshot
  aggregates: {
    activatedCount: number
    starCreatedCount: number
    starStartedCount: number
    totalStarlight: number
    interactionCount: number
    cooperativeLightCount: number
    eligibleParticipantCount: number
  }
  programs: Array<{ id: string; heat: number }>
  publishedBarrages: unknown[]
}

interface AdminSnapshot {
  eventSeq: number
  runtime: RuntimeSnapshot
  session: { roles: string[] }
}

interface ParticipantContext {
  index: number
  cookie: string
  identityId: string
  observer: ParticipantAuthorityObserver | null
}

interface ReplaySample {
  operation: string
  method: 'POST' | 'PUT'
  requestPath: string
  cookie: string
  idempotencyKey: string
  body: unknown
}

interface SnapshotCounters {
  screenSetup: number
  screenAuthority: number
  participantPrivate: number
  participantRuntimeFanout: number
  recoveryParticipant: number
  recoveryScreen: number
  recoveryAdmin: number
}

interface FailureCounts {
  [operation: string]: Record<string, number>
}

interface Waiter {
  target: number
  resolve(completedAt: number): void
  reject(error: Error): void
  timer: NodeJS.Timeout
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  assertCondition(value !== null && typeof value === 'object', message)
  return value as Record<string, unknown>
}

function asRuntime(value: unknown): RuntimeSnapshot {
  const runtime = asObject(value, 'Runtime snapshot is invalid')
  assertCondition(
    typeof runtime.resetEpoch === 'number' &&
      typeof runtime.stageRevision === 'number' &&
      typeof runtime.stage === 'number' &&
      typeof runtime.mode === 'string' &&
      typeof runtime.status === 'string' &&
      typeof runtime.barragePaused === 'boolean' &&
      (runtime.currentProgramId === null ||
        typeof runtime.currentProgramId === 'string'),
    'Runtime snapshot is invalid',
  )
  return runtime as unknown as RuntimeSnapshot
}

function asParticipantSnapshot(value: unknown): ParticipantSnapshot {
  const snapshot = asObject(value, 'Participant snapshot is invalid')
  const participant = asObject(
    snapshot.participant,
    'Participant snapshot is invalid',
  )
  assertCondition(
    snapshot.status === 'ok' &&
      typeof snapshot.eventSeq === 'number' &&
      typeof participant.id === 'string' &&
      typeof participant.powerBalance === 'number' &&
      typeof participant.starlight === 'number' &&
      typeof participant.capsuleMessageSubmitted === 'boolean' &&
      typeof participant.capsulePublicNoticeAccepted === 'boolean' &&
      typeof participant.capsuleCandidateStatus === 'string' &&
      typeof participant.starStarted === 'boolean' &&
      typeof participant.firstGiftCompleted === 'boolean' &&
      typeof participant.firstBarrageCompleted === 'boolean' &&
      typeof participant.cooperativeLightCompleted === 'boolean' &&
      typeof participant.giftCount === 'number' &&
      typeof participant.publishedBarrageCount === 'number' &&
      Array.isArray(snapshot.giftHistory),
    'Participant snapshot is invalid',
  )
  asRuntime(snapshot.runtime)
  return snapshot as unknown as ParticipantSnapshot
}

function asScreenSnapshot(value: unknown): ScreenSnapshot {
  const snapshot = asObject(value, 'Screen snapshot is invalid')
  const aggregates = asObject(
    snapshot.aggregates,
    'Screen snapshot is invalid',
  )
  assertCondition(
    typeof snapshot.eventSeq === 'number' &&
      typeof aggregates.activatedCount === 'number' &&
      typeof aggregates.starCreatedCount === 'number' &&
      typeof aggregates.starStartedCount === 'number' &&
      typeof aggregates.totalStarlight === 'number' &&
      typeof aggregates.interactionCount === 'number' &&
      typeof aggregates.cooperativeLightCount === 'number' &&
      typeof aggregates.eligibleParticipantCount === 'number' &&
      Array.isArray(snapshot.programs) &&
      Array.isArray(snapshot.publishedBarrages),
    'Screen snapshot is invalid',
  )
  asRuntime(snapshot.runtime)
  return snapshot as unknown as ScreenSnapshot
}

function asAdminSnapshot(value: unknown): AdminSnapshot {
  const snapshot = asObject(value, 'Admin snapshot is invalid')
  const session = asObject(snapshot.session, 'Admin snapshot is invalid')
  assertCondition(
    typeof snapshot.eventSeq === 'number' && Array.isArray(session.roles),
    'Admin snapshot is invalid',
  )
  asRuntime(snapshot.runtime)
  return snapshot as unknown as AdminSnapshot
}

function version(snapshot: {
  runtime: RuntimeSnapshot
}): { resetEpoch: number; stageRevision: number } {
  return {
    resetEpoch: snapshot.runtime.resetEpoch,
    stageRevision: snapshot.runtime.stageRevision,
  }
}

function idempotencyKey(operation: string, index: number, suffix = ''): string {
  return `g4-${operation}-${String(index + 1).padStart(4, '0')}${suffix}`
}

function failureCode(error: unknown): string {
  return error instanceof SanitizedProtocolError
    ? error.code
    : 'HARNESS_ASSERTION'
}

function recordFailure(
  failures: FailureCounts,
  operation: string,
  error: unknown,
): void {
  const code = failureCode(error)
  const bucket = (failures[operation] ??= {})
  bucket[code] = (bucket[code] ?? 0) + 1
}

function waitForCondition<T>(
  operation: string,
  timeoutMs: number,
  register: (
    resolve: (value: T) => void,
    reject: (error: Error) => void,
  ) => () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let unregister = () => {}
    const timeout = setTimeout(() => {
      unregister()
      reject(
        new SanitizedProtocolError({ operation, code: 'AUTHORITY_TIMEOUT' }),
      )
    }, timeoutMs)
    timeout.unref()
    unregister = register(
      (value) => {
        clearTimeout(timeout)
        unregister()
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        unregister()
        reject(error)
      },
    )
  })
}

class ScreenAuthorityObserver {
  readonly #fixture: LoadFixture
  readonly #counters: SnapshotCounters
  readonly #epoch: number
  readonly #waiters = new Set<Waiter>()
  readonly #resetWaiters = new Map<
    number,
    Set<(completedAt: number) => void>
  >()
  #observedSeq: number
  #observedAt: number
  #pendingSeq: number
  #refreshing = false
  #fatalError: Error | null = null
  rawFrames = 0
  protocolErrors = 0

  constructor(input: {
    fixture: LoadFixture
    counters: SnapshotCounters
    epoch: number
    initialEventSeq: number
  }) {
    this.#fixture = input.fixture
    this.#counters = input.counters
    this.#epoch = input.epoch
    this.#observedSeq = input.initialEventSeq
    this.#pendingSeq = input.initialEventSeq
    this.#observedAt = performance.now()
  }

  note(envelope: RealtimeEnvelope): void {
    this.rawFrames += 1
    if (envelope.type === '__invalid__') {
      this.protocolErrors += 1
      return
    }
    if (envelope.type === 'demo.reset') {
      const listeners = this.#resetWaiters.get(envelope.resetEpoch)
      if (listeners) {
        const completedAt = performance.now()
        for (const listener of listeners) listener(completedAt)
        this.#resetWaiters.delete(envelope.resetEpoch)
      }
    }
    if (envelope.resetEpoch !== this.#epoch) return
    if (envelope.eventSeq <= this.#observedSeq) return
    this.#pendingSeq = Math.max(this.#pendingSeq, envelope.eventSeq)
    if (!this.#refreshing) void this.#refreshLoop()
  }

  waitForResetEpoch(resetEpoch: number): Promise<number> {
    return waitForCondition<number>(
      'screen-reset-event',
      AUTHORITY_TIMEOUT_MS,
      (resolve) => {
        const listeners = this.#resetWaiters.get(resetEpoch) ?? new Set()
        listeners.add(resolve)
        this.#resetWaiters.set(resetEpoch, listeners)
        return () => listeners.delete(resolve)
      },
    )
  }

  waitFor(eventSeq: number): Promise<number> {
    if (this.#fatalError) return Promise.reject(this.#fatalError)
    if (eventSeq <= this.#observedSeq) return Promise.resolve(this.#observedAt)
    return new Promise<number>((resolve, reject) => {
      const waiter: Waiter = {
        target: eventSeq,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.#waiters.delete(waiter)
          reject(
            new SanitizedProtocolError({
              operation: 'screen-authority',
              code: 'AUTHORITY_TIMEOUT',
            }),
          )
        }, AUTHORITY_TIMEOUT_MS),
      }
      waiter.timer.unref()
      this.#waiters.add(waiter)
    })
  }

  async #refreshLoop(): Promise<void> {
    this.#refreshing = true
    try {
      while (this.#pendingSeq > this.#observedSeq) {
        const target = this.#pendingSeq
        this.#counters.screenAuthority += 1
        const response = await this.#fixture.request(
          'screen-authority-snapshot',
          'GET',
          '/api/screen/snapshot',
        )
        const snapshot = asScreenSnapshot(response.body)
        assertCondition(
          snapshot.runtime.resetEpoch === this.#epoch &&
            snapshot.eventSeq >= target,
          'Screen authority snapshot did not reach the event cursor',
        )
        this.#observedSeq = snapshot.eventSeq
        this.#observedAt = performance.now()
        for (const waiter of [...this.#waiters]) {
          if (waiter.target > this.#observedSeq) continue
          clearTimeout(waiter.timer)
          this.#waiters.delete(waiter)
          waiter.resolve(this.#observedAt)
        }
      }
    } catch (error) {
      this.#fatalError =
        error instanceof Error
          ? error
          : new Error('Screen authority refresh failed')
      for (const waiter of this.#waiters) {
        clearTimeout(waiter.timer)
        waiter.reject(this.#fatalError)
      }
      this.#waiters.clear()
    } finally {
      this.#refreshing = false
      if (!this.#fatalError && this.#pendingSeq > this.#observedSeq) {
        void this.#refreshLoop()
      }
    }
  }
}

interface FanoutState {
  settled: number
  succeeded: number
  failed: number
  completedAt: number
  waiters: Array<{
    resolve(value: FanoutResult): void
    reject(error: Error): void
    timer: NodeJS.Timeout
  }>
}

interface FanoutResult {
  expected: number
  succeeded: number
  failed: number
  completedAt: number
}

class RuntimeFanoutCoordinator {
  readonly #expected: number
  readonly #states = new Map<number, FanoutState>()

  constructor(expected: number) {
    this.#expected = expected
  }

  record(eventSeq: number, refresh: Promise<number>): void {
    const state = this.#state(eventSeq)
    void refresh.then(
      (completedAt) => {
        state.succeeded += 1
        state.settled += 1
        state.completedAt = Math.max(state.completedAt, completedAt)
        this.#finish(eventSeq, state)
      },
      () => {
        state.failed += 1
        state.settled += 1
        state.completedAt = Math.max(state.completedAt, performance.now())
        this.#finish(eventSeq, state)
      },
    )
  }

  waitFor(eventSeq: number): Promise<FanoutResult> {
    const state = this.#state(eventSeq)
    if (state.settled === this.#expected) {
      return state.failed === 0
        ? Promise.resolve(this.#result(state))
        : Promise.reject(
            new SanitizedProtocolError({
              operation: 'participant-runtime-fanout',
              code: 'SNAPSHOT_REFRESH_FAILED',
            }),
          )
    }
    return new Promise<FanoutResult>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = state.waiters.indexOf(waiter)
          if (index >= 0) state.waiters.splice(index, 1)
          reject(
            new SanitizedProtocolError({
              operation: 'participant-runtime-fanout',
              code: 'AUTHORITY_TIMEOUT',
            }),
          )
        }, AUTHORITY_TIMEOUT_MS),
      }
      waiter.timer.unref()
      state.waiters.push(waiter)
    })
  }

  #state(eventSeq: number): FanoutState {
    let state = this.#states.get(eventSeq)
    if (!state) {
      state = {
        settled: 0,
        succeeded: 0,
        failed: 0,
        completedAt: 0,
        waiters: [],
      }
      this.#states.set(eventSeq, state)
    }
    return state
  }

  #result(state: FanoutState): FanoutResult {
    return {
      expected: this.#expected,
      succeeded: state.succeeded,
      failed: state.failed,
      completedAt: state.completedAt,
    }
  }

  #finish(eventSeq: number, state: FanoutState): void {
    if (state.settled !== this.#expected) return
    const result = this.#result(state)
    for (const waiter of state.waiters) {
      clearTimeout(waiter.timer)
      if (state.failed === 0) waiter.resolve(result)
      else {
        waiter.reject(
          new SanitizedProtocolError({
            operation: 'participant-runtime-fanout',
            code: 'SNAPSHOT_REFRESH_FAILED',
          }),
        )
      }
    }
    state.waiters.length = 0
    if (eventSeq < 0) this.#states.delete(eventSeq)
  }
}

class ParticipantAuthorityObserver {
  readonly #fixture: LoadFixture
  readonly #cookie: string
  readonly #counters: SnapshotCounters
  readonly #fanout: RuntimeFanoutCoordinator
  readonly #onRefreshFailure: (kind: 'private' | 'runtime', error: unknown) => void
  readonly #completions = new Map<number, Promise<number>>()
  rawFrames = 0
  protocolErrors = 0

  constructor(input: {
    fixture: LoadFixture
    cookie: string
    counters: SnapshotCounters
    fanout: RuntimeFanoutCoordinator
    onRefreshFailure(kind: 'private' | 'runtime', error: unknown): void
  }) {
    this.#fixture = input.fixture
    this.#cookie = input.cookie
    this.#counters = input.counters
    this.#fanout = input.fanout
    this.#onRefreshFailure = input.onRefreshFailure
  }

  note(envelope: RealtimeEnvelope): void {
    this.rawFrames += 1
    if (envelope.type === '__invalid__') {
      this.protocolErrors += 1
      return
    }
    if (envelope.type === 'participant.snapshot.changed') {
      const refresh = this.#refresh(envelope.eventSeq, 'private')
      this.#completions.set(envelope.eventSeq, refresh)
      return
    }
    if (
      envelope.type === 'runtime.stage.changed' ||
      envelope.type === 'runtime.status.changed' ||
      envelope.type === 'program.changed'
    ) {
      // The production participant client applies the committed runtime/program
      // payload directly. A snapshot is only needed for reconnect recovery.
      this.#fanout.record(
        envelope.eventSeq,
        Promise.resolve(performance.now()),
      )
    }
  }

  waitForPrivate(eventSeq: number): Promise<number> {
    const existing = this.#completions.get(eventSeq)
    if (existing) return existing
    return waitForCondition<number>(
      'participant-private-authority',
      AUTHORITY_TIMEOUT_MS,
      (resolve, reject) => {
        const interval = setInterval(() => {
          const completion = this.#completions.get(eventSeq)
          if (!completion) return
          clearInterval(interval)
          void completion.then(resolve, () =>
            reject(
              new SanitizedProtocolError({
                operation: 'participant-private-authority',
                code: 'SNAPSHOT_REFRESH_FAILED',
              }),
            ),
          )
        }, 2)
        interval.unref()
        return () => clearInterval(interval)
      },
    )
  }

  async #refresh(eventSeq: number, kind: 'private' | 'runtime'): Promise<number> {
    if (kind === 'private') this.#counters.participantPrivate += 1
    else this.#counters.participantRuntimeFanout += 1
    try {
      const response = await this.#fixture.request(
        `participant-${kind}-snapshot`,
        'GET',
        '/api/participant/snapshot',
        { cookie: this.#cookie },
      )
      const snapshot = asParticipantSnapshot(response.body)
      assertCondition(
        snapshot.eventSeq >= eventSeq,
        'Participant authority snapshot did not reach the event cursor',
      )
      return performance.now()
    } catch (error) {
      this.#onRefreshFailure(kind, error)
      throw error
    }
  }
}

function verifyPortReleased(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close((error) => resolve(!error))
    })
  })
}

function snapshotRequestReport(counters: SnapshotCounters): {
  total: number
  bySurface: {
    screen: number
    participant: number
    admin: number
  }
  byReason: SnapshotCounters
} {
  const screen =
    counters.screenSetup + counters.screenAuthority + counters.recoveryScreen
  const participant =
    counters.participantPrivate +
    counters.participantRuntimeFanout +
    counters.recoveryParticipant
  const admin = counters.recoveryAdmin
  return {
    total: screen + participant + admin,
    bySurface: { screen, participant, admin },
    byReason: { ...counters },
  }
}

function closeSocketAndWait(socket: WebSocketLike): Promise<void> {
  if (socket.readyState === 3) return Promise.resolve()
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (socket.readyState !== 3) socket.terminate()
      resolve()
    }, 1_000)
    timeout.unref()
    socket.once('close', () => {
      clearTimeout(timeout)
      resolve()
    })
    if (socket.readyState === 0 || socket.readyState === 1) {
      socket.close(1000, 'load phase complete')
    }
  })
}

async function waitForSocketsClosed(
  sockets: readonly WebSocketLike[],
): Promise<number> {
  await Promise.all(
    sockets.map(async (socket) => {
      if (socket.readyState === 3) return
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new SanitizedProtocolError({
              operation: 'restart-websocket-close',
              code: 'AUTHORITY_TIMEOUT',
            }),
          )
        }, 5_000)
        timeout.unref()
        socket.once('close', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    }),
  )
  return sockets.filter((socket) => socket.readyState === 3).length
}

interface DatabaseDigest {
  participantStates: number
  ledgerEntries: number
  giftTransactions: number
  publishedBarrages: number
  cooperativeLights: number
  totalPower: number
  totalStarlight: number
  programHeat: number
}

function readDatabaseDigest(fixture: LoadFixture): DatabaseDigest {
  const database = openDatabase(fixture.config.databasePath)
  try {
    return database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM participant_states) AS participantStates,
           (SELECT COUNT(*) FROM value_ledger) AS ledgerEntries,
           (SELECT COUNT(*) FROM gift_transactions) AS giftTransactions,
           (SELECT COUNT(*) FROM barrages WHERE status = 'PUBLISHED') AS publishedBarrages,
           (SELECT COUNT(*) FROM cooperative_lights) AS cooperativeLights,
           COALESCE((SELECT SUM(power_balance) FROM participant_states), 0) AS totalPower,
           COALESCE((SELECT SUM(starlight) FROM participant_states), 0) AS totalStarlight,
           COALESCE((SELECT SUM(heat) FROM program_catalog), 0) AS programHeat`,
      )
      .get() as DatabaseDigest
  } finally {
    database.close()
  }
}

interface InvariantReport extends DatabaseDigest {
  wrongParticipantStateCount: number
  wrongRewardMultiplicity: number
  duplicateLedgerEntries: number
  duplicateGiftCommands: number
  duplicateBarrageCommands: number
  duplicateCooperativeLights: number
  duplicateIdempotencyRecords: number
  unmatchedGiftDeductions: number
  orphanGiftDeductions: number
  negativeBalances: number
  outOfRangeStarlight: number
  oldEpochRows: number
  expectedParticipantStates: number
  expectedLedgerEntries: number
  expectedGiftTransactions: number
  expectedPublishedBarrages: number
  expectedCooperativeLights: number
  expectedTotalPower: number
  expectedTotalStarlight: number
  expectedProgramHeat: number
  passed: boolean
}

function readInvariants(fixture: LoadFixture): InvariantReport {
  const database = openDatabase(fixture.config.databasePath)
  try {
    const digest = readDatabaseDigest(fixture)
    const scalar = (sql: string): number =>
      (
        database.prepare(sql).get() as {
          count: number
        }
      ).count
    const report: InvariantReport = {
      ...digest,
      wrongParticipantStateCount: scalar(
        `SELECT COUNT(*) AS count FROM participant_states
         WHERE power_balance <> 15 OR starlight <> 100
            OR capsule_message_submitted_at IS NULL
            OR capsule_public_notice_at IS NULL
            OR capsule_candidate_status <> 'SUBMITTED'
            OR star_started_at IS NULL
            OR first_gift_at IS NULL OR first_barrage_at IS NULL
            OR cooperative_light_at IS NULL`,
      ),
      wrongRewardMultiplicity: scalar(
        `SELECT COALESCE(SUM(count - 1), 0) AS count FROM (
           SELECT identity_id, reason, COUNT(*) AS count
           FROM value_ledger
           WHERE reason <> 'GIFT_SPEND'
           GROUP BY identity_id, reason HAVING COUNT(*) > 1
         )`,
      ),
      duplicateLedgerEntries: scalar(
        `SELECT COALESCE(SUM(count - 1), 0) AS count FROM (
           SELECT business_key, COUNT(*) AS count
           FROM value_ledger GROUP BY business_key HAVING COUNT(*) > 1
         )`,
      ),
      duplicateGiftCommands: scalar(
        `SELECT COALESCE(SUM(count - 1), 0) AS count FROM (
           SELECT identity_id, command_key_digest, COUNT(*) AS count
           FROM gift_transactions GROUP BY identity_id, command_key_digest
           HAVING COUNT(*) > 1
         )`,
      ),
      duplicateBarrageCommands: scalar(
        `SELECT COALESCE(SUM(count - 1), 0) AS count FROM (
           SELECT identity_id, command_key_digest, COUNT(*) AS count
           FROM barrages GROUP BY identity_id, command_key_digest
           HAVING COUNT(*) > 1
         )`,
      ),
      duplicateCooperativeLights: scalar(
        `SELECT COALESCE(SUM(count - 1), 0) AS count FROM (
           SELECT identity_id, COUNT(*) AS count
           FROM cooperative_lights GROUP BY identity_id HAVING COUNT(*) > 1
         )`,
      ),
      duplicateIdempotencyRecords: scalar(
        `SELECT COALESCE(SUM(count - 1), 0) AS count FROM (
           SELECT reset_epoch, scope, key_digest, COUNT(*) AS count
           FROM idempotency_records GROUP BY reset_epoch, scope, key_digest
           HAVING COUNT(*) > 1
         )`,
      ),
      unmatchedGiftDeductions: scalar(
        `SELECT COUNT(*) AS count FROM gift_transactions g
         LEFT JOIN value_ledger l
           ON l.identity_id = g.identity_id
          AND l.reason = 'GIFT_SPEND'
          AND l.business_key =
              'gift-spend:' || g.identity_id || ':' || g.command_key_digest
         WHERE l.id IS NULL OR l.power_delta <> -g.power_cost`,
      ),
      orphanGiftDeductions: scalar(
        `SELECT COUNT(*) AS count FROM value_ledger l
         LEFT JOIN gift_transactions g
           ON l.identity_id = g.identity_id
          AND l.business_key =
              'gift-spend:' || g.identity_id || ':' || g.command_key_digest
         WHERE l.reason = 'GIFT_SPEND' AND g.id IS NULL`,
      ),
      negativeBalances: scalar(
        `SELECT
           (SELECT COUNT(*) FROM participant_states WHERE power_balance < 0) +
           (SELECT COUNT(*) FROM value_ledger WHERE power_balance_after < 0)
           AS count`,
      ),
      outOfRangeStarlight: scalar(
        `SELECT
           (SELECT COUNT(*) FROM participant_states
             WHERE starlight < 0 OR starlight > 100) +
           (SELECT COUNT(*) FROM value_ledger
             WHERE starlight_after < 0 OR starlight_after > 100)
           AS count`,
      ),
      oldEpochRows: scalar(
        `SELECT COUNT(*) AS count FROM domain_events
         WHERE reset_epoch <> (SELECT reset_epoch FROM app_state WHERE id = 1)`,
      ),
      expectedParticipantStates: PARTICIPANT_COUNT,
      expectedLedgerEntries: PARTICIPANT_COUNT * 10,
      expectedGiftTransactions: PARTICIPANT_COUNT * 4,
      expectedPublishedBarrages: PARTICIPANT_COUNT,
      expectedCooperativeLights: PARTICIPANT_COUNT,
      expectedTotalPower: PARTICIPANT_COUNT * 15,
      expectedTotalStarlight: PARTICIPANT_COUNT * 100,
      expectedProgramHeat: PARTICIPANT_COUNT * 85,
      passed: false,
    }
    report.passed =
      report.participantStates === report.expectedParticipantStates &&
      report.ledgerEntries === report.expectedLedgerEntries &&
      report.giftTransactions === report.expectedGiftTransactions &&
      report.publishedBarrages === report.expectedPublishedBarrages &&
      report.cooperativeLights === report.expectedCooperativeLights &&
      report.totalPower === report.expectedTotalPower &&
      report.totalStarlight === report.expectedTotalStarlight &&
      report.programHeat === report.expectedProgramHeat &&
      report.wrongParticipantStateCount === 0 &&
      report.wrongRewardMultiplicity === 0 &&
      report.duplicateLedgerEntries === 0 &&
      report.duplicateGiftCommands === 0 &&
      report.duplicateBarrageCommands === 0 &&
      report.duplicateCooperativeLights === 0 &&
      report.duplicateIdempotencyRecords === 0 &&
      report.unmatchedGiftDeductions === 0 &&
      report.orphanGiftDeductions === 0 &&
      report.negativeBalances === 0 &&
      report.outOfRangeStarlight === 0 &&
      report.oldEpochRows === 0
    return report
  } finally {
    database.close()
  }
}

function countOldEpochRows(fixture: LoadFixture): number {
  const database = openDatabase(fixture.config.databasePath)
  try {
    return (
      database
        .prepare(
          `SELECT COUNT(*) AS count FROM domain_events
           WHERE reset_epoch <> (SELECT reset_epoch FROM app_state WHERE id = 1)`,
        )
        .get() as { count: number }
    ).count
  } finally {
    database.close()
  }
}

function assertPrimaryMetrics(
  operations: Record<string, OperationSummary>,
): void {
  for (const [name, summary] of Object.entries(operations)) {
    assertCondition(summary.failed === 0, `${name} had a primary failure`)
    assertCondition(summary.thresholdPassed, `${name} exceeded the latency gate`)
  }
}

function collectStringLeaves(value: unknown, output = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    output.add(value)
    return output
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStringLeaves(entry, output)
    return output
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectStringLeaves(entry, output)
    }
  }
  return output
}

function reportPrivacyAudit(report: unknown, fixture: LoadFixture | null): boolean {
  if (!fixture) return true
  const forbidden = new Set<string>([
    fixture.manifest.admin.username,
    fixture.manifest.admin.password,
  ])
  for (const participant of fixture.manifest.participants) {
    forbidden.add(participant.displayName)
    forbidden.add(participant.studentNumber)
    forbidden.add(participant.inviteToken)
    forbidden.add(
      `合成寄语 ${String(participant.seedIndex).padStart(3, '0')}`,
    )
    forbidden.add(
      `合成弹幕 ${String(participant.seedIndex).padStart(3, '0')}`,
    )
  }
  const strings = collectStringLeaves(report)
  return [...forbidden].every((value) => !strings.has(value))
}

async function run(): Promise<void> {
  const startedAt = new Date()
  const started = performance.now()
  const counters: SnapshotCounters = {
    screenSetup: 0,
    screenAuthority: 0,
    participantPrivate: 0,
    participantRuntimeFanout: 0,
    recoveryParticipant: 0,
    recoveryScreen: 0,
    recoveryAdmin: 0,
  }
  const failures: FailureCounts = {}
  const recorders = {
    activation: new OperationRecorder(),
    capsuleMessage: new OperationRecorder(),
    stage: new OperationRecorder(),
    star: new OperationRecorder(),
    gift: new OperationRecorder(),
    gift5: new OperationRecorder(),
    gift10: new OperationRecorder(),
    gift20: new OperationRecorder(),
    gift50: new OperationRecorder(),
    barrage: new OperationRecorder(),
    cooperativeLight: new OperationRecorder(),
  }
  const replaySamples: ReplaySample[] = []
  const primaryFanouts: FanoutResult[] = []
  const recoveryFanouts: FanoutResult[] = []
  let fixture: LoadFixture | null = null
  let sockets: WebSocketLike[] = []
  let participants: ParticipantContext[] = []
  let screenObserver: ScreenAuthorityObserver | null = null
  let screenSocket: WebSocketLike | null = null
  let adminCookie = ''
  let initialOpened = 0
  let recoveredOpened = 0
  let restartDisconnects = 0
  let fixedCredentialReactivation = false
  let staleParticipantSessionRejected = false
  let oldEpochResync = false
  let resetEventObserved = false
  let restartSnapshotsRecovered = 0
  let restartScreenRecovered = false
  let restartAdminRecovered = false
  let replayInvariantPreserved = false
  let preResetInvariants: InvariantReport | null = null
  let postResetOldEpochRows: number | null = null
  let topLevelFailure: string | null = null
  let status: 'passed' | 'failed' = 'failed'
  let temporaryDirectoryRemoved = false
  let portReleased = false
  let archivedScreenRawFrames = 0
  let archivedScreenProtocolErrors = 0
  let archivedParticipantRawFrames = 0
  let archivedParticipantProtocolErrors = 0

  try {
    fixture = await createLoadFixture()
    assertCondition(
      fixture.manifest.participants.length === PARTICIPANT_COUNT,
      'Fixed synthetic participant set is incomplete',
    )

    counters.screenSetup += 1
    const initialScreen = asScreenSnapshot(
      (
        await fixture.request(
          'initial-screen-snapshot',
          'GET',
          '/api/screen/snapshot',
        )
      ).body,
    )
    screenObserver = new ScreenAuthorityObserver({
      fixture,
      counters,
      epoch: initialScreen.runtime.resetEpoch,
      initialEventSeq: initialScreen.eventSeq,
    })
    screenSocket = await fixture.connectWebSocket({
      stream: 'screen',
      resetEpoch: initialScreen.runtime.resetEpoch,
      afterEventSeq: initialScreen.eventSeq,
      onEnvelope: (envelope) => screenObserver?.note(envelope),
      onClose: () => {
        restartDisconnects += 1
      },
    })
    sockets.push(screenSocket)
    initialOpened += 1

    const activationResults = await mapLimit(
      fixture.manifest.participants,
      PRIMARY_CONCURRENCY,
      async (credential, index): Promise<ParticipantContext | null> => {
        const operationStarted = performance.now()
        try {
          const key = idempotencyKey('activate', index)
          const response = await fixture?.request(
            'activation',
            'POST',
            '/api/participant/activate',
            {
              idempotencyKey: key,
              body: {
                method: 'INVITATION_TOKEN',
                token: credential.inviteToken,
              },
            },
          )
          assertCondition(response, 'Activation response is unavailable')
          assertCondition(response.cookie, 'Activation cookie is unavailable')
          const snapshot = asParticipantSnapshot(response.body)
          const observedAt = await screenObserver?.waitFor(snapshot.eventSeq)
          assertCondition(
            typeof observedAt === 'number',
            'Activation authority observation is unavailable',
          )
          recorders.activation.success(
            Math.max(performance.now(), observedAt) - operationStarted,
          )
          return {
            index,
            cookie: response.cookie,
            identityId: snapshot.participant.id,
            observer: null,
          }
        } catch (error) {
          recorders.activation.failure()
          recordFailure(failures, 'activation', error)
          return null
        }
      },
    )
    participants = activationResults.filter(
      (entry): entry is ParticipantContext => entry !== null,
    )
    assertCondition(
      participants.length === PARTICIPANT_COUNT,
      'Activation workload did not complete',
    )

    counters.screenSetup += 1
    const participantCursor = asScreenSnapshot(
      (
        await fixture.request(
          'participant-connection-cursor',
          'GET',
          '/api/screen/snapshot',
        )
      ).body,
    )
    let fanout = new RuntimeFanoutCoordinator(PARTICIPANT_COUNT)
    const participantSockets = await mapLimit(
      participants,
      CONNECTION_CONCURRENCY,
      async (participant) => {
        const observer = new ParticipantAuthorityObserver({
          fixture: fixture as LoadFixture,
          cookie: participant.cookie,
          counters,
          fanout,
          onRefreshFailure: (kind, error) =>
            recordFailure(failures, `participant-${kind}-snapshot`, error),
        })
        participant.observer = observer
        const socket = await (fixture as LoadFixture).connectWebSocket({
          stream: 'participant',
          resetEpoch: participantCursor.runtime.resetEpoch,
          afterEventSeq: participantCursor.eventSeq,
          cookie: participant.cookie,
          onEnvelope: (envelope) => observer.note(envelope),
          onClose: () => {
            restartDisconnects += 1
          },
        })
        initialOpened += 1
        return socket
      },
    )
    sockets.push(...participantSockets)
    assertCondition(initialOpened === 301, 'Initial websocket fanout is incomplete')

    const stageOneVersion = version(participantCursor)
    await mapLimit(participants, PRIMARY_CONCURRENCY, async (participant) => {
      const operationStarted = performance.now()
      const body = {
        ...stageOneVersion,
        text: `合成寄语 ${String(participant.index + 1).padStart(3, '0')}`,
        publicDisplayNoticeAccepted: true,
      }
      const key = idempotencyKey('capsule-message', participant.index)
      try {
        const response = await (fixture as LoadFixture).request(
          'capsule-message',
          'PUT',
          '/api/participant/capsule-message',
          { cookie: participant.cookie, idempotencyKey: key, body },
        )
        const snapshot = asParticipantSnapshot(response.body)
        const ownObserver = participant.observer
        assertCondition(ownObserver, 'Participant observer is unavailable')
        const [screenAt, participantAt] = await Promise.all([
          (screenObserver as ScreenAuthorityObserver).waitFor(snapshot.eventSeq),
          ownObserver.waitForPrivate(snapshot.eventSeq),
        ])
        recorders.capsuleMessage.success(
          Math.max(performance.now(), screenAt, participantAt) - operationStarted,
        )
        if (participant.index === 0) {
          replaySamples.push({
            operation: 'capsuleMessage',
            method: 'PUT',
            requestPath: '/api/participant/capsule-message',
            cookie: participant.cookie,
            idempotencyKey: key,
            body,
          })
        }
      } catch (error) {
        recorders.capsuleMessage.failure()
        recordFailure(failures, 'capsuleMessage', error)
      }
    })

    const adminLogin = await fixture.request(
      'admin-login',
      'POST',
      '/api/admin/login',
      {
        body: {
          username: fixture.manifest.admin.username,
          password: fixture.manifest.admin.password,
        },
      },
    )
    assertCondition(adminLogin.cookie, 'Admin cookie is unavailable')
    adminCookie = adminLogin.cookie
    let adminSnapshot = asAdminSnapshot(adminLogin.body)
    adminSnapshot = asAdminSnapshot(
      (
        await fixture.request('admin-roles', 'PUT', '/api/admin/roles', {
          cookie: adminCookie,
          idempotencyKey: idempotencyKey('admin-roles', 0),
          body: { ...version(adminSnapshot), roles: ['ALL'] },
        })
      ).body,
    )

    const runtimeCommand = async (input: {
      operation: string
      action:
        | 'START'
        | 'JUMP'
        | 'SET_PROGRAM'
      targetStage?: number
      programId?: string
      measureStage?: boolean
      recoverySample?: boolean
    }): Promise<AdminSnapshot> => {
      const operationStarted = performance.now()
      try {
        const response = await (fixture as LoadFixture).request(
          input.operation,
          'POST',
          '/api/admin/runtime',
          {
            cookie: adminCookie,
            idempotencyKey: idempotencyKey(input.operation, adminSnapshot.runtime.stageRevision),
            body: {
              ...version(adminSnapshot),
              action: input.action,
              ...(input.targetStage === undefined
                ? {}
                : { targetStage: input.targetStage }),
              ...(input.programId === undefined
                ? {}
                : { programId: input.programId }),
              confirmed: false,
            },
          },
        )
        const next = asAdminSnapshot(response.body)
        const [screenAt, fanoutResult] = await Promise.all([
          (screenObserver as ScreenAuthorityObserver).waitFor(next.eventSeq),
          fanout.waitFor(next.eventSeq),
        ])
        const duration =
          Math.max(performance.now(), screenAt, fanoutResult.completedAt) -
          operationStarted
        if (input.measureStage) {
          recorders.stage.success(duration)
          primaryFanouts.push(fanoutResult)
        }
        if (input.recoverySample) recoveryFanouts.push(fanoutResult)
        return next
      } catch (error) {
        if (input.measureStage) {
          recorders.stage.failure()
          recordFailure(failures, 'stage', error)
        }
        throw error
      }
    }

    adminSnapshot = await runtimeCommand({
      operation: 'runtime-start',
      action: 'START',
    })
    for (let index = 0; index < STAGE_SAMPLE_COUNT; index += 1) {
      adminSnapshot = await runtimeCommand({
        operation: `stage-sample-${index + 1}`,
        action: 'JUMP',
        targetStage: index % 2 === 0 ? 2 : 1,
        measureStage: true,
      })
    }
    assertCondition(
      adminSnapshot.runtime.stage === 1,
      'Stage samples did not return to stage one',
    )

    adminSnapshot = await runtimeCommand({
      operation: 'jump-stage-three',
      action: 'JUMP',
      targetStage: 3,
    })
    const starVersion = version(adminSnapshot)
    await mapLimit(participants, PRIMARY_CONCURRENCY, async (participant) => {
      const operationStarted = performance.now()
      const body = { ...starVersion }
      const key = idempotencyKey('star', participant.index)
      try {
        const response = await (fixture as LoadFixture).request(
          'star',
          'POST',
          '/api/participant/star/start',
          { cookie: participant.cookie, idempotencyKey: key, body },
        )
        const snapshot = asParticipantSnapshot(response.body)
        const ownObserver = participant.observer
        assertCondition(ownObserver, 'Participant observer is unavailable')
        const [screenAt, participantAt] = await Promise.all([
          (screenObserver as ScreenAuthorityObserver).waitFor(snapshot.eventSeq),
          ownObserver.waitForPrivate(snapshot.eventSeq),
        ])
        recorders.star.success(
          Math.max(performance.now(), screenAt, participantAt) - operationStarted,
        )
        if (participant.index === 0) {
          replaySamples.push({
            operation: 'star',
            method: 'POST',
            requestPath: '/api/participant/star/start',
            cookie: participant.cookie,
            idempotencyKey: key,
            body,
          })
        }
      } catch (error) {
        recorders.star.failure()
        recordFailure(failures, 'star', error)
      }
    })

    adminSnapshot = await runtimeCommand({
      operation: 'jump-stage-four',
      action: 'JUMP',
      targetStage: 4,
    })
    const giftVersion = version(adminSnapshot)
    const currentProgramId = adminSnapshot.runtime.currentProgramId
    assertCondition(currentProgramId, 'Current program is unavailable')
    const gifts = [...fixture.manifest.gifts].sort(
      (left, right) => left.powerCost - right.powerCost,
    )
    for (const gift of gifts) {
      const tierRecorder = recorders[`gift${gift.powerCost}` as keyof typeof recorders]
      assertCondition(
        tierRecorder instanceof OperationRecorder,
        'Gift tier recorder is unavailable',
      )
      await mapLimit(participants, PRIMARY_CONCURRENCY, async (participant) => {
        const operationStarted = performance.now()
        const body = {
          ...giftVersion,
          programId: currentProgramId,
          giftId: gift.id,
        }
        const key = idempotencyKey(
          `gift-${gift.powerCost}`,
          participant.index,
        )
        try {
          const response = await (fixture as LoadFixture).request(
            `gift-${gift.powerCost}`,
            'POST',
            '/api/participant/gifts',
            { cookie: participant.cookie, idempotencyKey: key, body },
          )
          const snapshot = asParticipantSnapshot(response.body)
          const ownObserver = participant.observer
          assertCondition(ownObserver, 'Participant observer is unavailable')
          const [screenAt, participantAt] = await Promise.all([
            (screenObserver as ScreenAuthorityObserver).waitFor(snapshot.eventSeq),
            ownObserver.waitForPrivate(snapshot.eventSeq),
          ])
          const duration =
            Math.max(performance.now(), screenAt, participantAt) - operationStarted
          recorders.gift.success(duration)
          tierRecorder.success(duration)
          if (participant.index === 0 && gift.powerCost === 50) {
            replaySamples.push({
              operation: 'gift',
              method: 'POST',
              requestPath: '/api/participant/gifts',
              cookie: participant.cookie,
              idempotencyKey: key,
              body,
            })
          }
        } catch (error) {
          recorders.gift.failure()
          tierRecorder.failure()
          recordFailure(failures, 'gift', error)
        }
      })
    }

    const barrageVersion = version(adminSnapshot)
    await mapLimit(participants, PRIMARY_CONCURRENCY, async (participant) => {
      const operationStarted = performance.now()
      const body = {
        ...barrageVersion,
        text: `合成弹幕 ${String(participant.index + 1).padStart(3, '0')}`,
        publicNoticeAccepted: true as const,
      }
      const key = idempotencyKey('barrage', participant.index)
      try {
        const response = await (fixture as LoadFixture).request(
          'barrage',
          'POST',
          '/api/participant/barrages',
          { cookie: participant.cookie, idempotencyKey: key, body },
        )
        const snapshot = asParticipantSnapshot(response.body)
        const ownObserver = participant.observer
        assertCondition(ownObserver, 'Participant observer is unavailable')
        const [screenAt, participantAt] = await Promise.all([
          (screenObserver as ScreenAuthorityObserver).waitFor(snapshot.eventSeq),
          ownObserver.waitForPrivate(snapshot.eventSeq),
        ])
        recorders.barrage.success(
          Math.max(performance.now(), screenAt, participantAt) - operationStarted,
        )
        if (participant.index === 0) {
          replaySamples.push({
            operation: 'barrage',
            method: 'POST',
            requestPath: '/api/participant/barrages',
            cookie: participant.cookie,
            idempotencyKey: key,
            body,
          })
        }
      } catch (error) {
        recorders.barrage.failure()
        recordFailure(failures, 'barrage', error)
      }
    })

    adminSnapshot = await runtimeCommand({
      operation: 'jump-stage-five',
      action: 'JUMP',
      targetStage: 5,
    })
    const lightVersion = version(adminSnapshot)
    await mapLimit(participants, PRIMARY_CONCURRENCY, async (participant) => {
      const operationStarted = performance.now()
      const body = { ...lightVersion }
      const key = idempotencyKey('cooperative-light', participant.index)
      try {
        const response = await (fixture as LoadFixture).request(
          'cooperative-light',
          'POST',
          '/api/participant/cooperative-light',
          { cookie: participant.cookie, idempotencyKey: key, body },
        )
        const snapshot = asParticipantSnapshot(response.body)
        const ownObserver = participant.observer
        assertCondition(ownObserver, 'Participant observer is unavailable')
        const [screenAt, participantAt] = await Promise.all([
          (screenObserver as ScreenAuthorityObserver).waitFor(snapshot.eventSeq),
          ownObserver.waitForPrivate(snapshot.eventSeq),
        ])
        recorders.cooperativeLight.success(
          Math.max(performance.now(), screenAt, participantAt) - operationStarted,
        )
        if (participant.index === 0) {
          replaySamples.push({
            operation: 'cooperativeLight',
            method: 'POST',
            requestPath: '/api/participant/cooperative-light',
            cookie: participant.cookie,
            idempotencyKey: key,
            body,
          })
        }
      } catch (error) {
        recorders.cooperativeLight.failure()
        recordFailure(failures, 'cooperativeLight', error)
      }
    })

    const beforeReplay = readDatabaseDigest(fixture)
    for (const sample of replaySamples) {
      await fixture.request(
        `idempotency-replay-${sample.operation}`,
        sample.method,
        sample.requestPath,
        {
          cookie: sample.cookie,
          idempotencyKey: sample.idempotencyKey,
          body: sample.body,
        },
      )
    }
    const afterReplay = readDatabaseDigest(fixture)
    replayInvariantPreserved =
      JSON.stringify(beforeReplay) === JSON.stringify(afterReplay)
    assertCondition(
      replayInvariantPreserved,
      'Idempotency replay changed persisted business state',
    )

    await fixture.restart()
    restartDisconnects = await waitForSocketsClosed(sockets)
    assertCondition(
      restartDisconnects === 301,
      'Restart did not close every websocket connection',
    )

    const recoveredSnapshots = await mapLimit(
      participants,
      RECOVERY_CONCURRENCY,
      async (participant) => {
        counters.recoveryParticipant += 1
        const response = await (fixture as LoadFixture).request(
          'restart-participant-snapshot',
          'GET',
          '/api/participant/snapshot',
          { cookie: participant.cookie },
        )
        const snapshot = asParticipantSnapshot(response.body)
        assertCondition(
          snapshot.participant.id === participant.identityId &&
            snapshot.participant.powerBalance === 15 &&
            snapshot.participant.starlight === 100 &&
            snapshot.participant.capsuleMessageSubmitted &&
            snapshot.participant.capsulePublicNoticeAccepted &&
            snapshot.participant.capsuleCandidateStatus === 'SUBMITTED' &&
            snapshot.participant.capsuleMessage !== null &&
            snapshot.participant.starStarted &&
            snapshot.participant.firstGiftCompleted &&
            snapshot.participant.firstBarrageCompleted &&
            snapshot.participant.cooperativeLightCompleted &&
            snapshot.participant.giftCount === 4 &&
            snapshot.participant.publishedBarrageCount === 1 &&
            snapshot.giftHistory.length === 4,
          'Restart participant snapshot lost authoritative state',
        )
        restartSnapshotsRecovered += 1
        return snapshot
      },
    )
    counters.recoveryScreen += 1
    const recoveredScreen = asScreenSnapshot(
      (
        await fixture.request(
          'restart-screen-snapshot',
          'GET',
          '/api/screen/snapshot',
        )
      ).body,
    )
    restartScreenRecovered =
      recoveredScreen.aggregates.activatedCount === PARTICIPANT_COUNT &&
      recoveredScreen.aggregates.starStartedCount === PARTICIPANT_COUNT &&
      recoveredScreen.aggregates.totalStarlight === PARTICIPANT_COUNT * 100 &&
      recoveredScreen.aggregates.cooperativeLightCount === PARTICIPANT_COUNT &&
      recoveredScreen.publishedBarrages.length === 30 &&
      recoveredScreen.programs.reduce((sum, program) => sum + program.heat, 0) ===
        PARTICIPANT_COUNT * 85
    assertCondition(
      restartScreenRecovered,
      'Restart screen snapshot lost authoritative state',
    )
    counters.recoveryAdmin += 1
    adminSnapshot = asAdminSnapshot(
      (
        await fixture.request(
          'restart-admin-snapshot',
          'GET',
          '/api/admin/snapshot',
          { cookie: adminCookie },
        )
      ).body,
    )
    restartAdminRecovered = adminSnapshot.session.roles.includes('ALL')
    assertCondition(
      restartAdminRecovered,
      'Restart admin snapshot lost the active role set',
    )

    archivedScreenRawFrames += screenObserver.rawFrames
    archivedScreenProtocolErrors += screenObserver.protocolErrors
    archivedParticipantRawFrames += participants.reduce(
      (sum, participant) => sum + (participant.observer?.rawFrames ?? 0),
      0,
    )
    archivedParticipantProtocolErrors += participants.reduce(
      (sum, participant) => sum + (participant.observer?.protocolErrors ?? 0),
      0,
    )
    sockets = []
    fanout = new RuntimeFanoutCoordinator(PARTICIPANT_COUNT)
    screenObserver = new ScreenAuthorityObserver({
      fixture,
      counters,
      epoch: recoveredScreen.runtime.resetEpoch,
      initialEventSeq: recoveredScreen.eventSeq,
    })
    screenSocket = await fixture.connectWebSocket({
      stream: 'screen',
      resetEpoch: recoveredScreen.runtime.resetEpoch,
      afterEventSeq: recoveredScreen.eventSeq,
      onEnvelope: (envelope) => screenObserver?.note(envelope),
    })
    sockets.push(screenSocket)
    recoveredOpened += 1
    const recoveredParticipantSockets = await mapLimit(
      participants,
      CONNECTION_CONCURRENCY,
      async (participant, index) => {
        const cursor = recoveredSnapshots[index]
        assertCondition(cursor, 'Recovered participant cursor is unavailable')
        const observer = new ParticipantAuthorityObserver({
          fixture: fixture as LoadFixture,
          cookie: participant.cookie,
          counters,
          fanout,
          onRefreshFailure: (kind, error) =>
            recordFailure(failures, `participant-${kind}-snapshot`, error),
        })
        participant.observer = observer
        const socket = await (fixture as LoadFixture).connectWebSocket({
          stream: 'participant',
          resetEpoch: cursor.runtime.resetEpoch,
          afterEventSeq: cursor.eventSeq,
          cookie: participant.cookie,
          onEnvelope: (envelope) => observer.note(envelope),
        })
        recoveredOpened += 1
        return socket
      },
    )
    sockets.push(...recoveredParticipantSockets)
    assertCondition(recoveredOpened === 301, 'Recovered websocket fanout is incomplete')

    adminSnapshot = await runtimeCommand({
      operation: 'restart-jump-stage-four',
      action: 'JUMP',
      targetStage: 4,
      recoverySample: true,
    })
    adminSnapshot = await runtimeCommand({
      operation: 'restart-jump-stage-five',
      action: 'JUMP',
      targetStage: 5,
      recoverySample: true,
    })

    preResetInvariants = readInvariants(fixture)
    assertCondition(preResetInvariants.passed, 'Business invariants did not pass')

    const oldEpoch = adminSnapshot.runtime.resetEpoch
    const oldEventSeq = adminSnapshot.eventSeq
    const resetEpochPromise = screenObserver.waitForResetEpoch(oldEpoch + 1)
    const resetResponse = await fixture.request<{
      status: 'ok'
      resetEpoch: number
    }>('admin-reset', 'POST', '/api/admin/reset', {
      cookie: adminCookie,
      idempotencyKey: idempotencyKey('admin-reset', 0),
      body: {
        ...version(adminSnapshot),
        confirmation: 'RESET DEMO',
      },
    })
    assertCondition(resetResponse.cookie, 'Replacement admin cookie is unavailable')
    adminCookie = resetResponse.cookie
    assertCondition(
      resetResponse.body.resetEpoch === oldEpoch + 1,
      'Reset epoch did not advance',
    )
    await resetEpochPromise
    resetEventObserved = true

    const staleParticipant = participants[0]
    assertCondition(staleParticipant, 'Stale participant session is unavailable')
    try {
      await fixture.request(
        'stale-participant-session',
        'GET',
        '/api/participant/snapshot',
        { cookie: staleParticipant.cookie },
      )
    } catch (error) {
      staleParticipantSessionRejected =
        error instanceof SanitizedProtocolError && error.code === 'AUTH_REQUIRED'
    }
    assertCondition(
      staleParticipantSessionRejected,
      'Reset did not invalidate the old participant session',
    )

    await Promise.all(sockets.map(closeSocketAndWait))
    sockets = []
    const resyncEnvelope = await new Promise<RealtimeEnvelope>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new SanitizedProtocolError({
            operation: 'old-epoch-resync',
            code: 'AUTHORITY_TIMEOUT',
          }),
        )
      }, AUTHORITY_TIMEOUT_MS)
      timeout.unref()
      void fixture
        ?.connectWebSocket({
          stream: 'screen',
          resetEpoch: oldEpoch,
          afterEventSeq: oldEventSeq,
          onEnvelope: (envelope) => {
            if (envelope.type !== 'resync.required') return
            clearTimeout(timeout)
            resolve(envelope)
          },
        })
        .then((socket) => sockets.push(socket), reject)
    })
    const resyncPayload = asObject(
      resyncEnvelope.payload,
      'Resync payload is invalid',
    )
    oldEpochResync = resyncPayload.reason === 'EPOCH_CHANGED'
    assertCondition(oldEpochResync, 'Old epoch did not receive a resync directive')

    const fixedCredential = fixture.manifest.participants[0]
    assertCondition(fixedCredential, 'Fixed synthetic credential is unavailable')
    const reactivation = await fixture.request(
      'post-reset-reactivation',
      'POST',
      '/api/participant/activate',
      {
        idempotencyKey: idempotencyKey('post-reset-activate', 0),
        body: {
          method: 'INVITATION_TOKEN',
          token: fixedCredential.inviteToken,
        },
      },
    )
    const reactivatedSnapshot = asParticipantSnapshot(reactivation.body)
    fixedCredentialReactivation =
      reactivation.cookie !== null &&
      reactivatedSnapshot.runtime.resetEpoch === oldEpoch + 1 &&
      reactivatedSnapshot.participant.powerBalance === 100 &&
      reactivatedSnapshot.participant.starlight === 20
    assertCondition(
      fixedCredentialReactivation,
      'Fixed credential did not reactivate after reset',
    )
    postResetOldEpochRows = countOldEpochRows(fixture)
    assertCondition(
      postResetOldEpochRows === 0,
      'Old epoch rows polluted the reset epoch',
    )

    const operations = Object.fromEntries(
      Object.entries(recorders).map(([name, recorder]) => [
        name,
        recorder.summary(),
      ]),
    ) as Record<string, OperationSummary>
    assertPrimaryMetrics(operations)
    assertCondition(
      primaryFanouts.length === STAGE_SAMPLE_COUNT &&
        primaryFanouts.every(
          (result) =>
            result.expected === PARTICIPANT_COUNT &&
            result.succeeded === PARTICIPANT_COUNT &&
            result.failed === 0,
        ),
      'Primary stage fanout did not fully recover',
    )
    assertCondition(
      recoveryFanouts.length === 2 &&
        recoveryFanouts.every(
          (result) =>
            result.succeeded === PARTICIPANT_COUNT && result.failed === 0,
        ),
      'Restart stage fanout did not fully recover',
    )
    status = 'passed'
  } catch (error) {
    topLevelFailure = failureCode(error)
    recordFailure(failures, 'runner', error)
  } finally {
    closeWebSockets(sockets)
    if (fixture) {
      const temporaryDirectory = fixture.temporaryDirectory
      const port = fixture.config.port
      try {
        await fixture.close()
        temporaryDirectoryRemoved = !fs.existsSync(temporaryDirectory)
        portReleased = await verifyPortReleased(port)
        if (!temporaryDirectoryRemoved || !portReleased) {
          status = 'failed'
          recordFailure(
            failures,
            'cleanup',
            new SanitizedProtocolError({
              operation: 'cleanup',
              code: 'CLEANUP_INCOMPLETE',
            }),
          )
          topLevelFailure ??= 'CLEANUP_INCOMPLETE'
        }
      } catch (error) {
        status = 'failed'
        recordFailure(failures, 'cleanup', error)
        topLevelFailure ??= failureCode(error)
      }
    }
    const operations = Object.fromEntries(
      Object.entries(recorders).map(([name, recorder]) => [
        name,
        recorder.summary(),
      ]),
    ) as Record<string, OperationSummary>
    const finishedAt = new Date()
    const packageJson = JSON.parse(
      fs.readFileSync(
        fileURLToPath(new URL('../../package.json', import.meta.url)),
        'utf8',
      ),
    ) as { version?: string; packageManager?: string }
    const participantRawFrames = archivedParticipantRawFrames + participants.reduce(
      (sum, participant) => sum + (participant.observer?.rawFrames ?? 0),
      0,
    )
    const participantProtocolErrors =
      archivedParticipantProtocolErrors + participants.reduce(
      (sum, participant) => sum + (participant.observer?.protocolErrors ?? 0),
      0,
    )
    const report = {
      schemaVersion: REPORT_SCHEMA_VERSION,
      status,
      applicationVersion: packageJson.version ?? 'unknown',
      protocolVersion: '1',
      seedVersion: fixture?.manifest.seedVersion ?? 'unavailable',
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.round((performance.now() - started) * 100) / 100,
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
        'client command start to merged authoritative screen snapshot plus private-scoped participant snapshot or runtime-scoped committed participant event observation; replay samples excluded',
      thresholdMs: LOAD_THRESHOLD_MS,
      operations,
      websocket: {
        targetConcurrentConnections: 301,
        initialOpened,
        disconnectsDuringRestart: restartDisconnects,
        recoveredOpened,
        screenRawFrames:
          archivedScreenRawFrames + (screenObserver?.rawFrames ?? 0),
        participantRawFrames,
        protocolErrors:
          archivedScreenProtocolErrors +
          (screenObserver?.protocolErrors ?? 0) +
          participantProtocolErrors,
      },
      snapshotRequests: snapshotRequestReport(counters),
      stageFanout: {
        primarySamples: STAGE_SAMPLE_COUNT,
        expectedParticipantsPerSample: PARTICIPANT_COUNT,
        fullyObservedSamples: primaryFanouts.filter(
          (result) =>
            result.succeeded === PARTICIPANT_COUNT && result.failed === 0,
        ).length,
        eventObservationsSucceeded: primaryFanouts.reduce(
          (sum, result) => sum + result.succeeded,
          0,
        ),
        eventObservationsFailed: primaryFanouts.reduce(
          (sum, result) => sum + result.failed,
          0,
        ),
        restartSamples: recoveryFanouts.length,
        restartFullyObservedSamples: recoveryFanouts.filter(
          (result) =>
            result.succeeded === PARTICIPANT_COUNT && result.failed === 0,
        ).length,
      },
      idempotency: {
        replayedSamples: replaySamples.length,
        persistedStateUnchanged: replayInvariantPreserved,
      },
      recovery: {
        persistedDatabaseRestarted: restartDisconnects === 301,
        participantSnapshotsRecovered: restartSnapshotsRecovered,
        screenSnapshotRecovered: restartScreenRecovered,
        adminSnapshotRecovered: restartAdminRecovered,
        resetEventObserved,
        staleParticipantSessionRejected,
        oldEpochResync,
        fixedCredentialReactivation,
      },
      cleanup: {
        temporaryDirectoryRemoved,
        portReleased,
      },
      invariants: preResetInvariants,
      postReset: {
        oldEpochRows: postResetOldEpochRows,
      },
      failures,
      topLevelFailure,
      privacy: {
        containsCredentials: false,
        containsDisplayNames: false,
        containsPrivateMessages: false,
        containsBarrageBodies: false,
        auditPassed: false,
      },
    }
    report.privacy.auditPassed = reportPrivacyAudit(report, fixture)
    if (!report.privacy.auditPassed) {
      status = 'failed'
      report.status = 'failed'
      report.topLevelFailure = 'REPORT_PRIVACY_VIOLATION'
      recordFailure(
        failures,
        'report-privacy',
        new SanitizedProtocolError({
          operation: 'report-privacy',
          code: 'REPORT_PRIVACY_VIOLATION',
        }),
      )
    }
    fs.mkdirSync(REPORT_ROOT, { recursive: true })
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    const safeSummary = {
      status,
      report: path.relative(process.cwd(), REPORT_PATH).replaceAll('\\', '/'),
      durationMs: report.durationMs,
      operations,
      websocket: report.websocket,
      snapshotRequests: report.snapshotRequests,
      invariantPassed: preResetInvariants?.passed ?? false,
      cleanup: report.cleanup,
      topLevelFailure,
    }
    process.stdout.write(`${JSON.stringify(safeSummary, null, 2)}\n`)
    if (status !== 'passed') process.exitCode = 1
  }
}

await run()
