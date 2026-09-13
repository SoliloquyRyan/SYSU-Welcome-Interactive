import {
  PERSONAL_JOURNEY_DURATIONS,
  PERSONAL_JOURNEY_PARTICLE_COUNTS,
  PERSONAL_JOURNEY_PHASES,
  clampJourneyProgress,
  mixJourneyValue,
  normalizePersonalJourneyPhase,
  personalJourneyDuration,
  projectPersonalOrbit,
  resolvePersonalJourneyFrame,
  smoothJourneyProgress,
} from './personal-journey-timeline'
import { ORBITAL_SIGNAL_PALETTE } from '../../styles/orbital-signal'
import { drawGalacticPlate, drawStellarAtmosphere, onStellarPlateReady, stellarPlateStatus } from '../../rendering/galactic-medium'
import { flowCamera, stellarFormation, projectFlowStar, personalStarFormation } from '../../rendering/stellar-flow.js'
import { createStellarNebulaRenderer } from '../../rendering/stellar-nebula.js'

export {
  PERSONAL_JOURNEY_AMBIENT_CYCLE_MS,
  PERSONAL_JOURNEY_DURATIONS,
  PERSONAL_JOURNEY_PARTICLE_COUNTS,
  PERSONAL_JOURNEY_PHASES,
  projectPersonalOrbit,
  resolvePersonalJourneyFrame,
} from './personal-journey-timeline'

const TAU = Math.PI * 2
const DEFAULT_COLOR = '#ffe3ad'
const DEFAULT_NEUTRAL = '#eef6ff'
const MAX_PUBLIC_STARS = 300
export const PERSONAL_JOURNEY_SIGNAL_PALETTE = ORBITAL_SIGNAL_PALETTE

// A restrained stellar palette: color variety is visible at close range but
// no single saturated hue turns the galaxy into confetti. Assignment is
// deterministic, so particles never change color between frames or devices.
export const PERSONAL_JOURNEY_AMBIENT_COLORS = Object.freeze([
  '#d9efff',
  '#c0ced8',
  '#d6dfde',
  '#f0e5cf',
  '#decfbd',
  '#cbd0de',
])

export const PERSONAL_JOURNEY_GALAXY_CORE_STOPS = Object.freeze([
  Object.freeze({ offset: 0, color: '#f7fbff', alpha: 0.58 }),
  Object.freeze({ offset: 0.07, color: '#dbeeff', alpha: 0.4 }),
  Object.freeze({ offset: 0.2, color: '#8fc5ff', alpha: 0.25 }),
  Object.freeze({ offset: 0.46, color: '#527fdc', alpha: 0.08 }),
  Object.freeze({ offset: 0.74, color: '#263f8f', alpha: 0.025 }),
  Object.freeze({ offset: 1, color: '#102454', alpha: 0 }),
])

function seeded(index) {
  const value = Math.sin(index * 9187.137) * 43758.5453
  return value - Math.floor(value)
}

export function personalJourneyAmbientColor(index, offset = 0) {
  const colorIndex = Math.floor(
    seeded(Number(index) + Number(offset) + 401) * PERSONAL_JOURNEY_AMBIENT_COLORS.length,
  )
  return PERSONAL_JOURNEY_AMBIENT_COLORS[
    Math.min(PERSONAL_JOURNEY_AMBIENT_COLORS.length - 1, Math.max(0, colorIndex))
  ]
}

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

const FAR_STARS = Object.freeze(Array.from(
  { length: PERSONAL_JOURNEY_PARTICLE_COUNTS.farStars },
  (_, index) => Object.freeze({
    angle: seeded(index + 3) * TAU,
    radius: seeded(index + 13) ** 0.72,
    depth: 0.2 + seeded(index + 29) * 0.8,
    size: 0.35 + seeded(index + 41) * 1.15,
    alpha: 0.12 + seeded(index + 53) * 0.55,
    color: personalJourneyAmbientColor(index, 17),
  }),
))

