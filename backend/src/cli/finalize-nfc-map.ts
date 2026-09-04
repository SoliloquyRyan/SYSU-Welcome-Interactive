import fs from 'node:fs'
import path from 'node:path'

import { reportCliFailure } from './shared.js'

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

const inputArgument = argumentValue('--input')
const outputArgument = argumentValue('--output')
const publicOriginArgument = argumentValue('--public-origin')

if (!inputArgument || !outputArgument || !publicOriginArgument) {
  console.error(
    'NFC 地址定稿失败：必须提供 --input、--output 与 --public-origin。',
  )
  process.exitCode = 1
} else {
  try {
    const inputPath = path.resolve(inputArgument)
    const outputPath = path.resolve(outputArgument)
    if (inputPath === outputPath || fs.existsSync(outputPath)) {
      throw new Error('NFC final output must be a new path')
    }
    const origin = new URL(publicOriginArgument)
    if (origin.protocol !== 'https:') {
      throw new Error('Formal NFC origin must use HTTPS')
    }
    if (origin.username || origin.password || origin.search || origin.hash) {
      throw new Error('Formal NFC origin must not contain credentials, query or fragment')
    }
    const basePath = origin.pathname.replace(/\/+$/, '')
    origin.pathname = `${basePath}/welcome`
    const prefix = `${origin.toString().replace(/\/$/, '')}?token=`

    const source = fs.readFileSync(inputPath, 'utf8')
    if (/"https?:\/\/[^"\r\n]+\/welcome\?token=/.test(source)) {
      throw new Error('Input NFC mapping already contains absolute URLs')
    }
    const matches = source.match(/"\/welcome\?token=[A-Za-z0-9_-]{43}"/g) ?? []
    if (matches.length === 0) {
      throw new Error('Input NFC mapping contains no supported relative invitation URLs')
    }
    const finalized = source.replace(
      /"\/welcome\?token=([A-Za-z0-9_-]{43})"/g,
      `"${prefix}$1"`,
    )
    fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 })
    fs.writeFileSync(outputPath, finalized, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    console.log(
      `NFC 地址定稿通过：entries=${matches.length}；完整 HTTPS 地址已写入新的本地忽略文件。`,
    )
  } catch (error) {
    reportCliFailure('NFC 地址定稿', error)
  }
}
