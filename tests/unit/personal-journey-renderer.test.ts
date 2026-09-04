import { describe, expect, it } from 'vitest'

import {
  PERSONAL_JOURNEY_AMBIENT_CYCLE_MS,
  PERSONAL_JOURNEY_DURATIONS,
  PERSONAL_JOURNEY_PARTICLE_COUNTS,
  PERSONAL_JOURNEY_PHASES,
  resolvePersonalJourneyFrame,
} from '../../frontend/src/pages/student/personal-journey-timeline.js'
import {
  PERSONAL_JOURNEY_AMBIENT_COLORS,
  PERSONAL_JOURNEY_GALAXY_CORE_STOPS,
  PERSONAL_JOURNEY_SIGNAL_PALETTE,
  personalJourneyAmbientColor,
  resolvePersonalJourneyOwnLabel,
} from '../../frontend/src/pages/student/personal-journey-renderer.js'

const VIEWPORT = { width: 390, height: 844 }

function hero(phase: string, progress: number, timeMs = 0, reduced = false) {
  return resolvePersonalJourneyFrame({
    phase,
    progress,
    timeMs,
    reduced,
    ...VIEWPORT,
  }).hero
}

function expectSamePose(first: ReturnType<typeof hero>, second: ReturnType<typeof hero>) {
  expect(second.x).toBeCloseTo(first.x, 8)
  expect(second.y).toBeCloseTo(first.y, 8)
  expect(second.scale).toBeCloseTo(first.scale, 8)
  expect(second.opacity).toBeCloseTo(first.opacity, 8)
}

