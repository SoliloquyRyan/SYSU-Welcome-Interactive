import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import { isIP } from 'node:net'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import QRCode from 'qrcode'

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BACKEND_HOST = '127.0.0.1'
const BACKEND_PORT = 3000
const FRONTEND_PORT = 5173
const STARTUP_TIMEOUT_MS = 30_000
const MAX_CAPTURED_OUTPUT = 64 * 1024
const PROTECTED_RUNTIME = process.env.VITE_DATA_PROFILE === 'PROTECTED'
const REHEARSAL_RUNTIME = process.env.VITE_DATA_PROFILE === 'REHEARSAL'

const childProcesses = new Map()
let shuttingDown = false
let shutdownPromise
let resolveLifetime
const lifetime = new Promise((resolve) => {
  resolveLifetime = resolve
})

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function redactOutput(value) {
  return value
    .replace(
      /(["']?(?:password|password_digest|inviteToken|invitationToken|studentNumber|student_number|authorization|cookie)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi,
      '$1[REDACTED]',
    )
    .replace(
      /([?&](?:invite|token|code)=)[^&\s"']+/gi,
      '$1[REDACTED]',
    )
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
}

function appendCaptured(current, chunk) {
  const next = `${current}${chunk}`
  return next.length <= MAX_CAPTURED_OUTPUT
    ? next
    : next.slice(next.length - MAX_CAPTURED_OUTPUT)
}

function pnpmCliPath() {
  const cliPath = process.env.npm_execpath
  if (!cliPath || !/pnpm(?:\.c?js|\.mjs)?$/i.test(cliPath)) {
    throw new Error(
      '请从仓库根目录运行 pnpm dev 或 pnpm dev:formal，以便安全启动工作区。',
    )
  }
  return cliPath
}

function spawnPnpm(args, { label, environment, quiet = false, persistent = false }) {
  const child = spawn(process.execPath, [pnpmCliPath(), ...args], {
    cwd: REPOSITORY_ROOT,
    env: environment,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const metadata = {
    child,
    label,
    persistent,
    expectedExit: false,
    launchError: null,
    stdout: '',
    stderr: '',
  }
  childProcesses.set(child.pid ?? Symbol(label), metadata)

  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')

  child.stdout?.on('data', (chunk) => {
    metadata.stdout = appendCaptured(metadata.stdout, chunk)
    if (!quiet) {
      process.stdout.write(redactOutput(chunk))
    }
  })
  child.stderr?.on('data', (chunk) => {
    metadata.stderr = appendCaptured(metadata.stderr, chunk)
    if (!quiet) {
      process.stderr.write(redactOutput(chunk))
    }
  })

  child.once('error', (error) => {
    metadata.launchError = error
    if (persistent && !shuttingDown) {
      void requestShutdown(1, `${label} 无法启动：${errorMessage(error)}`)
    }
  })

  child.once('exit', (code, signal) => {
    for (const [key, value] of childProcesses) {
      if (value === metadata) {
        childProcesses.delete(key)
        break
      }
    }

    if (persistent && !metadata.expectedExit && !shuttingDown) {
      const reason = signal ? `信号 ${signal}` : `退出码 ${code ?? '未知'}`
      void requestShutdown(1, `${label} 意外停止（${reason}）。`)
    }
  })

  return metadata
}

async function runPnpm(args, { label, environment, sensitive = false }) {
  const metadata = spawnPnpm(args, {
    label,
    environment,
    quiet: true,
    persistent: false,
  })
  const [code, signal] = await once(metadata.child, 'exit')

  if (code === 0) {
    return
  }

  if (shuttingDown) {
    throw new Error(`${label} 已随启动器停止。`)
  }

  const reason = signal ? `信号 ${signal}` : `退出码 ${code ?? '未知'}`
  if (sensitive) {
    throw new Error(`${label} 失败（${reason}）；为避免泄露，本地凭据输出未回显。`)
  }

  const details = redactOutput(`${metadata.stdout}\n${metadata.stderr}`).trim()
  throw new Error(
    details ? `${label} 失败（${reason}）。\n${details}` : `${label} 失败（${reason}）。`,
  )
}

async function runPnpmStatus(args, { label, environment }) {
  const metadata = spawnPnpm(args, {
    label,
    environment,
    quiet: true,
    persistent: false,
  })
  const [code] = await once(metadata.child, 'exit')
  return code === 0
}

function networkCandidates() {
  const candidates = []
  for (const [interfaceName, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (
        address.family === 'IPv4' &&
        !address.internal &&
        isIP(address.address) === 4
      ) {
        candidates.push({ interfaceName, address: address.address })
      }
    }
  }
  return candidates
}

function addressOctets(address) {
  return address.split('.').map((part) => Number.parseInt(part, 10))
}

function isPrivateOrCarrierLan(address) {
  const [first, second] = addressOctets(address)
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  )
}

function isUnsafeSpecialAddress(address) {
  const [first, second] = addressOctets(address)
  return (
    first === 0 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  )
}

function isVirtualInterface(interfaceName) {
  return /bettbox|bluetooth|docker|hyper-v|tailscale|virtualbox|vmware|vpn|vethernet|wsl/i.test(
    interfaceName,
  )
}

function windowsDefaultRouteAddress() {
  if (process.platform !== 'win32') {
    return null
  }

  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$route = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0'",
    "$route = $route | Where-Object { $_.State -in @('Alive', 'Probe') }",
    '$route = $route | Sort-Object @{ Expression = { $_.RouteMetric + $_.InterfaceMetric } } | Select-Object -First 1',
    'if (-not $route) { exit 2 }',
    '$address = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.ifIndex',
    "$address = $address | Where-Object { $_.AddressState -eq 'Preferred' } | Select-Object -First 1 -ExpandProperty IPAddress",
    'if (-not $address) { exit 3 }',
    '[Console]::Out.Write($address)',
  ].join('; ')

  const result = spawnSync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    {
      encoding: 'utf8',
      timeout: 6_000,
      windowsHide: true,
    },
  )
  if (result.status !== 0) {
    return null
  }

  const address = result.stdout.trim()
  return isIP(address) === 4 ? address : null
}

function chooseLanAddress() {
  const candidates = networkCandidates()
  const explicit = process.env.DEMO_HOST?.trim()

  if (explicit) {
    if (
      isIP(explicit) !== 4 ||
      isUnsafeSpecialAddress(explicit) ||
      !isPrivateOrCarrierLan(explicit) ||
      !candidates.some(
        (candidate) =>
          candidate.address === explicit &&
          !isVirtualInterface(candidate.interfaceName),
      )
    ) {
      throw new Error(
        'DEMO_HOST 必须是当前电脑上已启用且可供局域网访问的 IPv4 地址。',
      )
    }
    return {
      address: explicit,
      interfaceName:
        candidates.find((candidate) => candidate.address === explicit)?.interfaceName ??
        '手动指定接口',
      source: 'DEMO_HOST',
    }
  }

  const eligible = candidates.filter(
    (candidate) =>
      isPrivateOrCarrierLan(candidate.address) &&
      !isUnsafeSpecialAddress(candidate.address) &&
      !isVirtualInterface(candidate.interfaceName),
  )
  const defaultRouteAddress = windowsDefaultRouteAddress()
  const defaultRouteCandidate = eligible.find(
    (candidate) => candidate.address === defaultRouteAddress,
  )
  if (defaultRouteCandidate) {
    return { ...defaultRouteCandidate, source: 'Windows 默认路由' }
  }

  const scored = eligible
    .map((candidate) => {
      let score = 0
      if (/ethernet|以太网/i.test(candidate.interfaceName)) score += 30
      if (/wi-?fi|wlan|无线/i.test(candidate.interfaceName)) score += 25
      if (candidate.address.startsWith('192.168.')) score += 10
      if (candidate.address.startsWith('10.')) score += 5
      return { ...candidate, score }
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.interfaceName.localeCompare(right.interfaceName, 'zh-CN') ||
        left.address.localeCompare(right.address),
    )

  if (scored.length === 0) {
    throw new Error(
      '未找到可靠的局域网 IPv4。请连接可信网络后重试，或在 PowerShell 中设置 $env:DEMO_HOST。',
    )
  }

  return { ...scored[0], source: '安全候选排序' }
}

async function assertPortAvailable(host, port, label) {
  await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', (error) => {
      reject(
        new Error(
          `${label}端口 ${host}:${port} 不可用：${errorMessage(error)}。请先关闭占用进程。`,
        ),
      )
    })
    server.listen({ host, port, exclusive: true }, () => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  })
}

