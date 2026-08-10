import { loadConfig } from '../config.js'
import { migrateDatabase } from '../db/migrate.js'
import { openDatabase } from '../db/open-database.js'
import { closeDatabase, reportCliFailure } from './shared.js'

const config = loadConfig()
const database = openDatabase(config.databasePath)
try {
  const result = migrateDatabase(database, config.migrationsPath)
  console.log(
    `数据库迁移完成：schema=${result.currentVersion}，本次应用=${result.applied.length}`,
  )
} catch (error) {
  reportCliFailure('数据库迁移', error)
} finally {
  closeDatabase(database)
}
