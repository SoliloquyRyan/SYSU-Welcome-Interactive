import fs from 'node:fs'
import path from 'node:path'
import { openDatabase, databaseTableExists } from '../db/open-database.js'
import { closeDatabase, reportCliFailure } from './shared.js'

const value = (name: string) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? '' : ''
}

const databasePath = value('--database')
const sourcePath = value('--source')
const confirmation = value('--confirm')
if (!databasePath || !sourcePath || confirmation !== 'CAMPUS_AWARDS_IMPORT') {
  console.error('用法：pnpm db:campus-awards:import -- --database <sqlite> --source backend/data/campus-awards-20260917.json --confirm CAMPUS_AWARDS_IMPORT')
  process.exit(2)
}

try {
  const source = JSON.parse(fs.readFileSync(path.resolve(sourcePath), 'utf8')) as {
    awards?: Record<string, Array<{ name: string; rank: number }>>
  }
  const awards = source.awards ?? {}
  const expected = ['points-top20', 'route-3', 'route-2', 'route-1', 'creativity', 'photography']
  if (!expected.every(id => Array.isArray(awards[id]) && awards[id]!.length > 0)) throw new Error('名单源文件缺少六类校园图鉴名单。')
  const database = openDatabase(path.resolve(databasePath))
  try {
    if (!databaseTableExists(database, 'v2_awards')) throw new Error('目标数据库尚未完成 v2_awards 迁移。')
    const update = database.prepare(`UPDATE v2_awards SET entries_json = ?, confirmed = 1, revision = revision + 1 WHERE id = ? AND group_code = 'CAMPUS'`)
    const transaction = database.transaction(() => {
      for (const id of expected) {
        const entries = awards[id]!.map(entry => ({ name: entry.name.trim(), rank: entry.rank, detail: '' }))
        if (update.run(JSON.stringify(entries), id).changes !== 1) throw new Error(`奖项不存在：${id}`)
      }
    })
    transaction()
    const rows = database.prepare(`SELECT id, confirmed, json_array_length(entries_json) AS entryCount FROM v2_awards WHERE group_code = 'CAMPUS' ORDER BY sort_order`).all() as Array<{ id: string; confirmed: number; entryCount: number }>
    if (expected.some(id => !rows.find(row => row.id === id && row.confirmed === 1 && row.entryCount > 0))) throw new Error('导入后校验失败。')
    console.log(`校园图鉴名单导入完成：${expected.map(id => `${id}=${rows.find(row => row.id === id)?.entryCount ?? 0}`).join(', ')}`)
  } finally {
    closeDatabase(database)
  }
} catch (error) {
  reportCliFailure('校园图鉴正式名单导入', error)
}
