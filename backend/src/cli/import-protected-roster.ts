import fs from 'node:fs'
import path from 'node:path'

import { loadConfig } from '../config.js'
import { openDatabase } from '../db/open-database.js'
import { importProtectedRoster } from '../db/protected-roster.js'
import { closeDatabase, reportCliFailure } from './shared.js'

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 2 * 1024 * 1024) {
      throw new Error('Roster input exceeds the 2 MiB safety limit')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const databaseArgument = argumentValue('--database')
const secretArgument = argumentValue('--secret')
const nfcMapArgument = argumentValue('--nfc-map')

if (!databaseArgument || !secretArgument || !nfcMapArgument) {
  console.error(
    '受保护名单导入失败：必须提供 --database、--secret 与 --nfc-map 三个未存在的输出路径，并通过 stdin 传入名单 JSON。',
  )
  process.exitCode = 1
} else {
  const databasePath = path.resolve(databaseArgument)
  const runtimeSecretPath = path.resolve(secretArgument)
  const nfcMapPath = path.resolve(nfcMapArgument)
  const generatedPaths = [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
    runtimeSecretPath,
    nfcMapPath,
  ]
  const existing = generatedPaths.filter((target) => fs.existsSync(target))
  if (existing.length > 0) {
    console.error('受保护名单导入失败：一个或多个输出路径已经存在；为防止覆盖，操作已停止。')
    process.exitCode = 1
  } else {
    let database: ReturnType<typeof openDatabase> | null = null
    try {
      const input = JSON.parse(await readStandardInput()) as unknown
      const config = loadConfig()
      database = openDatabase(databasePath)
      const result = importProtectedRoster(database, input, {
        migrationsPath: config.migrationsPath,
        runtimeSecretPath,
        nfcMapPath,
        ...(argumentValue('--public-origin')
          ? { publicOrigin: argumentValue('--public-origin')! }
          : {}),
      })
      console.log(
        `受保护名单导入通过：schema=${result.schemaVersion}，participants=${result.participantCount}，data=PROTECTED；NFC 映射与运行凭据已写入本地忽略目录。`,
      )
    } catch (error) {
      if (database) closeDatabase(database)
      database = null
      for (const target of generatedPaths) {
        if (fs.existsSync(target)) fs.rmSync(target, { force: true })
      }
      reportCliFailure('受保护名单导入', error)
    } finally {
      if (database) closeDatabase(database)
    }
  }
}
