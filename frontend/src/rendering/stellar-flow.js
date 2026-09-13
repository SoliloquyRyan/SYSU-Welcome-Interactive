// D-076: one world-space spiral and clock for gas, stars and both cameras.
// Pure presentation math: formationSlot selects a stable position, never a count.
export const FLOW = Object.freeze({ radius: 2.65, period: 260, winding: 4.7, phase: .55 })
const TAU = Math.PI * 2
const mix = (a, b, t) => a + (b - a) * t
export const clampFlow = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export function easeFlow(v) { const x = clampFlow(v); return x * x * x * (x * (x * 6 - 15) + 10) }
export function flowSeed(key) {
  let h = 2166136261
  for (const c of String(key)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15
  return (h >>> 0) / 4294967295
}
export function flowAngle(radius, seconds) {
  return seconds * TAU / FLOW.period + .095 * (Math.sin(seconds / 26 - radius * 3.2) - Math.sin(-radius * 3.2))
}
export function spiralAngle(radius, arm = 0) { return FLOW.phase + radius * FLOW.winding + arm * Math.PI }
export function stellarFormation(slot) {
  const u = flowSeed(`${slot}:radius`), group = flowSeed(`${slot}:population`)
  const radius = group < .10 ? .035 + u ** .7 * .18 : .18 + u ** .82 * .78
  const arm = flowSeed(`${slot}:arm`) > .5 ? 1 : 0
  const scatter = (flowSeed(`${slot}:scatter-a`) + flowSeed(`${slot}:scatter-b`) - 1) * .85
  const angle = group > .83 ? flowSeed(`${slot}:angle`) * TAU : spiralAngle(radius, arm) + scatter
  return { radius, angle, z: (flowSeed(`${slot}:depth`) - .5) * (.065 + radius * .045), arm }
}
export function personalStarFormation(ownStar) {
  const radius = clampFlow(Number.isFinite(ownStar?.orbitRadius) ? ownStar.orbitRadius : .60, .36, .66)
  const offset = Number.isFinite(ownStar?.orbitAngle) ? ownStar.orbitAngle : -.82
  return { radius, angle: spiralAngle(radius) + Math.sin(offset) * .18, z: .035 }
}
export function flowPoint(position, seconds, progress = 0) {
  const collapse = easeFlow((progress - .10) / .47), compression = easeFlow((progress - .476) / .19)
  const scale = Math.exp(-collapse * 1.5 - compression * 3.8)
  const angle = position.angle + flowAngle(position.radius, seconds) + collapse * 1.65 + compression * 2
  const r = position.radius * FLOW.radius * scale
  return [Math.cos(angle) * r, Math.sin(angle) * r, (position.z ?? 0) * scale]
}
const normalize = a => { const l = Math.hypot(...a); return a.map(v => v / l) }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export function flowCamera(seconds, progress = 0, { personal = false, width = 1920, height = 1080 } = {}) {
  const approach = easeFlow((progress - .025) / .49)
  const drift = Math.sin(seconds / 85)
  const distance = 4.9 - drift * .16 - approach * 2.35
  const azimuth = -1.38 + Math.sin(seconds / 113) * .065 + approach * .09
  const elevation = mix(.54 + Math.sin(seconds / 107) * .012, .38, approach)
  const position = [Math.cos(azimuth) * Math.cos(elevation) * distance,
    Math.sin(azimuth) * Math.cos(elevation) * distance, Math.sin(elevation) * distance]
  const forward = normalize(position.map(v => -v)), flatRight = normalize(cross(forward, [0, 0, 1]))
  const flatUp = normalize(cross(flatRight, forward)), roll = -.23 + Math.sin(seconds / 97) * .018
  const right = flatRight.map((v, i) => v * Math.cos(roll) + flatUp[i] * Math.sin(roll))
  const up = flatUp.map((v, i) => v * Math.cos(roll) - flatRight[i] * Math.sin(roll))
  return { position, forward, right, up, focal: personal ? Math.min(.85, width / height * 1.05) : 1.15,
    center: [mix(personal ? .50 : .58, .5, easeFlow(progress / .63)), mix(personal ? .435 : .43, .49, easeFlow(progress / .63))], p: progress }
}
export function projectFlowPoint(point, camera, width, height) {
  const delta = point.map((v, i) => v - camera.position[i]), depth = dot(delta, camera.forward)
  if (depth <= .09) return null
  const scale = camera.focal * height / depth
  return { x: width * camera.center[0] + dot(delta, camera.right) * scale,
    y: height * camera.center[1] - dot(delta, camera.up) * scale, depth, scale }
}
export function projectFlowStar(position, seconds, width, height, personal = false) {
  return projectFlowPoint(flowPoint(position, seconds), flowCamera(seconds, 0, { personal, width, height }), width, height)
}
// GLSL uses exactly the same constants and bounded differential motion as JS.
export const FLOW_GLSL = `
float flowAngle(float r,float t){return t*6.28318530718/${FLOW.period.toFixed(1)}+.095*(sin(t/26.-r*3.2)-sin(-r*3.2));}
float spiralAngle(float r){return ${FLOW.phase}+r*${FLOW.winding};}
`
