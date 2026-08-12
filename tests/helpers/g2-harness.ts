import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'

import { buildApp } from '../../backend/src/app.js'
import { BACKEND_ROOT, type AppConfig } from '../../backend/src/config.js'
import { migrateDatabase } from '../../backend/src/db/migrate.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import {
  readSeedManifest,
  seedDemoDatabase,
  type DemoSeedManifest,
} from '../../backend/src/db/seed.js'

export const TEST_ORIGIN = 'http://127.0.0.1:5173'
export const TEST_AUTHORITY = '127.0.0.1:3000'
export const PARTICIPANT_COOKIE_NAME = 'sysu_welcome_participant'
export const ADMIN_COOKIE_NAME = 'sysu_welcome_admin'

export type TestResponse = LightMyRequestResponse

export interface G2Harness {
  app: FastifyInstance
  config: AppConfig
  manifest: DemoSeedManifest
  now(): Date
  advance(milliseconds?: number): void
  request(options: InjectOptions): Promise<TestResponse>
  unsafeRequest(options: InjectOptions, cookie?: string): Promise<TestResponse>
  activate(
    participantIndex?: number,
    options?: { idempotencyKey?: string },
  ): Promise<{
    response: TestResponse
    cookie: string
  }>
  adminLogin(): Promise<{
    response: TestResponse
    cookie: string
  }>
  restart(): Promise<void>
  close(): Promise<void>
}

function firstSetCookie(response: TestResponse): string {
  const header = response.headers['set-cookie']
  const value = Array.isArray(header) ? header[0] : header
  if (!value) throw new Error('Expected a Set-Cookie response header')
  return value
}

export function cookiePair(setCookieHeader: string): string {
  const separator = setCookieHeader.indexOf(';')
  return separator === -1
    ? setCookieHeader
    : setCookieHeader.slice(0, separator)
}

export function readSetCookie(response: TestResponse): {
  header: string
  cookie: string
} {
  const header = firstSetCookie(response)
  return { header, cookie: cookiePair(header) }
}

export function responseErrorCode(response: TestResponse): string | undefined {
  const body = response.json() as {
    error?: { code?: string }
  }
  return body.error?.code
}

export function commandVersion(snapshot: unknown): {
  resetEpoch: number
  stageRevision: number
} {
  const runtime = (snapshot as {
    runtime?: { resetEpoch?: unknown; stageRevision?: unknown }
  }).runtime
  if (
    typeof runtime?.resetEpoch !== 'number' ||
    typeof runtime.stageRevision !== 'number'
  ) {
    throw new Error('Response did not include a command version')
  }
  return {
    resetEpoch: runtime.resetEpoch,
    stageRevision: runtime.stageRevision,
  }
}

export function idempotencyKey(label: string, sequence = 1): string {
  return `test-${label}-${sequence.toString().padStart(4, '0')}`
}

export async function createG2Harness(options?: {
  participantCount?: number
  initialNow?: Date
}): Promise<G2Harness> {
  const participantCount = options?.participantCount ?? 4
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'sysu-welcome-g2-'),
  )
  const config: AppConfig = {
    host: '127.0.0.1',
    port: 3000,
    databasePath: path.join(temporaryDirectory, 'demo.sqlite'),
    seedManifestPath: path.join(
      temporaryDirectory,
      'demo-seed-manifest.json',
    ),
    migrationsPath: path.join(BACKEND_ROOT, 'migrations'),
    allowedOrigins: [TEST_ORIGIN],
    logLevel: 'silent',
    seedParticipantCount: participantCount,
  }
  let currentTime = new Date(
    options?.initialNow ?? '2026-08-10T04:00:00.000Z',
  ).getTime()
  const now = () => new Date(currentTime)

  const database = openDatabase(config.databasePath)
  try {
    migrateDatabase(database, config.migrationsPath, now)
    seedDemoDatabase(database, {
      manifestPath: config.seedManifestPath,
      participantCount,
      now,
    })
  } finally {
    database.close()
  }

  const manifest = readSeedManifest(config.seedManifestPath)
  let app = await buildApp({ config, logger: false, now })
  await app.ready()

  const request = (requestOptions: InjectOptions) =>
    app.inject({
      ...requestOptions,
      headers: {
        host: TEST_AUTHORITY,
        ...requestOptions.headers,
      },
    })

  const unsafeRequest = (requestOptions: InjectOptions, cookie?: string) =>
    request({
      ...requestOptions,
      headers: {
        origin: TEST_ORIGIN,
        ...(cookie ? { cookie } : {}),
        ...requestOptions.headers,
      },
    })

  const activate: G2Harness['activate'] = async (
    participantIndex = 0,
    activationOptions = {},
  ) => {
    const participant = manifest.participants[participantIndex]
    if (!participant) throw new Error('Synthetic participant is unavailable')
    const response = await unsafeRequest({
      method: 'POST',
      url: '/api/participant/activate',
      headers: {
        'idempotency-key':
          activationOptions.idempotencyKey ??
          idempotencyKey('activate', participantIndex + 1),
      },
      payload: {
        method: 'INVITATION_TOKEN',
        token: participant.inviteToken,
      },
    })
    if (response.statusCode !== 200) {
      throw new Error('Synthetic participant activation failed')
    }
    return { response, cookie: readSetCookie(response).cookie }
  }

  const adminLogin: G2Harness['adminLogin'] = async () => {
    const response = await unsafeRequest({
      method: 'POST',
      url: '/api/admin/login',
      payload: {
        username: manifest.admin.username,
        password: manifest.admin.password,
      },
    })
    if (response.statusCode !== 200) {
      throw new Error('Synthetic administrator login failed')
    }
    return { response, cookie: readSetCookie(response).cookie }
  }

  let closed = false
  return {
    get app() {
      return app
    },
    config,
    manifest,
    now,
    advance(milliseconds = 1_000) {
      currentTime += milliseconds
    },
    request,
    unsafeRequest,
    activate,
    adminLogin,
    async restart() {
      await app.close()
      app = await buildApp({ config, logger: false, now })
      await app.ready()
    },
    async close() {
      if (closed) return
      closed = true
      await app.close()
      fs.rmSync(temporaryDirectory, { recursive: true, force: true })
    },
  }
}
