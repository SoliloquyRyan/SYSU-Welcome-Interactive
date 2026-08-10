import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ScreenSnapshotSchema } from '../../packages/contracts/src/index.js'
import { BACKEND_ROOT } from '../../backend/src/config.js'
import { migrateDatabase } from '../../backend/src/db/migrate.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import { readScreenSnapshot } from '../../backend/src/services/screen-snapshot.js'

const NOW = '2026-08-10T04:00:00.000Z'

describe('public screen snapshot', () => {
  let temporaryDirectory: string
  let database: Database.Database

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sysu-welcome-snapshot-'),
    )
    database = openDatabase(path.join(temporaryDirectory, 'demo.sqlite'))
    migrateDatabase(database, path.join(BACKEND_ROOT, 'migrations'), () =>
      new Date(NOW),
    )
  })

  afterEach(() => {
    database.close()
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  it('returns only anonymous runtime, catalog and aggregate data', () => {
    const privateName = '合成测试身份-绝不公开'
    const privateCodeDigest = 'c'.repeat(64)
    const privateTokenDigest = 't'.repeat(64)
    const privatePasswordDigest = 'p'.repeat(64)

    database
      .prepare(
        `INSERT INTO synthetic_identities (
           id, seed_index, display_name, demo_code_digest, public_star_id,
           visual_seed, enabled, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        'identity-private',
        1,
        privateName,
        privateCodeDigest,
        'STAR-PRIVATE',
        'visual-private',
        NOW,
      )
    database
      .prepare(
        `INSERT INTO invitation_tokens (
           id, identity_id, token_digest, token_hint, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      )
      .run(
        'invitation-private',
        'identity-private',
        privateTokenDigest,
        'private-hint',
        NOW,
        NOW,
      )
    database
      .prepare(
        `INSERT INTO admin_accounts (
           id, username, password_digest, enabled, created_at, updated_at
         ) VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .run(
        'admin-shared',
        'shared-admin',
        privatePasswordDigest,
        NOW,
        NOW,
      )
    database
      .prepare(
        `INSERT INTO program_catalog (
           id, sort_order, title, heat, enabled, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .run('program-001', 1, '虚构节目一', 20, NOW, NOW)

    const snapshot = readScreenSnapshot(database, () => new Date(NOW))
    const serialized = JSON.stringify(snapshot)

    expect(ScreenSnapshotSchema.parse(snapshot)).toEqual(snapshot)
    expect(snapshot.programs).toEqual([
      { id: 'program-001', title: '虚构节目一', order: 1, heat: 20 },
    ])
    expect(serialized).not.toContain(privateName)
    expect(serialized).not.toContain(privateCodeDigest)
    expect(serialized).not.toContain(privateTokenDigest)
    expect(serialized).not.toContain(privatePasswordDigest)
    expect(serialized).not.toContain('private-hint')
    expect(serialized).not.toContain('shared-admin')
  })

  it('reflects the authoritative runtime revision without inventing events', () => {
    database
      .prepare(
        `UPDATE runtime_state
         SET mode = 'LIVE', status = 'RUNNING', stage = 4,
             stage_revision = 7, display_batch = 3, barrage_paused = 1,
             updated_at = ?
         WHERE id = 1`,
      )
      .run(NOW)
    database
      .prepare('UPDATE app_state SET event_seq = 42, updated_at = ? WHERE id = 1')
      .run(NOW)

    const snapshot = readScreenSnapshot(database, () => new Date(NOW))

    expect(snapshot).toMatchObject({
      eventSeq: 42,
      displayBatch: 3,
      runtime: {
        resetEpoch: 1,
        stageRevision: 7,
        mode: 'LIVE',
        status: 'RUNNING',
        stage: 4,
        barragePaused: true,
      },
      publishedBarrages: [],
    })
  })
})
