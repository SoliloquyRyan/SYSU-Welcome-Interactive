import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {randomUUID} from 'node:crypto'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {buildApp} from '../../backend/src/app.js'
import {loadConfig,BACKEND_ROOT} from '../../backend/src/config.js'
import {openDatabase,type SqliteDatabase} from '../../backend/src/db/open-database.js'
import {importProtectedRoster} from '../../backend/src/db/protected-roster.js'

let root:string,app:Awaited<ReturnType<typeof buildApp>>,db:SqliteDatabase,adminCookie:string,config:ReturnType<typeof loadConfig>
const headers={host:'127.0.0.1:18490',origin:'http://127.0.0.1:18491'}
const cookies=(r:any)=>{const value=r.headers['set-cookie'];return (Array.isArray(value)?value:[value]).filter(Boolean).map((c:string)=>c.split(';')[0]).join('; ')}
const post=(url:string,payload:unknown,cookie='')=>app.inject({method:'POST',url,headers:{...headers,cookie},payload})
const get=(url:string,cookie='')=>app.inject({method:'GET',url,headers:{...headers,cookie}})
const guest=(extra={})=>({protocolVersion:'2',resetEpoch:1,idempotencyKey:randomUUID(),method:'GUEST',displayName:'合成来宾',colorTemperatureKelvin:9000,...extra})
beforeEach(async()=>{
 root=fs.mkdtempSync(path.join(os.tmpdir(),'sysu-d109-api-'));const manifestPath=path.join(root,'private.json')
 db=openDatabase(path.join(root,'event.sqlite'));importProtectedRoster(db,{schemaVersion:1,sourceSha256:'e'.repeat(64),records:[{displayName:'合成学生',studentNumber:'81000001'},{displayName:'工作人员01',studentNumber:'98000001',accountType:'STAFF'}]},
  {migrationsPath:path.join(BACKEND_ROOT,'migrations'),runtimeSecretPath:manifestPath,nfcMapPath:path.join(root,'map.csv')})
 config=loadConfig({DEMO_BACKEND_PORT:'18490',DEMO_DATABASE_PATH:db.name,DEMO_SEED_MANIFEST_PATH:manifestPath,DEMO_SEED_PARTICIPANT_COUNT:'2',DEMO_ALLOWED_ORIGINS:headers.origin,DEMO_LOG_LEVEL:'silent'})
 app=await buildApp({config});const secret=JSON.parse(fs.readFileSync(manifestPath,'utf8'));const login=await post('/api/v2/admin/login',{username:secret.admin.username,password:secret.admin.password});expect(login.statusCode).toBe(200);adminCookie=cookies(login)
})
afterEach(async()=>{vi.restoreAllMocks();await app?.close();db?.close();fs.rmSync(root,{recursive:true,force:true})})
it('admits 94 guests on one network, restores with the persistent cookie after session expiry and reserves students',async()=>{
 const first=await post('/api/v2/participant/activate',guest());expect(first.statusCode).toBe(200)
 const recovery=cookies(first).split('; ').find(c=>c.startsWith('sysu_welcome_guest='))!
 expect(recovery).toBeTruthy();expect(JSON.stringify(first.json())).not.toContain('recovery_digest')
 for(let i=1;i<94;i++)expect((await post('/api/v2/participant/activate',guest({displayName:`合成游客${i}`}))).statusCode).toBe(200)
 expect((await post('/api/v2/participant/activate',guest())).statusCode).toBe(409)
 const restored=await get('/api/v2/participant/snapshot',recovery);expect(restored.statusCode).toBe(200);expect(restored.json().participantStreamId).toBe(first.json().snapshot.participantStreamId)
 const student=await post('/api/v2/participant/activate',{...guest(),method:'ASSISTED_STUDENT',displayName:'合成学生',studentNumber:'81000001'},recovery)
 expect(student.statusCode).toBe(200);expect(student.json().snapshot.participant.accountType).toBe('STUDENT');expect(cookies(student)).toContain('sysu_welcome_guest=')
 await app.close();app=await buildApp({config});expect((await get('/api/v2/participant/snapshot',recovery)).statusCode).toBe(200)
 const counts=(await get('/api/v2/admin/snapshot',adminCookie)).json().accountCounts;expect(counts.find((c:any)=>c.kind==='GUEST').admitted).toBe(94)
})
it('blocks concurrent admissions during archive and replays a lost reset response across restart without another reset',async()=>{
 const first=await post('/api/v2/participant/activate',guest());expect(first.statusCode).toBe(200);const guestCookie=cookies(first)
 let started!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>started=r),gate=new Promise<void>(r=>release=r)
 const proto=Object.getPrototypeOf(db),original=proto.backup
 const spy=vi.spyOn(proto,'backup').mockImplementation(async function(this:SqliteDatabase,...args:unknown[]){started();await gate;return original.apply(this,args)})
 const request={protocolVersion:'2',resetEpoch:1,idempotencyKey:randomUUID(),command:'RESET_FORMAL_ROUND',expectedRunRevision:0,confirmation:'重新开场'}
 const reset=post('/api/v2/admin/commands',request,adminCookie).then(r=>r)
 await entered;const blocked=await post('/api/v2/participant/activate',guest());expect(blocked.statusCode).toBe(503)
 release();const result=await reset;spy.mockRestore();expect(result.statusCode).toBe(200);expect(result.json().resetEpoch).toBe(2)
 const replay=await post('/api/v2/admin/commands',request,adminCookie);expect(replay.statusCode).toBe(200);expect(replay.json().replayed).toBe(true)
 expect((await get('/api/v2/participant/snapshot',guestCookie)).statusCode).toBe(401)
 await app.close();app=await buildApp({config});const restarted=await post('/api/v2/admin/commands',request,adminCookie);expect(restarted.statusCode).toBe(200);expect(restarted.json().replayed).toBe(true)
 expect(db.prepare('SELECT COUNT(*) FROM v2_round_archives').pluck().get()).toBe(1);expect(db.prepare('SELECT reset_epoch FROM v2_runtime_state').pluck().get()).toBe(2)
 expect(db.prepare('SELECT COUNT(*) FROM v2_guest_credentials').pluck().get()).toBe(0)
})
