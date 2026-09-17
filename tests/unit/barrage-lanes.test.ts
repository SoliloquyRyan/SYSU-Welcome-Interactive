import { describe, expect, it } from 'vitest'
import { createBarrageLanes } from '../../frontend/src/rendering/barrage-lanes.js'
describe('D-108 four bounded barrage lanes', () => {
  it('preserves measured spacing at a common pixel speed and drops over-budget display work', () => {
    const lanes = createBarrageLanes()
    const first = lanes.reserve(1000, 1920, 0)!
    expect(first.lane).toBe(0)
    for (let i=1;i<4;i++) expect(lanes.reserve(1000,1920,0)!.lane).toBe(i)
    expect(lanes.reserve(30,1920,4000)).toBeNull()
    const next = lanes.reserve(30,1920,5000)!
    expect(next.lane).toBe(0)
    const speed = (1920+1000+84)/first.durationMs
    expect((1920+30+84)/next.durationMs).toBeCloseTo(speed)
    lanes.clear(); expect(lanes.reserve(30,1920,5001)!.lane).toBe(0)
  })
})
