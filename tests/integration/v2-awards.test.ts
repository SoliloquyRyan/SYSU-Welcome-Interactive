import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BACKEND_ROOT } from '../../backend/src/config.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import { migrateDatabase } from '../../backend/src/db/migrate.js'
import { importProtectedRoster } from '../../backend/src/db/protected-roster.js'
import { readCredentialContext, verifyIdentityDirectory } from '../../backend/src/db/seed.js'
import { V2_CATALOG_UPGRADE_CONFIRMATION, upgradeV2AwardsFrom19To20, upgradeV2LiveInteractionsFrom18To19, upgradeV2ProgramCreditsFrom17To18, upgradeV2GiftExperienceFrom16To17, upgradeV2InteractionsFrom15To16, upgradeV2ProgramCatalogFrom14To15, verifyV2Foundation } from '../../backend/src/db/v2-foundation.js'
import { executeV2RuntimeCommand } from '../../backend/src/services/v2-runtime-commands.js'
import { readV2AdminSnapshot, readV2ScreenSnapshot } from '../../backend/src/services/v2-snapshots.js'
import { activateV2Participant, executeV2ParticipantOnboardingCommand, readV2ParticipantSnapshot } from '../../backend/src/services/v2-participant-onboarding.js'
import { V2ProgramCatalogSchema } from '../../packages/contracts/src/protocol-v2.js'
import { eventProgramPreset, validateCatalog } from '../../frontend/src/pages/admin/program-catalog.js'

const MIGRATIONS = path.join(BACKEND_ROOT, 'migrations')
const NOW = new Date('2026-09-06T07:00:00.000Z')

