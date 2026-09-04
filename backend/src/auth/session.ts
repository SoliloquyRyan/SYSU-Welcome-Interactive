import { createHash, randomBytes, randomUUID } from 'node:crypto'

import {
  AdminRoleSchema,
  type AdminRole,
} from '@sysu-welcome/contracts'

import type { SqliteDatabase } from '../db/open-database.js'
import { executeV1WriteTransaction } from '../db/v2-foundation.js'

export const PARTICIPANT_COOKIE_NAME = 'sysu_welcome_participant'
export const ADMIN_COOKIE_NAME = 'sysu_welcome_admin'
export const PARTICIPANT_SESSION_SECONDS = 12 * 60 * 60
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60

export type SessionType = 'PARTICIPANT' | 'ADMIN'

export interface AuthenticatedSession {
  id: string
  type: SessionType
  subjectId: string
  roles: AdminRole[]
  resetEpoch: number
  shortId: string
  createdAt: string
  expiresAt: string
}

export interface CreatedSession extends AuthenticatedSession {
  secret: string
}

interface SessionRow {
  id: string
  sessionType: SessionType
  subjectId: string | null
  rolesJson: string
  resetEpoch: number
  shortId: string
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  currentResetEpoch: number
}

export function digestSessionSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

export function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>()
  if (!header) return cookies
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (!name || cookies.has(name)) continue
    try {
      cookies.set(name, decodeURIComponent(value))
    } catch {
      // Malformed cookie values are treated as absent credentials.
    }
  }
  return cookies
}

export function cookieNameFor(type: SessionType): string {
  return type === 'PARTICIPANT'
    ? PARTICIPANT_COOKIE_NAME
    : ADMIN_COOKIE_NAME
}

export function sessionSecretFromCookie(
  header: string | undefined,
  type: SessionType,
): string | null {
  return parseCookies(header).get(cookieNameFor(type)) ?? null
}

export function serializeSessionCookie(
  type: SessionType,
  secret: string,
  options: { secure?: boolean } = {},
): string {
  const maxAge =
    type === 'PARTICIPANT'
      ? PARTICIPANT_SESSION_SECONDS
      : ADMIN_SESSION_SECONDS
  const secure = options.secure === true ? '; Secure' : ''
  return `${cookieNameFor(type)}=${encodeURIComponent(secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

export function serializeClearedSessionCookie(
  type: SessionType,
  options: { secure?: boolean } = {},
): string {
  const secure = options.secure === true ? '; Secure' : ''
  return `${cookieNameFor(type)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
}

export function createSession(
  database: SqliteDatabase,
  input: {
    type: SessionType
    subjectId: string
    roles?: readonly AdminRole[]
    resetEpoch: number
    now?: Date
  },
): CreatedSession {
  const now = input.now ?? new Date()
  const ttlSeconds =
    input.type === 'PARTICIPANT'
      ? PARTICIPANT_SESSION_SECONDS
      : ADMIN_SESSION_SECONDS
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1_000)
  const secret = randomBytes(32).toString('base64url')
  const id = randomUUID()
  const shortId = randomBytes(6).toString('hex')
  const roles =
    input.type === 'ADMIN'
      ? AdminRoleSchema.array().parse([...(input.roles ?? [])])
      : []

  return executeV1WriteTransaction(database, () => {
    database
      .prepare(
        `INSERT INTO sessions (
           id, session_type, subject_id, secret_digest, roles_json,
           reset_epoch, short_id, created_at, expires_at, revoked_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        id,
        input.type,
        input.subjectId,
        digestSessionSecret(secret),
        JSON.stringify(roles),
        input.resetEpoch,
        shortId,
        now.toISOString(),
        expiresAt.toISOString(),
      )

    return {
      id,
      type: input.type,
      subjectId: input.subjectId,
      roles,
      resetEpoch: input.resetEpoch,
      shortId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      secret,
    }
  })
}

export function authenticateSession(
  database: SqliteDatabase,
  type: SessionType,
  secret: string | null,
  now: Date = new Date(),
): AuthenticatedSession | null {
  if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return null
  const row = database
    .prepare(
      `SELECT s.id, s.session_type AS sessionType,
              s.subject_id AS subjectId, s.roles_json AS rolesJson,
              s.reset_epoch AS resetEpoch, s.short_id AS shortId,
              s.created_at AS createdAt, s.expires_at AS expiresAt,
              s.revoked_at AS revokedAt,
              a.reset_epoch AS currentResetEpoch
       FROM sessions s
       CROSS JOIN app_state a
       WHERE s.secret_digest = ? AND s.session_type = ? AND a.id = 1`,
    )
    .get(digestSessionSecret(secret), type) as SessionRow | undefined

  if (
    !row?.subjectId ||
    row.revokedAt !== null ||
    row.resetEpoch !== row.currentResetEpoch ||
    Date.parse(row.expiresAt) <= now.getTime()
  ) {
    return null
  }

  let roles: AdminRole[] = []
  try {
    roles =
      type === 'ADMIN'
        ? AdminRoleSchema.array().parse(JSON.parse(row.rolesJson))
        : []
  } catch {
    return null
  }

  return {
    id: row.id,
    type: row.sessionType,
    subjectId: row.subjectId,
    roles,
    resetEpoch: row.resetEpoch,
    shortId: row.shortId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  }
}

export function revokeSession(
  database: SqliteDatabase,
  sessionId: string,
  now: Date = new Date(),
): void {
  executeV1WriteTransaction(database, () => {
    database
      .prepare(
        `UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?`,
      )
      .run(now.toISOString(), sessionId)
  })
}

export function replaceAdminSessionRoles(
  database: SqliteDatabase,
  sessionId: string,
  roles: readonly AdminRole[],
): AdminRole[] {
  const normalized = AdminRoleSchema.array().parse([...new Set(roles)])
  return executeV1WriteTransaction(database, () => {
    database
      .prepare(
        `UPDATE sessions
         SET roles_json = ?
         WHERE id = ? AND session_type = 'ADMIN' AND revoked_at IS NULL`,
      )
      .run(JSON.stringify(normalized), sessionId)
    return normalized
  })
}
