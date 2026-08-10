import { describe, expect, it } from 'vitest'

import { loadConfig } from '../../backend/src/config.js'

describe('backend configuration', () => {
  it('keeps 300 participants as the normal default', () => {
    expect(loadConfig({}).seedParticipantCount).toBe(300)
  })

  it('allows an isolated test stack to request a smaller synthetic seed', () => {
    expect(
      loadConfig({ DEMO_SEED_PARTICIPANT_COUNT: '4' }).seedParticipantCount,
    ).toBe(4)
  })

  it.each(['0', '1001', 'not-a-number'])(
    'rejects an unsafe participant count override: %s',
    (value) => {
      expect(() =>
        loadConfig({ DEMO_SEED_PARTICIPANT_COUNT: value }),
      ).toThrow()
    },
  )
})
