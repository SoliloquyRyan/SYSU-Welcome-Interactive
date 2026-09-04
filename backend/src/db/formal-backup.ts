import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'
import { z } from 'zod'

import { verifyProtectedNfcMap } from './protected-nfc-map.js'
import { readProtectedRuntimeSecret } from './seed.js'
import { readProtocolRuntime, verifyV2Foundation } from './v2-foundation.js'

export const FORMAL_BACKUP_CONFIRMATION = 'CREATE_VERIFIED_PROTECTED_BACKUP'
export const FORMAL_RESTORE_CONFIRMATION = 'MATERIALIZE_VERIFIED_PROTECTED_BACKUP'

const DATABASE_FILENAME = '2026-roster.sqlite'
const SECRET_FILENAME = '2026-runtime-secret.json'
const NFC_MAP_FILENAME = '2026-nfc-map.csv'
const MANIFEST_FILENAME = 'backup-manifest.json'

const BackupFileSchema = z
  .object({
    filename: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().positive(),
  })
  .strict()

export const FormalBackupManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('SYSU_WELCOME_PROTECTED_BACKUP'),
    createdAt: z.string().datetime({ offset: true }),
    participantCount: z.number().int().min(1).max(300),
    files: z
      .object({
        database: BackupFileSchema.extend({ filename: z.literal(DATABASE_FILENAME) }),
        runtimeSecret: BackupFileSchema.extend({ filename: z.literal(SECRET_FILENAME) }),
        nfcMap: BackupFileSchema.extend({ filename: z.literal(NFC_MAP_FILENAME) }),
      })
      .strict(),
  })
  .strict()

export type FormalBackupManifest = z.infer<typeof FormalBackupManifestSchema>

export interface CreateFormalBackupOptions {
  databasePath: string
  runtimeSecretPath: string
  nfcMapPath: string
  outputDirectory: string
  migrationsPath: string
  forbiddenRepositoryRoot: string
  confirmation: string
  now?: () => Date
}

export interface RestoreFormalBackupOptions {
  bundleDirectory: string
  outputDirectory: string
  migrationsPath: string
  forbiddenRepositoryRoot: string
  confirmation: string
}

export interface FormalRuntimeMaterialization {
  directory: string
  databasePath: string
  runtimeSecretPath: string
  nfcMapPath: string
  manifestPath: string
  participantCount: number
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function isInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function assertExistingFile(filePath: string, label: string): void {
  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
  } catch {
    throw new Error(`${label} does not exist`)
  }
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`${label} is not a non-empty regular file`)
  }
}

function assertSafeNewDirectory(
  outputDirectory: string,
  forbiddenRepositoryRoot: string,
): void {
  if (!path.isAbsolute(outputDirectory)) {
    throw new Error('Protected backup output must use an absolute path')
  }
  const resolved = path.resolve(outputDirectory)
  if (resolved === path.parse(resolved).root) {
    throw new Error('Protected backup output cannot be a filesystem root')
  }
  const realRepositoryRoot = fs.realpathSync(forbiddenRepositoryRoot)
  if (isInside(realRepositoryRoot, resolved)) {
    throw new Error('Protected backup output must stay outside the Git repository')
  }
  if (fs.existsSync(resolved)) {
    throw new Error('Protected backup output already exists')
  }
  const parent = path.dirname(resolved)
  let realParent: string
  try {
    realParent = fs.realpathSync(parent)
  } catch {
    throw new Error('Protected backup output parent does not exist')
  }
  if (!fs.statSync(realParent).isDirectory()) {
    throw new Error('Protected backup output parent is not a directory')
  }
  const materializedOutput = path.join(realParent, path.basename(resolved))
  if (isInside(realRepositoryRoot, materializedOutput)) {
    throw new Error('Protected backup output must stay outside the Git repository')
  }
}

function chmodPrivate(filePath: string, mode: number): void {
  try {
    fs.chmodSync(filePath, mode)
  } catch {
    if (process.platform !== 'win32') throw new Error('Unable to restrict protected backup permissions')
  }
}

