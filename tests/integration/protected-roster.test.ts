import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BACKEND_ROOT } from '../../backend/src/config.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import { importProtectedRoster } from '../../backend/src/db/protected-roster.js'
import {
  readCredentialContext,
  verifyIdentityDirectory,
} from '../../backend/src/db/seed.js'
import {
  readProtocolRuntime,
  resetSyntheticV2Database,
  V2_DESTRUCTIVE_CONFIRMATION,
  verifyV2Foundation,
} from '../../backend/src/db/v2-foundation.js'
import { activateV2Participant } from '../../backend/src/services/v2-participant-onboarding.js'

const NOW = new Date('2026-09-04T12:00:00.000Z')
const MIGRATIONS_PATH = path.join(BACKEND_ROOT, 'migrations')

describe('D-054 protected roster import', () => {
  let temporaryDirectory: string
  let databasePath: string
  let secretPath: string
  let nfcMapPath: string
  let database: ReturnType<typeof openDatabase>

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sysu-welcome-protected-roster-'),
    )
    databasePath = path.join(temporaryDirectory, 'roster.sqlite')
    secretPath = path.join(temporaryDirectory, 'runtime-secret.json')
    nfcMapPath = path.join(temporaryDirectory, 'nfc-map.csv')
    database = openDatabase(databasePath)
  })

  afterEach(() => {
    if (database.open) database.close()
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  function importRoster() {
    return importProtectedRoster(
      database,
      {
        schemaVersion: 1,
        sourceSha256: 'a'.repeat(64),
        records: [
          { displayName: '测试甲', studentNumber: '26000001' },
          { displayName: '测试乙', studentNumber: '26000002' },
        ],
      },
      {
        migrationsPath: MIGRATIONS_PATH,
        runtimeSecretPath: secretPath,
        nfcMapPath,
        publicOrigin: 'https://welcome.example.edu.cn/event',
        now: () => NOW,
      },
    )
  }

  it('creates a verified protected v2 directory without putting student IDs in URLs', () => {
    const result = importRoster()

    expect(result).toMatchObject({ participantCount: 2, schemaVersion: 14 })
    expect(readProtocolRuntime(database)).toMatchObject({
      activeProtocolVersion: '2',
      activationState: 'V2_ACTIVE',
      dataClassification: 'PROTECTED',
      cutoverBackupSha256: null,
      protectedSourceSha256: 'a'.repeat(64),
      protectedImportedAt: NOW.toISOString(),
    })
    expect(
      verifyIdentityDirectory(database, {
        manifestPath: secretPath,
        participantCount: 2,
      }),
    ).toMatchObject({ ready: true, participantCount: 2, issues: [] })
    expect(
      verifyV2Foundation(database, {
        migrationsPath: MIGRATIONS_PATH,
        manifestPath: secretPath,
        participantCount: 2,
      }),
    ).toMatchObject({
      ready: true,
      schemaVersion: 14,
      participantCount: 2,
      resetEpoch: 1,
      issues: [],
    })

    const secretText = fs.readFileSync(secretPath, 'utf8')
    expect(secretText).not.toContain('测试甲')
    expect(secretText).not.toContain('26000001')
    const nfcMap = fs.readFileSync(nfcMapPath, 'utf8')
    expect(nfcMap).toContain('https://welcome.example.edu.cn/event/welcome?token=')
    expect(nfcMap).not.toContain('token=26000001')
    expect(nfcMap.match(/welcome\?token=/g)).toHaveLength(2)
  })

  it('accepts an eight-digit protected student ID and rejects Demo reset', () => {
    importRoster()
    const activation = activateV2Participant(
      database,
      readCredentialContext(secretPath),
      {
        protocolVersion: '2',
        resetEpoch: 1,
        idempotencyKey: 'protected-activation-0001',
        method: 'ASSISTED_STUDENT',
        displayName: '测试甲',
        studentNumber: '26000001',
      },
      NOW,
    )
    expect(activation.snapshot.participant.displayName).toBe('测试甲')

    expect(() =>
      resetSyntheticV2Database(database, {
        migrationsPath: MIGRATIONS_PATH,
        manifestPath: secretPath,
        participantCount: 2,
        confirmation: V2_DESTRUCTIVE_CONFIRMATION,
        now: () => NOW,
      }),
    ).toThrowError(/Protected, real, non-rebuildable or valuable data cannot be reset/)
  })

  it('fails closed on duplicate student IDs or an existing private output', () => {
    expect(() =>
      importProtectedRoster(
        database,
        {
          schemaVersion: 1,
          sourceSha256: 'b'.repeat(64),
          records: [
            { displayName: '测试甲', studentNumber: '26000001' },
            { displayName: '测试乙', studentNumber: '26000001' },
          ],
        },
        {
          migrationsPath: MIGRATIONS_PATH,
          runtimeSecretPath: secretPath,
          nfcMapPath,
          now: () => NOW,
        },
      ),
    ).toThrowError(/duplicate student numbers/)

    fs.writeFileSync(secretPath, '{}')
    expect(() => importRoster()).toThrowError(/output already exists/)
  })

  it('rejects a non-HTTPS formal NFC origin before applying migrations', () => {
    expect(() =>
      importProtectedRoster(
        database,
        {
          schemaVersion: 1,
          sourceSha256: 'c'.repeat(64),
          records: [{ displayName: '测试甲', studentNumber: '26000001' }],
        },
        {
          migrationsPath: MIGRATIONS_PATH,
          runtimeSecretPath: secretPath,
          nfcMapPath,
          publicOrigin: 'http://welcome.example.edu.cn',
          now: () => NOW,
        },
      ),
    ).toThrowError(/must use HTTPS/)
    expect(
      database
        .prepare("SELECT count(*) FROM sqlite_master WHERE type = 'table'")
        .pluck()
        .get(),
    ).toBe(0)
    expect(fs.existsSync(secretPath)).toBe(false)
    expect(fs.existsSync(nfcMapPath)).toBe(false)
  })
})
