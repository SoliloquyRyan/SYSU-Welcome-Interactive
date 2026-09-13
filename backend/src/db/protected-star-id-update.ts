import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import type { SqliteDatabase } from './open-database.js'
import { parseProtectedNfcCsv, verifyProtectedNfcMap } from './protected-nfc-map.js'
import { publicStarIdsForRoster } from './public-star-id.js'
import { fingerprintProtectedDirectoryDatabase, readProtectedRuntimeSecret, sha256 } from './seed.js'
import { verifyV2Foundation } from './v2-foundation.js'

export interface StarIdUpdateOptions {
  migrationsPath: string
  runtimeSecretPath: string
  nfcMapPath: string
  journalPath: string
}

const StarId = z.string().regex(/^[A-Z]-\d{4}$/)
const JournalSchema = z.object({
  version: z.literal(1),
  state: z.enum(['prepared', 'applied', 'rolled_back']),
  createdAt: z.string(),
  schemaVersion: z.union([z.literal(14), z.literal(15), z.literal(16), z.literal(17), z.literal(18), z.literal(19), z.literal(20), z.literal(21)]),
  beforeFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  afterFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  secretGuard: z.string().regex(/^[a-f0-9]{64}$/),
  nfcGuard: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.array(z.object({
    identityId: z.string(), seedIndex: z.number().int().positive(),
    before: StarId, after: StarId,
  }).strict()).min(1).max(300),
}).strict()
type Journal = z.infer<typeof JournalSchema>

function writeDurable(filePath: string, contents: string, exclusive = false): void {
  // Stage the updated file beside its target; never truncate the current credential file.
  const target = exclusive ? filePath : `${filePath}.next-${randomUUID()}`
  try {
    const fd = fs.openSync(target, 'wx', 0o600)
    try {
      fs.writeFileSync(fd, contents, 'utf8')
      fs.fsyncSync(fd)
    } finally { fs.closeSync(fd) }
    if (!exclusive) fs.renameSync(target, filePath)
  } finally { if (!exclusive && fs.existsSync(target)) fs.unlinkSync(target) }
}

