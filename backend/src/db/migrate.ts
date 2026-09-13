import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { SqliteDatabase } from './open-database.js'
import { databaseTableExists } from './open-database.js'

interface MigrationFile {
  version: number
  filename: string
  checksum: string
  sql: string
}

interface AppliedMigration {
  version: number
  filename: string
  checksum: string
}

export interface MigrationResult {
  applied: number[]
  currentVersion: number
  availableVersion: number
}

export interface MigrationVerification {
  ready: boolean
  currentVersion: number | null
  availableVersion: number
  issues: string[]
}

export interface ActiveV2MigrationResult extends MigrationResult {
  previousVersion: number
}

function checksum(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

export function discoverMigrations(migrationsPath: string): MigrationFile[] {
  const filenames = fs
    .readdirSync(migrationsPath)
    .filter((filename) => filename.endsWith('.sql'))
    .sort()

  const migrations = filenames.map((filename) => {
    const match = /^(\d{4})_[a-z0-9][a-z0-9_-]*\.sql$/i.exec(filename)
    if (!match?.[1]) {
      throw new Error(`Invalid migration filename: ${filename}`)
    }

    const content = fs.readFileSync(path.join(migrationsPath, filename))
    return {
      version: Number.parseInt(match[1], 10),
      filename,
      checksum: checksum(content),
      sql: content.toString('utf8'),
    }
  })

  migrations.forEach((migration, index) => {
    const expectedVersion = index + 1
    if (migration.version !== expectedVersion) {
      throw new Error(
        `Migration sequence must be contiguous: expected ${expectedVersion}, found ${migration.version}`,
      )
    }
  })

  return migrations
}

function ensureMigrationTable(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      version INTEGER PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL CHECK (length(checksum) = 64),
      applied_at TEXT NOT NULL
    )
  `)
}

function assertLegacyMigrationRuntime(database: SqliteDatabase): void {
  if (!databaseTableExists(database, 'protocol_runtime')) return
  const runtime = database
    .prepare(
      `SELECT active_protocol_version AS activeProtocolVersion,
              activation_state AS activationState
       FROM protocol_runtime
       WHERE id = 1`,
    )
    .get() as
    | { activeProtocolVersion: string; activationState: string }
    | undefined
  if (
    !runtime ||
    runtime.activeProtocolVersion !== '1' ||
    runtime.activationState !== 'V1_ACTIVE'
  ) {
    throw new Error(
      'The legacy migration entrypoint refuses a database whose active protocol is not v1',
    )
  }
}

function readAppliedMigrations(database: SqliteDatabase): AppliedMigration[] {
  return database
    .prepare(
      `SELECT version, filename, checksum
       FROM _schema_migrations
       ORDER BY version`,
    )
    .all() as AppliedMigration[]
}

function validateAppliedMigrations(
  applied: AppliedMigration[],
  available: MigrationFile[],
): string[] {
  const issues: string[] = []

  for (const [index, row] of applied.entries()) {
    const expectedVersion = index + 1
    if (row.version !== expectedVersion) {
      issues.push(
        `Applied migration sequence must be contiguous: expected ${expectedVersion}, found ${row.version}`,
      )
    }
    const migration = available.find((candidate) => candidate.version === row.version)
    if (!migration) {
      issues.push(`Database contains unknown migration version ${row.version}`)
      continue
    }
    if (migration.filename !== row.filename) {
      issues.push(`Migration ${row.version} filename changed`)
    }
    if (migration.checksum !== row.checksum) {
      issues.push(`Migration ${row.version} checksum changed`)
    }
  }

  return issues
}

export function migrateDatabase(
  database: SqliteDatabase,
  migrationsPath: string,
  now: () => Date = () => new Date(),
  targetVersion?: number,
): MigrationResult {
  const discovered = discoverMigrations(migrationsPath)
  const availableVersion = discovered.at(-1)?.version ?? 0
  const resolvedTargetVersion = targetVersion ?? availableVersion
  if (
    resolvedTargetVersion < 0 ||
    (resolvedTargetVersion !== 0 &&
      !discovered.some((migration) => migration.version === resolvedTargetVersion))
  ) {
    throw new Error(`Unknown migration target version ${resolvedTargetVersion}`)
  }
  const available = discovered.filter(
    (migration) => migration.version <= resolvedTargetVersion,
  )
  assertLegacyMigrationRuntime(database)
  ensureMigrationTable(database)
  const applied = readAppliedMigrations(database)
  const issues = validateAppliedMigrations(applied, discovered)
  if (applied.some((migration) => migration.version > resolvedTargetVersion)) {
    issues.push(
      `Database schema is newer than requested target ${resolvedTargetVersion}`,
    )
  }

  if (issues.length > 0) {
    throw new Error(issues.join('; '))
  }

  const appliedVersions = new Set(applied.map((row) => row.version))
  const newlyApplied: number[] = []

  for (const migration of available) {
    if (appliedVersions.has(migration.version)) {
      continue
    }

    database.exec('BEGIN IMMEDIATE')
    try {
      assertLegacyMigrationRuntime(database)
      database.exec(migration.sql)
      database
        .prepare(
          `INSERT INTO _schema_migrations (version, filename, checksum, applied_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(
          migration.version,
          migration.filename,
          migration.checksum,
          now().toISOString(),
        )
      database.exec('COMMIT')
      newlyApplied.push(migration.version)
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }

  return {
    applied: newlyApplied,
    currentVersion: resolvedTargetVersion,
    availableVersion,
  }
}

