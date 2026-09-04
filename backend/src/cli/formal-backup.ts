import path from 'node:path'

import { BACKEND_ROOT } from '../config.js'
import {
  createFormalBackup,
  FORMAL_BACKUP_CONFIRMATION,
} from '../db/formal-backup.js'
import { reportCliFailure } from './shared.js'

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

const databasePath = argumentValue('--database')
const runtimeSecretPath = argumentValue('--secret')
const nfcMapPath = argumentValue('--nfc-map')
const outputDirectory = argumentValue('--output-dir')
const confirmation = argumentValue('--confirm')

if (!databasePath || !runtimeSecretPath || !nfcMapPath || !outputDirectory) {
  console.error(
    '用法：pnpm db:formal:backup -- --database <sqlite> --secret <json> --nfc-map <csv> --output-dir <新绝对目录> --confirm CREATE_VERIFIED_PROTECTED_BACKUP',
  )
  process.exit(2)
}

try {
  const result = await createFormalBackup({
    databasePath: path.resolve(databasePath),
    runtimeSecretPath: path.resolve(runtimeSecretPath),
    nfcMapPath: path.resolve(nfcMapPath),
    outputDirectory,
    migrationsPath: path.join(BACKEND_ROOT, 'migrations'),
    forbiddenRepositoryRoot: path.resolve(BACKEND_ROOT, '..'),
    confirmation: confirmation ?? '',
  })
  console.log(
    `正式备份创建并验证通过：participants=${result.participantCount}，bundle=${result.directory}`,
  )
} catch (error) {
  reportCliFailure('正式备份', error)
}

if (confirmation !== FORMAL_BACKUP_CONFIRMATION && process.exitCode !== 1) {
  process.exitCode = 1
}
