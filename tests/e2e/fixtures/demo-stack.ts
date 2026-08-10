import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPOSITORY_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const FRONTEND_ROOT = path.join(REPOSITORY_ROOT, 'frontend')
const BACKEND_APP_URL = pathToFileURL(
  path.join(REPOSITORY_ROOT, 'backend', 'dist', 'app.js'),
).href
const BACKEND_CONFIG_URL = pathToFileURL(
  path.join(REPOSITORY_ROOT, 'backend', 'dist', 'config.js'),
).href
const TSX_CLI = path.join(
  REPOSITORY_ROOT,
  'node_modules',
  'tsx',
  'dist',
  'cli.mjs',
)
const TEST_HOST = '127.0.0.1'
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000
const MAX_CAPTURED_OUTPUT = 32 * 1024

export interface DemoParticipantCredentials {
  readonly inviteToken: string
  readonly displayName: string
  readonly demoCode: string
}

export interface DemoTestCredentials {
  /** Backward-compatible alias for participants[0]. */
  readonly participant: DemoParticipantCredentials
  /** At least two isolated synthetic identities; values must never be logged. */
  readonly participants: readonly [
    DemoParticipantCredentials,
    DemoParticipantCredentials,
    ...DemoParticipantCredentials[],
  ]
  admin: {
    username: string
    password: string
  }
}

export interface DemoTestStack {
  /** The only browser-facing origin. API and WebSocket traffic use its Vite proxy. */
  readonly baseURL: string
  /** OS-temporary manifest; never points at backend/.data. */
  readonly manifestPath: string
  /** Synthetic credentials held in memory only. Tests must not log this object. */
  readonly credentials: DemoTestCredentials
  /** Restarts only Fastify, retaining the same database, manifest, port and Vite proxy. */
  restartBackend(): Promise<void>
  /** Idempotently stops both services and recursively removes the isolated temp root. */
  stop(): Promise<void>
}

export interface StartDemoTestStackOptions {
  /** Defaults to four isolated identities; production remains fixed at 300. */
  participantCount?: number
  backendPort?: number
  frontendPort?: number
  startupTimeoutMs?: number
}

interface ManagedProcess {
  readonly label: string
  readonly child: ChildProcess
  stdout: string
  stderr: string
  states: string[]
  expectedExit: boolean
}

interface SeedManifestShape {
  participants?: Array<{
    inviteToken?: unknown
    displayName?: unknown
    demoCode?: unknown
  }>
  admin?: {
    username?: unknown
    password?: unknown
  }
}

const SAFE_INHERITED_ENVIRONMENT_KEYS = [
  'PATH',
  'SystemRoot',
  'WINDIR',
  'ComSpec',
  'PATHEXT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'TZ',
] as const

const SAFE_BOOLEAN_ENVIRONMENT_KEYS = ['CI', 'GITHUB_ACTIONS'] as const

function safeInheritedEnvironment(): NodeJS.ProcessEnv {
  const sourceEntries = Object.entries(process.env)
  const findValue = (key: string): string | undefined =>
    sourceEntries.find(([candidate]) => candidate.toLowerCase() === key.toLowerCase())?.[1]
  const environment: NodeJS.ProcessEnv = {}

  for (const key of SAFE_INHERITED_ENVIRONMENT_KEYS) {
    const value = findValue(key)
    if (value) environment[key] = value
  }
  for (const key of SAFE_BOOLEAN_ENVIRONMENT_KEYS) {
    const value = findValue(key)
    if (value && /^(?:0|1|false|true)$/iu.test(value)) environment[key] = value
  }
  return environment
}

function isPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65_535
}

function appendCaptured(current: string, chunk: string): string {
  const next = `${current}${chunk}`
  return next.length <= MAX_CAPTURED_OUTPUT
    ? next
    : next.slice(next.length - MAX_CAPTURED_OUTPUT)
}

