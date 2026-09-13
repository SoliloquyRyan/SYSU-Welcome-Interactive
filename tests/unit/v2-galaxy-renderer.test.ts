import { describe, expect, it } from 'vitest'

import {
  ACTIVE_RENDER_TARGET_FPS,
  arrivalMeteorPlacement,
  assemblyDensityEnvelope,
  blendedStarPlacement,
  DECORATIVE_STAR_COUNT,
  decorativeStarPlacement,
  flowingStarPlacement,
  FORMAL_VISUAL_REFERENCE_COUNT,
  galaxyFormationCoordinates,
  programStarAlpha,
  programStarPlacement,
  SCREEN_SIGNAL_PALETTE,
  STAR_ARRIVAL_MS,
  stellarCollapseStarPlacement,
  stellarCollapseStarVisibility,
  starPlacement,
  starSpectralPalette,
  supernovaTransitionEnvelope,
  TECHNICAL_STAR_CAPACITY,
} from '../../frontend/src/pages/screen/galaxy-renderer.js'
import { supernovaRenderDimensions } from '../../frontend/src/pages/screen/stellar-collapse-renderer.js'

describe('V2-07 deterministic public galaxy placement', () => {
  it('targets one paint per 60 Hz display refresh instead of the old 30 fps cap', () => {
    expect(ACTIVE_RENDER_TARGET_FPS).toBe(60)
  })

  it('treats 220 as the formal visual reference while preserving 300 as technical headroom', () => {
    expect(FORMAL_VISUAL_REFERENCE_COUNT).toBe(220)
    expect(TECHNICAL_STAR_CAPACITY).toBe(300)

    const empty = assemblyDensityEnvelope(0, 10_000, false)
    const partial = assemblyDensityEnvelope(120, 10_000, false)
    const formalFull = assemblyDensityEnvelope(220, 10_000, false)
    const stressFull = assemblyDensityEnvelope(300, 10_000, false)
    const reduced = assemblyDensityEnvelope(40, 10_000, true)

    expect(empty.ambientGain).toBeCloseTo(1.18)
    expect(empty.participantGain).toBeCloseTo(1.08)
    expect(partial.ambientGain).toBeGreaterThan(1)
    expect(partial.ambientGain).toBeLessThan(empty.ambientGain)
    expect(formalFull.ambientGain).toBe(1)
    expect(formalFull.participantGain).toBe(1)
    expect(stressFull.ambientGain).toBe(1)
    expect(reduced.diskBreath).toBe(1)
    expect(reduced.coreBreath).toBe(1)
    expect(reduced.diskScale).toBe(1)
    expect(assemblyDensityEnvelope(40, 0, false).diskBreath)
      .not.toBe(assemblyDensityEnvelope(40, 12_000, false).diskBreath)

    const acceptanceBands = [0, 40, 80, 120, 160, 220]
      .map((count) => assemblyDensityEnvelope(count, 10_000, false).ambientGain)
    for (let index = 1; index < acceptanceBands.length; index += 1) {
      expect(acceptanceBands[index]).toBeLessThan(acceptanceBands[index - 1])
    }
  })

  it('shares the mobile Orbital Signal spectrum without replacing participant star colours', () => {
    expect(SCREEN_SIGNAL_PALETTE).toEqual({
      midnight: '#01030a',
      deep: '#07101f',
      signal: '#427eee',
      signalSoft: '#7eb0ff',
      cyan: '#4adbe9',
      star: '#eef4ff',
      warm: '#ffd79a',
    })
  })

  it('keeps the supernova post-process sharp at Full HD while bounding 4K GPU work', () => {
    expect(supernovaRenderDimensions(1920, 1080)).toEqual({ width: 1280, height: 720 })
    expect(supernovaRenderDimensions(3840, 2160)).toEqual({ width: 1280, height: 720 })
    expect(supernovaRenderDimensions(1280, 720)).toEqual({ width: 1280, height: 720 })
  })

  it('uses only the opaque formation slot and survives snapshot reordering', () => {
    const first = starPlacement({ formationSlot: 'slot:opaque-042' }, 1920, 1080)
    const sameSlotDifferentProjection = starPlacement({
      formationSlot: 'slot:opaque-042',
      publicStarId: 'SHOULD-NOT-AFFECT-PLACEMENT',
      displayColor: '#FFFFFF',
    }, 1920, 1080)
    expect(sameSlotDifferentProjection).toEqual(first)
    expect(starPlacement({ formationSlot: 'slot:opaque-043' }, 1920, 1080)).not.toEqual(first)
  })

  it('keeps every calculated point inside the visible canvas', () => {
    for (let index = 0; index < 300; index += 1) {
      const point = starPlacement({ formationSlot: `slot:synthetic-${index}` }, 1920, 1080)
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(1920)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(1080)
      expect(point.radius).toBeGreaterThan(0)
    }
  })

  it('builds a disk-dominant Milky-Way field with only weak arm-density accents', () => {
    const profiles = new Map<string, number>()
    const radii = []
    const barPoints = []
    for (let index = 0; index < FORMAL_VISUAL_REFERENCE_COUNT; index += 1) {
      const star = { formationSlot: `slot:synthetic-${index}` }
      const formation = galaxyFormationCoordinates(star)
      profiles.set(formation.profile, (profiles.get(formation.profile) ?? 0) + 1)
      radii.push(starPlacement(star, 1920, 1080).radius)
      if (formation.profile === 'bar') barPoints.push(formation)
    }

    expect(profiles.get('bulge')).toBeGreaterThanOrEqual(18)
    expect(profiles.get('bulge')).toBeLessThanOrEqual(32)
    expect(profiles.get('bar')).toBeGreaterThanOrEqual(12)
    expect(profiles.get('bar')).toBeLessThanOrEqual(26)
    expect(profiles.get('disk')).toBeGreaterThanOrEqual(125)
    expect(profiles.get('disk')).toBeLessThanOrEqual(155)
    expect(profiles.get('main-arm')).toBeGreaterThanOrEqual(22)
    expect(profiles.get('main-arm')).toBeLessThanOrEqual(40)
    expect(profiles.get('secondary-arm')).toBeGreaterThanOrEqual(5)
    expect(profiles.get('secondary-arm')).toBeLessThanOrEqual(12)
    expect(profiles.get('disk')).toBeGreaterThan(
      ((profiles.get('main-arm') ?? 0) + (profiles.get('secondary-arm') ?? 0)) * 2,
    )
    expect(Math.max(...barPoints.map((point) => Math.abs(point.x)))).toBeGreaterThan(0.26)
    expect(
      barPoints.reduce((total, point) => total + Math.abs(point.y), 0) / barPoints.length,
    ).toBeLessThan(0.04)

    // D-073: actual participants need a visible core on a projector, while
    // the size ceiling and varied distribution prevent oversized uniform dots.
    expect(Math.min(...radii)).toBeGreaterThan(1)
    expect(Math.max(...radii)).toBeLessThan(3)
    expect(radii.filter((radius) => radius > 2).length).toBeGreaterThan(30)
    expect(radii.filter((radius) => radius > 2).length).toBeLessThan(150)
  })

  it('keeps a bounded neutral base galaxy moving before any participant arrives', () => {
    expect(DECORATIVE_STAR_COUNT).toBe(420)
    const displacements = []
    let structuredPoints = 0
    let diskPoints = 0
    for (let index = 0; index < DECORATIVE_STAR_COUNT; index += 1) {
      const first = decorativeStarPlacement(index, 1920, 1080, 10_000)
      const repeated = decorativeStarPlacement(index, 1920, 1080, 10_000)
      const next = decorativeStarPlacement(index, 1920, 1080, 10_250)
      expect(repeated).toEqual(first)
      expect(first.radius).toBeGreaterThanOrEqual(0.26)
      expect(first.radius).toBeLessThanOrEqual(0.95)
      expect(first.alpha).toBeGreaterThanOrEqual(0.13)
      expect(first.alpha).toBeLessThanOrEqual(0.45)
      if (first.profile === 'disk') diskPoints += 1
      else structuredPoints += 1
      displacements.push(Math.hypot(next.x - first.x, next.y - first.y))
    }
    displacements.sort((left, right) => left - right)
    expect(diskPoints).toBeGreaterThan(220)
    expect(diskPoints).toBeLessThan(260)
    expect(structuredPoints).toBeGreaterThan(150)
    expect(structuredPoints).toBeLessThan(200)
    expect(displacements[210]).toBeGreaterThan(3)
    expect(displacements.filter((distance) => distance > 1).length).toBeGreaterThan(350)
  })

  it('sends each realtime arrival along one deterministic off-screen meteor path', () => {
    expect(STAR_ARRIVAL_MS).toBe(1550)
    for (let index = 0; index < 300; index += 1) {
      const star = { formationSlot: `slot:synthetic-${index}` }
      const opening = arrivalMeteorPlacement(star, 1920, 1080, 0, 1_000)
      const midpoint = arrivalMeteorPlacement(star, 1920, 1080, 0.5, 1_000)
      const nearLanding = arrivalMeteorPlacement(star, 1920, 1080, 0.98, 1_000)
      const landing = arrivalMeteorPlacement(star, 1920, 1080, 1, 1_000)
      expect(
        opening.start.x < 0
          || opening.start.x > 1920
          || opening.start.y < 0
          || opening.start.y > 1080,
      ).toBe(true)
      expect(opening.head).toEqual(opening.start)
      expect(midpoint.head).not.toEqual(opening.head)
      expect(landing.head.x).toBeCloseTo(landing.target.x, 8)
      expect(landing.head.y).toBeCloseTo(landing.target.y, 8)
      expect(opening.headAlpha).toBe(0)
      expect(midpoint.headAlpha).toBeGreaterThan(0.9)
      expect(landing.headAlpha).toBe(0)
      expect(landing.landing).toBe(1)
      const meteorVector = {
        x: landing.head.x - nearLanding.head.x,
        y: landing.head.y - nearLanding.head.y,
      }
      const orbitVector = {
        x: landing.target.x - landing.orbitTail.x,
        y: landing.target.y - landing.orbitTail.y,
      }
      const alignment = (meteorVector.x * orbitVector.x + meteorVector.y * orbitVector.y)
        / Math.max(0.001, Math.hypot(meteorVector.x, meteorVector.y) * Math.hypot(orbitVector.x, orbitVector.y))
      expect(alignment).toBeGreaterThan(0.9)
    }
  })

  it('keeps decorative stars on their exact live positions when collapse begins', () => {
    const timestamp = 12_345
    for (const index of [0, 47, 159, 319, 419]) {
      const star = { formationSlot: `decorative:${index}` }
      const live = decorativeStarPlacement(index, 1920, 1080, timestamp)
      expect(stellarCollapseStarPlacement(
        star,
        1920,
        1080,
        0,
        timestamp,
        live,
      )).toEqual(live)
    }
  })

  it('keeps admitted stars in a deterministic, bounded assembly flow', () => {
    const star = { formationSlot: 'slot:opaque-042' }
    const staticPoint = starPlacement(star, 1920, 1080)
    const firstFlowFrame = flowingStarPlacement(star, 1920, 1080, 3200)
    const secondFlowFrame = flowingStarPlacement(star, 1920, 1080, 6400)

    expect(flowingStarPlacement(star, 1920, 1080, 0)).toEqual(staticPoint)
    expect(flowingStarPlacement(star, 1920, 1080, 3200)).toEqual(firstFlowFrame)
    expect(Math.hypot(
      firstFlowFrame.x - staticPoint.x,
      firstFlowFrame.y - staticPoint.y,
    )).toBeGreaterThan(1)
    expect(Math.hypot(
      secondFlowFrame.x - firstFlowFrame.x,
      secondFlowFrame.y - firstFlowFrame.y,
    )).toBeGreaterThan(1)

    const displacements = []
    for (let index = 0; index < 300; index += 1) {
      const syntheticStar = { formationSlot: `slot:synthetic-${index}` }
      const initialPoint = starPlacement(syntheticStar, 1920, 1080)
      const point = flowingStarPlacement(syntheticStar, 1920, 1080, 3200)
      displacements.push(Math.hypot(point.x - initialPoint.x, point.y - initialPoint.y))
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(1920)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(1080)
    }
    displacements.sort((left, right) => left - right)
    expect(displacements[150]).toBeGreaterThan(15)
    expect(displacements[299]).toBeGreaterThan(50)
  })

  it('moves visibly from the first quarter-second in the counter-clockwise trailing-arm direction', () => {
    const center = { x: 1920 * 0.56, y: 1080 * 0.44 }
    const displacements = []
    const crossProducts = []
    for (let index = 0; index < 300; index += 1) {
      const star = { formationSlot: `slot:synthetic-${index}` }
      const first = flowingStarPlacement(star, 1920, 1080, 10_000)
      const next = flowingStarPlacement(star, 1920, 1080, 10_250)
      displacements.push(Math.hypot(next.x - first.x, next.y - first.y))
      crossProducts.push(
        (first.x - center.x) * (next.y - first.y)
          - (first.y - center.y) * (next.x - first.x),
      )
    }
    displacements.sort((left, right) => left - right)

    expect(displacements[150]).toBeGreaterThan(2.1)
    expect(displacements.filter((distance) => distance > 1).length).toBeGreaterThan(240)
    // With a downward-positive Canvas y axis, negative cross products are
    // counter-clockwise on the display.
    expect(crossProducts.every((crossProduct) => crossProduct < 0)).toBe(true)
  })

  it('preserves each public star color without turning the galaxy into neutral beads', () => {
    const warm = starSpectralPalette('#ff7656')
    const cool = starSpectralPalette('#a9ccff')

    expect(warm.core).not.toBe(cool.core)
    expect(warm.halo).not.toBe(cool.halo)
    expect(warm.trail).not.toBe(cool.trail)
    const channels = (color: string) => color.match(/[\d.]+/gu)!.map(Number)
    const [wr, , wb] = channels(warm.core)
    const [cr, , cb] = channels(cool.core)
    // A distinct warm/cool core must survive the near-white optical glint.
    expect(wr - wb).toBeGreaterThan(80)
    expect(cb - cr).toBeGreaterThan(45)
    expect(channels(warm.halo)[0] - channels(warm.halo)[2]).toBeGreaterThan(100)
    expect(channels(cool.halo)[2] - channels(cool.halo)[0]).toBeGreaterThan(50)
    expect(starSpectralPalette('invalid').core).toBe('#eef4ff')
  })

  it('routes all 300 stars through deterministic edge bands before the transparent program endpoint', () => {
    const width = 1920
    const height = 1080
    for (let index = 0; index < 300; index += 1) {
      const point = programStarPlacement({ formationSlot: `slot:synthetic-${index}` }, width, height)
      expect(point.x <= width * 0.165 || point.x >= width * 0.835).toBe(true)
      expect(point.y).toBeGreaterThanOrEqual(height * 0.06)
      expect(point.y).toBeLessThanOrEqual(height * 0.94)
      expect(point.radius).toBeGreaterThan(0)
    }
  })

  it('fades the Canvas completely out at the program-support endpoint', () => {
    expect(programStarAlpha(0)).toBe(1)
    expect(programStarAlpha(0.5)).toBe(0.5)
    expect(programStarAlpha(1)).toBe(0)
    expect(programStarAlpha(2)).toBe(0)
  })

  it('interpolates continuously between assembly and program-support endpoints', () => {
    const star = { formationSlot: 'slot:opaque-042' }
    const assembly = starPlacement(star, 1920, 1080)
    const program = programStarPlacement(star, 1920, 1080)
    const midpoint = blendedStarPlacement(star, 1920, 1080, 0.5)

    expect(blendedStarPlacement(star, 1920, 1080, 0)).toEqual(assembly)
    expect(blendedStarPlacement(star, 1920, 1080, 1)).toEqual({
      ...program,
      phase: assembly.phase,
    })
    expect(midpoint.x).toBeCloseTo((assembly.x + program.x) / 2)
    expect(midpoint.y).toBeCloseTo((assembly.y + program.y) / 2)
    expect(midpoint.radius).toBeCloseTo((assembly.radius + program.radius) / 2)
  })

  it('converges every star through a curved path into the true screen centre', () => {
    const star = { formationSlot: 'slot:opaque-042' }
    const assembly = starPlacement(star, 1920, 1080)
    const collapseMidpoint = stellarCollapseStarPlacement(star, 1920, 1080, 0.5)
    const linearMidpoint = blendedStarPlacement(star, 1920, 1080, 0.5)

    expect(stellarCollapseStarPlacement(star, 1920, 1080, 0)).toEqual(assembly)
    expect(stellarCollapseStarPlacement(star, 1920, 1080, 1)).toEqual({
      x: 1920 * 0.5,
      y: 1080 * 0.48,
      radius: assembly.radius * 0.05,
      phase: assembly.phase,
    })
    expect(Math.hypot(
      collapseMidpoint.x - linearMidpoint.x,
      collapseMidpoint.y - linearMidpoint.y,
    )).toBeGreaterThan(5)
  })

  it('continues every live assembly-flow position and velocity at transition start', () => {
    const timestamp = 12345
    const frameMs = 16
    const durationMs = 8400
    for (let index = 0; index < 300; index += 1) {
      const star = { formationSlot: `slot:synthetic-${index}` }
      const previous = flowingStarPlacement(star, 1920, 1080, timestamp - frameMs)
      const current = flowingStarPlacement(star, 1920, 1080, timestamp)
      const transitionStart = stellarCollapseStarPlacement(star, 1920, 1080, 0, timestamp)
      const transitionNext = stellarCollapseStarPlacement(
        star,
        1920,
        1080,
        frameMs / durationMs,
        timestamp + frameMs,
      )
      expect(transitionStart).toEqual(current)
      expect(Math.hypot(
        (transitionNext.x - transitionStart.x) - (current.x - previous.x),
        (transitionNext.y - transitionStart.y) - (current.y - previous.y),
      )).toBeLessThan(0.01)
    }
  })

  it('stagger-collapses real and decorative slots without changing the endpoint', () => {
    const center = { x: 1920 * 0.5, y: 1080 * 0.48 }
    const collapseRatios = []
    for (let index = 0; index < 300; index += 1) {
      const star = { formationSlot: `slot:synthetic-${index}` }
      const opening = stellarCollapseStarPlacement(star, 1920, 1080, 0)
      const midpoint = stellarCollapseStarPlacement(star, 1920, 1080, 0.52)
      const openingDistance = Math.max(1, Math.hypot(
        opening.x - 1920 * 0.56,
        opening.y - 1080 * 0.44,
      ))
      collapseRatios.push(Math.hypot(
        midpoint.x - center.x,
        midpoint.y - center.y,
      ) / openingDistance)
    }
    expect(Math.max(...collapseRatios) - Math.min(...collapseRatios)).toBeGreaterThan(0.08)
  })

  it('keeps every collapse path on-screen and merges stars into the ignition core', () => {
    for (let index = 0; index < 300; index += 1) {
      const star = { formationSlot: `slot:synthetic-${index}` }
      for (const progress of [0, 0.2, 0.4, 0.56, 0.64, 0.8, 1]) {
        const point = stellarCollapseStarPlacement(star, 1920, 1080, progress)
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThanOrEqual(1920)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeLessThanOrEqual(1080)
      }
    }

    expect(stellarCollapseStarVisibility(0.5)).toBe(1)
    expect(stellarCollapseStarVisibility(0.6)).toBeGreaterThan(0.8)
    expect(stellarCollapseStarVisibility(0.65)).toBeGreaterThan(0)
    expect(stellarCollapseStarVisibility(0.73)).toBe(0)
    expect(stellarCollapseStarVisibility(1)).toBe(0)
  })

  it('choreographs one overlapping collapse, ignition, blast, exposure, and reveal', () => {
    const opening = supernovaTransitionEnvelope(0)
    const premonition = supernovaTransitionEnvelope(0.08)
    const converging = supernovaTransitionEnvelope(0.3)
    const compressing = supernovaTransitionEnvelope(0.55)
    const ignition = supernovaTransitionEnvelope(0.62)
    const exploding = supernovaTransitionEnvelope(0.7)
    const whiteField = supernovaTransitionEnvelope(0.82)
    const revealing = supernovaTransitionEnvelope(0.92)
    const settled = supernovaTransitionEnvelope(1)

    expect(opening).toMatchObject({
      entryFeather: 0,
      convergence: 0,
      collapse: 0,
      compression: 0,
      core: 0,
      ignition: 0,
      blast: 0,
      shockFront: 0,
      shockVisibility: 0,
      plasma: 0,
      exposure: 0,
      screenWash: 0,
      reveal: 0,
    })
    expect(premonition.entryFeather).toBeGreaterThan(0)
    expect(premonition.convergence).toBe(0)
    expect(converging.convergence).toBeGreaterThan(0.2)
    expect(converging.compression).toBe(0)
    expect(compressing.convergence).toBeGreaterThan(0.9)
    expect(compressing.compression).toBeGreaterThan(0)
    expect(compressing.core).toBeGreaterThan(0)
    expect(compressing.blast).toBe(0)
    expect(ignition.compression).toBeGreaterThan(0.8)
    expect(ignition.ignition).toBeGreaterThan(0.3)
    expect(exploding.blast).toBeGreaterThan(0.15)
    expect(exploding.shockVisibility).toBeGreaterThan(0.5)
    expect(exploding.exposure).toBeGreaterThan(0)
    expect(whiteField.blast).toBeGreaterThan(0.9)
    expect(whiteField.exposure).toBeGreaterThan(0.85)
    expect(whiteField.screenWash).toBeGreaterThan(0.8)
    expect(whiteField.reveal).toBeGreaterThan(0)
    expect(revealing.reveal).toBeGreaterThan(0.7)
    expect(revealing.exposure).toBeGreaterThan(0)
    expect(settled).toMatchObject({
      convergence: 1,
      compression: 1,
      core: 0,
      ignition: 0,
      blast: 1,
      shockFront: 1,
      shockVisibility: 0,
      plasma: 0,
      exposure: 0,
      reveal: 1,
      residue: 0,
    })

    const monotonicKeys = ['entryFeather', 'convergence', 'compression', 'blast', 'reveal'] as const
    for (const key of monotonicKeys) {
      const samples = Array.from(
        { length: 101 },
        (_, index) => supernovaTransitionEnvelope(index / 100)[key],
      )
      for (let index = 1; index < samples.length; index += 1) {
        expect(samples[index]).toBeGreaterThanOrEqual(samples[index - 1])
      }
    }

    for (const progress of [0.6, 0.64, 0.68, 0.72, 0.76, 0.8, 0.84]) {
      const envelope = supernovaTransitionEnvelope(progress)
      expect(Math.max(
        envelope.core,
        envelope.ignition,
        envelope.blast,
        envelope.exposure,
      )).toBeGreaterThan(0.3)
    }

    const exposureSamples = [0.65, 0.7, 0.78, 0.84, 0.9, 0.96, 0.99, 1]
      .map((progress) => supernovaTransitionEnvelope(progress).exposure)
    expect(exposureSamples[0]).toBe(0)
    expect(exposureSamples[1]).toBeGreaterThan(exposureSamples[0])
    expect(exposureSamples[2]).toBeGreaterThan(exposureSamples[1])
    expect(exposureSamples[4]).toBeLessThan(exposureSamples[3])
    expect(exposureSamples[5]).toBeLessThan(exposureSamples[4])
    expect(exposureSamples[6]).toBeLessThan(exposureSamples[5])
    expect(exposureSamples[7]).toBe(0)

    // Sample the final 1.85 seconds at roughly 120 Hz. Every visible field
    // reaches an exact endpoint without a one-frame boundary jump.
    const boundaryKeys = [
      'core',
      'ignition',
      'shockVisibility',
      'plasma',
      'exposure',
      'reveal',
      'residue',
    ] as const
    let previous = supernovaTransitionEnvelope(0.78)
    for (let index = 1; index <= 220; index += 1) {
      const current = supernovaTransitionEnvelope(0.78 + index / 1000)
      for (const key of boundaryKeys) {
        expect(Math.abs(current[key] - previous[key])).toBeLessThan(0.035)
      }
      previous = current
    }
  })
})
