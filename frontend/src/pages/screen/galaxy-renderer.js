import { createStellarCollapseRenderer } from './stellar-collapse-renderer'
import { ORBITAL_SIGNAL_PALETTE } from '../../styles/orbital-signal'

function hash(value) {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

function unit(seed, shift) {
  return ((seed >>> shift) & 0xffff) / 0xffff
}

const TAU = Math.PI * 2
const DEFAULT_TRANSITION_MS = 1800
export const FORMAL_VISUAL_REFERENCE_COUNT = 220
export const TECHNICAL_STAR_CAPACITY = 300
export const DECORATIVE_STAR_COUNT = 420
export const STAR_ARRIVAL_MS = 1550
export const ACTIVE_RENDER_TARGET_FPS = 60
export const SCREEN_SIGNAL_PALETTE = ORBITAL_SIGNAL_PALETTE
const AMBIENT_RENDER_TARGET_FPS = 30
const ACTIVE_FRAME_INTERVAL_MS = 1000 / ACTIVE_RENDER_TARGET_FPS
const FRAME_DEADLINE_TOLERANCE_MS = 1.5
// Canvas uses a downward-positive y axis, so a negative angle reads as a
// counter-clockwise orbit on screen.  The stellar material deliberately
// outruns the slower disk-density pattern: if both layers share one angular velocity,
// the galaxy reads as a static decal even though every coordinate changes.
const ASSEMBLY_FLOW_RADIANS_PER_MS = -TAU / 84000
const GALAXY_PATTERN_RADIANS_PER_MS = -TAU / 238000
const GALAXY_CENTER_X = 0.56
const GALAXY_CENTER_Y = 0.44
const GALAXY_ROTATION = -0.08
const GALAXY_AXIS_X = 0.32
const GALAXY_AXIS_Y = 0.34

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value))
}

function mix(from, to, progress) {
  return from + (to - from) * progress
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - ((-2 * progress + 2) ** 3) / 2
}

function smoothstep(progress) {
  const value = clamp(progress)
  return value * value * (3 - 2 * value)
}

function smootherstep(progress) {
  const value = clamp(progress)
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value * value * value * (value * (value * 6 - 15) + 10)
}

export function assemblyDensityEnvelope(participantCount, timestamp = 0, reduced = false) {
  const normalizedCount = clamp(
    Number.isFinite(participantCount) ? participantCount / FORMAL_VISUAL_REFERENCE_COUNT : 0,
  )
  const occupancy = smoothstep(normalizedCount)
  const shortfall = 1 - occupancy
  const diskBreath = reduced
    ? 1
    : 1
      + Math.sin(timestamp / 9800) * 0.018
      + Math.sin(timestamp / 17300 + 1.37) * 0.008
  const coreBreath = reduced
    ? 1
    : 1
      + Math.sin(timestamp / 12100 + 0.91) * 0.012
      + Math.sin(timestamp / 6100 + 2.18) * 0.005

  return {
    occupancy,
    ambientGain: 1 + shortfall * 0.18,
    participantGain: 1 + shortfall * 0.08,
    diskBreath,
    coreBreath,
    diskScale: reduced ? 1 : 1 + (diskBreath - 1) * 0.22,
  }
}

function cubicBezierPoint(start, controlA, controlB, end, progress) {
  const value = clamp(progress)
  const inverse = 1 - value
  return {
    x: inverse ** 3 * start.x
      + 3 * inverse ** 2 * value * controlA.x
      + 3 * inverse * value ** 2 * controlB.x
      + value ** 3 * end.x,
    y: inverse ** 3 * start.y
      + 3 * inverse ** 2 * value * controlA.y
      + 3 * inverse * value ** 2 * controlB.y
      + value ** 3 * end.y,
  }
}

function numericNoise(x, y, seed) {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 69069)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = smoothstep(x - x0)
  const ty = smoothstep(y - y0)
  const top = mix(numericNoise(x0, y0, seed), numericNoise(x0 + 1, y0, seed), tx)
  const bottom = mix(numericNoise(x0, y0 + 1, seed), numericNoise(x0 + 1, y0 + 1, seed), tx)
  return mix(top, bottom, ty)
}

function fractalNoise(x, y, seed) {
  let amplitude = 0.58
  let frequency = 1
  let total = 0
  let normalization = 0
  for (let octave = 0; octave < 4; octave += 1) {
    total += valueNoise(x * frequency, y * frequency, seed + octave * 37) * amplitude
    normalization += amplitude
    amplitude *= 0.49
    frequency *= 2.07
  }
  return total / normalization
}

function organicRadiusAt(angle, phase = 0, roughness = 1) {
  const contour = Math.sin(angle * 3 + phase) * 0.052
    + Math.sin(angle * 5 - phase * 1.37) * 0.028
    + Math.sin(angle * 9 + phase * 0.61) * 0.016
    + Math.sin(angle * 17 - phase * 0.29) * 0.008
  const directionalPull = Math.cos(angle - 0.68) * 0.026
  return clamp(1 + contour * roughness + directionalPull, 0.78, 1.22)
}

