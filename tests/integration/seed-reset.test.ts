import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BACKEND_ROOT } from '../../backend/src/config.js'
import { migrateDatabase } from '../../backend/src/db/migrate.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import { resetDemoDatabase } from '../../backend/src/db/reset.js'
import {
  readSeedManifest,
  seedDemoDatabase,
  verifyDemoSeed,
} from '../../backend/src/db/seed.js'

const NOW = new Date('2026-08-10T04:00:00.000Z')

function collectCredentialStrings(
  value: unknown,
  parentKey = '',
  result = new Set<string>(),
): Set<string> {
  if (typeof value === 'string') {
    if (/(?:token|code|password|pepper)/i.test(parentKey) && value.length >= 6) {
      result.add(value)
    }
    return result
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCredentialStrings(item, parentKey, result)
    }
    return result
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectCredentialStrings(child, key, result)
    }
  }

  return result
}

function catalogSnapshot(database: Database.Database) {
  return {
    identities: database
      .prepare(
        `SELECT id, seed_index, display_name, demo_code_digest,
                public_star_id, visual_seed, enabled
         FROM synthetic_identities ORDER BY seed_index`,
      )
      .all(),
    invitations: database
      .prepare(
        `SELECT id, identity_id, token_digest, token_hint, status
         FROM invitation_tokens ORDER BY identity_id`,
      )
      .all(),
    programs: database
      .prepare(
        `SELECT id, sort_order, title, enabled
         FROM program_catalog ORDER BY sort_order`,
      )
      .all(),
    gifts: database
      .prepare(
        `SELECT id, sort_order, name, power_cost, enabled
         FROM gift_catalog ORDER BY sort_order`,
      )
      .all(),
    admins: database
      .prepare(
        `SELECT id, username, password_digest, enabled
         FROM admin_accounts ORDER BY id`,
      )
      .all(),
  }
}

function readAllDatabaseTextValues(database: Database.Database): Set<string> {
  const tableNames = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .pluck()
    .all() as string[]
  const values = new Set<string>()

  for (const tableName of tableNames) {
    const quotedTableName = `"${tableName.replaceAll('"', '""')}"`
    const textColumns = (
      database.prepare(`PRAGMA table_info(${quotedTableName})`).all() as Array<{
        name: string
        type: string
      }>
    ).filter(({ type }) => type.toUpperCase().includes('TEXT'))

    for (const column of textColumns) {
      const quotedColumnName = `"${column.name.replaceAll('"', '""')}"`
      const columnValues = database
        .prepare(
          `SELECT ${quotedColumnName} FROM ${quotedTableName}
           WHERE ${quotedColumnName} IS NOT NULL`,
        )
        .pluck()
        .all() as string[]
      for (const value of columnValues) {
        values.add(value)
      }
    }
  }

  return values
}

