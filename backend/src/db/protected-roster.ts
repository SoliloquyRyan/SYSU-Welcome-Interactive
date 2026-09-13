import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

import { migrateDatabase } from './migrate.js'
import type { SqliteDatabase } from './open-database.js'
import { publicStarIdsForRoster } from './public-star-id.js'
import {
  credentialDigest,
  fingerprintProtectedDirectoryDatabase,
  V2_GIFTS,
  invitationTokenDigest,
  PROGRAMS,
  PROTECTED_ROSTER_SEED_VERSION,
  ProtectedRuntimeSecretSchema,
  type ProtectedRuntimeSecret,
} from './seed.js'
import { initializeV2Runtime, verifyV2Foundation } from './v2-foundation.js'

export const ProtectedRosterRecordSchema = z
  .object({
    displayName: z.string().trim().min(1).max(40),
    studentNumber: z.string().regex(/^\d{8}$/),
    surnameInitial: z.string().regex(/^[A-Z]$/).optional(),
  })
  .strict()

export const ProtectedRosterInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceSha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
    records: z.array(ProtectedRosterRecordSchema).min(1).max(300),
  })
  .strict()
  .superRefine((value, context) => {
    const studentNumbers = value.records.map(({ studentNumber }) => studentNumber)
    if (new Set(studentNumbers).size !== studentNumbers.length) {
      context.addIssue({
        code: 'custom',
        path: ['records'],
        message: 'Roster contains duplicate student numbers',
      })
    }
  })

export type ProtectedRosterInput = z.infer<typeof ProtectedRosterInputSchema>

export interface ProtectedRosterImportOptions {
  migrationsPath: string
  runtimeSecretPath: string
  nfcMapPath: string
  publicOrigin?: string
  now?: () => Date
}

export interface ProtectedRosterImportResult {
  participantCount: number
  schemaVersion: number
  sourceSha256: string
  directoryFingerprint: string
  runtimeSecretPath: string
  nfcMapPath: string
}

interface GeneratedParticipant {
  id: string
  seedIndex: number
  displayName: string
  studentNumber: string
  inviteToken: string
  publicStarId: string
  visualSeed: string
}

function generateParticipants(input: ProtectedRosterInput): GeneratedParticipant[] {
  const publicStarIds = publicStarIdsForRoster(input.records)
  return input.records.map((record, index) => ({
    id: `roster-${randomBytes(12).toString('hex')}`,
    seedIndex: index + 1,
    displayName: record.displayName,
    studentNumber: record.studentNumber,
    inviteToken: randomBytes(32).toString('base64url'),
    publicStarId: publicStarIds[index]!,
    visualSeed: randomBytes(16).toString('hex'),
  }))
}

function csvCell(value: string): string {
  const formulaSafe = /^[=+@-]/.test(value) ? `'${value}` : value
  return `"${formulaSafe.replaceAll('"', '""')}"`
}

function welcomeUrl(token: string, publicOrigin?: string): string {
  const pathAndQuery = `/welcome?token=${encodeURIComponent(token)}`
  if (!publicOrigin) return pathAndQuery
  const origin = new URL(publicOrigin)
  const basePath = origin.pathname.replace(/\/+$/, '')
  origin.pathname = `${basePath}/welcome`
  origin.search = `?token=${encodeURIComponent(token)}`
  origin.hash = ''
  return origin.toString()
}

