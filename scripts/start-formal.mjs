import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { prepareFormalRuntime } from './formal-runtime.mjs'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const backendEntry = path.join(repositoryRoot, 'backend', 'dist', 'server.js')
const verifyEntry = path.join(
  repositoryRoot,
  'backend',
  'dist',
  'cli',
  'v2-verify.js',
)
const frontendEntry = path.join(repositoryRoot, 'frontend', 'dist', 'index.html')

let prepared
try {
  prepared = prepareFormalRuntime({
    repositoryRoot,
    environment: process.env,
    mode: 'production',
  })
  for (const [filePath, label] of [
    [backendEntry, '后端生产构建'],
    [verifyEntry, '数据库验证构建'],
    [frontendEntry, '前端正式构建'],
  ]) {
    if (!fs.statSync(filePath).isFile()) {
      throw new Error(`${label}不存在；请先运行 pnpm build:formal。`)
    }
  }
} catch (error) {
  console.error(
    `正式生产启动检查失败：${error instanceof Error ? error.message : '未知错误'}`,
  )
  process.exit(1)
}

const verification = spawnSync(process.execPath, [verifyEntry], {
  cwd: repositoryRoot,
  env: prepared.environment,
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
})
if (verification.error || verification.status !== 0) {
  console.error('正式数据库完整性验证未通过；后端未启动。')
  process.exit(verification.status ?? 1)
}

console.log(
  `正式数据库验证通过；单实例后端将在 ${prepared.environment.DEMO_BACKEND_HOST}:${prepared.environment.DEMO_BACKEND_PORT ?? '3000'} 监听。`,
)
const child = spawn(process.execPath, [backendEntry], {
  cwd: repositoryRoot,
  env: prepared.environment,
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
})

let forwardingSignal = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    forwardingSignal = true
    child.kill(signal)
  })
}

child.once('error', (error) => {
  console.error(`正式后端启动失败：${error.message}`)
  process.exitCode = 1
})
child.once('exit', (code, signal) => {
  if (signal && !forwardingSignal) {
    console.error(`正式后端被信号 ${signal} 终止。`)
  }
  process.exitCode = code ?? (forwardingSignal ? 0 : 1)
})
