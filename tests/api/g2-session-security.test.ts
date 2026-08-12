import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  AdminSnapshotSchema,
  ParticipantSnapshotSchema,
  SessionEndedResponseSchema,
} from '../../packages/contracts/src/index.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import {
  ADMIN_COOKIE_NAME,
  createG2Harness,
  idempotencyKey,
  PARTICIPANT_COOKIE_NAME,
  readSetCookie,
  responseErrorCode,
  TEST_AUTHORITY,
  TEST_ORIGIN,
  type G2Harness,
} from '../helpers/g2-harness.js'

function expectCookie(
  header: string,
  name: string,
  maxAgeSeconds: number,
): void {
  expect(header.startsWith(`${name}=`)).toBe(true)
  expect(header).toMatch(/;\s*HttpOnly(?:;|$)/i)
  expect(header).toMatch(/;\s*SameSite=Lax(?:;|$)/i)
  expect(header).toMatch(/;\s*Path=\/(?:;|$)/i)
  expect(header).toMatch(
    new RegExp(`;\\s*Max-Age=${maxAgeSeconds}(?:;|$)`, 'i'),
  )
  expect(header).not.toMatch(/;\s*Secure(?:;|$)/i)

  const pair = header.slice(0, header.indexOf(';'))
  const secret = pair.slice(pair.indexOf('=') + 1)
  expect(/^[A-Za-z0-9_-]{43}$/.test(secret)).toBe(true)
}