function redactOutput(value: string): string {
  return value
    .replace(
      /(["']?(?:password|inviteToken|displayName|demoCode|username|authorization|cookie)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/giu,
      '$1[REDACTED]',
    )
    .replace(/([?&](?:invite|token|code)=)[^&\s"']+/giu, '$1[REDACTED]')
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/giu, '$1[REDACTED]')
}

function processFailure(process: ManagedProcess, detail: string): Error {
  const captured = redactOutput(`${process.stdout}\n${process.stderr}`).trim()
  const states = process.states.length > 0
    ? ` Process states: ${process.states.join(' -> ')}.`
    : ''
  const suffix = captured ? ` Last output:\n${captured}` : ''
  return new Error(`${process.label} ${detail}.${states}${suffix}`)
}

function startProcess(input: {
  label: string
  args: string[]
  cwd: string
  environment: NodeJS.ProcessEnv
  ipc?: boolean
}): ManagedProcess {
  const child = spawn(process.execPath, input.args, {
    cwd: input.cwd,
    env: input.environment,
    shell: false,
    windowsHide: true,
    stdio: input.ipc
      ? ['ignore', 'pipe', 'pipe', 'ipc']
      : ['ignore', 'pipe', 'pipe'],
  })
  const managed: ManagedProcess = {
    label: input.label,
    child,
    stdout: '',
    stderr: '',
    states: [],
    expectedExit: false,
  }
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    managed.stdout = appendCaptured(managed.stdout, chunk)
  })
  child.stderr?.on('data', (chunk: string) => {
    managed.stderr = appendCaptured(managed.stderr, chunk)
  })
  child.on('message', (message: unknown) => {
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      typeof message.type === 'string'
    ) {
      managed.states.push(message.type)
    }
  })
  return managed
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.off('exit', exited)
      resolve(false)
    }, timeoutMs)
    timeout.unref()
    const exited = () => {
      clearTimeout(timeout)
      resolve(true)
    }
    child.once('exit', exited)
  })
}

async function stopProcess(process: ManagedProcess): Promise<void> {
  const { child } = process
  process.expectedExit = true
  if (child.exitCode !== null || child.signalCode !== null) return

  if (child.connected) {
    try {
      child.send({ type: 'shutdown' })
    } catch {
      // The fallback below owns termination if the IPC channel closed first.
    }
  }
  if (await waitForExit(child, 5_000)) return

  child.kill('SIGTERM')
  if (await waitForExit(child, 2_000)) return
  child.kill('SIGKILL')
  await waitForExit(child, 1_000)
}

async function assertPortAvailable(port: number, label: string): Promise<void> {
  if (!isPort(port)) throw new Error(`${label} port must be an integer from 1 to 65535`)
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', (error) => {
      reject(new Error(`${label} port ${port} is unavailable`, { cause: error }))
    })
    server.listen({ host: TEST_HOST, port, exclusive: true }, () => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })
}

async function reserveEphemeralPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen({ host: TEST_HOST, port: 0, exclusive: true }, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Unable to reserve an isolated loopback port'))
        return
      }
      const port = address.port
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

async function selectPort(
  requested: number | undefined,
  label: string,
): Promise<number> {
  if (requested !== undefined) {
    await assertPortAvailable(requested, label)
    return requested
  }
  return reserveEphemeralPort()
}

async function waitForPortRelease(
  port: number,
  label: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      await assertPortAvailable(port, label)
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }
  throw new Error(`${label} port ${port} was not released`, { cause: lastError })
}

async function waitForReady(input: {
  url: string
  process: ManagedProcess
  timeoutMs: number
}): Promise<void> {
  const deadline = Date.now() + input.timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    if (
      input.process.child.exitCode !== null ||
      input.process.child.signalCode !== null
    ) {
      throw processFailure(input.process, 'exited before becoming ready')
    }
    try {
      const response = await fetch(input.url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(1_000),
      })
      if (response.ok) {
        const body = (await response.json()) as { status?: unknown }
        if (body.status === 'ready') return
      }
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw processFailure(
    input.process,
    `did not become ready at ${input.url} within ${input.timeoutMs}ms${
      lastError instanceof Error ? ` (${lastError.message})` : ''
    }`,
  )
}

function assertBuildOutputs(): void {
  const required = [
    path.join(REPOSITORY_ROOT, 'packages', 'contracts', 'dist', 'index.js'),
    path.join(REPOSITORY_ROOT, 'backend', 'dist', 'app.js'),
    path.join(REPOSITORY_ROOT, 'backend', 'dist', 'config.js'),
    TSX_CLI,
  ]
  const missing = required.filter((entry) => !fs.existsSync(entry))
  if (missing.length > 0) {
    throw new Error(
      'E2E service artifacts are missing. Run pnpm build:contracts and pnpm build:backend first.',
    )
  }
}