const DISCOVERY_MOTES = Object.freeze(Array.from(
  { length: PERSONAL_JOURNEY_PARTICLE_COUNTS.discoveryMotes },
  (_, index) => Object.freeze({
    angle: seeded(index + 101) * TAU,
    origin: 0.06 + seeded(index + 113) * 0.72,
    depth: 0.25 + seeded(index + 127) * 0.75,
    size: 0.4 + seeded(index + 139) * 2.2,
    alpha: 0.08 + seeded(index + 151) * 0.26,
    sway: (seeded(index + 163) - 0.5) * 0.12,
  }),
))

const ORBIT_DUST = Object.freeze(Array.from(
  { length: PERSONAL_JOURNEY_PARTICLE_COUNTS.orbitDust },
  (_, index) => Object.freeze({
    band: index % 4,
    formation: stellarFormation('phone-dust:'+index),
    baseAngle: seeded(index + 211) * TAU,
    radialNoise: (seeded(index + 239) - 0.5) * 0.09,
    size: 0.55 + seeded(index + 251) * 1.3,
    alpha: 0.12 + seeded(index + 263) * 0.38,
    color: personalJourneyAmbientColor(index, 71),
    haze: seeded(index + 283) > 0.88,
    speed: 0.88 + seeded(index + 307) * 0.24,
  }),
))

function parseHexColor(value, fallback = DEFAULT_COLOR) {
  const input = typeof value === 'string' ? value.trim() : ''
  const match = input.match(/^#([\da-f]{3}|[\da-f]{6})$/iu)
  if (!match) return parseHexColor(fallback, '#ffffff')
  const hex = match[1].length === 3
    ? match[1].split('').map((character) => character + character).join('')
    : match[1]
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function rgba(color, alpha = 1) {
  const { red, green, blue } = parseHexColor(color)
  return `rgba(${red}, ${green}, ${blue}, ${Math.min(1, Math.max(0, alpha))})`
}

function mixColor(from, to, progress) {
  const start = parseHexColor(from, DEFAULT_NEUTRAL)
  const end = parseHexColor(to, DEFAULT_COLOR)
  const amount = clampJourneyProgress(progress)
  return {
    red: Math.round(mixJourneyValue(start.red, end.red, amount)),
    green: Math.round(mixJourneyValue(start.green, end.green, amount)),
    blue: Math.round(mixJourneyValue(start.blue, end.blue, amount)),
  }
}

function mixedRgba(from, to, progress, alpha = 1) {
  const { red, green, blue } = mixColor(from, to, progress)
  return `rgba(${red}, ${green}, ${blue}, ${Math.min(1, Math.max(0, alpha))})`
}

function drawBackground(context, _image, width, height, frame) {
  drawStellarAtmosphere(context, width, height, frame.field.orbitElapsedMs / 1000)
}

function drawFarStars(context, width, height, frame, ambientTimeMs) {
  const centerX = width * 0.5
  const centerY = height * 0.42
  const reveal = frame.field.reveal
  const radialFactor = reveal > 0
    ? mixJourneyValue(0.1, 0.72, reveal)
    : mixJourneyValue(0.05, 0.16, frame.discovery.intro)
  const driftTime = frame.phase === PERSONAL_JOURNEY_PHASES.DISCOVERY
    ? frame.elapsedMs
    : ambientTimeMs

  context.save()
  context.globalCompositeOperation = 'screen'
  for (const star of FAR_STARS) {
    const angle = star.angle + driftTime / 195_000 * (star.depth * 0.18 + 0.04)
    const parallax = 1 + Math.sin(driftTime / 37000 + star.depth * 2) * .025 * star.depth
    const radial = star.radius * Math.max(width, height) * radialFactor * parallax
    const x = centerX + Math.cos(angle) * radial * 1.08
    const y = centerY + Math.sin(angle) * radial * 1.44
    const alpha = mixJourneyValue(0.07, star.alpha * .88, reveal)
    context.beginPath()
    context.fillStyle = rgba(star.color, alpha)
    context.arc(x, y, star.size * mixJourneyValue(0.35, .58, reveal), 0, TAU)
    context.fill()
  }
  context.restore()
}

function drawDiscoveryMotes(context, width, height, frame) {
  if (frame.discovery.moteOpacity <= 0) return
  const centerX = width * 0.5
  const centerY = height * 0.42
  const elapsed = frame.elapsedMs
  const fade = frame.discovery.moteOpacity

  context.save()
  context.globalCompositeOperation = 'screen'
  for (let index = 0; index < DISCOVERY_MOTES.length; index += 1) {
    const mote = DISCOVERY_MOTES[index]
    const travel = elapsed / PERSONAL_JOURNEY_DURATIONS.discovery * (0.15 + mote.depth * 0.42)
    const radial = (mote.origin + travel) % 1
    const angle = mote.angle + Math.sin(elapsed / 1_900 + index) * mote.sway
    const x = centerX + Math.cos(angle) * radial * width * 0.78
    const y = centerY + Math.sin(angle) * radial * height * 0.74
    const radius = mote.size * (0.55 + radial * mote.depth * 1.25)
    const alpha = mote.alpha * fade
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius * 3.2)
    gradient.addColorStop(0, rgba('#daf0ff', alpha))
    gradient.addColorStop(0.3, rgba('#8cc4ff', alpha * 0.42))
    gradient.addColorStop(1, 'rgba(76, 130, 255, 0)')
    context.strokeStyle = rgba('#95cfff', alpha * 0.18)
    context.lineWidth = Math.max(0.35, radius * 0.32)
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(x - Math.cos(angle) * radius * 7, y - Math.sin(angle) * radius * 7)
    context.lineTo(x, y)
    context.stroke()
    context.fillStyle = gradient
    context.beginPath()
    context.arc(x, y, radius * 3.2, 0, TAU)
    context.fill()
  }
  context.restore()
}

function orbitDustProjection(particle,width,height,frame,thetaOffset=0) {
  const p=projectFlowStar(particle.formation,frame.field.orbitElapsedMs/1000+thetaOffset*4,width,height,true)
  return { ...p, x:width*.5+(p.x-width*.5)*frame.field.scale, y:height*.435+(p.y-height*.435)*frame.field.scale, depth:particle.band>1?1:-1, orbitRadius:particle.formation.radius }

}

function paintOrbitParticle(context, point, previous, particle, alpha, scale) {
  const radius = particle.size * (0.28 + scale * 0.22) * (point.depth > 0 ? 1.14 : 0.84)
  context.strokeStyle = rgba(particle.color, alpha * 0.22)
  context.lineWidth = Math.max(0.45, radius * 0.48)
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(previous.x, previous.y)
  context.lineTo(point.x, point.y)
  context.stroke()

  if (particle.haze) {
    const haze = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 5.5)
    haze.addColorStop(0, rgba(particle.color, alpha * 0.48))
    haze.addColorStop(1, rgba(particle.color, 0))
    context.fillStyle = haze
    context.beginPath()
    context.arc(point.x, point.y, radius * 5.5, 0, TAU)
    context.fill()
  } else {
    context.fillStyle = rgba(particle.color, alpha)
    context.beginPath()
    context.arc(point.x, point.y, radius, 0, TAU)
    context.fill()
  }
}

