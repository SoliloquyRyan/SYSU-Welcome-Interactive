import { loadConfig } from '../config.js'
import { openDatabase } from '../db/open-database.js'
import { seedDemoDatabase } from '../db/seed.js'
import { closeDatabase, reportCliFailure } from './shared.js'

const config = loadConfig()
const database = openDatabase(config.databasePath)
try {
  const result = seedDemoDatabase(database, {
    manifestPath: config.seedManifestPath,
    participantCount: config.seedParticipantCount,
  })
  console.log(
    `固定合成种子已就绪：version=${result.seedVersion}，participants=${result.participantCount}，manifest=${result.createdManifest ? 'created' : 'reused'}`,
  )
} catch (error) {
  reportCliFailure('固定合成种子初始化', error)
} finally {
  closeDatabase(database)
}
