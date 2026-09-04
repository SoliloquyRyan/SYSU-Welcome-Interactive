import fs from 'node:fs'
import path from 'node:path'

const PRIVATE_FILE_MODE_MASK = 0o077
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1'])

function resolveFrom(baseDirectory, value) {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(baseDirectory, value)
}

function assertRegularFile(filePath, label) {
  let stat
  try {
    stat = fs.statSync(filePath)
  } catch {
    throw new Error(`${label}不存在或不可读。`)
  }
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`${label}不是非空普通文件。`)
  }
  return stat
}

function assertPrivateMode(filePath, label, platform) {
  if (platform === 'win32') return
  const mode = fs.statSync(filePath).mode & 0o777
  if ((mode & PRIVATE_FILE_MODE_MASK) !== 0) {
    throw new Error(`${label}权限过宽；正式服务器要求仅服务账号可读写（建议 0600）。`)
  }
}

function assertPrivateDirectoryMode(directoryPath, platform) {
  if (platform === 'win32') return
  const mode = fs.statSync(directoryPath).mode & 0o777
  if ((mode & PRIVATE_FILE_MODE_MASK) !== 0) {
    throw new Error('正式私密目录权限过宽；正式服务器要求仅服务账号可访问（建议 0700）。')
  }
}

function isInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function formalOrigin(value) {
  if (!value) {
    throw new Error('缺少 FORMAL_PUBLIC_ORIGIN；正式服务必须声明唯一 HTTPS origin。')
  }
  const parsed = new URL(value)
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/'
  ) {
    throw new Error('FORMAL_PUBLIC_ORIGIN 必须是无账号、路径、查询和片段的 HTTPS origin。')
  }
  return parsed.origin
}

function assertCompatibleOverride(environment, name, expected) {
  const current = environment[name]?.trim()
  if (current && current !== expected) {
    throw new Error(`${name} 与正式安全配置不一致。`)
  }
}

export function prepareFormalRuntime({
  repositoryRoot,
  environment = process.env,
  mode = 'development',
  platform = process.platform,
} = {}) {
  if (!repositoryRoot) throw new Error('缺少 repositoryRoot。')
  if (mode !== 'development' && mode !== 'production') {
    throw new Error('未知的正式运行模式。')
  }

  const resolvedRepositoryRoot = fs.realpathSync(path.resolve(repositoryRoot))
  const configuredRuntimeDirectory = environment.FORMAL_RUNTIME_DIR?.trim()
  if (mode === 'production' && configuredRuntimeDirectory && !path.isAbsolute(configuredRuntimeDirectory)) {
    throw new Error('正式服务器的 FORMAL_RUNTIME_DIR 必须是绝对路径。')
  }
  const runtimeDirectory = resolveFrom(
    resolvedRepositoryRoot,
    configuredRuntimeDirectory || path.join('backend', '.private'),
  )
  const runtimePath = (name, fallback) => {
    const configured = environment[name]?.trim()
    return resolveFrom(runtimeDirectory, configured || fallback)
  }
  const databasePath = runtimePath('FORMAL_DATABASE_PATH', '2026-roster.sqlite')
  const secretPath = runtimePath(
    'FORMAL_RUNTIME_SECRET_PATH',
    '2026-runtime-secret.json',
  )
  const nfcMapPath = runtimePath('FORMAL_NFC_MAP_PATH', '2026-nfc-map.csv')
  const uniquePaths = new Set(
    [databasePath, secretPath, nfcMapPath].map((entry) => path.normalize(entry).toLowerCase()),
  )
  if (uniquePaths.size !== 3) {
    throw new Error('正式数据库、运行凭据和 NFC 映射必须使用三个不同文件。')
  }

  assertRegularFile(databasePath, '正式名单库')
  assertRegularFile(secretPath, '正式运行凭据')
  assertRegularFile(nfcMapPath, '正式 NFC 映射')

  let profile
  try {
    profile = JSON.parse(fs.readFileSync(secretPath, 'utf8'))
  } catch {
    throw new Error('正式运行凭据不是有效 JSON。')
  }
  if (
    profile?.profile !== 'PROTECTED_ROSTER' ||
    !Number.isInteger(profile.participantCount) ||
    profile.participantCount < 1 ||
    profile.participantCount > 300
  ) {
    throw new Error('正式运行凭据不是有效的受保护名单配置。')
  }

  let publicOrigin = null
  if (mode === 'production') {
    publicOrigin = formalOrigin(environment.FORMAL_PUBLIC_ORIGIN?.trim())
    const backendHost = environment.DEMO_BACKEND_HOST?.trim() || '127.0.0.1'
    if (!LOOPBACK_HOSTS.has(backendHost)) {
      throw new Error('正式后端必须只监听 loopback，由 HTTPS 反向代理对外服务。')
    }
    assertCompatibleOverride(environment, 'DEMO_ALLOWED_ORIGINS', publicOrigin)
    assertCompatibleOverride(environment, 'DEMO_SECURE_COOKIES', '1')
    assertCompatibleOverride(environment, 'DEMO_TRUST_LOOPBACK_PROXY', '1')

    const privateDirectories = new Set()
    for (const [filePath, label] of [
      [databasePath, '正式名单库'],
      [secretPath, '正式运行凭据'],
      [nfcMapPath, '正式 NFC 映射'],
    ]) {
      const realFilePath = fs.realpathSync(filePath)
      if (isInside(resolvedRepositoryRoot, realFilePath)) {
        throw new Error(`${label}必须位于代码目录之外的持久化私密目录。`)
      }
      assertPrivateMode(realFilePath, label, platform)
      privateDirectories.add(path.dirname(realFilePath))
    }
    for (const directory of privateDirectories) {
      assertPrivateDirectoryMode(directory, platform)
    }
  }

  const preparedEnvironment = {
    ...environment,
    DEMO_DATABASE_PATH: databasePath,
    DEMO_SEED_MANIFEST_PATH: secretPath,
    DEMO_SEED_PARTICIPANT_COUNT: String(profile.participantCount),
    FORMAL_NFC_MAP_PATH: nfcMapPath,
    VITE_DATA_PROFILE: 'PROTECTED',
    VITE_SITE_EDITION: environment.VITE_SITE_EDITION ?? '2026 迎新现场',
    VITE_SITE_NOTICE: environment.VITE_SITE_NOTICE ?? '受保护名单 · NFC 匿名入口',
  }

  if (mode === 'production') {
    Object.assign(preparedEnvironment, {
      NODE_ENV: 'production',
      DEMO_BACKEND_HOST: environment.DEMO_BACKEND_HOST?.trim() || '127.0.0.1',
      DEMO_ALLOWED_ORIGINS: publicOrigin,
      DEMO_SECURE_COOKIES: '1',
      DEMO_TRUST_LOOPBACK_PROXY: '1',
      VITE_SITE_SCOPE: environment.VITE_SITE_SCOPE ?? '正式 HTTPS 部署配置',
    })
  } else {
    preparedEnvironment.VITE_SITE_SCOPE ??= '现场局域网 · 正式运行配置'
  }

  return {
    databasePath,
    secretPath,
    nfcMapPath,
    participantCount: profile.participantCount,
    publicOrigin,
    environment: preparedEnvironment,
  }
}
