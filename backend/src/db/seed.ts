import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

import type { SqliteDatabase } from './open-database.js'
import { databaseTableExists } from './open-database.js'

const LEGACY_DEMO_SEED_VERSION = 'demo-v0-g1-v1'
export const DEMO_SEED_VERSION = 'demo-v0-g5-v2'
export const PROTECTED_ROSTER_SEED_VERSION = 'protected-roster-v1'

const SyntheticSurnameSchema = z.enum([
  '林', '陈', '黄', '李', '周', '吴', '梁', '何', '郑', '罗',
])

const SYNTHETIC_SURNAMES: ReadonlyArray<{
  surname: z.infer<typeof SyntheticSurnameSchema>
  initial: string
}> = [
  { surname: '林', initial: 'L' },
  { surname: '陈', initial: 'C' },
  { surname: '黄', initial: 'H' },
  { surname: '李', initial: 'L' },
  { surname: '周', initial: 'Z' },
  { surname: '吴', initial: 'W' },
  { surname: '梁', initial: 'L' },
  { surname: '何', initial: 'H' },
  { surname: '郑', initial: 'Z' },
  { surname: '罗', initial: 'L' },
]

const ParticipantSchema = z
  .object({
    id: z.string().regex(/^synthetic-\d{3,4}$/),
    seedIndex: z.number().int().positive(),
    displayName: z.string().min(1).max(40),
    studentNumber: z.string().regex(/^\d{8,20}$/),
    inviteToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    publicStarId: z.string().min(1).max(40),
    visualSeed: z.string().regex(/^[a-f0-9]{32}$/),
  })
  .strict()

const ProgramSchema = z
  .object({
    id: z.string().min(1).max(64),
    sortOrder: z.number().int().positive(),
    title: z.string().min(1).max(80),
  })
  .strict()

const GiftSchema = z
  .object({
    id: z.string().min(1).max(64),
    sortOrder: z.number().int().positive(),
    name: z.string().min(1).max(40),
    powerCost: z.union([
      z.literal(5),
      z.literal(10),
      z.literal(20),
      z.literal(50),
    ]),
  })
  .strict()

export const DemoSeedManifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    seedVersion: z.literal(DEMO_SEED_VERSION),
    generatedAt: z.string().datetime({ offset: true }),
    credentialPepper: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    admin: z
      .object({
        id: z.literal('admin-shared'),
        username: z.literal('demo-admin'),
        password: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
      })
      .strict(),
    participants: z.array(ParticipantSchema).min(1).max(1_000),
    programs: z.array(ProgramSchema).min(1),
    gifts: z.array(GiftSchema).length(4),
  })
  .strict()

export const ProtectedRuntimeSecretSchema = z
  .object({
    schemaVersion: z.literal(1),
    profile: z.literal('PROTECTED_ROSTER'),
    seedVersion: z.literal(PROTECTED_ROSTER_SEED_VERSION),
    generatedAt: z.string().datetime({ offset: true }),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    participantCount: z.number().int().min(1).max(300),
    directoryFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    credentialPepper: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    admin: z
      .object({
        id: z.string().min(1).max(64),
        username: z.string().min(1).max(64),
        password: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
      })
      .strict(),
  })
  .strict()

const LegacyDemoSeedManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    seedVersion: z.literal(LEGACY_DEMO_SEED_VERSION),
    generatedAt: z.string().datetime({ offset: true }),
    credentialPepper: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    admin: z
      .object({
        id: z.literal('admin-shared'),
        username: z.literal('demo-admin'),
        password: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
      })
      .strict(),
    participants: z.array(
      z.object({
        id: z.string().regex(/^synthetic-\d{3,4}$/),
        seedIndex: z.number().int().positive(),
        displayName: z.string().min(1).max(40),
        demoCode: z.string().regex(/^\d{6}$/),
        inviteToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        publicStarId: z.string().min(1).max(40),
        visualSeed: z.string().regex(/^[a-f0-9]{32}$/),
      }).strict(),
    ).min(1).max(1_000),
    programs: z.array(ProgramSchema).min(1),
    gifts: z.array(GiftSchema).length(4),
  })
  .strict()

export type DemoSeedManifest = z.infer<typeof DemoSeedManifestSchema>
export type ProtectedRuntimeSecret = z.infer<typeof ProtectedRuntimeSecretSchema>

export interface DemoCredentialContext {
  credentialPepper: string
}

export type CredentialContext = DemoCredentialContext

export interface SeedOptions {
  manifestPath: string
  participantCount: number
  now?: () => Date
}

export interface SeedResult {
  createdManifest: boolean
  seedVersion: string
  participantCount: number
  fingerprint: string
}

export interface SeedVerification {
  ready: boolean
  issues: string[]
  seedVersion: string | null
  participantCount: number
  fingerprint: string | null
}

export const PROGRAMS = [
  { id: 'program-001', sortOrder: 1, title: '轨道序章' },
  { id: 'program-002', sortOrder: 2, title: '协同回声' },
  { id: 'program-003', sortOrder: 3, title: '共同抵达' },
] as const

export const GIFTS = [
  { id: 'gift-glimmer', sortOrder: 1, name: '微光', powerCost: 5 },
  { id: 'gift-beacon', sortOrder: 2, name: '信标', powerCost: 10 },
  { id: 'gift-orbit', sortOrder: 3, name: '星轨', powerCost: 20 },
  { id: 'gift-starship', sortOrder: 4, name: '星舰', powerCost: 50 },
] as const

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function credentialDigest(
  pepper: string,
  purpose: string,
  subjectId: string,
  value: string,
): string {
  return createHmac('sha256', Buffer.from(pepper, 'base64url'))
    .update(`${purpose}\0${subjectId}\0${value}`, 'utf8')
    .digest('hex')
}

