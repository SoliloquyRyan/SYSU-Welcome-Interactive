import path from 'node:path'

import { loadConfig } from '../config.js'
import { openDatabase } from '../db/open-database.js'
import {
  upgradeSyntheticV2DatabaseFrom12To14,
  V2_DESTRUCTIVE_CONFIRMATION,
} from '../db/v2-foundation.js'
import { closeDatabase, reportCliFailure } from './shared.js'

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

const backupArgument = argumentValue('--backup')
if (!backupArgument) {
  console.error('V2 schema 12→14 升级失败：必须提供 --backup <未存在的 SQLite 备份路径>')
  process.exitCode = 1
} else {
  const config = loadConfig()
  const database = openDatabase(config.databasePath)
  try {
    const result = await upgradeSyntheticV2DatabaseFrom12To14(database, {
      migrationsPath: config.migrationsPath,
      manifestPath: config.seedManifestPath,
      participantCount: config.seedParticipantCount,
      backupPath: path.resolve(backupArgument),
      confirmation: argumentValue('--confirm') ?? '',
    })
    console.log(
      `V2 合成 Demo schema 升级完成：schema=${result.previousSchemaVersion} -> ${result.schemaVersion}，resetEpoch=${result.resetEpoch}，backup=${result.backupPath}，sha256=${result.backupSha256}`,
    )
  } catch (error) {
    reportCliFailure(
      `V2 schema 12→14 升级（确认值必须为 ${V2_DESTRUCTIVE_CONFIRMATION}）`,
      error,
    )
  } finally {
    closeDatabase(database)
  }
}
