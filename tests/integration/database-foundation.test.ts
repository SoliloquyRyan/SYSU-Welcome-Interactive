import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BACKEND_ROOT } from '../../backend/src/config.js'
import {
  discoverMigrations,
  migrateDatabase,
  verifyMigrations,
} from '../../backend/src/db/migrate.js'
import { openDatabase } from '../../backend/src/db/open-database.js'

const MIGRATIONS_PATH = path.join(BACKEND_ROOT, 'migrations')

describe('SQLite platform foundation', () => {
  let temporaryDirectory: string
  let database: Database.Database | undefined

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sysu-welcome-g1-'),
    )
  })

  afterEach(() => {
    database?.close()
    database = undefined
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  function openMigratedDatabase(): Database.Database {
    database = openDatabase(path.join(temporaryDirectory, 'demo.sqlite'))
    migrateDatabase(database, MIGRATIONS_PATH, () =>
      new Date('2026-08-10T04:00:00.000Z'),
    )
    return database
  }

  it('opens every database with WAL, foreign keys and a busy timeout', () => {
    database = openDatabase(path.join(temporaryDirectory, 'demo.sqlite'))

    const journalMode = database.pragma('journal_mode', { simple: true })
    const foreignKeys = database.pragma('foreign_keys', { simple: true })
    const busyTimeout = database.pragma('busy_timeout', { simple: true })

    expect(String(journalMode).toLowerCase()).toBe('wal')
    expect(foreignKeys).toBe(1)
    expect(busyTimeout).toBe(5_000)
  })

  it('discovers one contiguous migration sequence', () => {
    const migrations = discoverMigrations(MIGRATIONS_PATH)
    const versions = migrations.map(({ version }) => version)

    expect(versions.length).toBeGreaterThanOrEqual(4)
    expect(versions).toEqual(
      Array.from({ length: versions.length }, (_, index) => index + 1),
    )
    expect(migrations.every(({ checksum }) => checksum.length === 64)).toBe(
      true,
    )
  })

  it('applies each migration exactly once and verifies its checksum', () => {
    database = openDatabase(path.join(temporaryDirectory, 'demo.sqlite'))
    const availableVersions = discoverMigrations(MIGRATIONS_PATH).map(
      ({ version }) => version,
    )
    const latestVersion = availableVersions.at(-1) ?? 0

    const first = migrateDatabase(database, MIGRATIONS_PATH, () =>
      new Date('2026-08-10T04:00:00.000Z'),
    )
    const second = migrateDatabase(database, MIGRATIONS_PATH, () =>
      new Date('2026-08-10T04:01:00.000Z'),
    )
    const verification = verifyMigrations(database, MIGRATIONS_PATH)

    expect(first).toEqual({
      applied: availableVersions,
      currentVersion: latestVersion,
      availableVersion: latestVersion,
    })
    expect(second.applied).toEqual([])
    expect(verification).toMatchObject({
      ready: true,
      currentVersion: latestVersion,
      availableVersion: latestVersion,
      issues: [],
    })
  })

  it('detects an applied migration whose checksum was changed', () => {
    const migrated = openMigratedDatabase()
    migrated
      .prepare('UPDATE _schema_migrations SET checksum = ? WHERE version = 2')
      .run('0'.repeat(64))

    const verification = verifyMigrations(migrated, MIGRATIONS_PATH)

    expect(verification.ready).toBe(false)
    expect(verification.issues).toContain('Migration 2 checksum changed')
    expect(() => migrateDatabase(migrated, MIGRATIONS_PATH)).toThrow(
      'Migration 2 checksum changed',
    )
  })

  it('rejects an applied migration history with a missing version', () => {
    const migrated = openMigratedDatabase()
    migrated
      .prepare('DELETE FROM _schema_migrations WHERE version = 2')
      .run()

    const verification = verifyMigrations(migrated, MIGRATIONS_PATH)

    expect(verification.ready).toBe(false)
    expect(
      verification.issues.some(
        (issue) =>
          issue.includes('2') && /missing|gap|contiguous/i.test(issue),
      ),
    ).toBe(true)
    expect(() => migrateDatabase(migrated, MIGRATIONS_PATH)).toThrow(
      /missing|gap|contiguous/i,
    )
  })

  it('rejects migration gaps before touching a database', () => {
    const brokenMigrationsPath = path.join(temporaryDirectory, 'migrations')
    fs.mkdirSync(brokenMigrationsPath)
    fs.writeFileSync(
      path.join(brokenMigrationsPath, '0001_first.sql'),
      'SELECT 1;',
    )
    fs.writeFileSync(
      path.join(brokenMigrationsPath, '0003_third.sql'),
      'SELECT 3;',
    )

    expect(() => discoverMigrations(brokenMigrationsPath)).toThrow(
      'Migration sequence must be contiguous: expected 2, found 3',
    )
  })

  it('enforces relational integrity instead of accepting orphan tokens', () => {
    const migrated = openMigratedDatabase()

    expect(() =>
      migrated
        .prepare(
          `INSERT INTO invitation_tokens (
             id, identity_id, token_digest, token_hint, status, created_at, updated_at
           ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
        )
        .run(
          'invitation-orphan',
          'identity-missing',
          'a'.repeat(64),
          'missing',
          '2026-08-10T04:00:00.000Z',
          '2026-08-10T04:00:00.000Z',
        ),
    ).toThrow(/FOREIGN KEY constraint failed/i)
  })

  it('starts from the deterministic runtime/reset baseline', () => {
    const migrated = openMigratedDatabase()
    const appState = migrated
      .prepare(
        `SELECT reset_epoch, event_seq, seed_version, seed_fingerprint, is_resetting
         FROM app_state WHERE id = 1`,
      )
      .get()
    const runtime = migrated
      .prepare(
        `SELECT mode, status, stage, stage_revision, display_batch, barrage_paused
         FROM runtime_state WHERE id = 1`,
      )
      .get()

    expect(appState).toEqual({
      reset_epoch: 1,
      event_seq: 0,
      seed_version: null,
      seed_fingerprint: null,
      is_resetting: 0,
    })
    expect(runtime).toEqual({
      mode: 'REHEARSAL',
      status: 'READY',
      stage: 1,
      stage_revision: 0,
      display_batch: 0,
      barrage_paused: 0,
    })
  })
})