function drawOrbitDust(context, width, height, frame, foreground) {
  if (frame.field.reveal <= 0) return
  context.save()
  context.globalCompositeOperation = 'screen'
  for (const particle of ORBIT_DUST) {
    const point = orbitDustProjection(particle, width, height, frame)
    if ((point.depth > 0) !== foreground) continue
    const previous = orbitDustProjection(
      particle,
      width,
      height,
      frame,
      -(0.018 + particle.speed * 0.008),
    )
    const radialFalloff = mixJourneyValue(
      1.08,
      0.38,
      clampJourneyProgress((point.orbitRadius - 0.2) / 0.74),
    )
    const alpha = particle.alpha
      * radialFalloff
      * frame.field.reveal
      * (point.depth > 0 ? 1 : 0.58)
    paintOrbitParticle(context, point, previous, particle, alpha, frame.field.scale)
  }
  context.restore()
}

function drawGalaxyCore(context, width, height, frame) {
  drawGalacticPlate(context, width, height, {
    seconds: frame.field.orbitElapsedMs / 1000,
    reveal: frame.field.reveal,
    scale: frame.field.scale,
    rotation: frame.field.rotationDegrees * Math.PI / 180,
    personal: true,
  })
}

function starIdentity(star) {
  return String(star?.id ?? star?.publicStarId ?? '')
}

function starSlot(star) {
  return String(star?.formationSlot ?? star?.slot ?? starIdentity(star) ?? '')
}

