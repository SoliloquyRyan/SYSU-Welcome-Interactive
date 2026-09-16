import { ART_SKY_REGIONS } from './program-visuals'

// Stable slot placement, independent of crowd size, connection count or list order.
export function skyHash(value) {
  let hash = 2166136261
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d); hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b); hash ^= hash >>> 16
  return hash >>> 0
}
const unit = value => (skyHash(value) % 100000) / 100000
// The empty chat sky stays visible. Bubbles and sheets render above it; hard
// controls, the college header and the current title keep their own clear space.
export const MOBILE_SKY_UI_AREAS = Object.freeze([
  { x:0, y:0, w:1, h:.085 }, { x:.045, y:.11, w:.70, h:.155 }, { x:0, y:.78, w:1, h:.22 },
])
export function audienceStars(stars = []) {
  const unique = new Map()
  for (const star of stars) {
    if (typeof star?.publicStarId === 'string' && typeof star.formationSlot === 'string' && star.formationSlot.length) unique.set(star.publicStarId, star)
  }
  return [...unique.values()].sort((a, b) => a.formationSlot.localeCompare(b.formationSlot)).slice(0, 300)
}
export function inSkyRectangle(point, rect, margin = 0) {
  return point.x >= rect.x - margin && point.x <= rect.x + rect.w + margin
    && point.y >= rect.y - margin && point.y <= rect.y + rect.h + margin
}
// Half-plane clipping keeps each piece convex, allowing area-weighted sampling.
function clip(polygon, axis, edge, greater) {
  const result = [], inside = p => greater ? p[axis] >= edge : p[axis] <= edge
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], ai = inside(a), bi = inside(b)
    if (ai) result.push(a)
    if (ai !== bi) {
      const t = (edge - a[axis]) / (b[axis] - a[axis])
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return result
}
function subtract(polygon, rect) {
  const left = rect.x - .012, right = rect.x + rect.w + .012
  const top = rect.y - .012, bottom = rect.y + rect.h + .012
  const middle = clip(clip(polygon, 0, left, true), 0, right, false)
  return [clip(polygon, 0, left, false), clip(polygon, 0, right, true),
    clip(middle, 1, top, false), clip(middle, 1, bottom, true)].filter(p => p.length >= 3)
}
export function projectSkyRegions(regions, aspect = 1672 / 941) {
  const sourceAspect = 1672 / 941
  const sx = Math.max(1, sourceAspect / aspect), sy = Math.max(1, aspect / sourceAspect)
  return regions.map(poly => {
    let result = poly.map(([x, y]) => [.5 + (x - .5) * sx, .5 + (y - .5) * sy])
    for (const [axis, edge, greater] of [[0,.025,true],[0,.975,false],[1,.025,true],[1,.965,false]]) result = clip(result, axis, edge, greater)
    return result
  }).filter(p => p.length >= 3)
}
function skyTriangles({ compact = false, overlay = false, protectedAreas = [], backgroundUIAreas = protectedAreas, overlayUIAreas = [],
  skyRegions = ART_SKY_REGIONS['night-flight'], aspect = compact ? 390 / 844 : 1672 / 941 } = {}) {
  let polygons = overlay ? [[[.025,.025],[.975,.025],[.975,.965],[.025,.965]]] : projectSkyRegions(skyRegions, aspect)
  const masks = compact ? MOBILE_SKY_UI_AREAS : overlay ? overlayUIAreas : backgroundUIAreas
  for (const mask of masks) polygons = polygons.flatMap(poly => subtract(poly, mask))
  const triangles = []
  for (const p of polygons) for (let i = 1; i < p.length - 1; i++) {
    const [a,b,c] = [p[0],p[i],p[i+1]]
    const area = Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1])) / 2
    if (area > 1e-8) triangles.push({ a,b,c,area })
  }
  return triangles
}
function position(star, options, triangles) {
  if (!triangles.length) return null // Bad future masks must never spill stars onto buildings.
  const seed = star.formationSlot, compact = options.compact
  let cursor = unit(seed + ':region') * triangles.reduce((sum, t) => sum + t.area, 0)
  const { a,b,c } = triangles.find(t => (cursor -= t.area) <= 0) ?? triangles.at(-1)
  const r = Math.sqrt(unit(seed + ':sky-x')), t = unit(seed + ':sky-y')
  const x = (1-r)*a[0]+r*(1-t)*b[0]+r*t*c[0], y = (1-r)*a[1]+r*(1-t)*b[1]+r*t*c[1]
  return { x, y, radius: (compact ? .9 : 1.35) + unit(seed + ':radius') * (compact ? .5 : 1.1), phase: unit(seed + ':phase') * Math.PI * 2,
    giftSafe: !options.overlay || !(options.protectedAreas ?? []).some(rect => inSkyRectangle({ x,y }, rect, .025)) }
}
export function audienceStarPosition(star, options = {}) { return position(star, options, skyTriangles(options)) }
export function audienceSkyPoints(stars, options = {}) {
  const triangles = skyTriangles(options)
  return audienceStars(stars).flatMap(star => {
    const p = position(star, options, triangles)
    return p ? [{ ...p, id: star.publicStarId, color: star.displayColor, slot: skyHash(star.formationSlot) }] : []
  })
}
export function giftStarAnchor(points, eventId) {
  const safe = points.filter(p => p.giftSafe !== false)
  return safe.length ? safe[skyHash(eventId) % safe.length] : null
}
// At most four nearby real stars wake for each confirmed gift, never a full-frame flash.
export function giftStarHighlights(points, effects) {
  return effects.filter(e => !e.static).flatMap(effect => {
    const anchor = giftStarAnchor(points, effect.id)
    if (!anchor) return []
    const neighbors = points.filter(p => p.giftSafe !== false)
      .map(p => ({ id: p.id, distance: Math.hypot(p.x-anchor.x, p.y-anchor.y) }))
      .filter(p => p.distance < .10).sort((a,b) => a.distance-b.distance).slice(0,4)
    return [{ effect, stars: new Map(neighbors.map(p => [p.id, p.id === anchor.id ? .78 : .30*(1-p.distance/.10)])) }]
  })
}
