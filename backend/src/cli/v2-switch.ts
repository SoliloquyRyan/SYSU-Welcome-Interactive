import path from 'node:path'
import { loadConfig } from '../config.js'
import { migrateDatabase } from '../db/migrate.js'
import { openDatabase } from '../db/open-database.js'
import { switchSyntheticDemoToV2, V2_DESTRUCTIVE_CONFIRMATION } from '../db/v2-foundation.js'
import { closeDatabase, reportCliFailure } from './shared.js'

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

const backupArgument = argumentValue('--backup')
if (!backupArgument) {
  console.error('V2 一次性切换失败：必须提供 --backup <未存在的 SQLite 备份路径>')
  process.exitCode = 1
} else {
  const config = loadConfig()
  const database = openDatabase(config.databasePath)
  try {
    const migration = migrateDatabase(database, config.migrationsPath)
    if (migration.applied.length > 0) {
      throw new Error(
        'V2 schema preparation completed. Restart the current v1 service once to register migration 0008, stop it cleanly, then run this cutover command again.',
      )
    }
    const result = await switchSyntheticDemoToV2(database, {
      migrationsPath: config.migrationsPath,
      manifestPath: config.seedManifestPath,
      participantCount: config.seedParticipantCount,
      backupPath: path.resolve(backupArgument),
      confirmation: argumentValue('--confirm') ?? '',
    })
    console.log(`V2 合成 Demo 一次性切换完成：resetEpoch=${result.previousResetEpoch} -> ${result.resetEpoch}，backup=${result.backupPath}，sha256=${result.backupSha256}`)
    console.warn('当前 v1 服务将拒绝此数据库；V2-03～V2-08 完成并原子发布后才能启用 v2 业务。')
  } catch (error) {
    reportCliFailure(`V2 合成 Demo 一次性切换（确认值必须为 ${V2_DESTRUCTIVE_CONFIRMATION}）`, error)
  } finally {
    closeDatabase(database)
  }
}
