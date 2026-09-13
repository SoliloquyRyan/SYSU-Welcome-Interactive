import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRaffleReveal, RAFFLE_HOLD_MS } from '../../frontend/src/pages/screen/raffle-reveal.js'
import { cooperativeLightProgress, screenPresentationCanReplace, screenSnapshotCanReplace } from '../../frontend/src/pages/screen/v2-screen-state.js'

const winner = (id: number) => ({ raffleDrawId: `draw-${id}`, publicStarId: `T-${String(id).padStart(4, '0')}` })

describe('raffle presentation preserves every authoritative result', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }))
  afterEach(() => vi.useRealTimers())

  function setup() {
    let state = { phase: 'waiting', code: '', winner: null as ReturnType<typeof winner> | null, history: [] as ReturnType<typeof winner>[], animateReveal: false }
    const reveal = createRaffleReveal({ onChange: (next: typeof state) => { state = next } })
    return { reveal, state: () => state }
  }

  it('hides new results until their own reveal, including coalesced and overlapping snapshots', () => {
    const { reveal, state } = setup()
    reveal.sync([])
    reveal.sync([winner(1)], { animate: true })
    vi.advanceTimersByTime(700)
    reveal.sync([winner(3), winner(2), winner(1)], { animate: true })
    reveal.sync([winner(3), winner(2), winner(1)], { animate: true })
    expect(state().phase).toBe('rolling')
    expect(state().history).toEqual([])
    expect(state().winner).toBeNull()
    vi.advanceTimersByTime(1120)
    expect(state().code).toBe(winner(1).publicStarId)
    expect(state().history).toEqual([winner(1)])
    vi.advanceTimersByTime(RAFFLE_HOLD_MS - 1)
    expect(state().code).toBe(winner(1).publicStarId)
    vi.advanceTimersByTime(1)
    expect(state().phase).toBe('rolling')
    expect(state().history).toEqual([winner(1)])
    vi.advanceTimersByTime(1820)
    expect(state().code).toBe(winner(2).publicStarId)
    expect(state().history).toEqual([winner(2), winner(1)])
    vi.advanceTimersByTime(RAFFLE_HOLD_MS + 1820)
    expect(state().code).toBe(winner(3).publicStarId)
    expect(state().history).toEqual([winner(3), winner(2), winner(1)])
    vi.runAllTimers()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('settles the complete result on recovery, hidden or reduced motion without replay', () => {
    const { reveal, state } = setup()
    reveal.sync([winner(2), winner(1)], { animate: true })
    vi.advanceTimersByTime(500)
    reveal.sync([winner(2), winner(1)])
    expect(state().phase).toBe('revealed')
    expect(state().animateReveal).toBe(false)
    expect(state().history).toHaveLength(2)
    expect(state().code).toBe(winner(2).publicStarId)
    expect(vi.getTimerCount()).toBe(0)
    reveal.sync([winner(2), winner(1)], { animate: true })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears a rehearsal result and tears down in-flight timers', () => {
    const { reveal, state } = setup()
    reveal.sync([winner(1)], { animate: true })
    reveal.sync([], { animate: true })
    vi.runAllTimers()
    expect(state().phase).toBe('waiting')
    expect(state().history).toEqual([])
    reveal.sync([winner(2)], { animate: true })
    reveal.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never happens to display an unrevealed winner as a random rolling code', () => {
    const { reveal, state } = setup()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    reveal.sync([{ raffleDrawId: 'synthetic', publicStarId: 'A-0000' }], { animate: true })
    expect(state().code).not.toBe('A-0000')
    reveal.destroy()
    vi.restoreAllMocks()
  })
})

describe('public feedback recovery', () => {
  it('rejects an older in-flight snapshot and an obsolete epoch', () => {
    const current = { resetEpoch: 3, publicSeq: 10, runtime: { runRevision: 2 }, presentationRevision: 4, aggregateRevision: 5, interaction: { interactionRevision: 0 } }
    expect(screenSnapshotCanReplace(current, { ...current, publicSeq: 9 })).toBe(false)
    expect(screenSnapshotCanReplace(current, { ...current, presentationRevision: 3 })).toBe(false)
    expect(screenSnapshotCanReplace(current, { ...current, resetEpoch: 2, publicSeq: 100 })).toBe(false)
    expect(screenSnapshotCanReplace(current, { ...current, resetEpoch: 4, publicSeq: 0 })).toBe(true)
    expect(screenSnapshotCanReplace(current, { ...current, publicSeq: 11 })).toBe(true)
    const overtakenRaffle = { ...current, publicSeq: 9, presentationRevision: 5 }
    expect(screenSnapshotCanReplace(current, overtakenRaffle)).toBe(false)
    expect(screenPresentationCanReplace(current, overtakenRaffle)).toBe(true)
    expect(screenPresentationCanReplace(current, { ...overtakenRaffle, presentationRevision: 4 })).toBe(false)
    expect(screenPresentationCanReplace(current, { ...overtakenRaffle, resetEpoch: 2 })).toBe(false)
  })

  it('uses cooperative facts rather than ASSEMBLY participation and handles zero and late arrivals', () => {
    expect(cooperativeLightProgress({ admittedCount: 220, starStartedCount: 220, cooperativeLightCount: 0 }).ratio).toBe(0)
    expect(cooperativeLightProgress({ admittedCount: 220, cooperativeLightCount: 110 }).ratio).toBe(0.5)
    expect(cooperativeLightProgress({ admittedCount: 221, cooperativeLightCount: 220 }).ratio).toBeLessThan(1)
    expect(cooperativeLightProgress({ admittedCount: 0, cooperativeLightCount: 0 }).ratio).toBe(0)
  })
})
