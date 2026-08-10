import type { SqliteDatabase } from '../db/open-database.js'

export function closeDatabase(database: SqliteDatabase): void {
  if (database.open) database.close()
}

export function reportCliFailure(action: string, error: unknown): void {
  const message = error instanceof Error ? error.message : 'unknown failure'
  console.error(`${action}失败：${message}`)
  process.exitCode = 1
}
