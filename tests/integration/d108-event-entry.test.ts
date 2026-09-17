import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BACKEND_ROOT } from '../../backend/src/config.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import { migrateDatabase } from '../../backend/src/db/migrate.js'
import { retainedV21Facts } from '../helpers/retained-v21-facts.js'
import { importProtectedRoster, ProtectedRosterInputSchema } from '../../backend/src/db/protected-roster.js'
import { readCredentialContext, verifyIdentityDirectory } from '../../backend/src/db/seed.js'
import { verifyV2Foundation, upgradeV2EventEntryFrom21To22, V2_CATALOG_UPGRADE_CONFIRMATION } from '../../backend/src/db/v2-foundation.js'
import { executeV2RuntimeCommand } from '../../backend/src/services/v2-runtime-commands.js'
import { readV2AdminSnapshot, readV2ScreenSnapshot } from '../../backend/src/services/v2-snapshots.js'
import { activateV2Participant, executeV2ParticipantOnboardingCommand, readV2ParticipantSnapshot } from '../../backend/src/services/v2-participant-onboarding.js'
import { eventProgramPreset } from '../../frontend/src/pages/admin/program-catalog.js'

const NOW = new Date('2026-09-17T07:00:00Z'), MIGRATIONS = path.join(BACKEND_ROOT, 'migrations')
describe('D-108 protected entry, staff and independent candidates', () => {
  let directory: string, secret: string, database: ReturnType<typeof openDatabase>, serial = 0
  const state = () => readV2AdminSnapshot(database, ['STAGE_CONTROLLER'], NOW)
  const roster = [
    { displayName: '合成同名', studentNumber: '26000001' },
    { displayName: '合成同名', studentNumber: '26000002' },
    { displayName: '工作人员01', studentNumber: '98000001', accountType: 'STAFF' },
  ]
  function create(records = roster) {
    importProtectedRoster(database, { schemaVersion: 1, sourceSha256: 'b'.repeat(64), records },
      { migrationsPath: MIGRATIONS, runtimeSecretPath: secret, nfcMapPath: path.join(directory, 'private-map.csv'), now: () => NOW })
  }
  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sysu-d108-test-')); secret = path.join(directory, 'private.json'); database = openDatabase(path.join(directory, 'test.sqlite')) })
  afterEach(() => { database.close(); fs.rmSync(directory, { recursive: true, force: true }) })
  const key = () => `d108-test-${++serial}`
  function login(record = roster[0]!, extra = {}) {
    return activateV2Participant(database, readCredentialContext(secret), { protocolVersion: '2', resetEpoch: 1,
      idempotencyKey: key(), method: 'ASSISTED_STUDENT', displayName: record.displayName, studentNumber: record.studentNumber, ...extra }, NOW)
  }
  function participant(id: string, command: string, fields: Record<string, unknown> = {}, at = NOW) {
    const own = readV2ParticipantSnapshot(database, id, at)
    return executeV2ParticipantOnboardingCommand(database, id, { protocolVersion: '2', resetEpoch: 1,
      idempotencyKey: key(), expectedParticipantRevision: own.participant.participantRevision, command, ...fields }, at)
  }
  function control(command: string, fields: Record<string, unknown> = {}) {
    const current = state()
    const interactionOnly = ['OPEN_BUZZER', 'OPEN_AUDIENCE_VOTE', 'REVEAL_AUDIENCE_VOTE', 'CLOSE_LIVE_INTERACTION'].includes(command)
    return executeV2RuntimeCommand(database, { roles: ['STAGE_CONTROLLER'], sessionShortId: 'd108-test-admin', requestId: key() }, {
      protocolVersion: '2', resetEpoch: 1, idempotencyKey: key(), command,
      ...(interactionOnly ? { expectedInteractionRevision: current.interaction.interactionRevision, confirmed: true }
        : { expectedRunRevision: current.runtime.runRevision }),
      ...(['START', 'SET_MODE', 'UPDATE_PROGRAM_CATALOG', 'SET_PROGRAM', 'SET_SCENE', 'COMPLETE'].includes(command) ? { confirmed: true } : {}),
      ...(['UPDATE_PROGRAM_CATALOG', 'SET_PROGRAM'].includes(command) ? { expectedInteractionRevision: current.interaction.interactionRevision } : {}),
      ...(command === 'UPDATE_PROGRAM_CATALOG' ? { expectedCatalogRevision: current.programCatalog.revision } : {}),
      ...(['SET_SCENE', 'COMPLETE'].includes(command) ? { expectedPresentationRevision: current.presentationRevision } : {}),
      ...(command === 'SET_STAGE_MODE' ? { expectedStageRevision: current.stage!.revision } : {}), ...fields,
    }, NOW)
  }
  function start(live = false) {
    control('UPDATE_PROGRAM_CATALOG', { catalog: eventProgramPreset() })
    if (live) control('SET_MODE', { targetMode: 'LIVE' })
    control('START')
    if (live) {
      const current = state()
      executeV2RuntimeCommand(database, { roles: ['STAGE_CONTROLLER'], sessionShortId: 'd108-admin', requestId: key() }, {
        protocolVersion: '2', resetEpoch: 1, idempotencyKey: key(), command: 'ADVANCE', confirmed: true,
        expectedRunRevision: current.runtime.runRevision, expectedPresentationRevision: current.presentationRevision, overrideReadinessWarnings: true,
      }, NOW)
    } else control('SET_SCENE', { targetScene: 'PROGRAM_SUPPORT' })
    control('SET_PROGRAM', { programId: 'event2026-01' })
  }
  function admit(index: number) { const result = login(roster[index]!); participant(result.session.identityId, 'LOCK_COLOR', { colorTemperatureKelvin: 6500 }); return result.session.identityId }

  it('separates same names, rejects forged roles and credentials, and restores balance and locked colour', () => {
    create(); const first = admit(0), second = admit(1), staff = admit(2)
    expect(first).not.toBe(second)
    expect(() => login({ displayName: '合成同名', studentNumber: '26000009' })).toThrow()
    expect(() => login(roster[0], { accountType: 'STAFF', powerBalance: 100 })).toThrow()
    start(); const cost = state().currentProgram!.giftCatalog.find(g => g.id === 'gift-glimmer')!.powerCost
    participant(staff, 'SEND_GIFT', { programId: 'event2026-01', giftId: 'gift-glimmer', quantity: 2 })
    const restored = login(roster[2]!)
    expect(restored.session.identityId).toBe(staff)
    expect(readV2ParticipantSnapshot(database, staff, NOW).participant).toMatchObject({ accountType: 'STAFF', powerBalance: 100-cost*2, displayColor: expect.any(String), onboardingState: 'ADMITTED' })
    expect(state().currentProgram!.heat).toBe(0)
    participant(first, 'SEND_GIFT', { programId: 'event2026-01', giftId: 'gift-glimmer', quantity: 2 })
    expect(state().currentProgram!.heat).toBe(cost*2)
    expect(database.prepare('SELECT score_eligible FROM v2_gift_transactions ORDER BY rowid').pluck().all()).toEqual([0,0,1,1])
    expect(JSON.stringify(readV2ScreenSnapshot(database, NOW))).not.toMatch(/accountType|STAFF|98000001|26000001|合成同名/)
    expect(verifyV2Foundation(database, { migrationsPath: MIGRATIONS, manifestPath: secret, participantCount: 3 }).issues).toEqual([])
    control('SET_STAGE_MODE', { mode: 'HOST' })
    expect(readV2ParticipantSnapshot(database, first, NOW).participant.allowedActions).not.toContain('SEND_GIFT')
    expect(() => participant(first, 'SEND_GIFT', { programId: 'event2026-01', giftId: 'gift-glimmer' })).toThrow()
    expect(state().currentProgram!.heat).toBe(cost*2)
  })

  it('opens independent candidates with no draw, freezes choices, enforces staff exclusion and reveals once', () => {
    create(); const student = admit(0), staff = admit(2); start()
    const segments = state().programs.filter(p => p.kind === 'INTERLUDE')
    control('SET_PROGRAM', { programId: segments[0]!.id })
    control('OPEN_BUZZER', { segmentCode: 'A', prompt: '合成问题' })
    expect(readV2ParticipantSnapshot(database, staff, NOW).participant.allowedActions).not.toContain('BUZZ_IN')
    expect(() => participant(staff, 'BUZZ_IN', {}, new Date(+NOW + 4000))).toThrow()
    control('CLOSE_LIVE_INTERACTION')
    control('SET_PROGRAM', { programId: segments[1]!.id })
    expect(() => control('OPEN_AUDIENCE_VOTE', { prompt: '谁是卧底', candidates: ['只有一位'] })).toThrow()
    control('OPEN_AUDIENCE_VOTE', { prompt: '谁是卧底', candidates: ['1号选手', '阿星', '3号选手'] })
    const candidates = state().liveInteraction.voteCandidates as Array<{candidateId: string; displayLabel: string; voteCount: number|null}>
    expect(database.prepare('SELECT COUNT(*) FROM v2_raffle_draws').pluck().get()).toBe(0)
    expect(candidates.map(c => c.displayLabel)).toEqual(['1号选手', '阿星', '3号选手'])
    expect(() => control('OPEN_AUDIENCE_VOTE', { prompt: '改题', candidates: ['甲', '乙'] })).toThrow()
    expect(() => participant(staff, 'CAST_AUDIENCE_VOTE', { candidateId: candidates[0]!.candidateId })).toThrow()
    expect(() => participant(student, 'CAST_AUDIENCE_VOTE', { candidateId: 'stale-candidate' })).toThrow()
    participant(student, 'CAST_AUDIENCE_VOTE', { candidateId: candidates[1]!.candidateId })
    expect(() => participant(student, 'CAST_AUDIENCE_VOTE', { candidateId: candidates[0]!.candidateId })).toThrow()
    expect(readV2ScreenSnapshot(database, NOW).liveInteraction.voteCandidates.every(c => c.voteCount === null)).toBe(true)
    control('REVEAL_AUDIENCE_VOTE'); expect(state().liveInteraction.voteCandidates.map(c => c.voteCount)).toEqual([0,1,0])
    control('CLOSE_LIVE_INTERACTION'); control('SET_PROGRAM', { programId: segments[2]!.id })
    expect(() => control('OPEN_BUZZER', { segmentCode: 'C', prompt: '旧客户端命令' })).toThrow()
    expect(() => participant(student, 'BUZZ_IN', {}, new Date(+NOW + 4000))).toThrow()
  })

  it('completes directly from programme stage and rejects subsequent writes without cooperative-light participation', () => {
    create(); const id = admit(0); start(true)
    const result = control('COMPLETE', { overrideReadinessWarnings: false })
    expect(result.runtime.status).toBe('COMPLETED')
    expect(database.prepare('SELECT COUNT(*) FROM v2_participant_states WHERE cooperative_light_at IS NOT NULL').pluck().get()).toBe(0)
    expect(() => participant(id, 'POST_BARRAGE', { text: '结束后的新消息' })).toThrow()
    expect(readV2ParticipantSnapshot(database, id, NOW).participant.allowedActions).toEqual([])
  })

  it('upgrades a populated schema-21 database with verified backup, rolls back a failed commit and retains old transactions', async () => {
    create(roster.slice(0,2)); const id=admit(0); start()
    participant(id,'SEND_GIFT',{programId:'event2026-01',giftId:'gift-beacon',quantity:2})
    const original=database, legacy=openDatabase(path.join(directory,'schema21.sqlite'))
    migrateDatabase(legacy,MIGRATIONS,()=>NOW,21)
    legacy.pragma('foreign_keys = OFF')
    legacy.prepare('ATTACH DATABASE ? AS retained').run(original.name)
    const tables=legacy.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_schema_migrations'").pluck().all() as string[]
    for(const table of tables){
      const columns=(legacy.prepare(`PRAGMA table_info("${table}")`).all() as Array<{name:string}>).map(c=>`"${c.name}"`).join(',')
      legacy.exec(`INSERT OR REPLACE INTO "${table}" (${columns}) SELECT ${columns} FROM retained."${table}"`)
    }
    legacy.exec('DETACH DATABASE retained');legacy.pragma('foreign_keys = ON');original.close();database=legacy
    const options={migrationsPath:MIGRATIONS,manifestPath:secret,participantCount:2,confirmation:V2_CATALOG_UPGRADE_CONFIRMATION,now:()=>NOW,backupPath:path.join(directory,'before21.sqlite')}
    expect(verifyV2Foundation(database,{...options,throughSchemaVersion:21}).ready).toBe(true)
    const facts=()=>['synthetic_identities','v2_identity_slots','v2_participant_states','v2_gift_transactions','v2_runtime_state','v2_domain_events'].map(t=>retainedV21Facts(database.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()))
    const before=facts()
    await expect(upgradeV2EventEntryFrom21To22(database,{...options,beforeCommit:()=>{throw new Error('controlled commit failure')}})).rejects.toThrow('rolled back')
    expect(verifyV2Foundation(database,{...options,throughSchemaVersion:21}).ready).toBe(true)
    expect(facts()).toEqual(before)
    const result=await upgradeV2EventEntryFrom21To22(database,{...options,backupPath:path.join(directory,'before21-retry.sqlite')})
    expect(result).toMatchObject({previousSchemaVersion:21,schemaVersion:23,participantCount:2})
    expect(facts()).toEqual(before)
    expect(database.pragma('foreign_key_check')).toEqual([])
    expect(database.prepare('SELECT score_eligible FROM v2_gift_transactions').pluck().all()).toEqual([1,1])
    expect(verifyV2Foundation(database,options).ready).toBe(true)
  })


  it('reserves 306 roster places and admits 94 independent guests without scoring or voting privileges', () => {
    const records=Array.from({length:306},(_,i)=>({displayName:`合成身份${i+1}`,studentNumber:String(26000001+i),...(i>=256?{accountType:'STAFF'}:{})}))
    create(records)
    const guests=Array.from({length:94},(_,i)=>activateV2Participant(database,readCredentialContext(secret),{protocolVersion:'2',resetEpoch:1,idempotencyKey:key(),method:'GUEST',displayName:`合成来宾${i}`,colorTemperatureKelvin:6500},NOW).session.identityId)
    expect(()=>activateV2Participant(database,readCredentialContext(secret),{protocolVersion:'2',resetEpoch:1,idempotencyKey:key(),method:'GUEST',displayName:'超额来宾',colorTemperatureKelvin:6500},NOW)).toThrow(/名额已满/)
    for(const record of records){const id=login(record).session.identityId;participant(id,'LOCK_COLOR',{colorTemperatureKelvin:6500})}
    expect(readV2ScreenSnapshot(database,NOW).publicStars).toHaveLength(400)
    expect(verifyIdentityDirectory(database,{manifestPath:secret,participantCount:306}).ready).toBe(true)
    start();const id=guests[0]!
    participant(id,'SEND_GIFT',{programId:'event2026-01',giftId:'gift-glimmer',quantity:2})
    expect(state().currentProgram!.heat).toBe(0)
    expect(database.prepare('SELECT score_eligible FROM v2_gift_transactions').pluck().all()).toEqual([0,0])
    expect(readV2ParticipantSnapshot(database,id,NOW).participant.powerBalance).toBeLessThan(100)
    participant(id,'POST_BARRAGE',{text:'今晚真精彩'})
    const segments=state().programs.filter(p=>p.kind==='INTERLUDE')
    control('SET_PROGRAM',{programId:segments[0]!.id});control('OPEN_BUZZER',{segmentCode:'A',prompt:'合成问题'})
    expect(()=>participant(id,'BUZZ_IN',{},new Date(+NOW+4000))).toThrow()
    control('CLOSE_LIVE_INTERACTION');control('SET_PROGRAM',{programId:segments[1]!.id})
    control('OPEN_AUDIENCE_VOTE',{prompt:'谁是卧底',candidates:['1号选手','2号选手']})
    expect(()=>participant(id,'CAST_AUDIENCE_VOTE',{candidateId:state().liveInteraction.voteCandidates[0]!.candidateId})).toThrow()
    expect(verifyV2Foundation(database,{migrationsPath:MIGRATIONS,manifestPath:secret,participantCount:306}).ready).toBe(true)
  },60000)
  it('admits 400 stable stars, keeps 256 + 50 independent identities, and rejects capacity overflow', () => {
    const records = Array.from({length:400}, (_,i) => ({displayName:`合成身份${i+1}`,studentNumber:String(26000001+i), ...(i>=256 && i<306 ? {accountType:'STAFF'} : {})}))
    expect(ProtectedRosterInputSchema.safeParse({schemaVersion:1,sourceSha256:'b'.repeat(64),records:[...records, {displayName:'超额合成',studentNumber:'27000000'}]}).success).toBe(false)
    create(records)
    for (const [index, record] of records.entries()) {
      const id = login(record).session.identityId; participant(id, 'LOCK_COLOR', {colorTemperatureKelvin:6500})
      if (index === 305) expect(readV2ScreenSnapshot(database,NOW).publicStars).toHaveLength(306)
    }
    const before = readV2ScreenSnapshot(database,NOW)
    expect(before.publicStars).toHaveLength(400); expect(before.aggregate.admittedCount).toBe(400)
    expect(database.prepare("SELECT COUNT(*) FROM synthetic_identities WHERE account_type='STAFF'").pluck().get()).toBe(50)
    const first = login(records[0]!).session.identityId
    expect(readV2ParticipantSnapshot(database, first, NOW).publicStars).toHaveLength(400)
    expect(readV2ScreenSnapshot(database,NOW).publicStars).toEqual(before.publicStars)
    expect(verifyIdentityDirectory(database,{manifestPath:secret,participantCount:400}).ready).toBe(true)
    database.prepare("UPDATE synthetic_identities SET account_type='STUDENT' WHERE account_type='STAFF'").run()
    expect(verifyIdentityDirectory(database,{manifestPath:secret,participantCount:400}).ready).toBe(false)
  }, 60000)
})