function traceOrganicLoop(context, radius, phase, roughness = 1) {
  const samples = 112
  context.beginPath()
  for (let index = 0; index <= samples; index += 1) {
    const angle = (index / samples) * TAU
    const localRadius = radius * organicRadiusAt(angle, phase, roughness)
    const x = Math.cos(angle) * localRadius
    const y = Math.sin(angle) * localRadius
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.closePath()
}

function drawImageCover(context, image, width, height) {
  const imageRatio = image.naturalWidth / Math.max(1, image.naturalHeight)
  const targetRatio = width / Math.max(1, height)
  let sourceX = 0
  let sourceY = 0
  let sourceWidth = image.naturalWidth
  let sourceHeight = image.naturalHeight

  if (imageRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio
    sourceX = (image.naturalWidth - sourceWidth) * 0.54
  } else {
    sourceHeight = image.naturalWidth / targetRatio
    sourceY = (image.naturalHeight - sourceHeight) * 0.46
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)
}

function rotatePoint(x, y, angle) {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return {
    x: x * cosine - y * sine,
    y: x * sine + y * cosine,
  }
}

function angularDistance(left, right) {
  return Math.atan2(Math.sin(left - right), Math.cos(left - right))
}

function rgbString(channels) {
  return `rgb(${channels.map((channel) => Math.round(channel)).join(' ')})`
}

function rgbaString(channels, alpha) {
  return `rgba(${channels.map((channel) => Math.round(channel)).join(', ')}, ${alpha})`
}

export function starSpectralPalette(color) {
  const match = /^#([0-9a-f]{6})$/iu.exec(color ?? '')
  if (!match) {
    return {
      core: SCREEN_SIGNAL_PALETTE.star,
      halo: 'rgba(176, 203, 238, 0.14)',
      haloFade: 'rgba(176, 203, 238, 0)',
      aureole: 'rgba(126, 176, 255, 0.065)',
      trail: '#e5efff',
      glint: '#fbfdff',
    }
  }
  const value = Number.parseInt(match[1], 16)
  const source = [
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]
  const blend = (neutral, amount) => source.map((channel, index) => mix(channel, neutral[index], amount))
  return {
    // Real stellar images expose toward white in the compact PSF core.  The
    // participant colour remains legible in the much thinner halo instead of
    // filling a saturated, bead-like disk.
    core: rgbString(blend([252, 253, 251], 0.72)),
    halo: rgbaString(blend([211, 222, 229], 0.55), 0.14),
    haloFade: rgbaString(blend([211, 222, 229], 0.55), 0),
    aureole: rgbaString(blend([184, 202, 214], 0.42), 0.065),
    trail: rgbString(blend([232, 238, 240], 0.7)),
    glint: rgbString(blend([255, 255, 252], 0.93)),
  }
}

export function galaxyFormationCoordinates(star) {
  const slot = star.formationSlot
  const radialSeed = hash(`${slot}:assembly-radius`)
  const angleSeed = hash(`${slot}:assembly-angle`)
  const armSeed = hash(`${slot}:assembly-arm`)
  const profileSeed = hash(`${slot}:assembly-profile`)
  const scatterSeed = hash(`${slot}:assembly-scatter`)
  const profile = unit(profileSeed, 0)

  if (profile < 0.12) {
    const radial = Math.pow(unit(radialSeed, 0), 1.85) * 0.17
    const angle = unit(angleSeed, 0) * TAU
    return {
      x: Math.cos(angle) * radial,
      y: Math.sin(angle) * radial * 0.72,
      profile: 'bulge',
    }
  }

  if (profile < 0.22) {
    const longitudinal = (unit(radialSeed, 0) * 2 - 1) * 0.3
    const edge = clamp(1 - Math.abs(longitudinal) / 0.3)
    const thickness = 0.038 + Math.pow(edge, 0.68) * 0.05
    const vertical = (unit(angleSeed, 0) + unit(scatterSeed, 0) - 1) * thickness
    return {
      x: longitudinal,
      y: vertical + Math.sin((longitudinal / 0.3) * Math.PI) * 0.009,
      profile: 'bar',
    }
  }

  if (profile < 0.83) {
    // Most visible points live in a broad stellar disk. Two very weak density
    // waves modulate the radius without arranging the disk into graphic arms.
    const angle = unit(angleSeed, 0) * TAU
    const radialBase = 0.15 + Math.pow(unit(radialSeed, 0), 0.72) * 0.83
    const wave = Math.sin(angle * 2 - radialBase * Math.PI * 1.18 + unit(armSeed, 8) * 0.7)
    const radial = radialBase * (1 + wave * 0.022 + (unit(scatterSeed, 8) - 0.5) * 0.038)
    return {
      x: Math.cos(angle) * radial,
      y: Math.sin(angle) * radial,
      profile: 'disk',
    }
  }

  const secondary = unit(hash(`${slot}:assembly-branch`), 0) > 0.84
  const arm = armSeed % 2
  const start = secondary ? 0.42 : 0.28
  const end = secondary ? 0.9 : 1
  // These broad populations are density-wave accents inside the disk rather
  // than exposed S-shaped rails. Scatter deliberately outweighs curvature.
  const progress = Math.pow(unit(radialSeed, 0), secondary ? 1.02 : 1.08)
  let radial = start + progress * (end - start)
  const crossArmScatter = (
    unit(angleSeed, 0) + unit(scatterSeed, 0) - 1
  ) * (0.07 + radial * (secondary ? 0.105 : 0.125))
  const angle = arm * Math.PI
    + (secondary ? Math.PI * 0.46 : 0.04)
    + progress * Math.PI * (secondary ? 0.32 : 0.42)
    + crossArmScatter
  radial *= 1 + (unit(scatterSeed, 8) - 0.5) * (secondary ? 0.07 : 0.085)

  return {
    x: Math.cos(angle) * radial,
    y: Math.sin(angle) * radial,
    profile: secondary ? 'secondary-arm' : 'main-arm',
  }
}

export function starPlacement(star, width, height) {
  const slot = star.formationSlot
  const sizeSeed = hash(`${slot}:assembly-size`)
  const formation = galaxyFormationCoordinates(star)

  const local = rotatePoint(
    formation.x * width * GALAXY_AXIS_X,
    formation.y * height * GALAXY_AXIS_Y,
    GALAXY_ROTATION,
  )
  const luminance = unit(sizeSeed, 0)
  return {
    x: width * GALAXY_CENTER_X + local.x,
    y: height * GALAXY_CENTER_Y + local.y,
    radius: 0.42 + Math.pow(luminance, 4.6) * 1.78,
    phase: unit(hash(`${slot}:assembly-phase`), 0) * TAU,
  }
}

export function flowingStarPlacement(star, width, height, timestamp = 0) {
  const base = starPlacement(star, width, height)
  if (timestamp <= 0) return base

  const centerX = width * GALAXY_CENTER_X
  const centerY = height * GALAXY_CENTER_Y
  const local = rotatePoint(base.x - centerX, base.y - centerY, -GALAXY_ROTATION)
  const normalizedX = local.x / Math.max(1, width * GALAXY_AXIS_X)
  const normalizedY = local.y / Math.max(1, height * GALAXY_AXIS_Y)
  const radial = Math.hypot(normalizedX, normalizedY)
  const baseAngle = Math.atan2(normalizedY, normalizedX)
  const flowSeed = hash(`${star.formationSlot}:assembly-flow`)
  const flowPeriod = 21000 + unit(flowSeed, 0) * 15000
  const flowPhase = unit(flowSeed, 8) * TAU
  const commonRotation = timestamp * ASSEMBLY_FLOW_RADIANS_PER_MS
  const localShear = (
    Math.sin((timestamp / flowPeriod) * TAU + flowPhase) - Math.sin(flowPhase)
  ) * (0.01 + (1 - clamp(radial)) * 0.018 + unit(flowSeed, 4) * 0.004)
  const radialBreathing = 1 + (
    Math.sin((timestamp / (flowPeriod * 0.82)) * TAU + flowPhase * 1.37)
      - Math.sin(flowPhase * 1.37)
  ) * 0.004
  const angle = baseAngle + commonRotation + localShear
  const flowingLocal = rotatePoint(
    Math.cos(angle) * radial * width * GALAXY_AXIS_X * radialBreathing,
    Math.sin(angle) * radial * height * GALAXY_AXIS_Y * radialBreathing,
    GALAXY_ROTATION,
  )

  return {
    x: centerX + flowingLocal.x,
    y: centerY + flowingLocal.y,
    radius: base.radius,
    phase: base.phase,
  }
}

export function decorativeStarPlacement(index, width, height, timestamp = 0) {
  const star = { formationSlot: `decorative:${index}` }
  const point = flowingStarPlacement(star, width, height, timestamp)
  const materialSeed = hash(`${star.formationSlot}:material`)
  const flux = unit(materialSeed, 0)
  return {
    ...point,
    radius: 0.26 + Math.pow(flux, 5.6) * 0.68,
    alpha: 0.13 + Math.pow(flux, 1.8) * 0.31,
    warmth: unit(materialSeed, 8),
    profile: galaxyFormationCoordinates(star).profile,
  }
}

export function arrivalMeteorPlacement(star, width, height, progress, arrivalTimestamp = 0) {
  const value = clamp(progress)
  const landingTimestamp = arrivalTimestamp + STAR_ARRIVAL_MS
  const target = flowingStarPlacement(star, width, height, landingTimestamp)
  const previous = flowingStarPlacement(star, width, height, Math.max(0, landingTimestamp - 120))
  const orbitTail = flowingStarPlacement(star, width, height, Math.max(0, landingTimestamp - 220))
  const velocityX = target.x - previous.x
  const velocityY = target.y - previous.y
  const velocityLength = Math.max(0.001, Math.hypot(velocityX, velocityY))
  const direction = {
    x: velocityX / velocityLength,
    y: velocityY / velocityLength,
  }
  const seed = hash(`${star.formationSlot}:arrival-meteor`)
  const margin = Math.max(width, height) * 0.045
  const horizontalDistance = direction.x >= 0
    ? (target.x + margin) / Math.max(0.001, direction.x)
    : (width + margin - target.x) / Math.max(0.001, -direction.x)
  const verticalDistance = direction.y >= 0
    ? (target.y + margin) / Math.max(0.001, direction.y)
    : (height + margin - target.y) / Math.max(0.001, -direction.y)
  const firstBoundary = Math.min(horizontalDistance, verticalDistance)
  const distance = clamp(
    firstBoundary + margin,
    Math.min(width, height) * 0.68,
    Math.max(width, height) * 1.12,
  )
  const normal = { x: -direction.y, y: direction.x }
  const bend = (unit(seed, 8) - 0.5) * Math.min(width, height) * 0.18
  const start = {
    x: target.x - direction.x * distance,
    y: target.y - direction.y * distance,
  }
  const controlA = {
    x: start.x + direction.x * distance * 0.34 + normal.x * bend,
    y: start.y + direction.y * distance * 0.34 + normal.y * bend,
  }
  const controlB = {
    x: target.x - direction.x * distance * 0.19 + normal.x * bend * 0.36,
    y: target.y - direction.y * distance * 0.19 + normal.y * bend * 0.36,
  }
  // Keep a little forward velocity at both ends. The streak fades instead of
  // visibly braking before the real participant star is deposited.
  const travel = clamp(value + Math.sin(value * Math.PI) * 0.075)
  const tailTravel = clamp(travel - mix(0.105, 0.17, unit(seed, 16)))
  return {
    start,
    target,
    head: cubicBezierPoint(start, controlA, controlB, target, travel),
    tail: cubicBezierPoint(start, controlA, controlB, target, tailTravel),
    orbitTail,
    headAlpha: smoothstep(value / 0.075) * (1 - smootherstep((value - 0.82) / 0.18)),
    trailAlpha: smoothstep(value / 0.045) * (1 - smoothstep((value - 0.9) / 0.1)),
    landing: smootherstep((value - 0.67) / 0.3),
    captureAlpha: smoothstep((value - 0.62) / 0.14) * (1 - smootherstep((value - 0.91) / 0.09)),
  }
}

export function programStarPlacement(star, width, height) {
  const slot = star.formationSlot
  const sideSeed = hash(`${slot}:program-side`)
  const xSeed = hash(`${slot}:program-x`)
  const ySeed = hash(`${slot}:program-y`)
  const radiusSeed = hash(`${slot}:program-radius`)
  const onLeft = (sideSeed & 1) === 0
  const inset = 0.035 + unit(xSeed, 0) * 0.13

  return {
    x: width * (onLeft ? inset : 1 - inset),
    y: height * (0.06 + unit(ySeed, 0) * 0.88),
    radius: 1 + unit(radiusSeed, 0) * 1.8,
    phase: unit(sideSeed, 4) * TAU,
  }
}

export function blendedStarPlacement(star, width, height, edgeMix, timestamp = 0) {
  const progress = clamp(edgeMix)
  const assembly = flowingStarPlacement(star, width, height, timestamp)
  const program = programStarPlacement(star, width, height)

  return {
    x: mix(assembly.x, program.x, progress),
    y: mix(assembly.y, program.y, progress),
    radius: mix(assembly.radius, program.radius, progress),
    phase: assembly.phase,
  }
}

export function programStarAlpha(edgeMix) {
  return 1 - clamp(edgeMix)
}

export function stellarCollapseStarVisibility(progress) {
  return clamp(1 - smootherstep((clamp(progress) - 0.57) / 0.16))
}

export function supernovaTransitionEnvelope(progress) {
  const value = clamp(progress)
  // Every layer has a wide overlap and zero-slope boundary. The shot therefore
  // reads as one evolving physical event: premonition, infall, compression,
  // ignition, asymmetric blast, exposure, then the transparent destination.
  const entryFeather = smootherstep(value / 0.167)
  const convergence = value >= 1 ? 1 : smootherstep((value - 0.095) / 0.477)
  const compression = value >= 1 ? 1 : smootherstep((value - 0.476) / 0.19)
  const core = compression * (1 - smootherstep((value - 0.675) / 0.16))
  const ignitionIn = smootherstep((value - 0.585) / 0.075)
  const ignitionTail = value >= 1 ? 0 : 1 - smootherstep((value - 0.84) / 0.16)
  const ignition = ignitionIn * ignitionTail
  const blast = value >= 1 ? 1 : smootherstep((value - 0.619) / 0.226)
  const shockIn = smootherstep((value - 0.61) / 0.065)
  const shockOut = value >= 1 ? 0 : 1 - smootherstep((value - 0.88) / 0.12)
  const shockVisibility = shockIn * shockOut
  const exposureIn = smootherstep((value - 0.655) / 0.205)
  const exposureOut = value >= 1 ? 0 : 1 - smootherstep((value - 0.865) / 0.135)
  const exposure = exposureIn * exposureOut
  const reveal = value >= 1 ? 1 : smootherstep((value - 0.774) / 0.226)
  const residue = value >= 1 ? 0 : 1 - smootherstep((value - 0.79) / 0.21)

  return {
    entryFeather,
    convergence,
    collapse: convergence,
    compression,
    core,
    ignition,
    blast,
    shockFront: blast,
    shockVisibility,
    plasma: blast * shockOut,
    exposure,
    screenWash: smootherstep((exposure - 0.58) / 0.42),
    reveal,
    residue,
  }
}

export function stellarCollapseStarPlacement(
  star,
  width,
  height,
  progress,
  timestamp = 0,
  initialPlacement = null,
) {
  const value = clamp(progress)
  const assembly = initialPlacement ?? flowingStarPlacement(star, width, height, timestamp)
  if (value <= 0) return assembly

  const envelope = supernovaTransitionEnvelope(value)
  const targetMix = smootherstep((value - 0.06) / 0.44)
  const centerX = width * mix(GALAXY_CENTER_X, 0.5, targetMix)
  const centerY = height * mix(GALAXY_CENTER_Y, 0.48, targetMix)
  if (value >= 1) {
    return { x: centerX, y: centerY, radius: assembly.radius * 0.05, phase: assembly.phase }
  }

  const sourceCenterX = width * GALAXY_CENTER_X
  const sourceCenterY = height * GALAXY_CENTER_Y
  const normalizedX = (assembly.x - sourceCenterX) / Math.max(1, width * 0.42)
  const normalizedY = (assembly.y - sourceCenterY) / Math.max(1, height * 0.39)
  const radial = Math.hypot(normalizedX, normalizedY)
  const angle = Math.atan2(normalizedY, normalizedX)
  const depthSeed = hash(`${star.formationSlot}:collapse-depth`)
  const depth = 0.38 + unit(depthSeed, 0) * 0.74
  const arrivalDelay = (unit(depthSeed, 8) - 0.5) * 0.07
  const arrivalDuration = 0.49 + unit(depthSeed, 12) * 0.065
  const localCollapse = smootherstep((value - (0.075 + arrivalDelay)) / arrivalDuration)
  const compression = envelope.compression * smootherstep(localCollapse)
  const angularShear = localCollapse * (1.04 + depth * 1.28)
    + compression * (1.15 + depth * 1.62)
  const radialScale = Math.exp(
    -localCollapse * (1.24 + depth * 0.42)
    -compression * (3.1 + depth * 1.18),
  )
  const breathing = 1 + Math.sin(localCollapse * Math.PI) * (0.018 + depth * 0.011)

  return {
    x: centerX + Math.cos(angle - angularShear) * radial * width * 0.42 * radialScale,
    y: centerY + Math.sin(angle - angularShear) * radial * height * 0.39 * radialScale,
    radius: assembly.radius * breathing * mix(1, 0.34, compression),
    phase: assembly.phase,
  }
}

export function createGalaxyRenderer(canvas, options = {}) {
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw new Error('2D canvas context is unavailable')
  canvas.dataset.galaxyStructure = 'milky-way-low-inclination-disk'
  canvas.dataset.decorativeStars = String(DECORATIVE_STAR_COUNT)
  canvas.dataset.visualReferenceStars = String(FORMAL_VISUAL_REFERENCE_COUNT)
  canvas.dataset.densitySystem = 'unresolved-disk-light'
  canvas.dataset.arrivalStyle = 'offscreen-meteor-orbital-capture'
  canvas.dataset.activeArrivalMeteors = '0'
  canvas.dataset.renderTargetFps = String(AMBIENT_RENDER_TARGET_FPS)
  canvas.dataset.renderCadence = 'ambient-30hz'

  let stars = []
  let mode = 'ASSEMBLY'
  let reduced = Boolean(options.reduced)
  let running = false
  let frame = 0
  let nextPaintAt = 0
  let width = 1
  let height = 1
  let dpr = 1
  let edgeMix = 0
  let cooperativeMix = 0
  let transition = null
  let orbitGuidePath = null
  let galaxyDustTexture = null
  let transitionBackdropTexture = null
  let cinematicBackdropImage = null
  let cinematicBackdropTexture = null
  let stellarCollapseRenderer = null
  let destroyed = false
  const arrivals = new Map()
  const spectralPalettes = new Map()

  function starRenderPalette(star) {
    const source = star.displayColor ?? '#e5eaec'
    if (!spectralPalettes.has(source)) spectralPalettes.set(source, starSpectralPalette(source))
    return spectralPalettes.get(source)
  }

  function syncArrivalDiagnostics() {
    canvas.dataset.activeArrivalMeteors = String(arrivals.size)
  }

  function targetRenderFps() {
    if (
      reduced
      || document.hidden
      || (!transition && arrivals.size === 0 && mode === 'PROGRAM_SUPPORT')
    ) return 0
    return transition || arrivals.size > 0
      ? ACTIVE_RENDER_TARGET_FPS
      : AMBIENT_RENDER_TARGET_FPS
  }

  function syncRenderDiagnostics() {
    const targetFps = targetRenderFps()
    canvas.dataset.renderTargetFps = String(targetFps)
    canvas.dataset.galaxyBreath = reduced
      ? 'reduced-static'
      : mode === 'PROGRAM_SUPPORT' && !transition
        ? 'idle'
        : 'ambient-multiphase'
    canvas.dataset.renderCadence = targetFps === ACTIVE_RENDER_TARGET_FPS
      ? 'cinematic-vsync'
      : targetFps === AMBIENT_RENDER_TARGET_FPS
        ? 'ambient-30hz'
        : 'idle'
  }

  function loadCinematicBackdrop(url) {
    if (!url || typeof window.Image !== 'function') return
    const image = new window.Image()
    image.decoding = 'async'
    image.addEventListener('load', () => {
      if (destroyed) return
      cinematicBackdropImage = image
      rebuildCinematicBackdropTexture()
      paint(performance.now())
      updateLoop()
    }, { once: true })
    image.src = url
  }

  function targetsFor(nextMode) {
    return {
      edge: nextMode === 'PROGRAM_SUPPORT' ? 1 : 0,
      cooperative: nextMode === 'COOPERATIVE_LIGHT' ? 1 : 0,
    }
  }

  function snapToMode() {
    const targets = targetsFor(mode)
    edgeMix = targets.edge
    cooperativeMix = targets.cooperative
    transition = null
  }

  function updateSceneMix(timestamp) {
    if (!transition) {
      return {
        progress: 1,
        timestamp,
        durationMs: 0,
        energy: 0,
        charge: 0,
        direction: 0,
        openingProgram: false,
        visibility: programStarAlpha(edgeMix),
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
        residue: 0,
      }
    }

    const activeTransition = transition
    const progress = clamp((timestamp - activeTransition.startedAt) / activeTransition.durationMs)
    const openingProgram = activeTransition.fromMode === 'ASSEMBLY'
      && activeTransition.toMode === 'PROGRAM_SUPPORT'
    const travelProgress = openingProgram
      ? smoothstep((progress - 0.3) / 0.62)
      : easeInOutCubic(progress)
    const eased = travelProgress
    edgeMix = mix(activeTransition.fromEdge, activeTransition.toEdge, eased)
    cooperativeMix = mix(activeTransition.fromCooperative, activeTransition.toCooperative, eased)

    let visibility = programStarAlpha(edgeMix)
    let charge = 0
    let energy = Math.sin(progress * Math.PI)
    let cinematicEnvelope = {
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
      residue: 0,
    }
    if (openingProgram) {
      cinematicEnvelope = supernovaTransitionEnvelope(progress)
      charge = cinematicEnvelope.convergence * (1 - cinematicEnvelope.compression * 0.72)
      visibility = stellarCollapseStarVisibility(progress)
      energy = Math.max(
        cinematicEnvelope.convergence * 0.36,
        cinematicEnvelope.ignition,
        cinematicEnvelope.blast,
      )
    }

    if (progress >= 1) {
      edgeMix = activeTransition.toEdge
      cooperativeMix = activeTransition.toCooperative
      transition = null
      visibility = programStarAlpha(edgeMix)
    }

    return {
      progress,
      timestamp,
      durationMs: activeTransition.durationMs,
      energy,
      charge,
      direction: Math.sign(activeTransition.toEdge - activeTransition.fromEdge),
      openingProgram,
      visibility,
      ...cinematicEnvelope,
    }
  }

  function rebuildGalaxyDustTexture() {
    if (galaxyDustTexture) return
    const textureSize = 420
    const texture = document.createElement('canvas')
    texture.width = textureSize
    texture.height = textureSize
    const textureContext = texture.getContext('2d')
    if (!textureContext) return
    const image = textureContext.createImageData(textureSize, textureSize)

    for (let y = 0; y < textureSize; y += 1) {
      const normalizedY = (y / (textureSize - 1) - 0.5) * 2.16
      for (let x = 0; x < textureSize; x += 1) {
        const normalizedX = (x / (textureSize - 1) - 0.5) * 2.16
        const radial = Math.hypot(normalizedX, normalizedY)
        if (radial > 1.08) continue

        const angle = Math.atan2(normalizedY, normalizedX)
        const mainProgress = clamp((radial - 0.28) / 0.72)
        const secondaryProgress = clamp((radial - 0.42) / 0.48)
        const mainAngle = 0.04 + mainProgress * Math.PI * 0.42
        const secondaryAngle = Math.PI * 0.46 + secondaryProgress * Math.PI * 0.32
        const mainDelta = Math.min(
          Math.abs(angularDistance(angle, mainAngle)),
          Math.abs(angularDistance(angle, mainAngle + Math.PI)),
        )
        const secondaryDelta = Math.min(
          Math.abs(angularDistance(angle, secondaryAngle)),
          Math.abs(angularDistance(angle, secondaryAngle + Math.PI)),
        )
        const mainWindow = smoothstep((radial - 0.24) / 0.13)
          * (1 - smoothstep((radial - 0.98) / 0.1))
        const secondaryWindow = smoothstep((radial - 0.38) / 0.14)
          * (1 - smoothstep((radial - 0.9) / 0.1))
        const mainWidth = 0.17 + radial * 0.055
        const mainArm = Math.exp(-(mainDelta ** 2) / (2 * mainWidth ** 2)) * mainWindow
        const secondaryArm = Math.exp(-(secondaryDelta ** 2) / (2 * 0.185 ** 2)) * secondaryWindow
        const bar = Math.exp(-((normalizedY / 0.125) ** 2))
          * Math.exp(-((Math.abs(normalizedX) / 0.36) ** 4))
        const bulge = Math.exp(-((radial / 0.17) ** 2))
        const disk = Math.exp(-radial * 1.82) * (1 - smoothstep((radial - 0.98) / 0.12))
        const dustLane = Math.exp(-(((mainDelta - 0.14) / 0.055) ** 2)) * mainWindow
        const u = x / (textureSize - 1)
        const v = y / (textureSize - 1)
        const cloud = fractalNoise(u * 5.4 + radial * 0.7, v * 5.4 - radial * 0.46, 677)
        const filaments = valueNoise(u * 23 - normalizedY * 1.3, v * 19 + normalizedX * 1.1, 719)
        const breakup = smoothstep((cloud * 0.73 + filaments * 0.27 - 0.47) / 0.3)
        const armBreakup = Math.pow(breakup, 1.72)
        const unresolvedDisk = disk * (0.2 + Math.pow(cloud * 0.62 + filaments * 0.38, 1.85) * 0.8)
        const density = Math.max(
          0,
          bulge * 0.66 * (0.5 + breakup * 0.5)
            + bar * 0.25 * (0.22 + breakup * 0.78)
            + unresolvedDisk * 0.42
            + mainArm * 0.22 * armBreakup
            + secondaryArm * 0.065 * armBreakup
            - dustLane * 0.085,
        )
        const warmth = clamp(bulge * 0.72 + bar * 0.36)
        const cool = [94, 137, 198]
        const warm = [211, 207, 194]
        const grain = (numericNoise(x, y, 751) - 0.5) * 5
        const index = (y * textureSize + x) * 4
        for (let channel = 0; channel < 3; channel += 1) {
          image.data[index + channel] = clamp(mix(cool[channel], warm[channel], warmth) + grain, 0, 255)
        }
        image.data[index + 3] = Math.round(clamp(density * 0.255, 0, 0.25) * 255)
      }
    }
    textureContext.putImageData(image, 0, 0)

    const softened = document.createElement('canvas')
    softened.width = textureSize
    softened.height = textureSize
    const softenedContext = softened.getContext('2d')
    if (!softenedContext) {
      galaxyDustTexture = texture
      return
    }
    softenedContext.filter = 'blur(1.4px)'
    softenedContext.drawImage(texture, 0, 0)
    softenedContext.filter = 'none'
    softenedContext.globalAlpha = 0.55
    softenedContext.drawImage(texture, 0, 0)
    galaxyDustTexture = softened
  }

  function rebuildOrbitGuidePath() {
    const main = new Path2D()
    const secondary = new Path2D()
    const bar = new Path2D()
    for (let arm = 0; arm < 2; arm += 1) {
      for (let index = 0; index <= 84; index += 1) {
        const progress = index / 84
        const radial = 0.28 + progress * 0.72
        const angle = arm * Math.PI + 0.04 + progress * Math.PI * 0.42
        const x = Math.cos(angle) * width * GALAXY_AXIS_X * radial
        const y = Math.sin(angle) * height * GALAXY_AXIS_Y * radial
        if (index === 0) main.moveTo(x, y)
        else main.lineTo(x, y)
      }
      for (let index = 0; index <= 58; index += 1) {
        const progress = index / 58
        const radial = 0.42 + progress * 0.48
        const angle = arm * Math.PI + Math.PI * 0.46 + progress * Math.PI * 0.32
        const x = Math.cos(angle) * width * GALAXY_AXIS_X * radial
        const y = Math.sin(angle) * height * GALAXY_AXIS_Y * radial
        if (index === 0) secondary.moveTo(x, y)
        else secondary.lineTo(x, y)
      }
    }
    bar.moveTo(-width * GALAXY_AXIS_X * 0.3, 0)
    bar.bezierCurveTo(
      -width * GALAXY_AXIS_X * 0.12,
      -height * GALAXY_AXIS_Y * 0.012,
      width * GALAXY_AXIS_X * 0.12,
      height * GALAXY_AXIS_Y * 0.012,
      width * GALAXY_AXIS_X * 0.3,
      0,
    )
    orbitGuidePath = { main, secondary, bar }
    rebuildGalaxyDustTexture()
  }

  function rebuildTransitionTextures() {
    const backdrop = document.createElement('canvas')
    backdrop.width = Math.max(320, Math.min(640, Math.ceil(width / 3)))
    backdrop.height = Math.max(180, Math.round(backdrop.width * height / width))
    const backdropContext = backdrop.getContext('2d')
    if (!backdropContext) {
      transitionBackdropTexture = null
      return
    }

    const pixels = backdropContext.createImageData(backdrop.width, backdrop.height)
    for (let y = 0; y < backdrop.height; y += 1) {
      const v = y / Math.max(1, backdrop.height - 1)
      for (let x = 0; x < backdrop.width; x += 1) {
        const u = x / Math.max(1, backdrop.width - 1)
        const warp = fractalNoise(u * 2.25, v * 2.25, 19)
        const cloud = fractalNoise(u * 3.2 + warp * 0.92, v * 3.2 - warp * 0.54, 47)
        const detail = fractalNoise(u * 8.4 - warp * 0.7, v * 8.4 + warp * 0.45, 83)
        const broadFalloff = 1 - smoothstep((Math.hypot((u - 0.57) / 0.78, (v - 0.44) / 0.82) - 0.18) / 0.9)
        const filament = Math.pow(clamp((cloud * 0.68 + detail * 0.32 - 0.34) / 0.5), 1.72)
        const ridge = Math.pow(1 - Math.abs(detail * 2 - 1), 4.6) * cloud
        const laneCenter = 0.43 + (u - 0.5) * 0.12 + (warp - 0.5) * 0.12
        const dustLane = Math.exp(-((v - laneCenter) ** 2) / 0.0038) * (0.18 + cloud * 0.34)
        const density = clamp((filament * 0.82 + ridge * 0.28) * broadFalloff - dustLane)
        const warm = Math.pow(clamp(1 - Math.hypot((u - 0.78) / 0.42, (v - 0.18) / 0.46)), 2)
        const cool = Math.pow(clamp(1 - Math.hypot((u - 0.2) / 0.52, (v - 0.72) / 0.5)), 2)
        const edge = 1 - smoothstep((Math.hypot((u - 0.52) / 0.78, (v - 0.48) / 0.76) - 0.48) / 0.58)
        const grain = (numericNoise(x, y, 131) - 0.5) * 2.2
        const index = (y * backdrop.width + x) * 4
        pixels.data[index] = clamp(2.4 + density * 20 + warm * 5.4 + cool * 1.2 + grain, 0, 255)
        pixels.data[index + 1] = clamp(5.4 + density * 31 + warm * 2.6 + cool * 5.8 + grain, 0, 255)
        pixels.data[index + 2] = clamp(13.2 + density * 46 + cool * 14.6 + grain, 0, 255)
        pixels.data[index] *= 0.66 + edge * 0.34
        pixels.data[index + 1] *= 0.66 + edge * 0.34
        pixels.data[index + 2] *= 0.66 + edge * 0.34
        pixels.data[index + 3] = 255
      }
    }
    backdropContext.putImageData(pixels, 0, 0)
    transitionBackdropTexture = backdrop

  }

  function rebuildCinematicBackdropTexture() {
    cinematicBackdropTexture = null
    if (!cinematicBackdropImage || width < 2 || height < 2) return
    const texture = document.createElement('canvas')
    texture.width = Math.max(2, Math.round(width))
    texture.height = Math.max(2, Math.round(height))
    const textureContext = texture.getContext('2d', { alpha: false })
    if (!textureContext) return
    textureContext.fillStyle = SCREEN_SIGNAL_PALETTE.midnight
    textureContext.fillRect(0, 0, texture.width, texture.height)
    textureContext.filter = 'brightness(0.74) contrast(1.21) saturate(0.58)'
    drawImageCover(textureContext, cinematicBackdropImage, texture.width, texture.height)
    textureContext.filter = 'none'
    textureContext.globalCompositeOperation = 'screen'
    const signalWash = textureContext.createRadialGradient(
      texture.width * 0.58,
      texture.height * 0.44,
      0,
      texture.width * 0.58,
      texture.height * 0.44,
      Math.max(texture.width, texture.height) * 0.74,
    )
    signalWash.addColorStop(0, 'rgba(66, 126, 238, 0.105)')
    signalWash.addColorStop(0.38, 'rgba(30, 75, 154, 0.052)')
    signalWash.addColorStop(0.72, 'rgba(7, 16, 31, 0.02)')
    signalWash.addColorStop(1, 'rgba(1, 3, 10, 0)')
    textureContext.fillStyle = signalWash
    textureContext.fillRect(0, 0, texture.width, texture.height)
    const cyanWash = textureContext.createRadialGradient(
      texture.width * 0.82,
      texture.height * 0.15,
      0,
      texture.width * 0.82,
      texture.height * 0.15,
      Math.max(texture.width, texture.height) * 0.42,
    )
    cyanWash.addColorStop(0, 'rgba(74, 219, 233, 0.045)')
    cyanWash.addColorStop(1, 'rgba(74, 219, 233, 0)')
    textureContext.fillStyle = cyanWash
    textureContext.fillRect(0, 0, texture.width, texture.height)
    if (transitionBackdropTexture) {
      textureContext.globalCompositeOperation = 'soft-light'
      textureContext.globalAlpha = 0.18
      textureContext.drawImage(
        transitionBackdropTexture,
        0,
        0,
        texture.width,
        texture.height,
      )
    }
    textureContext.globalAlpha = 1
    textureContext.globalCompositeOperation = 'source-over'
    cinematicBackdropTexture = texture
  }

  function drawOrbitGuides(timestamp, densityState) {
    const visibility = reduced ? 0.072 : 0.082
    if (!orbitGuidePath || edgeMix >= 0.98 || visibility <= 0) return
    const patternRotation = GALAXY_ROTATION + (
      reduced ? 0 : timestamp * GALAXY_PATTERN_RADIANS_PER_MS
    )
    const ambientAlpha = (1 - edgeMix) * densityState.ambientGain
    const diskScale = densityState.diskScale

    if (galaxyDustTexture) {
      context.save()
      context.translate(width * GALAXY_CENTER_X, height * GALAXY_CENTER_Y)
      context.rotate(patternRotation)
      context.globalCompositeOperation = 'screen'
      context.globalAlpha = ambientAlpha
        * (reduced ? 0.57 : 0.7)
        * densityState.diskBreath
      context.imageSmoothingEnabled = true
      context.drawImage(
        galaxyDustTexture,
        -width * GALAXY_AXIS_X * 1.08 * diskScale,
        -height * GALAXY_AXIS_Y * 1.08 * diskScale,
        width * GALAXY_AXIS_X * 2.16 * diskScale,
        height * GALAXY_AXIS_Y * 2.16 * diskScale,
      )
      context.restore()
    }

    context.save()
    context.translate(width * GALAXY_CENTER_X, height * GALAXY_CENTER_Y)
    context.rotate(patternRotation)
    context.scale(diskScale, diskScale)
    context.globalCompositeOperation = 'screen'
    context.lineCap = 'round'
    context.filter = 'blur(13px)'
    context.strokeStyle = '#5d7fbe'
    context.lineWidth = 58
    context.globalAlpha = visibility * 0.18 * ambientAlpha * densityState.diskBreath
    context.stroke(orbitGuidePath.main)
    context.lineWidth = 38
    context.globalAlpha = visibility * 0.055 * ambientAlpha * densityState.diskBreath
    context.stroke(orbitGuidePath.secondary)
    context.strokeStyle = '#69b8c9'
    context.lineWidth = 34
    context.globalAlpha = visibility * 0.12 * ambientAlpha * densityState.coreBreath
    context.stroke(orbitGuidePath.bar)
    context.restore()

    context.save()
    context.translate(width * GALAXY_CENTER_X, height * GALAXY_CENTER_Y)
    context.rotate(patternRotation)
    context.scale(
      width * GALAXY_AXIS_X * 0.34 * densityState.coreBreath,
      height * GALAXY_AXIS_Y * 0.13 * densityState.coreBreath,
    )
    const barGlow = context.createRadialGradient(0, 0, 0, 0, 0, 1)
    barGlow.addColorStop(0, 'rgba(200, 222, 255, 0.132)')
    barGlow.addColorStop(0.38, 'rgba(91, 151, 224, 0.074)')
    barGlow.addColorStop(1, 'rgba(38, 78, 132, 0)')
    context.globalCompositeOperation = 'screen'
    context.globalAlpha = ambientAlpha * (reduced ? 0.62 : 0.76)
    context.fillStyle = barGlow
    context.beginPath()
    context.arc(0, 0, 1, 0, TAU)
    context.fill()
    context.restore()

    context.save()
    context.translate(width * GALAXY_CENTER_X, height * GALAXY_CENTER_Y)
    context.rotate(patternRotation)
    context.scale(1.12, 0.82)
    const coreRadius = Math.min(width, height) * 0.082 * densityState.coreBreath
    const core = context.createRadialGradient(0, 0, 0, 0, 0, coreRadius)
    core.addColorStop(0, 'rgba(238, 244, 255, 0.17)')
    core.addColorStop(0.18, 'rgba(155, 188, 234, 0.092)')
    core.addColorStop(0.52, 'rgba(74, 140, 199, 0.041)')
    core.addColorStop(1, 'rgba(37, 71, 119, 0)')
    context.globalCompositeOperation = 'screen'
    context.globalAlpha = ambientAlpha * (reduced ? 0.68 : 0.84)
    context.fillStyle = core
    context.beginPath()
    context.arc(0, 0, coreRadius, 0, TAU)
    context.fill()
    context.restore()
  }

  function collapseGeometry(transitionState) {
    const centerMix = smootherstep((transitionState.progress - 0.06) / 0.44)
    return {
      centerX: width * mix(GALAXY_CENTER_X, 0.5, centerMix),
      centerY: height * mix(GALAXY_CENTER_Y, 0.48, centerMix),
      rotation: GALAXY_ROTATION - transitionState.convergence * 0.12,
      phase: 0.37 + transitionState.blast * 1.18,
    }
  }

  function drawTransitionBackdrop(transitionState) {
    const sceneAlpha = transitionState.openingProgram ? 1 : programStarAlpha(edgeMix)
    if (sceneAlpha <= 0.001) return
    context.save()
    context.globalCompositeOperation = 'source-over'
    context.globalAlpha = sceneAlpha
    context.imageSmoothingEnabled = true
    context.fillStyle = SCREEN_SIGNAL_PALETTE.midnight
    context.fillRect(0, 0, width, height)

    if (transitionState.openingProgram && transitionState.convergence > 0.001) {
      const geometry = collapseGeometry(transitionState)
      const scale = 1 + transitionState.convergence * 0.026
        + transitionState.compression * 0.018
      context.translate(geometry.centerX, geometry.centerY)
      context.rotate(-transitionState.convergence * 0.012)
      context.scale(scale, scale)
      context.translate(-geometry.centerX, -geometry.centerY)
    }

    if (cinematicBackdropTexture) {
      context.drawImage(cinematicBackdropTexture, 0, 0, width, height)
    } else if (cinematicBackdropImage) {
      drawImageCover(context, cinematicBackdropImage, width, height)
    } else if (transitionBackdropTexture) {
      context.drawImage(transitionBackdropTexture, 0, 0, width, height)
    }
    context.restore()
  }

  function drawCollapseField(transitionState) {
    if (
      !transitionState.openingProgram
      || Math.max(transitionState.entryFeather, transitionState.convergence) <= 0.001
    ) return
    const geometry = collapseGeometry(transitionState)
    const reach = Math.max(width, height) * 0.82
    const field = context.createRadialGradient(
      geometry.centerX,
      geometry.centerY,
      Math.min(width, height) * 0.025,
      geometry.centerX,
      geometry.centerY,
      reach,
    )
    field.addColorStop(0, 'rgba(7, 16, 31, 0)')
    field.addColorStop(0.24, 'rgba(2, 8, 20, 0.025)')
    field.addColorStop(0.62, 'rgba(1, 5, 15, 0.19)')
    field.addColorStop(1, 'rgba(0, 1, 7, 0.58)')

    context.save()
    context.globalCompositeOperation = 'source-over'
    context.fillStyle = field
    context.globalAlpha = transitionState.entryFeather * 0.055
      + transitionState.convergence * 0.34
      + transitionState.compression * 0.24
    context.fillRect(0, 0, width, height)
    context.restore()
  }

  function ensureStellarCollapseRenderer() {
    if (stellarCollapseRenderer || reduced) return stellarCollapseRenderer
    canvas.dataset.supernovaEngine = 'initializing'
    stellarCollapseRenderer = createStellarCollapseRenderer({
      maxLongEdge: 1280,
      onStatus(status) {
        canvas.dataset.supernovaEngine = status.engine
        if (status.reason) canvas.dataset.supernovaFallbackReason = status.reason
        else delete canvas.dataset.supernovaFallbackReason
      },
    })
    return stellarCollapseRenderer
  }

  function applyStellarCollapsePostprocess(transitionState, timestamp) {
    if (
      !transitionState.openingProgram
      || Math.max(
        transitionState.convergence,
        transitionState.compression,
        transitionState.ignition,
        transitionState.blast,
        transitionState.exposure,
      ) <= 0.001
    ) return false
    const renderer = ensureStellarCollapseRenderer()
    if (!renderer?.available) return false
    const geometry = collapseGeometry(transitionState)
    const processedFrame = renderer.render(canvas, {
      centerX: geometry.centerX / Math.max(1, width),
      centerY: geometry.centerY / Math.max(1, height),
      collapse: transitionState.convergence,
      compression: transitionState.compression,
      ignition: transitionState.ignition,
      blast: transitionState.blast,
      shockVisibility: transitionState.shockVisibility,
      exposure: transitionState.exposure,
      time: timestamp / 1000,
    })
    if (!processedFrame) return false
    canvas.dataset.supernovaEngine = 'webgl2-supernova-postprocess'
    delete canvas.dataset.supernovaFallbackReason

    context.save()
    context.globalAlpha = 1
    context.globalCompositeOperation = 'copy'
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(processedFrame, 0, 0, width, height)
    context.restore()
    return true
  }

  function drawSupernovaLobes(transitionState, geometry) {
    if (transitionState.plasma <= 0.001) return
    const maxDimension = Math.max(width, height)
    const lobeRadius = maxDimension * mix(
      0.025,
      0.54,
      Math.pow(transitionState.shockFront, 0.72),
    )
    const alpha = transitionState.plasma
      * (1 - transitionState.reveal * 0.68)

    context.save()
    context.translate(geometry.centerX, geometry.centerY)
    context.rotate(0.34 - transitionState.shockFront * 0.055)
    context.scale(1, 0.255)
    context.globalCompositeOperation = 'screen'
    const primary = context.createRadialGradient(0, 0, 0, 0, 0, lobeRadius)
    primary.addColorStop(0, 'rgba(255, 252, 240, 0.9)')
    primary.addColorStop(0.08, 'rgba(219, 235, 255, 0.62)')
    primary.addColorStop(0.31, 'rgba(113, 168, 248, 0.24)')
    primary.addColorStop(0.62, 'rgba(64, 112, 204, 0.085)')
    primary.addColorStop(0.82, 'rgba(255, 172, 91, 0.025)')
    primary.addColorStop(1, 'rgba(31, 77, 157, 0)')
    context.fillStyle = primary
    context.globalAlpha = Math.min(1, alpha * 0.94)
    context.beginPath()
    context.arc(0, 0, Math.max(1, lobeRadius), 0, TAU)
    context.fill()
    context.restore()

    context.save()
    context.translate(geometry.centerX, geometry.centerY)
    context.rotate(-0.87 + transitionState.shockFront * 0.035)
    context.scale(1, 0.19)
    context.globalCompositeOperation = 'screen'
    const secondary = context.createRadialGradient(0, 0, 0, 0, 0, lobeRadius * 0.72)
    secondary.addColorStop(0, 'rgba(255, 251, 238, 0.72)')
    secondary.addColorStop(0.17, 'rgba(255, 203, 137, 0.29)')
    secondary.addColorStop(0.48, 'rgba(137, 188, 255, 0.10)')
    secondary.addColorStop(1, 'rgba(74, 219, 233, 0)')
    context.fillStyle = secondary
    context.globalAlpha = alpha * 0.42
    context.beginPath()
    context.arc(0, 0, Math.max(1, lobeRadius * 0.72), 0, TAU)
    context.fill()
    context.restore()
  }

  function drawSupernovaFilaments(transitionState, geometry) {
    if (transitionState.plasma <= 0.001) return
    const minDimension = Math.min(width, height)
    const maxDimension = Math.max(width, height)
    const reachBase = maxDimension * mix(
      0.04,
      0.84,
      Math.pow(transitionState.shockFront, 0.76),
    )
    const fade = transitionState.plasma * (1 - transitionState.reveal * 0.64)

    context.save()
    context.translate(geometry.centerX, geometry.centerY)
    context.rotate(geometry.rotation)
    context.globalCompositeOperation = 'screen'
    context.lineCap = 'round'

    for (let index = 0; index < 18; index += 1) {
      const seed = hash('supernova-filament:' + index)
      const angle = (index * 2.399963229728653) % TAU
        + (unit(seed, 0) - 0.5) * 0.42
        + Math.sin(transitionState.shockFront * Math.PI) * (unit(seed, 8) - 0.5) * 0.12
      const directional = 0.82 + Math.cos(angle - 0.34) * 0.16
        + Math.sin(angle * 3 + 0.7) * 0.07
      const reach = reachBase * directional * (0.68 + unit(seed, 4) * 0.48)
      const inner = minDimension * (0.006 + unit(seed, 12) * 0.018)
      const curve = (unit(seed, 16) - 0.5) * (0.42 + transitionState.shockFront * 0.28)
      const startX = Math.cos(angle) * inner
      const startY = Math.sin(angle) * inner
      const endAngle = angle + curve
      const endX = Math.cos(endAngle) * reach
      const endY = Math.sin(endAngle) * reach
      const tangent = (unit(seed, 20) - 0.5) * reach * 0.24
      const gradient = context.createLinearGradient(startX, startY, endX, endY)
      const warm = unit(seed, 24) > 0.64
      gradient.addColorStop(0, 'rgba(255, 252, 239, 0)')
      gradient.addColorStop(
        0.18,
        warm ? 'rgba(255, 216, 157, 0.44)' : 'rgba(188, 218, 255, 0.48)',
      )
      gradient.addColorStop(
        0.58,
        warm ? 'rgba(255, 187, 112, 0.18)' : 'rgba(94, 163, 255, 0.2)',
      )
      gradient.addColorStop(1, 'rgba(74, 219, 233, 0)')

      context.beginPath()
      context.moveTo(startX, startY)
      context.bezierCurveTo(
        startX * 0.62 + endX * 0.12 - Math.sin(angle) * tangent,
        startY * 0.62 + endY * 0.12 + Math.cos(angle) * tangent,
        startX * 0.16 + endX * 0.68 - Math.sin(endAngle) * tangent * 0.34,
        startY * 0.16 + endY * 0.68 + Math.cos(endAngle) * tangent * 0.34,
        endX,
        endY,
      )
      context.strokeStyle = gradient
      context.lineWidth = 0.72 + unit(seed, 28) * 2.1
      context.globalAlpha = fade * (0.28 + unit(seed, 6) * 0.42)
      context.stroke()
    }
    context.restore()
  }

  function drawSupernovaShock(transitionState, geometry) {
    if (transitionState.shockVisibility <= 0.001) return
    const minDimension = Math.min(width, height)
    const maxDimension = Math.max(width, height)
    const radius = maxDimension * mix(
      0.012,
      0.72,
      Math.pow(transitionState.shockFront, 0.74),
    )
    const shellGradient = context.createRadialGradient(
      geometry.centerX,
      geometry.centerY,
      Math.max(0, radius * 0.72),
      geometry.centerX,
      geometry.centerY,
      radius * 1.12,
    )
    shellGradient.addColorStop(0, 'rgba(126, 176, 255, 0)')
    shellGradient.addColorStop(0.72, 'rgba(177, 211, 255, 0.015)')
    shellGradient.addColorStop(0.9, 'rgba(235, 245, 255, 0.39)')
    shellGradient.addColorStop(0.97, 'rgba(255, 222, 176, 0.16)')
    shellGradient.addColorStop(1, 'rgba(74, 219, 233, 0)')

    context.save()
    context.translate(geometry.centerX, geometry.centerY)
    context.rotate(geometry.rotation)
    context.scale(1.035, 0.972)
    context.globalCompositeOperation = 'screen'
    context.strokeStyle = shellGradient
    context.lineCap = 'round'
    context.setLineDash([
      Math.max(5, radius * 0.035),
      Math.max(7, radius * 0.062),
      Math.max(6, radius * 0.052),
      Math.max(9, radius * 0.108),
      Math.max(4, radius * 0.022),
      Math.max(8, radius * 0.082),
    ])
    context.lineDashOffset = -radius * (0.13 + transitionState.shockFront * 0.47)
    context.lineWidth = Math.max(0.55, minDimension * 0.0012)
    context.globalAlpha = transitionState.shockVisibility
      * (1 - transitionState.reveal * 0.72)
      * 0.36
    traceOrganicLoop(
      context,
      radius,
      geometry.phase,
      0.92,
    )
    context.stroke()

    context.rotate(-0.028)
    context.scale(0.96, 1.052)
    context.lineDashOffset = radius * 0.21
    context.lineWidth = Math.max(0.35, minDimension * 0.0007)
    context.globalAlpha *= 0.48
    traceOrganicLoop(
      context,
      radius * 0.972,
      geometry.phase + 1.13,
      1.14,
    )
    context.stroke()
    context.restore()
  }

  function drawSupernovaEmission(transitionState, drawFallbackShock = false) {
    if (
      !transitionState.openingProgram
      || Math.max(
        transitionState.core,
        transitionState.ignition,
        transitionState.blast,
        transitionState.exposure,
      ) <= 0.001
    ) return

    const geometry = collapseGeometry(transitionState)
    const minDimension = Math.min(width, height)
    const maxDimension = Math.max(width, height)
    drawSupernovaLobes(transitionState, geometry)
    drawSupernovaFilaments(transitionState, geometry)
    if (drawFallbackShock) drawSupernovaShock(transitionState, geometry)

    context.save()
    context.translate(geometry.centerX, geometry.centerY)
    context.globalCompositeOperation = 'screen'

    const coreRadius = minDimension * (
      0.004
      + transitionState.core * 0.016
      + Math.pow(transitionState.blast, 1.35) * 0.25
    )
    const core = context.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, coreRadius))
    core.addColorStop(0, 'rgba(255, 255, 250, 1)')
    core.addColorStop(0.075, 'rgba(250, 252, 255, 0.98)')
    core.addColorStop(0.29, 'rgba(201, 226, 255, 0.64)')
    core.addColorStop(0.61, 'rgba(126, 176, 255, 0.17)')
    core.addColorStop(0.83, 'rgba(255, 191, 112, 0.055)')
    core.addColorStop(1, 'rgba(74, 219, 233, 0)')
    context.fillStyle = core
    context.globalAlpha = Math.min(
      1,
      transitionState.core * 0.72
        + transitionState.ignition * 0.86
        + transitionState.blast * 0.68,
    ) * (1 - transitionState.reveal * 0.68)
    context.beginPath()
    context.arc(0, 0, Math.max(1, coreRadius), 0, TAU)
    context.fill()
    context.restore()

    if (transitionState.exposure > 0.001) {
      const exposureRadius = maxDimension * mix(
        0.075,
        1.04,
        smootherstep((transitionState.shockFront - 0.08) / 0.92),
      )
      const exposure = context.createRadialGradient(
        geometry.centerX,
        geometry.centerY,
        0,
        geometry.centerX,
        geometry.centerY,
        Math.max(1, exposureRadius),
      )
      exposure.addColorStop(0, 'rgba(255, 255, 252, 1)')
      exposure.addColorStop(0.18, 'rgba(249, 252, 255, 0.985)')
      exposure.addColorStop(0.46, 'rgba(226, 239, 255, 0.76)')
      exposure.addColorStop(0.72, 'rgba(190, 217, 255, 0.34)')
      exposure.addColorStop(0.9, 'rgba(126, 176, 255, 0.09)')
      exposure.addColorStop(1, 'rgba(74, 219, 233, 0)')

      context.save()
      context.globalCompositeOperation = 'screen'
      context.fillStyle = exposure
      context.globalAlpha = transitionState.exposure
        * (0.58 + transitionState.screenWash * 0.38)
        * (1 - transitionState.reveal * 0.52)
      context.beginPath()
      context.arc(
        geometry.centerX,
        geometry.centerY,
        Math.max(1, exposureRadius),
        0,
        TAU,
      )
      context.fill()
      context.restore()
    }
  }

  function drawProgramReveal(transitionState) {
    if (!transitionState.openingProgram || transitionState.reveal <= 0.001) return
    const reveal = transitionState.reveal

    if (reveal >= 0.998) {
      context.clearRect(0, 0, width, height)
      return
    }

    context.save()
    context.globalCompositeOperation = 'destination-out'
    context.fillStyle = '#000000'
    context.globalAlpha = reveal
    context.fillRect(0, 0, width, height)
    context.restore()
  }
  function drawDecorativeStars(timestamp, transitionState, densityState) {
    if (!transitionState.openingProgram && edgeMix >= 0.998) return
    const motionTimestamp = reduced ? 0 : timestamp
    const visibility = transitionState.visibility * mix(1, 1.08, cooperativeMix)
    if (visibility <= 0.001) return

    for (let index = 0; index < DECORATIVE_STAR_COUNT; index += 1) {
      const descriptor = decorativeStarPlacement(index, width, height, motionTimestamp)
      const star = { formationSlot: `decorative:${index}` }
      const point = transitionState.openingProgram
        ? stellarCollapseStarPlacement(
            star,
            width,
            height,
            transitionState.progress,
            motionTimestamp,
            descriptor,
          )
        : descriptor
      const cool = descriptor.warmth < 0.82
      const core = cool ? '#dce8ef' : '#eee1cf'
      const alpha = descriptor.alpha * visibility * densityState.ambientGain

      // A sparse, sub-pixel motion trace makes the zero-person waiting state
      // legibly alive on a venue display without turning the base layer into
      // fake participant meteors.
      if (!reduced && !transitionState.openingProgram && index % 7 === 0) {
        const previous = decorativeStarPlacement(index, width, height, Math.max(0, motionTimestamp - 230))
        context.beginPath()
        context.moveTo(previous.x, previous.y)
        context.lineTo(point.x, point.y)
        context.strokeStyle = core
        context.lineWidth = Math.max(0.28, descriptor.radius * 0.38)
        context.globalAlpha = alpha * 0.2
        context.stroke()
      }

      if (descriptor.radius > 0.72) {
        const haloRadius = 1.6 + descriptor.radius * 1.8
        const halo = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, haloRadius)
        halo.addColorStop(0, cool ? 'rgba(220, 232, 240, 0.12)' : 'rgba(238, 225, 208, 0.11)')
        halo.addColorStop(1, 'rgba(190, 211, 230, 0)')
        context.fillStyle = halo
        context.globalAlpha = alpha * 0.28
        context.beginPath()
        context.arc(point.x, point.y, haloRadius, 0, TAU)
        context.fill()
      }

      const pixel = Math.max(0.72, descriptor.radius * 1.1)
      context.fillStyle = core
      context.globalAlpha = alpha
      context.fillRect(point.x - pixel / 2, point.y - pixel / 2, pixel, pixel)
    }
  }

  function drawArrivalMeteor(star, timestamp, transitionState) {
    const arrival = arrivals.get(star.publicStarId)
    if (!arrival || transitionState.openingProgram) return
    const progress = clamp((timestamp - arrival.startedAt) / STAR_ARRIVAL_MS)
    if (progress >= 1) {
      arrivals.delete(star.publicStarId)
      syncArrivalDiagnostics()
      return
    }

    const meteor = arrivalMeteorPlacement(
      star,
      width,
      height,
      progress,
      arrival.startedAt,
    )
    const palette = starRenderPalette(star)
    const dx = meteor.head.x - meteor.tail.x
    const dy = meteor.head.y - meteor.tail.y
    const trailLength = Math.hypot(dx, dy)
    if (trailLength < 0.2 || meteor.trailAlpha <= 0.001) return

    const gradient = context.createLinearGradient(
      meteor.tail.x,
      meteor.tail.y,
      meteor.head.x,
      meteor.head.y,
    )
    gradient.addColorStop(0, 'rgba(205, 221, 232, 0)')
    gradient.addColorStop(0.58, palette.halo)
    gradient.addColorStop(0.9, palette.core)
    gradient.addColorStop(1, palette.glint)

    context.save()
    context.lineCap = 'round'
    context.strokeStyle = gradient
    context.beginPath()
    context.moveTo(meteor.tail.x, meteor.tail.y)
    context.lineTo(meteor.head.x, meteor.head.y)
    context.filter = 'blur(5px)'
    context.lineWidth = 4.2
    context.globalAlpha = meteor.trailAlpha * 0.23
    context.stroke()
    context.filter = 'none'
    context.lineWidth = 0.72
    context.globalAlpha = meteor.trailAlpha * 0.92
    context.stroke()

    if (meteor.captureAlpha > 0.001) {
      const captureGradient = context.createLinearGradient(
        meteor.orbitTail.x,
        meteor.orbitTail.y,
        meteor.target.x,
        meteor.target.y,
      )
      captureGradient.addColorStop(0, 'rgba(205, 221, 232, 0)')
      captureGradient.addColorStop(1, palette.halo)
      context.beginPath()
      context.moveTo(meteor.orbitTail.x, meteor.orbitTail.y)
      context.quadraticCurveTo(
        (meteor.orbitTail.x + meteor.target.x) / 2,
        (meteor.orbitTail.y + meteor.target.y) / 2,
        meteor.target.x,
        meteor.target.y,
      )
      context.strokeStyle = captureGradient
      context.lineWidth = 0.48
      context.globalAlpha = meteor.captureAlpha * 0.44
      context.stroke()
    }

    const headRadius = 1.5 + meteor.headAlpha * 2.4
    const headGlow = context.createRadialGradient(
      meteor.head.x,
      meteor.head.y,
      0,
      meteor.head.x,
      meteor.head.y,
      headRadius,
    )
    headGlow.addColorStop(0, palette.glint)
    headGlow.addColorStop(0.2, palette.core)
    headGlow.addColorStop(1, palette.haloFade)
    context.fillStyle = headGlow
    context.globalAlpha = meteor.headAlpha
    context.beginPath()
    context.arc(meteor.head.x, meteor.head.y, headRadius, 0, TAU)
    context.fill()
    context.restore()
  }

  function drawStar(star, timestamp, transitionState, densityState) {
    const motionTimestamp = reduced ? 0 : timestamp
    const point = transitionState.openingProgram
      ? stellarCollapseStarPlacement(star, width, height, transitionState.progress, motionTimestamp)
      : blendedStarPlacement(star, width, height, edgeMix, motionTimestamp)
    let arrivalAlpha = 1
    const arrival = arrivals.get(star.publicStarId)

    if (arrival) {
      const arrivalProgress = clamp((timestamp - arrival.startedAt) / STAR_ARRIVAL_MS)
      arrivalAlpha = smootherstep((arrivalProgress - 0.67) / 0.3)
    }

    const x = point.x
    const y = point.y

    const materialSeed = hash(`${star.formationSlot}:optical-material`)
    const opticalFlux = unit(materialSeed, 0)
    const scintillation = reduced
      ? 1
      : 0.997 + Math.sin(timestamp / (3600 + unit(materialSeed, 8) * 1900) + point.phase) * 0.003
    const baseStrength = star.started ? 0.98 : 0.6
    const exposure = 0.82 + Math.pow(opticalFlux, 0.72) * 0.18
    const participantGain = transitionState.openingProgram
      ? mix(densityState.participantGain, 1, transitionState.compression)
      : densityState.participantGain
    const strength = baseStrength
      * exposure
      * transitionState.visibility
      * arrivalAlpha
      * mix(1, participantGain, 0.55)
    const chargedRadius = 1 + transitionState.charge * (0.16 + unit(hash(star.formationSlot), 12) * 0.16)
    const radius = point.radius
      * scintillation
      * chargedRadius
      * participantGain
      * mix(1, star.started ? 1.22 : 1.06, cooperativeMix)
    const palette = starRenderPalette(star)

    if (strength <= 0.001) return

    if (
      transitionState.openingProgram
      && transitionState.progress > 0.06
      && transitionState.progress < 0.91
      && hash(star.formationSlot) % 3 === 0
    ) {
      const shutterMs = mix(
        22,
        48,
        clamp(transitionState.convergence * 0.52 + transitionState.compression * 0.66),
      )
      const previous = stellarCollapseStarPlacement(
        star,
        width,
        height,
        Math.max(0, transitionState.progress - shutterMs / transitionState.durationMs),
        Math.max(0, motionTimestamp - shutterMs),
      )
      const travelX = x - previous.x
      const travelY = y - previous.y
      const trailSeed = hash(`${star.formationSlot}:trail`)
      const trailScale = 1.15
        + unit(trailSeed, 0) * 0.9
        + transitionState.convergence * 1.18
        + transitionState.compression * 0.74
      const trailEnergy = smootherstep((transitionState.progress - 0.075) / 0.18)
        * (1 - smootherstep((transitionState.progress - 0.64) / 0.1))
      const collapseCenter = collapseGeometry(transitionState)
      const collapseDistance = Math.max(
        1,
        Math.hypot(x - collapseCenter.centerX, y - collapseCenter.centerY),
      )
      const tangentX = -(y - collapseCenter.centerY) / collapseDistance
      const tangentY = (x - collapseCenter.centerX) / collapseDistance
      const curvature = (3 + unit(trailSeed, 8) * 11)
        * transitionState.convergence
        * (1 + transitionState.compression * 2.4)
      context.beginPath()
      context.strokeStyle = palette.trail
      context.lineCap = 'round'
      context.lineWidth = Math.max(0.42, radius * 0.27)
      context.globalAlpha = strength * trailEnergy * 0.24
      context.moveTo(x, y)
      context.quadraticCurveTo(
        x - travelX * trailScale * 0.52 + tangentX * curvature,
        y - travelY * trailScale * 0.52 + tangentY * curvature,
        x - travelX * trailScale,
        y - travelY * trailScale,
      )
      context.stroke()
    } else if (transitionState.energy > 0.01 && transitionState.direction !== 0 && hash(star.formationSlot) % 3 === 0) {
      const program = programStarPlacement(star, width, height)
      const travelX = program.x - x
      const travelY = program.y - y
      const travelLength = Math.max(1, Math.hypot(travelX, travelY))
      const trailLength = (14 + radius * 5) * transitionState.energy
      context.beginPath()
      context.strokeStyle = palette.trail
      context.lineWidth = Math.max(0.55, radius * 0.34)
      context.globalAlpha = strength * transitionState.energy * 0.11
      context.moveTo(x, y)
      context.lineTo(x - (travelX / travelLength) * trailLength, y - (travelY / travelLength) * trailLength)
      context.stroke()
    }

    // Only the brighter tail receives a very thin aureole.  Most stars stay as
    // sub-pixel detector-like points instead of equally sized glowing balls.
    if (opticalFlux > 0.88) {
      const haloRadius = 2.8 + radius * 2.5
      const halo = context.createRadialGradient(x, y, 0, x, y, haloRadius)
      halo.addColorStop(0, palette.aureole)
      halo.addColorStop(0.24, palette.halo)
      halo.addColorStop(0.62, palette.haloFade)
      halo.addColorStop(1, palette.haloFade)
      context.beginPath()
      context.fillStyle = halo
      context.globalAlpha = strength * (0.62 + opticalFlux * 0.28)
      context.arc(x, y, haloRadius, 0, TAU)
      context.fill()
    }

    if ((radius < 0.72 || transitionState.openingProgram) && opticalFlux < 0.86) {
      const pixel = Math.max(0.9, radius * 1.16)
      context.fillStyle = palette.core
      context.globalAlpha = strength * 0.96
      context.fillRect(x - pixel / 2, y - pixel / 2, pixel, pixel)
    } else {
      const psfRadius = Math.max(0.92, radius * 1.42)
      const psf = context.createRadialGradient(x, y, 0, x, y, psfRadius)
      psf.addColorStop(0, palette.glint)
      psf.addColorStop(0.1, palette.core)
      psf.addColorStop(0.38, palette.halo)
      psf.addColorStop(1, palette.haloFade)
      context.beginPath()
      context.fillStyle = psf
      context.globalAlpha = strength * (0.86 + opticalFlux * 0.14)
      context.arc(x, y, psfRadius, 0, TAU)
      context.fill()

      const hotPixel = clamp(radius * 0.4, 0.34, 0.7)
      context.fillStyle = palette.glint
      context.globalAlpha = strength * 0.76
      context.fillRect(x - hotPixel / 2, y - hotPixel / 2, hotPixel, hotPixel)
    }

    // The star body already brightens for every started participant. Reserve
    // the second, larger radial gradient for a deterministic bright subset in
    // the cooperative scene. The supernova has its own volumetric emission, so
    // it does not duplicate this per-star atmospheric layer.
    const receivesAtmosphericHalo = hash(`${star.formationSlot}:atmospheric-halo`) % 3 === 0
    if (
      star.started
      && receivesAtmosphericHalo
      && cooperativeMix > 0.01
    ) {
      const cooperativeRadius = radius * mix(2.2, 3.1, cooperativeMix)
      const cooperativeHalo = context.createRadialGradient(x, y, 0, x, y, cooperativeRadius)
      cooperativeHalo.addColorStop(0, palette.halo)
      cooperativeHalo.addColorStop(1, palette.haloFade)
      context.beginPath()
      context.fillStyle = cooperativeHalo
      context.globalAlpha = strength * mix(0.08, 0.14, cooperativeMix)
      context.arc(x, y, cooperativeRadius, 0, TAU)
      context.fill()
    }

    if (star.started && radius > 1.08 && hash(`${star.formationSlot}:glint`) % 5 === 0) {
      const glintLength = radius * (2.4 + opticalFlux * 1.5)
      context.beginPath()
      context.strokeStyle = palette.glint
      context.lineWidth = 0.32
      context.globalAlpha = strength * 0.19
      context.moveTo(x - glintLength, y)
      context.lineTo(x + glintLength, y)
      context.moveTo(x, y - glintLength * 0.62)
      context.lineTo(x, y + glintLength * 0.62)
      context.stroke()
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    rebuildOrbitGuidePath()
    rebuildTransitionTextures()
    rebuildCinematicBackdropTexture()
    paint(performance.now())
    stellarCollapseRenderer?.prepare(canvas.width, canvas.height)
  }

  function paint(timestamp) {
    context.clearRect(0, 0, width, height)
    const transitionState = updateSceneMix(timestamp)
    const densityState = assemblyDensityEnvelope(stars.length, timestamp, reduced)
    drawTransitionBackdrop(transitionState)
    drawOrbitGuides(timestamp, densityState)
    drawCollapseField(transitionState)
    context.save()
    context.globalCompositeOperation = 'screen'
    drawDecorativeStars(timestamp, transitionState, densityState)
    for (const star of stars) {
      drawArrivalMeteor(star, timestamp, transitionState)
      drawStar(star, timestamp, transitionState, densityState)
    }
    context.restore()
    const usedSupernovaPostprocess = applyStellarCollapsePostprocess(transitionState, timestamp)
    drawSupernovaEmission(transitionState, !usedSupernovaPostprocess)
    drawProgramReveal(transitionState)
    context.globalAlpha = 1
    context.globalCompositeOperation = 'source-over'
  }

  function loop(timestamp) {
    if (!running) return
    const targetFps = Math.max(1, targetRenderFps())
    const targetInterval = targetFps === ACTIVE_RENDER_TARGET_FPS
      ? ACTIVE_FRAME_INTERVAL_MS
      : 1000 / targetFps
    if (nextPaintAt === 0) nextPaintAt = timestamp
    if (timestamp + FRAME_DEADLINE_TOLERANCE_MS >= nextPaintAt) {
      paint(timestamp)
      do nextPaintAt += targetInterval
      while (nextPaintAt <= timestamp)
    }
    syncRenderDiagnostics()
    if (!shouldAnimate()) {
      running = false
      return
    }
    frame = requestAnimationFrame(loop)
  }

  function shouldAnimate() {
    return !reduced
      && !document.hidden
      && (Boolean(transition) || arrivals.size > 0 || mode !== 'PROGRAM_SUPPORT')
  }

  function updateLoop() {
    const shouldRun = shouldAnimate()
    syncRenderDiagnostics()
    canvas.dataset.assemblyMotion = reduced
      ? 'reduced-static'
      : shouldRun && mode === 'ASSEMBLY'
        ? 'flowing'
        : 'idle'
    if (shouldRun && !running) {
      running = true
      nextPaintAt = 0
      frame = requestAnimationFrame(loop)
    } else if (!shouldRun && running) {
      running = false
      cancelAnimationFrame(frame)
      nextPaintAt = 0
      paint(performance.now())
    } else if (!shouldRun) paint(performance.now())
  }

  function onVisibility() {
    if (document.hidden) {
      arrivals.clear()
      syncArrivalDiagnostics()
      if (transition) snapToMode()
    }
    updateLoop()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  document.addEventListener('visibilitychange', onVisibility)
  loadCinematicBackdrop(options.backdropUrl)
  resize()
  if (!reduced) {
    const renderer = ensureStellarCollapseRenderer()
    canvas.dataset.supernovaWarmup = renderer?.prepare(canvas.width, canvas.height)
      ? 'ready'
      : 'fallback'
  } else {
    canvas.dataset.supernovaWarmup = 'reduced-motion-bypass'
  }
  updateLoop()

  return {
    setStars(next) {
      stars = [...next].slice(0, TECHNICAL_STAR_CAPACITY)
      arrivals.clear()
      syncArrivalDiagnostics()
      paint(performance.now())
      updateLoop()
    },
    upsertStar(star) {
      const index = stars.findIndex((item) => item.publicStarId === star.publicStarId)
      if (index === -1) {
        stars.push(star)
        if (!reduced && !document.hidden && mode === 'ASSEMBLY' && !transition) {
          arrivals.set(star.publicStarId, { startedAt: performance.now() })
          nextPaintAt = 0
          syncArrivalDiagnostics()
        }
      }
      else stars[index] = star
      stars = stars.slice(0, TECHNICAL_STAR_CAPACITY)
      updateLoop()
    },
    setMode(next, animationOptions = {}) {
      const nextMode = next ?? 'ASSEMBLY'
      const previousMode = mode
      const targets = targetsFor(nextMode)
      if (
        nextMode === mode
        && transition
        && transition.toEdge === targets.edge
        && transition.toCooperative === targets.cooperative
        && animationOptions.animate !== false
      ) return

      const timestamp = performance.now()
      updateSceneMix(timestamp)
      mode = nextMode
      if (nextMode !== 'ASSEMBLY') {
        arrivals.clear()
        syncArrivalDiagnostics()
      }
      const animate = animationOptions.animate !== false && !reduced && !document.hidden
      const changed = Math.abs(targets.edge - edgeMix) > 0.0001
        || Math.abs(targets.cooperative - cooperativeMix) > 0.0001

      if (!animate || !changed) {
        edgeMix = targets.edge
        cooperativeMix = targets.cooperative
        transition = null
      } else {
        transition = {
          startedAt: timestamp,
          durationMs: Math.max(1, animationOptions.durationMs ?? DEFAULT_TRANSITION_MS),
          fromMode: previousMode,
          toMode: nextMode,
          fromEdge: edgeMix,
          toEdge: targets.edge,
          fromCooperative: cooperativeMix,
          toCooperative: targets.cooperative,
        }
        nextPaintAt = 0
      }
      updateLoop()
    },
    setReduced(next) {
      reduced = Boolean(next)
      if (reduced) {
        arrivals.clear()
        syncArrivalDiagnostics()
        snapToMode()
        canvas.dataset.supernovaEngine = 'reduced-motion-bypass'
      }
      updateLoop()
    },
    destroy() {
      destroyed = true
      running = false
      transition = null
      arrivals.clear()
      syncArrivalDiagnostics()
      cinematicBackdropImage = null
      galaxyDustTexture = null
      stellarCollapseRenderer?.destroy()
      stellarCollapseRenderer = null
      cinematicBackdropTexture = null
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
