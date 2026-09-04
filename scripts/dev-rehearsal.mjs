import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const configuredDirectory = process.env.REHEARSAL_RUNTIME_DIR?.trim()
const inheritedFormalDirectory = process.env.FORMAL_RUNTIME_DIR?.trim()
const defaultRehearsalDirectory = path.join(repositoryRoot, 'backend', '.rehearsal')
const rehearsalDirectory = configuredDirectory
  ? path.resolve(configuredDirectory)
  : defaultRehearsalDirectory

function isInside(parentPath, childPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

if (
  rehearsalDirectory === path.parse(rehearsalDirectory).root ||
  (isInside(repositoryRoot, rehearsalDirectory) &&
    path.normalize(rehearsalDirectory) !== path.normalize(defaultRehearsalDirectory)) ||
  isInside(path.join(repositoryRoot, 'backend', '.private'), rehearsalDirectory) ||
  (inheritedFormalDirectory &&
    isInside(path.resolve(inheritedFormalDirectory), rehearsalDirectory)) ||
  ['2026-roster.sqlite', '2026-runtime-secret.json', '2026-nfc-map.csv'].some(
    (filename) => fs.existsSync(path.join(rehearsalDirectory, filename)),
  )
) {
  console.error(
    'REHEARSAL_RUNTIME_DIR 必须是默认忽略目录或仓库外的新合成目录，且不得位于或包含正式运行资产。',
  )
  process.exit(1)
}

for (const name of [
  'FORMAL_RUNTIME_DIR',
  'FORMAL_DATABASE_PATH',
  'FORMAL_RUNTIME_SECRET_PATH',
  'FORMAL_NFC_MAP_PATH',
  'FORMAL_PUBLIC_ORIGIN',
]) {
  delete process.env[name]
}

process.env.DEMO_DATABASE_PATH = path.join(rehearsalDirectory, 'rehearsal.sqlite')
process.env.DEMO_SEED_MANIFEST_PATH = path.join(
  rehearsalDirectory,
  'rehearsal-seed-manifest.json',
)
process.env.DEMO_SEED_PARTICIPANT_COUNT = '300'
process.env.DEMO_SECURE_COOKIES = '0'
process.env.DEMO_TRUST_LOOPBACK_PROXY = '0'
process.env.VITE_DATA_PROFILE = 'REHEARSAL'
process.env.VITE_SITE_EDITION ??= '2026 迎新合成排练'
process.env.VITE_SITE_NOTICE ??= '纯合成技术目录 · 220 人正式视觉基准'
process.env.VITE_SITE_SCOPE ??= '本机或受控局域网排练'

const databasePath = process.env.DEMO_DATABASE_PATH
const manifestPath = process.env.DEMO_SEED_MANIFEST_PATH
const pnpmCli = process.env.npm_execpath
if (!pnpmCli || !/pnpm(?:\.c?js|\.mjs)?$/i.test(pnpmCli)) {
  console.error('请从仓库根目录运行 pnpm dev:rehearsal。')
  process.exit(1)
}

function runPnpm(args, stdio = 'inherit', environment = process.env) {
  return spawnSync(process.execPath, [pnpmCli, ...args], {
    cwd: repositoryRoot,
    env: environment,
    stdio,
    shell: false,
    windowsHide: true,
  })
}

function rehearsalV2Ready() {
  return runPnpm(['exec', 'tsx', 'backend/src/cli/v2-verify.ts'], 'ignore').status === 0
}

const databaseExists = fs.existsSync(databasePath)
const manifestExists = fs.existsSync(manifestPath)
if (!(databaseExists && manifestExists && rehearsalV2Ready())) {
  if (databaseExists || manifestExists) {
    console.error(
      '合成正式视觉排练目录已存在但未通过 v2 验证；为避免覆盖，请检查该目录或改用新的 REHEARSAL_RUNTIME_DIR。',
    )
    process.exit(1)
  }
  console.log('首次运行：正在创建隔离的 300 条合成技术目录并完成一次性 v2 初始化；正式视觉基准仍为 220 人。')
  const setup = runPnpm(['run', 'db:setup'])
  if (setup.status !== 0) process.exit(setup.status ?? 1)
  const observed = runPnpm(
    ['exec', 'tsx', 'backend/src/cli/rehearsal-observe-v1.ts'],
    'inherit',
    {
      ...process.env,
      REHEARSAL_BOOTSTRAP_CONFIRMATION: 'FRESH_SYNTHETIC_REHEARSAL',
    },
  )
  if (observed.status !== 0) process.exit(observed.status ?? 1)
  const backupPath = path.join(rehearsalDirectory, 'bootstrap-v1.sqlite')
  const cutover = runPnpm([
    'exec',
    'tsx',
    'backend/src/cli/v2-switch.ts',
    '--',
    '--backup',
    backupPath,
    '--confirm',
    'SYNTHETIC_DEMO_DATA_IS_DISPOSABLE',
  ])
  if (cutover.status !== 0 || !rehearsalV2Ready()) {
    console.error('合成正式视觉排练目录未能完成 v2 初始化；正式名单和正式数据库均未被访问。')
    process.exit(cutover.status ?? 1)
  }
}

await import('./dev.mjs')
