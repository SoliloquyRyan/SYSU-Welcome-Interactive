// The isolated D-062 preview uses the same approved rendering core as /screen.
import { createCinematicGalaxyScene, makePublicStars } from '../../src/pages/screen/cinematic-galaxy-scene.js'
export { cameraAt, project, CUE_AT, TRANSITION_SECONDS, END_AT, DURATION } from '../../src/pages/screen/cinematic-galaxy-scene.js'

function random(key) {
  let h = 2166136261
  for (const c of String(key)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15
  return (h >>> 0) / 4294967295
}
function fixtures(count) {
  const colors = ['#afc8ff', '#ffd79a', '#deeaff', '#f4b89b', '#b1dfe5', '#c5c7eb']
  return Array.from({ length: Math.max(0, Math.min(300, Math.round(count))) }, (_, i) => ({
    publicStarId: `preview-${i}`, formationSlot: i,
    displayColor: colors[Math.floor(random(`${i}:color`) * colors.length)],
  }))
}
export function makeStars(count) { return makePublicStars(fixtures(count)) }
export function createShotRenderer(canvas, { count = 220, ...options } = {}) {
  const renderer = createCinematicGalaxyScene(canvas, { ...options, stars: fixtures(count) })
  return {
    draw: renderer.draw, diagnostics: renderer.diagnostics, destroy: renderer.destroy,
    loseContext: renderer.loseContext, get failed() { return renderer.failed },
    setCount(value) { renderer.setStars(fixtures(value)) },
  }
}
