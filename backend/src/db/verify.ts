import type { AppConfig } from '../config.js'
import { verifyMigrations } from './migrate.js'
import type { SqliteDatabase } from './open-database.js'
import { verifyDemoSeed } from './seed.js'

export interface FoundationVerification {
  ready: boolean
  schemaVersion: number | null
  seedVersion: string | null
  participantCount: number
  resetEpoch: number | null
  issues: string[]
}

export function verifyFoundation(
  database: SqliteDatabase,
  config: AppConfig,
): FoundationVerification {
  const issues: string[] = []
  const migrations = verifyMigrations(database, config.migrationsPath)
  if (!migrations.ready) issues.push(...migrations.issues)

  const seed = verifyDemoSeed(database, {
    manifestPath: config.seedManifestPath,
    participantCount: config.seedParticipantCount,
  })
  if (!seed.ready) issues.push(...seed.issues)

  const journalMode = String(
    database.pragma('journal_mode', { simple: true }),
  ).toLowerCase()
  const foreignKeys = Number(database.pragma('foreign_keys', { simple: true }))
  const busyTimeout = Number(database.pragma('busy_timeout', { simple: true }))
  if (journalMode !== 'wal') issues.push('SQLite WAL mode is not active')
  if (foreignKeys !== 1) issues.push('SQLite foreign keys are not active')
  if (busyTimeout < 5_000) issues.push('SQLite busy timeout is too short')

  let resetEpoch: number | null = null
  try {
    const state = database
      .prepare('SELECT reset_epoch AS resetEpoch FROM app_state WHERE id = 1')
      .get() as { resetEpoch: number } | undefined
    resetEpoch = state?.resetEpoch ?? null
  } catch {
    issues.push('Application state is unavailable')
  }

  return {
    ready: issues.length === 0,
    schemaVersion: migrations.currentVersion,
    seedVersion: seed.seedVersion,
    participantCount: seed.participantCount,
    resetEpoch,
    issues: [...new Set(issues)],
  }
}