function writeExclusive(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(filePath, content, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
}

export function importProtectedRoster(
  database: SqliteDatabase,
  rawInput: unknown,
  options: ProtectedRosterImportOptions,
): ProtectedRosterImportResult {
  const input = ProtectedRosterInputSchema.parse(rawInput)
  if (options.publicOrigin) {
    const origin = new URL(options.publicOrigin)
    if (origin.protocol !== 'https:') {
      throw new Error('Formal NFC public origin must use HTTPS')
    }
    if (origin.username || origin.password || origin.search || origin.hash) {
      throw new Error(
        'Formal NFC public origin must not contain credentials, query or fragment',
      )
    }
  }
  if (fs.existsSync(options.runtimeSecretPath)) {
    throw new Error('Protected runtime secret output already exists')
  }
  if (fs.existsSync(options.nfcMapPath)) {
    throw new Error('Protected NFC mapping output already exists')
  }

  const now = options.now ?? (() => new Date())
  const generatedAt = now().toISOString()
  const sourceSha256 = input.sourceSha256.toLowerCase()
  const participants = generateParticipants(input)
  const credentialPepper = randomBytes(32).toString('base64url')
  const admin = {
    id: 'admin-protected',
    username: 'event-admin',
    password: randomBytes(24).toString('base64url'),
  }
  const migrations = migrateDatabase(database, options.migrationsPath)

  database.exec('BEGIN IMMEDIATE')
  let directoryFingerprint = ''
  try {
    const existingCount = Number(
      database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM demo_seed_meta) +
             (SELECT COUNT(*) FROM synthetic_identities) +
             (SELECT COUNT(*) FROM invitation_tokens) +
             (SELECT COUNT(*) FROM program_catalog) +
             (SELECT COUNT(*) FROM gift_catalog) +
             (SELECT COUNT(*) FROM admin_accounts) +
             (SELECT COUNT(*) FROM v2_runtime_state) +
             (SELECT COUNT(*) FROM v2_identity_slots) AS count`,
        )
        .pluck()
        .get(),
    )
    if (existingCount !== 0) {
      throw new Error('Protected roster import requires a newly migrated empty database')
    }

    const insertIdentity = database.prepare(
      `INSERT INTO synthetic_identities (
         id, seed_index, display_name, student_number_digest, public_star_id,
         visual_seed, enabled, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    const insertInvitation = database.prepare(
      `INSERT INTO invitation_tokens (
         id, identity_id, token_digest, token_hint, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    )
    const insertSlot = database.prepare(
      `INSERT INTO v2_identity_slots (
         identity_id, seed_index, public_star_id, formation_slot,
         reserved_reset_epoch, reserved_at
       ) VALUES (?, ?, ?, ?, NULL, NULL)`,
    )
    for (const participant of participants) {
      insertIdentity.run(
        participant.id,
        participant.seedIndex,
        participant.displayName,
        credentialDigest(
          credentialPepper,
          'student-number',
          participant.id,
          participant.studentNumber,
        ),
        participant.publicStarId,
        participant.visualSeed,
        generatedAt,
      )
      insertInvitation.run(
        `invitation-${randomBytes(12).toString('hex')}`,
        participant.id,
        invitationTokenDigest(participant.inviteToken),
        `…${participant.inviteToken.slice(-4)}`,
        generatedAt,
        generatedAt,
      )
      insertSlot.run(
        participant.id,
        participant.seedIndex,
        participant.publicStarId,
        `slot:${participant.visualSeed}`,
      )
    }

    const insertProgram = database.prepare(
      `INSERT INTO program_catalog (
         id, sort_order, title, heat, enabled, created_at, updated_at
       ) VALUES (?, ?, ?, 0, 1, ?, ?)`,
    )
    for (const program of PROGRAMS) {
      insertProgram.run(
        program.id,
        program.sortOrder,
        program.title,
        generatedAt,
        generatedAt,
      )
    }
    database
      .prepare(
        `UPDATE program_runtime_state
         SET current_program_id = ?, updated_at = ? WHERE id = 1`,
      )
      .run(PROGRAMS[0].id, generatedAt)

    const insertGift = database.prepare(
      `INSERT INTO gift_catalog (
         id, sort_order, name, power_cost, enabled, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    for (const gift of V2_GIFTS) {
      insertGift.run(
        gift.id,
        gift.sortOrder,
        gift.name,
        gift.powerCost,
        generatedAt,
        generatedAt,
      )
    }
    database
      .prepare(
        `INSERT INTO admin_accounts (
           id, username, password_digest, enabled, created_at, updated_at
         ) VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .run(
        admin.id,
        admin.username,
        credentialDigest(
          credentialPepper,
          'admin-password',
          admin.id,
          admin.password,
        ),
        generatedAt,
        generatedAt,
      )

    directoryFingerprint = fingerprintProtectedDirectoryDatabase(database)
    database
      .prepare(
        `INSERT INTO demo_seed_meta (
           id, seed_version, seed_fingerprint, participant_count,
           generated_at, applied_at
         ) VALUES (1, ?, ?, ?, ?, ?)`,
      )
      .run(
        PROTECTED_ROSTER_SEED_VERSION,
        directoryFingerprint,
        participants.length,
        generatedAt,
        generatedAt,
      )
    database
      .prepare(
        `UPDATE app_state
         SET reset_epoch = 1, event_seq = 0, seed_version = ?,
             seed_fingerprint = ?, is_resetting = 0, updated_at = ?
         WHERE id = 1`,
      )
      .run(
        PROTECTED_ROSTER_SEED_VERSION,
        directoryFingerprint,
        generatedAt,
      )
    initializeV2Runtime(database, 1, generatedAt)
    database
      .prepare(
        `UPDATE protocol_runtime
         SET active_protocol_version = '2',
             activation_state = 'V2_ACTIVE',
             data_classification = 'PROTECTED',
             cutover_backup_sha256 = NULL,
             cutover_at = NULL,
             protected_source_sha256 = ?,
             protected_imported_at = ?,
             updated_at = ?
         WHERE id = 1`,
      )
      .run(sourceSha256, generatedAt, generatedAt)
    database.exec('COMMIT')
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw error
  }

  const secret: ProtectedRuntimeSecret = ProtectedRuntimeSecretSchema.parse({
    schemaVersion: 1,
    profile: 'PROTECTED_ROSTER',
    seedVersion: PROTECTED_ROSTER_SEED_VERSION,
    generatedAt,
    sourceSha256,
    participantCount: participants.length,
    directoryFingerprint,
    credentialPepper,
    admin,
  })
  writeExclusive(
    options.runtimeSecretPath,
    `${JSON.stringify(secret, null, 2)}\n`,
  )
  const csv = [
    ['序号', '姓名', '学号', '星号', 'NFC网址'],
    ...participants.map((participant) => [
      participant.seedIndex.toString(),
      participant.displayName,
      participant.studentNumber,
      participant.publicStarId,
      welcomeUrl(participant.inviteToken, options.publicOrigin),
    ]),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')
  writeExclusive(options.nfcMapPath, `\uFEFF${csv}\r\n`)

  const verification = verifyV2Foundation(database, {
    migrationsPath: options.migrationsPath,
    manifestPath: options.runtimeSecretPath,
    participantCount: participants.length,
  })
  if (!verification.ready) {
    throw new Error(
      `Protected roster verification failed: ${verification.issues.join('; ')}`,
    )
  }

  return {
    participantCount: participants.length,
    schemaVersion: migrations.currentVersion,
    sourceSha256,
    directoryFingerprint,
    runtimeSecretPath: options.runtimeSecretPath,
    nfcMapPath: options.nfcMapPath,
  }
}
