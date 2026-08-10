import { loadConfig } from '../config.js'
import { openDatabase } from '../db/open-database.js'
import { resetDemoDatabase } from '../db/reset.js'
import { closeDatabase, reportCliFailure } from './shared.js'

const config = loadConfig()
const database = openDatabase(config.databasePath)
try {
  const result = resetDemoDatabase(database, {
    manifestPath: config.seedManifestPath,
    participantCount: config.seedParticipantCount,
  })
  console.log(
    `Demo 确定性重置完成：resetEpoch=${result.previousResetEpoch} -> ${result.resetEpoch}`,
  )
} catch (error) {
  reportCliFailure('Demo 确定性重置', error)
} finally {
  closeDatabase(database)
}
