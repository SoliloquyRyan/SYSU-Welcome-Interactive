import { describe, expect, it } from 'vitest'

import { isEventVisibleToRealtimeAccess } from '../../frontend/src/composables/useRealtime.js'

describe('realtime access stream visibility', () => {
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
})
