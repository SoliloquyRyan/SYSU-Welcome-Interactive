import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BACKEND_ROOT } from '../../backend/src/config.js'
import { migrateDatabase } from '../../backend/src/db/migrate.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import { verifyV2Foundation } from '../../backend/src/db/v2-foundation.js'
import { readDemoCredentialContext, readSeedManifest, seedDemoDatabase } from '../../backend/src/db/seed.js'
import {
  activateV2Participant,
  executeV2ParticipantOnboardingCommand,
  readV2ParticipantSnapshot,
  V2ParticipantCommandError,
} from '../../backend/src/services/v2-participant-onboarding.js'
import {
  executeV2RuntimeCommand,
  V2RuntimeCommandError,
} from '../../backend/src/services/v2-runtime-commands.js'
import {
  readV2AdminSnapshot,
  readV2ScreenSnapshot,
} from '../../backend/src/services/v2-snapshots.js'

const NOW = new Date('2026-08-13T08:00:00.000Z')
const MIGRATIONS_PATH = path.join(BACKEND_ROOT, 'migrations')

describe('V2-04 three-scene runtime and participant actions', () => {
  let directory: string
  let manifestPath: string
  let database: ReturnType<typeof openDatabase>
  let commandCounter = 0

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sysu-welcome-v2-runtime-'))
    manifestPath = path.join(directory, 'manifest.json')
    database = openDatabase(path.join(directory, 'demo.sqlite'))
    migrateDatabase(database, MIGRATIONS_PATH, () => NOW)
    seedDemoDatabase(database, { manifestPath, participantCount: 300, now: () => NOW })
    activateV2Runtime()
  })

  afterEach(() => {
    if (database.open) database.close()
    fs.rmSync(directory, { recursive: true, force: true })
  })

  function activateV2Runtime() {
    const timestamp = NOW.toISOString()
    database.prepare(
      `UPDATE protocol_runtime SET active_protocol_version = '2',
         activation_state = 'V2_ACTIVE', data_classification = 'SYNTHETIC_DEMO',
         cutover_backup_sha256 = ?, cutover_at = ?,
         v1_service_registered_at = ?, v1_service_generation = 1,
         v1_service_listen_generation = 1, v1_service_listened_at = ?,
         v1_service_clean_shutdown_generation = 1,
         v1_service_clean_shutdown_at = ?, updated_at = ? WHERE id = 1`,
    ).run('0'.repeat(64), timestamp, timestamp, timestamp, timestamp, timestamp)
    database.prepare(
      `INSERT INTO v2_runtime_state (
         id, reset_epoch, mode, status, current_scene, run_revision,
         presentation_type, presentation_revision, public_aggregate_revision,
         admin_aggregate_revision, reward_rule_version, public_seq, admin_seq,
         completed_at, updated_at
       ) VALUES (1, 2, 'REHEARSAL', 'READY', NULL, 0, 'NONE', 0, 0, 0,
         'v2-rewards-2026-08-30-raffle', 0, 0, NULL, ?)`,
    ).run(timestamp)
    database.prepare(
      `INSERT INTO v2_stream_cursors (reset_epoch, stream_id, stream_seq)
       VALUES (2, 'public', 0), (2, 'admin', 0)`,
    ).run()
    database.prepare(
      `INSERT INTO v2_screen_interaction_state (
         id, reset_epoch, interaction_revision, barrage_paused,
         display_batch, next_display_seq, updated_at
       ) VALUES (1, 2, 0, 0, 0, 1, ?)`,
    ).run(timestamp)
    database.prepare(
      `INSERT INTO v2_raffle_state (
         id, reset_epoch, display_active, raffle_revision, updated_at
       ) VALUES (1, 2, 0, 0, ?)`,
    ).run(timestamp)
    database.prepare(
      `INSERT INTO v2_identity_slots (
         identity_id, seed_index, public_star_id, formation_slot,
         reserved_reset_epoch, reserved_at
       ) SELECT id, seed_index, public_star_id, 'slot:' || visual_seed, NULL, NULL
         FROM synthetic_identities`,
    ).run()
    database.prepare(
      `UPDATE program_runtime_state SET current_program_id = NULL, updated_at = ? WHERE id = 1`,
    ).run(timestamp)
    database.prepare('UPDATE app_state SET reset_epoch = 2 WHERE id = 1').run()
  }

  function manifest(index = 0) {
    return readSeedManifest(manifestPath).participants[index]!
  }

  function activate(index = 0) {
    return activateV2Participant(
      database,
      readDemoCredentialContext(manifestPath),
      {
        protocolVersion: '2', resetEpoch: 2,
        idempotencyKey: `activate-runtime-${index}`,
        method: 'INVITATION_TOKEN', token: manifest(index).inviteToken,
      },
      NOW,
    )
  }

  function participantCommand(index: number, body: Record<string, unknown>) {
    commandCounter += 1
    return executeV2ParticipantOnboardingCommand(
      database,
      manifest(index).id,
      {
        protocolVersion: '2', resetEpoch: 2,
        idempotencyKey: `participant-${index}-${commandCounter}`,
        ...body,
      },
      new Date(NOW.getTime() + commandCounter * 1000),
    )
  }

  function admit(index = 0) {
    const activated = activate(index)
    return participantCommand(index, {
      command: 'LOCK_COLOR',
      expectedParticipantRevision: activated.snapshot.participant.participantRevision,
      colorTemperatureKelvin: 6500,
    })
  }

  function runtime(body: Record<string, unknown>) {
    commandCounter += 1
    return executeV2RuntimeCommand(
      database,
      { sessionShortId: 'admin-short', requestId: `request-${commandCounter}`, roles: ['STAGE_CONTROLLER'] },
      {
        protocolVersion: '2', resetEpoch: 2,
        idempotencyKey: `runtime-command-${commandCounter}`,
        ...body,
      },
      new Date(NOW.getTime() + commandCounter * 1000),
    )
  }

  function reviewer(body: Record<string, unknown>) {
    commandCounter += 1
    return executeV2RuntimeCommand(
      database,
      { sessionShortId: 'reviewer-short', requestId: `review-${commandCounter}`, roles: ['REVIEWER'] },
      {
        protocolVersion: '2', resetEpoch: 2,
        idempotencyKey: `review-command-${commandCounter}`,
        ...body,
      },
      new Date(NOW.getTime() + commandCounter * 1000),
    )
  }

  function expectParticipantError(action: () => unknown, code: string) {
    try {
      action()
      throw new Error(`Expected participant command to fail with ${code}`)
    } catch (error) {
      expect(error).toBeInstanceOf(V2ParticipantCommandError)
      expect(error).toMatchObject({ code })
    }
  }

  function setLiveAndStart() {
    runtime({ command: 'SET_MODE', expectedRunRevision: 0, targetMode: 'LIVE', confirmed: true })
    return runtime({ command: 'START', expectedRunRevision: 1, confirmed: true })
  }

  it('runs LIVE through exactly three scenes and atomically completes with one confirmation', () => {
    const started = setLiveAndStart()
    expect(started.runtime).toEqual({ mode: 'LIVE', status: 'RUNNING', currentScene: 'ASSEMBLY', runRevision: 2 })

    const program = runtime({
      command: 'ADVANCE', expectedRunRevision: 2,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: false,
    })
    expect(program.runtime.currentScene).toBe('PROGRAM_SUPPORT')
    const cooperative = runtime({
      command: 'ADVANCE', expectedRunRevision: 3,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: false,
    })
    expect(cooperative.runtime.currentScene).toBe('COOPERATIVE_LIGHT')
    const completed = runtime({
      command: 'COMPLETE', expectedRunRevision: 4,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: false,
    })
    expect(completed.runtime).toEqual({ mode: 'LIVE', status: 'COMPLETED', currentScene: 'COOPERATIVE_LIGHT', runRevision: 5 })
    expect(database.prepare('SELECT count(*) FROM v2_control_receipts').pluck().get()).toBe(5)
    expect(database.prepare('SELECT completed_at IS NOT NULL FROM v2_runtime_state').pluck().get()).toBe(1)
    expect(verifyV2Foundation(database, {
      migrationsPath: MIGRATIONS_PATH,
      manifestPath,
      participantCount: 300,
    })).toMatchObject({ ready: true, schemaVersion: 13, issues: [] })
  })

  it('requires an explicit readiness override and audits the anonymous funnel', () => {
    admit(0)
    setLiveAndStart()

    expect(() => runtime({
      command: 'ADVANCE', expectedRunRevision: 2,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: false,
    })).toThrowError(V2RuntimeCommandError)
    try {
      runtime({
        command: 'ADVANCE', expectedRunRevision: 2,
        expectedPresentationRevision: 0, confirmed: true,
        overrideReadinessWarnings: false,
      })
    } catch (error) {
      expect(error).toMatchObject({
        code: 'READINESS_CONFIRMATION_REQUIRED',
        details: { warnings: ['STAR_START_PENDING'] },
      })
    }
    const advanced = runtime({
      command: 'ADVANCE', expectedRunRevision: 2,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: true,
    })
    expect(advanced.runtime.currentScene).toBe('PROGRAM_SUPPORT')
    expect(JSON.parse(String(database.prepare(
      'SELECT readiness_warnings_json FROM v2_control_audit_context ORDER BY receipt_id DESC LIMIT 1',
    ).pluck().get()))).toEqual(['STAR_START_PENDING'])
  })

  it('selects the current program with an interaction revision and publishes one recoverable event', () => {
    setLiveAndStart()
    runtime({
      command: 'ADVANCE', expectedRunRevision: 2,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: false,
    })
    const initial = readV2AdminSnapshot(database, ['STAGE_CONTROLLER'], NOW)
    const program = initial.programs[0]!
    expect(program).toMatchObject({ state: 'UPCOMING', heat: 0 })

    expect(() => runtime({
      command: 'SET_PROGRAM', expectedRunRevision: 3,
      expectedInteractionRevision: 1, programId: program.id, confirmed: true,
    })).toThrowError(V2RuntimeCommandError)
    expect(() => runtime({
      command: 'SET_PROGRAM', expectedRunRevision: 3,
      expectedInteractionRevision: 0, programId: 'missing-program', confirmed: true,
    })).toThrowError(V2RuntimeCommandError)

    const input = {
      protocolVersion: '2' as const,
      resetEpoch: 2,
      idempotencyKey: 'set-program-fixed-key',
      command: 'SET_PROGRAM' as const,
      expectedRunRevision: 3,
      expectedInteractionRevision: 0,
      programId: program.id,
      confirmed: true as const,
    }
    const actor = { sessionShortId: 'admin-short', requestId: 'set-program-request', roles: ['STAGE_CONTROLLER'] as const }
    const selected = executeV2RuntimeCommand(database, { ...actor, roles: [...actor.roles] }, input, NOW)
    expect(selected).toMatchObject({ command: 'SET_PROGRAM', replayed: false, interactionRevision: 1 })
    const screen = readV2ScreenSnapshot(database, NOW)
    const admin = readV2AdminSnapshot(database, ['STAGE_CONTROLLER'], NOW)
    expect(screen.currentProgram).toMatchObject({ id: program.id, title: program.title, heat: 0 })
    expect(admin.currentProgram?.id).toBe(program.id)
    expect(admin.programs.find(({ id }) => id === program.id)?.state).toBe('CURRENT')
    expect(database.prepare(
      `SELECT event_name AS eventName, revision
       FROM v2_domain_events WHERE stream_id = 'public' ORDER BY stream_seq DESC LIMIT 1`,
    ).get()).toMatchObject({ eventName: 'program.changed', revision: 1 })
    const beforeReplay = Number(database.prepare(
      `SELECT count(*) FROM v2_domain_events WHERE event_name = 'program.changed'`,
    ).pluck().get())
    const replayed = executeV2RuntimeCommand(database, { ...actor, roles: [...actor.roles] }, input, NOW)
    expect(replayed.replayed).toBe(true)
    expect(database.prepare(
      `SELECT count(*) FROM v2_domain_events WHERE event_name = 'program.changed'`,
    ).pluck().get()).toBe(beforeReplay)
    expect(verifyV2Foundation(database, {
      migrationsPath: MIGRATIONS_PATH,
      manifestPath,
      participantCount: 300,
    })).toMatchObject({ ready: true, schemaVersion: 13, issues: [] })
  })

  it('starts one public star once and grants the scene reward atomically', () => {
    admit(0)
    setLiveAndStart()
    const before = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    const result = participantCommand(0, {
      command: 'START_STAR',
      expectedParticipantRevision: before.participant.participantRevision,
    })
    expect(result.participant).toMatchObject({ started: true, starlight: 60 })
    expect(readV2ParticipantSnapshot(database, manifest(0).id, NOW).publicStars[0]).toMatchObject({ started: true, starRevision: 2 })
    expect(database.prepare(
      `SELECT count(*) FROM v2_reward_ledger WHERE event_key = 'STAR_STARTED'`,
    ).pluck().get()).toBe(1)
  })

  it('does not let a participant admitted after ASSEMBLY backfill START_STAR', () => {
    setLiveAndStart()
    runtime({
      command: 'ADVANCE', expectedRunRevision: 2,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: false,
    })
    admit(0)
    const snapshot = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    expect(snapshot.participant.admittedScene).toBe('PROGRAM_SUPPORT')
    expect(snapshot.participant.allowedActions).not.toContain('START_STAR')
    expect(() => participantCommand(0, {
      command: 'START_STAR', expectedParticipantRevision: snapshot.participant.participantRevision,
    })).toThrowError(V2ParticipantCommandError)
  })

  it('deducts every gift but awards only the first gift and barrage', () => {
    admit(0)
    setLiveAndStart()
    runtime({
      command: 'ADVANCE', expectedRunRevision: 2,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: true,
    })
    const programId = String(database.prepare('SELECT id FROM program_catalog WHERE enabled = 1 ORDER BY sort_order LIMIT 1').pluck().get())
    runtime({
      command: 'SET_PROGRAM', expectedRunRevision: 3,
      expectedInteractionRevision: 0, programId, confirmed: true,
    })
    const gift = database.prepare('SELECT id, power_cost AS powerCost FROM gift_catalog WHERE enabled = 1 ORDER BY sort_order LIMIT 1').get() as { id: string; powerCost: number }
    let snapshot = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    participantCommand(0, {
      command: 'SEND_GIFT', expectedParticipantRevision: snapshot.participant.participantRevision,
      programId, giftId: gift.id,
    })
    snapshot = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    participantCommand(0, {
      command: 'SEND_GIFT', expectedParticipantRevision: snapshot.participant.participantRevision,
      programId, giftId: gift.id,
    })
    snapshot = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    participantCommand(0, {
      command: 'POST_BARRAGE', expectedParticipantRevision: snapshot.participant.participantRevision,
      text: '第一次应援',
    })
    snapshot = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    participantCommand(0, {
      command: 'POST_BARRAGE', expectedParticipantRevision: snapshot.participant.participantRevision,
      text: '第二次应援',
    })
    snapshot = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    expect(snapshot.participant.powerBalance).toBe(100 - gift.powerCost * 2)
    expect(snapshot.participant.starlight).toBe(40)
    expect(database.prepare('SELECT count(*) FROM v2_gift_transactions').pluck().get()).toBe(2)
    expect(database.prepare('SELECT count(*) FROM v2_barrages').pluck().get()).toBe(2)
    expect(database.prepare(
      `SELECT count(*) FROM v2_domain_events WHERE event_name IN ('gift.sent','barrage.published')`,
    ).pluck().get()).toBe(4)
    expect(database.prepare('SELECT count(*) FROM v2_barrage_publications').pluck().get()).toBe(2)
    expect(database.prepare('SELECT count(*) FROM v2_public_sources').pluck().get()).toBe(1)
    const publicEvents = database.prepare(
      `SELECT payload_json AS payloadJson FROM v2_domain_events
       WHERE stream_id = 'public' AND event_name IN ('gift.sent','barrage.published')
       ORDER BY stream_seq`,
    ).all() as Array<{ payloadJson: string }>
    expect(publicEvents).toHaveLength(4)
    for (const event of publicEvents) {
      expect(event.payloadJson).not.toContain(manifest(0).id)
      expect(event.payloadJson).not.toContain(manifest(0).studentNumber)
      expect(event.payloadJson).not.toContain(manifest(0).inviteToken)
      expect(event.payloadJson).not.toContain('sourceId')
    }
    const screen = readV2ScreenSnapshot(database, NOW)
    const admin = readV2AdminSnapshot(database, ['REVIEWER'], NOW)
    expect(screen.publishedBarrages.map(({ text }) => text)).toEqual(['第一次应援', '第二次应援'])
    expect(JSON.stringify(screen)).not.toContain('sourceId')
    expect(JSON.stringify(screen)).not.toContain(manifest(0).id)
    expect(admin.publishedBarrages).toHaveLength(2)
    expect(admin.publishedBarrages[0]).toMatchObject({ sourceId: expect.stringMatching(/^src_/) })
    expect(JSON.stringify(admin.publishedBarrages)).not.toContain(manifest(0).id)
    expect(verifyV2Foundation(database, {
      migrationsPath: MIGRATIONS_PATH,
      manifestPath,
      participantCount: 300,
    })).toMatchObject({ ready: true, schemaVersion: 13, issues: [] })
  })

  it('pauses, removes, source-blocks and clears anonymous barrages with audit facts', () => {
    admit(0)
    setLiveAndStart()
    runtime({
      command: 'ADVANCE', expectedRunRevision: 2,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: true,
    })
    let participant = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    participantCommand(0, {
      command: 'POST_BARRAGE', expectedParticipantRevision: participant.participant.participantRevision,
      text: '请为舞台喝彩',
    })
    const publication = database.prepare(
      `SELECT publication.barrage_id AS barrageId, publication.source_id AS sourceId
       FROM v2_barrage_publications publication`,
    ).get() as { barrageId: string; sourceId: string }

    reviewer({ command: 'SET_BARRAGE_PAUSED', expectedInteractionRevision: 1, paused: true })
    participant = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    expectParticipantError(() => participantCommand(0, {
      command: 'POST_BARRAGE', expectedParticipantRevision: participant.participant.participantRevision,
      text: '暂停后不能发布',
    }), 'RUNTIME_PAUSED')
    reviewer({ command: 'SET_BARRAGE_PAUSED', expectedInteractionRevision: 2, paused: false })
    reviewer({
      command: 'REMOVE_BARRAGE', expectedInteractionRevision: 3,
      barrageId: publication.barrageId, reason: '合成安全撤下', confirmed: true,
    })
    expect(database.prepare(
      `SELECT status FROM v2_barrage_publications WHERE barrage_id = ?`,
    ).pluck().get(publication.barrageId)).toBe('REMOVED')

    participant = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    participantCommand(0, {
      command: 'POST_BARRAGE', expectedParticipantRevision: participant.participant.participantRevision,
      text: '第二条公开弹幕',
    })
    reviewer({
      command: 'BLOCK_BARRAGE_SOURCE', expectedInteractionRevision: 5,
      sourceId: publication.sourceId, reason: '合成来源屏蔽', confirmed: true,
    })
    participant = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    expectParticipantError(() => participantCommand(0, {
      command: 'POST_BARRAGE', expectedParticipantRevision: participant.participant.participantRevision,
      text: '屏蔽后不能发布',
    }), 'SOURCE_BLOCKED')
    reviewer({ command: 'CLEAR_BARRAGES', expectedInteractionRevision: 6, reason: '现场清屏', confirmed: true })
    expect(database.prepare('SELECT count(*) FROM v2_screen_moderation_audit').pluck().get()).toBe(5)
    expect(database.prepare(
      `SELECT count(*) FROM v2_barrage_publications WHERE status = 'PUBLISHED'`,
    ).pluck().get()).toBe(0)
  })

  it('rejects links, contact details and per-source barrage bursts before publication', () => {
    admit(0)
    setLiveAndStart()
    runtime({
      command: 'ADVANCE', expectedRunRevision: 2,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: true,
    })
    let participant = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    for (const text of ['访问 https://example.com', '联系 13800138000', '微信 abc_12345']) {
      expectParticipantError(() => participantCommand(0, {
        command: 'POST_BARRAGE', expectedParticipantRevision: participant.participant.participantRevision,
        text,
      }), 'CONTENT_REJECTED')
    }
    for (const text of ['应援一', '应援二', '应援三']) {
      participantCommand(0, {
        command: 'POST_BARRAGE', expectedParticipantRevision: participant.participant.participantRevision,
        text,
      })
      participant = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    }
    expectParticipantError(() => participantCommand(0, {
      command: 'POST_BARRAGE', expectedParticipantRevision: participant.participant.participantRevision,
      text: '应援四',
    }), 'RATE_LIMITED')
  })

  it('caps the public barrage stream at twelve accepted messages per second', () => {
    for (let index = 0; index < 13; index += 1) admit(index)
    setLiveAndStart()
    runtime({
      command: 'ADVANCE', expectedRunRevision: 2,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: true,
    })
    const burstAt = new Date('2026-08-13T08:10:00.000Z')
    for (let index = 0; index < 12; index += 1) {
      const participant = readV2ParticipantSnapshot(database, manifest(index).id, burstAt)
      executeV2ParticipantOnboardingCommand(database, manifest(index).id, {
        protocolVersion: '2', resetEpoch: 2,
        idempotencyKey: `global-burst-${index}`,
        command: 'POST_BARRAGE',
        expectedParticipantRevision: participant.participant.participantRevision,
        text: `合成全局应援${index + 1}`,
      }, burstAt)
    }
    const thirteenth = readV2ParticipantSnapshot(database, manifest(12).id, burstAt)
    expectParticipantError(() => executeV2ParticipantOnboardingCommand(
      database,
      manifest(12).id,
      {
        protocolVersion: '2', resetEpoch: 2,
        idempotencyKey: 'global-burst-12',
        command: 'POST_BARRAGE',
        expectedParticipantRevision: thirteenth.participant.participantRevision,
        text: '第十三条应被限流',
      },
      burstAt,
    ), 'RATE_LIMITED')
    expect(database.prepare(
      `SELECT count(*) FROM v2_barrage_publications WHERE status = 'PUBLISHED'`,
    ).pluck().get()).toBe(12)
  })

  it('freezes participant writes after COMPLETE and keeps REHEARSAL finale as a presentation only', () => {
    runtime({ command: 'START', expectedRunRevision: 0, confirmed: true })
    runtime({
      command: 'SET_SCENE', expectedRunRevision: 1,
      expectedPresentationRevision: 0, targetScene: 'COOPERATIVE_LIGHT', confirmed: true,
    })
    const preview = runtime({
      command: 'PREVIEW_FINALE', expectedRunRevision: 2,
      expectedPresentationRevision: 0, confirmed: true,
    })
    expect(preview.runtime.status).toBe('RUNNING')
    expect(preview.presentation).toEqual({ type: 'FINALE_PREVIEW', rehearsal: true })
    runtime({
      command: 'CLEAR_PRESENTATION', expectedRunRevision: 2,
      expectedPresentationRevision: 1, confirmed: true,
    })
    expect(database.prepare('SELECT completed_at FROM v2_runtime_state').pluck().get()).toBeNull()
  })

  it('completes without a message recap and rejects later participant writes', () => {
    admit(0)
    setLiveAndStart()
    runtime({
      command: 'ADVANCE', expectedRunRevision: 2,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: true,
    })
    runtime({
      command: 'ADVANCE', expectedRunRevision: 3,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: true,
    })
    runtime({
      command: 'COMPLETE', expectedRunRevision: 4,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: true,
    })
    const snapshot = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    expect(snapshot.finalRecap).toEqual([])
    expect(snapshot.participant.allowedActions).toEqual([])
    expect(() => participantCommand(0, {
      command: 'POST_BARRAGE',
      expectedParticipantRevision: snapshot.participant.participantRevision,
      text: '结束后不可发送',
    })).toThrowError(V2ParticipantCommandError)
  })

  it('freezes scene writes while paused and requires unfinished cooperative light confirmation', () => {
    admit(0)
    setLiveAndStart()
    runtime({
      command: 'ADVANCE', expectedRunRevision: 2,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: true,
    })
    runtime({
      command: 'ADVANCE', expectedRunRevision: 3,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: false,
    })
    runtime({
      command: 'PAUSE', expectedRunRevision: 4,
      expectedPresentationRevision: 0, confirmed: true,
    })
    let snapshot = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    expect(snapshot.participant.allowedActions).toEqual([])
    expect(() => participantCommand(0, {
      command: 'COOPERATIVE_LIGHT',
      expectedParticipantRevision: snapshot.participant.participantRevision,
    })).toThrowError(V2ParticipantCommandError)
    runtime({ command: 'RESUME', expectedRunRevision: 5, confirmed: true })
    expect(() => runtime({
      command: 'COMPLETE', expectedRunRevision: 6,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: false,
    })).toThrowError(V2RuntimeCommandError)
    snapshot = readV2ParticipantSnapshot(database, manifest(0).id, NOW)
    const light = participantCommand(0, {
      command: 'COOPERATIVE_LIGHT',
      expectedParticipantRevision: snapshot.participant.participantRevision,
    })
    expect(light.participant).toMatchObject({ cooperativeLightAt: expect.any(String), starlight: 40 })
    const completed = runtime({
      command: 'COMPLETE', expectedRunRevision: 6,
      expectedPresentationRevision: 0, confirmed: true,
      overrideReadinessWarnings: false,
    })
    expect(completed.runtime.status).toBe('COMPLETED')
  })

  it('rejects stale revisions and replays the same runtime idempotency key without a second event', () => {
    const input = {
      protocolVersion: '2', resetEpoch: 2, idempotencyKey: 'fixed-runtime-key',
      command: 'START', expectedRunRevision: 0, confirmed: true,
    }
    const actor = { sessionShortId: 'admin-short', requestId: 'fixed-request', roles: ['STAGE_CONTROLLER'] as const }
    const first = executeV2RuntimeCommand(database, { ...actor, roles: [...actor.roles] }, input, NOW)
    const eventCount = database.prepare(`SELECT count(*) FROM v2_domain_events WHERE event_name = 'runtime.changed'`).pluck().get()
    const replay = executeV2RuntimeCommand(database, { ...actor, roles: [...actor.roles] }, input, NOW)
    expect(first.replayed).toBe(false)
    expect(replay.replayed).toBe(true)
    expect(database.prepare(`SELECT count(*) FROM v2_domain_events WHERE event_name = 'runtime.changed'`).pluck().get()).toBe(eventCount)
    expect(() => runtime({ command: 'PAUSE', expectedRunRevision: 0, expectedPresentationRevision: 0, confirmed: true })).toThrowError(V2RuntimeCommandError)
  })

  it('draws admitted participants without replacement and auto-closes on pause', () => {
    admit(0)
    admit(1)
    runtime({ command: 'START', expectedRunRevision: 0, confirmed: true })
    runtime({
      command: 'SET_SCENE', expectedRunRevision: 1,
      expectedPresentationRevision: 0, targetScene: 'PROGRAM_SUPPORT', confirmed: true,
    })
    const opened = runtime({
      command: 'OPEN_RAFFLE', expectedRunRevision: 2,
      expectedPresentationRevision: 0, confirmed: true,
    })
    expect(opened.presentation).toEqual({ type: 'RAFFLE' })
    runtime({ command: 'DRAW_RAFFLE', expectedRunRevision: 2, expectedPresentationRevision: 1, confirmed: true })
    runtime({ command: 'DRAW_RAFFLE', expectedRunRevision: 2, expectedPresentationRevision: 2, confirmed: true })
    const admin = readV2AdminSnapshot(database, ['STAGE_CONTROLLER'], NOW)
    const screen = readV2ScreenSnapshot(database, NOW)
    expect(admin.raffle.winners).toHaveLength(2)
    expect(new Set(admin.raffle.winners.map(({ publicStarId }) => publicStarId)).size).toBe(2)
    expect(admin.raffle.winners[0]).toMatchObject({ displayName: expect.any(String) })
    expect(JSON.stringify(screen.raffle)).not.toContain('displayName')
    expect(screen.raffle).toMatchObject({ eligibleCount: 2, remainingCount: 0 })
    const paused = runtime({
      command: 'PAUSE', expectedRunRevision: 2,
      expectedPresentationRevision: 3, confirmed: true,
    })
    expect(paused.presentation).toEqual({ type: 'NONE' })
    expect(readV2AdminSnapshot(database, ['STAGE_CONTROLLER'], NOW).raffle.winners).toHaveLength(2)
  })
})
