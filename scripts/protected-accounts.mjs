// D-114: local, read-only source verification. Never log credentials or touch a server.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createHash, createHmac, randomInt } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.resolve(repo, '../.welcome-formal/d108-20260917')
const root = path.resolve(repo, '../.welcome-test-accounts/D114')
const args = process.argv.slice(2).filter(x => x !== '--')
const mode = args.shift()
const check = (ok, code) => { if (!ok) throw Error(code) }
export function readCsv(text) {
  const rows = []; let row = [], value = '', quoted = false
  for (let i = 0; i < text.replace(/^\uFEFF/, '').length; i++) {
    const s = text.replace(/^\uFEFF/, ''), c = s[i]
    if (c === '"') { if (quoted && s[i+1] === '"') { value += '"'; i++ } else quoted = !quoted }
    else if (c === ',' && !quoted) { row.push(value); value = '' }
    else if (c === '\n' && !quoted) { row.push(value.replace(/\r$/, '')); rows.push(row); row=[]; value='' }
    else value += c
  }
  if (row.length || value) { row.push(value.replace(/\r$/, '')); rows.push(row) }
  check(!quoted && rows.length > 1, 'CSV_INVALID')
  return rows.slice(1).map(r => Object.fromEntries(rows[0].map((h,i)=>[h,r[i] ?? ''])))
}
function csv(headers, rows) {
  const cell = x => '"' + String(/^[=+@-]/.test(String(x)) ? "'"+x : x).replaceAll('"', '""') + '"'
  return '\uFEFF' + [headers, ...rows].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n'
}
function protectedDirectory(dir) {
  check(process.platform === 'win32', 'WINDOWS_ACL_REQUIRED')
  check(dir === root || dir.startsWith(root + path.sep), 'OUTPUT_OUTSIDE_PROTECTED_ROOT')
  // Set the parent ACL before writing any private content. Never follow junctions.
  for (let p=path.dirname(dir); p!==path.dirname(p); p=path.dirname(p)) {
    if(fs.existsSync(p)) check(!fs.lstatSync(p).isSymbolicLink(), 'SYMLINK_REJECTED')
  }
  if(fs.existsSync(dir)) check(!fs.lstatSync(dir).isSymbolicLink(), 'SYMLINK_REJECTED')
  fs.mkdirSync(dir, {recursive:true})
  const user = `${process.env.USERDOMAIN ?? ''}\\${process.env.USERNAME ?? ''}`
  const aclOutput = execFileSync('icacls.exe', [dir, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)(F)`, 'SYSTEM:(OI)(CI)(F)', '/c'], { encoding: 'utf8' })
  check(aclOutput.includes('Successfully processed 1 files'), 'ACL_SET_FAILED')
  const verifyOutput = execFileSync('icacls.exe', [dir], { encoding: 'utf8' })
  check(verifyOutput.includes('SYSTEM') && verifyOutput.includes(process.env.USERNAME ?? ''), 'ACL_VERIFY_FAILED')
}
function write(dir,name,content) { fs.writeFileSync(path.join(dir,name),content,{encoding:'utf8',flag:'wx',mode:0o600}) }
function manifest(dir) {
  const lines=fs.readdirSync(dir).filter(n=>n!=='MANIFEST-SHA256.txt').sort().filter(n=>fs.statSync(path.join(dir,n)).isFile()).map(n=>createHash('sha256').update(fs.readFileSync(path.join(dir,n))).digest('hex')+'  '+n)
  write(dir,'MANIFEST-SHA256.txt',`Generated: ${new Date().toISOString()}\n${lines.join('\n')}\n`)
}
function exportAll() {
  check(args.length===0,'UNEXPECTED_ARGUMENT')
  check(!fs.existsSync(path.join(root,'MANIFEST-SHA256.txt')),'REFUSE_OVERWRITE')
  const db=new DatabaseSync(path.join(source,'formal.sqlite'),{readOnly:true})
  try {
    const identities=db.prepare('SELECT id,display_name,student_number_digest,account_type FROM synthetic_identities WHERE enabled=1 ORDER BY seed_index').all()
    const admin=db.prepare('SELECT id,username,password_digest FROM admin_accounts WHERE enabled=1').all()
    const records=JSON.parse(fs.readFileSync(path.join(source,'roster-input.json'),'utf8')).records
    const secret=JSON.parse(fs.readFileSync(path.join(source,'runtime-secret.json'),'utf8'))
    const staff=readCsv(fs.readFileSync(path.join(source,'工作人员账号分发清单.csv'),'utf8'))
    const digest=(purpose,id,value)=>createHmac('sha256',Buffer.from(secret.credentialPepper,'base64url')).update(`${purpose}\0${id}\0${value}`).digest('hex')
    check(identities.length===306 && records.length===306 && staff.length===50 && admin.length===1,'COUNT_MISMATCH')
    check(admin[0].username==='event-admin' && digest('admin-password',admin[0].id,secret.admin.password)===admin[0].password_digest,'ADMIN_MISMATCH')
    const joined=identities.map(id=>{
      const r=records.find(r=>r.displayName===id.display_name && /^\d{8}$/.test(r.studentNumber) && digest('student-number',id.id,r.studentNumber)===id.student_number_digest)
      check(Boolean(r),'IDENTITY_CREDENTIAL_MISMATCH'); return {...r, type:id.account_type}
    })
    const students=joined.filter(r=>r.type==='STUDENT'), workers=joined.filter(r=>r.type==='STAFF')
    check(students.length===256 && workers.length===50 && new Set(joined.map(r=>r.studentNumber)).size===306,'IDENTITY_COUNT_MISMATCH')
    check(workers.every(r=>staff.some(s=>s['登录姓名']===r.displayName && s['8位工作口令']===r.studentNumber)),'STAFF_CREDENTIAL_MISMATCH')
    protectedDirectory(root)
    write(root,'学生核验清单.csv',csv(['姓名','8位学号','身份类型'],students.map(r=>[r.displayName,r.studentNumber,'学生'])))
    write(root,'工作人员账号.csv',csv(['登录姓名','8位工作口令','初始动力','手机网址','权限说明'],staff.map(r=>[r['登录姓名'],r['8位工作口令'],100,'https://sysuzgxytj.top/welcomeparty/welcome','仅弹幕与礼物，不计正式排行，不能抢答、投票或进入后台'])))
    write(root,'游客测试说明.csv',csv(['建议昵称','创建方式','权限'],['测试来宾甲','测试来宾乙','测试来宾丙'].map(n=>[n,'游客参与：昵称＋星色；未预建账号','仅应援，不计正式排行，不能抢答、投票或进入后台'])))
    write(root,'后台账号说明.md',`# 后台账号\n\n用户名：event-admin\n入口：https://sysuzgxytj.top/welcomeparty/admin\n密码保管位置：${path.join(source,'负责人入口与保管说明.md')}\n本文件不复制密码。当前只确认一个后台账号，不虚构备用账号。\n`)
    write(root,'README-先看.md',`# D-114 本机测试资料\n\n学生 256 人、工作人员 50 人、后台 1 个。已对本机正式资料逐项校验凭据摘要；未登录任何真实身份、未访问或改写线上数据。源资料为 D-108 保留名单，请在正式测试前核对主控当前状态。\n\n学生在姓名、8 位学号处填写本人的核验信息；工作人员在相同字段填写工作人员名称与工作口令。学生可以投票和抢答，工作人员/游客只能送礼和发弹幕，初始100动力仅发放一次，应援不计正式排行。\n\n游客通过昵称与星色即时创建，不预占名额。表演者不另建账号。CSV用Excel导入时将号码列设为文本，保留前导零。\n\n抽样：在项目根执行 pnpm accounts:select -- --student 1 --staff 2 --guest 2。只生成本机抽样文件，不自动登录。\n\n文件仅当前Windows用户和SYSTEM可读，勿放入PPT、公开网页或公共备份。\n`)
    manifest(root); console.log('ACCOUNTS_EXPORT_OK students=256 staff=50 admins=1 guestsCreated=0; output='+root)
  } finally {db.close()}
}
function select() {
  const options={student:1,staff:2,guest:2}
  for(let i=0;i<args.length;i+=2){ const key=args[i].replace(/^--/,''); check(Object.hasOwn(options,key) && /^\d+$/.test(args[i+1]??''),'INVALID_COUNT'); options[key]=Number(args[i+1]) }
  check(options.student<=256 && options.staff<=50 && options.guest<=5,'COUNT_OUT_OF_RANGE')
  const students=readCsv(fs.readFileSync(path.join(root,'学生核验清单.csv'),'utf8'))
  const staff=readCsv(fs.readFileSync(path.join(root,'工作人员账号.csv'),'utf8'))
  const pick=(rows,n)=>{const a=[...rows]; for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,n)}
  const selected=[...pick(students,options.student).map(r=>['学生',r['姓名'],r['8位学号'],'姓名＋学号＋星色']),...pick(staff,options.staff).map(r=>['工作人员',r['登录姓名'],r['8位工作口令'],'姓名栏填工作人员名称，学号栏填口令']),...Array.from({length:options.guest},(_,i)=>['游客',`测试来宾${i+1}`,'','未创建；现场填昵称与星色'])]
  const dir=path.join(root,'samples',new Date().toISOString().replace(/[:.]/g,'-'))
  protectedDirectory(dir);write(dir,'抽样测试.csv',csv(['身份类型','登录姓名或昵称','8位核验号码','方式'],selected));manifest(dir)
  console.log(`ACCOUNTS_SELECT_OK student=${options.student} staff=${options.staff} guestSuggestions=${options.guest} guestsCreated=0; output=${dir}`)
}
try { check(mode==='export'||mode==='select','USE_EXPORT_OR_SELECT'); mode==='export'?exportAll():select() }
catch (error) { const code=/^[A-Z_]+$/.test(error.message)?error.message:'LOCAL_IO_OR_ACL_FAILED'; console.error('账号工具失败：'+code+'。未覆盖原资料，未输出个人信息。'); console.error('diagnostic_name='+(error?.name ?? 'unknown')); process.exitCode=1 }
