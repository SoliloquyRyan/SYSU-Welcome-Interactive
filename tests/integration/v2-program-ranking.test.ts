import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BACKEND_ROOT } from '../../backend/src/config.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import { migrateDatabase } from '../../backend/src/db/migrate.js'
import { importProtectedRoster } from '../../backend/src/db/protected-roster.js'
import { readCredentialContext, verifyIdentityDirectory, seedDemoDatabase } from '../../backend/src/db/seed.js'
import { V2_CATALOG_UPGRADE_CONFIRMATION, upgradeV2AwardsFrom19To20, upgradeV2ProgramRankingFrom20To21, resetSyntheticV2Database, switchSyntheticDemoToV2, acquireV1ServiceLease, markV1ServiceListening, completeV1ServiceShutdown, V2_DESTRUCTIVE_CONFIRMATION, upgradeV2LiveInteractionsFrom18To19, upgradeV2ProgramCreditsFrom17To18, upgradeV2GiftExperienceFrom16To17, upgradeV2InteractionsFrom15To16, upgradeV2ProgramCatalogFrom14To15, verifyV2Foundation } from '../../backend/src/db/v2-foundation.js'
import { executeV2RuntimeCommand } from '../../backend/src/services/v2-runtime-commands.js'
import { readV2AdminSnapshot, readV2ScreenSnapshot } from '../../backend/src/services/v2-snapshots.js'
import { activateV2Participant, executeV2ParticipantOnboardingCommand, readV2ParticipantSnapshot } from '../../backend/src/services/v2-participant-onboarding.js'
import { V2ProgramCatalogSchema } from '../../packages/contracts/src/protocol-v2.js'
import { eventProgramPreset, validateCatalog } from '../../frontend/src/pages/admin/program-catalog.js'

const MIGRATIONS = path.join(BACKEND_ROOT, 'migrations')
const NOW = new Date('2026-09-06T07:00:00.000Z')

