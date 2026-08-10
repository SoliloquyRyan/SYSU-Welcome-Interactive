import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ApiErrorResponseSchema,
  HealthResponseSchema,
  ReadyResponseSchema,
  ScreenSnapshotSchema,
} from '../../packages/contracts/src/index.js'
import { buildApp } from '../../backend/src/app.js'
import { BACKEND_ROOT, type AppConfig } from '../../backend/src/config.js'
import { migrateDatabase } from '../../backend/src/db/migrate.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import {
  readSeedManifest,
  seedDemoDatabase,
} from '../../backend/src/db/seed.js'

const NOW = new Date('2026-08-10T04:00:00.000Z')

function collectCredentialStrings(
  value: unknown,
  parentKey = '',
  result = new Set<string>(),
): Set<string> {
  if (typeof value === 'string') {
    if (/(?:token|code|password|pepper)/i.test(parentKey) && value.length >= 6) {
      result.add(value)
    }
    return result
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectCredentialStrings(item, parentKey, result)
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectCredentialStrings(child, key, result)
    }
  }
  return result
}

function collectObjectKeys(value: unknown, result = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectKeys(item, result)
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      result.add(key)
      collectObjectKeys(child, result)
    }
  }
  return result
}

function waitForWebSocketOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('WebSocket open timed out')),
      5_000,
    )
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeout)
        resolve()
      },
      { once: true },
    )
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout)
        reject(new Error('WebSocket failed before opening'))
      },
      { once: true },
    )
  })
}

function waitForWebSocketClose(
  socket: WebSocket,
): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('WebSocket close timed out')),
      5_000,
    )
    socket.addEventListener(
      'close',
      (event) => {
        clearTimeout(timeout)
        resolve({ code: event.code, reason: event.reason })
      },
      { once: true },
    )
  })
}