async function waitForReady(url, metadata, label) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (metadata.launchError) {
      throw metadata.launchError
    }
    if (metadata.child.exitCode !== null || metadata.child.signalCode !== null) {
      throw new Error(`${label} 在就绪前已经退出。`)
    }

    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(1_500),
      })
      if (response.ok) {
        const payload = await response.json()
        const checks = payload?.checks
        if (
          payload?.status === 'ready' &&
          checks?.database === 'ready' &&
          checks?.migrations === 'ready' &&
          checks?.seed === 'ready' &&
          checks?.realtime === 'ready'
        ) {
          return
        }
      }
    } catch {
      // The process can accept TCP before migrations and the proxy are ready.
    }

    await delay(250)
  }

  throw new Error(`${label} 在 ${STARTUP_TIMEOUT_MS / 1_000} 秒内未就绪。`)
}

async function waitForV2Active(url, metadata, label) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (metadata.launchError) {
      throw metadata.launchError
    }
    if (metadata.child.exitCode !== null || metadata.child.signalCode !== null) {
      throw new Error(`${label} 在就绪前已经退出。`)
    }

    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(1_500),
      })
      if (response.ok) {
        const payload = await response.json()
        if (
          payload?.contractVersion === '2' &&
          payload?.activeRuntimeVersion === '2' &&
          payload?.activationState === 'ACTIVE'
        ) {
          return
        }
      }
    } catch {
      // The process can accept TCP before the v2 runtime reports ACTIVE.
    }

    await delay(250)
  }

  throw new Error(`${label} 在 ${STARTUP_TIMEOUT_MS / 1_000} 秒内未就绪。`)
}

