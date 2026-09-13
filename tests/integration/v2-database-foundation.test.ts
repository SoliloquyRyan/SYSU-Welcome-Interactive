import { createHmac } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp, type BuildAppOptions } from '../../backend/src/app.js'
import { BACKEND_ROOT, type AppConfig } from '../../backend/src/config.js'
import { migrateDatabase } from '../../backend/src/db/migrate.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import { createSession } from '../../backend/src/auth/session.js'
import {
  fingerprintManifest,
  readDemoCredentialContext,
  readSeedManifest,
  seedDemoDatabase,
} from '../../backend/src/db/seed.js'
import {
  acquireV1ServiceLease,
  completeV1ServiceShutdown,
  markV1ServiceListening,
  readProtocolRuntime,
  resetSyntheticV2Database,
  switchSyntheticDemoToV2,
  upgradeSyntheticV2DatabaseFrom12To15,
  V2_DESTRUCTIVE_CONFIRMATION,
  V2_REWARD_RULE_VERSION,
  V2MaintenanceError,
  verifyV2Foundation,
} from '../../backend/src/db/v2-foundation.js'
import {
  activateV2Participant,
  executeV2ParticipantOnboardingCommand,
} from '../../backend/src/services/v2-participant-onboarding.js'
import * as programProjections from '../../backend/src/services/v2-program-catalog.js'
import { executeV2RuntimeCommand } from '../../backend/src/services/v2-runtime-commands.js'
import { readV2AdminSnapshot } from '../../backend/src/services/v2-snapshots.js'
import { eventProgramPreset } from '../../frontend/src/pages/admin/program-catalog.js'

const NOW = new Date('2026-08-13T04:00:00.000Z')
const MIGRATIONS_PATH = path.join(BACKEND_ROOT, 'migrations')

