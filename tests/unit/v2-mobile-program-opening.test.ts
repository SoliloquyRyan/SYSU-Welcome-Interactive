import { describe, expect, it } from 'vitest'
import { createMobileProgramOpeningGate } from '../../frontend/src/rendering/mobile-program-opening.js'

const transition = () => ({
  previous: { currentScene: 'ASSEMBLY', status: 'RUNNING' },
  next: { currentScene: 'PROGRAM_SUPPORT', status: 'RUNNING' },
  resetEpoch: 1, online: true, admitted: true, reduced: false, hidden: false,
  cinematic: '', presentation: 'NONE',
})

describe('phone programme opening event gate', () => {
  it('plays once per epoch even when a rehearsal returns to assembly', () => {
    const gate = createMobileProgramOpeningGate()
    expect(gate.consume(transition())).toBe(true)
    expect(gate.consume(transition())).toBe(false)
    expect(gate.consume({ ...transition(), resetEpoch: 2 })).toBe(true)
  })

  it('does not play from an initial or already-programme snapshot', () => {
    const gate = createMobileProgramOpeningGate()
    expect(gate.consume({ ...transition(), previous: null })).toBe(false)
    expect(gate.consume({ ...transition(), previous: transition().next })).toBe(false)
  })

  it.each([
    { online: false }, { admitted: false }, { reduced: true }, { hidden: true },
    { cinematic: 'orbit-handoff' }, { presentation: 'RAFFLE' },
  ])('consumes an ineligible transition without replaying it later: %j', condition => {
    const gate = createMobileProgramOpeningGate()
    expect(gate.consume({ ...transition(), ...condition })).toBe(false)
    expect(gate.consume(transition())).toBe(false)
  })

  it('does not consume an unrelated scene or a paused target', () => {
    const gate = createMobileProgramOpeningGate()
    expect(gate.consume({ ...transition(), next: { currentScene: 'COOPERATIVE_LIGHT', status: 'RUNNING' } })).toBe(false)
    expect(gate.consume({ ...transition(), next: { currentScene: 'PROGRAM_SUPPORT', status: 'PAUSED' } })).toBe(false)
    expect(gate.consume(transition())).toBe(true)
  })
})