describe('deterministic 300-participant seed and reset', () => {
  let temporaryDirectory: string
  let databasePath: string
  let manifestPath: string
  let database: Database.Database

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sysu-welcome-seed-'),
    )
    databasePath = path.join(temporaryDirectory, 'demo.sqlite')
    manifestPath = path.join(temporaryDirectory, 'demo-seed-manifest.json')
    database = openDatabase(databasePath)
    migrateDatabase(database, path.join(BACKEND_ROOT, 'migrations'), () => NOW)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  function seed(): void {
    seedDemoDatabase(database, {
      manifestPath,
      participantCount: 300,
      now: () => NOW,
    })
  }

  it('creates exactly 300 unique synthetic identities and fixed catalogs', () => {
    seed()
    const manifest = readSeedManifest(manifestPath) as unknown as {
      participants?: unknown[]
    }
    const counts = database
      .prepare(
        `SELECT
           (SELECT count(*) FROM synthetic_identities) AS identities,
           (SELECT count(*) FROM invitation_tokens) AS invitations,
           (SELECT count(*) FROM program_catalog) AS programs,
           (SELECT count(*) FROM gift_catalog) AS gifts,
           (SELECT count(*) FROM admin_accounts) AS admins`,
      )
      .get() as Record<string, number>

    expect(counts.identities).toBe(300)
    expect(counts.invitations).toBe(300)
    expect(counts.programs).toBe(3)
    expect(counts.gifts).toBe(4)
    expect(counts.admins).toBe(1)
    expect(manifest.participants).toHaveLength(300)

    const uniqueness = database
      .prepare(
        `SELECT
           count(DISTINCT id) AS ids,
           count(DISTINCT seed_index) AS seedIndexes,
           count(DISTINCT demo_code_digest) AS codeDigests,
           count(DISTINCT public_star_id) AS starIds,
           count(DISTINCT visual_seed) AS visualSeeds
         FROM synthetic_identities`,
      )
      .get()
    expect(uniqueness).toEqual({
      ids: 300,
      seedIndexes: 300,
      codeDigests: 300,
      starIds: 300,
      visualSeeds: 300,
    })

    const giftCosts = database
      .prepare('SELECT power_cost FROM gift_catalog ORDER BY power_cost')
      .pluck()
      .all()
    expect(giftCosts).toEqual([5, 10, 20, 50])
  })

  it('stores credential digests instead of manifest plaintext in SQLite', () => {
    seed()
    const manifest = readSeedManifest(manifestPath)
    const plaintextCredentials = collectCredentialStrings(manifest)
    const storedDigests = [
      ...(database
        .prepare('SELECT demo_code_digest FROM synthetic_identities')
        .pluck()
        .all() as string[]),
      ...(database
        .prepare('SELECT token_digest FROM invitation_tokens')
        .pluck()
        .all() as string[]),
      ...(database
        .prepare('SELECT password_digest FROM admin_accounts')
        .pluck()
        .all() as string[]),
    ]

    expect(plaintextCredentials.size).toBeGreaterThanOrEqual(601)
    expect(storedDigests).toHaveLength(601)
    expect(storedDigests.every((digest) => /^[a-f0-9]{64}$/i.test(digest))).toBe(
      true,
    )
    const persistedTextValues = readAllDatabaseTextValues(database)
    for (const credential of plaintextCredentials) {
      expect(persistedTextValues.has(credential)).toBe(false)
    }
    for (const digest of storedDigests) {
      expect(plaintextCredentials.has(digest)).toBe(false)
    }

    database.pragma('wal_checkpoint(TRUNCATE)')
    const databaseBytes = fs.readFileSync(databasePath)
    for (const credential of [...plaintextCredentials].filter(
      (value) => value.length >= 16,
    )) {
      expect(databaseBytes.includes(Buffer.from(credential, 'utf8'))).toBe(
        false,
      )
    }
  })

  it('does not silently regenerate a missing manifest for a seeded database', () => {
    seed()
    const stateBefore = database
      .prepare(
        `SELECT seed_version AS seedVersion,
                seed_fingerprint AS seedFingerprint
         FROM app_state WHERE id = 1`,
      )
      .get()
    fs.rmSync(manifestPath)

    const verification = verifyDemoSeed(database, {
      manifestPath,
      participantCount: 300,
    })

    expect(verification.ready).toBe(false)
    expect(verification.issues).toContain('Seed manifest is missing or invalid')
    expect(() =>
      seedDemoDatabase(database, {
        manifestPath,
        participantCount: 300,
        now: () => NOW,
      }),
    ).toThrow(/manifest is missing.*database already contains seed state/i)
    expect(fs.existsSync(manifestPath)).toBe(false)
    expect(
      database
        .prepare(
          `SELECT seed_version AS seedVersion,
                  seed_fingerprint AS seedFingerprint
           FROM app_state WHERE id = 1`,
        )
        .get(),
    ).toEqual(stateBefore)
  })

  it.each([
    {
      label: 'program catalog',
      mutate(database: Database.Database) {
        database
          .prepare(
            `UPDATE program_catalog SET title = '被篡改的节目'
             WHERE id = 'program-001'`,
          )
          .run()
      },
    },
    {
      label: 'gift catalog',
      mutate(database: Database.Database) {
        database
          .prepare(
            `UPDATE gift_catalog SET name = '被篡改的礼物'
             WHERE id = 'gift-glimmer'`,
          )
          .run()
      },
    },
    {
      label: 'synthetic identity',
      mutate(database: Database.Database) {
        database
          .prepare(
            `UPDATE synthetic_identities SET display_name = '被篡改的身份'
             WHERE id = 'synthetic-001'`,
          )
          .run()
      },
    },
    {
      label: 'admin credential digest',
      mutate(database: Database.Database) {
        database
          .prepare(
            `UPDATE admin_accounts SET password_digest = ?
             WHERE id = 'admin-shared'`,
          )
          .run('f'.repeat(64))
      },
    },
  ])('detects seeded $label tampering', ({ mutate }) => {
    seed()
    expect(
      verifyDemoSeed(database, { manifestPath, participantCount: 300 }).ready,
    ).toBe(true)

    mutate(database)

    const verification = verifyDemoSeed(database, {
      manifestPath,
      participantCount: 300,
    })
    expect(verification.ready).toBe(false)
    expect(verification.issues.length).toBeGreaterThan(0)
    expect(() =>
      seedDemoDatabase(database, {
        manifestPath,
        participantCount: 300,
        now: () => NOW,
      }),
    ).toThrow(/seed verification failed/i)
  })

  it('restores the same seed while clearing mutable transport state', () => {
    seed()
    const catalogBefore = catalogSnapshot(database)
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8')
    const appStateBefore = database
      .prepare(
        `SELECT reset_epoch AS resetEpoch, seed_version AS seedVersion,
                seed_fingerprint AS seedFingerprint
         FROM app_state WHERE id = 1`,
      )
      .get() as {
      resetEpoch: number
      seedVersion: string
      seedFingerprint: string
    }

    database
      .prepare(
        `INSERT INTO sessions (
           id, session_type, subject_id, secret_digest, roles_json, reset_epoch,
           short_id, created_at, expires_at
         ) VALUES (?, 'ADMIN', ?, ?, '["DEMO_ADMIN"]', ?, ?, ?, ?)`,
      )
      .run(
        'session-001',
        'admin-shared',
        's'.repeat(64),
        appStateBefore.resetEpoch,
        'A001',
        NOW.toISOString(),
        '2026-08-11T04:00:00.000Z',
      )
    database
      .prepare(
        `INSERT INTO idempotency_records (
           reset_epoch, scope, key_digest, request_digest, response_status,
           response_body_json, created_at, expires_at
         ) VALUES (?, ?, ?, ?, 200, '{}', ?, ?)`,
      )
      .run(
        appStateBefore.resetEpoch,
        'test',
        'k'.repeat(64),
        'r'.repeat(64),
        NOW.toISOString(),
        '2026-08-11T04:00:00.000Z',
      )
    database
      .prepare(
        `INSERT INTO domain_events (
           event_seq, event_id, reset_epoch, stream, event_type,
           payload_json, committed_at
         ) VALUES (1, 'event-001', ?, 'screen', 'test.event', '{}', ?)`,
      )
      .run(appStateBefore.resetEpoch, NOW.toISOString())
    database
      .prepare(
        `INSERT INTO admin_operation_records (
           session_short_id, roles_json, action, result, request_id, created_at
         ) VALUES ('A001', '["DEMO_ADMIN"]', 'test', 'ok', 'request-001', ?)`,
      )
      .run(NOW.toISOString())
    database
      .prepare(
        `UPDATE synthetic_identities
         SET seed_index = 999,
             display_name = '被篡改的身份',
             demo_code_digest = ?,
             public_star_id = 'STAR-TAMPERED',
             visual_seed = ?,
             enabled = 0
         WHERE id = 'synthetic-001'`,
      )
      .run('d'.repeat(64), 'e'.repeat(32))
    database
      .prepare(
        `UPDATE invitation_tokens
         SET status = 'REVOKED'
         WHERE identity_id = 'synthetic-001'`,
      )
      .run()
    database
      .prepare(
        `UPDATE program_catalog
         SET sort_order = 99, title = '被篡改的节目', heat = 77, enabled = 0
         WHERE id = 'program-001'`,
      )
      .run()
    database
      .prepare(
        `UPDATE gift_catalog
         SET sort_order = 99, name = '被篡改的礼物', power_cost = 50, enabled = 0
         WHERE id = 'gift-glimmer'`,
      )
      .run()
    database
      .prepare(
        `UPDATE admin_accounts
         SET username = 'tampered-admin', password_digest = ?, enabled = 0
         WHERE id = 'admin-shared'`,
      )
      .run('f'.repeat(64))
    database
      .prepare(
        `UPDATE runtime_state
         SET mode = 'LIVE', status = 'RUNNING', stage = 5,
             stage_revision = 8, display_batch = 4, barrage_paused = 1
         WHERE id = 1`,
      )
      .run()
    database
      .prepare('UPDATE app_state SET event_seq = 1 WHERE id = 1')
      .run()

    resetDemoDatabase(database, {
      manifestPath,
      participantCount: 300,
      now: () => new Date('2026-08-10T04:05:00.000Z'),
    })

    const appStateAfter = database
      .prepare(
        `SELECT reset_epoch AS resetEpoch, event_seq AS eventSeq,
                seed_version AS seedVersion, seed_fingerprint AS seedFingerprint,
                is_resetting AS isResetting
         FROM app_state WHERE id = 1`,
      )
      .get()
    const runtimeAfter = database
      .prepare(
        `SELECT mode, status, stage, stage_revision AS stageRevision,
                display_batch AS displayBatch, barrage_paused AS barragePaused
         FROM runtime_state WHERE id = 1`,
      )
      .get()
    const mutableCounts = database
      .prepare(
        `SELECT
           (SELECT count(*) FROM sessions) AS sessions,
           (SELECT count(*) FROM idempotency_records) AS idempotency,
           (SELECT count(*) FROM domain_events) AS events,
           (SELECT count(*) FROM admin_operation_records) AS operations,
           (SELECT sum(heat) FROM program_catalog) AS totalHeat`,
      )
      .get()

    expect(catalogSnapshot(database)).toEqual(catalogBefore)
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestBefore)
    expect(
      verifyDemoSeed(database, { manifestPath, participantCount: 300 }),
    ).toMatchObject({ ready: true, issues: [] })
    expect(appStateAfter).toEqual({
      resetEpoch: appStateBefore.resetEpoch + 1,
      eventSeq: 0,
      seedVersion: appStateBefore.seedVersion,
      seedFingerprint: appStateBefore.seedFingerprint,
      isResetting: 0,
    })
    expect(runtimeAfter).toEqual({
      mode: 'REHEARSAL',
      status: 'READY',
      stage: 1,
      stageRevision: 0,
      displayBatch: 0,
      barragePaused: 0,
    })
    expect(mutableCounts).toEqual({
      sessions: 0,
      idempotency: 0,
      events: 0,
      operations: 0,
      totalHeat: 0,
    })
  })
})