function normalizeStandaloneDatabase(databasePath: string): void {
  const database = new Database(databasePath, { fileMustExist: true })
  try {
    database.pragma('busy_timeout = 5000')
    database.pragma('wal_checkpoint(TRUNCATE)')
    const journalMode = String(
      database.pragma('journal_mode = DELETE', { simple: true }),
    ).toLowerCase()
    if (journalMode !== 'delete') {
      throw new Error('Unable to normalize protected backup journal mode')
    }
    if (database.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('Protected backup integrity_check failed after normalization')
    }
  } finally {
    database.close()
  }
  for (const sidecar of [`${databasePath}-wal`, `${databasePath}-shm`]) {
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar)
  }
}

function verifyProtectedDatabase(
  databasePath: string,
  runtimeSecretPath: string,
  nfcMapPath: string,
  migrationsPath: string,
): number {
  assertExistingFile(databasePath, 'Protected database')
  assertExistingFile(runtimeSecretPath, 'Protected runtime secret')
  const secret = readProtectedRuntimeSecret(runtimeSecretPath)
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  })
  try {
    database.pragma('foreign_keys = ON')
    database.pragma('busy_timeout = 5000')
    const integrity = database.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') {
      throw new Error('Protected SQLite integrity_check failed')
    }
    const result = verifyV2Foundation(database, {
      migrationsPath,
      manifestPath: runtimeSecretPath,
      participantCount: secret.participantCount,
    })
    if (!result.ready) {
      throw new Error(`Protected v2 verification failed: ${result.issues.join('; ')}`)
    }
    const runtime = readProtocolRuntime(database)
    if (runtime?.dataClassification !== 'PROTECTED') {
      throw new Error('Backup source is not classified as PROTECTED')
    }
    verifyProtectedNfcMap(database, { runtimeSecretPath, nfcMapPath })
    return secret.participantCount
  } finally {
    database.close()
  }
}

function fileRecord(filePath: string, filename: string) {
  return {
    filename,
    sha256: sha256File(filePath),
    bytes: fs.statSync(filePath).size,
  }
}

function materialization(directory: string, participantCount: number): FormalRuntimeMaterialization {
  return {
    directory,
    databasePath: path.join(directory, DATABASE_FILENAME),
    runtimeSecretPath: path.join(directory, SECRET_FILENAME),
    nfcMapPath: path.join(directory, NFC_MAP_FILENAME),
    manifestPath: path.join(directory, MANIFEST_FILENAME),
    participantCount,
  }
}

