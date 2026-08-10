import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createG2Harness,
  idempotencyKey,
  responseErrorCode,
  type G2Harness,
  type TestResponse,
} from '../helpers/g2-harness.js'

const SOURCE_A = '198.51.100.10'
const SOURCE_B = '203.0.113.20'

function publicFailure(response: TestResponse) {
  const body = response.json() as {
    error: { code: string; message: string }
  }
  return {
    statusCode: response.statusCode,
    code: body.error.code,
    message: body.error.message,
  }
}

describe('G2 authentication failure rate limits', () => {
  let harness: G2Harness

  beforeEach(async () => {
    harness = await createG2Harness()
  })

  afterEach(async () => {
    await harness.close()
  })

  async function activateFailure(
    sourceIp: string,
    sequence: number,
    failure: 'token' | 'name' | 'code' = 'token',
  ) {
    const participant = harness.manifest.participants[0]
    return harness.unsafeRequest({
      method: 'POST',
      url: '/api/participant/activate',
      headers: {
        'idempotency-key': idempotencyKey('rate-activate', sequence),
        'x-forwarded-for': `unknown-proxy-value, ${sourceIp}`,
      },
      payload: {
        token: failure === 'token' ? 'z'.repeat(43) : participant.inviteToken,
        displayName:
          failure === 'name' ? '不存在的合成姓名' : participant.displayName,
        demoCode:
          failure === 'code'
            ? participant.demoCode === '000000'
              ? '999999'
              : '000000'
            : participant.demoCode,
      },
    })
  }

  async function adminFailure(
    sourceIp: string,
    failure: 'username' | 'password',
  ) {
    return harness.unsafeRequest({
      method: 'POST',
      url: '/api/admin/login',
      headers: {
        'x-forwarded-for': `192.0.2.1, ${sourceIp}`,
      },
      payload: {
        username:
          failure === 'username'
            ? 'missing-synthetic-admin'
            : harness.manifest.admin.username,
        password:
          failure === 'password'
            ? 'invalid-synthetic-password'
            : harness.manifest.admin.password,
      },
    })
  }

  it('limits the sixth failed participant activation per source without leaking which credential failed', async () => {
    const failures: TestResponse[] = []
    for (const [index, failure] of (
      ['token', 'name', 'code', 'token', 'name'] as const
    ).entries()) {
      failures.push(await activateFailure(SOURCE_A, index + 1, failure))
    }
    expect(failures.map(publicFailure)).toEqual(
      Array.from({ length: 5 }, () => ({
        statusCode: 401,
        code: 'AUTH_REQUIRED',
        message: publicFailure(failures[0]).message,
      })),
    )

    const limited = await activateFailure(SOURCE_A, 6, 'code')
    expect(limited.statusCode).toBe(429)
    expect(responseErrorCode(limited)).toBe('RATE_LIMITED')
    expect((await adminFailure(SOURCE_A, 'password')).statusCode).toBe(401)

    const independent = await activateFailure(SOURCE_B, 7, 'token')
    expect(independent.statusCode).toBe(401)
    expect(responseErrorCode(independent)).toBe('AUTH_REQUIRED')
  })

  it('clears participant failures after success and recovers exactly when the 60-second window expires', async () => {
    const successSource = '198.51.100.30'
    for (let sequence = 1; sequence <= 4; sequence += 1) {
      expect(
        (await activateFailure(successSource, 20 + sequence)).statusCode,
      ).toBe(401)
    }
    const participant = harness.manifest.participants[0]
    const success = await harness.unsafeRequest({
      method: 'POST',
      url: '/api/participant/activate',
      headers: {
        'idempotency-key': idempotencyKey('rate-activate-success'),
        'x-forwarded-for': successSource,
      },
      payload: {
        token: participant.inviteToken,
        displayName: participant.displayName,
        demoCode: participant.demoCode,
      },
    })
    expect(success.statusCode).toBe(200)
    for (let sequence = 1; sequence <= 5; sequence += 1) {
      expect(
        (await activateFailure(successSource, 30 + sequence)).statusCode,
      ).toBe(401)
    }
    expect(
      (await activateFailure(successSource, 36)).statusCode,
    ).toBe(429)

    const boundarySource = '198.51.100.40'
    for (let sequence = 1; sequence <= 5; sequence += 1) {
      expect(
        (await activateFailure(boundarySource, 40 + sequence)).statusCode,
      ).toBe(401)
    }
    harness.advance(59_999)
    expect(
      (await activateFailure(boundarySource, 46)).statusCode,
    ).toBe(429)
    harness.advance(1)
    const recovered = await activateFailure(boundarySource, 47)
    expect(recovered.statusCode).toBe(401)
    expect(responseErrorCode(recovered)).toBe('AUTH_REQUIRED')
  })

  it('limits admin login independently, keeps failures generic, and clears the bucket after success', async () => {
    const failures: TestResponse[] = []
    for (const failure of [
      'username',
      'password',
      'username',
      'password',
      'username',
    ] as const) {
      failures.push(await adminFailure(SOURCE_A, failure))
    }
    expect(failures.map(publicFailure)).toEqual(
      Array.from({ length: 5 }, () => ({
        statusCode: 401,
        code: 'AUTH_REQUIRED',
        message: publicFailure(failures[0]).message,
      })),
    )
    const limited = await adminFailure(SOURCE_A, 'password')
    expect(limited.statusCode).toBe(429)
    expect(responseErrorCode(limited)).toBe('RATE_LIMITED')
    expect((await adminFailure(SOURCE_B, 'username')).statusCode).toBe(401)

    const resetSource = '203.0.113.40'
    for (let sequence = 0; sequence < 4; sequence += 1) {
      expect((await adminFailure(resetSource, 'password')).statusCode).toBe(401)
    }
    const success = await harness.unsafeRequest({
      method: 'POST',
      url: '/api/admin/login',
      headers: { 'x-forwarded-for': resetSource },
      payload: {
        username: harness.manifest.admin.username,
        password: harness.manifest.admin.password,
      },
    })
    expect(success.statusCode).toBe(200)
    for (let sequence = 0; sequence < 5; sequence += 1) {
      expect((await adminFailure(resetSource, 'password')).statusCode).toBe(401)
    }
    expect((await adminFailure(resetSource, 'password')).statusCode).toBe(429)

    const boundarySource = '203.0.113.50'
    for (let sequence = 0; sequence < 5; sequence += 1) {
      expect((await adminFailure(boundarySource, 'password')).statusCode).toBe(
        401,
      )
    }
    harness.advance(59_999)
    expect((await adminFailure(boundarySource, 'password')).statusCode).toBe(
      429,
    )
    harness.advance(1)
    expect((await adminFailure(boundarySource, 'password')).statusCode).toBe(
      401,
    )
  })

  it('ignores spoofed X-Forwarded-For when the direct peer is not loopback', async () => {
    const participant = harness.manifest.participants[0]
    for (let sequence = 1; sequence <= 6; sequence += 1) {
      const response = await harness.unsafeRequest({
        method: 'POST',
        url: '/api/participant/activate',
        remoteAddress: '198.51.100.90',
        headers: {
          'idempotency-key': idempotencyKey('untrusted-xff', sequence),
          'x-forwarded-for': `203.0.113.${sequence}`,
        },
        payload: {
          token: 'z'.repeat(43),
          displayName: participant.displayName,
          demoCode: participant.demoCode,
        },
      })
      expect(response.statusCode).toBe(sequence <= 5 ? 401 : 429)
      expect(responseErrorCode(response)).toBe(
        sequence <= 5 ? 'AUTH_REQUIRED' : 'RATE_LIMITED',
      )
    }
  })
})
