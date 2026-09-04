import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BACKEND_ROOT } from '../../backend/src/config.js'
import {
  createFormalBackup,
  FORMAL_BACKUP_CONFIRMATION,
  FORMAL_RESTORE_CONFIRMATION,
  restoreFormalBackup,
} from '../../backend/src/db/formal-backup.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import { importProtectedRoster } from '../../backend/src/db/protected-roster.js'
import { verifyV2Foundation } from '../../backend/src/db/v2-foundation.js'

const MIGRATIONS_PATH = path.join(BACKEND_ROOT, 'migrations')
const REPOSITORY_ROOT = path.resolve(BACKEND_ROOT, '..')

describe('D-056 protected runtime backup and recovery', () => {
  let temporaryDirectory: string
  let sourceDirectory: string
  let databasePath: string
  let runtimeSecretPath: string
  let nfcMapPath: string
  let database: ReturnType<typeof openDatabase>

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sysu-welcome-formal-backup-'),
    )
    sourceDirectory = path.join(temporaryDirectory, 'source')
    fs.mkdirSync(sourceDirectory)
    databasePath = path.join(sourceDirectory, 'source.sqlite')
    runtimeSecretPath = path.join(sourceDirectory, 'source-secret.json')
    nfcMapPath = path.join(sourceDirectory, 'source-nfc.csv')
    database = openDatabase(databasePath)
    importProtectedRoster(
      database,
      {
        schemaVersion: 1,
        sourceSha256: 'd'.repeat(64),
        records: [
          { displayName: '合成排练甲', studentNumber: '26000001' },
          { displayName: '合成排练乙', studentNumber: '26000002' },
        ],
      },
      {
        migrationsPath: MIGRATIONS_PATH,
        runtimeSecretPath,
        nfcMapPath,
        now: () => new Date('2026-09-05T00:00:00.000Z'),
      },
    )
  })

  afterEach(() => {
    if (database.open) database.close()
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  it('creates an online SQLite backup bundle and restores it to a new verified directory', async () => {
    const bundleDirectory = path.join(temporaryDirectory, 'bundle')
    const bundle = await createFormalBackup({
      databasePath,
      runtimeSecretPath,
      nfcMapPath,
      outputDirectory: bundleDirectory,
      migrationsPath: MIGRATIONS_PATH,
      forbiddenRepositoryRoot: REPOSITORY_ROOT,
      confirmation: FORMAL_BACKUP_CONFIRMATION,
      now: () => new Date('2026-09-05T00:30:00.000Z'),
    })

    expect(bundle.participantCount).toBe(2)
    expect(fs.readdirSync(bundleDirectory).sort()).toEqual([
      '2026-nfc-map.csv',
      '2026-roster.sqlite',
      '2026-runtime-secret.json',
      'backup-manifest.json',
    ])
    expect(fs.existsSync(`${bundle.databasePath}-wal`)).toBe(false)
    expect(fs.existsSync(`${bundle.databasePath}-shm`)).toBe(false)

    const restoredDirectory = path.join(temporaryDirectory, 'restored')
    const restored = restoreFormalBackup({
      bundleDirectory,
      outputDirectory: restoredDirectory,
      migrationsPath: MIGRATIONS_PATH,
      forbiddenRepositoryRoot: REPOSITORY_ROOT,
      confirmation: FORMAL_RESTORE_CONFIRMATION,
    })
    const restoredDatabase = openDatabase(restored.databasePath)
    try {
      expect(
        verifyV2Foundation(restoredDatabase, {
          migrationsPath: MIGRATIONS_PATH,
          manifestPath: restored.runtimeSecretPath,
          participantCount: 2,
        }),
      ).toMatchObject({ ready: true, participantCount: 2, issues: [] })
    } finally {
      restoredDatabase.close()
    }
  })

  it('rejects a tampered bundle before creating a recovery directory', async () => {
    const bundleDirectory = path.join(temporaryDirectory, 'bundle')
    await createFormalBackup({
      databasePath,
      runtimeSecretPath,
      nfcMapPath,
      outputDirectory: bundleDirectory,
      migrationsPath: MIGRATIONS_PATH,
      forbiddenRepositoryRoot: REPOSITORY_ROOT,
      confirmation: FORMAL_BACKUP_CONFIRMATION,
    })
    fs.appendFileSync(path.join(bundleDirectory, '2026-nfc-map.csv'), 'tampered')
    const restoredDirectory = path.join(temporaryDirectory, 'restored')

    expect(() =>
      restoreFormalBackup({
        bundleDirectory,
        outputDirectory: restoredDirectory,
        migrationsPath: MIGRATIONS_PATH,
        forbiddenRepositoryRoot: REPOSITORY_ROOT,
        confirmation: FORMAL_RESTORE_CONFIRMATION,
      }),
    ).toThrowError(/checksum mismatch/)
    expect(fs.existsSync(restoredDirectory)).toBe(false)
  })

  it('rejects a mismatched NFC mapping before creating a backup directory', async () => {
    const mapping = fs.readFileSync(nfcMapPath, 'utf8')
    fs.writeFileSync(
      nfcMapPath,
      mapping.replace('/welcome?token=', '/welcome?token=A'),
      'utf8',
    )
    const bundleDirectory = path.join(temporaryDirectory, 'bundle')

    await expect(
      createFormalBackup({
        databasePath,
        runtimeSecretPath,
        nfcMapPath,
        outputDirectory: bundleDirectory,
        migrationsPath: MIGRATIONS_PATH,
        forbiddenRepositoryRoot: REPOSITORY_ROOT,
        confirmation: FORMAL_BACKUP_CONFIRMATION,
      }),
    ).rejects.toThrowError(/invalid invitation token|does not match/)
    expect(fs.existsSync(bundleDirectory)).toBe(false)
  })

  it('requires explicit confirmations and refuses outputs inside the repository', async () => {
    await expect(
      createFormalBackup({
        databasePath,
        runtimeSecretPath,
        nfcMapPath,
        outputDirectory: path.join(temporaryDirectory, 'no-confirmation'),
        migrationsPath: MIGRATIONS_PATH,
        forbiddenRepositoryRoot: REPOSITORY_ROOT,
        confirmation: '',
      }),
    ).rejects.toThrowError(/confirmation is missing/)

    await expect(
      createFormalBackup({
        databasePath,
        runtimeSecretPath,
        nfcMapPath,
        outputDirectory: path.join(REPOSITORY_ROOT, 'backups', 'forbidden-test'),
        migrationsPath: MIGRATIONS_PATH,
        forbiddenRepositoryRoot: REPOSITORY_ROOT,
        confirmation: FORMAL_BACKUP_CONFIRMATION,
      }),
    ).rejects.toThrowError(/outside the Git repository/)
  })
})