async function initializeDatabase(
  environment: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<void> {
  const setup = startProcess({
    label: 'isolated database setup',
    args: [TSX_CLI, path.join(REPOSITORY_ROOT, 'backend', 'src', 'cli', 'setup.ts')],
    cwd: REPOSITORY_ROOT,
    environment,
  })
  const exited = await waitForExit(setup.child, timeoutMs)
  if (!exited) {
    await stopProcess(setup)
    throw processFailure(setup, `timed out after ${timeoutMs}ms`)
  }
  if (setup.child.exitCode !== 0) {
    throw processFailure(setup, `failed with exit code ${setup.child.exitCode}`)
  }
}

function readCredentials(manifestPath: string): DemoTestCredentials {
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, 'utf8'),
  ) as SeedManifestShape
  const participants = manifest.participants
  const admin = manifest.admin
  if (
    !participants ||
    participants.length < 2 ||
    participants.some(
      (participant) =>
        typeof participant.inviteToken !== 'string' ||
        typeof participant.displayName !== 'string' ||
        typeof participant.demoCode !== 'string',
    ) ||
    typeof admin?.username !== 'string' ||
    typeof admin.password !== 'string'
  ) {
    throw new Error('Isolated synthetic seed manifest has an invalid credential shape')
  }
  const syntheticParticipants = participants.map((participant) => ({
    inviteToken: participant.inviteToken as string,
    displayName: participant.displayName as string,
    demoCode: participant.demoCode as string,
  }))
  const [participant, secondParticipant, ...remainingParticipants] =
    syntheticParticipants
  if (!participant || !secondParticipant) {
    throw new Error('Isolated synthetic seed manifest requires two participants')
  }
  return {
    participant,
    participants: [participant, secondParticipant, ...remainingParticipants],
    admin: { username: admin.username, password: admin.password },
  }
}

const BACKEND_RUNNER = `
import { buildApp } from ${JSON.stringify(BACKEND_APP_URL)}
import { loadConfig } from ${JSON.stringify(BACKEND_CONFIG_URL)}

process.send?.({ type: 'imports-ready' })
const config = loadConfig(process.env)
const app = await buildApp({ config })
process.send?.({ type: 'app-built' })
let stopping = false
const shutdown = async () => {
  if (stopping) return
  stopping = true
  try {
    await app.close()
    process.send?.({ type: 'stopped' })
    process.exit(0)
  } catch {
    process.exit(1)
  }
}
process.on('message', (message) => {
  if (message?.type === 'shutdown') void shutdown()
})
process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
await app.listen({ host: config.host, port: config.port })
process.send?.({ type: 'listening' })
`

const VITE_RUNNER = `
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'

const host = '127.0.0.1'
const port = Number(process.env.DEMO_E2E_FRONTEND_PORT)
const backend = process.env.DEMO_E2E_BACKEND_ORIGIN
if (!Number.isInteger(port) || !backend) throw new Error('Invalid E2E Vite configuration')
const server = await createServer({
  root: process.cwd(),
  configFile: false,
  clearScreen: false,
  logLevel: 'silent',
  appType: 'spa',
  plugins: [vue()],
  server: {
    host,
    port,
    strictPort: true,
    proxy: {
      '/api': { target: backend, changeOrigin: false, xfwd: true },
      '/ws': { target: backend.replace(/^http:/u, 'ws:'), changeOrigin: false, xfwd: true, ws: true },
    },
    fs: {
      deny: [
        '.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**',
        '**/*.db', '**/*.sqlite', '**/*.sqlite3',
      ],
    },
  },
})
let stopping = false
const shutdown = async () => {
  if (stopping) return
  stopping = true
  try {
    await server.close()
    process.send?.({ type: 'stopped' })
    process.exit(0)
  } catch {
    process.exit(1)
  }
}
process.on('message', (message) => {
  if (message?.type === 'shutdown') void shutdown()
})
process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
await server.listen()
process.send?.({ type: 'listening' })
`

function startBackend(environment: NodeJS.ProcessEnv): ManagedProcess {
  return startProcess({
    label: 'isolated Fastify backend',
    args: ['--input-type=module', '--eval', BACKEND_RUNNER],
    cwd: REPOSITORY_ROOT,
    environment,
    ipc: true,
  })
}

function startVite(environment: NodeJS.ProcessEnv): ManagedProcess {
  return startProcess({
    label: 'isolated Vite proxy',
    args: ['--input-type=module', '--eval', VITE_RUNNER],
    cwd: FRONTEND_ROOT,
    environment,
    ipc: true,
  })
}

