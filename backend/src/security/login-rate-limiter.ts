import { isIP } from 'node:net'

import type { FastifyRequest } from 'fastify'

export type LoginKind = 'participant-activation' | 'admin-login'

export interface LoginRateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

export interface LoginRateLimiter {
  check(kind: LoginKind, sourceIp: string, now: Date): LoginRateLimitDecision
  recordFailure(kind: LoginKind, sourceIp: string, now: Date): void
  recordSuccess(kind: LoginKind, sourceIp: string): void
}

export interface LoginRateLimiterOptions {
  windowMs?: number
  maxFailures?: number
  maxBuckets?: number
}

interface Bucket {
  windowStartedAt: number
  failures: number
  lastTouchedAt: number
}

export const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000
export const LOGIN_RATE_LIMIT_MAX_FAILURES = 5
export const LOGIN_RATE_LIMIT_MAX_BUCKETS = 2_048

export class InMemoryLoginRateLimiter implements LoginRateLimiter {
  readonly windowMs: number
  readonly maxFailures: number
  readonly maxBuckets: number
  private readonly buckets = new Map<string, Bucket>()

  constructor(options: LoginRateLimiterOptions = {}) {
    this.windowMs = options.windowMs ?? LOGIN_RATE_LIMIT_WINDOW_MS
    this.maxFailures = options.maxFailures ?? LOGIN_RATE_LIMIT_MAX_FAILURES
    this.maxBuckets = options.maxBuckets ?? LOGIN_RATE_LIMIT_MAX_BUCKETS
    if (this.windowMs <= 0 || this.maxFailures <= 0 || this.maxBuckets <= 0) {
      throw new Error('Login rate limiter options must be positive')
    }
  }

  private key(kind: LoginKind, sourceIp: string): string {
    return `${kind}\0${sourceIp}`
  }

  private prune(nowMs: number): void {
    for (const [key, bucket] of this.buckets) {
      if (nowMs - bucket.windowStartedAt >= this.windowMs) {
        this.buckets.delete(key)
      }
    }
  }

  private ensureCapacity(nowMs: number): void {
    this.prune(nowMs)
    while (this.buckets.size >= this.maxBuckets) {
      let oldestKey: string | null = null
      let oldestTouchedAt = Number.POSITIVE_INFINITY
      for (const [key, bucket] of this.buckets) {
        if (bucket.lastTouchedAt < oldestTouchedAt) {
          oldestKey = key
          oldestTouchedAt = bucket.lastTouchedAt
        }
      }
      if (oldestKey === null) break
      this.buckets.delete(oldestKey)
    }
  }

  check(kind: LoginKind, sourceIp: string, now: Date): LoginRateLimitDecision {
    const nowMs = now.getTime()
    const key = this.key(kind, sourceIp)
    const bucket = this.buckets.get(key)
    if (!bucket || nowMs - bucket.windowStartedAt >= this.windowMs) {
      if (bucket) this.buckets.delete(key)
      return { allowed: true, retryAfterSeconds: 0 }
    }
    bucket.lastTouchedAt = nowMs
    if (bucket.failures < this.maxFailures) {
      return { allowed: true, retryAfterSeconds: 0 }
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((bucket.windowStartedAt + this.windowMs - nowMs) / 1_000),
      ),
    }
  }

  recordFailure(kind: LoginKind, sourceIp: string, now: Date): void {
    const nowMs = now.getTime()
    const key = this.key(kind, sourceIp)
    const current = this.buckets.get(key)
    if (!current || nowMs - current.windowStartedAt >= this.windowMs) {
      if (!current) this.ensureCapacity(nowMs)
      this.buckets.set(key, {
        windowStartedAt: nowMs,
        failures: 1,
        lastTouchedAt: nowMs,
      })
      return
    }
    current.failures += 1
    current.lastTouchedAt = nowMs
  }

  recordSuccess(kind: LoginKind, sourceIp: string): void {
    this.buckets.delete(this.key(kind, sourceIp))
  }
}

function isLoopbackAddress(address: string): boolean {
  const normalized = address.toLowerCase()
  if (normalized === '::1') return true
  if (normalized.startsWith('::ffff:')) {
    return isLoopbackAddress(normalized.slice('::ffff:'.length))
  }
  if (isIP(normalized) !== 4) return false
  const firstOctet = Number.parseInt(normalized.split('.')[0] ?? '', 10)
  return firstOctet === 127
}

function lastValidForwardedAddress(value: string | undefined): string | null {
  if (!value) return null
  const entries = value.split(',').map((entry) => entry.trim())
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const candidate = entries[index]
    if (candidate && isIP(candidate) !== 0) return candidate
  }
  return null
}

export function loginSourceIp(request: FastifyRequest): string {
  const directPeer = request.ip
  if (isLoopbackAddress(directPeer)) {
    const header = request.headers['x-forwarded-for']
    const forwarded = lastValidForwardedAddress(
      Array.isArray(header) ? header.join(',') : header,
    )
    if (forwarded) return forwarded
  }
  return directPeer
}
