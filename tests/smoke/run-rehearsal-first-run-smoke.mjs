import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const pnpmCli = process.env.npm_execpath
if (!pnpmCli || !/pnpm(?:\.c?js|\.mjs)?$/i.test(pnpmCli)) {
  console.error('请通过 pnpm test:rehearsal:smoke 运行。')
  process.exit(1)
}

const runtimeDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'sysu-welcome-rehearsal-smoke-'),
)
const databasePath = path.join(runtimeDirectory, 'rehearsal.sqlite')
const manifestPath = path.join(runtimeDirectory, 'rehearsal-seed-manifest.json')

function runPnpm(args, environment) {
  return spawnSync(process.execPath, [pnpmCli, ...args], {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  })
}

try {
  const environment = {
    ...process.env,
    REHEARSAL_RUNTIME_DIR: runtimeDirectory,
    DEMO_SMOKE_EXIT_AFTER_READY: '1',
  }
  for (const name of [
    'FORMAL_RUNTIME_DIR',
    'FORMAL_DATABASE_PATH',
    'FORMAL_RUNTIME_SECRET_PATH',
    'FORMAL_NFC_MAP_PATH',
    'FORMAL_PUBLIC_ORIGIN',
  ]) {
    delete environment[name]
  }
  const firstRun = runPnpm(['run', 'dev:rehearsal'], {
    ...environment,
    FORMAL_RUNTIME_DIR: path.join(runtimeDirectory, '..', 'unrelated-formal'),
    FORMAL_NFC_MAP_PATH: path.join(runtimeDirectory, '..', 'must-not-be-read.csv'),
    FORMAL_PUBLIC_ORIGIN: 'https://must-not-be-used.example.edu.cn',
  })
  if (firstRun.error || firstRun.status !== 0) {
    throw firstRun.error ?? new Error(`合成排练首次启动退出码 ${firstRun.status ?? 'unknown'}`)
  }

  for (const filePath of [
    databasePath,
    manifestPath,
    path.join(runtimeDirectory, 'bootstrap-v1.sqlite'),
  ]) {
    if (!fs.statSync(filePath).isFile()) {
      throw new Error(`合成排练未生成预期资产：${path.basename(filePath)}`)
    }
  }

  const verification = runPnpm(
    ['exec', 'tsx', 'backend/src/cli/v2-verify.ts'],
    {
      ...environment,
      DEMO_DATABASE_PATH: databasePath,
      DEMO_SEED_MANIFEST_PATH: manifestPath,
      DEMO_SEED_PARTICIPANT_COUNT: '300',
    },
  )
  if (verification.error || verification.status !== 0) {
    throw verification.error ?? new Error('合成排练首次启动后的 v2 验证失败。')
  }

  console.log('rehearsal-first-run-smoke OK: isolated 300-person synthetic v2 runtime')
} catch (error) {
  console.error(
    `rehearsal-first-run-smoke FAILED: ${error instanceof Error ? error.message : 'unknown error'}`,
  )
  process.exitCode = 1
} finally {
  fs.rmSync(runtimeDirectory, { recursive: true, force: true })
}
