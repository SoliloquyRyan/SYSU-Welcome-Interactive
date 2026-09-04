import path from 'node:path'

import { BACKEND_ROOT } from '../config.js'
import {
  FORMAL_RESTORE_CONFIRMATION,
  restoreFormalBackup,
} from '../db/formal-backup.js'
import { reportCliFailure } from './shared.js'

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

const bundleDirectory = argumentValue('--bundle-dir')
const outputDirectory = argumentValue('--output-dir')
const confirmation = argumentValue('--confirm')

if (!bundleDirectory || !outputDirectory) {
  console.error(
    '用法：pnpm db:formal:restore -- --bundle-dir <备份目录> --output-dir <新绝对目录> --confirm MATERIALIZE_VERIFIED_PROTECTED_BACKUP',
  )
  process.exit(2)
}

try {
  const result = restoreFormalBackup({
    bundleDirectory: path.resolve(bundleDirectory),
    outputDirectory,
    migrationsPath: path.join(BACKEND_ROOT, 'migrations'),
    forbiddenRepositoryRoot: path.resolve(BACKEND_ROOT, '..'),
    confirmation: confirmation ?? '',
  })
  console.log(
    `正式备份已恢复到全新目录并验证通过：participants=${result.participantCount}，runtime=${result.directory}`,
  )
} catch (error) {
  reportCliFailure('正式恢复', error)
}

if (confirmation !== FORMAL_RESTORE_CONFIRMATION && process.exitCode !== 1) {
  process.exitCode = 1
}
