import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const pnpmCli = process.env.npm_execpath

if (!pnpmCli || !/pnpm(?:\.c?js|\.mjs)?$/i.test(pnpmCli)) {
  console.error('请从仓库根目录使用 pnpm build:formal。')
  process.exit(1)
}

const environment = {
  ...process.env,
  VITE_DATA_PROFILE: 'PROTECTED',
  VITE_SITE_EDITION: process.env.VITE_SITE_EDITION ?? '2026 迎新现场',
  VITE_SITE_NOTICE: process.env.VITE_SITE_NOTICE ?? '受保护名单 · NFC 匿名入口',
  VITE_SITE_SCOPE: process.env.VITE_SITE_SCOPE ?? '正式 HTTPS 部署配置',
}

const result = spawnSync(process.execPath, [pnpmCli, 'run', 'build'], {
  cwd: path.resolve(repositoryRoot),
  env: environment,
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
})

if (result.error) {
  console.error(`正式构建启动失败：${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