function starColor(star, fallback = DEFAULT_NEUTRAL) {
  return star?.color ?? star?.displayColor ?? fallback
}

function starIsOwn(star, ownStar) {
  if (!ownStar) return false
  const ownId = starIdentity(ownStar)
  const ownSlot = starSlot(ownStar)
  return Boolean(
    (ownId && starIdentity(star) === ownId)
    || (ownSlot && starSlot(star) === ownSlot),
  )
}

function projectPublicStar(star, width, height, frame) {
  const seed = hash(starSlot(star) || 'public-star')
  const radius = 0.22 + Math.sqrt(unit(seed, 8)) * 0.68
  const period = 76_000 + unit(seed, 12) * 68_000
  const theta = unit(seed, 0) * TAU + frame.field.orbitElapsedMs / period * TAU
  const point = projectPersonalOrbit({
    width,
    height,
    radius,
    theta,
    rotationDegrees: frame.field.rotationDegrees + (unit(seed, 20) - 0.5) * 3.2,
    scale: frame.field.scale,
  })
  return {
    ...point,
    radius: 0.75 + unit(seed, 16) * 1.35,
    alpha: 0.36 + unit(seed, 4) * 0.5,
  }
}

function drawPublicStars(context, stars, ownStar, width, height, frame) {
  if (frame.field.reveal <= 0 || stars.length === 0) return
  context.save()
  context.globalCompositeOperation = 'screen'
  for (const star of stars) {
    if (starIsOwn(star, ownStar)) continue
    const point = projectPublicStar(star, width, height, frame)
    const depthStrength = point.depth > 0 ? 1 : 0.68
    context.globalAlpha = point.alpha * depthStrength * frame.field.reveal
    context.fillStyle = starColor(star)
    context.beginPath()
    context.arc(point.x, point.y, point.radius * (point.depth > 0 ? 1.1 : 0.84), 0, TAU)
    context.fill()
  }
  context.restore()
}

function ownOrbitConfig(ownStar) {
  return {
    radius: Number.isFinite(ownStar?.orbitRadius) ? ownStar.orbitRadius : 0.64,
    angle: Number.isFinite(ownStar?.orbitAngle) ? ownStar.orbitAngle : -0.82,
    period: Number.isFinite(ownStar?.orbitPeriodMs) && ownStar.orbitPeriodMs > 0
      ? ownStar.orbitPeriodMs
      : 108_000,
  }
}

function drawOwnTrail(context, ownStar, color, width, height, frame) {
  if (frame.field.reveal < .98 || !['handoff','orbit'].includes(frame.phase) || frame.field.orbitElapsedMs < 2800) return
  const previous=projectFlowStar(personalStarFormation(ownStar),frame.field.orbitElapsedMs/1000-.65,width,height,true)
  const gradient=context.createLinearGradient(previous.x,previous.y,frame.hero.x,frame.hero.y)
  gradient.addColorStop(0,rgba(color,0));gradient.addColorStop(1,rgba(color,.15))
  context.save();context.globalCompositeOperation='screen';context.strokeStyle=gradient;context.lineWidth=1.3;context.lineCap='round'
  context.beginPath();context.moveTo(previous.x,previous.y);context.lineTo(frame.hero.x,frame.hero.y);context.stroke();context.restore()
}

