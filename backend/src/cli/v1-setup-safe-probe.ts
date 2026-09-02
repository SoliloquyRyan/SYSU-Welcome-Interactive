import { loadConfig } from '../config.js'
import { openDatabase } from '../db/open-database.js'
import { readProtocolRuntime } from '../db/v2-foundation.js'
import { closeDatabase } from './shared.js'

const config = loadConfig()
const database = openDatabase(config.databasePath)
try {
  const runtime = readProtocolRuntime(database)
  const tableCount = database
    .prepare(
      `SELECT count(*)
       FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    .pluck()
    .get() as number
  process.exitCode =
    (runtime === null && tableCount === 0) ||
    (runtime !== null &&
      runtime.activeProtocolVersion === '1' &&
      runtime.activationState === 'V1_ACTIVE')
      ? 0
      : 1
} finally {
  closeDatabase(database)
}
