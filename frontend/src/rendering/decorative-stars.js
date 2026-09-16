// Sky coordinates are presentation-only, never participant IDs or attendance.
export const GIFT_SKY_ANCHORS = Object.freeze([
  { x: .16, y: .22 }, { x: .31, y: .14 }, { x: .47, y: .24 },
  { x: .64, y: .16 }, { x: .79, y: .27 }, { x: .89, y: .12 },
])
export const DECORATIVE_STARS = Object.freeze(Array.from({ length: 120 }, (_, i) => ({
  x: GIFT_SKY_ANCHORS[i]?.x ?? ((i * 73 + 13) % 997) / 997,
  y: GIFT_SKY_ANCHORS[i]?.y ?? ((i * 151 + 19) % 991) / 991,
  r: i < 6 || i % 17 === 0 ? 1.7 : .55 + (i % 5) * .23,
  phase: i * 1.73,
  anchor: i < GIFT_SKY_ANCHORS.length,
  cross: i < 6 || i % 17 === 0,
})))