function digestMatches(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'hex')
  const actualBuffer = Buffer.from(actual, 'hex')
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  )
}

export function invitationTokenDigest(token: string): string {
  return sha256(token)
}

export function readDemoCredentialContext(
  manifestPath: string,
): DemoCredentialContext {
  const manifest = readSeedManifest(manifestPath)
  return Object.freeze({ credentialPepper: manifest.credentialPepper })
}

export function readProtectedRuntimeSecret(
  secretPath: string,
): ProtectedRuntimeSecret {
  return ProtectedRuntimeSecretSchema.parse(
    JSON.parse(fs.readFileSync(secretPath, 'utf8')),
  )
}

export function readCredentialContext(
  credentialPath: string,
): CredentialContext {
  const raw = JSON.parse(fs.readFileSync(credentialPath, 'utf8')) as unknown
  const demo = DemoSeedManifestSchema.safeParse(raw)
  if (demo.success) {
    return Object.freeze({ credentialPepper: demo.data.credentialPepper })
  }
  const protectedSecret = ProtectedRuntimeSecretSchema.parse(raw)
  return Object.freeze({
    credentialPepper: protectedSecret.credentialPepper,
  })
}

export function verifyStudentNumberCredential(
  context: DemoCredentialContext,
  identityId: string,
  studentNumber: string,
  storedDigest: string,
): boolean {
  return digestMatches(
    credentialDigest(
      context.credentialPepper,
      'student-number',
      identityId,
      studentNumber,
    ),
    storedDigest,
  )
}

export function verifyAdminPasswordCredential(
  context: DemoCredentialContext,
  accountId: string,
  password: string,
  storedDigest: string,
): boolean {
  return digestMatches(
    credentialDigest(
      context.credentialPepper,
      'admin-password',
      accountId,
      password,
    ),
    storedDigest,
  )
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  return value
}

export function fingerprintProtectedDirectoryDatabase(
  database: SqliteDatabase,
): string {
  const identities = database
    .prepare(
      `SELECT id, seed_index AS seedIndex, display_name AS displayName,
              student_number_digest AS studentNumberDigest,
              public_star_id AS publicStarId, visual_seed AS visualSeed,
              enabled
       FROM synthetic_identities
       ORDER BY seed_index`,
    )
    .all()
  const invitations = database
    .prepare(
      `SELECT id, identity_id AS identityId, token_digest AS tokenDigest,
              token_hint AS tokenHint, status
       FROM invitation_tokens
       ORDER BY identity_id`,
    )
    .all()
  const programs = database
    .prepare(
      `SELECT id, sort_order AS sortOrder, title, heat, enabled
       FROM program_catalog ORDER BY sort_order`,
    )
    .all()
  const gifts = database
    .prepare(
      `SELECT id, sort_order AS sortOrder, name, power_cost AS powerCost,
              enabled
       FROM gift_catalog ORDER BY sort_order`,
    )
    .all()
  const admins = database
    .prepare(
      `SELECT id, username, password_digest AS passwordDigest, enabled
       FROM admin_accounts ORDER BY id`,
    )
    .all()

  return sha256(JSON.stringify(stableValue({
    identities,
    invitations,
    programs,
    gifts,
    admins,
  })))
}

