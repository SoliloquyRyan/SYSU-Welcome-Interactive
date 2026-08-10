import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

export type SqliteDatabase = Database.Database

export function openDatabase(databasePath: string): SqliteDatabase {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })

  const database = new Database(databasePath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  database.pragma('synchronous = NORMAL')

  return database
}

export function databaseTableExists(
  database: SqliteDatabase,
  tableName: string,
): boolean {
  const row = database
    .prepare(
      `SELECT 1 AS present
       FROM sqlite_master
       WHERE type = 'table' AND name = ?`,
    )
    .get(tableName) as { present: number } | undefined

  return row?.present === 1
}
