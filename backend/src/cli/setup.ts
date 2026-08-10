import { loadConfig } from '../config.js'
import { migrateDatabase } from '../db/migrate.js'
import { openDatabase } from '../db/open-database.js'
import { seedDemoDatabase } from '../db/seed.js'
import { verifyFoundation } from '../db/verify.js'
import { closeDatabase, reportCliFailure } from './shared.js'

const config = loadConfig()
const database = openDatabase(config.databasePath)
try {
  const migrations = migrateDatabase(database, config.migrationsPath)
  const seed = seedDemoDatabase(database, {
    manifestPath: config.seedManifestPath,
    participantCount: config.seedParticipantCount,
  })
  const verification = verifyFoundation(database, config)
  if (!verification.ready) {
    throw new Error(verification.issues.join('; '))
  }
  console.log(
    `Demo 本地数据已就绪：schema=${migrations.currentVersion}，seed=${seed.seedVersion}，participants=${seed.participantCount}`,
  )
} catch (error) {
  reportCliFailure('Demo 本地数据准备', error)
} finally {
  closeDatabase(database)
}
