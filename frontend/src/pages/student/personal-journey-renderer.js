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

// A restrained stellar palette: color variety is visible at close range but
// no single saturated hue turns the galaxy into confetti. Assignment is
// deterministic, so particles never change color between frames or devices.
export const PERSONAL_JOURNEY_AMBIENT_COLORS = Object.freeze([
  '#d9efff',
  '#9fcfff',
  '#bce8e5',
  '#fff0cf',
  '#ffd5bf',
  '#d6ccff',
])

export const PERSONAL_JOURNEY_GALAXY_CORE_STOPS = Object.freeze([
  Object.freeze({ offset: 0, color: '#f7fbff', alpha: 0.42 }),
  Object.freeze({ offset: 0.07, color: '#dbeeff', alpha: 0.3 }),
  Object.freeze({ offset: 0.2, color: '#8fc5ff', alpha: 0.19 }),
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

function imageDimensions(image) {
  return {
    width: Number(image?.naturalWidth ?? image?.videoWidth ?? image?.width) || 0,
    height: Number(image?.naturalHeight ?? image?.videoHeight ?? image?.height) || 0,
  }
}

function coverRect(image, width, height) {
  const source = imageDimensions(image)
  if (source.width <= 0 || source.height <= 0) return null
  const scale = Math.max(width / source.width, height / source.height)
  const drawWidth = source.width * scale
  const drawHeight = source.height * scale
  return {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  }
}

function drawProceduralNebula(context, width, height, frame) {
  const center = context.createRadialGradient(
    width * 0.5,
    height * 0.38,
    0,
    width * 0.5,
    height * 0.38,
    Math.max(width, height) * 0.58,
  )
  center.addColorStop(0, rgba('#284d98', 0.2 * frame.background.opacity))
  center.addColorStop(0.34, rgba('#122d68', 0.1 * frame.background.opacity))
  center.addColorStop(1, 'rgba(1, 3, 10, 0)')
  context.fillStyle = center
  context.fillRect(0, 0, width, height)

  context.save()
  context.globalCompositeOperation = 'screen'
  const upper = context.createRadialGradient(
    width * 0.74,
    height * 0.08,
    0,
    width * 0.74,
    height * 0.08,
    width * 0.82,
  )
  upper.addColorStop(0, rgba('#3abbd4', 0.075 * frame.background.opacity))
  upper.addColorStop(0.28, rgba('#3048a8', 0.06 * frame.background.opacity))
  upper.addColorStop(1, 'rgba(8, 18, 56, 0)')
  context.fillStyle = upper
  context.fillRect(0, 0, width, height)

  const lower = context.createRadialGradient(
    width * 0.04,
    height * 0.72,
    0,
    width * 0.04,
    height * 0.72,
    width * 0.72,
  )
  lower.addColorStop(0, rgba('#203f8f', 0.07 * frame.background.opacity))
  lower.addColorStop(0.42, rgba('#14285d', 0.04 * frame.background.opacity))
  lower.addColorStop(1, 'rgba(3, 8, 24, 0)')
  context.fillStyle = lower
  context.fillRect(0, 0, width, height)
  context.restore()
}

function drawNebulaImage(context, image, width, height, frame) {
  const rectangle = coverRect(image, width, height)
  if (!rectangle) return false

  context.save()
  context.translate(
    width * (0.5 + frame.background.xPercent / 100),
    height * (0.5 + frame.background.yPercent / 100),
  )
  context.scale(frame.background.scale, frame.background.scale)
  context.translate(-width * 0.5, -height * 0.5)
  context.globalAlpha = frame.background.opacity
  if ('filter' in context) {
    context.filter = `saturate(${frame.background.saturation}) brightness(${frame.background.brightness})`
  }
  context.drawImage(image, rectangle.x, rectangle.y, rectangle.width, rectangle.height)
  context.restore()

  context.save()
  context.globalCompositeOperation = 'screen'
  context.translate(
    width * (0.5 + frame.background.nebulaXPercent / 100),
    height * (0.5 + frame.background.nebulaYPercent / 100),
  )
  context.scale(frame.background.nebulaScale, frame.background.nebulaScale)
  context.translate(-width * 0.5, -height * 0.5)
  context.globalAlpha = frame.background.nebulaOpacity
  if ('filter' in context) context.filter = 'saturate(1.15) blur(8px)'
  context.drawImage(image, rectangle.x, rectangle.y, rectangle.width, rectangle.height)
  context.restore()
  return true
}

function drawBackground(context, image, width, height, frame) {
  context.save()
  context.globalCompositeOperation = 'source-over'
  context.globalAlpha = 1
  context.fillStyle = '#01030a'
  context.fillRect(0, 0, width, height)
  if (!image || !drawNebulaImage(context, image, width, height, frame)) {
    drawProceduralNebula(context, width, height, frame)
  }
  context.restore()
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
    const angle = star.angle + driftTime / 21_000 * (star.depth * 0.55 + 0.12)
    const radial = star.radius * Math.min(width, height) * radialFactor
    const x = centerX + Math.cos(angle) * radial * 1.08
    const y = centerY + Math.sin(angle) * radial * 1.44
    const alpha = mixJourneyValue(0.04, star.alpha, reveal)
    context.beginPath()
    context.fillStyle = rgba(star.color, alpha)
    context.arc(x, y, star.size * mixJourneyValue(0.45, 1, reveal), 0, TAU)
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

function orbitDustProjection(particle, width, height, frame, thetaOffset = 0) {
  const radii = [0.3, 0.45, 0.63, 0.82]
  const radius = Math.min(0.94, Math.max(0.2, radii[particle.band] + particle.radialNoise))
  const cycle = 48_000 + particle.band * 20_000
  const theta = particle.baseAngle
    + frame.field.orbitElapsedMs / cycle * TAU * particle.speed
    + thetaOffset
  return {
    ...projectPersonalOrbit({
      width,
      height,
      radius,
      theta,
      rotationDegrees: frame.field.rotationDegrees + (particle.band - 1.5) * 1.15,
      scale: frame.field.scale,
    }),
    orbitRadius: radius,
  }
}

function paintOrbitParticle(context, point, previous, particle, alpha, scale) {
  const radius = particle.size * (0.62 + scale * 0.38) * (point.depth > 0 ? 1.14 : 0.84)
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

function addGalaxyCoreStops(gradient, reveal) {
  for (const stop of PERSONAL_JOURNEY_GALAXY_CORE_STOPS) {
    gradient.addColorStop(stop.offset, rgba(stop.color, stop.alpha * reveal))
  }
}

function drawGalaxyCore(context, width, height, frame) {
  if (frame.field.reveal <= 0) return
  const centerX = width * 0.48
  const centerY = height * 0.41
  const reveal = frame.field.reveal
  const fieldScale = frame.field.scale

  // The luminous galactic disc is drawn in an elliptical coordinate system:
  // a compact white-blue core, then progressively dimmer blue structure.
  context.save()
  context.globalCompositeOperation = 'screen'
  context.translate(centerX, centerY)
  context.rotate(frame.field.rotationDegrees * Math.PI / 180)
  context.scale(fieldScale, fieldScale * 0.35)
  const discRadius = width * 0.58
  const disc = context.createRadialGradient(0, 0, 0, 0, 0, discRadius)
  addGalaxyCoreStops(disc, reveal)
  context.fillStyle = disc
  context.fillRect(-discRadius, -discRadius, discRadius * 2, discRadius * 2)
  context.restore()

  context.save()
  context.globalCompositeOperation = 'screen'
  const nucleusRadius = Math.max(12, width * 0.085 * fieldScale)
  const nucleus = context.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    nucleusRadius,
  )
  nucleus.addColorStop(0, rgba('#ffffff', 0.34 * reveal))
  nucleus.addColorStop(0.16, rgba('#e8f6ff', 0.24 * reveal))
  nucleus.addColorStop(0.48, rgba('#8fc7ff', 0.09 * reveal))
  nucleus.addColorStop(1, rgba('#5178db', 0))
  context.fillStyle = nucleus
  context.fillRect(0, 0, width, height)

  context.translate(centerX, centerY)
  context.rotate(frame.field.rotationDegrees * Math.PI / 180)
  context.setLineDash([2, 13])
  context.lineCap = 'round'
  const orbitBands = [
    { radius: 0.4, alpha: 0.07 },
    { radius: 0.63, alpha: 0.042 },
    { radius: 0.84, alpha: 0.024 },
  ]
  for (const band of orbitBands) {
    context.strokeStyle = rgba('#a6d1ff', band.alpha * reveal)
    context.lineWidth = 0.65
    context.beginPath()
    context.ellipse(
      0,
      0,
      width * 0.54 * band.radius * fieldScale,
      height * 0.18 * band.radius * fieldScale,
      0,
      -0.35,
      Math.PI * 1.48,
    )
    context.stroke()
  }
  context.restore()
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
  if (frame.field.reveal <= 0) return
  const orbit = ownOrbitConfig(ownStar)
  const theta = orbit.angle + frame.field.orbitElapsedMs / orbit.period * TAU
  const current = projectPersonalOrbit({
    width,
    height,
    radius: orbit.radius,
    theta,
    rotationDegrees: frame.field.rotationDegrees,
    scale: 1,
  })
  const previous = projectPersonalOrbit({
    width,
    height,
    radius: orbit.radius,
    theta: theta - 0.055,
    rotationDegrees: frame.field.rotationDegrees,
    scale: 1,
  })
  const entry = smoothJourneyProgress(frame.field.orbitElapsedMs / 2_750)
  const trailAlpha = frame.field.reveal
    * mixJourneyValue(0.11, 0.026, smoothJourneyProgress((frame.field.orbitElapsedMs - 1_500) / 2_300))
    * entry
  const gradient = context.createLinearGradient(previous.x, previous.y, current.x, current.y)
  gradient.addColorStop(0, rgba(color, 0))
  gradient.addColorStop(1, rgba(color, trailAlpha))

  context.save()
  context.globalCompositeOperation = 'screen'
  context.lineCap = 'round'
  context.strokeStyle = gradient
  context.lineWidth = 4
  context.shadowColor = rgba(color, 0.18)
  context.shadowBlur = 14
  context.beginPath()
  context.moveTo(previous.x, previous.y)
  context.quadraticCurveTo(
    (previous.x + frame.hero.x) / 2,
    (previous.y + frame.hero.y) / 2 - 2,
    frame.hero.x,
    frame.hero.y,
  )
  context.stroke()
  context.restore()
}

function drawHeroStar(context, color, width, height, frame) {
  if (frame.hero.opacity <= 0 || frame.hero.scale <= 0) return 0
  const scale = frame.hero.scale
  const haloRadius = Math.max(1.5, 72 * scale * frame.hero.glowScale)
  const coreRadius = Math.max(0.45, 4.2 * scale)
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
  context.font = '600 9.5px Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  context.lineWidth = 3
  context.strokeStyle = 'rgba(1, 4, 12, 0.88)'
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
    nebulaImage: options.nebulaImage ?? null,
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
    drawBackground(context, state.nebulaImage, width, height, frame)
    drawFarStars(context, width, height, frame, reduced ? 0 : Math.max(0, timestamp - createdAt))
    drawDiscoveryMotes(context, width, height, frame)
    drawOrbitDust(context, width, height, frame, false)
    drawGalaxyCore(context, width, height, frame)
    drawPublicStars(context, state.publicStars, state.ownStar, width, height, frame)
    const ownColor = state.ownStar?.color ?? state.color
    drawOwnTrail(context, state.ownStar, ownColor, width, height, frame)
    const ownRadius = drawHeroStar(context, ownColor, width, height, frame)
    drawOrbitDust(context, width, height, frame, true)
    drawOwnStarLabel(context, state.ownStar, width, height, frame, ownRadius)
    emitOwnPosition(frame, ownRadius)
    return frame
  }

  function loop(timestamp) {
    if (!running || destroyed) return
    advancePhase(timestamp)
    paint(timestamp)
    frameHandle = requestFrame(loop)
  }

  function shouldRun() {
    return !destroyed && !reduced && ownerDocument?.hidden !== true
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

  function setNebulaImage(image) {
    state.nebulaImage = image ?? null
    paint(now())
    return api
  }

  function setReduced(next) {
    const wasReduced = reduced
    reduced = Boolean(next)
    if (reduced) {
      phaseAnimation = null
      state.progress = personalJourneyDuration(state.phase) > 0 ? 1 : state.progress
      if (state.progress >= 1) completeCurrentPhase(wasReduced ? 'static' : 'reduced')
    }
    paint(now())
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
    if (Object.hasOwn(next, 'nebulaImage')) state.nebulaImage = next.nebulaImage ?? null
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
    setNebulaImage,
    setReduced,
    waitForPhase,
    renderNow,
    resize,
    destroy,
  })

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
  resizeObserver?.observe(canvas)
  if (!resizeObserver) runtimeWindow?.addEventListener?.('resize', resize)
  ownerDocument?.addEventListener?.('visibilitychange', updateLoop)
  resize()
  updateLoop()
  return api
}
