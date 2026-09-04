import fs from 'node:fs'
import path from 'node:path'

import { loadConfig } from '../config.js'
import { readSeedManifest } from '../db/seed.js'
import { reportCliFailure } from './shared.js'

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

function csvCell(value: string): string {
  const formulaSafe = /^[=+@-]/.test(value) ? `'${value}` : value
  return `"${formulaSafe.replaceAll('"', '""')}"`
}

function welcomeUrl(token: string, publicOrigin?: string): string {
  const pathAndQuery = `/welcome?token=${encodeURIComponent(token)}`
  if (!publicOrigin) return pathAndQuery
  const origin = new URL(publicOrigin)
  if (!['https:', 'http:'].includes(origin.protocol)) {
    throw new Error('Test public origin must use http or https')
  }
  const basePath = origin.pathname.replace(/\/+$/, '')
  origin.pathname = `${basePath}/welcome`
  origin.search = `?token=${encodeURIComponent(token)}`
  origin.hash = ''
  return origin.toString()
}

const outputArgument = argumentValue('--output')
if (!outputArgument) {
  console.error('测试账号导出失败：必须提供 --output <未存在的 CSV 路径>')
  process.exitCode = 1
} else {
  try {
    const outputPath = path.resolve(outputArgument)
    if (fs.existsSync(outputPath)) {
      throw new Error('Test account output already exists; refusing to overwrite it')
    }
    const count = Number.parseInt(argumentValue('--count') ?? '5', 10)
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      throw new Error('Test account count must be between 1 and 20')
    }
    const config = loadConfig()
    const manifest = readSeedManifest(config.seedManifestPath)
    if (count > manifest.participants.length) {
      throw new Error('Test account count exceeds the synthetic directory')
    }
    const publicOrigin = argumentValue('--public-origin') ?? undefined
    const rows = [
      ['序号', '合成姓名', '8位测试学号', '星号', 'NFC网址'],
      ...manifest.participants.slice(0, count).map((participant) => [
        participant.seedIndex.toString(),
        participant.displayName,
        participant.studentNumber.slice(-8),
        participant.publicStarId,
        welcomeUrl(participant.inviteToken, publicOrigin),
      ]),
    ]
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
    fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 })
    fs.writeFileSync(outputPath, `\uFEFF${csv}\r\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    console.log(`测试账号导出通过：accounts=${count}；凭据已写入本地忽略目录。`)
  } catch (error) {
    reportCliFailure('测试账号导出', error)
  }
}