export function fingerprintManifest(manifest: DemoSeedManifest): string {
  return sha256(JSON.stringify(stableValue(manifest)))
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Seed manifest contains duplicate ${label}`)
  }
}

function validateManifestInvariants(
  manifest: DemoSeedManifest,
  participantCount: number,
): void {
  if (manifest.participants.length !== participantCount) {
    throw new Error(
      `Seed participant count mismatch: expected ${participantCount}, found ${manifest.participants.length}`,
    )
  }

  manifest.participants.forEach((participant, index) => {
    const seedIndex = index + 1
    if (participant.seedIndex !== seedIndex) {
      throw new Error('Seed participant indexes must be contiguous')
    }
    const suffix = seedIndex.toString().padStart(3, '0')
    const expectedIdentity = syntheticIdentityFields(seedIndex)
    if (
      participant.id !== `synthetic-${suffix}` ||
      participant.displayName !== expectedIdentity.displayName ||
      participant.studentNumber !== expectedIdentity.studentNumber ||
      participant.publicStarId !== expectedIdentity.publicStarId ||
      participant.visualSeed !==
        sha256(`orbital-signal:synthetic-${suffix}`).slice(0, 32)
    ) {
      throw new Error(
        'Seed participant directory is not the fixed synthetic identity catalog',
      )
    }
  })
  assertUnique(manifest.participants.map(({ id }) => id), 'participant IDs')
  assertUnique(manifest.participants.map(({ studentNumber }) => studentNumber), 'student IDs')
  assertUnique(
    manifest.participants.map(({ inviteToken }) => inviteToken),
    'invitation tokens',
  )
  assertUnique(
    manifest.participants.map(({ publicStarId }) => publicStarId),
    'public star IDs',
  )
  assertUnique(
    manifest.participants.map(({ visualSeed }) => visualSeed),
    'visual seeds',
  )

  if (JSON.stringify(manifest.programs) !== JSON.stringify(PROGRAMS)) {
    throw new Error('Seed program catalog does not match the G1 baseline')
  }
  if (JSON.stringify(manifest.gifts) !== JSON.stringify(GIFTS)) {
    throw new Error('Seed gift catalog does not match the G1 baseline')
  }
}

function syntheticIdentityFields(seedIndex: number): {
  displayName: string
  studentNumber: string
  publicStarId: string
} {
  const suffix = seedIndex.toString().padStart(3, '0')
  const studentNumber = `2026${seedIndex.toString().padStart(8, '0')}`
  const surname = SYNTHETIC_SURNAMES[(seedIndex - 1) % SYNTHETIC_SURNAMES.length]
  if (!surname) throw new Error('Synthetic surname catalog is empty')
  return {
    displayName: `${surname.surname}同学（合成${suffix}）`,
    studentNumber,
    publicStarId: `${surname.initial}-${studentNumber.slice(-4)}`,
  }
}

function generateManifest(
  participantCount: number,
  now: () => Date,
): DemoSeedManifest {
  const participants = Array.from({ length: participantCount }, (_, index) => {
    const seedIndex = index + 1
    const suffix = seedIndex.toString().padStart(3, '0')
    const id = `synthetic-${suffix}`
    const identity = syntheticIdentityFields(seedIndex)
    return {
      id,
      seedIndex,
      displayName: identity.displayName,
      studentNumber: identity.studentNumber,
      inviteToken: randomBytes(32).toString('base64url'),
      publicStarId: identity.publicStarId,
      visualSeed: sha256(`orbital-signal:${id}`).slice(0, 32),
    }
  })

  return DemoSeedManifestSchema.parse({
    schemaVersion: 2,
    seedVersion: DEMO_SEED_VERSION,
    generatedAt: now().toISOString(),
    credentialPepper: randomBytes(32).toString('base64url'),
    admin: {
      id: 'admin-shared',
      username: 'demo-admin',
      password: randomBytes(24).toString('base64url'),
    },
    participants,
    programs: PROGRAMS,
    gifts: GIFTS,
  })
}

function upgradeLegacyManifest(raw: unknown): DemoSeedManifest | null {
  const legacy = LegacyDemoSeedManifestSchema.safeParse(raw)
  if (!legacy.success) return null
  return DemoSeedManifestSchema.parse({
    schemaVersion: 2,
    seedVersion: DEMO_SEED_VERSION,
    generatedAt: legacy.data.generatedAt,
    credentialPepper: legacy.data.credentialPepper,
    admin: legacy.data.admin,
    participants: legacy.data.participants.map((participant) => ({
      id: participant.id,
      seedIndex: participant.seedIndex,
      ...syntheticIdentityFields(participant.seedIndex),
      inviteToken: participant.inviteToken,
      visualSeed: participant.visualSeed,
    })),
    programs: legacy.data.programs,
    gifts: legacy.data.gifts,
  })
}

function replaceManifestAtomically(
  manifestPath: string,
  manifest: DemoSeedManifest,
): void {
  const temporaryPath = `${manifestPath}.upgrade-${process.pid}-${randomUUID()}`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  try {
    fs.renameSync(temporaryPath, manifestPath)
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true })
  }
}

function writeManifestAtomically(
  manifestPath: string,
  manifest: DemoSeedManifest,
): boolean {
  const directory = path.dirname(manifestPath)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const temporaryPath = `${manifestPath}.tmp-${process.pid}-${randomUUID()}`
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    try {
      fs.linkSync(temporaryPath, manifestPath)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
      throw error
    }
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.rmSync(temporaryPath, { force: true })
    }
  }
}

export function readSeedManifest(manifestPath: string): DemoSeedManifest {
  return DemoSeedManifestSchema.parse(
    JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
  )
}

function databaseHasSeedState(database: SqliteDatabase): boolean {
  if (!databaseTableExists(database, 'demo_seed_meta')) return false
  const meta = database
    .prepare('SELECT 1 AS present FROM demo_seed_meta WHERE id = 1')
    .get() as { present: number } | undefined
  const identities = database
    .prepare('SELECT COUNT(*) AS count FROM synthetic_identities')
    .get() as { count: number }
  return meta?.present === 1 || identities.count > 0
}

function loadOrCreateManifest(
  database: SqliteDatabase,
  options: SeedOptions,
): { manifest: DemoSeedManifest; created: boolean } {
  if (fs.existsSync(options.manifestPath)) {
    const raw = JSON.parse(fs.readFileSync(options.manifestPath, 'utf8')) as unknown
    const current = DemoSeedManifestSchema.safeParse(raw)
    const manifest = current.success ? current.data : upgradeLegacyManifest(raw)
    if (!manifest) throw new Error('Seed manifest is missing or invalid')
    if (!current.success) replaceManifestAtomically(options.manifestPath, manifest)
    validateManifestInvariants(manifest, options.participantCount)
    return { manifest, created: false }
  }

  if (databaseHasSeedState(database)) {
    throw new Error(
      'Seed manifest is missing while the database already contains seed state; refusing to replace credentials',
    )
  }

  const manifest = generateManifest(
    options.participantCount,
    options.now ?? (() => new Date()),
  )
  validateManifestInvariants(manifest, options.participantCount)
  const created = writeManifestAtomically(options.manifestPath, manifest)
  const selectedManifest = created
    ? manifest
    : readSeedManifest(options.manifestPath)
  validateManifestInvariants(selectedManifest, options.participantCount)
  return { manifest: selectedManifest, created }
}

function upgradeLegacySeedCatalogInTransaction(
  database: SqliteDatabase,
  manifest: DemoSeedManifest,
  fingerprint: string,
  participantCount: number,
  appliedAt: string,
): void {
  const identities = database
    .prepare(
      `SELECT id, seed_index AS seedIndex, visual_seed AS visualSeed, enabled
       FROM synthetic_identities`,
    )
    .all() as Array<{
    id: string
    seedIndex: number
    visualSeed: string
    enabled: number
  }>
  const identityById = new Map(identities.map((identity) => [identity.id, identity]))
  const tokens = database
    .prepare(
      `SELECT identity_id AS identityId, token_digest AS tokenDigest
       FROM invitation_tokens`,
    )
    .all() as Array<{ identityId: string; tokenDigest: string }>
  const tokenByIdentity = new Map(tokens.map((token) => [token.identityId, token.tokenDigest]))

  if (identities.length !== participantCount || tokens.length !== participantCount) {
    throw new Error('Legacy seed catalog count does not match the upgraded manifest')
  }
  for (const participant of manifest.participants) {
    const identity = identityById.get(participant.id)
    if (
      !identity
      || identity.seedIndex !== participant.seedIndex
      || identity.visualSeed !== participant.visualSeed
      || identity.enabled !== 1
      || tokenByIdentity.get(participant.id) !== invitationTokenDigest(participant.inviteToken)
    ) {
      throw new Error('Legacy seed catalog cannot be safely upgraded')
    }
  }

  const updateIdentity = database.prepare(
    `UPDATE synthetic_identities
     SET display_name = ?, student_number_digest = ?, public_star_id = ?
     WHERE id = ?`,
  )
  for (const participant of manifest.participants) {
    if (
      updateIdentity.run(
        participant.displayName,
        credentialDigest(
          manifest.credentialPepper,
          'student-number',
          participant.id,
          participant.studentNumber,
        ),
        participant.publicStarId,
        participant.id,
      ).changes !== 1
    ) {
      throw new Error('Legacy synthetic identity upgrade was incomplete')
    }
  }

  database
    .prepare(
      `UPDATE demo_seed_meta
       SET seed_version = ?, seed_fingerprint = ?, generated_at = ?, applied_at = ?
       WHERE id = 1`,
    )
    .run(DEMO_SEED_VERSION, fingerprint, manifest.generatedAt, appliedAt)
  database
    .prepare(
      `UPDATE app_state
       SET seed_version = ?, seed_fingerprint = ?, updated_at = ?
       WHERE id = 1`,
    )
    .run(DEMO_SEED_VERSION, fingerprint, appliedAt)
}

export function seedDemoDatabase(
  database: SqliteDatabase,
  options: SeedOptions,
): SeedResult {
  for (const table of [
    'app_state',
    'demo_seed_meta',
    'synthetic_identities',
    'invitation_tokens',
    'program_catalog',
    'gift_catalog',
    'admin_accounts',
  ]) {
    if (!databaseTableExists(database, table)) {
      throw new Error('Database migrations must be applied before seeding')
    }
  }

  const { manifest, created } = loadOrCreateManifest(database, options)
  const fingerprint = fingerprintManifest(manifest)
  const appliedAt = (options.now ?? (() => new Date()))().toISOString()
  database.exec('BEGIN IMMEDIATE')
  try {
    if (databaseTableExists(database, 'protocol_runtime')) {
      const protocol = database
        .prepare(
          `SELECT active_protocol_version AS activeProtocolVersion,
                  activation_state AS activationState
           FROM protocol_runtime
           WHERE id = 1`,
        )
        .get() as
        | { activeProtocolVersion: string; activationState: string }
        | undefined
      if (
        !protocol ||
        protocol.activeProtocolVersion !== '1' ||
        protocol.activationState !== 'V1_ACTIVE'
      ) {
        throw new Error(
          'The v1 seed path refuses a database whose active protocol is not v1',
        )
      }
    }
    const existing = database
      .prepare(
        `SELECT seed_version AS seedVersion,
                seed_fingerprint AS fingerprint,
                participant_count AS participantCount
         FROM demo_seed_meta WHERE id = 1`,
      )
      .get() as
      | { seedVersion: string; fingerprint: string; participantCount: number }
      | undefined

    if (existing) {
      if (
        existing.seedVersion === LEGACY_DEMO_SEED_VERSION
        && existing.participantCount === options.participantCount
      ) {
        upgradeLegacySeedCatalogInTransaction(
          database,
          manifest,
          fingerprint,
          options.participantCount,
          appliedAt,
        )
      } else if (
        existing.seedVersion !== manifest.seedVersion ||
        existing.fingerprint !== fingerprint ||
        existing.participantCount !== options.participantCount
      ) {
        throw new Error('Seed manifest does not match the initialized database')
      }
    } else {
      const partialCount = (
        database
          .prepare(
            `SELECT
               (SELECT COUNT(*) FROM synthetic_identities) +
               (SELECT COUNT(*) FROM invitation_tokens) +
               (SELECT COUNT(*) FROM program_catalog) +
               (SELECT COUNT(*) FROM gift_catalog) +
               (SELECT COUNT(*) FROM admin_accounts) AS count`,
          )
          .get() as { count: number }
      ).count
      if (partialCount !== 0) {
        throw new Error('Database contains partial seed rows without seed metadata')
      }

    const insertIdentity = database.prepare(
      `INSERT INTO synthetic_identities (
         id, seed_index, display_name, student_number_digest, public_star_id,
         visual_seed, enabled, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    const insertInvitation = database.prepare(
      `INSERT INTO invitation_tokens (
         id, identity_id, token_digest, token_hint, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    )
    for (const participant of manifest.participants) {
      insertIdentity.run(
        participant.id,
        participant.seedIndex,
        participant.displayName,
        credentialDigest(
          manifest.credentialPepper,
          'student-number',
          participant.id,
          participant.studentNumber,
        ),
        participant.publicStarId,
        participant.visualSeed,
        appliedAt,
      )
      insertInvitation.run(
        `invitation-${participant.seedIndex.toString().padStart(3, '0')}`,
        participant.id,
        sha256(participant.inviteToken),
        `…${participant.inviteToken.slice(-4)}`,
        appliedAt,
        appliedAt,
      )
    }

    const insertProgram = database.prepare(
      `INSERT INTO program_catalog (
         id, sort_order, title, heat, enabled, created_at, updated_at
       ) VALUES (?, ?, ?, 0, 1, ?, ?)`,
    )
    for (const program of manifest.programs) {
      insertProgram.run(
        program.id,
        program.sortOrder,
        program.title,
        appliedAt,
        appliedAt,
      )
    }

    if (databaseTableExists(database, 'program_runtime_state')) {
      database
        .prepare(
          `UPDATE program_runtime_state
           SET current_program_id = ?, updated_at = ?
           WHERE id = 1`,
        )
        .run(manifest.programs[0]?.id ?? null, appliedAt)
    }

    const insertGift = database.prepare(
      `INSERT INTO gift_catalog (
         id, sort_order, name, power_cost, enabled, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    for (const gift of manifest.gifts) {
      insertGift.run(
        gift.id,
        gift.sortOrder,
        gift.name,
        gift.powerCost,
        appliedAt,
        appliedAt,
      )
    }

    database
      .prepare(
        `INSERT INTO admin_accounts (
           id, username, password_digest, enabled, created_at, updated_at
         ) VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .run(
        manifest.admin.id,
        manifest.admin.username,
        credentialDigest(
          manifest.credentialPepper,
          'admin-password',
          manifest.admin.id,
          manifest.admin.password,
        ),
        appliedAt,
        appliedAt,
      )

    database
      .prepare(
        `INSERT INTO demo_seed_meta (
           id, seed_version, seed_fingerprint, participant_count,
           generated_at, applied_at
         ) VALUES (1, ?, ?, ?, ?, ?)`,
      )
      .run(
        manifest.seedVersion,
        fingerprint,
        manifest.participants.length,
        manifest.generatedAt,
        appliedAt,
      )
    database
      .prepare(
        `UPDATE app_state
         SET seed_version = ?, seed_fingerprint = ?, updated_at = ?
         WHERE id = 1`,
      )
      .run(manifest.seedVersion, fingerprint, appliedAt)
    }

    const verification = verifyDemoSeed(database, options)
    if (!verification.ready) {
      throw new Error(`Seed verification failed: ${verification.issues.join('; ')}`)
    }
    database.exec('COMMIT')
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw error
  }

  return {
    createdManifest: created,
    seedVersion: manifest.seedVersion,
    participantCount: manifest.participants.length,
    fingerprint,
  }
}

export function restoreDemoSeedCatalogInTransaction(
  database: SqliteDatabase,
  options: Omit<SeedOptions, 'now'>,
  updatedAt: string,
): void {
  if (!database.inTransaction) {
    throw new Error('Seed catalog restoration requires an active transaction')
  }

  const manifest = readSeedManifest(options.manifestPath)
  validateManifestInvariants(manifest, options.participantCount)
  const fingerprint = fingerprintManifest(manifest)
  const meta = database
    .prepare(
      `SELECT seed_version AS seedVersion,
              seed_fingerprint AS fingerprint,
              participant_count AS participantCount
       FROM demo_seed_meta WHERE id = 1`,
    )
    .get() as
    | { seedVersion: string; fingerprint: string; participantCount: number }
    | undefined
  if (
    !meta ||
    meta.seedVersion !== manifest.seedVersion ||
    meta.fingerprint !== fingerprint ||
    meta.participantCount !== options.participantCount
  ) {
    throw new Error('Seed manifest does not match the initialized database')
  }

  database.exec(`
    UPDATE synthetic_identities
    SET seed_index = seed_index + 1000000,
        student_number_digest = lower(hex(randomblob(32))),
        public_star_id = 'RESTORE-' || id || '-' || lower(hex(randomblob(8))),
        visual_seed = lower(hex(randomblob(16)));
    UPDATE invitation_tokens
    SET token_digest = lower(hex(randomblob(32)));
    UPDATE program_catalog
    SET sort_order = sort_order + 1000000,
        title = 'RESTORE-' || id || '-' || lower(hex(randomblob(8)));
    UPDATE gift_catalog
    SET sort_order = sort_order + 1000000,
        name = 'RESTORE-' || id || '-' || lower(hex(randomblob(8)));
  `)

  const updateIdentity = database.prepare(
    `UPDATE synthetic_identities
     SET seed_index = ?, display_name = ?, student_number_digest = ?,
         public_star_id = ?, visual_seed = ?, enabled = 1
     WHERE id = ?`,
  )
  const updateInvitation = database.prepare(
    `UPDATE invitation_tokens
     SET token_digest = ?, token_hint = ?, status = 'ACTIVE', updated_at = ?
     WHERE identity_id = ?`,
  )
  for (const participant of manifest.participants) {
    const identity = updateIdentity.run(
      participant.seedIndex,
      participant.displayName,
      credentialDigest(
        manifest.credentialPepper,
        'student-number',
        participant.id,
        participant.studentNumber,
      ),
      participant.publicStarId,
      participant.visualSeed,
      participant.id,
    )
    const invitation = updateInvitation.run(
      sha256(participant.inviteToken),
      `…${participant.inviteToken.slice(-4)}`,
      updatedAt,
      participant.id,
    )
    if (identity.changes !== 1 || invitation.changes !== 1) {
      throw new Error('Seed identity or invitation catalog is incomplete')
    }
  }

  const updateProgram = database.prepare(
    `UPDATE program_catalog
     SET sort_order = ?, title = ?, heat = 0, enabled = 1, updated_at = ?
     WHERE id = ?`,
  )
  for (const program of manifest.programs) {
    if (
      updateProgram.run(
        program.sortOrder,
        program.title,
        updatedAt,
        program.id,
      ).changes !== 1
    ) {
      throw new Error('Seed program catalog is incomplete')
    }
  }

  if (databaseTableExists(database, 'program_runtime_state')) {
    database
      .prepare(
        `UPDATE program_runtime_state
         SET current_program_id = ?, updated_at = ?
         WHERE id = 1`,
      )
      .run(manifest.programs[0]?.id ?? null, updatedAt)
  }

  const updateGift = database.prepare(
    `UPDATE gift_catalog
     SET sort_order = ?, name = ?, power_cost = ?, enabled = 1,
         updated_at = ?
     WHERE id = ?`,
  )
  for (const gift of manifest.gifts) {
    if (
      updateGift.run(
        gift.sortOrder,
        gift.name,
        gift.powerCost,
        updatedAt,
        gift.id,
      ).changes !== 1
    ) {
      throw new Error('Seed gift catalog is incomplete')
    }
  }

  const admin = database
    .prepare(
      `UPDATE admin_accounts
       SET username = ?, password_digest = ?, enabled = 1, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      manifest.admin.username,
      credentialDigest(
        manifest.credentialPepper,
        'admin-password',
        manifest.admin.id,
        manifest.admin.password,
      ),
      updatedAt,
      manifest.admin.id,
    )
  if (admin.changes !== 1) {
    throw new Error('Seed admin account is incomplete')
  }

  const verification = verifyDemoSeed(database, options)
  if (!verification.ready) {
    throw new Error(`Seed restoration failed: ${verification.issues.join('; ')}`)
  }
}

export function verifyDemoSeed(
  database: SqliteDatabase,
  options: Omit<SeedOptions, 'now'>,
): SeedVerification {
  const issues: string[] = []
  let manifest: DemoSeedManifest | null = null
  let fingerprint: string | null = null

  try {
    manifest = readSeedManifest(options.manifestPath)
    validateManifestInvariants(manifest, options.participantCount)
    fingerprint = fingerprintManifest(manifest)
  } catch {
    issues.push('Seed manifest is missing or invalid')
  }

  if (!manifest || !fingerprint) {
    return {
      ready: false,
      issues,
      seedVersion: null,
      participantCount: 0,
      fingerprint: null,
    }
  }

  try {
    const meta = database
      .prepare(
        `SELECT seed_version AS seedVersion,
                seed_fingerprint AS fingerprint,
                participant_count AS participantCount
         FROM demo_seed_meta WHERE id = 1`,
      )
      .get() as
      | { seedVersion: string; fingerprint: string; participantCount: number }
      | undefined
    const state = database
      .prepare(
        `SELECT seed_version AS seedVersion,
                seed_fingerprint AS fingerprint
         FROM app_state WHERE id = 1`,
      )
      .get() as { seedVersion: string | null; fingerprint: string | null }
    const counts = database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM synthetic_identities) AS identities,
           (SELECT COUNT(*) FROM invitation_tokens) AS invitations,
           (SELECT COUNT(*) FROM program_catalog) AS programs,
           (SELECT COUNT(*) FROM gift_catalog) AS gifts,
           (SELECT COUNT(*) FROM admin_accounts) AS admins`,
      )
      .get() as {
      identities: number
      invitations: number
      programs: number
      gifts: number
      admins: number
    }

    if (!meta) issues.push('Seed metadata is missing')
    if (meta?.seedVersion !== manifest.seedVersion)
      issues.push('Seed version does not match')
    if (meta?.fingerprint !== fingerprint)
      issues.push('Seed fingerprint does not match')
    if (meta?.participantCount !== options.participantCount)
      issues.push('Seed metadata participant count does not match')
    if (state.seedVersion !== manifest.seedVersion)
      issues.push('Application seed version does not match')
    if (state.fingerprint !== fingerprint)
      issues.push('Application seed fingerprint does not match')
    if (counts.identities !== options.participantCount)
      issues.push('Synthetic identity count does not match')
    if (counts.invitations !== options.participantCount)
      issues.push('Invitation token count does not match')
    if (counts.programs !== manifest.programs.length)
      issues.push('Program catalog count does not match')
    if (counts.gifts !== manifest.gifts.length)
      issues.push('Gift catalog count does not match')
    if (counts.admins !== 1) issues.push('Admin account count does not match')

    const identityRows = database
      .prepare(
        `SELECT id, seed_index AS seedIndex, display_name AS displayName,
                student_number_digest AS studentNumberDigest,
                public_star_id AS publicStarId, visual_seed AS visualSeed,
                enabled
         FROM synthetic_identities`,
      )
      .all() as Array<{
      id: string
      seedIndex: number
      displayName: string
      studentNumberDigest: string
      publicStarId: string
      visualSeed: string
      enabled: number
    }>
    const identityById = new Map(identityRows.map((row) => [row.id, row]))
    const tokenRows = database
      .prepare(
        `SELECT identity_id AS identityId, token_digest AS tokenDigest
         FROM invitation_tokens`,
      )
      .all() as { identityId: string; tokenDigest: string }[]
    const tokenByIdentity = new Map(
      tokenRows.map((row) => [row.identityId, row.tokenDigest]),
    )
    for (const participant of manifest.participants) {
      const identity = identityById.get(participant.id)
      const expectedStudentNumberDigest = credentialDigest(
        manifest.credentialPepper,
        'student-number',
        participant.id,
        participant.studentNumber,
      )
      if (
        !identity ||
        identity.seedIndex !== participant.seedIndex ||
        identity.displayName !== participant.displayName ||
        identity.studentNumberDigest !== expectedStudentNumberDigest ||
        identity.publicStarId !== participant.publicStarId ||
        identity.visualSeed !== participant.visualSeed ||
        identity.enabled !== 1
      ) {
        issues.push('Synthetic identity catalog does not match')
        break
      }
      if (tokenByIdentity.get(participant.id) !== sha256(participant.inviteToken)) {
        issues.push('Invitation token digest set does not match')
        break
      }
    }

    const storedPrograms = database
      .prepare(
        `SELECT id, sort_order AS sortOrder, title, enabled
         FROM program_catalog ORDER BY sort_order`,
      )
      .all() as Array<{
      id: string
      sortOrder: number
      title: string
      enabled: number
    }>
    if (
      JSON.stringify(
        storedPrograms.map(({ id, sortOrder, title }) => ({
          id,
          sortOrder,
          title,
        })),
      ) !== JSON.stringify(manifest.programs) ||
      storedPrograms.some(({ enabled }) => enabled !== 1)
    ) {
      issues.push('Program catalog does not match')
    }

    const storedGifts = database
      .prepare(
        `SELECT id, sort_order AS sortOrder, name,
                power_cost AS powerCost, enabled
         FROM gift_catalog ORDER BY sort_order`,
      )
      .all() as Array<{
      id: string
      sortOrder: number
      name: string
      powerCost: number
      enabled: number
    }>
    if (
      JSON.stringify(
        storedGifts.map(({ id, sortOrder, name, powerCost }) => ({
          id,
          sortOrder,
          name,
          powerCost,
        })),
      ) !== JSON.stringify(manifest.gifts) ||
      storedGifts.some(({ enabled }) => enabled !== 1)
    ) {
      issues.push('Gift catalog does not match')
    }

    const admin = database
      .prepare(
        `SELECT id, username, password_digest AS passwordDigest, enabled
         FROM admin_accounts WHERE id = ?`,
      )
      .get(manifest.admin.id) as
      | {
          id: string
          username: string
          passwordDigest: string
          enabled: number
        }
      | undefined
    const expectedAdminDigest = credentialDigest(
        manifest.credentialPepper,
        'admin-password',
        manifest.admin.id,
        manifest.admin.password,
      )
    if (
      !admin ||
      admin.username !== manifest.admin.username ||
      admin.passwordDigest !== expectedAdminDigest ||
      admin.enabled !== 1
    ) {
      issues.push('Admin account seed does not match')
    }
  } catch {
    issues.push('Seed tables are unavailable or inconsistent')
  }

  return {
    ready: issues.length === 0,
    issues,
    seedVersion: manifest.seedVersion,
    participantCount: manifest.participants.length,
    fingerprint,
  }
}

export function verifyProtectedRoster(
  database: SqliteDatabase,
  options: Omit<SeedOptions, 'now'>,
): SeedVerification {
  const issues: string[] = []
  let secret: ProtectedRuntimeSecret | null = null

  try {
    secret = readProtectedRuntimeSecret(options.manifestPath)
  } catch {
    issues.push('Protected runtime secret is missing or invalid')
  }

  if (!secret) {
    return {
      ready: false,
      issues,
      seedVersion: null,
      participantCount: 0,
      fingerprint: null,
    }
  }

  if (secret.participantCount !== options.participantCount) {
    issues.push('Configured participant count does not match the protected roster')
  }

  try {
    const meta = database
      .prepare(
        `SELECT seed_version AS seedVersion,
                seed_fingerprint AS fingerprint,
                participant_count AS participantCount
         FROM demo_seed_meta WHERE id = 1`,
      )
      .get() as
      | { seedVersion: string; fingerprint: string; participantCount: number }
      | undefined
    const app = database
      .prepare(
        `SELECT seed_version AS seedVersion,
                seed_fingerprint AS fingerprint
         FROM app_state WHERE id = 1`,
      )
      .get() as { seedVersion: string | null; fingerprint: string | null }
    const protocol = database
      .prepare(
        `SELECT active_protocol_version AS activeProtocolVersion,
                activation_state AS activationState,
                data_classification AS dataClassification,
                protected_source_sha256 AS protectedSourceSha256,
                protected_imported_at AS protectedImportedAt,
                cutover_backup_sha256 AS cutoverBackupSha256,
                cutover_at AS cutoverAt
         FROM protocol_runtime WHERE id = 1`,
      )
      .get() as
      | {
          activeProtocolVersion: string
          activationState: string
          dataClassification: string
          protectedSourceSha256: string | null
          protectedImportedAt: string | null
          cutoverBackupSha256: string | null
          cutoverAt: string | null
        }
      | undefined
    const counts = database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM synthetic_identities) AS identities,
           (SELECT COUNT(*) FROM synthetic_identities WHERE enabled = 1) AS enabledIdentities,
           (SELECT COUNT(*) FROM invitation_tokens) AS invitations,
           (SELECT COUNT(*) FROM invitation_tokens WHERE status = 'ACTIVE') AS activeInvitations,
           (SELECT COUNT(*) FROM program_catalog) AS programs,
           (SELECT COUNT(*) FROM gift_catalog) AS gifts,
           (SELECT COUNT(*) FROM admin_accounts) AS admins`,
      )
      .get() as {
        identities: number
        enabledIdentities: number
        invitations: number
        activeInvitations: number
        programs: number
        gifts: number
        admins: number
      }
    const storedPrograms = database
      .prepare(
        `SELECT id, sort_order AS sortOrder, title, enabled
         FROM program_catalog ORDER BY sort_order`,
      )
      .all() as Array<{
        id: string
        sortOrder: number
        title: string
        enabled: number
      }>
    const storedGifts = database
      .prepare(
        `SELECT id, sort_order AS sortOrder, name,
                power_cost AS powerCost, enabled
         FROM gift_catalog ORDER BY sort_order`,
      )
      .all() as Array<{
        id: string
        sortOrder: number
        name: string
        powerCost: number
        enabled: number
      }>
    const admin = database
      .prepare(
        `SELECT id, username, password_digest AS passwordDigest, enabled
         FROM admin_accounts WHERE id = ?`,
      )
      .get(secret.admin.id) as
      | {
          id: string
          username: string
          passwordDigest: string
          enabled: number
        }
      | undefined

    if (!meta) issues.push('Protected roster metadata is missing')
    if (meta?.seedVersion !== PROTECTED_ROSTER_SEED_VERSION)
      issues.push('Protected roster seed version does not match')
    if (meta?.fingerprint !== secret.directoryFingerprint)
      issues.push('Protected roster metadata fingerprint does not match')
    if (meta?.participantCount !== secret.participantCount)
      issues.push('Protected roster metadata count does not match')
    if (app.seedVersion !== PROTECTED_ROSTER_SEED_VERSION)
      issues.push('Application protected roster version does not match')
    if (app.fingerprint !== secret.directoryFingerprint)
      issues.push('Application protected roster fingerprint does not match')
    if (
      protocol?.activeProtocolVersion !== '2' ||
      protocol.activationState !== 'V2_ACTIVE' ||
      protocol.dataClassification !== 'PROTECTED'
    ) {
      issues.push('Protocol v2 is not explicitly active on protected roster data')
    }
    if (
      protocol?.protectedSourceSha256 !== secret.sourceSha256 ||
      !protocol?.protectedImportedAt
    ) {
      issues.push('Protected roster source evidence is missing or inconsistent')
    }
    if (protocol?.cutoverBackupSha256 || protocol?.cutoverAt) {
      issues.push('Protected roster must not claim a synthetic Demo cutover')
    }
    if (
      counts.identities !== secret.participantCount ||
      counts.enabledIdentities !== secret.participantCount
    ) {
      issues.push('Protected identity count does not match')
    }
    if (
      counts.invitations !== secret.participantCount ||
      counts.activeInvitations !== secret.participantCount
    ) {
      issues.push('Protected invitation count does not match')
    }
    if (counts.programs !== PROGRAMS.length)
      issues.push('Protected program catalog count does not match')
    if (counts.gifts !== GIFTS.length)
      issues.push('Protected gift catalog count does not match')
    if (counts.admins !== 1) issues.push('Protected admin account count does not match')

    if (
      JSON.stringify(
        storedPrograms.map(({ id, sortOrder, title }) => ({ id, sortOrder, title })),
      ) !== JSON.stringify(PROGRAMS) ||
      storedPrograms.some(({ enabled }) => enabled !== 1)
    ) {
      issues.push('Protected program catalog does not match')
    }
    if (
      JSON.stringify(
        storedGifts.map(({ id, sortOrder, name, powerCost }) => ({
          id,
          sortOrder,
          name,
          powerCost,
        })),
      ) !== JSON.stringify(GIFTS) ||
      storedGifts.some(({ enabled }) => enabled !== 1)
    ) {
      issues.push('Protected gift catalog does not match')
    }
    if (
      !admin ||
      admin.username !== secret.admin.username ||
      admin.passwordDigest !== credentialDigest(
        secret.credentialPepper,
        'admin-password',
        secret.admin.id,
        secret.admin.password,
      ) ||
      admin.enabled !== 1
    ) {
      issues.push('Protected admin credential does not match')
    }

    const directoryFingerprint = fingerprintProtectedDirectoryDatabase(database)
    if (directoryFingerprint !== secret.directoryFingerprint) {
      issues.push('Protected directory fingerprint does not match the database')
    }
  } catch {
    issues.push('Protected roster tables are unavailable or inconsistent')
  }

  return {
    ready: issues.length === 0,
    issues: [...new Set(issues)],
    seedVersion: PROTECTED_ROSTER_SEED_VERSION,
    participantCount: secret.participantCount,
    fingerprint: secret.directoryFingerprint,
  }
}

export function verifyIdentityDirectory(
  database: SqliteDatabase,
  options: Omit<SeedOptions, 'now'>,
): SeedVerification {
  try {
    const raw = JSON.parse(fs.readFileSync(options.manifestPath, 'utf8')) as unknown
    if (ProtectedRuntimeSecretSchema.safeParse(raw).success) {
      return verifyProtectedRoster(database, options)
    }
  } catch {
    // The format-specific verifier below returns the fail-closed issue.
  }
  return verifyDemoSeed(database, options)
}