export async function createFormalBackup(
  options: CreateFormalBackupOptions,
): Promise<FormalRuntimeMaterialization> {
  if (options.confirmation !== FORMAL_BACKUP_CONFIRMATION) {
    throw new Error('Protected backup confirmation is missing')
  }
  assertExistingFile(options.databasePath, 'Protected database')
  assertExistingFile(options.runtimeSecretPath, 'Protected runtime secret')
  assertExistingFile(options.nfcMapPath, 'Protected NFC map')
  const participantCount = verifyProtectedDatabase(
    options.databasePath,
    options.runtimeSecretPath,
    options.nfcMapPath,
    options.migrationsPath,
  )
  assertSafeNewDirectory(options.outputDirectory, options.forbiddenRepositoryRoot)

  const output = materialization(path.resolve(options.outputDirectory), participantCount)
  let created = false
  try {
    fs.mkdirSync(output.directory, { mode: 0o700 })
    created = true
    const source = new Database(options.databasePath, {
      readonly: true,
      fileMustExist: true,
    })
    try {
      source.pragma('busy_timeout = 5000')
      await source.backup(output.databasePath)
    } finally {
      source.close()
    }
    normalizeStandaloneDatabase(output.databasePath)
    fs.copyFileSync(options.runtimeSecretPath, output.runtimeSecretPath, fs.constants.COPYFILE_EXCL)
    fs.copyFileSync(options.nfcMapPath, output.nfcMapPath, fs.constants.COPYFILE_EXCL)
    chmodPrivate(output.directory, 0o700)
    for (const filePath of [output.databasePath, output.runtimeSecretPath, output.nfcMapPath]) {
      chmodPrivate(filePath, 0o600)
    }

    verifyProtectedDatabase(
      output.databasePath,
      output.runtimeSecretPath,
      output.nfcMapPath,
      options.migrationsPath,
    )
    const manifest: FormalBackupManifest = FormalBackupManifestSchema.parse({
      schemaVersion: 1,
      kind: 'SYSU_WELCOME_PROTECTED_BACKUP',
      createdAt: (options.now ?? (() => new Date()))().toISOString(),
      participantCount,
      files: {
        database: fileRecord(output.databasePath, DATABASE_FILENAME),
        runtimeSecret: fileRecord(output.runtimeSecretPath, SECRET_FILENAME),
        nfcMap: fileRecord(output.nfcMapPath, NFC_MAP_FILENAME),
      },
    })
    fs.writeFileSync(output.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    chmodPrivate(output.manifestPath, 0o600)
    return output
  } catch (error) {
    if (created && fs.existsSync(output.directory)) {
      fs.rmSync(output.directory, { recursive: true, force: true })
    }
    throw error
  }
}

function readAndVerifyBundle(
  bundleDirectory: string,
  migrationsPath: string,
): { manifest: FormalBackupManifest; bundle: FormalRuntimeMaterialization } {
  const directory = path.resolve(bundleDirectory)
  const manifestPath = path.join(directory, MANIFEST_FILENAME)
  assertExistingFile(manifestPath, 'Protected backup manifest')
  const manifest = FormalBackupManifestSchema.parse(
    JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
  )
  const bundle = materialization(directory, manifest.participantCount)
  for (const record of Object.values(manifest.files)) {
    const filePath = path.join(directory, record.filename)
    assertExistingFile(filePath, `Protected backup file ${record.filename}`)
    if (fs.statSync(filePath).size !== record.bytes || sha256File(filePath) !== record.sha256) {
      throw new Error(`Protected backup checksum mismatch: ${record.filename}`)
    }
  }
  const participantCount = verifyProtectedDatabase(
    bundle.databasePath,
    bundle.runtimeSecretPath,
    bundle.nfcMapPath,
    migrationsPath,
  )
  if (participantCount !== manifest.participantCount) {
    throw new Error('Protected backup participant count mismatch')
  }
  return { manifest, bundle }
}

export function restoreFormalBackup(
  options: RestoreFormalBackupOptions,
): FormalRuntimeMaterialization {
  if (options.confirmation !== FORMAL_RESTORE_CONFIRMATION) {
    throw new Error('Protected restore confirmation is missing')
  }
  const realBundleDirectory = fs.realpathSync(options.bundleDirectory)
  if (
    isInside(
      fs.realpathSync(options.forbiddenRepositoryRoot),
      realBundleDirectory,
    )
  ) {
    throw new Error('Protected backup bundle must stay outside the Git repository')
  }
  const { manifest, bundle } = readAndVerifyBundle(
    realBundleDirectory,
    options.migrationsPath,
  )
  assertSafeNewDirectory(options.outputDirectory, options.forbiddenRepositoryRoot)
  const output = materialization(path.resolve(options.outputDirectory), manifest.participantCount)
  let created = false
  try {
    fs.mkdirSync(output.directory, { mode: 0o700 })
    created = true
    for (const [source, destination] of [
      [bundle.databasePath, output.databasePath],
      [bundle.runtimeSecretPath, output.runtimeSecretPath],
      [bundle.nfcMapPath, output.nfcMapPath],
      [bundle.manifestPath, output.manifestPath],
    ] as const) {
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL)
      chmodPrivate(destination, 0o600)
    }
    chmodPrivate(output.directory, 0o700)
    readAndVerifyBundle(output.directory, options.migrationsPath)
    return output
  } catch (error) {
    if (created && fs.existsSync(output.directory)) {
      fs.rmSync(output.directory, { recursive: true, force: true })
    }
    throw error
  }
}