function drawHeroStar(context, color, width, height, frame) {
  if (frame.hero.opacity <= 0 || frame.hero.scale <= 0) return 0
  const scale = frame.hero.scale
  const haloRadius = Math.max(1.5, 92 * scale * frame.hero.glowScale)
  const coreRadius = Math.max(0.45, 4.8 * scale)
  const gradient = context.createRadialGradient(
    frame.hero.x,
    frame.hero.y,
    0,
    frame.hero.x,
    frame.hero.y,
    haloRadius,
  )
  gradient.addColorStop(0, `rgba(255, 255, 255, ${0.98 * frame.hero.opacity})`)
  gradient.addColorStop(
    Math.min(0.16, coreRadius / haloRadius),
    mixedRgba(DEFAULT_NEUTRAL, color, frame.hero.colorMix, 0.9 * frame.hero.opacity),
  )
  gradient.addColorStop(
    0.24,
    mixedRgba(DEFAULT_NEUTRAL, color, frame.hero.colorMix, 0.3 * frame.hero.opacity),
  )
  gradient.addColorStop(
    0.48,
    mixedRgba('#7ec2ff', color, frame.hero.colorMix, 0.09 * frame.hero.opacity),
  )
  gradient.addColorStop(1, mixedRgba('#587aff', color, frame.hero.colorMix, 0))

  context.save()
  context.globalCompositeOperation = 'screen'
  context.fillStyle = gradient
  context.beginPath()
  context.arc(frame.hero.x, frame.hero.y, haloRadius, 0, TAU)
  context.fill()
  // A fine optical cross gives the same persistent star a readable silhouette.
  // Its length follows the existing continuous scale, including orbit handoff.
  const rayLength = 40 * scale
  context.save()
  context.translate(frame.hero.x, frame.hero.y)
  for (const thickness of [0.9, 0.7]) {
    const ray = context.createLinearGradient(-rayLength, 0, rayLength, 0)
    ray.addColorStop(0, mixedRgba(DEFAULT_NEUTRAL, color, frame.hero.colorMix, 0))
    ray.addColorStop(0.5, mixedRgba(DEFAULT_NEUTRAL, color, frame.hero.colorMix, 0.45 * frame.hero.opacity))
    ray.addColorStop(1, mixedRgba(DEFAULT_NEUTRAL, color, frame.hero.colorMix, 0))
    context.fillStyle = ray
    context.fillRect(-rayLength, -thickness / 2, rayLength * 2, thickness)
    context.rotate(Math.PI / 2)
  }
  context.restore()
  context.fillStyle = `rgba(255, 255, 255, ${frame.hero.opacity})`
  context.beginPath()
  context.arc(frame.hero.x, frame.hero.y, coreRadius, 0, TAU)
  context.fill()
  context.restore()
  return Math.max(coreRadius, haloRadius * 0.12)
}

export function resolvePersonalJourneyOwnLabel({
  ownStar,
  frame,
  starRadius = 0,
  height = 844,
} = {}) {
  const text = typeof ownStar?.label === 'string' ? ownStar.label.trim() : ''
  if (
    !text
    || !frame
    || ![PERSONAL_JOURNEY_PHASES.HANDOFF, PERSONAL_JOURNEY_PHASES.ORBIT].includes(frame.phase)
    || frame.field.reveal <= 0
  ) return null

  const entry = frame.phase === PERSONAL_JOURNEY_PHASES.ORBIT
    ? 1
    : smoothJourneyProgress((frame.field.orbitElapsedMs - 2_850) / 850)
  if (entry <= 0) return null
  return {
    text,
    x: frame.hero.x,
    y: Math.min(
      Math.max(1, Number(height) || 844) - 10,
      frame.hero.y + Math.max(15, Number(starRadius) + 9),
    ),
    opacity: 0.82 * frame.hero.opacity * frame.field.reveal * entry,
  }
}

function drawOwnStarLabel(context, ownStar, width, height, frame, starRadius) {
  const label = resolvePersonalJourneyOwnLabel({ ownStar, frame, starRadius, height })
  if (!label) return
  context.save()
  context.globalAlpha = label.opacity
  context.font = '500 10.5px Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  context.lineWidth = 2
  context.strokeStyle = 'rgba(5, 9, 14, 0.65)'
  context.fillStyle = rgba('#e7f1ff', 0.92)
  context.strokeText(label.text, label.x, label.y)
  context.fillText(label.text, label.x, label.y)
  context.restore()
}

function phaseResult(phase, completed, reason) {
  return Object.freeze({ phase, completed, reason })
}