function resolveManifestPath(environment) {
  const configured =
    environment.DEMO_SEED_MANIFEST_PATH ?? '.data/demo-seed-manifest.json'
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(REPOSITORY_ROOT, 'backend', configured)
}

function valueAtPath(root, segments) {
  let current = root
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined
    current = current[segment]
  }
  return current
}

function firstInvitationToken(manifest) {
  const possiblePaths = [
    ['participants', 0, 'invitationToken'],
    ['participants', 0, 'inviteToken'],
    ['participants', 0, 'token'],
    ['participantCredentials', 0, 'invitationToken'],
    ['participantCredentials', 0, 'inviteToken'],
    ['credentials', 'participants', 0, 'invitationToken'],
    ['credentials', 'participants', 0, 'inviteToken'],
    ['welcome', 'invitationToken'],
    ['welcome', 'inviteToken'],
    ['demoParticipant', 'invitationToken'],
  ]

  for (const segments of possiblePaths) {
    const value = valueAtPath(manifest, segments)
    if (
      typeof value === 'string' &&
      value.length >= 16 &&
      value.length <= 512 &&
      !/\s/.test(value)
    ) {
      return value
    }
  }

  throw new Error(
    '固定种子清单没有可用于二维码的首个合成邀请令牌；请先检查 db:setup 输出文件。',
  )
}

async function createWelcomeQr(publicOrigin, environment) {
  const manifestPath = resolveManifestPath(environment)
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const invitationToken = firstInvitationToken(manifest)
  const adminUsername = manifest?.admin?.username
  if (
    typeof adminUsername !== 'string' ||
    !/^[A-Za-z0-9_-]{3,64}$/.test(adminUsername)
  ) {
    throw new Error('固定种子清单没有可显示的共用后台用户名。')
  }
  const welcomeUrl = new URL('/welcome', publicOrigin)
  welcomeUrl.searchParams.set('token', invitationToken)

  const dataDirectory = path.dirname(manifestPath)
  const qrPath = path.join(dataDirectory, 'welcome-entry.svg')
  await fs.mkdir(dataDirectory, { recursive: true, mode: 0o700 })
  await QRCode.toFile(qrPath, welcomeUrl.href, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 512,
    color: {
      dark: '#07111FFF',
      light: '#FFFFFFFF',
    },
  })
  try {
    await fs.chmod(qrPath, 0o600)
  } catch {
    // Windows does not map POSIX modes to ACLs; the directory remains Git-ignored.
  }

  return { adminUsername, manifestPath, qrPath }
}

