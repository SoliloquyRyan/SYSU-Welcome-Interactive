import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import {pathToFileURL} from 'node:url'
import {openDatabase} from '../../../backend/src/db/open-database.js'
import {importProtectedRoster} from '../../../backend/src/db/protected-roster.js'
import {loadConfig} from '../../../backend/src/config.js'
import {buildApp} from '../../../backend/src/app.js'

async function port() {
  for (;;) {
    const server=net.createServer(); await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
    const value=(server.address() as net.AddressInfo).port
    await new Promise<void>(resolve=>server.close(()=>resolve()))
    if(value>10081)return value
  }
}

/** Generated identities only; never reads or exports the actual student roster. */
export async function startProtectedEventStack() {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sysu-d109-test-'))
  const databasePath=path.join(root,'event.sqlite'), manifestPath=path.join(root,'private.json')
  const records=Array.from({length:306},(_,i)=>({displayName:i<256 ? `合成学生${i+1}` : `工作人员${String(i-255).padStart(2,'0')}`,
    studentNumber:String(81000000+i),accountType:i<256 ? 'STUDENT' : 'STAFF'}))
  const db=openDatabase(databasePath)
  try { importProtectedRoster(db,{schemaVersion:1,sourceSha256:'d'.repeat(64),records},
    {migrationsPath:path.resolve('backend/migrations'),runtimeSecretPath:manifestPath,nfcMapPath:path.join(root,'private-map.csv')}) }
  finally { db.close() }
  const secret=JSON.parse(await fs.readFile(manifestPath,'utf8'))
  const frontendPort=await port(),backendPort=await port(),baseURL=`http://127.0.0.1:${frontendPort}`,backendOrigin=`http://127.0.0.1:${backendPort}`
  const app=await buildApp({config:loadConfig({DEMO_BACKEND_PORT:String(backendPort),DEMO_DATABASE_PATH:databasePath,
    DEMO_SEED_MANIFEST_PATH:manifestPath,DEMO_SEED_PARTICIPANT_COUNT:'306',DEMO_ALLOWED_ORIGINS:baseURL,DEMO_LOG_LEVEL:'silent'})})
  await app.listen({host:'127.0.0.1',port:backendPort})
  const viteUrl=pathToFileURL(path.resolve('frontend/node_modules/vite/dist/node/index.js')).href
  const vueUrl=pathToFileURL(path.resolve('frontend/node_modules/@vitejs/plugin-vue/dist/index.mjs')).href
  const [{createServer},{default:vue}]=await Promise.all([import(viteUrl),import(vueUrl)])
  const vite=await createServer({root:path.resolve('frontend'),configFile:false,logLevel:'silent',plugins:[vue()],appType:'spa',
    define:{'import.meta.env.VITE_DATA_PROFILE':JSON.stringify('PROTECTED')},
    server:{host:'127.0.0.1',port:frontendPort,strictPort:true,proxy:{'/api':{target:backendOrigin,changeOrigin:false,xfwd:true},'/ws':{target:backendOrigin.replace('http:','ws:'),ws:true,changeOrigin:false}},
      fs:{deny:['.env','.env.*','**/.git/**','**/.data/**','**/*.sqlite','**/*.db']}}})
  await vite.listen()
  return {baseURL,backendOrigin,records,databasePath,manifestPath,credentials:{username:secret.admin.username as string,password:secret.admin.password as string},
    async stop(){await vite.close();await app.close();if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('sysu-d109-test-'))throw Error('TEMP_PATH');await fs.rm(root,{recursive:true,force:true})}}
}
