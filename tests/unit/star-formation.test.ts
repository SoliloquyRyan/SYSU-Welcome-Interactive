import { describe, expect, it } from 'vitest'

import {
  formationText,
  starFormationStyle,
} from '../../frontend/src/services/star-formation.js'

const star = {
  id: 'L-4821',
  visualSeed: '0123456789abcdef0123456789abcdef',
}

describe('public star formation', () => {
  it('uses the approved 智工2026 formation label', () => {
    expect(formationText).toBe('智工2026')
  })

  it('creates stable in-bounds target coordinates and a deterministic travel path', () => {
    const first = starFormationStyle(star, 0)
    const repeated = starFormationStyle(star, 0)
    const later = starFormationStyle(star, 250)

    expect(first).toEqual(repeated)
    expect(Number.parseFloat(first['--star-x'])).toBeGreaterThanOrEqual(5)
    expect(Number.parseFloat(first['--star-x'])).toBeLessThanOrEqual(95)
    expect(Number.parseFloat(first['--star-y'])).toBeGreaterThanOrEqual(10)
    expect(Number.parseFloat(first['--star-y'])).toBeLessThanOrEqual(90)
    expect(Number.parseFloat(later['--star-x'])).toBeGreaterThanOrEqual(5)
    expect(Number.parseFloat(later['--star-y'])).toBeGreaterThanOrEqual(10)
  })
})
