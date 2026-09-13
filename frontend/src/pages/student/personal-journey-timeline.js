import { flowAngle, flowCamera, flowPoint, projectFlowPoint, personalStarFormation } from '../../rendering/stellar-flow.js'
export const PERSONAL_JOURNEY_PHASES = Object.freeze({
  DISCOVERY: 'discovery',
  SELECTION: 'selection',
  CONFIRM: 'confirm',
  MESSAGE: 'message',
  HANDOFF: 'handoff',
  ORBIT: 'orbit',
})

export const PERSONAL_JOURNEY_DURATIONS = Object.freeze({
  discovery: 5_400,
  confirm: 1_000,
  handoff: 4_200,
})

// A bounded camera drift cycle. The star river keeps its main direction.
export const PERSONAL_JOURNEY_AMBIENT_CYCLE_MS = 240_000

export const PERSONAL_JOURNEY_PARTICLE_COUNTS = Object.freeze({
  farStars: 150,
  discoveryMotes: 78,
  orbitDust: 156,
})

const PHASE_VALUES = new Set(Object.values(PERSONAL_JOURNEY_PHASES))

export function clampJourneyProgress(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function smoothJourneyProgress(value) {
  const progress = clampJourneyProgress(value)
  return progress * progress * (3 - 2 * progress)
}

export function mixJourneyValue(from, to, progress) {
  return from + (to - from) * progress
}

export function normalizePersonalJourneyPhase(phase) {
  return PHASE_VALUES.has(phase) ? phase : PERSONAL_JOURNEY_PHASES.ORBIT
}

export function personalJourneyDuration(phase) {
  return PERSONAL_JOURNEY_DURATIONS[normalizePersonalJourneyPhase(phase)] ?? 0
}

export function projectPersonalOrbit({
  width,
  height,
  radius = 0.64,
  theta = -0.82,
  rotationDegrees = -7,
  scale = 1,
  centerX = 0.33,
  centerY = 0.44,
} = {}) {
  const safeWidth = Math.max(1, Number(width) || 1)
  const safeHeight = Math.max(1, Number(height) || 1)
  const safeRadius = Number.isFinite(radius) ? radius : 0.64
  const safeTheta = Number.isFinite(theta) ? theta : -0.82
  const safeScale = Number.isFinite(scale) ? scale : 1
  const rotation = (Number(rotationDegrees) || 0) * Math.PI / 180
  const planeX = Math.cos(safeTheta) * safeRadius * safeWidth * 0.30 * safeScale
  const planeY = Math.sin(safeTheta) * safeRadius * safeHeight * 0.10 * safeScale

  return {
    x: safeWidth * centerX + planeX * Math.cos(rotation) - planeY * Math.sin(rotation),
    y: safeHeight * centerY + planeX * Math.sin(rotation) + planeY * Math.cos(rotation),
    depth: Math.sin(safeTheta),
  }
}

function animatedStaticProgress(phase, progress, reduced) {
  if (!reduced) return clampJourneyProgress(progress)
  return personalJourneyDuration(phase) > 0 ? 1 : clampJourneyProgress(progress)
}

function phaseElapsed(phase, progress, timeMs) {
  const duration = personalJourneyDuration(phase)
  if (duration > 0) return duration * progress
  return Math.max(0, Number(timeMs) || 0)
}

function pulseScale(progress) {
  if (progress <= 0.38) {
    return mixJourneyValue(1, 1.72, smoothJourneyProgress(progress / 0.38))
  }
  return mixJourneyValue(1.72, 1, smoothJourneyProgress((progress - 0.38) / 0.62))
}

export function resolvePersonalJourneyFrame({
  phase: requestedPhase = PERSONAL_JOURNEY_PHASES.ORBIT,
  progress: requestedProgress = 1,
  timeMs = 0,
  width = 390,
  height = 844,
  reduced = false,
  ownStar = null,
} = {}) {
  const phase = normalizePersonalJourneyPhase(requestedPhase)
  const progress = animatedStaticProgress(phase, requestedProgress, reduced)
  // Reduced motion must remain a genuinely static orbit even when a resize or
  // state refresh asks the renderer to paint again at a later timestamp.
  const elapsedMs = reduced && phase === PERSONAL_JOURNEY_PHASES.ORBIT
    ? PERSONAL_JOURNEY_DURATIONS.handoff
    : phaseElapsed(phase, progress, timeMs)
  const discoveryProgress = phase === PERSONAL_JOURNEY_PHASES.DISCOVERY ? progress : 1
  const intro = smoothJourneyProgress(discoveryProgress)
  const handoffProgress = phase === PERSONAL_JOURNEY_PHASES.HANDOFF
    ? progress
    : phase === PERSONAL_JOURNEY_PHASES.ORBIT ? 1 : 0
  const pull = smoothJourneyProgress(handoffProgress)
  const handoffElapsedMs = phase === PERSONAL_JOURNEY_PHASES.HANDOFF
    ? elapsedMs
    : phase === PERSONAL_JOURNEY_PHASES.ORBIT
      ? Math.max(PERSONAL_JOURNEY_DURATIONS.handoff, elapsedMs)
      : 0
  const fieldDriftDegrees = Math.sin(handoffElapsedMs / PERSONAL_JOURNEY_AMBIENT_CYCLE_MS * Math.PI * 2) * 2.5
  const fieldRotation = mixJourneyValue(-7, -13, pull) + fieldDriftDegrees
  const fieldScale = mixJourneyValue(0.16, 1, pull)
  const galaxyReveal = phase === PERSONAL_JOURNEY_PHASES.ORBIT
    ? 1
    : smoothJourneyProgress(handoffElapsedMs / 3_000)
  const introScale = mixJourneyValue(1.23, 1.42, intro)
  const backgroundScale = mixJourneyValue(introScale, 1, pull)
  const orbitRadius = Number.isFinite(ownStar?.orbitRadius) ? ownStar.orbitRadius : 0.64
  const orbitBaseAngle = Number.isFinite(ownStar?.orbitAngle) ? ownStar.orbitAngle : -0.82
  const ownTheta = orbitBaseAngle + flowAngle(orbitRadius, handoffElapsedMs / 1000)
  const ownFormation = personalStarFormation(ownStar)
  const worldPoint = flowPoint(ownFormation,handoffElapsedMs/1000)
  const projected = projectFlowPoint(worldPoint,flowCamera(handoffElapsedMs/1000,0,{personal:true,width,height}),width,height)
  const orbitPoint = { ...projected, depth: Math.sin(ownTheta) }
  const orbitProgress = smoothJourneyProgress(handoffElapsedMs / 2_750)
  const ownDepthScale = 0.94 + (orbitPoint.depth + 1) * 0.03

  let heroX = Number(width) * 0.5
  let heroY = Number(height) * 0.42
  let heroScale = mixJourneyValue(
    0.025,
    1,
    smoothJourneyProgress((elapsedMs - 1_300) / 3_500),
  )
  let heroOpacity = smoothJourneyProgress((elapsedMs - 700) / 2_100)
  let heroGlowScale = 1
  let heroColorMix = smoothJourneyProgress((discoveryProgress - 0.82) / 0.18)

  if (phase === PERSONAL_JOURNEY_PHASES.SELECTION) {
    heroScale = 1
    heroOpacity = 1
    heroColorMix = 1
  } else if (phase === PERSONAL_JOURNEY_PHASES.CONFIRM) {
    heroY = mixJourneyValue(Number(height) * 0.42, Number(height) * 0.25, smoothJourneyProgress(progress))
    heroScale = 1
    heroOpacity = 1
    heroGlowScale = pulseScale(progress)
    heroColorMix = 1
  } else if (phase === PERSONAL_JOURNEY_PHASES.MESSAGE) {
    heroY = Number(height) * 0.25
    heroScale = 1
    heroOpacity = 1
    heroColorMix = 1
  } else if (phase === PERSONAL_JOURNEY_PHASES.HANDOFF || phase === PERSONAL_JOURNEY_PHASES.ORBIT) {
    heroX = mixJourneyValue(Number(width) * 0.5, orbitPoint.x, orbitProgress)
    heroY = mixJourneyValue(Number(height) * 0.25, orbitPoint.y, orbitProgress)
    heroScale = mixJourneyValue(1, 0.17 * ownDepthScale, orbitProgress)
    heroOpacity = mixJourneyValue(1, orbitPoint.depth < 0 ? 0.88 : 0.96, orbitProgress)
    heroColorMix = 1
  }

  return {
    phase,
    progress,
    elapsedMs,
    background: {
      scale: backgroundScale,
      xPercent: mixJourneyValue(0, -1.8, pull),
      yPercent: mixJourneyValue(1.2, 0, pull),
      saturation: mixJourneyValue(0.34, 0.5, pull),
      brightness: mixJourneyValue(0.5, 0.72, pull),
      opacity: mixJourneyValue(0.62, 0.82, pull),
      nebulaScale: mixJourneyValue(1.2, 0.98, pull),
      nebulaXPercent: mixJourneyValue(-2, 1, pull),
      nebulaYPercent: mixJourneyValue(-2, 0, pull),
      nebulaOpacity: mixJourneyValue(0.11, 0.045, pull),
    },
    discovery: {
      intro,
      moteOpacity: phase === PERSONAL_JOURNEY_PHASES.DISCOVERY
        ? 1 - smoothJourneyProgress((elapsedMs - 4_750) / 950)
        : 0,
    },
    field: {
      reveal: galaxyReveal,
      scale: fieldScale,
      rotationDegrees: fieldRotation,
      orbitElapsedMs: handoffElapsedMs,
    },
    hero: {
      x: heroX,
      y: heroY,
      scale: heroScale,
      opacity: heroOpacity,
      glowScale: heroGlowScale,
      colorMix: heroColorMix,
      depth: orbitPoint.depth,
      orbitPoint,
    },
  }
}
