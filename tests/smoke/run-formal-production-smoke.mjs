import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { BACKEND_ROOT } from '../../backend/dist/config.js'
import { openDatabase } from '../../backend/dist/db/open-database.js'
import { importProtectedRoster } from '../../backend/dist/db/protected-roster.js'
import { readProtectedRuntimeSecret } from '../../backend/dist/db/seed.js'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const publicOrigin = 'https://welcome.example.edu.cn'
const publicHost = new URL(publicOrigin).host

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Unable to allocate a formal smoke port'))
        return
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}

function request(port, pathname, options = {}) {
  const body = options.body ? JSON.stringify(options.body) : null
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method: options.method ?? 'GET',
        headers: {
          host: publicHost,
          origin: publicOrigin,
          ...(body
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          text += chunk
        })
        response.on('end', () => {
          resolve({ status: response.statusCode ?? 0, headers: response.headers, text })
        })
      },
    )
    request.once('error', reject)
    if (body) request.write(body)
    request.end()
  })
}

async function waitForReady(port, child) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('Formal backend exited before becoming ready')
    }
    try {
      const response = await request(port, '/api/protocol-capabilities')
      if (response.status === 200) {
        const payload = JSON.parse(response.text)
        if (
          payload.contractVersion === '2' &&
          payload.activeRuntimeVersion === '2' &&
          payload.activationState === 'ACTIVE'
        ) {
          return
        }
      }
    } catch {
      // The socket can open shortly before protocol readiness is visible.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Formal backend did not become ready within 20 seconds')
}

async function stopProcessTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return
  }
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
}

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'sysu-welcome-formal-production-smoke-'),
)
const runtimeDirectory = path.join(temporaryDirectory, 'runtime')
fs.mkdirSync(runtimeDirectory, { mode: 0o700 })
const databasePath = path.join(runtimeDirectory, '2026-roster.sqlite')
const secretPath = path.join(runtimeDirectory, '2026-runtime-secret.json')
const nfcMapPath = path.join(runtimeDirectory, '2026-nfc-map.csv')
let child = null

try {
  const database = openDatabase(databasePath)
  try {
    importProtectedRoster(
      database,
      {
        schemaVersion: 1,
        sourceSha256: 'e'.repeat(64),
        records: [
          { displayName: '生产烟测甲', studentNumber: '26000001' },
          { displayName: '生产烟测乙', studentNumber: '26000002' },
        ],
      },
      {
        migrationsPath: path.join(BACKEND_ROOT, 'migrations'),
        runtimeSecretPath: secretPath,
        nfcMapPath,
        publicOrigin,
        now: () => new Date('2026-09-05T01:00:00.000Z'),
      },
    )
  } finally {
    database.close()
  }
  for (const filePath of [databasePath, secretPath, nfcMapPath]) {
    fs.chmodSync(filePath, 0o600)
  }

  const port = await availablePort()
  child = spawn(process.execPath, ['scripts/start-formal.mjs'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      FORMAL_RUNTIME_DIR: runtimeDirectory,
      FORMAL_PUBLIC_ORIGIN: publicOrigin,
      DEMO_BACKEND_PORT: String(port),
      DEMO_LOG_LEVEL: 'silent',
      DEMO_METRICS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  })
  let startupOutput = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    startupOutput = `${startupOutput}${chunk}`.slice(-16_384)
  })
  child.stderr.on('data', (chunk) => {
    startupOutput = `${startupOutput}${chunk}`.slice(-16_384)
  })

  try {
    await waitForReady(port, child)
  } catch (error) {
    throw new Error(`${error.message}\n${startupOutput}`)
  }
  const secret = readProtectedRuntimeSecret(secretPath)
  const login = await request(port, '/api/v2/admin/login', {
    method: 'POST',
    body: {
      username: secret.admin.username,
      password: secret.admin.password,
    },
  })
  if (login.status !== 200) {
    throw new Error(`Formal admin login failed with HTTP ${login.status}`)
  }
  const setCookie = login.headers['set-cookie']?.[0] ?? ''
  for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Secure']) {
    if (!setCookie.includes(attribute)) {
      throw new Error(`Formal session cookie is missing ${attribute}`)
    }
  }
  console.log('formal-production-smoke OK: verified PROTECTED startup, loopback API and Secure session cookie')
} finally {
  if (child) await stopProcessTree(child)
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
}
