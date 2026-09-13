import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

import { BACKEND_ROOT } from '../config.js'
import { previewProtectedStarIds, updateProtectedStarIds } from '../db/protected-star-id-update.js'
import { reportCliFailure } from './shared.js'

function argument(name: string): string {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value || value.startsWith('--')) throw new Error(`Missing ${name}`)
  return path.resolve(value)
}

let database: Database.Database | undefined
try {
  const databasePath = argument('--database')
  const options = { migrationsPath: path.join(BACKEND_ROOT, 'migrations'),
    runtimeSecretPath: argument('--secret'), nfcMapPath: argument('--nfc-map'),
    journalPath: argument('--journal') }
  const apply = process.argv.includes('--apply')
  const rollback = process.argv.includes('--rollback')
  if (apply && rollback) throw new Error('Choose apply or rollback, not both')
  const targets = [databasePath, options.runtimeSecretPath, options.nfcMapPath, options.journalPath]
  if (new Set(targets).size !== targets.length) throw new Error('Database, private metadata and journal paths must differ')
  if (!fs.existsSync(databasePath)) throw new Error('Existing protected database is required')
  database = new Database(databasePath, { readonly: !apply && !rollback, fileMustExist: true })
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  if (apply || rollback) database.pragma('synchronous = FULL')
  const result = apply || rollback
    ? updateProtectedStarIds(database, options, rollback)
    : previewProtectedStarIds(database, options)
  // Never log plan rows, raw CSV, secrets, names, or invitation material.
  console.log(JSON.stringify({ status: 'state' in result ? result.state : 'preview',
    participantCount: result.participantCount, changedCount: result.changedCount,
    schemaVersion: result.schemaVersion, rule: 'SURNAME_INITIAL-LAST4' }))
} catch (error) { reportCliFailure('正式星号更新', error) }
finally { database?.close() }
