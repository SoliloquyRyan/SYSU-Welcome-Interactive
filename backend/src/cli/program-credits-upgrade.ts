import path from 'node:path'
import fs from 'node:fs'
import { loadConfig } from '../config.js'
import { openDatabase } from '../db/open-database.js'
import { upgradeV2ProgramCreditsFrom17To18 } from '../db/v2-foundation.js'
import { closeDatabase, reportCliFailure } from './shared.js'

function argument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? '' : ''
}

const backup = argument('--backup')
if (!backup || !process.env.DEMO_DATABASE_PATH?.trim() || !process.env.DEMO_SEED_MANIFEST_PATH?.trim()) {
  console.error('请明确设置 DEMO_DATABASE_PATH 和 DEMO_SEED_MANIFEST_PATH，指向本次维护的库和对应凭据文件。')
  console.error('演职员目录升级需要 --backup <全新备份路径>，先停止服务再使用 --confirm V2_SERVICES_STOPPED。')
  process.exitCode = 1
} else {
  const config = loadConfig()
  if (!fs.existsSync(config.databasePath) || !fs.existsSync(config.seedManifestPath)) {
    console.error('维护目标或对应凭据不存在，未创建或修改数据库。')
    process.exit(1)
  }
  const database = openDatabase(config.databasePath)
  try {
    const result = await upgradeV2ProgramCreditsFrom17To18(database, {
      migrationsPath: config.migrationsPath,
      manifestPath: config.seedManifestPath,
      participantCount: config.seedParticipantCount,
      backupPath: path.resolve(backup),
      confirmation: argument('--confirm'),
    })
    console.log(`演职员目录升级完成：schema=${result.previousSchemaVersion} -> ${result.schemaVersion}，resetEpoch=${result.resetEpoch}，备份 SHA-256=${result.backupSha256}`)
  } catch (error) {
    reportCliFailure('演职员目录 schema 17→18 升级', error)
  } finally {
    closeDatabase(database)
  }
}