async function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true
  return Promise.race([
    once(child, 'exit').then(() => true),
    delay(timeoutMs).then(() => false),
  ])
}

async function stopChild(metadata) {
  const { child } = metadata
  metadata.expectedExit = true
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return

  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T'], {
      stdio: 'ignore',
      windowsHide: true,
    })
  } else {
    child.kill('SIGTERM')
  }

  if (await waitForChildExit(child, 2_000)) return

  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
  } else {
    child.kill('SIGKILL')
  }
  await waitForChildExit(child, 1_000)
}

async function requestShutdown(exitCode, reason) {
  if (shutdownPromise) return shutdownPromise
  shuttingDown = true

  shutdownPromise = (async () => {
    if (reason) {
      const output = exitCode === 0 ? console.log : console.error
      output(reason)
    }

    const processes = [...childProcesses.values()].reverse()
    await Promise.allSettled(processes.map((metadata) => stopChild(metadata)))
    process.exitCode = exitCode
    resolveLifetime()
  })()

  return shutdownPromise
}

process.on('SIGINT', () => {
  void requestShutdown(
    130,
    PROTECTED_RUNTIME
      ? '\n正在停止正式现场服务……'
      : REHEARSAL_RUNTIME
        ? '\n正在停止合成正式视觉排练服务……'
        : '\n正在停止 Demo 服务……',
  )
})
process.on('SIGTERM', () => {
  void requestShutdown(
    143,
    PROTECTED_RUNTIME
      ? '\n正在停止正式现场服务……'
      : REHEARSAL_RUNTIME
        ? '\n正在停止合成正式视觉排练服务……'
        : '\n正在停止 Demo 服务……',
  )
})