export function createPersonalJourneyRenderer(canvas, options = {}) {
  const context = canvas?.getContext?.('2d', { alpha: true })
  if (!context) throw new TypeError('Personal journey renderer requires a 2D canvas.')

  const ownerDocument = canvas.ownerDocument ?? (typeof document === 'undefined' ? null : document)
  const runtimeWindow = ownerDocument?.defaultView ?? (typeof window === 'undefined' ? null : window)
  const requestFrame = runtimeWindow?.requestAnimationFrame?.bind(runtimeWindow)
    ?? ((callback) => setTimeout(() => callback(Date.now()), 16))
  const cancelFrame = runtimeWindow?.cancelAnimationFrame?.bind(runtimeWindow) ?? clearTimeout
  const now = () => runtimeWindow?.performance?.now?.() ?? Date.now()
  const phaseWaiters = new Map()
  const state = {
    phase: PERSONAL_JOURNEY_PHASES.DISCOVERY,
    progress: 0,
    color: options.color ?? DEFAULT_COLOR,
    ownStar: options.ownStar ?? null,
    publicStars: [...(options.publicStars ?? [])].slice(0, MAX_PUBLIC_STARS),
  }
  let reduced = Boolean(options.reduced)
  let width = 1
  let height = 1
  let dpr = 1
  let destroyed = false
  let running = false
  let frameHandle = null
  let phaseAnimation = null
  let currentPhaseCompleted = false
  let createdAt = now()
  let orbitStartedAt = createdAt
  let lastOwnPosition = null
  let nebula = null, nebulaFailed = false
  let pausedAt = options.paused ? now() : null

  function settlePhaseWaiters(phase, result) {
    const waiters = phaseWaiters.get(phase)
    if (!waiters) return
    phaseWaiters.delete(phase)
    for (const resolve of waiters) resolve(result)
  }

  function completeCurrentPhase(reason = 'natural') {
    if (currentPhaseCompleted) return
    currentPhaseCompleted = true
    const result = phaseResult(state.phase, true, reason)
    settlePhaseWaiters(state.phase, result)
    options.onPhaseComplete?.(state.phase)
  }

  function interruptCurrentPhase(reason = 'interrupted') {
    phaseAnimation = null
    if (!currentPhaseCompleted) {
      settlePhaseWaiters(state.phase, phaseResult(state.phase, false, reason))
    }
  }

  function phaseTime(timestamp) {
    if (state.phase === PERSONAL_JOURNEY_PHASES.ORBIT) {
      return PERSONAL_JOURNEY_DURATIONS.handoff + Math.max(0, timestamp - orbitStartedAt)
    }
    if (personalJourneyDuration(state.phase) > 0) {
      return personalJourneyDuration(state.phase) * state.progress
    }
    return Math.max(0, timestamp - createdAt)
  }

  function emitOwnPosition(frame, radius) {
    if (typeof options.onOwnPosition !== 'function') return
    const next = {
      x: frame.hero.x,
      y: frame.hero.y,
      radius,
      color: state.ownStar?.color ?? state.color,
      depth: frame.hero.depth,
    }
    const changed = !lastOwnPosition
      || Math.abs(lastOwnPosition.x - next.x) >= 0.25
      || Math.abs(lastOwnPosition.y - next.y) >= 0.25
      || Math.abs(lastOwnPosition.radius - next.radius) >= 0.1
      || lastOwnPosition.color !== next.color
    if (!changed) return
    lastOwnPosition = next
    options.onOwnPosition(next)
  }

  function advancePhase(timestamp) {
    if (!phaseAnimation) return
    if (phaseAnimation.startedAt === null) phaseAnimation.startedAt = timestamp
    const elapsed = Math.max(0, timestamp - phaseAnimation.startedAt)
    const progress = clampJourneyProgress(elapsed / phaseAnimation.duration)
    state.progress = mixJourneyValue(
      phaseAnimation.fromProgress,
      phaseAnimation.toProgress,
      progress,
    )
    if (progress < 1) return
    state.progress = phaseAnimation.toProgress
    phaseAnimation = null
    completeCurrentPhase('natural')
  }

  function paint(timestamp = now()) {
    if (destroyed) return null
    timestamp = pausedAt ?? timestamp
    const timeMs = phaseTime(timestamp)
    const frame = resolvePersonalJourneyFrame({
      phase: state.phase,
      progress: state.progress,
      timeMs,
      width,
      height,
      reduced,
      ownStar: state.ownStar,
    })
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)
    drawBackground(context, null, width, height, frame)
    canvas.dataset.galaxyMaterial = stellarPlateStatus()
    if (!reduced && !nebulaFailed && frame.field.reveal > 0) {
      if (!nebula) { try { nebula=createStellarNebulaRenderer(()=>{nebulaFailed=true},{personal:true}) } catch { nebulaFailed=true } }
      const seconds=frame.field.orbitElapsedMs/1000
      const camera=flowCamera(seconds,0,{personal:true,width,height});camera.focal*=frame.field.scale
      const surface=nebula?.draw(camera,seconds,canvas.width,canvas.height,1,frame.field.reveal)
      if(surface) { context.drawImage(surface,0,0,width,height);canvas.dataset.galaxyMaterial='flowing-spiral' }
      else { nebulaFailed=true;drawGalaxyCore(context,width,height,frame) }
    } else drawGalaxyCore(context,width,height,frame)
    drawFarStars(context, width, height, frame, reduced ? 0 : Math.max(0, timestamp - createdAt))
    drawDiscoveryMotes(context, width, height, frame)
    drawOrbitDust(context, width, height, frame, false)
    drawPublicStars(context, state.publicStars, state.ownStar, width, height, frame)
    const ownColor = state.ownStar?.color ?? state.color
    drawOwnTrail(context, state.ownStar, ownColor, width, height, frame)
    const ownRadius = drawHeroStar(context, ownColor, width, height, frame)
    drawOrbitDust(context, width, height, frame, true)
    drawOwnStarLabel(context, state.ownStar, width, height, frame, ownRadius)
    emitOwnPosition(frame, ownRadius)
    return frame
  }

  let lastPaintAt = -Infinity
  function loop(timestamp) {
    if (!running || destroyed) return
    advancePhase(timestamp)
    if (phaseAnimation || timestamp-lastPaintAt >= 1000/30-.7) { paint(timestamp);lastPaintAt=timestamp }
    frameHandle = requestFrame(loop)
  }

  function shouldRun() {
    return !destroyed && !reduced && pausedAt === null && ownerDocument?.hidden !== true
  }

  function updateLoop() {
    const nextRunning = shouldRun()
    if (nextRunning && !running) {
      running = true
      frameHandle = requestFrame(loop)
    } else if (!nextRunning && running) {
      running = false
      if (frameHandle !== null) cancelFrame(frameHandle)
      frameHandle = null
      paint(now())
    } else if (!nextRunning) {
      paint(now())
    }
  }

  function resize() {
    if (destroyed) return
    const rectangle = canvas.getBoundingClientRect?.() ?? { width: canvas.clientWidth, height: canvas.clientHeight }
    const nextWidth = Math.max(1, Number(rectangle.width) || Number(canvas.clientWidth) || 390)
    const nextHeight = Math.max(1, Number(rectangle.height) || Number(canvas.clientHeight) || 844)
    const nextDpr = Math.min(Number(runtimeWindow?.devicePixelRatio) || 1, Number(options.dprCap) || 2)
    width = nextWidth
    height = nextHeight
    dpr = Math.max(1, nextDpr)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    paint(now())
  }

  function setPhase(phase, phaseOptions = {}) {
    const nextPhase = normalizePersonalJourneyPhase(phase)
    interruptCurrentPhase(nextPhase === state.phase ? 'restarted' : 'interrupted')
    state.phase = nextPhase
    currentPhaseCompleted = false
    const duration = Number.isFinite(phaseOptions.duration)
      ? Math.max(0, phaseOptions.duration)
      : personalJourneyDuration(nextPhase)
    const animate = phaseOptions.animate ?? true
    const fromProgress = clampJourneyProgress(phaseOptions.fromProgress ?? 0)
    const toProgress = clampJourneyProgress(phaseOptions.toProgress ?? 1)
    const staticProgress = clampJourneyProgress(phaseOptions.progress ?? toProgress)
    state.progress = reduced || !animate || duration <= 0 ? staticProgress : fromProgress
    if (nextPhase === PERSONAL_JOURNEY_PHASES.ORBIT) orbitStartedAt = now()

    if (!reduced && animate && duration > 0 && fromProgress !== toProgress) {
      phaseAnimation = {
        phase: nextPhase,
        startedAt: null,
        duration,
        fromProgress,
        toProgress,
      }
    } else if (state.progress >= toProgress) {
      currentPhaseCompleted = true
    }
    paint(now())
    updateLoop()
    return api
  }

  function setProgress(progress) {
    phaseAnimation = null
    state.progress = clampJourneyProgress(progress)
    if (state.progress < 1) currentPhaseCompleted = false
    else completeCurrentPhase('manual')
    paint(now())
    updateLoop()
    return api
  }

  function setColor(color) {
    state.color = typeof color === 'string' && color.trim() ? color : DEFAULT_COLOR
    paint(now())
    return api
  }

  function setOwnStar(ownStar) {
    state.ownStar = ownStar ? { ...ownStar } : null
    lastOwnPosition = null
    paint(now())
    return api
  }

  function setPublicStars(stars) {
    state.publicStars = [...(stars ?? [])].slice(0, MAX_PUBLIC_STARS)
    paint(now())
    return api
  }

  function setReduced(next) {
    const wasReduced = reduced
    reduced = Boolean(next)
    if (reduced) { nebula?.destroy(); nebula=null }
    if (reduced) {
      phaseAnimation = null
      state.progress = personalJourneyDuration(state.phase) > 0 ? 1 : state.progress
      if (state.progress >= 1) completeCurrentPhase(wasReduced ? 'static' : 'reduced')
    }
    paint(now())
    updateLoop()
    return api
  }

  function setPaused(next) {
    if (next && pausedAt === null) pausedAt = now()
    else if (!next && pausedAt !== null) {
      const elapsed = now() - pausedAt
      createdAt += elapsed; orbitStartedAt += elapsed
      if (phaseAnimation?.startedAt !== null && phaseAnimation) phaseAnimation.startedAt += elapsed
      pausedAt = null
    }
    updateLoop()
    return api
  }

  function setState(next = {}) {
    if (Object.hasOwn(next, 'phase')) {
      setPhase(next.phase, {
        animate: false,
        progress: Object.hasOwn(next, 'progress') ? next.progress : 1,
      })
    } else if (Object.hasOwn(next, 'progress')) {
      setProgress(next.progress)
    }
    if (Object.hasOwn(next, 'color')) state.color = next.color || DEFAULT_COLOR
    if (Object.hasOwn(next, 'ownStar')) state.ownStar = next.ownStar ? { ...next.ownStar } : null
    if (Object.hasOwn(next, 'publicStars')) {
      state.publicStars = [...(next.publicStars ?? [])].slice(0, MAX_PUBLIC_STARS)
    }
    lastOwnPosition = null
    paint(now())
    updateLoop()
    return api
  }

  function waitForPhase(phase) {
    const expectedPhase = normalizePersonalJourneyPhase(phase)
    if (
      state.phase === expectedPhase
      && currentPhaseCompleted
      && !phaseAnimation
    ) {
      return Promise.resolve(phaseResult(expectedPhase, true, 'already-complete'))
    }
    return new Promise((resolve) => {
      const waiters = phaseWaiters.get(expectedPhase) ?? new Set()
      waiters.add(resolve)
      phaseWaiters.set(expectedPhase, waiters)
    })
  }

  function renderNow(timestamp = now()) {
    advancePhase(timestamp)
    return paint(timestamp)
  }

  function destroy() {
    if (destroyed) return
    destroyed = true
    running = false
    phaseAnimation = null
    if (frameHandle !== null) cancelFrame(frameHandle)
    frameHandle = null
    nebula?.destroy(); nebula=null
    stopPlateListener()
    resizeObserver?.disconnect()
    runtimeWindow?.removeEventListener?.('resize', resize)
    ownerDocument?.removeEventListener?.('visibilitychange', updateLoop)
    for (const [phase, waiters] of phaseWaiters) {
      const result = phaseResult(phase, false, 'destroyed')
      for (const resolve of waiters) resolve(result)
    }
    phaseWaiters.clear()
  }

  const api = Object.freeze({
    setState,
    setPhase,
    setProgress,
    setColor,
    setOwnStar,
    setPublicStars,
    setReduced,
    setPaused,
    waitForPhase,
    renderNow,
    resize,
    destroy,
  })

  const stopPlateListener = onStellarPlateReady(() => { if (!destroyed && ownerDocument?.hidden !== true) paint(now()) })
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
  resizeObserver?.observe(canvas)
  if (!resizeObserver) runtimeWindow?.addEventListener?.('resize', resize)
  ownerDocument?.addEventListener?.('visibilitychange', updateLoop)
  resize()
  updateLoop()
  return api
}