describe('V2-02 database foundation and explicit synthetic cutover gate', () => {
  let temporaryDirectory: string
  let databasePath: string
  let manifestPath: string
  let backupPath: string
  let database: ReturnType<typeof openDatabase>

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sysu-welcome-v2-db-'),
    )
    databasePath = path.join(temporaryDirectory, 'demo.sqlite')
    manifestPath = path.join(temporaryDirectory, 'demo-seed-manifest.json')
    backupPath = path.join(temporaryDirectory, 'v1-cutover-backup.sqlite')
    database = openDatabase(databasePath)
  })

  afterEach(() => {
    if (database.open) database.close()
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  function seedV1Baseline(): void {
    migrateDatabase(database, MIGRATIONS_PATH, () => NOW)
    seedDemoDatabase(database, {
      manifestPath,
      participantCount: 300,
      now: () => NOW,
    })
    const generation = acquireV1ServiceLease(
      database,
      'test-v1-service',
      NOW,
    )
    markV1ServiceListening(database, 'test-v1-service', generation, NOW)
    completeV1ServiceShutdown(database, 'test-v1-service', generation, NOW)
  }

  function seedV2Schema12Baseline(): void {
    migrateDatabase(database, MIGRATIONS_PATH, () => NOW, 12)
    seedDemoDatabase(database, {
      manifestPath,
      participantCount: 300,
      now: () => NOW,
    })
    const timestamp = NOW.toISOString()
    database
      .prepare(
        `UPDATE protocol_runtime
         SET v1_service_registered_at = ?, v1_service_generation = 1,
             v1_service_listen_generation = 1, v1_service_listened_at = ?,
             v1_service_clean_shutdown_generation = 1,
             v1_service_clean_shutdown_at = ?, updated_at = ?
         WHERE id = 1`,
      )
      .run(timestamp, timestamp, timestamp, timestamp)
    database
      .prepare(
        `INSERT INTO v2_identity_slots (
           identity_id, seed_index, public_star_id, formation_slot,
           reserved_reset_epoch, reserved_at
         )
         SELECT id, seed_index, public_star_id, 'slot:' || visual_seed, NULL, NULL
         FROM synthetic_identities
         WHERE enabled = 1
         ORDER BY seed_index`,
      )
      .run()
    database
      .prepare(
        `INSERT INTO v2_runtime_state (
           id, reset_epoch, mode, status, current_scene, run_revision,
           presentation_type, presentation_revision,
           public_aggregate_revision, admin_aggregate_revision,
           reward_rule_version, public_seq, admin_seq, completed_at, updated_at
         ) VALUES (
           1, 2, 'REHEARSAL', 'READY', NULL, 0, 'NONE', 0,
           0, 0, 'v2-rewards-2026-08-13', 0, 0, NULL, ?
         )`,
      )
      .run(timestamp)
    database
      .prepare(
        `INSERT INTO v2_screen_interaction_state (
           id, reset_epoch, interaction_revision, barrage_paused,
           display_batch, next_display_seq, updated_at
         ) VALUES (1, 2, 0, 0, 0, 1, ?)`,
      )
      .run(timestamp)
    database
      .prepare(
        `INSERT INTO v2_stream_cursors (reset_epoch, stream_id, stream_seq)
         VALUES (2, 'public', 0), (2, 'admin', 0)`,
      )
      .run()
    database
      .prepare(
        `UPDATE app_state
         SET reset_epoch = 2, event_seq = 0, is_resetting = 0, updated_at = ?
         WHERE id = 1`,
      )
      .run(timestamp)
    database
      .prepare(
        `UPDATE protocol_runtime
         SET active_protocol_version = '2', activation_state = 'V2_ACTIVE',
             data_classification = 'SYNTHETIC_DEMO',
             cutover_backup_sha256 = ?, cutover_at = ?, updated_at = ?
         WHERE id = 1`,
      )
      .run('a'.repeat(64), timestamp, timestamp)
  }

  function upgradeOptions(
    overrides: Partial<Parameters<typeof upgradeSyntheticV2DatabaseFrom12To15>[1]> = {},
  ): Parameters<typeof upgradeSyntheticV2DatabaseFrom12To15>[1] {
    return {
      migrationsPath: MIGRATIONS_PATH,
      manifestPath,
      participantCount: 300,
      backupPath,
      confirmation: V2_DESTRUCTIVE_CONFIRMATION,
      now: () => NOW,
      ...overrides,
    }
  }

  function cutoverOptions(
    overrides: Partial<Parameters<typeof switchSyntheticDemoToV2>[1]> = {},
  ): Parameters<typeof switchSyntheticDemoToV2>[1] {
    return {
      migrationsPath: MIGRATIONS_PATH,
      manifestPath,
      participantCount: 300,
      backupPath,
      confirmation: V2_DESTRUCTIVE_CONFIRMATION,
      now: () => NOW,
      ...overrides,
    }
  }

  function legacyMigrationsPath(): string {
    const legacyMigrations = path.join(temporaryDirectory, 'legacy-migrations')
    fs.mkdirSync(legacyMigrations)
    for (const filename of fs
      .readdirSync(MIGRATIONS_PATH)
      .filter((filename) => /^000[1-7]_/.test(filename))) {
      fs.copyFileSync(
        path.join(MIGRATIONS_PATH, filename),
        path.join(legacyMigrations, filename),
      )
    }
    return legacyMigrations
  }

  function addNeedsColorParticipant(resetEpoch: number): void {
    const timestamp = NOW.toISOString()
    database
      .prepare(
        `UPDATE v2_identity_slots
         SET reserved_reset_epoch = ?, reserved_at = ?
         WHERE identity_id = 'synthetic-001'`,
      )
      .run(resetEpoch, timestamp)
    database
      .prepare(
        `INSERT INTO v2_participant_states (
           identity_id, reset_epoch, participant_revision, onboarding_state,
           activated_at, color_temperature_kelvin, display_color,
           color_locked_at, capsule_decision, capsule_skipped_at, admitted_at,
           admitted_scene, admitted_run_revision, started_at, first_gift_at,
           first_barrage_at, cooperative_light_at, power_balance, starlight,
           updated_at
         ) VALUES (
           'synthetic-001', ?, 1, 'NEEDS_COLOR', ?, NULL, NULL, NULL,
           'NONE', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 100, 20, ?
         )`,
      )
      .run(resetEpoch, timestamp, timestamp)
    database
      .prepare(
        `INSERT INTO v2_stream_cursors (reset_epoch, stream_id, stream_seq)
         VALUES (?, 'participant:synthetic-001', 1)`,
      )
      .run(resetEpoch)
    database
      .prepare(
        `INSERT INTO v2_domain_events (
           reset_epoch, stream_id, stream_seq, event_id, event_name, revision,
           payload_json, committed_at
         ) VALUES (
           ?, 'participant:synthetic-001', 1,
           ? || ':participant:synthetic-001:1',
           'participant.snapshot.changed', 1, ?, ?
         )`,
      )
      .run(
        resetEpoch,
        String(resetEpoch),
        JSON.stringify({
          projection: 'SELF',
          participantRevision: 1,
          requiresSnapshot: true,
        }),
        timestamp,
      )
    database
      .prepare(
        `INSERT INTO v2_reward_ledger (
           reset_epoch, identity_id, event_key, delta, reward_rule_version,
           created_at
         ) VALUES (?, 'synthetic-001', 'ACTIVATED', 20, ?, ?)`,
      )
      .run(resetEpoch, V2_REWARD_RULE_VERSION, timestamp)
  }

  it('applies the v2 foundation migrations once without changing v1 facts or activating v2', () => {
    const legacyMigrations = legacyMigrationsPath()
    migrateDatabase(database, legacyMigrations, () => NOW)
    seedDemoDatabase(database, {
      manifestPath,
      participantCount: 300,
      now: () => NOW,
    })
    const seedFingerprint = database
      .prepare('SELECT seed_fingerprint FROM app_state WHERE id = 1')
      .pluck()
      .get()

    const result = migrateDatabase(database, MIGRATIONS_PATH, () => NOW)

    expect(result.applied).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21])
    expect(readProtocolRuntime(database)).toMatchObject({
      activeProtocolVersion: '1',
      activationState: 'V1_ACTIVE',
      dataClassification: 'UNVERIFIED',
      cutoverBackupSha256: null,
      cutoverAt: null,
    })
    expect(
      database.prepare('SELECT count(*) FROM v2_runtime_state').pluck().get(),
    ).toBe(0)
    expect(
      database.prepare('SELECT seed_fingerprint FROM app_state WHERE id = 1')
        .pluck()
        .get(),
    ).toBe(seedFingerprint)
  })

  it('refuses to start the current v1 app before migration 0008', async () => {
    migrateDatabase(database, legacyMigrationsPath(), () => NOW)
    seedDemoDatabase(database, {
      manifestPath,
      participantCount: 300,
      now: () => NOW,
    })
    const config: AppConfig = {
      host: '127.0.0.1',
      port: 0,
      databasePath,
      seedManifestPath: manifestPath,
      migrationsPath: MIGRATIONS_PATH,
      allowedOrigins: ['http://127.0.0.1:5173'],
      logLevel: 'silent',
      seedParticipantCount: 300,
    }

    await expect(
      buildApp({ config, logger: false, now: () => NOW }),
    ).rejects.toMatchObject({ code: 'V2_MIGRATIONS_NOT_READY' })
  })

  it('requires a prepared v1 app registration after applying the v2 foundation', async () => {
    migrateDatabase(database, legacyMigrationsPath(), () => NOW)
    seedDemoDatabase(database, {
      manifestPath,
      participantCount: 300,
      now: () => NOW,
    })
    expect(migrateDatabase(database, MIGRATIONS_PATH, () => NOW).applied).toEqual([
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
    ])

    await expect(
      switchSyntheticDemoToV2(database, cutoverOptions()),
    ).rejects.toMatchObject({ code: 'V2_SERVICE_REGISTRATION_REQUIRED' })
    expect(fs.existsSync(backupPath)).toBe(false)
    expect(readProtocolRuntime(database)).toMatchObject({
      activeProtocolVersion: '1',
      v1ServiceInstanceId: null,
      v1ServiceRegisteredAt: null,
    })
  })

  it('requires explicit destructive confirmation before creating a backup', async () => {
    seedV1Baseline()

    await expect(
      switchSyntheticDemoToV2(
        database,
        cutoverOptions({ confirmation: 'missing-confirmation' }),
      ),
    ).rejects.toMatchObject({
      code: 'V2_DESTRUCTIVE_CONFIRMATION_REQUIRED',
    })
    expect(fs.existsSync(backupPath)).toBe(false)
    expect(readProtocolRuntime(database)?.activeProtocolVersion).toBe('1')
  })

  it('refuses mutable v1 history before creating a backup', async () => {
    seedV1Baseline()
    database
      .prepare(
        `INSERT INTO activation_attempts (outcome, request_id, created_at)
         VALUES ('INVALID', 'valuable-history', ?)`,
      )
      .run(NOW.toISOString())

    await expect(
      switchSyntheticDemoToV2(database, cutoverOptions()),
    ).rejects.toMatchObject({ code: 'V2_DATA_CLASSIFICATION_UNSAFE' })
    expect(fs.existsSync(backupPath)).toBe(false)
    expect(
      database.prepare('SELECT count(*) FROM activation_attempts').pluck().get(),
    ).toBe(1)
  })

  it.each([
    {
      label: 'an unknown table',
      corrupt() {
        database.exec('CREATE TABLE retained_private_notes (body TEXT)')
        database.prepare('INSERT INTO retained_private_notes VALUES (?)').run('private')
      },
    },
    {
      label: 'a protected data classification',
      corrupt() {
        database
          .prepare(
            `UPDATE protocol_runtime
             SET data_classification = 'PROTECTED' WHERE id = 1`,
          )
          .run()
      },
    },
  ])('refuses $label before creating a backup', async ({ corrupt }) => {
    seedV1Baseline()
    corrupt()

    await expect(
      switchSyntheticDemoToV2(database, cutoverOptions()),
    ).rejects.toMatchObject({ code: 'V2_DATA_CLASSIFICATION_UNSAFE' })
    expect(fs.existsSync(backupPath)).toBe(false)
    expect(readProtocolRuntime(database)?.activeProtocolVersion).toBe('1')
  })

  it('never overwrites an existing cutover backup', async () => {
    seedV1Baseline()
    fs.writeFileSync(backupPath, 'keep-this-backup')

    await expect(
      switchSyntheticDemoToV2(database, cutoverOptions()),
    ).rejects.toMatchObject({ code: 'V2_BACKUP_EXISTS' })
    expect(fs.readFileSync(backupPath, 'utf8')).toBe('keep-this-backup')
    expect(readProtocolRuntime(database)?.activeProtocolVersion).toBe('1')
  })

  it('refuses a backup target that another writer claims concurrently', async () => {
    seedV1Baseline()
    const originalLink = fs.linkSync
    const linkSpy = vi.spyOn(fs, 'linkSync').mockImplementation((source, target) => {
      fs.writeFileSync(target, 'claimed-by-another-process')
      return originalLink(source, target)
    })

    try {
      await expect(
        switchSyntheticDemoToV2(database, cutoverOptions()),
      ).rejects.toMatchObject({ code: 'V2_BACKUP_EXISTS' })
      expect(fs.readFileSync(backupPath, 'utf8')).toBe(
        'claimed-by-another-process',
      )
      expect(readProtocolRuntime(database)?.activeProtocolVersion).toBe('1')
    } finally {
      linkSpy.mockRestore()
    }
  })

  it('refuses database changes that commit while the backup is being created', async () => {
    seedV1Baseline()
    const writer = openDatabase(databasePath)
    const originalBackup = database.backup.bind(database)
    const backupSpy = vi
      .spyOn(database, 'backup')
      .mockImplementation(async (destination, options) => {
        const result =
          options === undefined
            ? await originalBackup(destination)
            : await originalBackup(destination, options)
        writer
          .prepare('UPDATE app_state SET updated_at = ? WHERE id = 1')
          .run('2026-08-13T04:01:00.000Z')
        return result
      })

    try {
      await expect(
        switchSyntheticDemoToV2(database, cutoverOptions()),
      ).rejects.toMatchObject({ code: 'V2_DATA_CHANGED_DURING_CUTOVER' })
      expect(fs.existsSync(backupPath)).toBe(false)
      expect(readProtocolRuntime(database)?.activeProtocolVersion).toBe('1')
    } finally {
      backupSpy.mockRestore()
      writer.close()
    }
  })

  it('does not trust a self-consistent manifest containing non-fixed identities', async () => {
    seedV1Baseline()
    const manifest = readSeedManifest(manifestPath)
    const first = manifest.participants[0]!
    const forgedStudentNumber = '202699999999'
    const forged = {
      ...manifest,
      participants: [
        {
          ...first,
          displayName: '张三',
          studentNumber: forgedStudentNumber,
          publicStarId: 'Z-9999',
        },
        ...manifest.participants.slice(1),
      ],
    }
    const fingerprint = fingerprintManifest(forged)
    const studentDigest = createHmac(
      'sha256',
      Buffer.from(manifest.credentialPepper, 'base64url'),
    )
      .update(
        `student-number\0${first.id}\0${forgedStudentNumber}`,
        'utf8',
      )
      .digest('hex')
    fs.writeFileSync(manifestPath, `${JSON.stringify(forged, null, 2)}\n`)
    database
      .prepare(
        `UPDATE synthetic_identities
         SET display_name = ?, student_number_digest = ?, public_star_id = ?
         WHERE id = ?`,
      )
      .run('张三', studentDigest, 'Z-9999', first.id)
    database
      .prepare(
        `UPDATE demo_seed_meta SET seed_fingerprint = ? WHERE id = 1`,
      )
      .run(fingerprint)
    database
      .prepare(
        `UPDATE app_state SET seed_fingerprint = ? WHERE id = 1`,
      )
      .run(fingerprint)

    await expect(
      switchSyntheticDemoToV2(database, cutoverOptions()),
    ).rejects.toMatchObject({ code: 'V2_SEED_VERIFICATION_FAILED' })
    expect(fs.existsSync(backupPath)).toBe(false)
    expect(readProtocolRuntime(database)?.activeProtocolVersion).toBe('1')
  })

  it('refuses exact-schema drift that could conceal retained data', async () => {
    seedV1Baseline()
    database.exec(
      'ALTER TABLE synthetic_identities ADD COLUMN retained_real_name TEXT',
    )
    database
      .prepare(
        `UPDATE synthetic_identities
         SET retained_real_name = 'retained' WHERE id = 'synthetic-001'`,
      )
      .run()

    await expect(
      switchSyntheticDemoToV2(database, cutoverOptions()),
    ).rejects.toMatchObject({ code: 'V2_DATA_CLASSIFICATION_UNSAFE' })
    expect(fs.existsSync(backupPath)).toBe(false)
    expect(readProtocolRuntime(database)?.activeProtocolVersion).toBe('1')
  })

  it('creates an integrity-checked backup and atomically activates an empty v2 epoch', async () => {
    seedV1Baseline()
    const result = await switchSyntheticDemoToV2(
      database,
      cutoverOptions(),
    )

    expect(result).toMatchObject({
      previousResetEpoch: 1,
      resetEpoch: 2,
      participantCount: 300,
    })
    expect(result.backupSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(fs.existsSync(backupPath)).toBe(true)
    const backup = openDatabase(backupPath)
    try {
      expect(backup.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(readProtocolRuntime(backup)?.activeProtocolVersion).toBe('1')
    } finally {
      backup.close()
    }
    expect(
      verifyV2Foundation(database, {
        migrationsPath: MIGRATIONS_PATH,
        manifestPath,
        participantCount: 300,
      }),
    ).toMatchObject({
      ready: true,
      schemaVersion: 21,
      protocolVersion: '2',
      resetEpoch: 2,
      participantCount: 300,
      issues: [],
    })
    expect(
      database.prepare('SELECT count(*) FROM v2_identity_slots').pluck().get(),
    ).toBe(300)
  })

  it('requires explicit confirmation before upgrading an active schema-12 database', async () => {
    seedV2Schema12Baseline()

    await expect(
      upgradeSyntheticV2DatabaseFrom12To15(
        database,
        upgradeOptions({ confirmation: 'missing-confirmation' }),
      ),
    ).rejects.toMatchObject({ code: 'V2_DESTRUCTIVE_CONFIRMATION_REQUIRED' })

    expect(fs.existsSync(backupPath)).toBe(false)
    expect(
      database.prepare('SELECT max(version) FROM _schema_migrations').pluck().get(),
    ).toBe(12)
  })

  it('upgrades an active synthetic schema-12 database only after creating a verified backup', async () => {
    seedV2Schema12Baseline()

    const result = await upgradeSyntheticV2DatabaseFrom12To15(
      database,
      upgradeOptions(),
    )

    expect(result).toMatchObject({
      previousSchemaVersion: 12,
      schemaVersion: 21,
      resetEpoch: 2,
      participantCount: 300,
    })
    expect(result.backupSha256).toMatch(/^[a-f0-9]{64}$/)
    const backup = openDatabase(backupPath)
    try {
      expect(
        backup.prepare('SELECT max(version) FROM _schema_migrations').pluck().get(),
      ).toBe(12)
      expect(readProtocolRuntime(backup)?.activeProtocolVersion).toBe('2')
      expect(backup.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      backup.close()
    }
    expect(
      database.prepare('SELECT max(version) FROM _schema_migrations').pluck().get(),
    ).toBe(21)
    expect(
      database.prepare('SELECT count(*) FROM v2_raffle_state').pluck().get(),
    ).toBe(1)
    expect(
      verifyV2Foundation(database, {
        migrationsPath: MIGRATIONS_PATH,
        manifestPath,
        participantCount: 300,
      }),
    ).toMatchObject({ ready: true, schemaVersion: 21, resetEpoch: 2, issues: [] })
  })

  it('reconciles an existing admitted participant projection during schema 12→15 upgrade', async () => {
    seedV2Schema12Baseline()
    const participant = readSeedManifest(manifestPath).participants[0]!
    // Construct the historical participant with its old, empty program
    // projection. The schema-15 projection must never run against schema 12.
    const oldCurrent = vi.spyOn(programProjections, 'readCurrentV2Program').mockReturnValue(null)
    const oldSchedule = vi.spyOn(programProjections, 'readV2ProgramSchedule').mockReturnValue([])
    try {
    const activation = activateV2Participant(
      database,
      readDemoCredentialContext(manifestPath),
      {
        protocolVersion: '2',
        resetEpoch: 2,
        idempotencyKey: 'upgrade-existing-activation',
        method: 'INVITATION_TOKEN',
        token: participant.inviteToken,
      },
      NOW,
    )
    executeV2ParticipantOnboardingCommand(
      database,
      participant.id,
      {
        protocolVersion: '2',
        resetEpoch: 2,
        idempotencyKey: 'upgrade-existing-lock',
        expectedParticipantRevision:
          activation.snapshot.participant.participantRevision,
        command: 'LOCK_COLOR',
        colorTemperatureKelvin: 6500,
      },
      NOW,
    )
    } finally { oldCurrent.mockRestore(); oldSchedule.mockRestore() }
    const beforeRevision = Number(
      database
        .prepare(
          `SELECT participant_revision FROM v2_participant_states
           WHERE reset_epoch = 2 AND identity_id = ?`,
        )
        .pluck()
        .get(participant.id),
    )

    await upgradeSyntheticV2DatabaseFrom12To15(database, upgradeOptions())

    const afterRevision = Number(
      database
        .prepare(
          `SELECT participant_revision FROM v2_participant_states
           WHERE reset_epoch = 2 AND identity_id = ?`,
        )
        .pluck()
        .get(participant.id),
    )
    const latestEventRevision = Number(
      database
        .prepare(
          `SELECT revision FROM v2_domain_events
           WHERE reset_epoch = 2 AND stream_id = ?
             AND event_name = 'participant.snapshot.changed'
           ORDER BY stream_seq DESC LIMIT 1`,
        )
        .pluck()
        .get(`participant:${participant.id}`),
    )
    expect(afterRevision).toBe(beforeRevision + 1)
    expect(latestEventRevision).toBe(afterRevision)
    expect(
      database
        .prepare(
          `SELECT count(*) FROM v2_sessions
           WHERE reset_epoch = 2 AND revoked_at IS NULL`,
        )
        .pluck()
        .get(),
    ).toBe(0)
    expect(
      database
        .prepare(
          'SELECT count(*) FROM v2_idempotency_records WHERE reset_epoch = 2',
        )
        .pluck()
        .get(),
    ).toBe(0)
    expect(
      verifyV2Foundation(database, {
        migrationsPath: MIGRATIONS_PATH,
        manifestPath,
        participantCount: 300,
      }),
    ).toMatchObject({ ready: true, schemaVersion: 21, issues: [] })
  })

  it('rolls schema 12→15 back while retaining the verified v2 backup', async () => {
    seedV2Schema12Baseline()

    await expect(
      upgradeSyntheticV2DatabaseFrom12To15(
        database,
        upgradeOptions({
          beforeCommit() {
            throw new Error('synthetic upgrade failure')
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'V2_UPGRADE_ROLLED_BACK' })

    expect(fs.existsSync(backupPath)).toBe(true)
    expect(
      database.prepare('SELECT max(version) FROM _schema_migrations').pluck().get(),
    ).toBe(12)
    expect(
      database.prepare(
        `SELECT count(*) FROM sqlite_master
         WHERE type = 'table' AND name = 'v2_raffle_state'`,
      ).pluck().get(),
    ).toBe(0)
    expect(readProtocolRuntime(database)?.activeProtocolVersion).toBe('2')
  })

  it('rolls the cutover transaction back while retaining the verified backup', async () => {
    seedV1Baseline()

    await expect(
      switchSyntheticDemoToV2(
        database,
        cutoverOptions({
          beforeCommit() {
            throw new Error('synthetic commit failure')
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'V2_CUTOVER_ROLLED_BACK' })

    expect(fs.existsSync(backupPath)).toBe(true)
    expect(readProtocolRuntime(database)?.activeProtocolVersion).toBe('1')
    expect(
      database.prepare('SELECT count(*) FROM v2_runtime_state').pluck().get(),
    ).toBe(0)
    expect(
      database.prepare('SELECT reset_epoch FROM app_state WHERE id = 1')
        .pluck()
        .get(),
    ).toBe(1)
  })

  it('resets only a verified v2 synthetic epoch and refuses inconsistent state', async () => {
    seedV1Baseline()
    await switchSyntheticDemoToV2(database, cutoverOptions())
    const resetEpoch = 2
    addNeedsColorParticipant(resetEpoch)
    database
      .prepare(
        `INSERT INTO v2_sessions (
           id, session_type, subject_id, secret_digest, roles_json, reset_epoch,
           short_id, read_only, created_at, expires_at
         ) VALUES (
           'v2-session', 'PARTICIPANT', 'synthetic-001', ?, '[]', ?,
           'V2001', 0, ?, ?
         )`,
      )
      .run(
        'a'.repeat(64),
        resetEpoch,
        NOW.toISOString(),
        '2026-08-14T04:00:00.000Z',
      )

    const result = resetSyntheticV2Database(database, {
      migrationsPath: MIGRATIONS_PATH,
      manifestPath,
      participantCount: 300,
      confirmation: V2_DESTRUCTIVE_CONFIRMATION,
      now: () => new Date('2026-08-13T04:05:00.000Z'),
    })
    expect(result).toEqual({ previousResetEpoch: 2, resetEpoch: 3 })
    expect(
      database.prepare('SELECT count(*) FROM v2_participant_states').pluck().get(),
    ).toBe(0)
    expect(
      database.prepare('SELECT count(*) FROM v2_sessions').pluck().get(),
    ).toBe(0)
    expect(
      database
        .prepare(
          'SELECT count(*) FROM v2_identity_slots WHERE reserved_reset_epoch IS NOT NULL',
        )
        .pluck()
        .get(),
    ).toBe(0)

    database
      .prepare('UPDATE v2_runtime_state SET public_seq = 1 WHERE id = 1')
      .run()
    expect(() =>
      resetSyntheticV2Database(database, {
        migrationsPath: MIGRATIONS_PATH,
        manifestPath,
        participantCount: 300,
        confirmation: V2_DESTRUCTIVE_CONFIRMATION,
      }),
    ).toThrow(V2MaintenanceError)
    expect(
      database.prepare('SELECT reset_epoch FROM v2_runtime_state WHERE id = 1')
        .pluck()
        .get(),
    ).toBe(3)
    expect(
      database.prepare('SELECT public_seq FROM v2_runtime_state WHERE id = 1')
        .pluck()
      .get(),
    ).toBe(1)
  })

  it('retains the operational catalog while resetting a synthetic rehearsal epoch', async () => {
    seedV1Baseline()
    await switchSyntheticDemoToV2(database, cutoverOptions())
    const before = readV2AdminSnapshot(database, ['STAGE_CONTROLLER'], NOW)
    const catalog = eventProgramPreset()
    executeV2RuntimeCommand(database, { roles: ['STAGE_CONTROLLER'], sessionShortId: 'catalog-reset', requestId: 'catalog-reset-apply' }, {
      protocolVersion: '2', resetEpoch: before.resetEpoch, idempotencyKey: 'catalog-reset-apply',
      command: 'UPDATE_PROGRAM_CATALOG', expectedRunRevision: before.runtime.runRevision,
      expectedInteractionRevision: before.interaction.interactionRevision,
      expectedCatalogRevision: before.programCatalog.revision, catalog, confirmed: true,
    }, NOW)
    resetSyntheticV2Database(database, {
      migrationsPath: MIGRATIONS_PATH, manifestPath, participantCount: 300,
      confirmation: V2_DESTRUCTIVE_CONFIRMATION, now: () => NOW,
    })
    const after = readV2AdminSnapshot(database, ['STAGE_CONTROLLER'], NOW)
    expect(after.resetEpoch).toBe(before.resetEpoch + 1)
    expect(after.programs.map(({ id }) => id)).toEqual(catalog.items.map(({ id }) => id))
    expect(after.programs.every(({ heat }) => heat === 0)).toBe(true)
    expect(after.programCatalog).toEqual({ revision: 1, label: catalog.label })
    expect(after.currentProgram).toBeNull()
    expect(verifyV2Foundation(database, { migrationsPath: MIGRATIONS_PATH, manifestPath, participantCount: 300 }).ready).toBe(true)
  })

  it('rolls a v2 reset back completely when SQLite fails mid-transaction', async () => {
    seedV1Baseline()
    await switchSyntheticDemoToV2(database, cutoverOptions())
    addNeedsColorParticipant(2)
    database.exec(`
      CREATE TEMP TRIGGER fail_v2_reset
      BEFORE DELETE ON v2_participant_states
      BEGIN
        SELECT RAISE(ABORT, 'synthetic reset failure');
      END;
    `)

    expect(() =>
      resetSyntheticV2Database(database, {
        migrationsPath: MIGRATIONS_PATH,
        manifestPath,
        participantCount: 300,
        confirmation: V2_DESTRUCTIVE_CONFIRMATION,
        now: () => new Date('2026-08-13T04:05:00.000Z'),
      }),
    ).toThrow(/synthetic reset failure/)

    expect(
      database.prepare('SELECT reset_epoch FROM app_state WHERE id = 1')
        .pluck()
        .get(),
    ).toBe(2)
    expect(
      database.prepare('SELECT reset_epoch FROM v2_runtime_state WHERE id = 1')
        .pluck()
        .get(),
    ).toBe(2)
    expect(
      database.prepare('SELECT count(*) FROM v2_participant_states').pluck().get(),
    ).toBe(1)
    expect(
      database.prepare('SELECT count(*) FROM v2_reward_ledger').pluck().get(),
    ).toBe(1)
    expect(
      database.prepare('SELECT is_resetting FROM app_state WHERE id = 1')
        .pluck()
        .get(),
    ).toBe(0)
  })

  it.each([
    {
      label: 'orphan formation-slot reservation',
      corrupt(resetEpoch: number) {
        database
          .prepare(
            `UPDATE v2_identity_slots
             SET reserved_reset_epoch = ?, reserved_at = ?
             WHERE identity_id = 'synthetic-002'`,
          )
          .run(resetEpoch, NOW.toISOString())
      },
      issue: 'no current participant',
    },
    {
      label: 'reward delta that differs from the frozen rule',
      corrupt(_resetEpoch: number) {
        database
          .prepare(
            `UPDATE v2_reward_ledger
             SET delta = 19
             WHERE identity_id = 'synthetic-001' AND event_key = 'ACTIVATED'`,
          )
          .run()
        database
          .prepare(
            `UPDATE v2_participant_states
             SET starlight = 19
             WHERE identity_id = 'synthetic-001'`,
          )
          .run()
      },
      issue: 'rewards do not match',
    },
    {
      label: 'participant without its private cursor',
      corrupt(_resetEpoch: number) {
        database
          .prepare(
            `DELETE FROM v2_stream_cursors
             WHERE stream_id = 'participant:synthetic-001'`,
          )
          .run()
      },
      issue: 'stream cursors do not match',
    },
  ])('strict verification rejects $label', async ({ corrupt, issue }) => {
    seedV1Baseline()
    await switchSyntheticDemoToV2(database, cutoverOptions())
    addNeedsColorParticipant(2)
    corrupt(2)

    const verification = verifyV2Foundation(database, {
      migrationsPath: MIGRATIONS_PATH,
      manifestPath,
      participantCount: 300,
    })
    expect(verification.ready).toBe(false)
    expect(verification.issues.join('; ')).toContain(issue)
  })

  it('rejects v2 schema drift and non-contiguous stream history', async () => {
    seedV1Baseline()
    await switchSyntheticDemoToV2(database, cutoverOptions())
    database.exec('ALTER TABLE v2_sessions ADD COLUMN retained_real_name TEXT')
    let verification = verifyV2Foundation(database, {
      migrationsPath: MIGRATIONS_PATH,
      manifestPath,
      participantCount: 300,
    })
    expect(verification.ready).toBe(false)
    expect(verification.issues).toContain('Unexpected schema for v2_sessions')

    database.close()
    fs.rmSync(databasePath)
    fs.rmSync(backupPath)
    database = openDatabase(databasePath)
    seedV1Baseline()
    await switchSyntheticDemoToV2(database, cutoverOptions())
    const aggregate = {
      activatedCount: 0,
      publicStarCount: 0,
      admittedCount: 0,
      starStartedCount: 0,
      cooperativeLightCount: 0,
      totalStarlight: 0,
    }
    database
      .prepare(
        `UPDATE v2_stream_cursors SET stream_seq = 3
         WHERE reset_epoch = 2 AND stream_id = 'public'`,
      )
      .run()
    database
      .prepare(
        `UPDATE v2_runtime_state
         SET public_seq = 3, public_aggregate_revision = 3 WHERE id = 1`,
      )
      .run()
    const insertEvent = database.prepare(
      `INSERT INTO v2_domain_events (
         reset_epoch, stream_id, stream_seq, event_id, event_name, revision,
         payload_json, committed_at
       ) VALUES (2, 'public', ?, ?, 'aggregate.changed', ?, ?, ?)`,
    )
    for (const sequence of [1, 3]) {
      insertEvent.run(
        sequence,
        `2:public:${sequence}`,
        sequence,
        JSON.stringify({
          projection: 'PUBLIC_AGGREGATE',
          aggregateRevision: sequence,
          aggregate,
        }),
        NOW.toISOString(),
      )
    }

    verification = verifyV2Foundation(database, {
      migrationsPath: MIGRATIONS_PATH,
      manifestPath,
      participantCount: 300,
    })
    expect(verification.ready).toBe(false)
    expect(verification.issues).toContain(
      'V2 stream cursors do not match persisted event sequences',
    )
  })

  it('rejects an unsupported reward rule and revision rollback by stream order', async () => {
    seedV1Baseline()
    await switchSyntheticDemoToV2(database, cutoverOptions())
    database
      .prepare(
        `UPDATE v2_runtime_state
         SET reward_rule_version = 'unknown-rule' WHERE id = 1`,
      )
      .run()
    let verification = verifyV2Foundation(database, {
      migrationsPath: MIGRATIONS_PATH,
      manifestPath,
      participantCount: 300,
    })
    expect(verification.ready).toBe(false)
    expect(verification.issues).toContain(
      'The v2 runtime reward rule version is not supported',
    )

    database
      .prepare(
        `UPDATE v2_runtime_state
         SET reward_rule_version = ?, run_revision = 1,
             public_seq = 2
         WHERE id = 1`,
      )
      .run(V2_REWARD_RULE_VERSION)
    database
      .prepare(
        `UPDATE v2_stream_cursors SET stream_seq = 2
         WHERE reset_epoch = 2 AND stream_id = 'public'`,
      )
      .run()
    const insertRuntimeEvent = database.prepare(
      `INSERT INTO v2_domain_events (
         reset_epoch, stream_id, stream_seq, event_id, event_name, revision,
         payload_json, committed_at
       ) VALUES (2, 'public', ?, ?, 'runtime.changed', ?, ?, ?)`,
    )
    for (const [sequence, revision] of [[1, 2], [2, 1]] as const) {
      insertRuntimeEvent.run(
        sequence,
        `2:public:${sequence}`,
        revision,
        JSON.stringify({
          runtime: {
            mode: 'REHEARSAL',
            status: 'READY',
            currentScene: null,
            runRevision: revision,
          },
        }),
        NOW.toISOString(),
      )
    }

    verification = verifyV2Foundation(database, {
      migrationsPath: MIGRATIONS_PATH,
      manifestPath,
      participantCount: 300,
    })
    expect(verification.ready).toBe(false)
    expect(verification.issues).toContain(
      'V2 projection revisions do not match latest typed events',
    )
  })

  it('starts only the v2 surface after activation and keeps v1 routes closed', async () => {
    seedV1Baseline()
    await switchSyntheticDemoToV2(database, cutoverOptions())
    database.close()

    const config: AppConfig = {
      host: '127.0.0.1',
      port: 3000,
      databasePath,
      seedManifestPath: manifestPath,
      migrationsPath: MIGRATIONS_PATH,
      allowedOrigins: ['http://127.0.0.1:5173'],
      logLevel: 'silent',
      seedParticipantCount: 300,
    }
    const activeApp = await buildApp({ config, logger: false, now: () => NOW })
    try {
      await activeApp.ready()
      const capabilities = await activeApp.inject({
        method: 'GET', url: '/api/protocol-capabilities',
        headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:5173' },
      })
      expect(capabilities.json()).toMatchObject({
        activeRuntimeVersion: '2', activationState: 'ACTIVE',
      })
      const legacy = await activeApp.inject({
        method: 'GET', url: '/api/screen/snapshot',
        headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:5173' },
      })
      expect(legacy.statusCode).toBe(409)
    } finally {
      await activeApp.close()
    }
  })

  it('cleans registration after a build failure without granting cutover', async () => {
    seedV1Baseline()
    const config: AppConfig = {
      host: '127.0.0.1',
      port: 0,
      databasePath,
      seedManifestPath: manifestPath,
      migrationsPath: MIGRATIONS_PATH,
      allowedOrigins: ['http://127.0.0.1:5173'],
      logLevel: 'silent',
      seedParticipantCount: 300,
    }
    const boom = new Error('synthetic build failure')
    const failingOptions = {
      config,
      logger: false,
      now: () => NOW,
    } as BuildAppOptions
    Object.defineProperty(failingOptions, 'loginRateLimiter', {
      configurable: true,
      get() {
        throw boom
      },
    })
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    try {
      await expect(buildApp(failingOptions)).rejects.toBe(boom)
      const runtime = readProtocolRuntime(database)
      expect(runtime).toMatchObject({
        v1ServiceInstanceId: null,
        v1ServiceLeaseExpiresAt: null,
        v1ServiceGeneration: expect.any(Number),
      })
      expect(runtime?.v1ServiceListenGeneration).not.toBe(
        runtime?.v1ServiceGeneration,
      )
      expect(runtime?.v1ServiceCleanShutdownGeneration).not.toBe(
        runtime?.v1ServiceGeneration,
      )
      expect(clearIntervalSpy).toHaveBeenCalled()
      await expect(
        switchSyntheticDemoToV2(database, cutoverOptions()),
      ).rejects.toMatchObject({ code: 'V2_SERVICE_REGISTRATION_REQUIRED' })
      expect(fs.existsSync(backupPath)).toBe(false)
    } finally {
      clearIntervalSpy.mockRestore()
    }

    const retry = await buildApp({ config, logger: false, now: () => NOW })
    await retry.listen({ host: '127.0.0.1', port: 0 })
    await retry.close()
    expect(readProtocolRuntime(database)).toMatchObject({
      v1ServiceInstanceId: null,
      v1ServiceListenGeneration: expect.any(Number),
      v1ServiceCleanShutdownGeneration: expect.any(Number),
    })
  })

  it('does not treat a failed listen generation as a cutover receipt', async () => {
    seedV1Baseline()
    const blocker = net.createServer()
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject)
      blocker.listen(0, '127.0.0.1', () => resolve())
    })
    const address = blocker.address()
    if (!address || typeof address === 'string') {
      throw new Error('test port was not assigned')
    }
    const config: AppConfig = {
      host: '127.0.0.1',
      port: address.port,
      databasePath,
      seedManifestPath: manifestPath,
      migrationsPath: MIGRATIONS_PATH,
      allowedOrigins: [`http://127.0.0.1:${address.port}`],
      logLevel: 'silent',
      seedParticipantCount: 300,
    }
    const app = await buildApp({ config, logger: false, now: () => NOW })

    try {
      await expect(
        app.listen({ host: config.host, port: config.port }),
      ).rejects.toMatchObject({ code: 'EADDRINUSE' })
    } finally {
      await app.close()
      await new Promise<void>((resolve) => blocker.close(() => resolve()))
    }

    const failed = readProtocolRuntime(database)
    expect(failed?.v1ServiceInstanceId).toBeNull()
    expect(failed?.v1ServiceListenGeneration).not.toBe(
      failed?.v1ServiceGeneration,
    )
    expect(failed?.v1ServiceCleanShutdownGeneration).not.toBe(
      failed?.v1ServiceGeneration,
    )
    await expect(
      switchSyntheticDemoToV2(database, cutoverOptions()),
    ).rejects.toMatchObject({ code: 'V2_SERVICE_REGISTRATION_REQUIRED' })
    expect(fs.existsSync(backupPath)).toBe(false)

    const retry = await buildApp({
      config: { ...config, port: 0 },
      logger: false,
      now: () => NOW,
    })
    await retry.listen({ host: '127.0.0.1', port: 0 })
    await retry.close()
    const recovered = readProtocolRuntime(database)
    expect(recovered?.v1ServiceCleanShutdownGeneration).toBe(
      recovered?.v1ServiceGeneration,
    )
  })

  it('keeps service registration until an in-flight HTTP response drains', async () => {
    seedV1Baseline()
    const config: AppConfig = {
      host: '127.0.0.1',
      port: 0,
      databasePath,
      seedManifestPath: manifestPath,
      migrationsPath: MIGRATIONS_PATH,
      allowedOrigins: ['http://127.0.0.1:5173'],
      logLevel: 'silent',
      seedParticipantCount: 300,
    }
    let enter!: () => void
    let release!: () => void
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const app = await buildApp({ config, logger: false, now: () => NOW })
    app.get('/__test__/hold-http', async () => {
      enter()
      await held
      return { ok: true }
    })
    await app.listen({ host: '127.0.0.1', port: 0 })
    const responsePromise = Promise.resolve(
      app.inject({ method: 'GET', url: '/__test__/hold-http' }),
    )
    await entered
    const closePromise = app.close()

    expect(readProtocolRuntime(database)?.v1ServiceInstanceId).not.toBeNull()
    await expect(
      switchSyntheticDemoToV2(database, cutoverOptions()),
    ).rejects.toMatchObject({ code: 'V2_SERVICE_ACTIVE' })
    expect(fs.existsSync(backupPath)).toBe(false)

    release()
    expect((await responsePromise).statusCode).toBe(200)
    await closePromise
    const runtime = readProtocolRuntime(database)
    expect(runtime?.v1ServiceInstanceId).toBeNull()
    expect(runtime?.v1ServiceCleanShutdownGeneration).toBe(
      runtime?.v1ServiceGeneration,
    )
  })

  it('requires a clean app shutdown before backup and cutover', async () => {
    seedV1Baseline()
    const config: AppConfig = {
      host: '127.0.0.1',
      port: 0,
      databasePath,
      seedManifestPath: manifestPath,
      migrationsPath: MIGRATIONS_PATH,
      allowedOrigins: ['http://127.0.0.1:5173'],
      logLevel: 'silent',
      seedParticipantCount: 300,
    }
    const app = await buildApp({ config, logger: false, now: () => NOW })
    await app.listen({ host: '127.0.0.1', port: 0 })
    const silentV2Socket = await app.injectWS('/ws/v2', {
      headers: {
        host: '127.0.0.1:5173',
        origin: 'http://127.0.0.1:5173',
      },
    })
    const staleWriter = openDatabase(databasePath)
    let appClosed = false
    try {
      database
        .prepare(
          `UPDATE protocol_runtime
           SET v1_service_lease_expires_at = '2000-01-01T00:00:00.000Z'
           WHERE id = 1`,
        )
        .run()
      await expect(
        switchSyntheticDemoToV2(database, cutoverOptions()),
      ).rejects.toMatchObject({ code: 'V2_SERVICE_ACTIVE' })
      expect(fs.existsSync(backupPath)).toBe(false)
      expect(readProtocolRuntime(database)).toMatchObject({
        activeProtocolVersion: '1',
        v1ServiceInstanceId: expect.any(String),
      })

      const shutdownOrder: string[] = []
      const socketClosed = new Promise<void>((resolve) => {
        silentV2Socket.once('close', () => {
          expect(readProtocolRuntime(database)?.v1ServiceInstanceId).not.toBeNull()
          shutdownOrder.push('socket')
          resolve()
        })
      })
      await app.close().then(() => shutdownOrder.push('app'))
      await socketClosed
      appClosed = true
      expect(shutdownOrder).toEqual(['socket', 'app'])
      expect(readProtocolRuntime(database)?.v1ServiceInstanceId).toBeNull()
      await switchSyntheticDemoToV2(database, cutoverOptions())
      // This connection represents a request that passed the HTTP hook before
      // cutover. The write helper must acquire the SQLite lock and re-check.
      expect(() =>
        createSession(staleWriter, {
          type: 'ADMIN',
          subjectId: 'synthetic-admin',
          roles: ['DEMO_ADMIN'],
          resetEpoch: 2,
          now: NOW,
        }),
      ).toThrow(V2MaintenanceError)
      expect(
        staleWriter.prepare('SELECT count(*) FROM sessions').pluck().get(),
      ).toBe(0)
      expect(() =>
        migrateDatabase(staleWriter, MIGRATIONS_PATH, () => NOW),
      ).toThrow(/legacy migration entrypoint refuses/)
    } finally {
      staleWriter.close()
      if (!appClosed) await app.close()
    }
  })
})
