import { describe, expect, it } from 'vitest'

import {
  adminSnapshotCanReplace,
  createAdminSessionGeneration,
} from '../../frontend/src/pages/admin/v2-admin-state.js'

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: '2',
    resetEpoch: 4,
    generatedAt: '2026-08-14T03:00:00.000Z',
    publicSeq: 12,
    adminSeq: 9,
    runtime: { status: 'RUNNING', runRevision: 5 },
    presentationRevision: 4,
    aggregateRevision: 7,
    interaction: { interactionRevision: 3 },
    ...overrides,
  }
}

describe('v2 admin snapshot monotonic commit', () => {
  it('accepts the first valid snapshot and non-regressing updates in one epoch', () => {
    const current = snapshot()

    expect(adminSnapshotCanReplace(null, current)).toBe(true)
    expect(adminSnapshotCanReplace(current, snapshot())).toBe(false)
    expect(adminSnapshotCanReplace(current, snapshot({
      publicSeq: 13,
      adminSeq: 10,
      runtime: { status: 'PAUSED', runRevision: 6 },
      presentationRevision: 5,
    }))).toBe(true)
  })

  it.each([
    ['publicSeq', { publicSeq: 11 }],
    ['adminSeq', { adminSeq: 8 }],
    ['runRevision', { runtime: { status: 'RUNNING', runRevision: 4 } }],
    ['presentationRevision', { presentationRevision: 3 }],
    ['aggregateRevision', { aggregateRevision: 6 }],
    ['interactionRevision', { interaction: { interactionRevision: 2 } }],
  ])('rejects a same-epoch %s regression', (_field, overrides) => {
    expect(adminSnapshotCanReplace(snapshot(), snapshot(overrides))).toBe(false)
  })

  it('keeps PAUSED after a stale RUNNING response finishes last', () => {
    const initial = snapshot()
    const paused = snapshot({
      publicSeq: 13,
      adminSeq: 10,
      runtime: { status: 'PAUSED', runRevision: 6 },
      presentationRevision: 5,
    })
    const staleRunning = snapshot({
      publicSeq: 12,
      adminSeq: 9,
      runtime: { status: 'RUNNING', runRevision: 5 },
      presentationRevision: 4,
    })
    let committed = initial

    if (adminSnapshotCanReplace(committed, paused)) committed = paused
    if (adminSnapshotCanReplace(committed, staleRunning)) committed = staleRunning

    expect(committed.runtime.status).toBe('PAUSED')
  })

  it('uses generatedAt only when every authoritative counter is equal', () => {
    const current = snapshot()

    expect(adminSnapshotCanReplace(current, snapshot({
      generatedAt: '2026-08-14T03:00:01.000Z',
    }))).toBe(true)
    expect(adminSnapshotCanReplace(current, snapshot({
      generatedAt: '2026-08-14T02:59:59.000Z',
    }))).toBe(false)
    expect(adminSnapshotCanReplace(current, snapshot({
      generatedAt: '2026-08-14T03:00:01.000Z',
      publicSeq: 11,
    }))).toBe(false)
  })

  it('accepts a newer reset generation and rejects responses from an older one', () => {
    const beforeReset = snapshot()
    const afterReset = snapshot({
      resetEpoch: 5,
      publicSeq: 0,
      adminSeq: 0,
      runtime: { status: 'READY', runRevision: 0 },
      presentationRevision: 0,
      aggregateRevision: 0,
      interaction: { interactionRevision: 0 },
    })

    expect(adminSnapshotCanReplace(beforeReset, afterReset)).toBe(true)
    expect(adminSnapshotCanReplace(afterReset, beforeReset)).toBe(false)
  })

  it.each([
    null,
    {},
    snapshot({ protocolVersion: '1' }),
    snapshot({ resetEpoch: 0 }),
    snapshot({ generatedAt: 'not-a-date' }),
    snapshot({ publicSeq: -1 }),
    snapshot({ adminSeq: 1.5 }),
    snapshot({ adminSeq: Number.MAX_SAFE_INTEGER + 1 }),
    snapshot({ runtime: {} }),
    snapshot({ interaction: null }),
  ])('rejects a malformed candidate clock %#', (candidate) => {
    expect(adminSnapshotCanReplace(snapshot(), candidate)).toBe(false)
  })
})

describe('v2 admin session generation', () => {
  it('invalidates every request captured before login or logout advances the session', () => {
    const generation = createAdminSessionGeneration()
    const bootRequest = generation.capture()

    expect(generation.isCurrent(bootRequest)).toBe(true)
    const loginRequest = generation.advance()
    expect(generation.isCurrent(bootRequest)).toBe(false)
    expect(generation.isCurrent(loginRequest)).toBe(true)

    const logoutRequest = generation.advance()
    expect(generation.isCurrent(loginRequest)).toBe(false)
    expect(generation.isCurrent(logoutRequest)).toBe(true)
  })

  it('keeps all captures in the same session comparable until it advances', () => {
    const generation = createAdminSessionGeneration()

    expect(generation.capture()).toBe(generation.capture())
    generation.advance()
    expect(generation.capture()).toBe(1)
  })
})