export function verifyMigrations(
  database: SqliteDatabase,
  migrationsPath: string,
): MigrationVerification {
  const availableVersion = discoverMigrations(migrationsPath).at(-1)?.version ?? 0
  return verifyMigrationHistoryAtVersion(
    database,
    migrationsPath,
    availableVersion,
  )
}

export function verifyMigrationHistoryAtVersion(
  database: SqliteDatabase,
  migrationsPath: string,
  expectedVersion: number,
): MigrationVerification {
  const available = discoverMigrations(migrationsPath)
  const availableVersion = available.at(-1)?.version ?? 0

  if (!databaseTableExists(database, '_schema_migrations')) {
    return {
      ready: false,
      currentVersion: null,
      availableVersion,
      issues: ['Migration table is missing'],
    }
  }

  const applied = readAppliedMigrations(database)
  const issues = validateAppliedMigrations(applied, available)
  const currentVersion = applied.at(-1)?.version ?? 0
  if (currentVersion !== expectedVersion) {
    issues.push(
      `Database schema version ${currentVersion} does not match ${expectedVersion}`,
    )
  }

  return {
    ready: issues.length === 0,
    currentVersion,
    availableVersion,
    issues,
  }
}

/**
 * Migrations 0013-0015 change persisted protocol-v2 state, so they must never pass
 * through the legacy auto-migration entrypoint. The backup-first v2
 * maintenance workflow owns the surrounding transaction and is the only
 * supported caller of this deliberately narrow helper.
 */
