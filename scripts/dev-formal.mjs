import path from 'node:path'

import { prepareFormalRuntime } from './formal-runtime.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..')
try {
  const prepared = prepareFormalRuntime({
    repositoryRoot: repoRoot,
    environment: process.env,
    mode: 'development',
  })
  Object.assign(process.env, prepared.environment)
} catch (error) {
  console.error(
    `正式启动检查失败：${error instanceof Error ? error.message : '未知错误'}`,
  )
  process.exit(1)
}

await import('./dev.mjs')
