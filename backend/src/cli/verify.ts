import { loadConfig } from '../config.js'
import { openDatabase } from '../db/open-database.js'
import { verifyFoundation } from '../db/verify.js'
import { closeDatabase, reportCliFailure } from './shared.js'

const config = loadConfig()
const database = openDatabase(config.databasePath)
try {
  const result = verifyFoundation(database, config)
  if (!result.ready) throw new Error(result.issues.join('; '))
  console.log(
    `Demo 数据验证通过：schema=${result.schemaVersion}，seed=${result.seedVersion}，participants=${result.participantCount}，resetEpoch=${result.resetEpoch}`,
  )
} catch (error) {
  reportCliFailure('Demo 数据验证', error)
} finally {
  closeDatabase(database)
}