describe('G1 system HTTP and WebSocket boundary', () => {
  let temporaryDirectory: string
  let config: AppConfig
  let app: FastifyInstance | undefined

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sysu-welcome-api-'),
    )
    config = {
      host: '127.0.0.1',
      port: 0,
      databasePath: path.join(temporaryDirectory, 'demo.sqlite'),
      seedManifestPath: path.join(
        temporaryDirectory,
        'demo-seed-manifest.json',
      ),
      migrationsPath: path.join(BACKEND_ROOT, 'migrations'),
      allowedOrigins: ['http://127.0.0.1:5173'],
      logLevel: 'silent',
      seedParticipantCount: 300,
    }
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  function initializeDatabase(): void {
    const database = openDatabase(config.databasePath)
    try {
      migrateDatabase(database, config.migrationsPath, () => NOW)
      seedDemoDatabase(database, {
        manifestPath: config.seedManifestPath,
        participantCount: config.seedParticipantCount,
        now: () => NOW,
      })
    } finally {
      database.close()
    }
  }

  it('keeps health alive but fails readiness and snapshot closed before setup', async () => {
    app = await buildApp({ config, logger: false, now: () => NOW })

    const health = await app.inject({ method: 'GET', url: '/api/health' })
    const ready = await app.inject({ method: 'GET', url: '/api/ready' })
    const snapshot = await app.inject({
      method: 'GET',
      url: '/api/screen/snapshot',
    })

    expect(health.statusCode).toBe(200)
    expect(HealthResponseSchema.parse(health.json())).toMatchObject({
      status: 'ok',
      protocolVersion: '1',
    })
    expect(ready.statusCode).toBe(503)
    expect(ReadyResponseSchema.parse(ready.json())).toMatchObject({
      status: 'not_ready',
      checks: { migrations: 'not_ready', seed: 'not_ready' },
    })
    expect(snapshot.statusCode).toBe(503)
    expect(ReadyResponseSchema.parse(snapshot.json()).status).toBe('not_ready')
  })

  it('serves contract-valid ready and anonymous screen responses after setup', async () => {
    initializeDatabase()
    app = await buildApp({ config, logger: false, now: () => NOW })

    const health = await app.inject({ method: 'GET', url: '/api/health' })
    const ready = await app.inject({ method: 'GET', url: '/api/ready' })
    const snapshot = await app.inject({
      method: 'GET',
      url: '/api/screen/snapshot',
    })
    const healthBody = HealthResponseSchema.parse(health.json())
    const readyBody = ReadyResponseSchema.parse(ready.json())
    const snapshotBody = ScreenSnapshotSchema.parse(snapshot.json())

    expect(health.statusCode).toBe(200)
    expect(ready.statusCode).toBe(200)
    expect(snapshot.statusCode).toBe(200)
    expect(healthBody.status).toBe('ok')
    expect(readyBody).toMatchObject({
      status: 'ready',
      seedParticipantCount: 300,
      resetEpoch: 1,
      stageRevision: 0,
      checks: {
        database: 'ready',
        migrations: 'ready',
        seed: 'ready',
        realtime: 'ready',
      },
    })
    expect(snapshotBody.programs).toHaveLength(3)

    const publicBodies = [healthBody, readyBody, snapshotBody]
    const publicKeys = collectObjectKeys(publicBodies)
    for (const forbiddenKey of [
      'displayName',
      'demoCode',
      'demoCodeDigest',
      'inviteToken',
      'invitationToken',
      'tokenDigest',
      'tokenHint',
      'password',
      'passwordDigest',
      'privateFutureMessage',
      'databasePath',
      'seedManifestPath',
    ]) {
      expect(publicKeys.has(forbiddenKey)).toBe(false)
    }

    const manifest = readSeedManifest(config.seedManifestPath)
    const credentialStrings = collectCredentialStrings(manifest)
    const serializedResponses = JSON.stringify(publicBodies)
    for (const credential of credentialStrings) {
      expect(serializedResponses).not.toContain(credential)
    }
  })

  it('rejects untrusted hosts, origins and unknown API routes with public errors', async () => {
    app = await buildApp({ config, logger: false, now: () => NOW })

    const badHost = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'example.invalid' },
    })
    const badOrigin = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        host: '127.0.0.1:3000',
        origin: 'http://example.invalid',
      },
    })
    const missing = await app.inject({ method: 'GET', url: '/api/missing' })

    expect(badHost.statusCode).toBe(403)
    expect(badOrigin.statusCode).toBe(403)
    expect(missing.statusCode).toBe(404)
    expect(ApiErrorResponseSchema.parse(badHost.json()).error.code).toBe(
      'VALIDATION_FAILED',
    )
    expect(ApiErrorResponseSchema.parse(badOrigin.json()).error.code).toBe(
      'VALIDATION_FAILED',
    )
    expect(ApiErrorResponseSchema.parse(missing.json()).error.code).toBe(
      'VALIDATION_FAILED',
    )
  })

  it('rejects a WebSocket upgrade from an untrusted Origin without poisoning legal upgrades', async () => {
    initializeDatabase()
    app = await buildApp({ config, logger: false, now: () => NOW })
    await app.listen({ host: config.host, port: 0 })
    const cursor = ScreenSnapshotSchema.parse(
      (
        await app.inject({ method: 'GET', url: '/api/screen/snapshot' })
      ).json(),
    )
    const wsPath = `/ws?resetEpoch=${cursor.runtime.resetEpoch}&afterEventSeq=${cursor.eventSeq}`

    await expect(
      app.injectWS(wsPath, {
        headers: {
          host: 'localhost',
          origin: 'http://example.invalid',
        },
      }),
    ).rejects.toThrow(/Unexpected server response: 403/i)

    const legalSocket = await app.injectWS(wsPath, {
      headers: {
        host: 'localhost',
        origin: 'http://127.0.0.1:5173',
      },
    })
    const legalClose = waitForWebSocketClose(
      legalSocket as unknown as WebSocket,
    )
    legalSocket.send('legal handshake reached the read-only channel')
    await expect(legalClose).resolves.toEqual({
      code: 1008,
      reason: 'G1 public channel is read-only',
    })
  })

  it('upgrades WebSocket connections, enforces read-only input and closes cleanly', async () => {
    initializeDatabase()
    app = await buildApp({ config, logger: false, now: () => NOW })
    await app.listen({ host: config.host, port: 0 })
    const cursor = ScreenSnapshotSchema.parse(
      (
        await app.inject({ method: 'GET', url: '/api/screen/snapshot' })
      ).json(),
    )
    const wsPath = `/ws?resetEpoch=${cursor.runtime.resetEpoch}&afterEventSeq=${cursor.eventSeq}`
    const upgradeHeaders = {
      host: 'localhost',
      origin: 'http://127.0.0.1:5173',
    }

    const readOnlySocket = await app.injectWS(wsPath, {
      headers: upgradeHeaders,
    })
    const policyClose = waitForWebSocketClose(
      readOnlySocket as unknown as WebSocket,
    )
    readOnlySocket.send('client writes are not allowed')
    await expect(policyClose).resolves.toEqual({
      code: 1008,
      reason: 'G1 public channel is read-only',
    })

    const oversizedSocket = await app.injectWS(wsPath, {
      headers: upgradeHeaders,
    })
    const oversizedClose = waitForWebSocketClose(
      oversizedSocket as unknown as WebSocket,
    )
    oversizedSocket.send('x'.repeat(4_097))
    await expect(oversizedClose).resolves.toMatchObject({ code: 1009 })

    const healthAfterOversizedMessage = await app.inject({
      method: 'GET',
      url: '/api/health',
    })
    expect(healthAfterOversizedMessage.statusCode).toBe(200)
    expect(
      HealthResponseSchema.parse(healthAfterOversizedMessage.json()).status,
    ).toBe('ok')

    const shutdownSocket = await app.injectWS(wsPath, {
      headers: upgradeHeaders,
    })
    const shutdownClose = waitForWebSocketClose(
      shutdownSocket as unknown as WebSocket,
    )
    const closingApp = app
    app = undefined
    await closingApp.close()

    await expect(shutdownClose).resolves.toMatchObject({ code: 1001 })
  })
})
