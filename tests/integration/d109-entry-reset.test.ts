import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {BACKEND_ROOT} from '../../backend/src/config.js'
import {openDatabase} from '../../backend/src/db/open-database.js'
import {importProtectedRoster} from '../../backend/src/db/protected-roster.js'
import {readCredentialContext, fingerprintProtectedDirectoryDatabase} from '../../backend/src/db/seed.js'
import {migrateDatabase} from '../../backend/src/db/migrate.js'
import {verifyV2Foundation, upgradeV2GuestsFrom22To23, V2_CATALOG_UPGRADE_CONFIRMATION} from '../../backend/src/db/v2-foundation.js'
import {activateV2Participant, restoreGuestSession, executeV2ParticipantOnboardingCommand} from '../../backend/src/services/v2-participant-onboarding.js'
import {archiveAndResetRound} from '../../backend/src/services/v2-formal-reset.js'

const NOW = new Date('2026-09-17T07:00:00Z'), migrationsPath = path.join(BACKEND_ROOT, 'migrations')
describe('D-109 atomic entry, independent guest quota and archived rounds', () => {
  let dir: string, db: ReturnType<typeof openDatabase>, manifestPath: string, serial = 0
  const key = () => `d109-test-key-${++serial}`
  beforeEach(() => {
    dir=fs.mkdtempSync(path.join(os.tmpdir(),'sysu-d109-'));manifestPath=path.join(dir,'private.json');db=openDatabase(path.join(dir,'test.sqlite'))
    importProtectedRoster(db,{schemaVersion:1,sourceSha256:'a'.repeat(64),records:[{displayName:'合成学生',studentNumber:'26000001'},{displayName:'工作人员01',studentNumber:'98000001',accountType:'STAFF'}]},
      {migrationsPath,runtimeSecretPath:manifestPath,nfcMapPath:path.join(dir,'map.csv'),now:()=>NOW})
  })
  afterEach(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true})})
  const enter=(fields={}, secret?: string)=>activateV2Participant(db,readCredentialContext(manifestPath),{protocolVersion:'2',resetEpoch:1,idempotencyKey:key(),method:'ASSISTED_STUDENT',displayName:'合成学生',studentNumber:'26000001',colorTemperatureKelvin:5000,...fields},NOW,secret)
  const guest=(fields={},secret?:string)=>activateV2Participant(db,readCredentialContext(manifestPath),{protocolVersion:'2',resetEpoch:1,idempotencyKey:key(),method:'GUEST',displayName:'合成来宾',colorTemperatureKelvin:5000,...fields},NOW,secret)
  const resetRequest=()=>({protocolVersion:'2',resetEpoch:1,idempotencyKey:key(),command:'RESET_FORMAL_ROUND',expectedRunRevision:0,confirmation:'重新开场'})
  const resetOptions=()=>({roles:['ALL'],actorId:'test-admin',migrationsPath,manifestPath,participantCount:2,now:NOW})
  it('commits colour with entry, rolls back invalid credentials and keeps existing colour and balance',()=>{
    expect(()=>enter({studentNumber:'26000099'})).toThrow()
    expect(db.prepare('SELECT COUNT(*) FROM v2_participant_states').pluck().get()).toBe(0)
    const first=enter();expect(first.admissionCreated).toBe(true);expect(first.snapshot.participant.onboardingState).toBe('ADMITTED')
    const again=enter({colorTemperatureKelvin:12000});expect(again.snapshot.participant.displayColor).toBe(first.snapshot.participant.displayColor)
    expect(again.admissionCreated).toBe(false);expect(again.snapshot.participant.powerBalance).toBe(100)
    expect(db.prepare('SELECT COUNT(*) FROM v2_public_stars').pluck().get()).toBe(1)
  })
  it('rolls back identity activation and quota when colour insertion fails',()=>{
    db.exec("CREATE TRIGGER test_reject_star BEFORE INSERT ON v2_public_stars BEGIN SELECT RAISE(ABORT,'injected star failure'); END")
    expect(()=>enter()).toThrow('injected star failure')
    expect(()=>guest()).toThrow('injected star failure')
    expect(db.prepare('SELECT COUNT(*) FROM v2_participant_states').pluck().get()).toBe(0)
    expect(db.prepare('SELECT COUNT(*) FROM v2_reward_ledger').pluck().get()).toBe(0)
    expect(db.prepare('SELECT COUNT(*) FROM v2_guest_credentials').pluck().get()).toBe(0)
    expect(db.prepare('SELECT COUNT(*) FROM v2_identity_slots WHERE reserved_reset_epoch IS NOT NULL').pluck().get()).toBe(0)
  })
  it('restores guests, handles lost responses, caps at 94 and keeps the fixed roster fingerprint',()=>{
    const fingerprint=fingerprintProtectedDirectoryDatabase(db), idempotencyKey=key()
    const first=guest({idempotencyKey});expect(first.snapshot.participant.accountType).toBe('GUEST')
    const retry=guest({idempotencyKey});expect(retry.session.identityId).toBe(first.session.identityId)
    const again=guest({displayName:'另一个昵称',colorTemperatureKelvin:9000},first.guestRecoverySecret)
    expect(again.session.identityId).toBe(first.session.identityId);expect(again.snapshot.participant.displayColor).toBe(first.snapshot.participant.displayColor)
    for(let i=1;i<94;i++) guest({displayName:`来宾${i}`})
    expect(()=>guest()).toThrow(/名额已满/)
    expect(guest({},first.guestRecoverySecret).session.identityId).toBe(first.session.identityId)
    expect(enter().snapshot.participant.accountType).toBe('STUDENT')
    expect(fingerprintProtectedDirectoryDatabase(db)).toBe(fingerprint)
    expect(verifyV2Foundation(db,{migrationsPath,manifestPath,participantCount:2}).issues).toEqual([])
    expect(restoreGuestSession(db,first.guestRecoverySecret,NOW)?.session.identityId).toBe(first.session.identityId)
  })
  it('archives then resets once, retains drafts and rejects old-round credentials and requests',async()=>{
    const first=enter(),visitor=guest(), fingerprint=fingerprintProtectedDirectoryDatabase(db)
    db.prepare("UPDATE v2_awards SET entries_json=?,confirmed=1 WHERE id='photography'").run(JSON.stringify([{name:'合成获奖者'}]))
    const request=resetRequest(),result=await archiveAndResetRound(db,request,resetOptions())
    expect(result.resetEpoch).toBe(2);expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect((await archiveAndResetRound(db,request,resetOptions())).replayed).toBe(true)
    expect(db.prepare('SELECT COUNT(*) FROM v2_public_stars').pluck().get()).toBe(0)
    expect(db.prepare("SELECT COUNT(*) FROM synthetic_identities WHERE account_kind='GUEST'").pluck().get()).toBe(0)
    expect(fingerprintProtectedDirectoryDatabase(db)).toBe(fingerprint)
    expect(db.prepare("SELECT confirmed FROM v2_awards WHERE id='photography'").pluck().get()).toBe(1)
    expect(restoreGuestSession(db,visitor.guestRecoverySecret,NOW)).toBe(null)
    expect(()=>executeV2ParticipantOnboardingCommand(db,first.session.identityId,{protocolVersion:'2',resetEpoch:1,idempotencyKey:key(),command:'START_STAR',expectedParticipantRevision:2},NOW)).toThrow()
    const archive=db.prepare('SELECT archive_filename FROM v2_round_archives').pluck().get() as string
    const retained=openDatabase(path.join(dir,'round-archives',archive));expect(retained.prepare('SELECT COUNT(*) FROM v2_public_stars').pluck().get()).toBe(2);retained.close()
  })
  it('rejects permissions and running reset; rolls back a failed archive or commit',async()=>{
    enter();const before=JSON.stringify(db.prepare('SELECT * FROM v2_runtime_state').get())
    await expect(archiveAndResetRound(db,resetRequest(),{...resetOptions(),roles:['STAGE_CONTROLLER']})).rejects.toThrow(/权限/)
    db.exec("UPDATE v2_runtime_state SET status='RUNNING',current_scene='ASSEMBLY'");
    await expect(archiveAndResetRound(db,resetRequest(),resetOptions())).rejects.toThrow(/暂停/)
    db.exec("UPDATE v2_runtime_state SET status='READY',current_scene=NULL");
    await expect(archiveAndResetRound(db,{...resetRequest(),expectedRunRevision:99},resetOptions())).rejects.toThrow(/状态已变化/)
    const blocker=path.join(dir,'not-a-directory');fs.writeFileSync(blocker,'x')
    await expect(archiveAndResetRound(db,resetRequest(),{...resetOptions(),archiveDirectory:blocker})).rejects.toThrow()
    await expect(archiveAndResetRound(db,resetRequest(),{...resetOptions(),beforeCommit:()=>{throw new Error('test commit fault')}})).rejects.toThrow('test commit fault')
    expect(JSON.stringify(db.prepare('SELECT * FROM v2_runtime_state').get())).toBe(before)
    expect(db.prepare('SELECT COUNT(*) FROM v2_round_archives').pluck().get()).toBe(0)
  })
  it('retains a completed schema-22 round and its identities across the verified upgrade',async()=>{
    enter();db.exec("UPDATE v2_runtime_state SET mode='LIVE',status='COMPLETED',current_scene='COOPERATIVE_LIGHT',completed_at='2026-09-17T07:00:00.000Z'")
    const original=db,legacy=openDatabase(path.join(dir,'schema22.sqlite'))
    migrateDatabase(legacy,migrationsPath,()=>NOW,22);legacy.pragma('foreign_keys=OFF')
    legacy.prepare('ATTACH DATABASE ? AS retained').run(original.name)
    const tables=legacy.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_schema_migrations'").pluck().all() as string[]
    for(const table of tables){const cols=(legacy.prepare(`PRAGMA table_info("${table}")`).all() as Array<{name:string}>).map(c=>`"${c.name}"`).join(',');legacy.exec(`INSERT OR REPLACE INTO "${table}" (${cols}) SELECT ${cols} FROM retained."${table}"`)}
    legacy.exec('DETACH DATABASE retained');legacy.pragma('foreign_keys=ON');original.close();db=legacy
    const before=db.prepare('SELECT * FROM v2_runtime_state').get(),fingerprint=fingerprintProtectedDirectoryDatabase(db)
    const options={migrationsPath,manifestPath,participantCount:2,confirmation:V2_CATALOG_UPGRADE_CONFIRMATION,now:()=>NOW,backupPath:path.join(dir,'schema22-backup.sqlite')}
    await expect(upgradeV2GuestsFrom22To23(db,{...options,beforeCommit:()=>{throw Error('controlled upgrade failure')}})).rejects.toThrow()
    expect(db.prepare('SELECT MAX(version) FROM _schema_migrations').pluck().get()).toBe(22)
    await upgradeV2GuestsFrom22To23(db,{...options,backupPath:path.join(dir,'schema22-retry.sqlite')})
    expect(db.prepare('SELECT * FROM v2_runtime_state').get()).toEqual(before)
    expect(fingerprintProtectedDirectoryDatabase(db)).toBe(fingerprint)
    expect(db.prepare('SELECT COUNT(*) FROM v2_public_stars').pluck().get()).toBe(1)
    expect(verifyV2Foundation(db,options).ready).toBe(true)
  })

})