describe('G2 session, cookie and local network security', () => {
  let harness: G2Harness

  beforeEach(async () => {
    harness = await createG2Harness()
  })

  afterEach(async () => {
    await harness.close()
  })

  it('sets independent opaque participant and admin cookies with the frozen attributes', async () => {
    const participantLogin = await harness.activate()
    const adminLogin = await harness.adminLogin()
    const participantSetCookie = readSetCookie(participantLogin.response)
    const adminSetCookie = readSetCookie(adminLogin.response)

    expectCookie(participantSetCookie.header, PARTICIPANT_COOKIE_NAME, 43_200)
    expectCookie(adminSetCookie.header, ADMIN_COOKIE_NAME, 28_800)
    expect(participantSetCookie.cookie).not.toBe(adminSetCookie.cookie)

    const participantBody = ParticipantSnapshotSchema.parse(
      participantLogin.response.json(),
    )
    const adminBody = AdminSnapshotSchema.parse(adminLogin.response.json())
    expect(JSON.stringify(participantBody)).not.toContain(
      participantSetCookie.cookie.slice(participantSetCookie.cookie.indexOf('=') + 1),
    )
    expect(JSON.stringify(adminBody)).not.toContain(
      adminSetCookie.cookie.slice(adminSetCookie.cookie.indexOf('=') + 1),
    )
  })

  it('stores only SHA-256 session digests and expires each session at its own TTL', async () => {
    const participant = await harness.activate()
    const admin = await harness.adminLogin()
    const participantSecret = participant.cookie.slice(
      participant.cookie.indexOf('=') + 1,
    )
    const adminSecret = admin.cookie.slice(admin.cookie.indexOf('=') + 1)
    const database = openDatabase(harness.config.databasePath)
    try {
      const digests = database
        .prepare('SELECT secret_digest FROM sessions ORDER BY session_type')
        .pluck()
        .all() as string[]
      expect(digests.every((digest) => /^[a-f0-9]{64}$/.test(digest))).toBe(
        true,
      )
      expect(digests.includes(participantSecret)).toBe(false)
      expect(digests.includes(adminSecret)).toBe(false)
      expect(
        digests.includes(
          createHash('sha256').update(participantSecret).digest('hex'),
        ),
      ).toBe(true)
      expect(
        digests.includes(createHash('sha256').update(adminSecret).digest('hex')),
      ).toBe(true)
    } finally {
      database.close()
    }

    harness.advance(8 * 60 * 60 * 1_000 + 1)
    expect(
      (
        await harness.request({
          method: 'GET',
          url: '/api/admin/snapshot',
          headers: { cookie: admin.cookie },
        })
      ).statusCode,
    ).toBe(401)
    expect(
      (
        await harness.request({
          method: 'GET',
          url: '/api/participant/snapshot',
          headers: { cookie: participant.cookie },
        })
      ).statusCode,
    ).toBe(200)

    harness.advance(4 * 60 * 60 * 1_000)
    expect(
      (
        await harness.request({
          method: 'GET',
          url: '/api/participant/snapshot',
          headers: { cookie: participant.cookie },
        })
      ).statusCode,
    ).toBe(401)
  })

  it('replays token activation once and issues a fresh device session without duplicate participant facts', async () => {
    const key = idempotencyKey('activation-replay')
    const first = await harness.activate(0, { idempotencyKey: key })
    const replay = await harness.activate(0, { idempotencyKey: key })
    expect(replay.response.json()).toEqual(first.response.json())
    expect(replay.cookie).not.toBe(first.cookie)

    const screen = await harness.request({
      method: 'GET',
      url: '/api/screen/snapshot',
    })
    expect(
      (screen.json() as { aggregates: { activatedCount: number } }).aggregates
        .activatedCount,
    ).toBe(1)
  })

  it('uses the same generic failure for an unknown token, wrong name and wrong code', async () => {
    const participant = harness.manifest.participants[0]
    const attempts = [
      { method: 'INVITATION_TOKEN', token: 'z'.repeat(43) },
      {
        method: 'STUDENT_ID',
        displayName: '不存在的虚构姓名',
        studentNumber: participant.studentNumber,
      },
      {
        method: 'STUDENT_ID',
        displayName: participant.displayName,
        studentNumber: '99999999',
      },
    ]

    const responses = []
    for (const [index, payload] of attempts.entries()) {
      responses.push(
        await harness.unsafeRequest({
          method: 'POST',
          url: '/api/participant/activate',
          headers: {
            'idempotency-key': idempotencyKey('invalid-activation', index + 1),
          },
          payload,
        }),
      )
    }

    const publicFailures = responses.map((response) => ({
      statusCode: response.statusCode,
      code: responseErrorCode(response),
      message: (response.json() as { error: { message: string } }).error.message,
    }))
    expect(publicFailures[1]).toEqual(publicFailures[0])
    expect(publicFailures[2]).toEqual(publicFailures[0])
    expect(publicFailures[0].statusCode).toBeGreaterThanOrEqual(400)
  })

  it('accepts the name and synthetic student ID fallback without an invitation token', async () => {
    const participant = harness.manifest.participants[0]
    const response = await harness.unsafeRequest({
      method: 'POST',
      url: '/api/participant/activate',
      headers: { 'idempotency-key': idempotencyKey('student-number-fallback') },
      payload: {
        method: 'STUDENT_ID',
        displayName: participant.displayName,
        studentNumber: participant.studentNumber,
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['set-cookie']).toBeDefined()
  })

  it('rejects unauthenticated reads and never lets one cookie cross the participant/admin boundary', async () => {
    const anonymousParticipant = await harness.request({
      method: 'GET',
      url: '/api/participant/snapshot',
    })
    const anonymousAdmin = await harness.request({
      method: 'GET',
      url: '/api/admin/snapshot',
    })
    expect(anonymousParticipant.statusCode).toBe(401)
    expect(anonymousAdmin.statusCode).toBe(401)
    expect(responseErrorCode(anonymousParticipant)).toBe('AUTH_REQUIRED')
    expect(responseErrorCode(anonymousAdmin)).toBe('AUTH_REQUIRED')

    const participant = await harness.activate()
    const participantAgainstAdmin = await harness.request({
      method: 'GET',
      url: '/api/admin/snapshot',
      headers: { cookie: participant.cookie },
    })
    expect(participantAgainstAdmin.statusCode).toBe(401)
    expect(responseErrorCode(participantAgainstAdmin)).toBe('AUTH_REQUIRED')

    const admin = await harness.adminLogin()
    const adminAgainstParticipant = await harness.request({
      method: 'GET',
      url: '/api/participant/snapshot',
      headers: { cookie: admin.cookie },
    })
    expect(adminAgainstParticipant.statusCode).toBe(401)
    expect(responseErrorCode(adminAgainstParticipant)).toBe('AUTH_REQUIRED')
  })

  it('isolates participant A from B while allowing multiple devices for the same participant', async () => {
    const participantA1 = await harness.activate(0, {
      idempotencyKey: idempotencyKey('participant-a-device', 1),
    })
    const participantB = await harness.activate(1, {
      idempotencyKey: idempotencyKey('participant-b-device', 1),
    })
    const participantA2 = await harness.activate(0, {
      idempotencyKey: idempotencyKey('participant-a-device', 2),
    })

    const read = async (cookie: string) =>
      ParticipantSnapshotSchema.parse(
        (
          await harness.request({
            method: 'GET',
            url: '/api/participant/snapshot',
            headers: { cookie },
          })
        ).json(),
      )
    const [a1, b, a2] = await Promise.all([
      read(participantA1.cookie),
      read(participantB.cookie),
      read(participantA2.cookie),
    ])

    expect(a1.participant.id).toBe(harness.manifest.participants[0].id)
    expect(a2.participant.id).toBe(a1.participant.id)
    expect(b.participant.id).toBe(harness.manifest.participants[1].id)
    expect(b.participant.id).not.toBe(a1.participant.id)
    expect(participantA2.cookie).not.toBe(participantA1.cookie)
    expect(a2.participant).toEqual(a1.participant)
  })

  it('revokes only the logged-out device and clears its cookie', async () => {
    const firstDevice = await harness.activate(0, {
      idempotencyKey: idempotencyKey('logout-device', 1),
    })
    const secondDevice = await harness.activate(0, {
      idempotencyKey: idempotencyKey('logout-device', 2),
    })
    const logout = await harness.unsafeRequest(
      {
        method: 'POST',
        url: '/api/participant/logout',
        headers: {
          'idempotency-key': idempotencyKey('participant-logout'),
        },
      },
      firstDevice.cookie,
    )

    expect(logout.statusCode).toBe(200)
    expect(SessionEndedResponseSchema.parse(logout.json())).toEqual({
      status: 'ok',
    })
    const cleared = readSetCookie(logout)
    expect(cleared.header.startsWith(`${PARTICIPANT_COOKIE_NAME}=`)).toBe(true)
    expect(cleared.header).toMatch(/Max-Age=0/i)

    const revoked = await harness.request({
      method: 'GET',
      url: '/api/participant/snapshot',
      headers: { cookie: firstDevice.cookie },
    })
    const stillActive = await harness.request({
      method: 'GET',
      url: '/api/participant/snapshot',
      headers: { cookie: secondDevice.cookie },
    })
    expect(revoked.statusCode).toBe(401)
    expect(responseErrorCode(revoked)).toBe('AUTH_REQUIRED')
    expect(stillActive.statusCode).toBe(200)

    const admin = await harness.adminLogin()
    const adminLogout = await harness.unsafeRequest(
      {
        method: 'POST',
        url: '/api/admin/logout',
        headers: { 'idempotency-key': idempotencyKey('admin-logout') },
      },
      admin.cookie,
    )
    expect(adminLogout.statusCode).toBe(200)
    expect(readSetCookie(adminLogout).header).toMatch(
      new RegExp(`^${ADMIN_COOKIE_NAME}=.*Max-Age=0`, 'i'),
    )
    expect(
      (
        await harness.request({
          method: 'GET',
          url: '/api/admin/snapshot',
          headers: { cookie: admin.cookie },
        })
      ).statusCode,
    ).toBe(401)
  })

  it.each([
    {
      label: 'missing Origin',
      headers: { host: TEST_AUTHORITY },
    },
    {
      label: 'foreign Origin',
      headers: { host: TEST_AUTHORITY, origin: 'http://example.invalid' },
    },
    {
      label: 'null Origin',
      headers: { host: TEST_AUTHORITY, origin: 'null' },
    },
    {
      label: 'wrong complete authority',
      headers: { host: '127.0.0.1:3001', origin: TEST_ORIGIN },
    },
  ])('rejects unsafe requests with $label', async ({ headers }) => {
    const response = await harness.request({
      method: 'POST',
      url: '/api/admin/login',
      headers,
      payload: { username: 'synthetic', password: 'synthetic' },
    })
    expect(response.statusCode).toBe(403)
    expect(responseErrorCode(response)).toBe('VALIDATION_FAILED')
  })

  it.each([
    { label: 'missing', value: undefined },
    { label: 'too short', value: '1234567' },
    { label: 'too long', value: 'x'.repeat(129) },
  ])('rejects a $label Idempotency-Key on participant writes', async ({ value }) => {
    const participant = harness.manifest.participants[0]
    const response = await harness.unsafeRequest({
      method: 'POST',
      url: '/api/participant/activate',
      headers: value ? { 'idempotency-key': value } : undefined,
      payload: {
        method: 'INVITATION_TOKEN',
        token: participant.inviteToken,
      },
    })
    expect(response.statusCode).toBe(400)
    expect(responseErrorCode(response)).toBe('VALIDATION_FAILED')
  })
})
