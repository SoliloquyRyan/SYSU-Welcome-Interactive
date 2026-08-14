import { describe, expect, it } from 'vitest'

import { starPlacement } from '../../frontend/src/pages/screen/galaxy-renderer.js'

describe('V2-07 deterministic public galaxy placement', () => {
  it('uses only the opaque formation slot and survives snapshot reordering', () => {
    const first = starPlacement({ formationSlot: 'slot:opaque-042' }, 1920, 1080)
    const sameSlotDifferentProjection = starPlacement({
      formationSlot: 'slot:opaque-042',
      publicStarId: 'SHOULD-NOT-AFFECT-PLACEMENT',
      displayColor: '#FFFFFF',
    }, 1920, 1080)
    expect(sameSlotDifferentProjection).toEqual(first)
    expect(starPlacement({ formationSlot: 'slot:opaque-043' }, 1920, 1080)).not.toEqual(first)
  })

  it('keeps every calculated point inside the visible canvas', () => {
    for (let index = 0; index < 300; index += 1) {
      const point = starPlacement({ formationSlot: `slot:synthetic-${index}` }, 1920, 1080)
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(1920)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(1080)
      expect(point.radius).toBeGreaterThan(0)
    }
  })
})
