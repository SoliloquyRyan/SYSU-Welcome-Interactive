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
): MigrationResult {
  const available = discoverMigrations(migrationsPath)
  ensureMigrationTable(database)
  const applied = readAppliedMigrations(database)
  const issues = validateAppliedMigrations(applied, available)

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
    currentVersion: available.at(-1)?.version ?? 0,
    availableVersion: available.at(-1)?.version ?? 0,
  }
}

export function verifyMigrations(
  database: SqliteDatabase,
  migrationsPath: string,
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
  if (currentVersion !== availableVersion) {
    issues.push(
      `Database schema version ${currentVersion} does not match ${availableVersion}`,
    )
  }

  return {
    ready: issues.length === 0,
    currentVersion,
    availableVersion,
    issues,
  }
}