describe('D-097 authoritative programme ranking and adjustments', () => {
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

  const programme = (id: string) => snapshot().programs.find(item => item.id === id)!
  const ranked = () => snapshot().awards!.find(item => item.id === 'program-honors')!
  const adjustBody = (id: string, heat: number) => ({ protocolVersion: '2', resetEpoch: snapshot().resetEpoch,
    idempotencyKey: 'ranking-' + ++sequence, command: 'SET_PROGRAM_HEAT', expectedRunRevision: snapshot().runtime.runRevision,
    expectedStageRevision: snapshot().stage!.revision, programId: id, heat,
    expectedHeatRevision: programme(id).heatRevision, expectedRawHeat: programme(id).rawHeat })
  const adjust = (id: string, heat: number) => apply(adjustBody(id,heat))
  const audit = () => database.prepare('SELECT * FROM v2_program_heat_adjustments ORDER BY id').all()
  const topThree = () => ['event2026-01','event2026-02','event2026-03'].forEach((id,i)=>adjust(id,300-i*100))

  it('derives exactly the top three from official heat, preserves full titles and rejects manual programme awards', () => {
    const catalog = eventProgramPreset()
    catalog.items[0]!.title = '合成节目' + '甲'.repeat(110)
    catalog.items[0]!.performers = '乙'.repeat(240)
    apply(request('UPDATE_PROGRAM_CATALOG', {catalog})); topThree()
    expect(ranked()).toMatchObject({confirmed:true,entryCount:3})
    expect(ranked().entries.map(e=>e.rank)).toEqual([1,2,3])
    expect(ranked().entries[0]).toEqual({name:catalog.items[0]!.title,detail:'300 动力值 · '+catalog.items[0]!.performers,rank:1})
    expect(() => save('program-honors',[{name:'手填替换'}],true)).toThrowError(expect.objectContaining({code:'SCENE_ACTION_INVALID'}))
    expect(() => ceremony('SAVE_AWARD',{awardId:'new-program',group:'PROGRAM',title:'新奖',entries:[],confirmed:false,expectedAwardRevision:0})).toThrow()
    database.prepare("INSERT INTO v2_awards(id,group_code,title,description,sort_order) VALUES('old-program','PROGRAM','历史奖','',99)").run()
    expect(snapshot().awards!.some(a=>a.id==='old-program')).toBe(false)
    expect(database.prepare("SELECT COUNT(*) FROM v2_awards WHERE id='old-program'").pluck().get()).toBe(1)
    expect(verifyV2Foundation(database, verificationOptions()).issues).toEqual([])
  })

  it('blocks ties among the top three and at the cutoff but permits lower-ranking ties and fewer than three cannot reveal', () => {
    startProgramStage(); topThree(); apply(request('SET_PROGRAM',{programId:'ceremony-program-awards'}))
    expect(ranked().confirmed).toBe(true)
    adjust('event2026-04',100); expect(ranked().confirmed).toBe(false)
    expect(()=>ceremony('REVEAL_AWARD')).toThrowError(expect.objectContaining({code:'SCENE_ACTION_INVALID'}))
    adjust('event2026-04',99); expect(ranked().confirmed).toBe(true)
    adjust('event2026-02',300); expect(ranked().confirmed).toBe(false)
    adjust('event2026-02',200); ceremony('REVEAL_AWARD')
    expect(snapshot().stage!.award!.entries.map(e=>e.rank)).toEqual([1,2,3])
    ceremony('HIDE_AWARD')
    database.prepare("UPDATE v2_program_catalog SET enabled=0 WHERE kind='PERFORMANCE' AND id NOT IN ('event2026-01','event2026-02')").run()
    expect(ranked().confirmed).toBe(false); expect(()=>ceremony('REVEAL_AWARD')).toThrow()
  })

  it('keeps winners private until reveal, requires hiding before adjustment and changes all projections consistently', () => {
    startProgramStage(); topThree(); apply(request('SET_PROGRAM',{programId:'ceremony-program-awards'}))
    expect(readV2ScreenSnapshot(database,NOW).stage!.award!.entries).toEqual([])
    const identity=participant().session.identityId
    expect(readV2ParticipantSnapshot(database,identity,NOW).stage!.award!.entries).toEqual([])
    ceremony('REVEAL_AWARD')
    const before=snapshot().stage
    expect(()=>adjust('event2026-04',999)).toThrowError(expect.objectContaining({code:'SCENE_ACTION_INVALID'}))
    expect(snapshot().stage).toEqual(before)
    ceremony('HIDE_AWARD'); adjust('event2026-04',999)
    expect(ranked().entries[0]!.name).toBe(programme('event2026-04').title)
    ceremony('REVEAL_AWARD')
    expect(readV2ScreenSnapshot(database,NOW).stage).toEqual(snapshot().stage)
    expect(readV2ParticipantSnapshot(database,identity,NOW).programs.find(p=>p.id==='event2026-04')!.heat).toBe(999)
    const filename=database.name; database.close(); database=openDatabase(filename)
    expect(snapshot().stage!.award!.entries[0]!.detail).toContain('999 动力值')
    expect(JSON.stringify(database.prepare("SELECT payload_json FROM v2_domain_events WHERE stream_id='public'").all())).not.toContain('rank')
  })

  it('records adjustment once, rejects stale or invalid requests and reviewer authority, and preserves gift facts and account balances', () => {
    startProgramStage(); apply(request('SET_PROGRAM',{programId:'event2026-01'}))
    const identity=participant().session.identityId
    executeV2ParticipantOnboardingCommand(database,identity,{protocolVersion:'2',resetEpoch:1,idempotencyKey:'rank-color',expectedParticipantRevision:1,command:'LOCK_COLOR',colorTemperatureKelvin:6500},NOW)
    const participantBefore=readV2ParticipantSnapshot(database,identity,NOW).participant
    const body=adjustBody('event2026-01',500)
    expect(()=>apply(body,['REVIEWER'])).toThrowError(expect.objectContaining({code:'ROLE_REQUIRED'}))
    apply(body); expect(apply(body).replayed).toBe(true); expect(audit()).toHaveLength(1)
    expect(readV2ParticipantSnapshot(database,identity,NOW).participant).toEqual(participantBefore)
    expect(database.prepare('SELECT COUNT(*) FROM v2_gift_transactions').pluck().get()).toBe(0)
    for(const invalid of [-1,0.5,1_000_000_001]) expect(()=>adjust('event2026-01',invalid)).toThrow()
    expect(()=>adjust('event2026-07',10)).toThrow()
    expect(()=>apply({...body,idempotencyKey:'stale-ranking'})).toThrowError(expect.objectContaining({code:'REVISION_CONFLICT'}))
    const stale=adjustBody('event2026-01',600)
    const send = () => {
      const self=readV2ParticipantSnapshot(database,identity,NOW)
      executeV2ParticipantOnboardingCommand(database,identity,{protocolVersion:'2',resetEpoch:1,idempotencyKey:'rank-gift-'+ ++sequence,expectedParticipantRevision:self.participant.participantRevision,command:'SEND_GIFT',programId:'event2026-01',giftId:'gift-glimmer',quantity:5},NOW)
    }
    send(); expect(programme('event2026-01')).toMatchObject({heat:505,rawHeat:5,heatAdjustment:500,heatRevision:1})
    expect(()=>apply(stale)).toThrowError(expect.objectContaining({code:'REVISION_CONFLICT'}))
    adjust('event2026-01',1); send()
    expect(programme('event2026-01')).toMatchObject({heat:6,rawHeat:10,heatAdjustment:-4,heatRevision:2})
    expect(database.prepare('SELECT COUNT(*) FROM v2_gift_transactions').pluck().get()).toBe(10)
    expect(readV2ParticipantSnapshot(database,identity,NOW).participant.powerBalance).toBe(participantBefore.powerBalance-10)
    expect(readV2ScreenSnapshot(database,NOW).currentProgram!.heat).toBe(6)
    expect(verifyV2Foundation(database,verificationOptions()).issues).toEqual([])
  })

  it('upgrades exact schema 20 through a verified backup, preserves old facts and rolls back a failed maintenance', async () => {
    startProgramStage(); apply(request('SET_PROGRAM',{programId:'event2026-01'}))
    const original=database
    const legacy=openDatabase(path.join(directory,'schema20.sqlite')); migrateDatabase(legacy,MIGRATIONS,()=>NOW,20)
    legacy.pragma('foreign_keys = OFF'); legacy.prepare('ATTACH DATABASE ? AS source_fixture').run(original.name)
    const tables=legacy.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_schema_migrations'").pluck().all() as string[]
    for(const table of tables){const cols=(legacy.prepare('PRAGMA table_info("'+table+'")').all() as Array<{name:string}>).map(c=>'"'+c.name+'"').join(',');legacy.exec('INSERT OR REPLACE INTO "'+table+'" ('+cols+') SELECT '+cols+' FROM source_fixture."'+table+'"')}
    legacy.exec('DETACH DATABASE source_fixture');legacy.pragma('foreign_keys = ON'); original.close();database=legacy
    expect(verifyV2Foundation(database,{...verificationOptions(),throughSchemaVersion:20}).issues).toEqual([])
    expect(verifyV2Foundation(database,verificationOptions()).ready).toBe(false)
    const retained=()=>['v2_runtime_state','v2_gift_transactions','synthetic_identities','v2_participant_states','v2_awards','v2_domain_events','v2_program_catalog'].map(t=>database.prepare('SELECT * FROM '+t).all())
    const before=retained()
    await expect(upgradeV2ProgramRankingFrom20To21(database,{...options(),beforeCommit:()=>{throw new Error('injected')}})).rejects.toMatchObject({code:'V2_UPGRADE_ROLLED_BACK'})
    expect(retained()).toEqual(before); expect(verifyV2Foundation(database,{...verificationOptions(),throughSchemaVersion:20}).ready).toBe(true)
    const result=await upgradeV2ProgramRankingFrom20To21(database,{...options(),backupPath:path.join(directory,'successful-ranking-backup.sqlite')})
    expect(result).toMatchObject({previousSchemaVersion:20,schemaVersion:21,resetEpoch:1});expect(retained()).toEqual(before)
    const backup=openDatabase(result.backupPath);try{expect(verifyV2Foundation(backup,{...verificationOptions(),throughSchemaVersion:20}).ready).toBe(true)}finally{backup.close()}
    expect(verifyV2Foundation(database,verificationOptions()).issues).toEqual([])
  })

  it('starts a new synthetic epoch with zero adjustment while retaining the preceding audit', async () => {
    database.close();database=openDatabase(path.join(directory,'synthetic-reset.sqlite'));secretPath=path.join(directory,'synthetic-manifest.json')
    migrateDatabase(database,MIGRATIONS,()=>NOW);seedDemoDatabase(database,{manifestPath:secretPath,participantCount:300,now:()=>NOW})
    const generation=acquireV1ServiceLease(database,'ranking-test-v1',NOW);markV1ServiceListening(database,'ranking-test-v1',generation,NOW);completeV1ServiceShutdown(database,'ranking-test-v1',generation,NOW)
    await switchSyntheticDemoToV2(database,{migrationsPath:MIGRATIONS,manifestPath:secretPath,participantCount:300,backupPath:path.join(directory,'cutover.sqlite'),confirmation:V2_DESTRUCTIVE_CONFIRMATION,now:()=>NOW})
    apply(request('UPDATE_PROGRAM_CATALOG',{catalog:eventProgramPreset()}));adjust('event2026-01',500)
    const before=audit();const previousEpoch=snapshot().resetEpoch
    resetSyntheticV2Database(database,{migrationsPath:MIGRATIONS,manifestPath:secretPath,participantCount:300,confirmation:V2_DESTRUCTIVE_CONFIRMATION,now:()=>NOW})
    expect(snapshot().resetEpoch).toBe(previousEpoch+1);expect(audit()).toEqual(before)
    expect(programme('event2026-01')).toMatchObject({heat:0,rawHeat:0,heatAdjustment:0,heatRevision:0})
    adjust('event2026-01',300);expect(audit()).toHaveLength(2)
    expect(verifyV2Foundation(database,{...verificationOptions(),participantCount:300}).issues).toEqual([])
  })
})
