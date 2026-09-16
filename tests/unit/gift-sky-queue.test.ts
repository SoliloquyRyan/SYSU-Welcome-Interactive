import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGiftSkyQueue, giftDisplayColor, GIFT_SKY_DURATIONS } from '../../frontend/src/rendering/gift-sky-queue.js'
import { programBackground, PROGRAM_BACKGROUNDS } from '../../frontend/src/rendering/star-city-theme.js'

type State = { effects: { id: string; giftId: string; color: string; quantity: number; batches: number; static: boolean }[]; aggregate: { quantity: number } | null; pending: number }
describe('bounded public gift presentation', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10000) })
  afterEach(() => vi.useRealTimers())
  function fixture(compact = false, reduced = false) {
    let state: State = { effects: [], aggregate: null, pending: 0 }
    const queue = createGiftSkyQueue({ compact, reduced: () => reduced, onChange: (value: State) => { state = value } })
    return { queue, read: () => state }
  }
  const gift = (id: number, giftId = 'gift-starship', displayColor = '#a4d7f3') => ({ giftEventId: `gift-${id}`, giftId, displayColor, quantity: 1, showStarship: false })

  it.each(Object.entries(GIFT_SKY_DURATIONS))('expires %s at its own duration and ignores the legacy ship gate', (id, duration) => {
    const f = fixture()
    expect(f.queue.enqueue(gift(1, id))).toBe(true)
    expect(f.read().effects).toHaveLength(1)
    vi.advanceTimersByTime(Number(duration) - 1)
    expect(f.read().effects).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(f.read().effects).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps a batch as one effect and rejects duplicates without counting again', () => {
    const f = fixture(), batch = { ...gift(1), quantity: 20 }
    f.queue.enqueue(batch)
    expect(f.queue.enqueue(batch)).toBe(false)
    expect(f.read().effects).toMatchObject([{ quantity: 20, batches: 1, color: '#A4D7F3' }])
    f.queue.clear()
    expect(f.queue.enqueue(batch)).toBe(false)
    f.queue.clear({ forget: true })
    expect(f.queue.enqueue(batch)).toBe(true)
  })
  it('merges same type and color bursts without prolonging playback; ordinary batches stay distinct', () => {
    const f = fixture()
    f.queue.enqueue(gift(1)); vi.advanceTimersByTime(100); f.queue.enqueue({ ...gift(2), quantity: 4 })
    expect(f.read().effects).toMatchObject([{ quantity: 5, batches: 2 }])
    vi.advanceTimersByTime(240); f.queue.enqueue(gift(3)); f.queue.enqueue(gift(4, 'gift-beacon'))
    f.queue.enqueue(gift(5, 'gift-starship', '#FBC9A0'))
    expect(f.read().effects).toHaveLength(4)
    vi.advanceTimersByTime(2060)
    expect(f.read().effects.some(i => i.id === 'gift-1')).toBe(false)
    f.queue.clear()
  })
  it.each([false, true])('enforces concurrency, 12 pending and a 3s expiry (compact=%s)', compact => {
    const f = fixture(compact), limit = compact ? 2 : 6
    for (let i = 0; i < 35; i++) f.queue.enqueue(gift(i, 'gift-starship', '#' + i.toString(16).padStart(6, '0')))
    expect(f.read().effects).toHaveLength(limit)
    expect(f.read().pending).toBe(12)
    expect(f.read().aggregate?.quantity).toBe(35 - limit - 12)
    vi.advanceTimersByTime(2400)
    expect(f.read().effects).toHaveLength(limit)
    vi.advanceTimersByTime(600)
    expect(f.read().pending).toBe(0)
    expect(f.read().aggregate?.quantity).toBe(12 - limit)
    vi.advanceTimersByTime(1800)
    expect(f.read().effects).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('uses static feedback in reduced motion and clears all pending work on interruption', () => {
    const f = fixture(true, true)
    for (let i = 0; i < 8; i++) f.queue.enqueue(gift(i, 'gift-beacon', '#' + i.toString(16).padStart(6, '0')))
    expect(f.read().effects.every(i => i.static)).toBe(true)
    f.queue.clear()
    vi.advanceTimersByTime(10000)
    expect(f.read()).toEqual({ effects: [], aggregate: null, pending: 0 })
    expect(vi.getTimerCount()).toBe(0)
  })
  it('accepts only a hex display color and makes old events neutral', () => {
    for (const color of [undefined, null, 'red', 'url(secret)', '#123', '#AABBCCDD']) expect(giftDisplayColor(color)).toBe('#DCE7F3')
    expect(giftDisplayColor('#aabbcc')).toBe('#AABBCC')
  })
})

describe('stable program background mapping', () => {
  it('maps exactly ten IDs, ignores renamed titles and returns the theme for HOST or unknown programs', () => {
    expect(Object.keys(PROGRAM_BACKGROUNDS)).toHaveLength(10)
    expect(Object.values(PROGRAM_BACKGROUNDS).filter(i => i === 'lyric')).toHaveLength(6)
    expect(Object.values(PROGRAM_BACKGROUNDS).filter(i => i === 'rhythm')).toHaveLength(2)
    expect(Object.values(PROGRAM_BACKGROUNDS).filter(i => i === 'instrumental')).toHaveLength(2)
    expect(programBackground({ id: 'event2026-03', title: '更名后' }, { mode: 'PROGRAM' })).toBe('lyric')
    expect(programBackground({ id: 'event2026-03' }, { mode: 'HOST' })).toBe('theme')
    expect(programBackground({ id: 'unknown' })).toBe('theme')
  })
})