describe('D-030 personal journey renderer timeline', () => {
  it('uses the cross-surface Orbital Signal palette for the mobile atmosphere', () => {
    expect(PERSONAL_JOURNEY_SIGNAL_PALETTE).toEqual({
      midnight: '#01030a',
      deep: '#07101f',
      signal: '#427eee',
      signalSoft: '#7eb0ff',
      cyan: '#4adbe9',
      star: '#eef4ff',
      warm: '#ffd79a',
    })
  })

  it('freezes the gold-reference durations and deterministic layer density', () => {
    expect(PERSONAL_JOURNEY_DURATIONS).toEqual({
      discovery: 5_400,
      confirm: 1_000,
      handoff: 4_200,
    })
    expect(PERSONAL_JOURNEY_PARTICLE_COUNTS).toEqual({
      farStars: 150,
      discoveryMotes: 78,
      orbitDust: 156,
    })
    expect(PERSONAL_JOURNEY_AMBIENT_CYCLE_MS).toBe(240_000)
  })

  it('keeps one hero-star pose across every phase boundary', () => {
    expectSamePose(
      hero(PERSONAL_JOURNEY_PHASES.DISCOVERY, 1),
      hero(PERSONAL_JOURNEY_PHASES.SELECTION, 1),
    )
    expectSamePose(
      hero(PERSONAL_JOURNEY_PHASES.CONFIRM, 1),
      hero(PERSONAL_JOURNEY_PHASES.MESSAGE, 1),
    )
    expectSamePose(
      hero(PERSONAL_JOURNEY_PHASES.MESSAGE, 1),
      hero(PERSONAL_JOURNEY_PHASES.HANDOFF, 0),
    )
    expectSamePose(
      hero(PERSONAL_JOURNEY_PHASES.HANDOFF, 1),
      hero(PERSONAL_JOURNEY_PHASES.ORBIT, 1, PERSONAL_JOURNEY_DURATIONS.handoff),
    )
  })

  it('turns animated phases into their useful static endpoint for reduced motion', () => {
    expectSamePose(
      hero(PERSONAL_JOURNEY_PHASES.DISCOVERY, 0, 0, true),
      hero(PERSONAL_JOURNEY_PHASES.DISCOVERY, 1),
    )
    expectSamePose(
      hero(PERSONAL_JOURNEY_PHASES.HANDOFF, 0, 0, true),
      hero(PERSONAL_JOURNEY_PHASES.HANDOFF, 1),
    )
  })

  it('keeps the settled galaxy moving while reduced motion stays at one static orbit pose', () => {
    const start = resolvePersonalJourneyFrame({
      phase: PERSONAL_JOURNEY_PHASES.ORBIT,
      progress: 1,
      timeMs: PERSONAL_JOURNEY_DURATIONS.handoff,
      ...VIEWPORT,
    })
    const later = resolvePersonalJourneyFrame({
      phase: PERSONAL_JOURNEY_PHASES.ORBIT,
      progress: 1,
      timeMs: PERSONAL_JOURNEY_DURATIONS.handoff + 10_000,
      ...VIEWPORT,
    })
    expect(later.field.rotationDegrees).not.toBeCloseTo(start.field.rotationDegrees, 6)
    expect(Math.hypot(later.hero.x - start.hero.x, later.hero.y - start.hero.y)).toBeGreaterThan(2)

    const reducedStart = resolvePersonalJourneyFrame({
      phase: PERSONAL_JOURNEY_PHASES.ORBIT,
      progress: 1,
      timeMs: PERSONAL_JOURNEY_DURATIONS.handoff,
      reduced: true,
      ...VIEWPORT,
    })
    const reducedLater = resolvePersonalJourneyFrame({
      phase: PERSONAL_JOURNEY_PHASES.ORBIT,
      progress: 1,
      timeMs: PERSONAL_JOURNEY_DURATIONS.handoff + 60_000,
      reduced: true,
      ...VIEWPORT,
    })
    expect(reducedLater.field).toEqual(reducedStart.field)
    expectSamePose(reducedStart.hero, reducedLater.hero)
  })

  it('uses a deterministic restrained palette and a center-out brightness falloff', () => {
    const firstPass = Array.from(
      { length: PERSONAL_JOURNEY_PARTICLE_COUNTS.orbitDust },
      (_, index) => personalJourneyAmbientColor(index, 71),
    )
    const secondPass = Array.from(
      { length: PERSONAL_JOURNEY_PARTICLE_COUNTS.orbitDust },
      (_, index) => personalJourneyAmbientColor(index, 71),
    )
    expect(secondPass).toEqual(firstPass)
    expect(new Set(firstPass).size).toBeGreaterThanOrEqual(4)
    expect(firstPass.every((color) => PERSONAL_JOURNEY_AMBIENT_COLORS.includes(color))).toBe(true)

    const offsets = PERSONAL_JOURNEY_GALAXY_CORE_STOPS.map(({ offset }) => offset)
    const alphas = PERSONAL_JOURNEY_GALAXY_CORE_STOPS.map(({ alpha }) => alpha)
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    expect(alphas[0]).toBeGreaterThan(alphas[Math.floor(alphas.length / 2)])
    expect(alphas.at(-1)).toBe(0)
    for (let index = 1; index < alphas.length; index += 1) {
      expect(alphas[index]).toBeLessThanOrEqual(alphas[index - 1])
    }
  })

  it('places the public star number directly below the moving personal star', () => {
    const frame = resolvePersonalJourneyFrame({
      phase: PERSONAL_JOURNEY_PHASES.ORBIT,
      progress: 1,
      timeMs: PERSONAL_JOURNEY_DURATIONS.handoff + 8_000,
      ...VIEWPORT,
    })
    const label = resolvePersonalJourneyOwnLabel({
      ownStar: { label: 'L-4821' },
      frame,
      starRadius: 3,
      height: VIEWPORT.height,
    })
    expect(label?.text).toBe('L-4821')
    expect(label?.x).toBeCloseTo(frame.hero.x, 8)
    expect(label?.y).toBeGreaterThan(frame.hero.y)
    expect((label?.y ?? 0) - frame.hero.y).toBeLessThanOrEqual(18)
  })
})
