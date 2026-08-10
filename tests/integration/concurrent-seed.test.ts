import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { BACKEND_ROOT } from '../../backend/src/config.js'
import { migrateDatabase } from '../../backend/src/db/migrate.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import {
  fingerprintManifest,
  readSeedManifest,
  verifyDemoSeed,
} from '../../backend/src/db/seed.js'

const REPOSITORY_ROOT = path.resolve(BACKEND_ROOT, '..')
const OPEN_DATABASE_URL = pathToFileURL(
  path.join(BACKEND_ROOT, 'src', 'db', 'open-database.ts'),
).href
const SEED_URL = pathToFileURL(
  path.join(BACKEND_ROOT, 'src', 'db', 'seed.ts'),
).href

const CHILD_SOURCE = `
import fs from 'node:fs'
import { openDatabase } from ${JSON.stringify(OPEN_DATABASE_URL)}
import { seedDemoDatabase } from ${JSON.stringify(SEED_URL)}

const database = openDatabase(process.env.G1_DATABASE_PATH)
try {
  fs.writeFileSync(process.env.G1_READY_PATH, 'ready', { flag: 'wx' })
  while (!fs.existsSync(process.env.G1_START_GATE)) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  const result = seedDemoDatabase(database, {
    manifestPath: process.env.G1_MANIFEST_PATH,
    participantCount: 300,
    now: () => new Date('2026-08-10T04:00:00.000Z'),
  })
  process.stdout.write(JSON.stringify({
    createdManifest: result.createdManifest,
    participantCount: result.participantCount,
    fingerprint: result.fingerprint,
  }))
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : 'seed worker failed')
  process.exitCode = 1
} finally {
  database.close()
}
`

interface WorkerResult {
  createdManifest: boolean
  participantCount: number
  fingerprint: string
}

interface SeedWorker {
  child: ChildProcessWithoutNullStreams
  completion: Promise<WorkerResult>
}

function startSeedWorker(
  databasePath: string,
  manifestPath: string,
  startGatePath: string,
  readyPath: string,
): SeedWorker {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', CHILD_SOURCE],
    {
      cwd: REPOSITORY_ROOT,
      env: {
        ...process.env,
        G1_DATABASE_PATH: databasePath,
        G1_MANIFEST_PATH: manifestPath,
        G1_START_GATE: startGatePath,
        G1_READY_PATH: readyPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk
  })

  const completion = new Promise<WorkerResult>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`seed worker exited with ${code}: ${stderr}`))
        return
      }
      try {
        const parsed = JSON.parse(stdout) as WorkerResult
        expect(Object.keys(parsed).sort()).toEqual([
          'createdManifest',
          'fingerprint',
          'participantCount',
        ])
        resolve(parsed)
      } catch (error) {
        reject(error)
      }
    })
  })

  return { child, completion }
}

async function waitForReadyFiles(
  paths: readonly string[],
  workers: readonly SeedWorker[],
): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!paths.every((readyPath) => fs.existsSync(readyPath))) {
    const failedWorker = workers.find(({ child }) => child.exitCode !== null)
    if (failedWorker) {
      await failedWorker.completion
    }
    if (Date.now() >= deadline) {
      throw new Error('seed workers did not reach the concurrency barrier')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('concurrent seed initialization', () => {
  it('keeps one manifest and one 300-participant catalog across two processes', async () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sysu-welcome-concurrent-seed-'),
    )
    const databasePath = path.join(temporaryDirectory, 'demo.sqlite')
    const manifestPath = path.join(
      temporaryDirectory,
      'demo-seed-manifest.json',
    )
    const startGatePath = path.join(temporaryDirectory, 'start-gate')
    const readyPaths = [
      path.join(temporaryDirectory, 'worker-a.ready'),
      path.join(temporaryDirectory, 'worker-b.ready'),
    ]
    const migrationDatabase = openDatabase(databasePath)
    migrateDatabase(migrationDatabase, path.join(BACKEND_ROOT, 'migrations'))
    migrationDatabase.close()

    const workers = readyPaths.map((readyPath) =>
      startSeedWorker(databasePath, manifestPath, startGatePath, readyPath),
    )

    try {
      await waitForReadyFiles(readyPaths, workers)
      fs.writeFileSync(startGatePath, 'go', { flag: 'wx' })
      const results = await Promise.all(
        workers.map(({ completion }) => completion),
      )

      expect(results.map(({ participantCount }) => participantCount)).toEqual([
        300, 300,
      ])
      expect(results.filter(({ createdManifest }) => createdManifest)).toHaveLength(
        1,
      )
      expect(new Set(results.map(({ fingerprint }) => fingerprint))).toHaveLength(
        1,
      )

      const manifestFiles = fs
        .readdirSync(temporaryDirectory)
        .filter((name) => name.startsWith('demo-seed-manifest.json'))
      expect(manifestFiles).toEqual(['demo-seed-manifest.json'])

      const database = openDatabase(databasePath)
      try {
        const manifest = readSeedManifest(manifestPath)
        const manifestFingerprint = fingerprintManifest(manifest)
        const counts = database
          .prepare(
            `SELECT
               (SELECT count(*) FROM synthetic_identities) AS identities,
               (SELECT count(*) FROM invitation_tokens) AS invitations,
               (SELECT count(*) FROM program_catalog) AS programs,
               (SELECT count(*) FROM gift_catalog) AS gifts,
               (SELECT count(*) FROM admin_accounts) AS admins`,
          )
          .get()
        const verification = verifyDemoSeed(database, {
          manifestPath,
          participantCount: 300,
        })

        expect(counts).toEqual({
          identities: 300,
          invitations: 300,
          programs: 3,
          gifts: 4,
          admins: 1,
        })
        expect(verification).toMatchObject({
          ready: true,
          issues: [],
          participantCount: 300,
          fingerprint: manifestFingerprint,
        })
        expect(results.map(({ fingerprint }) => fingerprint)).toEqual([
          manifestFingerprint,
          manifestFingerprint,
        ])
      } finally {
        database.close()
      }
    } finally {
      for (const { child } of workers) {
        if (child.exitCode === null) child.kill()
      }
      fs.rmSync(temporaryDirectory, { recursive: true, force: true })
    }
  })
})