function assertSafeTemporaryRoot(directory: string): void {
  const temporaryRoot = path.resolve(os.tmpdir())
  const resolved = path.resolve(directory)
  const relative = path.relative(temporaryRoot, resolved)
  if (
    relative.length === 0 ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !path.basename(resolved).startsWith('sysu-welcome-e2e-')
  ) {
    throw new Error('Refusing to remove an unexpected E2E temporary directory')
  }
}

async function removeTemporaryRoot(directory: string): Promise<void> {
  assertSafeTemporaryRoot(directory)
  await fsPromises.rm(directory, { recursive: true, force: true, maxRetries: 3 })
}

export async function startDemoTestStack(
  options: StartDemoTestStackOptions = {},
): Promise<DemoTestStack> {
  assertBuildOutputs()
  const startupTimeoutMs =
    options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS
  if (!Number.isFinite(startupTimeoutMs) || startupTimeoutMs < 1_000) {
    throw new Error('startupTimeoutMs must be at least 1000ms')
  }
  const participantCount = options.participantCount ?? 4
  if (
    !Number.isInteger(participantCount) ||
    participantCount < 2 ||
    participantCount > 1_000
  ) {
    throw new Error('participantCount must be an integer from 2 to 1000')
  }

  const backendPort = await selectPort(options.backendPort, 'backend')
  const frontendPort = await selectPort(options.frontendPort, 'frontend')
  if (backendPort === frontendPort) {
    throw new Error('Backend and frontend ports must be different')
  }
  // Recheck both after selection. Strict listeners remain authoritative if a
  // different process wins the unavoidable bind race after this point.
  await assertPortAvailable(backendPort, 'backend')
  await assertPortAvailable(frontendPort, 'frontend')

  const temporaryRoot = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), 'sysu-welcome-e2e-'),
  )
  const databasePath = path.join(temporaryRoot, 'demo.sqlite')
  const manifestPath = path.join(temporaryRoot, 'demo-seed-manifest.json')
  const baseURL = `http://${TEST_HOST}:${frontendPort}`
  const backendOrigin = `http://${TEST_HOST}:${backendPort}`
  const environment: NodeJS.ProcessEnv = {
    ...safeInheritedEnvironment(),
    NODE_ENV: 'test',
    DEMO_BACKEND_HOST: TEST_HOST,
    DEMO_BACKEND_PORT: String(backendPort),
    DEMO_DATABASE_PATH: databasePath,
    DEMO_SEED_MANIFEST_PATH: manifestPath,
    DEMO_ALLOWED_ORIGINS: baseURL,
    DEMO_LOG_LEVEL: 'silent',
    DEMO_SEED_PARTICIPANT_COUNT: String(participantCount),
    DEMO_E2E_FRONTEND_PORT: String(frontendPort),
    DEMO_E2E_BACKEND_ORIGIN: backendOrigin,
  }

  let backend: ManagedProcess | null = null
  let vite: ManagedProcess | null = null
  let stopped = false
  let credentials: DemoTestCredentials

  try {
    await initializeDatabase(environment, startupTimeoutMs)
    credentials = readCredentials(manifestPath)

    backend = startBackend(environment)
    await waitForReady({
      url: `${backendOrigin}/api/ready`,
      process: backend,
      timeoutMs: startupTimeoutMs,
    })

    vite = startVite(environment)
    await waitForReady({
      url: `${baseURL}/api/ready`,
      process: vite,
      timeoutMs: startupTimeoutMs,
    })
  } catch (error) {
    if (vite) await stopProcess(vite)
    if (backend) await stopProcess(backend)
    await removeTemporaryRoot(temporaryRoot)
    throw error
  }

  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    await Promise.allSettled([
      vite ? stopProcess(vite) : Promise.resolve(),
      backend ? stopProcess(backend) : Promise.resolve(),
    ])
    vite = null
    backend = null
    await removeTemporaryRoot(temporaryRoot)
  }

  return {
    baseURL,
    manifestPath,
    credentials,
    async restartBackend() {
      if (stopped) throw new Error('Cannot restart a stopped E2E test stack')
      if (!backend) throw new Error('E2E backend process is unavailable')
      await stopProcess(backend)
      await waitForPortRelease(backendPort, 'backend', startupTimeoutMs)
      backend = startBackend(environment)
      try {
        await waitForReady({
          url: `${backendOrigin}/api/ready`,
          process: backend,
          timeoutMs: startupTimeoutMs,
        })
        await waitForReady({
          url: `${baseURL}/api/ready`,
          process: vite!,
          timeoutMs: startupTimeoutMs,
        })
      } catch (error) {
        await stop()
        throw error
      }
    },
    stop,
  }
}
