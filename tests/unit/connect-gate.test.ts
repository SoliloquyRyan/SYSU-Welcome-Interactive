import { describe, expect, it } from 'vitest'

import { createConnectGate } from '../../frontend/src/services/connect-gate.js'

describe('realtime connect gate', () => {
  it('replays a connection request that arrived while resync was active', () => {
    const gate = createConnectGate()

    expect(gate.enter()).toBe(true)
    expect(gate.enter()).toBe(false)
    expect(gate.leave()).toBe(true)
    expect(gate.enter()).toBe(true)
    expect(gate.leave()).toBe(false)
  })

  it('can discard a pending request when the stream is disabled', () => {
    const gate = createConnectGate()

    expect(gate.enter()).toBe(true)
    expect(gate.enter()).toBe(false)
    gate.cancelPending()

    expect(gate.leave()).toBe(false)
  })
})
