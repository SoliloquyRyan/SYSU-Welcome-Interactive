// D-063 shared rendering core. Business state and the only animation loop stay in galaxy-renderer.
import {
  starSpectralPalette, supernovaTransitionEnvelope,
  assemblyDensityEnvelope, DECORATIVE_STAR_COUNT, TECHNICAL_STAR_CAPACITY,
} from './galaxy-renderer.js'
import { ORBITAL_SIGNAL_PALETTE } from '../../styles/orbital-signal.js'
import { flowCamera, flowPoint, stellarFormation, projectFlowPoint } from '../../rendering/stellar-flow.js'
import { createStellarNebulaRenderer } from '../../rendering/stellar-nebula.js'
import { CINEMA_TIMING } from '../../rendering/cinema-timing.js'

export const CUE_AT = 9
export const TRANSITION_SECONDS = CINEMA_TIMING.openingMs / 1000
export const END_AT = CUE_AT + TRANSITION_SECONDS
export const DURATION = END_AT + 1.6
const TAU = Math.PI * 2
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const mix = (a, b, t) => a + (b - a) * t
const smooth = (v) => { const x = clamp(v); return x * x * x * (x * (x * 6 - 15) + 10) }
function random(key) {
  let h = 2166136261
  for (const c of String(key)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15
  return (h >>> 0) / 4294967295
}
export function cameraAt(seconds, p = clamp((seconds-CUE_AT)/TRANSITION_SECONDS), _live = false) { return flowCamera(seconds,p) }
export const project = projectFlowPoint

function particle(star, decorative = false) {
  const slot = star.formationSlot
  const seed = random(`${slot}:depth`), flux = random(`${slot}:luminance`)
  const formation = stellarFormation(slot)
  return { slot, publicStarId: decorative ? undefined : star.publicStarId, decorative, seed, formation,
    radius: decorative ? 0.40 + flux ** 5.6 * 0.95 : 1.35 + flux ** 1.6 * 1.25,
    alpha: decorative ? 0.30 + flux ** 1.8 * 0.38 : 0.88 + flux * 0.12,
    palette: starSpectralPalette(decorative ? '#c3d0df' : star.displayColor ?? '#e5eaec') }
}

export function makePublicStars(publicStars) {
  return [...Array.from({ length: DECORATIVE_STAR_COUNT }, (_, i) => particle({ formationSlot: `decorative:${i}` }, true)),
    ...publicStars.slice(0, TECHNICAL_STAR_CAPACITY).map(star => particle(star))]
}

function projectRiverStar(star,seconds,camera,width,height) {
  return projectFlowPoint(flowPoint(star.formation,seconds,camera.p),camera,width,height)
}
export function projectPublicStar(star,seconds,width,height) {
  return projectRiverStar(particle(star),seconds,cameraAt(seconds,0,true),width,height)
}

function glow(context, x, y, radius, stops) {
  if (radius < .01) return
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
  for (const [at, color] of stops) gradient.addColorStop(at, color)
  context.fillStyle = gradient; context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
}

export function createCinematicGalaxyScene(canvas, { stars: publicStars = [], onFailure = () => {} } = {}) {
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true })
  if (!context) throw new Error('Canvas2D unavailable')
  let dust, failed = false, stars = makePublicStars(publicStars), destroyed = false
  let count = Math.min(publicStars.length, TECHNICAL_STAR_CAPACITY)
  const fail = reason => { failed = true; context.clearRect(0, 0, canvas.width, canvas.height); onFailure(reason) }
  const projectStar = (star, seconds, camera) => projectRiverStar(star, seconds, camera, canvas.width, canvas.height)
  function drawFrame(seconds, frame = {}) {
    const width = canvas.width, height = canvas.height
    context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1
    context.clearRect(0, 0, width, height)
    const p = frame.progress ?? clamp((seconds - CUE_AT) / TRANSITION_SECONDS)
    if (destroyed || failed || p >= 1) return
    if (!dust) {
      try { dust = createStellarNebulaRenderer(fail) } catch (error) { fail(error.message); return }
    }
    const camera = cameraAt(seconds, p, frame.live === true)
    const e = supernovaTransitionEnvelope(p)
    const density = assemblyDensityEnvelope(count, seconds * 1000)
    const surface = dust.draw(camera, seconds, width, height, density.ambientGain * density.diskBreath, frame.layer === 'sky' ? 0 : 1)
    if (!surface) { fail('Renderer unavailable'); return }
    context.drawImage(surface, 0, 0, width, height)
    const previousTime = Math.max(0, seconds - mix(1 / 100, 1 / 42, e.convergence))
    const previousCamera = cameraAt(previousTime, Math.max(0, p - (seconds - previousTime) / TRANSITION_SECONDS), frame.live === true)
    const starVisibility = (1 - smooth((p - .55) / .14))
    context.save(); context.globalCompositeOperation = 'screen'
    for (const star of starVisibility > .002 && !['sky','nebula'].includes(frame.layer) ? stars : []) {
      const current = projectStar(star, seconds, camera)
      if (!current || current.x < -30 || current.x > width + 30 || current.y < -30 || current.y > height + 30) continue
      const perspective = clamp(4.8 / current.depth, .55, 2.6)
      const radius = Math.max(.18, star.radius * perspective * width / 1920 * (1 - e.convergence * .27) * (1 - e.compression * .70))
      const arrival = frame.arrivals?.get(star.publicStarId)
      const arrivalAlpha = arrival ? smooth(((frame.timestamp - arrival.startedAt) / 1550 - .67) / .3) : 1
      const opacity = star.alpha * starVisibility * arrivalAlpha
      context.globalAlpha = opacity
      const previous = projectStar(star, previousTime, previousCamera)
      if (previous && p < .68) {
        const dx = current.x - previous.x, dy = current.y - previous.y, distance = Math.hypot(dx, dy)
        if (distance > .25) {
          const bounded = Math.min(1, 32 / distance)
          context.beginPath(); context.moveTo(current.x - dx * bounded, current.y - dy * bounded); context.lineTo(current.x, current.y)
          context.lineWidth = Math.max(.35, radius * .65); context.strokeStyle = star.palette.trail
          context.globalAlpha *= .32; context.stroke(); context.globalAlpha = opacity
        }
      }
      if (!star.decorative && radius > .58) glow(context, current.x, current.y, radius * 6, [[0,star.palette.halo],[.12,star.palette.halo],[.6,star.palette.haloFade],[1,star.palette.haloFade]])
      // A minority of real stars get fine optical rays. Decorative points stay
      // small; all real stars retain their locked color and formation position.
      if (!star.decorative && star.seed > .90 && p < .55) {
        const ray = radius * (3.5 + star.seed * 1.5)
        context.globalAlpha = opacity * .42
        context.strokeStyle = star.palette.glint
        context.lineWidth = Math.max(.4, width / 1920 * .55)
        context.beginPath()
        context.moveTo(current.x - ray, current.y); context.lineTo(current.x + ray, current.y)
        context.moveTo(current.x, current.y - ray * .68); context.lineTo(current.x, current.y + ray * .68)
        context.stroke()
        context.globalAlpha = opacity
      }
      if (!star.decorative) glow(context, current.x, current.y, radius * 1.8,
        [[0,star.palette.glint],[.22,star.palette.core],[.55,star.palette.halo],[1,star.palette.haloFade]])
      context.fillStyle = e.compression > .6 ? ORBITAL_SIGNAL_PALETTE.star : star.palette.core
      context.beginPath(); context.arc(current.x, current.y, radius * (star.decorative ? .67 : .48), 0, TAU); context.fill()
    }
    context.globalAlpha = 1
    const cx = width * camera.center[0], cy = height * camera.center[1], unit = height
    if (p > .38) {
      const compression = e.compression * (1 - smooth((p - .68) / .13))
      const radius = unit * mix(.026, .004, e.compression)
      glow(context, cx, cy, radius * 9, [[0,`rgba(193,213,247,${compression * .30})`],[.24,`rgba(132,168,216,${compression * .07})`],[1,'rgba(132,168,216,0)']])
      glow(context, cx, cy, radius, [[0,`rgba(255,252,240,${compression})`],[.14,`rgba(232,240,255,${compression * .95})`],[.6,`rgba(131,179,229,${compression * .28})`],[1,'rgba(131,179,229,0)']])
    }
    context.restore()
    // Spatial exposure expands beyond all four corners before transparency rises.
    // Its edge stays outside the raster at handoff; alpha settles to exactly zero.
    const wash = smooth((p - .73) / .16)
    if (wash > 0) glow(context, cx, cy, Math.hypot(width, height) * (.12 + wash * 1.4),
      [[0,`rgba(244,249,255,${wash})`],[.24,`rgba(243,248,255,${wash * .99})`],[.62,`rgba(238,245,255,${wash * .94})`],[1,'rgba(225,238,252,0)']])
    const reveal = smooth((p - .83) / .17)
    if (reveal > 0) { context.globalCompositeOperation = 'destination-out'; context.globalAlpha = reveal; context.fillStyle = '#000'; context.fillRect(0, 0, width, height) }
    context.globalAlpha = 1; context.globalCompositeOperation = 'source-over'
  }
  // Composite the incoming live galaxy under the final exposure. Only the last
  // two seconds need a second draw; the same WebGL context is reused. OBS overlay
  // does not use this buffer and still ends at exactly zero alpha.
  let revealLayer, lastFrame = {progress:0,live:true}
  function draw(seconds, frame = {}) {
    lastFrame = frame
    const p = frame.progress ?? clamp((seconds - CUE_AT) / TRANSITION_SECONDS)
    if (frame.programBackdrop && p >= 1) {
      revealLayer = null
      drawFrame(seconds, { ...frame, progress: 0 })
      return
    }
    drawFrame(seconds, frame)
    if (!frame.programBackdrop || p <= .83 || failed || destroyed) { revealLayer = null; return }
    revealLayer ??= document.createElement('canvas')
    const scale = Math.min(1, 1920 / canvas.width)
    const w = Math.round(canvas.width * scale), h = Math.round(canvas.height * scale)
    if (revealLayer.width !== w || revealLayer.height !== h) { revealLayer.width = w; revealLayer.height = h }
    const layer = revealLayer.getContext('2d')
    layer.clearRect(0, 0, w, h)
    layer.drawImage(canvas, 0, 0, w, h)
    drawFrame(seconds, { ...frame, progress: 0 })
    context.drawImage(revealLayer, 0, 0, canvas.width, canvas.height)
  }
  return {
    draw,
    get failed() { return failed },
    setStars(value) { count = Math.min(value.length, TECHNICAL_STAR_CAPACITY); stars = makePublicStars(value) },
    diagnostics(seconds) {
      const camera = cameraAt(seconds, lastFrame.programBackdrop && lastFrame.progress >= 1 ? 0 : lastFrame.progress ?? clamp((seconds-CUE_AT)/TRANSITION_SECONDS),lastFrame.live === true)
      return { participantCount: stars.filter(s => !s.decorative).length, decorativeCount: DECORATIVE_STAR_COUNT,
        camera, samplePoints: stars.filter(s => !s.decorative).slice(0, 8).map(s => ({ slot: s.slot, ...projectStar(s, seconds, camera) })),
        visibleCanvas: { width: canvas.width, height: canvas.height },
        offscreen: dust ? { width: dust.canvas.width, height: dust.canvas.height } : null, failed }
    },
    loseContext() { dust?.loseContext() },
    destroy() { destroyed = true; revealLayer = null; dust?.destroy(); context.clearRect(0, 0, canvas.width, canvas.height) },
  }
}
