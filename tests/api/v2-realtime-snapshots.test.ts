import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../backend/src/app.js'
import { BACKEND_ROOT, type AppConfig } from '../../backend/src/config.js'
import { migrateDatabase } from '../../backend/src/db/migrate.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import { readSeedManifest, seedDemoDatabase } from '../../backend/src/db/seed.js'
import {
  V2AdminSnapshotSchema,
  V2ActivateParticipantResponseSchema,
  V2ApiErrorResponseSchema,
  V2ParticipantSnapshotSchema,
  V2ParticipantCommandResponseSchema,
  V2ProtocolCapabilitiesResponseSchema,
  V2RealtimeEventEnvelopeSchema,
  V2RealtimeHelloAckSchema,
  V2RealtimeSubscribedSchema,
  V2ScreenSnapshotSchema,
} from '../../packages/contracts/src/index.js'

const NOW = new Date('2026-08-13T09:00:00.000Z')
const HEADERS = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:5173' }

describe('V2-05 snapshots and split-stream realtime', () => {
  let directory: string
  let config: AppConfig
  let app: Awaited<ReturnType<typeof buildApp>>
  let participantSecret: string
  let participantId: string

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sysu-welcome-v2-realtime-'))
    config = {
      host: '127.0.0.1', port: 3000,
      databasePath: path.join(directory, 'demo.sqlite'),
      seedManifestPath: path.join(directory, 'manifest.json'),
      migrationsPath: path.join(BACKEND_ROOT, 'migrations'),
      allowedOrigins: ['http://127.0.0.1:5173'], logLevel: 'silent', seedParticipantCount: 300,
    }
    const database = openDatabase(config.databasePath)
    migrateDatabase(database, config.migrationsPath, () => NOW)
    seedDemoDatabase(database, { manifestPath: config.seedManifestPath, participantCount: 300, now: () => NOW })
    participantId = readSeedManifest(config.seedManifestPath).participants[0]!.id
    participantSecret = 'a'.repeat(43)
    // Schema 15 has a separate operational v2 directory. This fixture
    // constructs its runtime directly instead of using initializeV2Runtime.
    database.exec(`INSERT INTO v2_program_catalog (id, sort_order, title, heat, enabled, created_at, updated_at)
      SELECT id, sort_order, title, heat, enabled, created_at, updated_at FROM program_catalog;
      UPDATE v2_program_catalog_state SET current_program_id = (SELECT current_program_id FROM program_runtime_state WHERE id = 1);`)
    const timestamp = NOW.toISOString()
    database.prepare(
      `UPDATE protocol_runtime SET active_protocol_version='2', activation_state='V2_ACTIVE',
         data_classification='SYNTHETIC_DEMO', cutover_backup_sha256=?, cutover_at=?,
         v1_service_registered_at=?, v1_service_generation=1, v1_service_listen_generation=1,
         v1_service_listened_at=?, v1_service_clean_shutdown_generation=1,
         v1_service_clean_shutdown_at=?, updated_at=? WHERE id=1`,
    ).run('0'.repeat(64), timestamp, timestamp, timestamp, timestamp, timestamp)
    database.prepare(
      `INSERT INTO v2_runtime_state (
         id,reset_epoch,mode,status,current_scene,run_revision,presentation_type,
         presentation_revision,public_aggregate_revision,admin_aggregate_revision,
         reward_rule_version,public_seq,admin_seq,completed_at,updated_at
       ) VALUES (1,2,'REHEARSAL','READY',NULL,0,'NONE',0,0,0,
         'v2-rewards-2026-08-30-raffle',0,0,NULL,?)`,
    ).run(timestamp)
    database.prepare(
      `INSERT INTO v2_raffle_state (
         id, reset_epoch, display_active, raffle_revision, updated_at
       ) VALUES (1, 2, 0, 0, ?)`,
    ).run(timestamp)
    database.prepare(`UPDATE app_state SET reset_epoch=2,event_seq=0,updated_at=? WHERE id=1`).run(timestamp)
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
      `INSERT INTO v2_stream_cursors VALUES (2,'public',0),(2,'admin',0),(2,?,1)`,
    ).run(`participant:${participantId}`)
    database.prepare(
      `INSERT INTO v2_identity_slots
       SELECT id,seed_index,public_star_id,'slot:'||visual_seed,NULL,NULL FROM synthetic_identities`,
    ).run()
    database.prepare(
      `UPDATE v2_identity_slots SET reserved_reset_epoch=2,reserved_at=? WHERE identity_id=?`,
    ).run(timestamp, participantId)
    database.prepare(
      `INSERT INTO v2_participant_states (
         identity_id,reset_epoch,participant_revision,onboarding_state,activated_at,
         color_temperature_kelvin,display_color,color_locked_at,capsule_decision,
         capsule_skipped_at,admitted_at,admitted_scene,admitted_run_revision,
         started_at,first_gift_at,first_barrage_at,cooperative_light_at,
         power_balance,starlight,updated_at
       ) VALUES (?,2,0,'NEEDS_COLOR',?,NULL,NULL,NULL,'NONE',NULL,NULL,NULL,NULL,
         NULL,NULL,NULL,NULL,100,20,?)`,
    ).run(participantId, timestamp, timestamp)
    database.prepare(
      `INSERT INTO v2_reward_ledger VALUES (NULL,2,?,'ACTIVATED',20,'v2-rewards-2026-08-30-raffle',?)`,
    ).run(participantId, timestamp)
    database.prepare(
      `INSERT INTO v2_domain_events (
         reset_epoch,stream_id,stream_seq,event_id,event_name,revision,payload_json,committed_at
       ) VALUES (2,?,1,?,'participant.snapshot.changed',0,?,?)`,
    ).run(
      `participant:${participantId}`,
      `2:participant:${participantId}:1`,
      JSON.stringify({ projection: 'SELF', participantRevision: 0, requiresSnapshot: true }),
      timestamp,
    )
    database.prepare(
      `INSERT INTO v2_sessions (
         id,session_type,subject_id,secret_digest,roles_json,reset_epoch,short_id,
         read_only,created_at,expires_at,revoked_at
       ) VALUES ('participant-session','PARTICIPANT',?,?,'[]',2,'p-short',0,?,'2099-01-01T00:00:00.000Z',NULL)`,
    ).run(participantId, createHash('sha256').update(participantSecret).digest('hex'), timestamp)
    database.close()
    app = await buildApp({ config, logger: false, now: () => NOW })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('announces ACTIVE capabilities and serves strict public and participant snapshots', async () => {
    const selected = readSeedManifest(config.seedManifestPath).participants[0]!
    const capabilities = V2ProtocolCapabilitiesResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/protocol-capabilities', headers: HEADERS })).json())
    expect(capabilities).toMatchObject({ activeRuntimeVersion: '2', activationState: 'ACTIVE', capabilities: { v2Snapshots: true, v2RealtimeEvents: true } })
    const screenPayload = (await app.inject({ method: 'GET', url: '/api/v2/screen/snapshot', headers: HEADERS })).json()
    const screen = V2ScreenSnapshotSchema.parse(screenPayload)
    expect(screen).toMatchObject({ resetEpoch: 2, publicSeq: 0, publicStars: [] })
    for (const privateField of ['displayName', 'personalStarCode', 'studentNumber']) {
      expect(JSON.stringify(screenPayload)).not.toContain(`"${privateField}"`)
    }
    const participantPayload = (await app.inject({
      method: 'GET', url: '/api/v2/participant/snapshot',
      headers: { ...HEADERS, cookie: `sysu_welcome_participant=${participantSecret}` },
    })).json()
    const participant = V2ParticipantSnapshotSchema.parse(participantPayload)
    expect(participant.participant).toMatchObject({
      onboardingState: 'NEEDS_COLOR',
      displayName: selected.displayName,
      personalStarCode: selected.publicStarId,
      starlight: 20,
    })
    expect(participantPayload.participant).not.toHaveProperty('studentNumber')
    expect(JSON.stringify(participantPayload)).not.toContain(selected.studentNumber)
    expect(participant).toMatchObject({
      participantStreamId: `participant:${participantId}`,
      interaction: { barragePaused: false },
    })
    expect(participant.programs.length).toBeGreaterThan(0)
    expect(participant.currentProgram?.giftCatalog.every(({ powerCost }) => powerCost > 0)).toBe(true)
    expect(await app.inject({ method: 'GET', url: '/api/screen/snapshot', headers: HEADERS }).then((response) => response.statusCode)).toBe(409)
  })

  it('returns a strict activation wrapper and revokes the participant session on logout', async () => {
    const manifest = readSeedManifest(config.seedManifestPath)
    const newParticipant = manifest.participants[1]!
    const activation = await app.inject({
      method: 'POST', url: '/api/v2/participant/activate', headers: HEADERS,
      payload: {
        protocolVersion: '2', resetEpoch: 2,
        idempotencyKey: 'v2-mobile-activation-http-0001',
        method: 'INVITATION_TOKEN', token: newParticipant.inviteToken,
      },
    })
    expect(activation.statusCode).toBe(200)
    const body = V2ActivateParticipantResponseSchema.parse(activation.json())
    expect(body).toMatchObject({
      activationCreated: true,
      snapshot: {
        participant: {
          onboardingState: 'NEEDS_COLOR',
          displayName: newParticipant.displayName,
          personalStarCode: newParticipant.publicStarId,
        },
      },
    })
    expect(body.snapshot.participant).not.toHaveProperty('studentNumber')
    expect(JSON.stringify(body)).not.toContain(newParticipant.studentNumber)
    const cookie = activation.headers['set-cookie']
    expect(cookie).toContain('sysu_welcome_participant=')
    expect((await app.inject({
      method: 'GET', url: '/api/v2/participant/snapshot', headers: { ...HEADERS, cookie },
    })).statusCode).toBe(200)
    const logout = await app.inject({
      method: 'POST', url: '/api/v2/participant/logout',
      headers: { ...HEADERS, cookie }, payload: {},
    })
    expect(logout.json()).toEqual({ status: 'ok', protocolVersion: '2' })
    expect(logout.headers['set-cookie']).toContain('Max-Age=0')
    expect((await app.inject({
      method: 'GET', url: '/api/v2/participant/snapshot', headers: { ...HEADERS, cookie },
    })).statusCode).toBe(401)
  })

  it('serves an authorized admin snapshot without participant identity fields', async () => {
    const secret = 'b'.repeat(43)
    const database = openDatabase(config.databasePath)
    database.prepare(
      `INSERT INTO v2_sessions VALUES ('admin-session','ADMIN','admin-local',?,'["ALL"]',2,'a-short',0,?,'2099-01-01T00:00:00.000Z',NULL)`,
    ).run(createHash('sha256').update(secret).digest('hex'), NOW.toISOString())
    database.close()
    const admin = V2AdminSnapshotSchema.parse((await app.inject({
      method: 'GET', url: '/api/v2/admin/snapshot', headers: { ...HEADERS, cookie: `sysu_welcome_admin=${secret}` },
    })).json())
    expect(admin.roles).toEqual(['ALL'])
    expect(JSON.stringify(admin)).not.toContain(participantId)
    for (const privateField of ['displayName', 'personalStarCode', 'studentNumber']) {
      expect(JSON.stringify(admin)).not.toContain(`"${privateField}"`)
    }
  })

  it('establishes and revokes a v2 admin session through the shared demo account', async () => {
    const manifest = readSeedManifest(config.seedManifestPath)
    const login = await app.inject({
      method: 'POST', url: '/api/v2/admin/login', headers: HEADERS,
      payload: { username: manifest.admin.username, password: manifest.admin.password },
    })
    expect(login.statusCode).toBe(200)
    const admin = V2AdminSnapshotSchema.parse(login.json())
    expect(admin.roles).toEqual(['ALL'])
    const cookie = login.headers['set-cookie']
    expect(cookie).toContain('sysu_welcome_admin=')
    const snapshot = await app.inject({ method: 'GET', url: '/api/v2/admin/snapshot', headers: { ...HEADERS, cookie } })
    expect(snapshot.statusCode).toBe(200)
    const logout = await app.inject({ method: 'POST', url: '/api/v2/admin/logout', headers: { ...HEADERS, cookie }, payload: {} })
    expect(logout.json()).toEqual({ status: 'ok', protocolVersion: '2' })
    expect((await app.inject({ method: 'GET', url: '/api/v2/admin/snapshot', headers: { ...HEADERS, cookie } })).statusCode).toBe(401)
  })

  it('resets only the temporary synthetic v2 demo, advances the epoch and rotates the admin session', async () => {
    const manifest = readSeedManifest(config.seedManifestPath)
    const login = await app.inject({
      method: 'POST', url: '/api/v2/admin/login', headers: HEADERS,
      payload: { username: manifest.admin.username, password: manifest.admin.password },
    })
    expect(login.statusCode).toBe(200)
    const oldCookie = login.headers['set-cookie']

    const reset = await app.inject({
      method: 'POST', url: '/api/v2/admin/commands', headers: { ...HEADERS, cookie: oldCookie },
      payload: {
        protocolVersion: '2', resetEpoch: 2, idempotencyKey: 'v2-reset-demo-http-0001',
        command: 'RESET_DEMO', confirmation: 'RESET DEMO', syntheticDataConfirmed: true,
      },
    })
    expect(reset.statusCode).toBe(200)
    expect(reset.json()).toMatchObject({
      status: 'ok', protocolVersion: '2', resetEpoch: 3, command: 'RESET_DEMO',
      runtime: { mode: 'REHEARSAL', status: 'READY', currentScene: null, runRevision: 0 },
      presentation: { type: 'NONE' },
    })
    const newCookie = reset.headers['set-cookie']
    expect(newCookie).toContain('sysu_welcome_admin=')
    expect(newCookie).not.toBe(oldCookie)
    expect((await app.inject({
      method: 'GET', url: '/api/v2/admin/snapshot', headers: { ...HEADERS, cookie: oldCookie },
    })).statusCode).toBe(401)
    const refreshed = V2AdminSnapshotSchema.parse((await app.inject({
      method: 'GET', url: '/api/v2/admin/snapshot', headers: { ...HEADERS, cookie: newCookie },
    })).json())
    expect(refreshed).toMatchObject({ resetEpoch: 3, publicSeq: 0, adminSeq: 0 })
    const database = openDatabase(config.databasePath)
    expect(database.prepare(
      `SELECT command,result,before_run_revision AS beforeRunRevision,
              after_run_revision AS afterRunRevision
       FROM v2_control_receipts WHERE reset_epoch=3`,
    ).get()).toMatchObject({
      command: 'RESET_DEMO', result: 'APPLIED', beforeRunRevision: 0, afterRunRevision: 0,
    })
    expect(database.prepare(
      `SELECT override_readiness_warnings AS overrideReadinessWarnings,
              live_completion AS liveCompletion
       FROM v2_control_audit_context`,
    ).get()).toMatchObject({ overrideReadinessWarnings: 0, liveCompletion: 0 })
    database.close()
  })

  it('returns a v2 error envelope for an unauthenticated v2 snapshot', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v2/participant/snapshot', headers: HEADERS })
    expect(response.statusCode).toBe(401)
    expect(V2ApiErrorResponseSchema.parse(response.json())).toMatchObject({
      protocolVersion: '2', resetEpoch: 2, error: { code: 'AUTH_REQUIRED' },
      recovery: { scope: 'ALL_AUTHORIZED', snapshotRequired: true },
    })
  })

  it('exposes the completed v2 participant and runtime command services without reopening v1 routes', async () => {
    const participantResponse = V2ParticipantCommandResponseSchema.parse((await app.inject({
      method: 'POST', url: '/api/v2/participant/commands',
      headers: { ...HEADERS, cookie: `sysu_welcome_participant=${participantSecret}` },
      payload: {
        protocolVersion: '2', resetEpoch: 2, idempotencyKey: 'v2-lock-color-http-0001',
        expectedParticipantRevision: 0, command: 'LOCK_COLOR', colorTemperatureKelvin: 5800,
      },
    })).json())
    expect(participantResponse.participant).toMatchObject({
      onboardingState: 'ADMITTED', colorTemperatureKelvin: 5800,
    })

    const adminSecret = 'c'.repeat(43)
    const database = openDatabase(config.databasePath)
    database.prepare(
      `INSERT INTO v2_sessions VALUES ('admin-command-session','ADMIN','admin-local',?,'["ALL"]',2,'admin-command',0,?,'2099-01-01T00:00:00.000Z',NULL)`,
    ).run(createHash('sha256').update(adminSecret).digest('hex'), NOW.toISOString())
    database.close()
    const adminResponse = await app.inject({
      method: 'POST', url: '/api/v2/admin/commands',
      headers: { ...HEADERS, cookie: `sysu_welcome_admin=${adminSecret}` },
      payload: {
        protocolVersion: '2', resetEpoch: 2, idempotencyKey: 'v2-runtime-start-http-0001',
        expectedRunRevision: 0, command: 'START', confirmed: true,
      },
    })
    expect(adminResponse.statusCode).toBe(200)
    expect(adminResponse.json()).toMatchObject({
      status: 'ok', protocolVersion: '2', runtime: { status: 'RUNNING', currentScene: 'ASSEMBLY' },
    })
    expect((await app.inject({ method: 'POST', url: '/api/admin/runtime', headers: HEADERS, payload: {} })).statusCode).toBe(409)
  })

  it('acknowledges ACTIVE and replays only the authorized independent streams', async () => {
    const frames: unknown[] = []
    const socket = await app.injectWS('/ws/v2', { headers: { ...HEADERS, cookie: `sysu_welcome_participant=${participantSecret}` } }, { onInit(client) { client.on('message', (data) => frames.push(JSON.parse(data.toString()))) } })
    socket.send(JSON.stringify({ type: 'HELLO', protocolVersion: '2', clientSurface: 'WELCOME', clientBuild: 'v2-05-test' }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(V2RealtimeHelloAckSchema.parse(frames[0])).toMatchObject({ activationState: 'ACTIVE', resetEpoch: 2 })
    socket.send(JSON.stringify({
      type: 'SUBSCRIBE', protocolVersion: '2', resetEpoch: 2,
      streams: [{ streamId: 'public', streamSeq: 0 }, { streamId: `participant:${participantId}`, streamSeq: 0 }],
    }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(V2RealtimeSubscribedSchema.parse(frames[1]).streams).toHaveLength(2)
    socket.close()
  })

  it('delivers only explicitly subscribed streams even when the session may access more', async () => {
    const frames: unknown[] = []
    const socket = await app.injectWS('/ws/v2', {
      headers: { ...HEADERS, cookie: `sysu_welcome_participant=${participantSecret}` },
    }, { onInit(client) { client.on('message', (data) => frames.push(JSON.parse(data.toString()))) } })
    socket.send(JSON.stringify({ type: 'HELLO', protocolVersion: '2', clientSurface: 'WELCOME', clientBuild: 'v2-05-scope' }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    socket.send(JSON.stringify({
      type: 'SUBSCRIBE', protocolVersion: '2', resetEpoch: 2,
      streams: [{ streamId: 'public', streamSeq: 0 }],
    }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const database = openDatabase(config.databasePath)
    database.transaction(() => {
      database.prepare(
        `UPDATE v2_stream_cursors SET stream_seq=2 WHERE reset_epoch=2 AND stream_id=?`,
      ).run(`participant:${participantId}`)
      database.prepare(
        `INSERT INTO v2_domain_events VALUES (2,?,2,?,'participant.snapshot.changed',1,?,?)`,
      ).run(`participant:${participantId}`, `2:participant:${participantId}:2`,
        JSON.stringify({ projection: 'SELF', participantRevision: 1, requiresSnapshot: true }), NOW.toISOString())
    })()
    database.close()
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(JSON.stringify(frames)).not.toContain('participant.snapshot.changed')
    socket.close()
  })

  it('replays a public star upsert without exposing a private participant event', async () => {
    const database = openDatabase(config.databasePath)
    database.prepare(`UPDATE v2_stream_cursors SET stream_seq=1 WHERE reset_epoch=2 AND stream_id='public'`).run()
    database.prepare(
      `INSERT INTO v2_domain_events VALUES (2,'public',1,'2:public:1','aggregate.changed',1,?,?)`,
    ).run(JSON.stringify({ projection: 'PUBLIC_AGGREGATE', aggregateRevision: 1,
      aggregate: { activatedCount: 1, publicStarCount: 0, admittedCount: 0, starStartedCount: 0, cooperativeLightCount: 0, totalStarlight: 20 } }), NOW.toISOString())
    database.prepare(`UPDATE v2_runtime_state SET public_seq=1,public_aggregate_revision=1 WHERE id=1`).run()
    database.close()
    const frames: unknown[] = []
    const socket = await app.injectWS('/ws/v2', { headers: HEADERS }, { onInit(client) { client.on('message', (data) => frames.push(JSON.parse(data.toString()))) } })
    socket.send(JSON.stringify({ type: 'HELLO', protocolVersion: '2', clientSurface: 'SCREEN', clientBuild: 'v2-05-test' }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    socket.send(JSON.stringify({ type: 'SUBSCRIBE', protocolVersion: '2', resetEpoch: 2, streams: [{ streamId: 'public', streamSeq: 0 }] }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(V2RealtimeEventEnvelopeSchema.parse(frames[2])).toMatchObject({ streamId: 'public', streamSeq: 1 })
    expect(JSON.stringify(frames)).not.toContain('participant.snapshot.changed')
    socket.close()
  })

  it('pushes a newly committed public event without reconnecting or rescanning private streams', async () => {
    const frames: unknown[] = []
    const socket = await app.injectWS('/ws/v2', { headers: HEADERS }, {
      onInit(client) { client.on('message', (data) => frames.push(JSON.parse(data.toString()))) },
    })
    socket.send(JSON.stringify({ type: 'HELLO', protocolVersion: '2', clientSurface: 'SCREEN', clientBuild: 'v2-05-live' }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    socket.send(JSON.stringify({
      type: 'SUBSCRIBE', protocolVersion: '2', resetEpoch: 2,
      streams: [{ streamId: 'public', streamSeq: 0 }],
    }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const database = openDatabase(config.databasePath)
    database.transaction(() => {
      database.prepare(`UPDATE v2_stream_cursors SET stream_seq=1 WHERE reset_epoch=2 AND stream_id='public'`).run()
      database.prepare(
        `INSERT INTO v2_domain_events VALUES (2,'public',1,'2:public:1','aggregate.changed',1,?,?)`,
      ).run(JSON.stringify({ projection: 'PUBLIC_AGGREGATE', aggregateRevision: 1,
        aggregate: { activatedCount: 1, publicStarCount: 0, admittedCount: 0, starStartedCount: 0, cooperativeLightCount: 0, totalStarlight: 20 } }), NOW.toISOString())
      database.prepare(`UPDATE v2_runtime_state SET public_seq=1,public_aggregate_revision=1 WHERE id=1`).run()
    })()
    database.close()
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(V2RealtimeEventEnvelopeSchema.parse(frames.at(-1))).toMatchObject({
      streamId: 'public', streamSeq: 1, name: 'aggregate.changed',
    })
    socket.close()
  })

  it('pushes an anonymous barrage event to the public screen stream without a source identity', async () => {
    const frames: unknown[] = []
    const socket = await app.injectWS('/ws/v2', { headers: HEADERS }, {
      onInit(client) { client.on('message', (data) => frames.push(JSON.parse(data.toString()))) },
    })
    socket.send(JSON.stringify({
      type: 'HELLO', protocolVersion: '2', clientSurface: 'SCREEN', clientBuild: 'v2-07-screen-test',
    }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    socket.send(JSON.stringify({
      type: 'SUBSCRIBE', protocolVersion: '2', resetEpoch: 2,
      streams: [{ streamId: 'public', streamSeq: 0 }],
    }))
    await new Promise((resolve) => setTimeout(resolve, 20))

    const database = openDatabase(config.databasePath)
    database.transaction(() => {
      const payload = {
        interactionRevision: 1,
        barrage: {
          barrageId: 'barrage-live-1',
          text: '今晚一起加油',
          displaySeq: 1,
          publishedAt: NOW.toISOString(),
        },
      }
      database.prepare(
        `UPDATE v2_screen_interaction_state
         SET interaction_revision=1,next_display_seq=2,updated_at=? WHERE reset_epoch=2`,
      ).run(NOW.toISOString())
      database.prepare(`UPDATE v2_stream_cursors SET stream_seq=1 WHERE reset_epoch=2 AND stream_id='public'`).run()
      database.prepare(
        `INSERT INTO v2_domain_events VALUES (2,'public',1,'2:public:1','barrage.published',1,?,?)`,
      ).run(JSON.stringify(payload), NOW.toISOString())
      database.prepare(`UPDATE v2_runtime_state SET public_seq=1 WHERE id=1`).run()
    })()
    database.close()

    await new Promise((resolve) => setTimeout(resolve, 80))
    const event = V2RealtimeEventEnvelopeSchema.parse(frames.at(-1))
    expect(event).toMatchObject({
      streamId: 'public', streamSeq: 1, name: 'barrage.published',
      payload: { barrage: { barrageId: 'barrage-live-1', text: '今晚一起加油' } },
    })
    expect(JSON.stringify(event)).not.toContain('sourceId')
    expect(JSON.stringify(event)).not.toContain(participantId)
    socket.close()
  })

  it('requires a valid admin session before subscribing to the admin stream', async () => {
    const frames: unknown[] = []
    const socket = await app.injectWS('/ws/v2', { headers: HEADERS }, {
      onInit(client) { client.on('message', (data) => frames.push(JSON.parse(data.toString()))) },
    })
    socket.send(JSON.stringify({ type: 'HELLO', protocolVersion: '2', clientSurface: 'ADMIN', clientBuild: 'v2-05-admin' }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    socket.send(JSON.stringify({
      type: 'SUBSCRIBE', protocolVersion: '2', resetEpoch: 2,
      streams: [{ streamId: 'admin', streamSeq: 0 }],
    }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(frames).toHaveLength(2)
    expect(frames[1]).toMatchObject({ type: 'ERROR', error: { code: 'AUTH_REQUIRED' } })
    socket.close()
  })

  it('rejects unauthorized streams and stale epochs before sending business events', async () => {
    for (const subscribe of [
      { resetEpoch: 2, streams: [{ streamId: 'admin', streamSeq: 0 }] },
      { resetEpoch: 1, streams: [{ streamId: 'public', streamSeq: 0 }] },
    ]) {
      const frames: unknown[] = []
      const socket = await app.injectWS('/ws/v2', { headers: HEADERS }, {
        onInit(client) { client.on('message', (data) => frames.push(JSON.parse(data.toString()))) },
      })
      socket.send(JSON.stringify({ type: 'HELLO', protocolVersion: '2', clientSurface: 'SCREEN', clientBuild: 'v2-05-test' }))
      await new Promise((resolve) => setTimeout(resolve, 10))
      socket.send(JSON.stringify({ type: 'SUBSCRIBE', protocolVersion: '2', ...subscribe }))
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(frames).toHaveLength(2)
      expect(V2RealtimeHelloAckSchema.parse(frames[0]).activationState).toBe('ACTIVE')
      expect(frames[1]).toMatchObject({ type: 'ERROR' })
      socket.close()
    }
  })

  it('requires stream-local resync for an impossible future cursor', async () => {
    const frames: unknown[] = []
    const socket = await app.injectWS('/ws/v2', { headers: HEADERS }, {
      onInit(client) { client.on('message', (data) => frames.push(JSON.parse(data.toString()))) },
    })
    socket.send(JSON.stringify({ type: 'HELLO', protocolVersion: '2', clientSurface: 'SCREEN', clientBuild: 'v2-05-test' }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    socket.send(JSON.stringify({
      type: 'SUBSCRIBE', protocolVersion: '2', resetEpoch: 2,
      streams: [{ streamId: 'public', streamSeq: 99 }],
    }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(frames[1]).toMatchObject({
      type: 'ERROR', activationState: 'ACTIVE',
      error: { code: 'RESYNC_REQUIRED', resync: { streamId: 'public', snapshotRequired: true } },
    })
    socket.close()
  })
})