export function migrateActiveV2DatabaseFrom12To15(
  database: SqliteDatabase,
  migrationsPath: string,
  now: () => Date = () => new Date(),
): ActiveV2MigrationResult {
  if (!database.inTransaction) {
    throw new Error('The protocol v2 schema upgrade requires an existing write transaction')
  }

  const runtime = database
    .prepare(
      `SELECT active_protocol_version AS activeProtocolVersion,
              activation_state AS activationState,
              data_classification AS dataClassification
       FROM protocol_runtime
       WHERE id = 1`,
    )
    .get() as
    | {
        activeProtocolVersion: string
        activationState: string
        dataClassification: string
      }
    | undefined
  if (
    !runtime ||
    runtime.activeProtocolVersion !== '2' ||
    runtime.activationState !== 'V2_ACTIVE' ||
    runtime.dataClassification !== 'SYNTHETIC_DEMO'
  ) {
    throw new Error('Migrations 0013-0015 only support an active synthetic protocol v2 database')
  }

  const available = discoverMigrations(migrationsPath)
  const availableVersion = available.at(-1)?.version ?? 0
  if (availableVersion !== 21) {
    throw new Error(`Migration 0021 must be the repository tip, found ${availableVersion}`)
  }
  if (!databaseTableExists(database, '_schema_migrations')) {
    throw new Error('Migration table is missing')
  }

  const applied = readAppliedMigrations(database)
  const issues = validateAppliedMigrations(applied, available)
  const currentVersion = applied.at(-1)?.version ?? 0
  if (currentVersion !== 12) {
    issues.push(`Database schema version ${currentVersion} does not match 12`)
  }
  const pending = available.filter((migration) => migration.version > currentVersion)
  if (
    pending.length !== 9 ||
    pending[0]?.version !== 13 ||
    pending[1]?.version !== 14 ||
    pending[2]?.version !== 15 || pending[3]?.version !== 16 ||
    pending[4]?.version !== 17 || pending[5]?.version !== 18 ||
    pending[6]?.version !== 19 || pending[7]?.version !== 20 || pending[8]?.version !== 21
  ) {
    issues.push('The only permitted pending migrations are 0013 through 0021')
  }
  if (issues.length > 0) {
    throw new Error(issues.join('; '))
  }

  for (const migration of pending) {
    database.exec(migration.sql)
    database
      .prepare(
        `INSERT INTO _schema_migrations (version, filename, checksum, applied_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        migration.version,
        migration.filename,
        migration.checksum,
        now().toISOString(),
      )
  }

  return {
    applied: pending.map(({ version }) => version),
    previousVersion: currentVersion,
    currentVersion: pending.at(-1)!.version,
    availableVersion,
  }
}

/** @deprecated Use migrateActiveV2DatabaseFrom12To15. */
export const migrateActiveV2DatabaseFrom12To13 =
  migrateActiveV2DatabaseFrom12To15

/** @deprecated Use migrateActiveV2DatabaseFrom12To15. */
export const migrateActiveV2DatabaseFrom12To14 = migrateActiveV2DatabaseFrom12To15

export function migrateActiveV2ProgramCatalogFrom14To15(
  database: SqliteDatabase, migrationsPath: string, now: () => Date = () => new Date(),
): ActiveV2MigrationResult {
  if (!database.inTransaction) throw new Error('The catalog upgrade requires an existing write transaction')
  const protocol = database.prepare(`SELECT active_protocol_version AS version, activation_state AS state,
    data_classification AS classification FROM protocol_runtime WHERE id = 1`).get() as
    { version: string; state: string; classification: string } | undefined
  if (protocol?.version !== '2' || protocol.state !== 'V2_ACTIVE' || !['SYNTHETIC_DEMO', 'PROTECTED'].includes(protocol.classification)) {
    throw new Error('The catalog migration requires an active verified v2 directory')
  }
  const history = verifyMigrationHistoryAtVersion(database, migrationsPath, 14)
  if (!history.ready || history.availableVersion !== 21) throw new Error('The catalog upgrade requires exact schema 14 and repository tip 21')
  const migration = discoverMigrations(migrationsPath).find(({ version }) => version === 15)!
  database.exec(migration.sql)
  database.prepare('INSERT INTO _schema_migrations (version, filename, checksum, applied_at) VALUES (?, ?, ?, ?)')
    .run(migration.version, migration.filename, migration.checksum, now().toISOString())
  const final = migrateActiveV2InteractionsFrom15To16(database, migrationsPath, now)
  return { ...final, applied: [15, 16, 17, 18, 19, 20, 21], previousVersion: 14 }
}

export function migrateActiveV2InteractionsFrom15To16(database: SqliteDatabase, migrationsPath: string, now: () => Date = () => new Date()): ActiveV2MigrationResult {
  if (!database.inTransaction) throw new Error('Interaction upgrade requires an existing transaction')
  const history = verifyMigrationHistoryAtVersion(database, migrationsPath, 15)
  if (!history.ready || history.availableVersion !== 21) throw new Error('Interaction upgrade requires exact schema 15 and tip 21')
  const migration = discoverMigrations(migrationsPath).find(item => item.version === 16)!
  database.exec(migration.sql)
  database.prepare('INSERT INTO _schema_migrations (version, filename, checksum, applied_at) VALUES (?, ?, ?, ?)').run(16, migration.filename, migration.checksum, now().toISOString())
  const final = migrateActiveV2GiftExperienceFrom16To17(database, migrationsPath, now)
  return { ...final, applied: [16, 17, 18, 19, 20, 21], previousVersion: 15 }
}

export function migrateActiveV2GiftExperienceFrom16To17(database: SqliteDatabase, migrationsPath: string, now: () => Date = () => new Date()): ActiveV2MigrationResult {
  if (!database.inTransaction) throw new Error('Gift experience upgrade requires an existing transaction')
  const history = verifyMigrationHistoryAtVersion(database, migrationsPath, 16)
  if (!history.ready || history.availableVersion !== 21) throw new Error('Gift experience upgrade requires exact schema 16 and tip 21')
  const migration = discoverMigrations(migrationsPath).find(item => item.version === 17)!
  database.exec(migration.sql)
  database.prepare('INSERT INTO _schema_migrations (version, filename, checksum, applied_at) VALUES (?, ?, ?, ?)').run(17, migration.filename, migration.checksum, now().toISOString())
  const final = migrateActiveV2ProgramCreditsFrom17To18(database, migrationsPath, now)
  return { ...final, applied: [17, 18, 19, 20, 21], previousVersion: 16 }
}

// Public catalogue metadata only. The verified maintenance caller owns the backup and transaction.
export function migrateActiveV2ProgramCreditsFrom17To18(database: SqliteDatabase, migrationsPath: string, now: () => Date = () => new Date()): ActiveV2MigrationResult {
  if (!database.inTransaction) throw new Error('Programme credits upgrade requires an existing transaction')
  const protocol = database.prepare('SELECT active_protocol_version AS version, activation_state AS state FROM protocol_runtime WHERE id = 1').get() as { version: string; state: string } | undefined
  if (protocol?.version !== '2' || protocol.state !== 'V2_ACTIVE') throw new Error('Programme credits upgrade requires active protocol v2')
  const history = verifyMigrationHistoryAtVersion(database, migrationsPath, 17)
  if (!history.ready || history.availableVersion !== 21) throw new Error('Programme credits upgrade requires exact schema 17 and tip 21')
  const migration = discoverMigrations(migrationsPath).find(item => item.version === 18)!
  database.exec(migration.sql)
  database.prepare('INSERT INTO _schema_migrations (version, filename, checksum, applied_at) VALUES (?, ?, ?, ?)').run(18, migration.filename, migration.checksum, now().toISOString())
  const final = migrateActiveV2LiveInteractionsFrom18To19(database, migrationsPath, now)
  return { ...final, applied: [18, 19, 20, 21], previousVersion: 17 }
}

export function migrateActiveV2LiveInteractionsFrom18To19(
  database: SqliteDatabase,
  migrationsPath: string,
  now: () => Date = () => new Date(),
): ActiveV2MigrationResult {
  if (!database.inTransaction) throw new Error('Live interaction upgrade requires an existing transaction')
  const protocol = database.prepare('SELECT active_protocol_version AS version, activation_state AS state FROM protocol_runtime WHERE id = 1').get() as { version: string; state: string } | undefined
  if (protocol?.version !== '2' || protocol.state !== 'V2_ACTIVE') throw new Error('Live interaction upgrade requires active protocol v2')
  const history = verifyMigrationHistoryAtVersion(database, migrationsPath, 18)
  if (!history.ready || history.availableVersion !== 21) throw new Error('Live interaction upgrade requires exact schema 18 and tip 21')
  const migration = discoverMigrations(migrationsPath).find(item => item.version === 19)!
  database.exec(migration.sql)
  database.prepare('INSERT INTO _schema_migrations (version, filename, checksum, applied_at) VALUES (?, ?, ?, ?)').run(19, migration.filename, migration.checksum, now().toISOString())
  const final = migrateActiveV2AwardsFrom19To20(database, migrationsPath, now)
  return { ...final, applied: [19, 20, 21], previousVersion: 18 }
}

export function migrateActiveV2AwardsFrom19To20(database: SqliteDatabase, migrationsPath: string, now: () => Date = () => new Date()): ActiveV2MigrationResult {
  if (!database.inTransaction) throw new Error('Awards upgrade requires an existing transaction')
  const protocol = database.prepare('SELECT active_protocol_version AS version, activation_state AS state FROM protocol_runtime WHERE id = 1').get() as { version: string; state: string } | undefined
  if (protocol?.version !== '2' || protocol.state !== 'V2_ACTIVE') throw new Error('Awards upgrade requires active protocol v2')
  const history = verifyMigrationHistoryAtVersion(database, migrationsPath, 19)
  if (!history.ready || history.availableVersion !== 21) throw new Error('Awards upgrade requires exact schema 19 and tip 21')
  const migration = discoverMigrations(migrationsPath).find(item => item.version === 20)!
  database.exec(migration.sql)
  database.prepare('INSERT INTO _schema_migrations (version, filename, checksum, applied_at) VALUES (?, ?, ?, ?)').run(20, migration.filename, migration.checksum, now().toISOString())
  const final = migrateActiveV2ProgramRankingFrom20To21(database, migrationsPath, now)
  return { ...final, applied: [20, 21], previousVersion: 19 }
}

export function migrateActiveV2ProgramRankingFrom20To21(database: SqliteDatabase, migrationsPath: string, now: () => Date = () => new Date()): ActiveV2MigrationResult {
  if (!database.inTransaction) throw new Error('Programme ranking upgrade requires an existing transaction')
  const protocol = database.prepare('SELECT active_protocol_version AS version, activation_state AS state FROM protocol_runtime WHERE id = 1').get() as { version: string; state: string } | undefined
  if (protocol?.version !== '2' || protocol.state !== 'V2_ACTIVE') throw new Error('Programme ranking upgrade requires active protocol v2')
  const history = verifyMigrationHistoryAtVersion(database, migrationsPath, 20)
  if (!history.ready || history.availableVersion !== 21) throw new Error('Programme ranking upgrade requires exact schema 20 and tip 21')
  const migration = discoverMigrations(migrationsPath).find(item => item.version === 21)!
  database.exec(migration.sql)
  database.prepare('INSERT INTO _schema_migrations (version, filename, checksum, applied_at) VALUES (?, ?, ?, ?)').run(21, migration.filename, migration.checksum, now().toISOString())
  return { applied: [21], previousVersion: 20, currentVersion: 21, availableVersion: 21 }
}
