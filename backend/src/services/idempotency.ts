import { createHash } from 'node:crypto'

import type { SqliteDatabase } from '../db/open-database.js'
import { ApiError } from '../http/api-error.js'
import type { StoredRealtimeEvent } from '../realtime/events.js'
import { assertV1RuntimeCompatible } from '../db/v2-foundation.js'

export interface IdempotentCommandResult<T> {
  body: T
  events: StoredRealtimeEvent[]
  replayed: boolean
  keyDigest: string
  statusCode: number
}

interface StoredRecord {
  requestDigest: string
  responseStatus: number
  responseBodyJson: string
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

export function idempotencyRequestDigest(request: unknown): string {
  return sha256(JSON.stringify(stableValue(request)))
}

export function assertIdempotencyRequestCompatible(
  database: SqliteDatabase,
  input: { scope: string; key: string; request: unknown },
): void {
  const keyDigest = sha256(requireIdempotencyKey(input.key))
  const state = database
    .prepare('SELECT reset_epoch AS resetEpoch FROM app_state WHERE id = 1')
    .get() as { resetEpoch: number }
  const row = database
    .prepare(
      `SELECT request_digest AS requestDigest
       FROM idempotency_records
       WHERE reset_epoch = ? AND scope = ? AND key_digest = ?`,
    )
    .get(state.resetEpoch, input.scope, keyDigest) as
    | { requestDigest: string }
    | undefined
  if (row && row.requestDigest !== idempotencyRequestDigest(input.request)) {
    throw new ApiError(
      'IDEMPOTENCY_CONFLICT',
      '该操作键已经用于不同请求，请刷新状态后重新操作。',
      409,
      { resetEpoch: state.resetEpoch },
    )
  }
}

export function requireIdempotencyKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 8 ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'Idempotency-Key 必须为 8–128 个可打印字符。',
      400,
    )
  }
  return value
}

export function executeIdempotentCommand<T>(
  database: SqliteDatabase,
  input: {
    scope: string
    key: string
    request: unknown
    now?: Date
    operation: (context: {
      keyDigest: string
      now: Date
      resetEpoch: number
    }) => { body: T; events?: StoredRealtimeEvent[]; statusCode?: number }
    onReplay?: (storedBody: T) => T
  },
): IdempotentCommandResult<T> {
  const key = requireIdempotencyKey(input.key)
  const keyDigest = sha256(key)
  const requestDigest = idempotencyRequestDigest(input.request)
  const now = input.now ?? new Date()
  const timestamp = now.toISOString()
  // Current-epoch command receipts are retained until deterministic reset.
  const expiresAt = '9999-12-31T23:59:59.999Z'

  database.exec('BEGIN IMMEDIATE')
  try {
    assertV1RuntimeCompatible(database)
    const state = database
      .prepare('SELECT reset_epoch AS resetEpoch FROM app_state WHERE id = 1')
      .get() as { resetEpoch: number }
    const stored = database
      .prepare(
        `SELECT request_digest AS requestDigest,
                response_status AS responseStatus,
                response_body_json AS responseBodyJson
         FROM idempotency_records
         WHERE reset_epoch = ? AND scope = ? AND key_digest = ?`,
      )
      .get(state.resetEpoch, input.scope, keyDigest) as StoredRecord | undefined

    if (stored) {
      if (stored.requestDigest !== requestDigest) {
        throw new ApiError(
          'IDEMPOTENCY_CONFLICT',
          '该操作键已经用于不同请求，请刷新状态后重新操作。',
          409,
          { resetEpoch: state.resetEpoch },
        )
      }
      const saved = JSON.parse(stored.responseBodyJson) as T
      const body = input.onReplay?.(saved) ?? saved
      database.exec('COMMIT')
      return {
        body,
        events: [],
        replayed: true,
        keyDigest,
        statusCode: stored.responseStatus,
      }
    }

    const result = input.operation({
      keyDigest,
      now,
      resetEpoch: state.resetEpoch,
    })
    database
      .prepare(
        `INSERT INTO idempotency_records (
           reset_epoch, scope, key_digest, request_digest,
           response_status, response_body_json, created_at, expires_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        state.resetEpoch,
        input.scope,
        keyDigest,
        requestDigest,
        result.statusCode ?? 200,
        JSON.stringify(result.body),
        timestamp,
        expiresAt,
      )
    database.exec('COMMIT')
    return {
      body: result.body,
      events: result.events ?? [],
      replayed: false,
      keyDigest,
      statusCode: result.statusCode ?? 200,
    }
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw error
  }
}
