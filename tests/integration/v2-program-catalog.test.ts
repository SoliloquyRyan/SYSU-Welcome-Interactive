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
import { V2_CATALOG_UPGRADE_CONFIRMATION, upgradeV2LiveInteractionsFrom18To19, upgradeV2ProgramCreditsFrom17To18, upgradeV2GiftExperienceFrom16To17, upgradeV2InteractionsFrom15To16, upgradeV2ProgramCatalogFrom14To15, verifyV2Foundation } from '../../backend/src/db/v2-foundation.js'
import { executeV2RuntimeCommand } from '../../backend/src/services/v2-runtime-commands.js'
import { readV2AdminSnapshot, readV2ScreenSnapshot } from '../../backend/src/services/v2-snapshots.js'
import { activateV2Participant, executeV2ParticipantOnboardingCommand, readV2ParticipantSnapshot } from '../../backend/src/services/v2-participant-onboarding.js'
import { V2ProgramCatalogSchema } from '../../packages/contracts/src/protocol-v2.js'
import { eventProgramPreset, validateCatalog } from '../../frontend/src/pages/admin/program-catalog.js'

const MIGRATIONS = path.join(BACKEND_ROOT, 'migrations')
const NOW = new Date('2026-09-06T07:00:00.000Z')

describe('D-061 operational program catalog and maintenance', () => {
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

  it('keeps all 22 source entries plus three ceremony entries and agrees with the server validation', () => {
    const catalog = eventProgramPreset()
    expect(catalog.items).toHaveLength(25)
    expect(catalog.items.filter(({ kind }) => kind === 'PERFORMANCE')).toHaveLength(19)
    expect(catalog.items[3]).toMatchObject({ title: 'Worth it', durationLabel: '42s' })
    expect(catalog.items[20]).toMatchObject({ kind: 'INTERLUDE', title: '互动环节三 · 谁是最"人"', formatLabel: '抢答' })
    expect(catalog.items[22]?.title).toBe('光年之外')
    expect(V2ProgramCatalogSchema.parse(validateCatalog(catalog).catalog)).toEqual(catalog)
    for (const invalid of [
      { ...catalog, items: [] }, { ...catalog, items: [catalog.items[0], catalog.items[0]] },
      { ...catalog, items: [{ ...catalog.items[0], title: ' ' }] },
      { ...catalog, items: [{ ...catalog.items[0], order: 2 }] },
      { ...catalog, items: [{ ...catalog.items[0], kind: 'AUCTION' }] },
      { ...catalog, items: [{ ...catalog.items[0], title: '两\n行' }] },
      { ...catalog, items: [{ ...catalog.items[0], performers: '两\n行' }] },
      { ...catalog, items: [{ ...catalog.items[0], performers: '星'.repeat(241) }] },
    ]) {
      expect(validateCatalog(invalid).catalog).toBeNull()
      expect(V2ProgramCatalogSchema.safeParse(invalid).success).toBe(false)
    }
  })

  it('applies and reorders stable ids, retains omitted rows, and leaves identities and seeds intact across reopen', () => {
    const identityBefore = identityDigest()
    const seedBefore = database.prepare('SELECT * FROM program_catalog ORDER BY id').all()
    const catalog = eventProgramPreset()
    const body = request('UPDATE_PROGRAM_CATALOG', { catalog })
    expect(apply(body)).toMatchObject({ replayed: false, interactionRevision: 1 })
    const afterFirst = rawCatalog()
    expect(apply(body)).toMatchObject({ replayed: true })
    expect(rawCatalog()).toEqual(afterFirst)
    expect(snapshot().programs).toHaveLength(25)
    expect(snapshot().currentProgram).toBeNull()
    const reordered = { ...catalog, items: [catalog.items[1], catalog.items[0], ...catalog.items.slice(2)].map((item, index) => ({ ...item, order: index + 1 })) }
    apply(request('UPDATE_PROGRAM_CATALOG', { catalog: reordered }))
    expect(snapshot().programs[0]?.id).toBe(catalog.items[1]?.id)
    expect(database.prepare('SELECT COUNT(*) FROM v2_program_catalog WHERE enabled = 0').pluck().get()).toBe(3)
    expect(database.prepare('SELECT * FROM program_catalog ORDER BY id').all()).toEqual(seedBefore)
    expect(identityDigest()).toBe(identityBefore)
    expect(verifyIdentityDirectory(database, { manifestPath: secretPath, participantCount: 2 }).ready).toBe(true)
    const filename = database.name
    database.close(); database = openDatabase(filename)
    expect(snapshot().programCatalog.revision).toBe(2)
    expect(snapshot().programs.map(({ id }) => id)).toEqual(reordered.items.map(({ id }) => id))
    expect(verifyV2Foundation(database, verificationOptions())).toMatchObject({ ready: true, schemaVersion: 21, issues: [] })
  })

  it('rejects role, revision and running-state conflicts and rolls back a partial catalog write', () => {
    const catalog = eventProgramPreset()
    const original = rawCatalog()
    const body = request('UPDATE_PROGRAM_CATALOG', { catalog })
    expect(() => apply(body, ['REVIEWER'])).toThrowError(expect.objectContaining({ code: 'ROLE_REQUIRED' }))
    expect(() => apply({ ...body, expectedCatalogRevision: 2 })).toThrowError(expect.objectContaining({ code: 'REVISION_CONFLICT' }))
    database.exec(`CREATE TRIGGER test_catalog_failure BEFORE INSERT ON v2_program_catalog
      WHEN NEW.id = 'event2026-03' BEGIN SELECT RAISE(ABORT, 'injected catalog failure'); END;`)
    expect(() => apply(body)).toThrow('injected catalog failure')
    database.exec('DROP TRIGGER test_catalog_failure')
    expect(rawCatalog()).toEqual(original)
    expect(snapshot().programCatalog.revision).toBe(0)
    apply(body)
    expect(() => apply(request('UPDATE_PROGRAM_CATALOG', { catalog, expectedCatalogRevision: 0 })))
      .toThrowError(expect.objectContaining({ code: 'REVISION_CONFLICT' }))
    apply(request('START'))
    expect(() => apply(request('UPDATE_PROGRAM_CATALOG', { catalog }))).toThrowError(expect.objectContaining({ code: 'SCENE_ACTION_INVALID' }))
    apply(request('PAUSE'))
    expect(() => apply(request('UPDATE_PROGRAM_CATALOG', { catalog }))).toThrowError(expect.objectContaining({ code: 'SCENE_ACTION_INVALID' }))
  })

  it('blocks gifts during both kinds of interlude without changing balances, rewards or previous heat', () => {
    const catalog = eventProgramPreset()
    apply(request('UPDATE_PROGRAM_CATALOG', { catalog }))
    const activated = participant()
    const id = activated.session.identityId
    executeV2ParticipantOnboardingCommand(database, id, { protocolVersion: '2', resetEpoch: 1,
      idempotencyKey: 'catalog-lock-color', expectedParticipantRevision: 1, command: 'LOCK_COLOR', colorTemperatureKelvin: 6500 }, NOW)
    apply(request('START'))
    apply(request('SET_SCENE', { targetScene: 'PROGRAM_SUPPORT' }))
    apply(request('SET_PROGRAM', { programId: catalog.items[0].id }))
    let self = readV2ParticipantSnapshot(database, id, NOW)
    const giftId = self.currentProgram!.giftCatalog[0]!.id
    executeV2ParticipantOnboardingCommand(database, id, { protocolVersion: '2', resetEpoch: 1,
      idempotencyKey: 'catalog-first-gift', expectedParticipantRevision: self.participant.participantRevision,
      command: 'SEND_GIFT', programId: catalog.items[0].id, giftId }, NOW)
    const before = readV2ParticipantSnapshot(database, id, NOW)
    for (const index of [6, 13, 20]) {
      apply(request('SET_PROGRAM', { programId: catalog.items[index].id }))
      self = readV2ParticipantSnapshot(database, id, NOW)
      expect(self.currentProgram?.giftCatalog).toEqual([])
      expect(self.participant.allowedActions).not.toContain('SEND_GIFT')
      expect(self.participant.allowedActions).toContain('POST_BARRAGE')
      expect(readV2ScreenSnapshot(database, NOW).currentProgram?.kind).toBe(catalog.items[index].kind)
      for (const programId of [catalog.items[0].id, catalog.items[index].id]) {
        expect(() => executeV2ParticipantOnboardingCommand(database, id, { protocolVersion: '2', resetEpoch: 1,
          idempotencyKey: `catalog-interlude-${++sequence}`, expectedParticipantRevision: self.participant.participantRevision,
          command: 'SEND_GIFT', programId, giftId }, NOW)).toThrowError(expect.objectContaining({ code: 'SCENE_ACTION_INVALID' }))
      }
      const after = readV2ParticipantSnapshot(database, id, NOW)
      expect(after.participant.powerBalance).toBe(before.participant.powerBalance)
      expect(after.participant.rewards).toEqual(before.participant.rewards)
      expect(after.programs[0]?.heat).toBe(before.programs[0]?.heat)
    }
    apply(request('SET_PROGRAM', { programId: catalog.items[19].id }))
    expect(readV2ParticipantSnapshot(database, id, NOW).participant.allowedActions).toContain('SEND_GIFT')
    expect(verifyV2Foundation(database, verificationOptions()).ready).toBe(true)
  })

  function historical14(version: 14 | 15 | 16 | 17 | 18 = 14) {
    // Materialize a historical schema using the frozen migrations and only
    // this test's synthetic records. No production compatibility path is added.
    const original = database
    const legacy = openDatabase(path.join(directory, 'schema14.sqlite'))
    migrateDatabase(legacy, MIGRATIONS, () => NOW, version)
    legacy.pragma('foreign_keys = OFF')
    legacy.prepare('ATTACH DATABASE ? AS source_fixture').run(original.name)
    const tables = legacy.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_schema_migrations'").pluck().all() as string[]
    for (const table of tables) {
      const columns = (legacy.prepare(`PRAGMA table_info("${table}")`).all() as Array<{name:string}>).map(({name}) => `"${name}"`).join(',')
      if (table === 'gift_catalog' && version < 17) {
        legacy.exec(`INSERT OR REPLACE INTO gift_catalog
          (id, sort_order, name, power_cost, enabled, created_at, updated_at)
          SELECT id, sort_order, name,
            CASE id WHEN 'gift-glimmer' THEN 5 WHEN 'gift-beacon' THEN 10
              WHEN 'gift-orbit' THEN 20 WHEN 'gift-starship' THEN 50 END,
            enabled, created_at, updated_at FROM source_fixture.gift_catalog`)
      } else {
        legacy.exec(`INSERT OR REPLACE INTO "${table}" (${columns}) SELECT ${columns} FROM source_fixture."${table}"`)
      }
    }
    if (version === 14) legacy.exec(`UPDATE program_catalog SET heat = (SELECT heat FROM source_fixture.v2_program_catalog WHERE id = program_catalog.id);
      UPDATE program_runtime_state SET current_program_id = (SELECT current_program_id FROM source_fixture.v2_program_catalog_state WHERE id = 1);`)
    const historicalGiftCosts = new Map([
      ['gift-glimmer', 5], ['gift-beacon', 10], ['gift-orbit', 20], ['gift-starship', 50],
    ])
    const programEvents = (version < 17 ? legacy.prepare("SELECT reset_epoch AS resetEpoch, stream_id AS streamId, stream_seq AS streamSeq, payload_json AS payloadJson FROM v2_domain_events WHERE event_name = 'program.changed'").all() : []) as Array<{ resetEpoch: number; streamId: string; streamSeq: number; payloadJson: string }>
    for (const event of programEvents) {
      const payload = JSON.parse(event.payloadJson)
      if (payload.currentProgram?.giftCatalog) {
        payload.currentProgram.giftCatalog = payload.currentProgram.giftCatalog.map((gift: { id: string; powerCost: number }) => ({
          ...gift,
          powerCost: historicalGiftCosts.get(gift.id) ?? gift.powerCost,
        }))
        legacy.prepare('UPDATE v2_domain_events SET payload_json = ? WHERE reset_epoch = ? AND stream_id = ? AND stream_seq = ?')
          .run(JSON.stringify(payload), event.resetEpoch, event.streamId, event.streamSeq)
      }
    }
    legacy.exec('DETACH DATABASE source_fixture')
    legacy.pragma('foreign_keys = ON')
    original.close(); database = legacy
    expect(verifyV2Foundation(database, { ...verificationOptions(), throughSchemaVersion: version }).issues).toEqual([])
  }

  it('upgrades protected schema 14 in place with a verified backup and the same identities and epoch', async () => {
    const activated = participant()
    const identityId = activated.session.identityId
    executeV2ParticipantOnboardingCommand(database, identityId, { protocolVersion: '2', resetEpoch: 1,
      idempotencyKey: 'upgrade-lock-color', expectedParticipantRevision: 1, command: 'LOCK_COLOR', colorTemperatureKelvin: 6500 }, NOW)
    const programId = snapshot().programs[0]!.id
    apply(request('START'))
    apply(request('SET_SCENE', { targetScene: 'PROGRAM_SUPPORT' }))
    apply(request('SET_PROGRAM', { programId }))
    const self = readV2ParticipantSnapshot(database, identityId, NOW)
    executeV2ParticipantOnboardingCommand(database, identityId, { protocolVersion: '2', resetEpoch: 1,
      idempotencyKey: 'upgrade-retained-gift', expectedParticipantRevision: self.participant.participantRevision,
      command: 'SEND_GIFT', programId, giftId: self.currentProgram!.giftCatalog[0]!.id }, NOW)
    apply(request('PAUSE'))
    historical14()
    const before = identityDigest()
    const programs = database.prepare('SELECT id, title, heat FROM program_catalog ORDER BY id').all()
    const gifts = database.prepare('SELECT * FROM v2_gift_transactions').all()
    const rewards = database.prepare('SELECT * FROM v2_reward_ledger ORDER BY id').all()
    const result = await upgradeV2ProgramCatalogFrom14To15(database, options())
    expect(result).toMatchObject({ previousSchemaVersion: 14, schemaVersion: 21, resetEpoch: 1 })
    expect(identityDigest()).toBe(before)
    expect(database.prepare('SELECT id, title, heat FROM v2_program_catalog ORDER BY id').all()).toEqual(programs)
    expect(database.prepare('SELECT * FROM v2_gift_transactions').all()).toEqual(gifts)
    expect(database.prepare('SELECT * FROM v2_reward_ledger ORDER BY id').all()).toEqual(rewards)
    expect(snapshot().currentProgram?.id).toBe(programId)
    expect(verifyV2Foundation(database, verificationOptions()).ready).toBe(true)
    const backup = openDatabase(result.backupPath)
    try { expect(backup.prepare('SELECT MAX(version) FROM _schema_migrations').pluck().get()).toBe(14) } finally { backup.close() }
  })

  it('upgrades schema 15 with a verified backup while preserving running state and epoch', async () => {
    apply(request('START'))
    historical14(15)
    const before = database.prepare('SELECT * FROM v2_runtime_state').get()
    const result = await upgradeV2InteractionsFrom15To16(database, options())
    expect(result).toMatchObject({previousSchemaVersion:15,schemaVersion: 21,resetEpoch:1})
    expect(database.prepare('SELECT * FROM v2_runtime_state').get()).toEqual(before)
    expect(verifyV2Foundation(database, verificationOptions()).ready).toBe(true)
    const backup = openDatabase(result.backupPath)
    try { expect(backup.prepare('SELECT MAX(version) FROM _schema_migrations').pluck().get()).toBe(15) } finally { backup.close() }
  })

  it('upgrades protected schema 16 gift prices without resetting identities or the event epoch', async () => {
    apply(request('START'))
    apply(request('SET_SCENE', { targetScene: 'PROGRAM_SUPPORT' }))
    apply(request('SET_PROGRAM', { programId: snapshot().programs[0]!.id }))
    const before = identityDigest()
    historical14(16)
    const runtimeBefore = database.prepare('SELECT * FROM v2_runtime_state').get()
    const result = await upgradeV2GiftExperienceFrom16To17(database, options())
    expect(result).toMatchObject({ previousSchemaVersion: 16, schemaVersion: 21, resetEpoch: 1 })
    expect(identityDigest()).toBe(before)
    expect(database.prepare('SELECT power_cost FROM gift_catalog ORDER BY sort_order').pluck().all()).toEqual([1, 5, 10, 20])
    expect(database.prepare('SELECT * FROM v2_runtime_state').get()).toEqual(runtimeBefore)
    expect(verifyV2Foundation(database, verificationOptions())).toMatchObject({ ready: true, schemaVersion: 21, issues: [] })
    const backup = openDatabase(result.backupPath)
    try { expect(backup.prepare('SELECT MAX(version) FROM _schema_migrations').pluck().get()).toBe(16) } finally { backup.close() }
  })

  it('synchronizes credits by id across rename, reorder, retirement, intentional clearing and old imports', () => {
    const catalog = eventProgramPreset()
    apply(request('UPDATE_PROGRAM_CATALOG', { catalog }))
    const renamed = { ...catalog, items: [catalog.items[1], catalog.items[0], ...catalog.items.slice(3)]
      .map((item, index) => ({ ...item, order: index + 1, ...(item.id === 'event2026-01' ? { title: '重新命名的开场', performers: '甲、乙与合唱团' } : {}) })) }
    apply(request('UPDATE_PROGRAM_CATALOG', { catalog: renamed }))
    const activated = participant()
    const publicPrograms = readV2ScreenSnapshot(database, NOW).programs
    expect(publicPrograms.map(({ id }) => id)).toEqual(renamed.items.map(({ id }) => id))
    expect(publicPrograms.find(({ id }) => id === 'event2026-01')).toMatchObject({ title: '重新命名的开场', performers: '甲、乙与合唱团', order: 2 })
    expect(publicPrograms.some(({ id }) => id === 'event2026-03')).toBe(false)
    expect(readV2ParticipantSnapshot(database, activated.session.identityId, NOW).programs).toEqual(publicPrograms)
    expect(snapshot().programs).toEqual(publicPrograms)
    // Old imports omit the field. They must not erase existing maintained names.
    const old = { ...renamed, items: renamed.items.map(({ performers: _credits, ...item }) => item) }
    apply(request('UPDATE_PROGRAM_CATALOG', { catalog: old }))
    expect(snapshot().programs[1]?.performers).toBe('甲、乙与合唱团')
    renamed.items[1].performers = ''
    apply(request('UPDATE_PROGRAM_CATALOG', { catalog: renamed }))
    apply(request('START'))
    apply(request('SET_SCENE', { targetScene: 'PROGRAM_SUPPORT' }))
    apply(request('SET_PROGRAM', { programId: 'event2026-01' }))
    expect(readV2ScreenSnapshot(database, NOW).currentProgram?.performers).toBe('')
    expect(readV2ParticipantSnapshot(database, activated.session.identityId, NOW).currentProgram?.performers).toBe('')
  })

  it('upgrades schema 17 credits with a restorable backup and no runtime, identity or ledger change', async () => {
    const legacyCatalog = eventProgramPreset()
    legacyCatalog.items = legacyCatalog.items.filter(item => !['AWARD', 'SPEECH'].includes(item.kind)).map((item, index) => ({ ...item, order: index + 1 }))
    apply(request('UPDATE_PROGRAM_CATALOG', { catalog: legacyCatalog }))
    const activated = participant()
    executeV2ParticipantOnboardingCommand(database, activated.session.identityId, { protocolVersion: '2', resetEpoch: 1,
      idempotencyKey: 'credits-lock-color', expectedParticipantRevision: 1, command: 'LOCK_COLOR', colorTemperatureKelvin: 6500 }, NOW)
    apply(request('START'))
    apply(request('SET_SCENE', { targetScene: 'PROGRAM_SUPPORT' }))
    apply(request('SET_PROGRAM', { programId: 'event2026-01' }))
    const self = readV2ParticipantSnapshot(database, activated.session.identityId, NOW)
    executeV2ParticipantOnboardingCommand(database, activated.session.identityId, { protocolVersion: '2', resetEpoch: 1,
      idempotencyKey: 'credits-retained-gift', expectedParticipantRevision: self.participant.participantRevision,
      command: 'SEND_GIFT', programId: 'event2026-01', giftId: self.currentProgram!.giftCatalog[0]!.id }, NOW)
    historical14(17)
    const identityBefore = identityDigest()
    const tables = ['v2_runtime_state', 'v2_program_catalog_state', 'v2_gift_transactions', 'v2_reward_ledger', 'v2_domain_events', 'v2_participant_states']
    const retained = () => tables.map(table => database.prepare(`SELECT * FROM ${table}`).all())
    const before = retained()
    const result = await upgradeV2ProgramCreditsFrom17To18(database, options())
    expect(result).toMatchObject({ previousSchemaVersion: 17, schemaVersion: 21, resetEpoch: 1 })
    expect(retained()).toEqual(before)
    expect(identityDigest()).toBe(identityBefore)
    expect(snapshot().currentProgram).toMatchObject({ id: 'event2026-01', performers: '吴津颖、宋欣然', heat: 1 })
    const backup = openDatabase(result.backupPath)
    try {
      expect(verifyV2Foundation(backup, { ...verificationOptions(), throughSchemaVersion: 17 }).ready).toBe(true)
      expect(backup.prepare('SELECT MAX(version) FROM _schema_migrations').pluck().get()).toBe(17)
    } finally { backup.close() }
  })

  it('rolls back credits migration failures and refuses missing confirmation and backup reuse', async () => {
    historical14(17)
    await expect(upgradeV2ProgramCreditsFrom17To18(database, { ...options(), confirmation: '' })).rejects.toThrow()
    expect(fs.existsSync(options().backupPath)).toBe(false)
    await expect(upgradeV2ProgramCreditsFrom17To18(database, { ...options(), beforeCommit: () => { throw new Error('credits rollback probe') } })).rejects.toThrow('credits rollback probe')
    expect(verifyV2Foundation(database, { ...verificationOptions(), throughSchemaVersion: 17 }).ready).toBe(true)
    await expect(upgradeV2ProgramCreditsFrom17To18(database, options())).rejects.toThrowError(expect.objectContaining({ code: 'V2_BACKUP_EXISTS' }))
  })

  it('upgrades schema 18 to live interactions with a verified, restorable backup', async () => {
    const identityBefore = identityDigest()
    const runtimeBefore = database.prepare('SELECT * FROM v2_runtime_state').get()
    historical14(18)
    const result = await upgradeV2LiveInteractionsFrom18To19(database, options())
    expect(result).toMatchObject({ previousSchemaVersion: 18, schemaVersion: 21, resetEpoch: 1 })
    expect(identityDigest()).toBe(identityBefore)
    expect(database.prepare('SELECT * FROM v2_runtime_state').get()).toEqual(runtimeBefore)
    expect(database.prepare('SELECT reset_epoch, phase, round_number, revision FROM v2_live_interaction_state').get())
      .toEqual({ reset_epoch: 1, phase: 'IDLE', round_number: 0, revision: 0 })
    expect(verifyV2Foundation(database, verificationOptions())).toMatchObject({ ready: true, schemaVersion: 21, issues: [] })
    const backup = openDatabase(result.backupPath)
    try {
      expect(backup.pragma('integrity_check', { simple: true })).toBe('ok')
      expect(backup.prepare('SELECT MAX(version) FROM _schema_migrations').pluck().get()).toBe(18)
    } finally { backup.close() }
  })

  it('refuses to upgrade a running event before creating a backup', async () => {
    apply(request('START'))
    historical14()
    await expect(upgradeV2ProgramCatalogFrom14To15(database, options()))
      .rejects.toThrowError(expect.objectContaining({ code: 'V2_SERVICE_ACTIVE' }))
    expect(fs.existsSync(options().backupPath)).toBe(false)
  })

  it('retains schema 14 on a failed upgrade and refuses absent confirmation or an existing backup', async () => {
    historical14()
    await expect(upgradeV2ProgramCatalogFrom14To15(database, { ...options(), confirmation: '' })).rejects.toThrow()
    expect(fs.existsSync(options().backupPath)).toBe(false)
    await expect(upgradeV2ProgramCatalogFrom14To15(database, { ...options(), beforeCommit: () => { throw new Error('injected upgrade failure') } }))
      .rejects.toThrow('injected upgrade failure')
    expect(database.prepare('SELECT MAX(version) FROM _schema_migrations').pluck().get()).toBe(14)
    expect(database.prepare("SELECT COUNT(*) FROM sqlite_schema WHERE name = 'v2_program_catalog'").pluck().get()).toBe(0)
    await expect(upgradeV2ProgramCatalogFrom14To15(database, options())).rejects.toThrowError(expect.objectContaining({ code: 'V2_BACKUP_EXISTS' }))
    expect(verifyV2Foundation(database, { ...verificationOptions(), throughSchemaVersion: 14 }).ready).toBe(true)
  })
})