function csvText(rows: string[][]): string {
  return '\uFEFF' + rows.map(row => row.map(cell =>
    `"${cell.replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n'
}

function secretGuard(secret: ReturnType<typeof readProtectedRuntimeSecret>): string {
  return sha256(JSON.stringify({ ...secret, directoryFingerprint: '' }))
}

function nfcGuard(rows: string[][]): string {
  return sha256(JSON.stringify(rows.map((row, index) =>
    index ? row.map((cell, column) => column === 3 ? '' : cell) : row)))
}

function assertUnused(database: SqliteDatabase): void {
  const runtime = database.prepare(`SELECT status, current_scene AS scene FROM v2_runtime_state WHERE id = 1`)
    .get() as { status: string; scene: string | null } | undefined
  const protocol = database.prepare(`SELECT data_classification AS profile FROM protocol_runtime WHERE id = 1`)
    .get() as { profile: string } | undefined
  if (protocol?.profile !== 'PROTECTED' || runtime?.status !== 'READY' || runtime.scene !== null) {
    throw new Error('Star renumbering requires an unused READY protected roster in an offline maintenance window')
  }
  for (const table of ['v2_participant_states', 'v2_public_stars', 'v2_domain_events',
    'v2_sessions', 'v2_control_receipts', 'v2_raffle_draws']) {
    if (Number(database.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()) !== 0) {
      throw new Error('Star renumbering refuses activated identities or retained runtime records')
    }
  }
}

function schemaVersion(database: SqliteDatabase): 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 {
  return Number(database.prepare("SELECT MAX(version) FROM _schema_migrations").pluck().get()) as 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21
}

function verify(database: SqliteDatabase, options: StarIdUpdateOptions, count: number): void {
  const result = verifyV2Foundation(database, {
    migrationsPath: options.migrationsPath, manifestPath: options.runtimeSecretPath,
    participantCount: count, throughSchemaVersion: schemaVersion(database),
  })
  if (!result.ready) throw new Error('Protected foundation verification failed; no identifiers were accepted')
  verifyProtectedNfcMap(database, options)
}

function directoryRows(database: SqliteDatabase) {
  return database.prepare(`SELECT id AS identityId, seed_index AS seedIndex,
    public_star_id AS before FROM synthetic_identities ORDER BY seed_index`).all() as
    Array<{ identityId: string; seedIndex: number; before: string }>
}

export function previewProtectedStarIds(database: SqliteDatabase, options: StarIdUpdateOptions) {
  assertUnused(database)
  const secret = readProtectedRuntimeSecret(options.runtimeSecretPath)
  verify(database, options, secret.participantCount)
  const csvRows = parseProtectedNfcCsv(fs.readFileSync(options.nfcMapPath, 'utf8'))
  const proposed = publicStarIdsForRoster(csvRows.slice(1).map(row => ({
    displayName: /^'[=+@-]/.test(row[1]!) ? row[1]!.slice(1) : row[1]!,
    studentNumber: row[2]!,
  })))
  const rows = directoryRows(database).map((row, index) => ({ ...row, after: proposed[index]! }))
  return { participantCount: rows.length, changedCount: rows.filter(row => row.before !== row.after).length,
    schemaVersion: schemaVersion(database), rows }
}

function setCodes(database: SqliteDatabase, rows: Journal['rows'], direction: 'before' | 'after'): void {
  const used = new Set(rows.flatMap(row => [row.before, row.after]))
  const identity = database.prepare('UPDATE synthetic_identities SET public_star_id = ? WHERE id = ?')
  const slot = database.prepare('UPDATE v2_identity_slots SET public_star_id = ? WHERE identity_id = ?')
  let candidate = 0
  // Two phases also handle swaps while honoring UNIQUE and A-0000 CHECK constraints.
  for (const row of rows) {
    let temporary: string
    do {
      if (candidate >= 260_000) throw new Error('Temporary identifier space exhausted')
      temporary = `${String.fromCharCode(65 + Math.floor(candidate / 10_000))}-${String(candidate % 10_000).padStart(4, '0')}`
      candidate += 1
    } while (used.has(temporary))
    used.add(temporary)
    if (identity.run(temporary, row.identityId).changes !== 1 || slot.run(temporary, row.identityId).changes !== 1) {
      throw new Error('Protected identity or slot is missing')
    }
  }
  for (const row of rows) {
    identity.run(row[direction], row.identityId)
    slot.run(row[direction], row.identityId)
  }
}

/** No credentials, names, full student numbers or invitation URLs enter the recovery journal. */
export function updateProtectedStarIds(
  database: SqliteDatabase, options: StarIdUpdateOptions, rollback = false,
): { participantCount: number; changedCount: number; schemaVersion: number; state: string } {
  if (database.inTransaction) throw new Error('Star renumbering requires its own maintenance transaction')
  for (const file of [options.runtimeSecretPath, options.nfcMapPath]) {
    if (!fs.lstatSync(file).isFile()) throw new Error('Private metadata must be a regular existing file')
  }
  if (!rollback && fs.existsSync(options.journalPath)) throw new Error('Recovery journal already exists; use a new path')
  const originalSecret = fs.readFileSync(options.runtimeSecretPath, 'utf8')
  const originalNfc = fs.readFileSync(options.nfcMapPath, 'utf8')
  const secret = readProtectedRuntimeSecret(options.runtimeSecretPath)
  const csvRows = parseProtectedNfcCsv(originalNfc)
  let touchedFiles = false
  database.exec('BEGIN IMMEDIATE')
  try {
    assertUnused(database)
    let journal: Journal
    let changedCount: number
    if (rollback) {
      journal = JournalSchema.parse(JSON.parse(fs.readFileSync(options.journalPath, 'utf8')))
      const current = directoryRows(database)
      const currentFingerprint = fingerprintProtectedDirectoryDatabase(database)
      if (journal.schemaVersion !== schemaVersion(database) ||
          ![journal.beforeFingerprint, journal.afterFingerprint].includes(currentFingerprint) ||
          ![journal.beforeFingerprint, journal.afterFingerprint].includes(secret.directoryFingerprint) ||
          journal.secretGuard !== secretGuard(secret) || journal.nfcGuard !== nfcGuard(csvRows) ||
          current.length !== journal.rows.length || current.some((row, index) => {
            const expected = journal.rows[index]!
            return row.identityId !== expected.identityId || row.seedIndex !== expected.seedIndex ||
              ![expected.before, expected.after].includes(row.before) ||
              ![expected.before, expected.after].includes(csvRows[index + 1]?.[3] ?? '')
          })) throw new Error('Recovery journal does not match the current protected files and directory')
      changedCount = current.filter((row, index) => row.before !== journal.rows[index]!.before).length
      setCodes(database, journal.rows, 'before')
      if (fingerprintProtectedDirectoryDatabase(database) !== journal.beforeFingerprint) {
        throw new Error('Recovery fingerprint did not match; transaction rolled back')
      }
    } else {
      const plan = previewProtectedStarIds(database, options)
      changedCount = plan.changedCount
      if (!changedCount) {
        database.exec('ROLLBACK')
        return { participantCount: plan.participantCount, changedCount: 0,
          schemaVersion: plan.schemaVersion, state: 'already_current' }
      }
      const beforeFingerprint = fingerprintProtectedDirectoryDatabase(database)
      setCodes(database, plan.rows, 'after')
      journal = { version: 1, state: 'prepared', createdAt: new Date().toISOString(),
        schemaVersion: plan.schemaVersion, beforeFingerprint,
        afterFingerprint: fingerprintProtectedDirectoryDatabase(database),
        secretGuard: secretGuard(secret), nfcGuard: nfcGuard(csvRows), rows: plan.rows }
      writeDurable(options.journalPath, JSON.stringify(journal, null, 2) + '\n', true)
    }
    const fingerprint = rollback ? journal.beforeFingerprint : journal.afterFingerprint
    database.prepare('UPDATE demo_seed_meta SET seed_fingerprint = ? WHERE id = 1').run(fingerprint)
    database.prepare('UPDATE app_state SET seed_fingerprint = ? WHERE id = 1').run(fingerprint)
    const updatedCsv = csvRows.map((row, index) => index
      ? row.map((cell, column) => column === 3 ? journal.rows[index - 1]![rollback ? 'before' : 'after'] : cell)
      : row)
    touchedFiles = true
    writeDurable(options.runtimeSecretPath, JSON.stringify({ ...secret, directoryFingerprint: fingerprint }, null, 2) + '\n')
    writeDurable(options.nfcMapPath, csvText(updatedCsv))
    verify(database, options, secret.participantCount)
    database.exec('COMMIT')
    // The durable prepared journal is sufficient for recovery even if this status write fails.
    journal.state = rollback ? 'rolled_back' : 'applied'
    try { writeDurable(options.journalPath, JSON.stringify(journal, null, 2) + '\n') } catch { /* retain prepared evidence */ }
    return { participantCount: journal.rows.length, changedCount,
      schemaVersion: journal.schemaVersion, state: journal.state }
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    if (touchedFiles) {
      writeDurable(options.runtimeSecretPath, originalSecret)
      writeDurable(options.nfcMapPath, originalNfc)
    }
    throw error
  }
}
