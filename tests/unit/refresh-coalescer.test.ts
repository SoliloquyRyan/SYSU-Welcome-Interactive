import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createRefreshCoalescer,
  shouldCommitSnapshot,
} from '../../frontend/src/services/refresh-coalescer.js'

describe('refresh coalescer', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('collapses an event burst into one authoritative refresh', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn(async () => undefined)
    const coalescer = createRefreshCoalescer(refresh, {
      delayMs: 40,
      setTimer: setTimeout,
      clearTimer: clearTimeout,
    })

    for (let index = 0; index < 100; index += 1) coalescer.schedule()
    await vi.advanceTimersByTimeAsync(40)

    expect(refresh).toHaveBeenCalledOnce()
  })

  it('performs one trailing refresh when events arrive during a request', async () => {
    vi.useFakeTimers()
    let release
    const first = new Promise((resolve) => {
      release = resolve
    })
    const refresh = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined)
    const coalescer = createRefreshCoalescer(refresh, {
      delayMs: 20,
      setTimer: setTimeout,
      clearTimer: clearTimeout,
    })

    coalescer.schedule()
    await vi.advanceTimersByTimeAsync(20)
    coalescer.schedule()
    coalescer.schedule()
    release()
    await first
    await vi.advanceTimersByTimeAsync(20)

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending refresh when its page is disposed', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn(async () => undefined)
    const coalescer = createRefreshCoalescer(refresh, {
      setTimer: setTimeout,
      clearTimer: clearTimeout,
    })

    coalescer.schedule()
    coalescer.cancel()
    await vi.runAllTimersAsync()

    expect(refresh).not.toHaveBeenCalled()
  })

  it('never lets an older response overwrite a newer event projection', () => {
    const current = { eventSeq: 18, runtime: { resetEpoch: 3 } }

    expect(
      shouldCommitSnapshot(current, {
        eventSeq: 17,
        runtime: { resetEpoch: 3 },
      }),
    ).toBe(false)
    expect(
      shouldCommitSnapshot(current, {
        eventSeq: 19,
        runtime: { resetEpoch: 3 },
      }),
    ).toBe(true)
  })

  it('orders snapshots by reset epoch before their event sequence', () => {
    const current = { eventSeq: 900, runtime: { resetEpoch: 4 } }

    expect(
      shouldCommitSnapshot(current, {
        eventSeq: 1,
        runtime: { resetEpoch: 5 },
      }),
    ).toBe(true)
    expect(
      shouldCommitSnapshot(current, {
        eventSeq: 999,
        runtime: { resetEpoch: 3 },
      }),
    ).toBe(false)
  })
})
