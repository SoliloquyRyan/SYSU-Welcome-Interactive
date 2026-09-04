import { describe, expect, it } from 'vitest'

import { loadConfig } from '../../backend/src/config.js'

describe('backend configuration', () => {
  it('keeps 300 participants as the normal default', () => {
    expect(loadConfig({})).toMatchObject({
      seedParticipantCount: 300,
      secureCookies: false,
      trustLoopbackProxy: false,
    })
  })

  it('enables only explicit secure-cookie and loopback-proxy flags', () => {
    expect(
      loadConfig({
        DEMO_SECURE_COOKIES: '1',
        DEMO_TRUST_LOOPBACK_PROXY: '1',
      }),
    ).toMatchObject({ secureCookies: true, trustLoopbackProxy: true })
    expect(() => loadConfig({ DEMO_SECURE_COOKIES: 'true' })).toThrow()
    expect(() => loadConfig({ DEMO_TRUST_LOOPBACK_PROXY: 'all' })).toThrow()
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
