import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const databasePath = path.join(repoRoot, 'backend', '.private', '2026-roster.sqlite')
const secretPath = path.join(
  repoRoot,
  'backend',
  '.private',
  '2026-runtime-secret.json',
)
const nfcMapPath = path.join(
  repoRoot,
  'backend',
  '.private',
  '2026-nfc-map.csv',
)

if (
  !fs.existsSync(databasePath) ||
  !fs.existsSync(secretPath) ||
  !fs.existsSync(nfcMapPath)
) {
  console.error(
    '正式名单库、运行凭据或 NFC 映射不存在；请先按 RUNBOOK 执行 db:roster:import。启动器不会用合成数据代填正式路径。',
  )
  process.exit(1)
}

let profile
try {
  profile = JSON.parse(fs.readFileSync(secretPath, 'utf8'))
} catch {
  console.error('正式运行凭据不可读；启动器已停止。')
  process.exit(1)
}
if (
  profile?.profile !== 'PROTECTED_ROSTER' ||
  !Number.isInteger(profile.participantCount) ||
  profile.participantCount < 1 ||
  profile.participantCount > 300
) {
  console.error('正式运行凭据不是有效的受保护名单配置；启动器已停止。')
  process.exit(1)
}

process.env.DEMO_DATABASE_PATH = databasePath
process.env.DEMO_SEED_MANIFEST_PATH = secretPath
process.env.DEMO_SEED_PARTICIPANT_COUNT = String(profile.participantCount)
process.env.FORMAL_NFC_MAP_PATH = nfcMapPath
process.env.VITE_DATA_PROFILE = 'PROTECTED'
process.env.VITE_SITE_EDITION ??= '2026 迎新现场'
process.env.VITE_SITE_NOTICE ??= '受保护名单 · NFC 匿名入口'
process.env.VITE_SITE_SCOPE ??= '现场局域网 · 正式运行配置'

await import('./dev.mjs')
