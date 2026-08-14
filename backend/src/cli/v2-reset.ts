import { loadConfig } from '../config.js'
import { openDatabase } from '../db/open-database.js'
import { resetSyntheticV2Database, V2_DESTRUCTIVE_CONFIRMATION } from '../db/v2-foundation.js'
import { closeDatabase, reportCliFailure } from './shared.js'

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

const config = loadConfig()
const database = openDatabase(config.databasePath)
try {
  const result = resetSyntheticV2Database(database, {
    migrationsPath: config.migrationsPath,
    manifestPath: config.seedManifestPath,
    participantCount: config.seedParticipantCount,
    confirmation: argumentValue('--confirm') ?? '',
  })
  console.log(`V2 合成 Demo 确定性重置完成：resetEpoch=${result.previousResetEpoch} -> ${result.resetEpoch}`)
} catch (error) {
  reportCliFailure(`V2 合成 Demo 确定性重置（确认值必须为 ${V2_DESTRUCTIVE_CONFIRMATION}）`, error)
} finally {
  closeDatabase(database)
}
