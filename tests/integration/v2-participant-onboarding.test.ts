import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BACKEND_ROOT } from '../../backend/src/config.js'
import { migrateDatabase } from '../../backend/src/db/migrate.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import { verifyV2Foundation } from '../../backend/src/db/v2-foundation.js'
import {
  readDemoCredentialContext,
  readSeedManifest,
  seedDemoDatabase,
} from '../../backend/src/db/seed.js'
import {
  activateV2Participant,
  executeV2ParticipantOnboardingCommand,
  readV2ParticipantSnapshot,
  V2ParticipantCommandError,
} from '../../backend/src/services/v2-participant-onboarding.js'

const NOW = new Date('2026-08-13T06:00:00.000Z')
const LATER = new Date('2026-08-13T06:01:00.000Z')
const MIGRATIONS_PATH = path.join(BACKEND_ROOT, 'migrations')

describe('V2-03 participant onboarding, admission and reward ledger', () => {
  let temporaryDirectory: string
  let databasePath: string
  let manifestPath: string
  let database: ReturnType<typeof openDatabase>

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sysu-welcome-v2-onboarding-'),
    )
    databasePath = path.join(temporaryDirectory, 'demo.sqlite')
    manifestPath = path.join(temporaryDirectory, 'demo-seed-manifest.json')
    database = openDatabase(databasePath)
    migrateDatabase(database, MIGRATIONS_PATH, () => NOW)
    seedDemoDatabase(database, {
      manifestPath,
      participantCount: 300,
      now: () => NOW,
    })
    activateV2Runtime()
  })

  afterEach(() => {
    if (database.open) database.close()
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  function activateV2Runtime(): void {
    // Schema 15 has a separate operational v2 directory. This fixture
    // constructs its runtime directly instead of using initializeV2Runtime.
    database.exec(`INSERT INTO v2_program_catalog (id, sort_order, title, heat, enabled, created_at, updated_at)
      SELECT id, sort_order, title, heat, enabled, created_at, updated_at FROM program_catalog;
      UPDATE v2_program_catalog_state SET current_program_id = (SELECT current_program_id FROM program_runtime_state WHERE id = 1);`)
    const timestamp = NOW.toISOString()
    database
      .prepare(
        `UPDATE protocol_runtime
         SET v1_service_registered_at = ?, v1_service_generation = 1,
             v1_service_listen_generation = 1, v1_service_listened_at = ?,
             v1_service_clean_shutdown_generation = 1,
             v1_service_clean_shutdown_at = ?,
             active_protocol_version = '2', activation_state = 'V2_ACTIVE',
             data_classification = 'SYNTHETIC_DEMO',
             cutover_backup_sha256 = ?, cutover_at = ?, updated_at = ?
         WHERE id = 1`,
      )
      .run(
        timestamp,
        timestamp,
        timestamp,
        '0'.repeat(64),
        timestamp,
        timestamp,
      )
    database
      .prepare(
        `INSERT INTO v2_runtime_state (
           id, reset_epoch, mode, status, current_scene, run_revision,
           presentation_type, presentation_revision,
           public_aggregate_revision, admin_aggregate_revision,
           reward_rule_version, public_seq, admin_seq, completed_at, updated_at
         ) VALUES (
           1, 2, 'REHEARSAL', 'READY', NULL, 0, 'NONE', 0,
           0, 0, 'v2-rewards-2026-08-30-raffle', 0, 0, NULL, ?
         )`,
      )
      .run(timestamp)
    database
      .prepare(
        `INSERT INTO v2_stream_cursors (reset_epoch, stream_id, stream_seq)
         VALUES (2, 'public', 0), (2, 'admin', 0)`,
      )
      .run()
    database.prepare(
      `INSERT INTO v2_screen_interaction_state (
         id, reset_epoch, interaction_revision, barrage_paused,
         display_batch, next_display_seq, updated_at
       ) VALUES (1, 2, 0, 0, 0, 1, ?)`,
    ).run(timestamp)
    database.prepare('INSERT INTO v2_ceremony_state(id, reset_epoch) SELECT 1,reset_epoch FROM v2_runtime_state').run()
    database.prepare(
      `INSERT INTO v2_live_interaction_state (
         id, reset_epoch, segment_code, phase, round_number, prompt,
         revision, opened_at, updated_at
       ) VALUES (1, 2, NULL, 'IDLE', 0, '', 0, NULL, ?)`,
    ).run(timestamp)
    database.prepare(
      `INSERT INTO v2_raffle_state (
         id, reset_epoch, display_active, raffle_revision, updated_at
       ) VALUES (1, 2, 0, 0, ?)`,
    ).run(timestamp)
    database
      .prepare(
        `INSERT INTO v2_identity_slots (
           identity_id, seed_index, public_star_id, formation_slot,
           reserved_reset_epoch, reserved_at
         ) SELECT id, seed_index, public_star_id, 'slot:' || visual_seed, NULL, NULL
           FROM synthetic_identities ORDER BY seed_index`,
      )
      .run()
    database
      .prepare(
        `UPDATE app_state SET reset_epoch = 2, event_seq = 0,
             is_resetting = 0, updated_at = ? WHERE id = 1`,
      )
      .run(timestamp)
  }

  function participant(index = 0) {
    return readSeedManifest(manifestPath).participants[index]!
  }

  function activationRequest(index = 0, key = `activate-key-${index}`) {
    return {
      protocolVersion: '2',
      resetEpoch: 2,
      idempotencyKey: key,
      method: 'INVITATION_TOKEN' as const,
      token: participant(index).inviteToken,
    }
  }

  function activate(index = 0, key?: string) {
    return activateV2Participant(
      database,
      readDemoCredentialContext(manifestPath),
      activationRequest(index, key),
      NOW,
    )
  }

  function command(
    identityId: string,
    request: Record<string, unknown>,
    at = LATER,
  ) {
    return executeV2ParticipantOnboardingCommand(
      database,
      identityId,
      { protocolVersion: '2', resetEpoch: 2, ...request },
      at,
    )
  }

  it('atomically activates once with a reserved slot, session, power and reward', () => {
    const first = activate(0)
    const replay = activate(0)

    expect(first.activated).toBe(true)
    expect(first.snapshot.participant).toMatchObject({
      onboardingState: 'NEEDS_COLOR',
      displayName: participant(0).displayName,
      personalStarCode: participant(0).publicStarId,
      powerBalance: 100,
      starlight: 0,
      ownPublicStarId: null,
      allowedActions: ['LOCK_COLOR'],
    })
    expect(first.snapshot.participant).not.toHaveProperty('studentNumber')
    expect(JSON.stringify(first.snapshot.participant)).not.toContain(participant(0).studentNumber)
    expect(first.session.secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(replay.activated).toBe(false)
    expect(replay.session.id).not.toBe(first.session.id)
    expect(replay.snapshot.participant).toMatchObject({
      displayName: participant(0).displayName,
      personalStarCode: participant(0).publicStarId,
    })
    expect(replay.snapshot.participant).not.toHaveProperty('studentNumber')
    expect(
      database
        .prepare(
          `SELECT count(*) FROM v2_reward_ledger
           WHERE identity_id = ? AND event_key = 'ACTIVATED'`,
        )
        .pluck()
        .get(participant(0).id),
    ).toBe(1)
    expect(
      database
        .prepare('SELECT count(*) FROM v2_participant_states')
        .pluck()
        .get(),
    ).toBe(1)
  })

  it('locks color once and atomically adds the stable public star', () => {
    activate(0)
    const identityId = participant(0).id
    const locked = command(identityId, {
      idempotencyKey: 'lock-color-key',
      expectedParticipantRevision: 1,
      command: 'LOCK_COLOR',
      colorTemperatureKelvin: 6500,
    })

    expect(locked.participant).toMatchObject({
      participantRevision: 2,
      onboardingState: 'ADMITTED',
      colorTemperatureKelvin: 6500,
      displayColor: '#fff4dc',
      ownPublicStarId: participant(0).publicStarId,
      capsuleDecision: 'SKIPPED',
      allowedActions: [],
    })
    const snapshot = readV2ParticipantSnapshot(database, identityId, LATER)
    expect(snapshot.publicStars).toHaveLength(1)
    expect(snapshot.publicStars[0]).toMatchObject({
      publicStarId: participant(0).publicStarId,
      formationSlot: `slot:${participant(0).visualSeed}`,
      started: false,
      starRevision: 1,
    })
    expect(snapshot.aggregate).toMatchObject({
      activatedCount: 1,
      publicStarCount: 1,
      admittedCount: 1,
      totalStarlight: 0,
    })
    const sameValueRetry = command(identityId, {
      idempotencyKey: 'lock-color-same-value-retry',
      expectedParticipantRevision: 1,
      command: 'LOCK_COLOR',
      colorTemperatureKelvin: 6500,
    })
    expect(sameValueRetry.participant.participantRevision).toBe(2)
    expect(snapshot.publicStars).toHaveLength(1)
    expect(
      database.prepare('SELECT count(*) FROM v2_public_stars').pluck().get(),
    ).toBe(1)
  })

  it('retires message commands without creating content or changing rewards', () => {
    activate(0)
    const identityId = participant(0).id
    command(identityId, {
      idempotencyKey: 'lock-submit-color',
      expectedParticipantRevision: 1,
      command: 'LOCK_COLOR',
      colorTemperatureKelvin: 5000,
    })
    expect(() => command(identityId, {
      idempotencyKey: 'retired-message-key', expectedParticipantRevision: 2,
      command: 'UPSERT_CAPSULE', text: '旧入口不得再写入。', candidateScopeAccepted: true,
    })).toThrowError(expect.objectContaining({ code: 'ONBOARDING_STATE_INVALID' }))
    const snapshot = readV2ParticipantSnapshot(database, identityId, LATER)
    expect(snapshot.participant).toMatchObject({ onboardingState: 'ADMITTED', starlight: 0 })
    expect(database.prepare('SELECT count(*) FROM v2_capsules').pluck().get()).toBe(0)
    expect(
      database
        .prepare(
          `SELECT count(*) FROM v2_reward_ledger
           WHERE identity_id = ? AND event_key = 'CAPSULE_SUBMITTED'`,
        )
        .pluck()
        .get(identityId),
    ).toBe(0)
  })

  it('locks color and admits atomically without a second onboarding decision', () => {
    activate(0)
    const identityId = participant(0).id
    command(identityId, {
      idempotencyKey: 'lock-skip-color',
      expectedParticipantRevision: 1,
      command: 'LOCK_COLOR',
      colorTemperatureKelvin: 9000,
    })
    const admitted = readV2ParticipantSnapshot(database, identityId, LATER)
    expect(admitted.participant).toMatchObject({
      onboardingState: 'ADMITTED',
      capsuleDecision: 'SKIPPED',
      starlight: 0,
      admittedAt: expect.any(String),
    })
    expect(admitted.participant.skippedAt).not.toBeNull()
    expect(
      verifyV2Foundation(database, {
        migrationsPath: MIGRATIONS_PATH,
        manifestPath,
        participantCount: 300,
      }),
    ).toMatchObject({ ready: true, issues: [] })
  })

  it('admits a late arrival into the current scene without backfilling old actions', () => {
    database
      .prepare(
        `UPDATE v2_runtime_state
         SET status = 'RUNNING', current_scene = 'PROGRAM_SUPPORT',
             run_revision = 2 WHERE id = 1`,
      )
      .run()
    activate(0)
    const identityId = participant(0).id
    command(identityId, {
      idempotencyKey: 'late-lock-color',
      expectedParticipantRevision: 1,
      command: 'LOCK_COLOR',
      colorTemperatureKelvin: 6500,
    })
    const admitted = readV2ParticipantSnapshot(database, identityId, LATER)

    expect(admitted.participant).toMatchObject({
      admittedScene: 'PROGRAM_SUPPORT',
      admittedRunRevision: 2,
      started: false,
      starlight: 0,
      allowedActions: ['SEND_GIFT', 'POST_BARRAGE'],
    })
    expect(
      database
        .prepare(
          `SELECT count(*) FROM v2_reward_ledger
           WHERE identity_id = ? AND event_key = 'STAR_STARTED'`,
        )
        .pluck()
        .get(identityId),
    ).toBe(0)
  })

  it.each(['PAUSED', 'COMPLETED'] as const)(
    'allows existing read recovery but rejects participant writes in %s',
    (status) => {
      activate(0)
      const identityId = participant(0).id
      database
        .prepare(
          `UPDATE v2_runtime_state
           SET mode = ?, status = ?, current_scene = ?, completed_at = ?
           WHERE id = 1`,
        )
        .run(
          status === 'COMPLETED' ? 'LIVE' : 'REHEARSAL',
          status,
          'COOPERATIVE_LIGHT',
          status === 'COMPLETED' ? LATER.toISOString() : null,
        )

      expect(readV2ParticipantSnapshot(database, identityId, LATER).participant.allowedActions).toEqual([])
      expect(() =>
        command(identityId, {
          idempotencyKey: `blocked-${status.toLowerCase()}`,
          expectedParticipantRevision: 1,
          command: 'LOCK_COLOR',
          colorTemperatureKelvin: 6500,
        }),
      ).toThrowError(
        expect.objectContaining({
          code: status === 'PAUSED' ? 'RUNTIME_PAUSED' : 'RUNTIME_COMPLETED',
        }),
      )
      expect(
        database.prepare('SELECT count(*) FROM v2_public_stars').pluck().get(),
      ).toBe(0)
    },
  )

  it('re-authenticates an existing paused participant as read-only without mutation', () => {
    activate(0)
    database
      .prepare(
        `UPDATE v2_runtime_state
         SET status = 'PAUSED', current_scene = 'ASSEMBLY' WHERE id = 1`,
      )
      .run()
    const recovered = activate(0, 'paused-read-only-activation')

    expect(recovered).toMatchObject({ activated: false })
    expect(recovered.session.readOnly).toBe(true)
    expect(recovered.snapshot.participant).toMatchObject({
      participantRevision: 1,
      onboardingState: 'NEEDS_COLOR',
      starlight: 0,
      allowedActions: [],
    })
    expect(
      database
        .prepare(
          `SELECT count(*) FROM v2_reward_ledger
           WHERE identity_id = ? AND event_key = 'ACTIVATED'`,
        )
        .pluck()
        .get(participant(0).id),
    ).toBe(1)
  })

  it('rejects stale revisions and idempotency-key reuse without partial facts', () => {
    activate(0)
    const identityId = participant(0).id
    command(identityId, {
      idempotencyKey: 'stable-lock-key',
      expectedParticipantRevision: 1,
      command: 'LOCK_COLOR',
      colorTemperatureKelvin: 5000,
    })

    expect(() => command(identityId, {
      idempotencyKey: 'retired-skip-key', expectedParticipantRevision: 2,
      command: 'SKIP_CAPSULE',
    })).toThrowError(expect.objectContaining({ code: 'ONBOARDING_STATE_INVALID' }))
    expect(() =>
      command(identityId, {
        idempotencyKey: 'stable-lock-key',
        expectedParticipantRevision: 1,
        command: 'LOCK_COLOR',
        colorTemperatureKelvin: 6500,
      }),
    ).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }))
    expect(
      database.prepare('SELECT count(*) FROM v2_capsules').pluck().get(),
    ).toBe(0)
  })

  it('supports the assisted synthetic credential as the same identity', () => {
    const selected = participant(1)
    const invited = activate(1, 'invitation-before-assisted-recovery')
    const recovered = activateV2Participant(
      database,
      readDemoCredentialContext(manifestPath),
      {
        protocolVersion: '2',
        resetEpoch: 2,
        idempotencyKey: 'assisted-entry-key',
        method: 'ASSISTED_SYNTHETIC',
        displayName: selected.displayName,
        studentNumber: selected.studentNumber,
      },
      NOW,
    )
    expect(invited.activated).toBe(true)
    expect(recovered.activated).toBe(false)
    expect(recovered.session.identityId).toBe(selected.id)
    expect(recovered.session.id).not.toBe(invited.session.id)
    expect(recovered.snapshot.participant).toMatchObject({
      participantRevision: invited.snapshot.participant.participantRevision,
      onboardingState: 'NEEDS_COLOR',
      displayName: selected.displayName,
      personalStarCode: selected.publicStarId,
      powerBalance: 100,
      starlight: 0,
    })
    expect(recovered.snapshot.participant).not.toHaveProperty('studentNumber')
    expect(JSON.stringify(recovered.snapshot.participant)).not.toContain(selected.studentNumber)
    expect(
      database
        .prepare('SELECT count(*) FROM v2_participant_states WHERE identity_id = ?')
        .pluck()
        .get(selected.id),
    ).toBe(1)
    expect(
      database
        .prepare(
          `SELECT count(*) FROM v2_reward_ledger
           WHERE identity_id = ? AND event_key = 'ACTIVATED'`,
        )
        .pluck()
        .get(selected.id),
    ).toBe(1)
  })

  it('rolls back activation when no stable slot is available', () => {
    const selected = participant(2)
    database
      .prepare('DELETE FROM v2_identity_slots WHERE identity_id = ?')
      .run(selected.id)

    expect(() => activate(2)).toThrowError(
      expect.objectContaining({ code: 'STAR_CAPACITY_REACHED' }),
    )
    expect(
      database
        .prepare(
          `SELECT count(*) FROM v2_participant_states WHERE identity_id = ?`,
        )
        .pluck()
        .get(selected.id),
    ).toBe(0)
    expect(
      database
        .prepare(
          `SELECT count(*) FROM v2_reward_ledger WHERE identity_id = ?`,
        )
        .pluck()
        .get(selected.id),
    ).toBe(0)
  })

  it('exposes stable command errors for callers', () => {
    const error = new V2ParticipantCommandError(
      'RUNTIME_PAUSED',
      'paused',
      409,
      2,
    )
    expect(error).toMatchObject({
      name: 'V2ParticipantCommandError',
      code: 'RUNTIME_PAUSED',
      statusCode: 409,
      resetEpoch: 2,
    })
  })
})
