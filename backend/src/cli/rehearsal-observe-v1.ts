import fs from 'node:fs'
import path from 'node:path'

import { buildApp } from '../app.js'
import { loadConfig } from '../config.js'
import { verifyFoundation } from '../db/verify.js'
import { openDatabase } from '../db/open-database.js'
import { readProtocolRuntime } from '../db/v2-foundation.js'
import { closeDatabase, reportCliFailure } from './shared.js'

const CONFIRMATION = 'FRESH_SYNTHETIC_REHEARSAL'

try {
  const rehearsalDirectory = process.env.REHEARSAL_RUNTIME_DIR
  if (
    process.env.REHEARSAL_BOOTSTRAP_CONFIRMATION !== CONFIRMATION ||
    !rehearsalDirectory
  ) {
    throw new Error('This helper is restricted to fresh synthetic rehearsal bootstrap')
  }
  const config = loadConfig()
  const realRehearsalDirectory = fs.realpathSync(rehearsalDirectory)
  const realDatabasePath = fs.realpathSync(config.databasePath)
  const relative = path.relative(realRehearsalDirectory, realDatabasePath)
  if (
    config.seedParticipantCount !== 300 ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Rehearsal bootstrap target is outside the isolated synthetic directory')
  }

  const database = openDatabase(config.databasePath)
  try {
    const runtime = readProtocolRuntime(database)
    const foundation = verifyFoundation(database, config)
    if (
      !foundation.ready ||
      runtime?.activeProtocolVersion !== '1' ||
      runtime.activationState !== 'V1_ACTIVE' ||
      runtime.dataClassification !== 'UNVERIFIED'
    ) {
      throw new Error('Fresh rehearsal v1 foundation is not safe to observe')
    }
  } finally {
    closeDatabase(database)
  }

  const app = await buildApp({ config, logger: false })
  try {
    await app.listen({ host: '127.0.0.1', port: 0 })
  } finally {
    await app.close()
  }
  console.log('合成正式视觉排练 V1 监听与干净关闭凭据已记录。')
} catch (error) {
  reportCliFailure('合成排练 V1 观察', error)
}
