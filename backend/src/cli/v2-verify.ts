import { loadConfig } from '../config.js'
import { openDatabase } from '../db/open-database.js'
import { verifyProtectedNfcMap } from '../db/protected-nfc-map.js'
import { verifyV2Foundation } from '../db/v2-foundation.js'
import { closeDatabase, reportCliFailure } from './shared.js'

const config = loadConfig()
const database = openDatabase(config.databasePath)
try {
  const result = verifyV2Foundation(database, {
    migrationsPath: config.migrationsPath,
    manifestPath: config.seedManifestPath,
    participantCount: config.seedParticipantCount,
  })
  if (!result.ready) throw new Error(result.issues.join('; '))
  const nfcMapPath = process.env.FORMAL_NFC_MAP_PATH?.trim()
  if (nfcMapPath) {
    const expectedOrigin = process.env.FORMAL_PUBLIC_ORIGIN?.trim()
    verifyProtectedNfcMap(database, {
      runtimeSecretPath: config.seedManifestPath,
      nfcMapPath,
      ...(expectedOrigin ? { expectedOrigin } : {}),
    })
  }
  console.log(`V2 数据基础验证通过：schema=${result.schemaVersion}，protocol=${result.protocolVersion}，participants=${result.participantCount}，resetEpoch=${result.resetEpoch}`)
} catch (error) {
  reportCliFailure('V2 数据基础验证', error)
} finally {
  closeDatabase(database)
}