async function main() {
  const protectedRuntime = PROTECTED_RUNTIME
  const lan = chooseLanAddress()
  const publicOrigin = `http://${lan.address}:${FRONTEND_PORT}`
  const environment = {
    ...process.env,
    DEMO_BACKEND_HOST: BACKEND_HOST,
    DEMO_BACKEND_PORT: String(BACKEND_PORT),
    DEMO_FRONTEND_HOST: lan.address,
    DEMO_ALLOWED_ORIGINS: publicOrigin,
    DEMO_PUBLIC_ORIGIN: publicOrigin,
    DEMO_METRICS: '1',
  }

  console.log(`局域网地址：${lan.address}（${lan.interfaceName}，${lan.source}）`)
  console.log(
    protectedRuntime
      ? '正在检查端口并验证受保护正式数据……'
      : '正在检查端口并准备本地合成数据……',
  )

  await assertPortAvailable(BACKEND_HOST, BACKEND_PORT, '后端')
  await assertPortAvailable(lan.address, FRONTEND_PORT, '前端')
  await runPnpm(['run', 'build:contracts'], {
    label: '共享契约构建',
    environment,
  })
  const v2Verified = await runPnpmStatus(
    ['exec', 'tsx', 'backend/src/cli/v2-verify.ts'],
    { label: '协议 v2 数据基础验证', environment },
  )
  if (v2Verified) {
    console.log(
      protectedRuntime
        ? '检测到 V2_ACTIVE 受保护名单库，将启动协议 v2 正式三端。'
        : '检测到 V2_ACTIVE 合成库，将启动协议 v2 三端（迁移已由一次性切换完成）。',
    )
  } else {
    if (protectedRuntime) {
      throw new Error(
        '受保护正式名单库未通过协议 v2 完整验证；正式启动器不会自动迁移、清空或生成合成数据。请运行 pnpm db:v2:verify 并检查本地私密配置。',
      )
    }
    const v1SetupSafe = await runPnpmStatus(
      ['exec', 'tsx', 'backend/src/cli/v1-setup-safe-probe.ts'],
      { label: '旧版数据库初始化安全探测', environment },
    )
    if (!v1SetupSafe) {
      throw new Error(
        '当前数据库既未通过协议 v2 完整验证，也不是可安全初始化的空库或 V1_ACTIVE 库；为保护已有状态，启动器已停止。请先停止所有 Demo 服务并运行 v2-verify；若提示 schema 12，请按 RUNBOOK 使用 db:v2:upgrade 创建独立备份后升级。',
      )
    }
    await runPnpm(['run', 'db:setup'], {
      label: '数据库迁移与固定种子初始化',
      environment,
      sensitive: true,
    })
  }

  console.log('正在启动后端……')
  const backend = spawnPnpm(
    ['--filter', '@sysu-welcome/backend', 'run', 'dev'],
    {
      label: '后端服务',
      environment,
      quiet: true,
      persistent: true,
    },
  )
  if (v2Verified) {
    await waitForV2Active(
      `http://${BACKEND_HOST}:${BACKEND_PORT}/api/protocol-capabilities`,
      backend,
      '后端 v2 服务',
    )
  } else {
    await waitForReady(
      `http://${BACKEND_HOST}:${BACKEND_PORT}/api/ready`,
      backend,
      '后端服务',
    )
  }

  console.log('正在启动前端并验证同源代理……')
  const frontend = spawnPnpm(
    ['--filter', '@sysu-welcome/frontend', 'run', 'dev'],
    {
      label: '前端服务',
      environment,
      quiet: true,
      persistent: true,
    },
  )
  if (v2Verified) {
    await waitForV2Active(
      `${publicOrigin}/api/protocol-capabilities`,
      frontend,
      '前端同源代理',
    )
  } else {
    await waitForReady(
      `${publicOrigin}/api/ready`,
      frontend,
      '前端同源代理',
    )
  }

  const manifestPath = resolveManifestPath(environment)
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const adminUsername = manifest?.admin?.username
  if (
    typeof adminUsername !== 'string' ||
    !/^[A-Za-z0-9_-]{3,64}$/.test(adminUsername)
  ) {
    throw new Error('运行凭据没有可显示的后台用户名。')
  }
  const qrPath = protectedRuntime
    ? null
    : (await createWelcomeQr(publicOrigin, environment)).qrPath
  console.log('')
  console.log(
    protectedRuntime
      ? '正式受保护三端服务已就绪：'
      : REHEARSAL_RUNTIME
        ? '合成正式视觉排练三端已就绪：'
        : 'Demo v0 三端服务已就绪：',
  )
  console.log(`WELCOME_URL=${publicOrigin}/welcome`)
  console.log(`ADMIN_URL=${publicOrigin}/admin`)
  console.log(`SCREEN_URL=${publicOrigin}/screen`)
  if (protectedRuntime) {
    const nfcMapPath = environment.FORMAL_NFC_MAP_PATH
    console.log(`FORMAL_ADMIN=${adminUsername}（密码见 FORMAL_CREDENTIALS）`)
    console.log(`FORMAL_CREDENTIALS=${manifestPath}（本地忽略文件，内容未回显）`)
    console.log(`FORMAL_NFC_MAP=${nfcMapPath}（私密逐人映射，内容未回显）`)
    console.log('请按逐人 NFC 映射写卡；终端不会显示姓名、学号、邀请令牌或后台密码。')
  } else if (REHEARSAL_RUNTIME) {
    console.log(`WELCOME_QR=${qrPath}`)
    console.log(`REHEARSAL_ADMIN=${adminUsername}（密码见 REHEARSAL_CREDENTIALS）`)
    console.log(`REHEARSAL_CREDENTIALS=${manifestPath}（合成忽略文件，内容未回显）`)
    console.log('本入口使用 300 条纯合成技术目录，正式视觉按 220 人验收；不包含或读取真实姓名、学号、令牌与 NFC 映射。')
  } else {
    console.log(`WELCOME_QR=${qrPath}`)
    console.log(`DEMO_ADMIN=${adminUsername}（密码见 DEMO_CREDENTIALS）`)
    console.log(`DEMO_CREDENTIALS=${manifestPath}（本地忽略文件，内容未回显）`)
    console.log('扫码二维码可用个性令牌直接进入；终端不会显示令牌、合成学号或后台密码。')
  }
  console.log('按 Ctrl+C 停止全部服务。')

  if (process.env.DEMO_SMOKE_EXIT_AFTER_READY === '1') {
    await requestShutdown(0, '启动链路自检通过，正在自动停止测试服务。')
    return
  }

  await lifetime
}

main().catch(async (error) => {
  if (!shuttingDown) {
    await requestShutdown(1, `启动失败：${errorMessage(error)}`)
  }
})
