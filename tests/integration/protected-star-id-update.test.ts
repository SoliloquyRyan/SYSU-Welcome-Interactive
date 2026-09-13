import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BACKEND_ROOT } from '../../backend/src/config.js'
import { openDatabase } from '../../backend/src/db/open-database.js'
import { importProtectedRoster } from '../../backend/src/db/protected-roster.js'
import { parseProtectedNfcCsv } from '../../backend/src/db/protected-nfc-map.js'
import { previewProtectedStarIds, updateProtectedStarIds } from '../../backend/src/db/protected-star-id-update.js'
import { fingerprintProtectedDirectoryDatabase, readCredentialContext } from '../../backend/src/db/seed.js'
import { activateV2Participant } from '../../backend/src/services/v2-participant-onboarding.js'

describe('D-065 protected star ID maintenance', () => {
  let temporaryDirectory: string
  let database: ReturnType<typeof openDatabase>
  let options: { migrationsPath: string; runtimeSecretPath: string; nfcMapPath: string; journalPath: string }
  const oldCodes = ['Z-0002', 'L-0001']

  function codes() {
    return database.prepare('SELECT public_star_id FROM synthetic_identities ORDER BY seed_index').pluck().all()
  }
  function setLegacyDatabaseCodes() {
    const identities = database.prepare('SELECT id FROM synthetic_identities ORDER BY seed_index').pluck().all() as string[]
    for (const table of ['synthetic_identities', 'v2_identity_slots']) {
      const key = table === 'synthetic_identities' ? 'id' : 'identity_id'
      identities.forEach((id, index) => database.prepare(`UPDATE ${table} SET public_star_id = ? WHERE ${key} = ?`).run(`X-999${index}`, id))
      identities.forEach((id, index) => database.prepare(`UPDATE ${table} SET public_star_id = ? WHERE ${key} = ?`).run(oldCodes[index], id))
    }
    const fingerprint = fingerprintProtectedDirectoryDatabase(database)
    database.prepare('UPDATE demo_seed_meta SET seed_fingerprint = ?').run(fingerprint)
    database.prepare('UPDATE app_state SET seed_fingerprint = ?').run(fingerprint)
    return fingerprint
  }

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'welcome-star-id-test-'))
    database = openDatabase(path.join(temporaryDirectory, 'test.sqlite'))
    options = { migrationsPath: path.join(BACKEND_ROOT, 'migrations'),
      runtimeSecretPath: path.join(temporaryDirectory, 'secret.json'),
      nfcMapPath: path.join(temporaryDirectory, 'nfc.csv'), journalPath: path.join(temporaryDirectory, 'journal.json') }
    importProtectedRoster(database, { schemaVersion: 1, sourceSha256: 'a'.repeat(64), records: [
      { displayName: '林测试', studentNumber: '26000001' }, { displayName: '曾测试', studentNumber: '26000002' },
    ] }, options)
    const fingerprint = setLegacyDatabaseCodes()
    const secret = JSON.parse(fs.readFileSync(options.runtimeSecretPath, 'utf8'))
    fs.writeFileSync(options.runtimeSecretPath, JSON.stringify({ ...secret, directoryFingerprint: fingerprint }))
    const csv = parseProtectedNfcCsv(fs.readFileSync(options.nfcMapPath, 'utf8'))
    csv.slice(1).forEach((row, index) => { row[3] = oldCodes[index]! })
    fs.writeFileSync(options.nfcMapPath, csv.map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\r\n'))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    database.close()
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  it('previews, swaps identifiers, preserves identity/authentication material and rolls back', () => {
    const secretBefore = JSON.parse(fs.readFileSync(options.runtimeSecretPath, 'utf8'))
    const csvBefore = parseProtectedNfcCsv(fs.readFileSync(options.nfcMapPath, 'utf8'))
    const invites = database.prepare('SELECT * FROM invitation_tokens ORDER BY id').all()
    const slots = database.prepare('SELECT identity_id, formation_slot FROM v2_identity_slots ORDER BY seed_index').all()
    expect(previewProtectedStarIds(database, options)).toMatchObject({ changedCount: 2, participantCount: 2, schemaVersion: 21 })
    expect(fs.existsSync(options.journalPath)).toBe(false)
    expect(updateProtectedStarIds(database, options)).toMatchObject({ changedCount: 2, state: 'applied' })
    expect(codes()).toEqual(['L-0001', 'Z-0002'])
    const secretAfter = JSON.parse(fs.readFileSync(options.runtimeSecretPath, 'utf8'))
    expect({ ...secretAfter, directoryFingerprint: '' }).toEqual({ ...secretBefore, directoryFingerprint: '' })
    const csvAfter = parseProtectedNfcCsv(fs.readFileSync(options.nfcMapPath, 'utf8'))
    expect(csvAfter.map(row => row.filter((_, col) => col !== 3))).toEqual(csvBefore.map(row => row.filter((_, col) => col !== 3)))
    expect(database.prepare('SELECT * FROM invitation_tokens ORDER BY id').all()).toEqual(invites)
    expect(database.prepare('SELECT identity_id, formation_slot FROM v2_identity_slots ORDER BY seed_index').all()).toEqual(slots)
    const journalText = fs.readFileSync(options.journalPath, 'utf8')
    for (const value of ['林测试', '26000001', secretBefore.admin.password, secretBefore.credentialPepper, csvBefore[1]![4]!]) {
      expect(journalText).not.toContain(value)
    }
    expect(previewProtectedStarIds(database, options).changedCount).toBe(0)
    expect(updateProtectedStarIds(database, options, true)).toMatchObject({ state: 'rolled_back' })
    expect(codes()).toEqual(oldCodes)
    expect(JSON.parse(fs.readFileSync(options.runtimeSecretPath, 'utf8'))).toEqual(secretBefore)
    expect(parseProtectedNfcCsv(fs.readFileSync(options.nfcMapPath, 'utf8'))).toEqual(csvBefore)
  })

  it('restores all files and the database if replacing NFC metadata fails', () => {
    const secretBefore = fs.readFileSync(options.runtimeSecretPath, 'utf8')
    const nfcBefore = fs.readFileSync(options.nfcMapPath, 'utf8')
    const rename = fs.renameSync.bind(fs)
    let rejected = false
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (!rejected && to === options.nfcMapPath) { rejected = true; throw new Error('injected NFC replacement failure') }
      rename(from, to)
    })
    expect(() => updateProtectedStarIds(database, options)).toThrow(/injected NFC/)
    expect(codes()).toEqual(oldCodes)
    expect(fs.readFileSync(options.runtimeSecretPath, 'utf8')).toBe(secretBefore)
    expect(fs.readFileSync(options.nfcMapPath, 'utf8')).toBe(nfcBefore)
    expect(fs.readdirSync(temporaryDirectory).some(name => name.includes('.next-'))).toBe(false)
    expect(previewProtectedStarIds(database, options).changedCount).toBe(2)
  })

  it('recovers an interruption between metadata replacement and SQLite commit', () => {
    const nfcBefore = fs.readFileSync(options.nfcMapPath, 'utf8')
    updateProtectedStarIds(database, options)
    setLegacyDatabaseCodes() // SQLite rolled back, but a private metadata rename already happened.
    fs.writeFileSync(options.nfcMapPath, nfcBefore)
    expect(updateProtectedStarIds(database, options, true)).toMatchObject({ state: 'rolled_back' })
    expect(previewProtectedStarIds(database, options).changedCount).toBe(2)
  })

  it('uses the new private star code after authentication and refuses changes once activated', () => {
    updateProtectedStarIds(database, options)
    const result = activateV2Participant(database, readCredentialContext(options.runtimeSecretPath), {
      protocolVersion: '2', resetEpoch: 1, idempotencyKey: 'star-id-activation-0001',
      method: 'ASSISTED_STUDENT', displayName: '林测试', studentNumber: '26000001',
    }, new Date('2026-09-06T11:00:00Z'))
    expect(result.snapshot.participant.personalStarCode).toBe('L-0001')
    expect(() => updateProtectedStarIds(database, options, true)).toThrow(/activated identities/)
    expect(codes()).toEqual(['L-0001', 'Z-0002'])
  })
})