describe('D-096 awards, stage and recipient privacy', () => {
  let directory: string
  let secretPath: string
  let database: ReturnType<typeof openDatabase>
  let sequence = 0
  const snapshot = () => readV2AdminSnapshot(database, ['STAGE_CONTROLLER'], NOW)
  const verificationOptions = () => ({ migrationsPath: MIGRATIONS, manifestPath: secretPath, participantCount: 2 })
  const options = () => ({ ...verificationOptions(), backupPath: path.join(directory, 'before-catalog.sqlite'),
    confirmation: V2_CATALOG_UPGRADE_CONFIRMATION, now: () => NOW })

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sysu-v2-catalog-test-'))
    secretPath = path.join(directory, 'synthetic-protected-secret.json')
    database = openDatabase(path.join(directory, 'current.sqlite'))
    // Synthetic values exercise the PROTECTED classification without using any
    // actual roster, invite mapping or credential file.
    importProtectedRoster(database, { schemaVersion: 1, sourceSha256: 'a'.repeat(64), records: [
      { displayName: '测试甲', studentNumber: '26000001' }, { displayName: '测试乙', studentNumber: '26000002' },
    ] }, { migrationsPath: MIGRATIONS, runtimeSecretPath: secretPath, nfcMapPath: path.join(directory, 'synthetic-nfc.csv'),
      publicOrigin: 'https://welcome.example.edu.cn', now: () => NOW })
  })
  afterEach(() => { if (database.open) database.close(); fs.rmSync(directory, { recursive: true, force: true }) })

  function request(command: string, fields: Record<string, unknown> = {}) {
    const state = snapshot()
    return { protocolVersion: '2', resetEpoch: state.resetEpoch, idempotencyKey: `catalog-test-${++sequence}`,
      command, expectedRunRevision: state.runtime.runRevision, confirmed: true,
      ...(['UPDATE_PROGRAM_CATALOG', 'SET_PROGRAM'].includes(command) ? { expectedInteractionRevision: state.interaction.interactionRevision } : {}),
      ...(command === 'UPDATE_PROGRAM_CATALOG' ? { expectedCatalogRevision: state.programCatalog.revision } : {}),
      ...(['SET_SCENE', 'PAUSE', 'ADVANCE', 'COMPLETE'].includes(command) ? { expectedPresentationRevision: state.presentationRevision } : {}),
      ...fields }
  }
  function apply(body: unknown, roles: Array<'STAGE_CONTROLLER' | 'REVIEWER'> = ['STAGE_CONTROLLER']) {
    return executeV2RuntimeCommand(database, { roles, sessionShortId: 'catalog-admin', requestId: `catalog-request-${++sequence}` }, body, NOW)
  }
  function rawCatalog() { return database.prepare('SELECT * FROM v2_program_catalog ORDER BY id').all() }
  function identityDigest() {
    return createHash('sha256').update(JSON.stringify(database.prepare('SELECT * FROM synthetic_identities ORDER BY id').all()))
      .update(fs.readFileSync(secretPath)).digest('hex')
  }
  function participant() {
    const credential = readCredentialContext(secretPath)
    const result = activateV2Participant(database, credential, { protocolVersion: '2', resetEpoch: snapshot().resetEpoch,
      idempotencyKey: `catalog-activate-${++sequence}`, method: 'ASSISTED_STUDENT', displayName: '测试甲', studentNumber: '26000001' }, NOW)
    return result
  }


  const ceremony = (command: string, fields: Record<string, unknown> = {}) => apply({
    protocolVersion: '2', resetEpoch: snapshot().resetEpoch, idempotencyKey: 'awards-' + ++sequence,
    command, expectedRunRevision: snapshot().runtime.runRevision, expectedStageRevision: snapshot().stage!.revision, ...fields,
  })
  const startProgramStage = () => {
    apply(request('UPDATE_PROGRAM_CATALOG', { catalog: eventProgramPreset() }))
    apply(request('START')); apply(request('SET_SCENE', { targetScene: 'PROGRAM_SUPPORT' }))
  }
  const save = (id: string, entries: Array<{name:string;detail?:string}>, confirmed = false) => {
    const award = snapshot().awards!.find(item => item.id === id)!
    return ceremony('SAVE_AWARD', { awardId: id, group: award.group, title: award.title, expectedAwardRevision: award.revision, entries, confirmed })
  }
  const publicState = () => JSON.stringify(readV2ScreenSnapshot(database, NOW))

  it('keeps the exact tail, three interaction letters, stable identities and lightyears gift prohibition', () => {
    startProgramStage()
    expect(snapshot().programs.slice(-4).map(p => p.title)).toEqual(['节目颁奖', '光年之外', '负责人讲话', '校园图鉴颁奖'])
    expect(snapshot().programs.filter(p => ['INTERLUDE','DEFERRED'].includes(p.kind)).map(p => p.displayCode)).toEqual(['A','B','C'])
    expect(snapshot().programs.filter(p => p.kind === 'PERFORMANCE')).toHaveLength(19)
    const active = participant()
    const identity = active.session.identityId
    executeV2ParticipantOnboardingCommand(database, identity, { protocolVersion: '2', resetEpoch: 1, idempotencyKey: 'awards-color', expectedParticipantRevision: 1, command: 'LOCK_COLOR', colorTemperatureKelvin: 6500 }, NOW)
    for (const id of ['ceremony-program-awards','event2026-22','ceremony-speech','ceremony-campus-awards']) {
      apply(request('SET_PROGRAM', { programId: id }))
      const state = readV2ParticipantSnapshot(database, identity, NOW)
      expect(state.participant.allowedActions).not.toContain('SEND_GIFT')
      expect(state.currentProgram!.giftCatalog).toEqual([])
      expect(() => executeV2ParticipantOnboardingCommand(database, identity, { protocolVersion: '2', resetEpoch: 1, idempotencyKey: 'awards-gift-' + ++sequence, expectedParticipantRevision: state.participant.participantRevision, command: 'SEND_GIFT', programId: id, giftId: 'gift-glimmer' }, NOW)).toThrowError(expect.objectContaining({ code: 'SCENE_ACTION_INVALID' }))
    }
    expect(database.prepare('SELECT COUNT(*) FROM v2_gift_transactions').pluck().get()).toBe(0)
    expect(verifyV2Foundation(database, verificationOptions()).issues).toEqual([])
  })

  it('keeps drafts and confirmed-but-unrevealed names out of both public snapshots and events', () => {
    save('photography', [{ name: '合成获奖人甲', detail: '合成作品一' }])
    expect(snapshot().awards!.find(a => a.id === 'photography')!.entries[0]!.name).toBe('合成获奖人甲')
    startProgramStage(); apply(request('SET_PROGRAM', { programId: 'ceremony-campus-awards' }))
    ceremony('SELECT_AWARD', { awardId: 'photography' })
    expect(() => ceremony('REVEAL_AWARD')).toThrowError(expect.objectContaining({ code: 'SCENE_ACTION_INVALID' }))
    expect(publicState()).not.toContain('合成获奖人甲')
    const identity = participant().session.identityId
    expect(JSON.stringify(readV2ParticipantSnapshot(database, identity, NOW))).not.toContain('合成获奖人甲')
    save('photography', [{ name: '合成获奖人甲', detail: '合成作品一' }], true)
    expect(publicState()).not.toContain('合成获奖人甲')
    ceremony('REVEAL_AWARD')
    expect(publicState()).toContain('合成获奖人甲')
    expect(JSON.stringify(readV2ParticipantSnapshot(database, identity, NOW))).toContain('合成获奖人甲')
    expect(() => save('photography', [{ name: '改名' }], true)).toThrowError(expect.objectContaining({ code: 'SCENE_ACTION_INVALID' }))
    ceremony('HIDE_AWARD')
    expect(publicState()).not.toContain('合成获奖人甲')
    expect(JSON.stringify(database.prepare("SELECT payload_json FROM v2_domain_events WHERE stream_id='public'").all())).not.toContain('合成获奖人甲')
  })

  it('requires exactly twenty ranked recipients and persists the current eight-entry page after reopen', () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({ name: '合成获奖人' + (i + 1), detail: String(200 - i) + ' 积分' }))
    expect(() => save('points-top20', entries.slice(0,19), true)).toThrow()
    save('points-top20', entries, true)
    startProgramStage(); apply(request('SET_PROGRAM', { programId: 'ceremony-campus-awards' }))
    ceremony('SELECT_AWARD', { awardId: 'points-top20' }); ceremony('REVEAL_AWARD')
    expect(snapshot().stage).toMatchObject({ revealed: true, page: 0, totalPages: 3 })
    expect(snapshot().stage!.award!.entries.map(e => e.rank)).toEqual([1,2,3,4,5,6,7,8])
    ceremony('SET_AWARD_PAGE', { page: 2 })
    const state = snapshot().stage
    const filename = database.name; database.close(); database = openDatabase(filename)
    expect(snapshot().stage).toEqual(state)
    expect(snapshot().stage!.award!.entries.map(e => e.rank)).toEqual([17,18,19,20])
    expect(() => ceremony('SET_AWARD_PAGE', { page: 3 })).toThrow()
    expect(verifyV2Foundation(database, verificationOptions()).issues).toEqual([])
    apply(request('PAUSE')); expect(snapshot().stage!.revealed).toBe(false); expect(snapshot().stage!.award!.id).toBe('points-top20')
  })

  it('rejects campus recipient text beyond the editor limits without changing the saved list', () => {
    const entries = [{ name: '甲'.repeat(60), detail: '乙'.repeat(120) }]
    save('photography', entries, true)
    const before = snapshot().awards!.find(award => award.id === 'photography')
    expect(() => save('photography', [{ name: '甲'.repeat(61), detail: '' }], true)).toThrow()
    expect(() => save('photography', [{ name: '合成获奖者', detail: '乙'.repeat(121) }], true)).toThrow()
    expect(snapshot().awards!.find(award => award.id === 'photography')).toEqual(before)
    expect(before!.entries).toEqual(entries)
  })

  it('uses four entries per page for long award text without truncating any recipient', () => {
    const entries = Array.from({length:9},(_,i)=>({name:'合成节目'+String(i)+'甲'.repeat(30),detail:'合成备注'.repeat(20)}))
    save('photography', entries, true)
    startProgramStage(); apply(request('SET_PROGRAM', {programId:'ceremony-campus-awards'})); ceremony('SELECT_AWARD', {awardId:'photography'}); ceremony('REVEAL_AWARD')
    expect(snapshot().stage).toMatchObject({totalPages:3,page:0})
    expect(snapshot().stage!.award!.entries).toHaveLength(4)
    ceremony('SET_AWARD_PAGE',{page:2}); expect(snapshot().stage!.award!.entries).toEqual(entries.slice(8))
  })

  it('rejects stale writes and reviewer control and replays an identical reveal without double advancing', () => {
    startProgramStage(); apply(request('SET_PROGRAM', { programId: 'ceremony-campus-awards' }))
    save('photography', [{ name: '合成摄影' }], true)
    ceremony('SELECT_AWARD', {awardId:'photography'})
    const body = { protocolVersion: '2', resetEpoch: 1, idempotencyKey: 'award-reveal-replay', command: 'REVEAL_AWARD', expectedRunRevision: snapshot().runtime.runRevision, expectedStageRevision: snapshot().stage!.revision }
    expect(() => apply(body, ['REVIEWER'])).toThrowError(expect.objectContaining({ code: 'ROLE_REQUIRED' }))
    apply(body)
    const stage = snapshot().stage
    expect(apply(body).replayed).toBe(true)
    expect(snapshot().stage).toEqual(stage)
    expect(() => apply({ ...body, idempotencyKey: 'stale-award' })).toThrowError(expect.objectContaining({ code: 'REVISION_CONFLICT' }))
    expect(() => ceremony('SELECT_AWARD', { awardId: 'program-honors' })).toThrow()
  })

  it('switches host background and programme with gift eligibility and rejects overlay conflicts', () => {
    startProgramStage(); apply(request('SET_PROGRAM', { programId: 'event2026-01' }))
    expect(snapshot().currentProgram!.giftsEnabled).toBe(true)
    ceremony('SET_STAGE_MODE', { mode: 'HOST' })
    expect(snapshot().stage!.mode).toBe('HOST')
    expect(snapshot().currentProgram!.giftsEnabled).toBe(false)
    ceremony('SET_STAGE_MODE', { mode: 'PROGRAM' })
    expect(snapshot().currentProgram!.giftsEnabled).toBe(true)
    apply(request('SET_PROGRAM', { programId: 'event2026-07' }))
    const live = snapshot()
    apply({ protocolVersion: '2', resetEpoch: 1, idempotencyKey: 'award-buzzer', command: 'OPEN_BUZZER', confirmed:true, expectedInteractionRevision: live.interaction.interactionRevision, segmentCode:'A', prompt:'合成抢答' })
    expect(() => ceremony('SET_STAGE_MODE', { mode:'HOST' })).toThrow()
    expect(() => apply(request('SET_PROGRAM', { programId:'ceremony-program-awards' }))).toThrow()
  })

  it('upgrades schema 19 with a verified backup while preserving all prior runtime, gifts and catalogue identities', async () => {
    startProgramStage(); apply(request('SET_PROGRAM', { programId: 'event2026-01' }))
    const original = database
    const legacy = openDatabase(path.join(directory,'schema19.sqlite'))
    migrateDatabase(legacy, MIGRATIONS, () => NOW, 19)
    legacy.pragma('foreign_keys = OFF')
    legacy.prepare('ATTACH DATABASE ? AS source_fixture').run(original.name)
    const tables = legacy.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_schema_migrations'").pluck().all() as string[]
    for (const table of tables) {
      const cols = (legacy.prepare('PRAGMA table_info("' + table + '")').all() as Array<{name:string}>).map(c => '"' + c.name + '"').join(',')
      legacy.exec('INSERT OR REPLACE INTO "' + table + '" (' + cols + ') SELECT ' + cols + ' FROM source_fixture."' + table + '"')
    }
    legacy.exec("UPDATE v2_program_catalog SET enabled=0 WHERE id LIKE 'ceremony-%'; UPDATE v2_program_catalog SET sort_order = sort_order + 1000")
    legacy.exec('DETACH DATABASE source_fixture'); legacy.pragma('foreign_keys = ON'); original.close(); database = legacy
    // The real schema-19 directory has no ceremony metadata or ceremony entries.
    const rows = database.prepare('SELECT id FROM v2_program_catalog WHERE enabled=1 ORDER BY sort_order').pluck().all() as string[]
    rows.forEach((id,i)=>database.prepare('UPDATE v2_program_catalog SET sort_order=? WHERE id=?').run(i+1,id))
    expect(verifyV2Foundation(database, { ...verificationOptions(), throughSchemaVersion:19 }).issues).toEqual([])
    const retained = () => ['v2_runtime_state','v2_gift_transactions','synthetic_identities','v2_participant_states','v2_domain_events'].map(table => database.prepare('SELECT * FROM '+table).all())
    const before = retained(); const identities = identityDigest()
    const result = await upgradeV2AwardsFrom19To20(database, options())
    expect(result).toMatchObject({previousSchemaVersion:19,schemaVersion: 21,resetEpoch:1})
    expect(retained()).toEqual(before); expect(identityDigest()).toBe(identities)
    expect(snapshot().awards).toHaveLength(7)
    const backup = openDatabase(result.backupPath)
    try { expect(verifyV2Foundation(backup,{...verificationOptions(),throughSchemaVersion:19}).ready).toBe(true) } finally { backup.close() }
  })
})
