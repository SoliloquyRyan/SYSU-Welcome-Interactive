import { describe, expect, it } from 'vitest'

import {
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from '../../backend/src/auth/session.js'

describe('D-056 session cookie transport policy', () => {
  it('keeps loopback development cookies compatible by default', () => {
    const cookie = serializeSessionCookie('PARTICIPANT', 'local-secret')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toContain('Secure')
  })

  it('marks production and cleared cookies Secure behind HTTPS', () => {
    expect(
      serializeSessionCookie('ADMIN', 'production-secret', { secure: true }),
    ).toMatch(/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/)
    expect(
      serializeClearedSessionCookie('ADMIN', { secure: true }),
    ).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure$/)
  })
})
