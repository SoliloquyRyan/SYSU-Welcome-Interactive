import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'
import { V2RealtimeEventEnvelopeSchema } from '@sysu-welcome/contracts'

import {
  migrateActiveV2DatabaseFrom12To13,
  migrateDatabase,
  verifyMigrationHistoryAtVersion,
  verifyMigrations,
} from './migrate.js'
import {
  databaseTableExists,
  type SqliteDatabase,
} from './open-database.js'
import {
  restoreDemoSeedCatalogInTransaction,
  type SeedOptions,
  verifyDemoSeed,
} from './seed.js'

export const V2_DESTRUCTIVE_CONFIRMATION =
  'SYNTHETIC_DEMO_DATA_IS_DISPOSABLE' as const
export const V2_REWARD_RULE_VERSION = 'v2-rewards-2026-08-30-raffle' as const
export const V1_SERVICE_LEASE_MS = 30_000

export type V2MaintenanceErrorCode =
  | 'V2_DESTRUCTIVE_CONFIRMATION_REQUIRED'
  | 'V2_DATA_CLASSIFICATION_UNSAFE'
  | 'V2_SEED_VERIFICATION_FAILED'
  | 'V2_PROTOCOL_STATE_INVALID'
  | 'V2_MIGRATIONS_NOT_READY'
  | 'V2_BACKUP_REQUIRED'
  | 'V2_BACKUP_EXISTS'
  | 'V2_BACKUP_FAILED'
  | 'V2_DATA_CHANGED_DURING_CUTOVER'
  | 'V2_DATA_CHANGED_DURING_UPGRADE'
  | 'V2_CUTOVER_ROLLED_BACK'
  | 'V2_UPGRADE_ROLLED_BACK'
  | 'V2_SERVICE_ACTIVE'
  | 'V2_SERVICE_REGISTRATION_REQUIRED'

export class V2MaintenanceError extends Error {
  constructor(
    public readonly code: V2MaintenanceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'V2MaintenanceError'
  }
}

export interface ProtocolRuntimeState {
  activeProtocolVersion: '1' | '2'
  activationState: 'V1_ACTIVE' | 'V2_ACTIVE'
  dataClassification: 'UNVERIFIED' | 'SYNTHETIC_DEMO' | 'PROTECTED'
  cutoverBackupSha256: string | null
  cutoverAt: string | null
  v1ServiceInstanceId: string | null
  v1ServiceLeaseExpiresAt: string | null
  v1ServiceRegisteredAt: string | null
  v1ServiceGeneration: number
  v1ServiceListenGeneration: number | null
  v1ServiceListenedAt: string | null
  v1ServiceCleanShutdownGeneration: number | null
  v1ServiceCleanShutdownAt: string | null
}

interface SyntheticAssessment {
  participantCount: number
  discardCounts: Readonly<Record<string, number>>
}

interface V2AssessmentOptions extends Omit<SeedOptions, 'now'> {
  migrationsPath: string
}

export interface V2CutoverOptions
  extends Omit<SeedOptions, 'now'> {
  migrationsPath: string
  backupPath: string
  confirmation: string
  now?: () => Date
  beforeCommit?: () => void
}

export interface V2CutoverResult {
  previousResetEpoch: number
  resetEpoch: number
  backupPath: string
  backupSha256: string
  participantCount: number
  discardCounts: Readonly<Record<string, number>>
}

export interface V2ResetOptions extends Omit<SeedOptions, 'now'> {
  migrationsPath: string
  confirmation: string
  now?: () => Date
  beforeVerify?: (context: {
    previousResetEpoch: number
    resetEpoch: number
    timestamp: string
  }) => void
}

export interface V2ResetResult {
  previousResetEpoch: number
  resetEpoch: number
}

export interface V2UpgradeOptions extends Omit<SeedOptions, 'now'> {
  migrationsPath: string
  backupPath: string
  confirmation: string
  now?: () => Date
  beforeCommit?: () => void
}

export interface V2UpgradeResult {
  previousSchemaVersion: 12
  schemaVersion: 13
  resetEpoch: number
  backupPath: string
  backupSha256: string
  participantCount: number
}

export interface V2FoundationVerification {
  ready: boolean
  schemaVersion: number | null
  protocolVersion: '1' | '2' | null
  resetEpoch: number | null
  participantCount: number
  issues: string[]
}

function maintenanceError(
  code: V2MaintenanceErrorCode,
  message: string,
): never {
  throw new V2MaintenanceError(code, message)
}

function assertDestructiveConfirmation(confirmation: string): void {
  if (confirmation !== V2_DESTRUCTIVE_CONFIRMATION) {
    maintenanceError(
      'V2_DESTRUCTIVE_CONFIRMATION_REQUIRED',
      `Destructive operation requires confirmation ${V2_DESTRUCTIVE_CONFIRMATION}`,
    )
  }
}

const V1_MUTABLE_TABLES = [
  'blocked_sources',
  'cooperative_lights',
  'barrages',
  'gift_transactions',
  'value_ledger',
  'participant_states',
  'activation_attempts',
  'sessions',
  'idempotency_records',
  'domain_events',
  'admin_operation_records',
] as const

const V2_EPOCH_MUTABLE_TABLES = [
  'v2_raffle_draws',
  'v2_screen_moderation_audit',
  'v2_barrage_publications',
  'v2_public_sources',
  'v2_control_audit_context',
  'v2_final_recap_capsules',
  'v2_barrages',
  'v2_gift_transactions',
  'v2_domain_events',
  'v2_stream_cursors',
  'v2_idempotency_records',
  'v2_sessions',
  'v2_capsules',
  'v2_public_stars',
  'v2_reward_ledger',
  'v2_participant_states',
  'v2_control_receipts',
] as const

const V2_PRE_CUTOVER_TABLES = [
  ...V2_EPOCH_MUTABLE_TABLES,
  'v2_raffle_state',
  'v2_screen_interaction_state',
  'v2_identity_slots',
  'v2_runtime_state',
] as const

const EXPECTED_TABLES = new Set([
  '_schema_migrations',
  'app_state',
  'runtime_state',
  'demo_seed_meta',
  'synthetic_identities',
  'invitation_tokens',
  'program_catalog',
  'gift_catalog',
  'admin_accounts',
  'sessions',
  'idempotency_records',
  'domain_events',
  'admin_operation_records',
  'participant_states',
  'value_ledger',
  'gift_transactions',
  'barrages',
  'blocked_sources',
  'cooperative_lights',
  'activation_attempts',
  'program_runtime_state',
  'protocol_runtime',
  'v2_runtime_state',
  'v2_identity_slots',
  'v2_participant_states',
  'v2_reward_ledger',
  'v2_public_stars',
  'v2_capsules',
  'v2_sessions',
  'v2_idempotency_records',
  'v2_stream_cursors',
  'v2_domain_events',
  'v2_control_receipts',
  'v2_gift_transactions',
  'v2_barrages',
  'v2_final_recap_capsules',
  'v2_control_audit_context',
  'v2_screen_interaction_state',
  'v2_public_sources',
  'v2_barrage_publications',
  'v2_screen_moderation_audit',
  'v2_raffle_state',
  'v2_raffle_draws',
])

const EXPECTED_CUTOVER_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  app_state: [
    'id', 'reset_epoch', 'event_seq', 'seed_version', 'seed_fingerprint',
    'is_resetting', 'updated_at',
  ],
  runtime_state: [
    'id', 'mode', 'status', 'stage', 'stage_revision', 'display_batch',
    'barrage_paused', 'updated_at',
  ],
  demo_seed_meta: [
    'id', 'seed_version', 'seed_fingerprint', 'participant_count',
    'generated_at', 'applied_at',
  ],
  synthetic_identities: [
    'id', 'seed_index', 'display_name', 'student_number_digest',
    'public_star_id', 'visual_seed', 'enabled', 'created_at',
  ],
  invitation_tokens: [
    'id', 'identity_id', 'token_digest', 'token_hint', 'status',
    'created_at', 'updated_at',
  ],
  program_catalog: [
    'id', 'sort_order', 'title', 'heat', 'enabled', 'created_at', 'updated_at',
  ],
  gift_catalog: [
    'id', 'sort_order', 'name', 'power_cost', 'enabled', 'created_at',
    'updated_at',
  ],
  admin_accounts: [
    'id', 'username', 'password_digest', 'enabled', 'created_at', 'updated_at',
  ],
  sessions: [
    'id', 'session_type', 'subject_id', 'secret_digest', 'roles_json',
    'reset_epoch', 'short_id', 'created_at', 'expires_at', 'revoked_at',
  ],
  idempotency_records: [
    'id', 'reset_epoch', 'scope', 'key_digest', 'request_digest',
    'response_status', 'response_body_json', 'created_at', 'expires_at',
  ],
  domain_events: [
    'event_seq', 'event_id', 'reset_epoch', 'stream', 'event_type',
    'payload_json', 'committed_at', 'audience_subject_id',
  ],
  admin_operation_records: [
    'id', 'session_short_id', 'roles_json', 'action', 'result', 'request_id',
    'created_at',
  ],
  participant_states: [
    'identity_id', 'source_id', 'power_balance', 'starlight',
    'capsule_message', 'capsule_message_submitted_at', 'star_created_at',
    'star_started_at', 'first_gift_at', 'first_barrage_at',
    'cooperative_light_at', 'activated_at', 'updated_at',
    'star_temperature_kelvin', 'star_temperature_locked_at',
    'capsule_public_notice_at', 'capsule_candidate_status',
  ],
  value_ledger: [
    'id', 'identity_id', 'business_key', 'reason', 'power_delta',
    'starlight_delta', 'power_balance_after', 'starlight_after', 'created_at',
  ],
  gift_transactions: [
    'id', 'identity_id', 'program_id', 'gift_id', 'power_cost',
    'command_key_digest', 'created_at',
  ],
  barrages: [
    'id', 'identity_id', 'source_id', 'text', 'status', 'rejection_reason',
    'command_key_digest', 'display_seq', 'display_batch', 'created_at',
    'published_at', 'removed_at',
  ],
  blocked_sources: [
    'identity_id', 'source_id', 'blocked_by_session_short_id', 'blocked_at',
  ],
  cooperative_lights: ['identity_id', 'business_key', 'completed_at'],
  activation_attempts: ['id', 'outcome', 'request_id', 'created_at'],
  program_runtime_state: ['id', 'current_program_id', 'updated_at'],
  protocol_runtime: [
    'id', 'active_protocol_version', 'activation_state',
    'data_classification', 'cutover_backup_sha256', 'cutover_at',
    'v1_service_instance_id', 'v1_service_lease_expires_at',
    'v1_service_registered_at', 'v1_service_generation',
    'v1_service_listen_generation', 'v1_service_listened_at',
    'v1_service_clean_shutdown_generation', 'v1_service_clean_shutdown_at',
    'updated_at',
  ],
  v2_runtime_state: [
    'id', 'reset_epoch', 'mode', 'status', 'current_scene', 'run_revision',
    'presentation_type', 'presentation_revision', 'public_aggregate_revision',
    'admin_aggregate_revision', 'reward_rule_version', 'public_seq',
    'admin_seq', 'completed_at', 'updated_at',
  ],
  v2_identity_slots: [
    'identity_id', 'seed_index', 'public_star_id', 'formation_slot',
    'reserved_reset_epoch', 'reserved_at',
  ],
  v2_participant_states: [
    'identity_id', 'reset_epoch', 'participant_revision', 'onboarding_state',
    'activated_at', 'color_temperature_kelvin', 'display_color',
    'color_locked_at', 'capsule_decision', 'capsule_skipped_at', 'admitted_at',
    'admitted_scene', 'admitted_run_revision', 'started_at', 'first_gift_at',
    'first_barrage_at', 'cooperative_light_at', 'power_balance', 'starlight',
    'updated_at',
  ],
  v2_reward_ledger: [
    'id', 'reset_epoch', 'identity_id', 'event_key', 'delta',
    'reward_rule_version', 'created_at',
  ],
  v2_public_stars: [
    'identity_id', 'reset_epoch', 'public_star_id',
    'color_temperature_kelvin', 'display_color', 'formation_slot', 'started',
    'star_revision', 'updated_at',
  ],
  v2_capsules: [
    'identity_id', 'reset_epoch', 'capsule_id', 'text',
    'candidate_scope_accepted_at', 'moderation_status', 'submitted_at',
    'updated_at',
  ],
  v2_sessions: [
    'id', 'session_type', 'subject_id', 'secret_digest', 'roles_json',
    'reset_epoch', 'short_id', 'read_only', 'created_at', 'expires_at',
    'revoked_at',
  ],
  v2_idempotency_records: [
    'id', 'reset_epoch', 'scope', 'key_digest', 'request_digest',
    'response_status', 'response_body_json', 'created_at', 'expires_at',
  ],
  v2_stream_cursors: ['reset_epoch', 'stream_id', 'stream_seq'],
  v2_domain_events: [
    'reset_epoch', 'stream_id', 'stream_seq', 'event_id', 'event_name',
    'revision', 'payload_json', 'committed_at',
  ],
  v2_control_receipts: [
    'id', 'reset_epoch', 'idempotency_key_digest', 'command', 'result',
    'before_run_revision', 'after_run_revision',
    'before_presentation_revision', 'after_presentation_revision',
    'session_short_id', 'roles_json', 'request_id', 'created_at',
  ],
  v2_gift_transactions: [
    'id', 'reset_epoch', 'identity_id', 'program_id', 'gift_id',
    'power_cost', 'created_at',
  ],
  v2_barrages: [
    'id', 'reset_epoch', 'identity_id', 'text', 'created_at',
  ],
  v2_final_recap_capsules: [
    'reset_epoch', 'position', 'capsule_id', 'public_star_id',
    'color_temperature_kelvin', 'display_color', 'text', 'captured_at',
  ],
  v2_control_audit_context: [
    'receipt_id', 'readiness_warnings_json', 'funnel_json',
    'override_readiness_warnings', 'live_completion',
  ],
  v2_screen_interaction_state: [
    'id', 'reset_epoch', 'interaction_revision', 'barrage_paused',
    'display_batch', 'next_display_seq', 'updated_at',
  ],
  v2_public_sources: [
    'reset_epoch', 'identity_id', 'source_id', 'created_at', 'blocked_at',
    'blocked_by_session_short_id',
  ],
  v2_barrage_publications: [
    'barrage_id', 'reset_epoch', 'source_id', 'status', 'display_seq',
    'display_batch', 'published_at', 'removed_at', 'removed_reason',
    'removed_by_session_short_id',
  ],
  v2_screen_moderation_audit: [
    'id', 'reset_epoch', 'action', 'target_id', 'reason',
    'session_short_id', 'request_id', 'created_at',
  ],
  v2_raffle_state: [
    'id', 'reset_epoch', 'display_active', 'raffle_revision', 'updated_at',
  ],
  v2_raffle_draws: [
    'id', 'reset_epoch', 'draw_sequence', 'identity_id', 'drawn_at',
  ],
}

function countTableRows(
  database: SqliteDatabase,
  tableName: string,
): number {
  return Number(
    database.prepare(`SELECT count(*) FROM ${tableName}`).pluck().get(),
  )
}

function tableCounts(
  database: SqliteDatabase,
  tableNames: readonly string[],
): Record<string, number> {
  return Object.fromEntries(
    tableNames.map((tableName) => [
      tableName,
      countTableRows(database, tableName),
    ]),
  )
}

function nonzeroCounts(counts: Readonly<Record<string, number>>): string {
  return Object.entries(counts)
    .filter(([, count]) => count !== 0)
    .map(([tableName, count]) => `${tableName}=${count}`)
    .join(', ')
}

function unknownTables(database: SqliteDatabase): string[] {
  const tables = database
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .pluck()
    .all() as string[]
  return tables.filter((tableName) => !EXPECTED_TABLES.has(tableName))
}

function schemaDriftIssues(database: SqliteDatabase): string[] {
  const issues: string[] = []
  for (const [tableName, expectedColumns] of Object.entries(
    EXPECTED_CUTOVER_COLUMNS,
  )) {
    const actualColumns = (
      database
        .prepare(`PRAGMA table_xinfo(${tableName})`)
        .all() as Array<{ name: string }>
    )
      .map(({ name }) => name)
      .sort()
    const expected = [...expectedColumns].sort()
    if (JSON.stringify(actualColumns) !== JSON.stringify(expected)) {
      issues.push(`Unexpected schema for ${tableName}`)
    }
  }
  return issues
}

function sqliteIntegrityIssues(database: SqliteDatabase): string[] {
  const issues: string[] = []
  if (database.pragma('quick_check', { simple: true }) !== 'ok') {
    issues.push('SQLite quick_check failed')
  }
  if ((database.pragma('foreign_key_check') as unknown[]).length > 0) {
    issues.push('SQLite foreign-key verification failed')
  }
  return issues
}

function schemaDefinition(database: SqliteDatabase): string {
  return JSON.stringify(
    database
      .prepare(
        `SELECT type, name, tbl_name AS tableName, sql
         FROM sqlite_schema
         WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
         ORDER BY type, name`,
      )
      .all(),
  )
}

function schemaMatchesMigrations(
  database: SqliteDatabase,
  migrationsPath: string,
  throughVersion = 13,
): boolean {
  const pristine = new Database(':memory:')
  try {
    pristine.pragma('foreign_keys = ON')
    migrateDatabase(
      pristine,
      migrationsPath,
      () => new Date('2000-01-01T00:00:00.000Z'),
      throughVersion,
    )
    return schemaDefinition(database) === schemaDefinition(pristine)
  } finally {
    pristine.close()
  }
}

export function readProtocolRuntime(
  database: SqliteDatabase,
): ProtocolRuntimeState | null {
  if (!databaseTableExists(database, 'protocol_runtime')) return null

  return (
    database
      .prepare(
        `SELECT active_protocol_version AS activeProtocolVersion,
                activation_state AS activationState,
                data_classification AS dataClassification,
                cutover_backup_sha256 AS cutoverBackupSha256,
                cutover_at AS cutoverAt,
                v1_service_instance_id AS v1ServiceInstanceId,
                v1_service_lease_expires_at AS v1ServiceLeaseExpiresAt,
                v1_service_registered_at AS v1ServiceRegisteredAt,
                v1_service_generation AS v1ServiceGeneration,
                v1_service_listen_generation AS v1ServiceListenGeneration,
                v1_service_listened_at AS v1ServiceListenedAt,
                v1_service_clean_shutdown_generation AS v1ServiceCleanShutdownGeneration,
                v1_service_clean_shutdown_at AS v1ServiceCleanShutdownAt
         FROM protocol_runtime
         WHERE id = 1`,
      )
      .get() as ProtocolRuntimeState | undefined
  ) ?? null
}

export function acquireV1ServiceLease(
  database: SqliteDatabase,
  instanceId: string,
  now: Date = new Date(),
): number {
  if (!databaseTableExists(database, 'protocol_runtime')) {
    maintenanceError(
      'V2_MIGRATIONS_NOT_READY',
      'The current v1 service requires migration 0008 before it can register safely',
    )
  }
  const expiresAt = new Date(now.getTime() + V1_SERVICE_LEASE_MS).toISOString()
  database.exec('BEGIN IMMEDIATE')
  try {
    assertV1RuntimeCompatible(database)
    const result = database
      .prepare(
        `UPDATE protocol_runtime
         SET v1_service_instance_id = ?, v1_service_lease_expires_at = ?,
             v1_service_registered_at = ?,
             v1_service_generation = v1_service_generation + 1,
             updated_at = ?
         WHERE id = 1
           AND v1_service_instance_id IS NULL`,
      )
      .run(
        instanceId,
        expiresAt,
        now.toISOString(),
        now.toISOString(),
      )
    if (result.changes !== 1) {
      maintenanceError(
        'V2_SERVICE_ACTIVE',
        'Another live v1 service instance already holds the database lease',
      )
    }
    const generation = database
      .prepare(
        `SELECT v1_service_generation
         FROM protocol_runtime
         WHERE id = 1 AND v1_service_instance_id = ?`,
      )
      .pluck()
      .get(instanceId) as number
    database.exec('COMMIT')
    return generation
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw error
  }
}

export function renewV1ServiceLease(
  database: SqliteDatabase,
  instanceId: string,
  generation: number,
  now: Date = new Date(),
): boolean {
  if (!databaseTableExists(database, 'protocol_runtime')) return true
  const expiresAt = new Date(now.getTime() + V1_SERVICE_LEASE_MS).toISOString()
  return (
    database
      .prepare(
        `UPDATE protocol_runtime
         SET v1_service_lease_expires_at = ?, updated_at = ?
         WHERE id = 1
           AND active_protocol_version = '1'
           AND activation_state = 'V1_ACTIVE'
           AND v1_service_instance_id = ?
           AND v1_service_generation = ?`,
      )
      .run(expiresAt, now.toISOString(), instanceId, generation).changes === 1
  )
}

export function markV1ServiceListening(
  database: SqliteDatabase,
  instanceId: string,
  generation: number,
  now: Date = new Date(),
): void {
  database.exec('BEGIN IMMEDIATE')
  try {
    assertV1RuntimeCompatible(database)
    const result = database
      .prepare(
        `UPDATE protocol_runtime
         SET v1_service_listen_generation = ?, v1_service_listened_at = ?,
             updated_at = ?
         WHERE id = 1 AND v1_service_instance_id = ?
           AND v1_service_generation = ?`,
      )
      .run(generation, now.toISOString(), now.toISOString(), instanceId, generation)
    if (result.changes !== 1) {
      maintenanceError('V2_SERVICE_ACTIVE', 'The v1 service lost its registration before listening')
    }
    database.exec('COMMIT')
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw error
  }
}

export function abandonV1ServiceLease(
  database: SqliteDatabase,
  instanceId: string,
  generation: number,
  now: Date = new Date(),
): void {
  if (!databaseTableExists(database, 'protocol_runtime')) return
  database
    .prepare(
      `UPDATE protocol_runtime
       SET v1_service_instance_id = NULL,
           v1_service_lease_expires_at = NULL,
           updated_at = ?
       WHERE id = 1 AND v1_service_instance_id = ?
         AND v1_service_generation = ?`,
    )
    .run(now.toISOString(), instanceId, generation)
}

export function completeV1ServiceShutdown(
  database: SqliteDatabase,
  instanceId: string,
  generation: number,
  now: Date = new Date(),
): void {
  database.exec('BEGIN IMMEDIATE')
  try {
    assertV1RuntimeCompatible(database)
    const result = database
      .prepare(
        `UPDATE protocol_runtime
         SET v1_service_instance_id = NULL,
             v1_service_lease_expires_at = NULL,
             v1_service_clean_shutdown_generation = ?,
             v1_service_clean_shutdown_at = ?, updated_at = ?
         WHERE id = 1 AND v1_service_instance_id = ?
           AND v1_service_generation = ?
           AND v1_service_listen_generation = ?`,
      )
      .run(
        generation,
        now.toISOString(),
        now.toISOString(),
        instanceId,
        generation,
        generation,
      )
    if (result.changes !== 1) {
      maintenanceError('V2_SERVICE_REGISTRATION_REQUIRED', 'The v1 service cannot record a clean shutdown without a matching listen receipt')
    }
    database.exec('COMMIT')
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw error
  }
}

function assertNoActiveV1ServiceLease(database: SqliteDatabase): void {
  const runtime = readProtocolRuntime(database)
  if (runtime?.v1ServiceInstanceId) {
    maintenanceError(
      'V2_SERVICE_ACTIVE',
      'A v1 service is registered; stop it cleanly before protocol cutover',
    )
  }
}

function assertV1ServiceRegistrationObserved(database: SqliteDatabase): void {
  const runtime = readProtocolRuntime(database)
  if (
    !runtime?.v1ServiceRegisteredAt ||
    runtime.v1ServiceGeneration < 1 ||
    runtime.v1ServiceListenGeneration !== runtime.v1ServiceGeneration ||
    runtime.v1ServiceCleanShutdownGeneration !== runtime.v1ServiceGeneration ||
    !runtime.v1ServiceListenedAt ||
    !runtime.v1ServiceCleanShutdownAt
  ) {
    maintenanceError(
      'V2_SERVICE_REGISTRATION_REQUIRED',
      'Start the prepared v1 service successfully, then stop the same generation cleanly before cutover',
    )
  }
}

export function assertV1RuntimeCompatible(database: SqliteDatabase): void {
  const runtime = readProtocolRuntime(database)
  if (!runtime) return
  if (
    runtime.activeProtocolVersion !== '1' ||
    runtime.activationState !== 'V1_ACTIVE'
  ) {
    maintenanceError(
      'V2_PROTOCOL_STATE_INVALID',
      'This v1 runtime refuses a database whose active protocol is not v1',
    )
  }
  const v2Counts = tableCounts(database, V2_PRE_CUTOVER_TABLES)
  const activeV2Facts = nonzeroCounts(v2Counts)
  if (activeV2Facts) {
    maintenanceError(
      'V2_PROTOCOL_STATE_INVALID',
      `A v1 database must not contain v2 runtime facts: ${activeV2Facts}`,
    )
  }
}

/**
 * Serializes a legacy v1 write with the protocol cutover transaction.
 *
 * A request that already passed the HTTP compatibility hook cannot race a
 * v2 cutover and commit a legacy row afterwards. Callers already inside a
 * write transaction retain that transaction and still re-check the protocol.
 */
export function executeV1WriteTransaction<T>(
  database: SqliteDatabase,
  operation: () => T,
): T {
  if (database.inTransaction) {
    assertV1RuntimeCompatible(database)
    return operation()
  }

  database.exec('BEGIN IMMEDIATE')
  try {
    assertV1RuntimeCompatible(database)
    const result = operation()
    database.exec('COMMIT')
    return result
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw error
  }
}

function assertMigrationsReady(
  database: SqliteDatabase,
  migrationsPath: string,
): void {
  const verification = verifyMigrations(database, migrationsPath)
  if (!verification.ready || verification.currentVersion !== 13) {
    maintenanceError(
      'V2_MIGRATIONS_NOT_READY',
      `V2 cutover requires the complete schema through migration 0013: ${verification.issues.join('; ')}`,
    )
  }
}

function assessSyntheticDemoData(
  database: SqliteDatabase,
  options: V2AssessmentOptions,
  expectedProtocol: '1' | '2',
): SyntheticAssessment {
  const runtime = readProtocolRuntime(database)
  if (
    !runtime ||
    runtime.activeProtocolVersion !== expectedProtocol ||
    runtime.activationState !==
      (expectedProtocol === '1' ? 'V1_ACTIVE' : 'V2_ACTIVE')
  ) {
    maintenanceError(
      'V2_PROTOCOL_STATE_INVALID',
      `Expected an active protocol v${expectedProtocol} database`,
    )
  }
  if (runtime.dataClassification === 'PROTECTED') {
    maintenanceError(
      'V2_DATA_CLASSIFICATION_UNSAFE',
      'Protected, real, non-rebuildable or valuable data cannot be reset',
    )
  }
  if (options.participantCount !== 300) {
    maintenanceError(
      'V2_DATA_CLASSIFICATION_UNSAFE',
      'V2 cutover/reset requires the exact frozen 300-identity synthetic directory',
    )
  }

  const seed = verifyDemoSeed(database, options)
  if (!seed.ready) {
    maintenanceError(
      'V2_SEED_VERIFICATION_FAILED',
      `The fixed synthetic seed could not be verified: ${seed.issues.join('; ')}`,
    )
  }
  if (seed.participantCount !== 300) {
    maintenanceError(
      'V2_DATA_CLASSIFICATION_UNSAFE',
      'The verified seed is not the exact 300-identity synthetic directory',
    )
  }

  const integrityIssues = sqliteIntegrityIssues(database)
  if (integrityIssues.length > 0) {
    maintenanceError(
      'V2_DATA_CLASSIFICATION_UNSAFE',
      `SQLite integrity checks prevent proving this is a supported synthetic baseline: ${integrityIssues.join('; ')}`,
    )
  }

  const extraTables = unknownTables(database)
  if (extraTables.length > 0) {
    maintenanceError(
      'V2_DATA_CLASSIFICATION_UNSAFE',
      `Unknown tables prevent destructive classification: ${extraTables.join(', ')}`,
    )
  }
  const schemaIssues = schemaDriftIssues(database)
  if (schemaIssues.length > 0) {
    maintenanceError(
      'V2_DATA_CLASSIFICATION_UNSAFE',
      `Schema drift may conceal retained data: ${schemaIssues.join('; ')}`,
    )
  }
  if (!schemaMatchesMigrations(database, options.migrationsPath)) {
    maintenanceError(
      'V2_DATA_CLASSIFICATION_UNSAFE',
      'The live SQLite schema does not exactly match migrations 0001-0013',
    )
  }

  const discardCounts = tableCounts(
    database,
    expectedProtocol === '1'
      ? [...V1_MUTABLE_TABLES, ...V2_PRE_CUTOVER_TABLES]
      : V1_MUTABLE_TABLES,
  )
  if (expectedProtocol === '1') {
    const dataToDiscard = nonzeroCounts(discardCounts)
    if (dataToDiscard) {
      maintenanceError(
        'V2_DATA_CLASSIFICATION_UNSAFE',
        `V1→v2 cutover only accepts a clean synthetic baseline; mutable or partial v2 data requires a separate human retention decision: ${dataToDiscard}`,
      )
    }
    const baseline = database
      .prepare(
        `SELECT a.event_seq AS eventSeq,
                a.is_resetting AS isResetting,
                r.mode,
                r.status,
                r.stage,
                r.stage_revision AS stageRevision,
                r.display_batch AS displayBatch,
                r.barrage_paused AS barragePaused,
                p.current_program_id AS currentProgramId,
                (SELECT COALESCE(sum(heat), 0) FROM program_catalog) AS totalHeat
         FROM app_state a
         CROSS JOIN runtime_state r
         CROSS JOIN program_runtime_state p
         WHERE a.id = 1 AND r.id = 1 AND p.id = 1`,
      )
      .get() as
      | {
          eventSeq: number
          isResetting: number
          mode: string
          status: string
          stage: number
          stageRevision: number
          displayBatch: number
          barragePaused: number
          currentProgramId: string | null
          totalHeat: number
        }
      | undefined
    const firstProgramId = database
      .prepare(
        'SELECT id FROM program_catalog WHERE enabled = 1 ORDER BY sort_order LIMIT 1',
      )
      .pluck()
      .get() as string | undefined
    if (
      !baseline ||
      baseline.eventSeq !== 0 ||
      baseline.isResetting !== 0 ||
      baseline.mode !== 'REHEARSAL' ||
      baseline.status !== 'READY' ||
      baseline.stage !== 1 ||
      baseline.stageRevision !== 0 ||
      baseline.displayBatch !== 0 ||
      baseline.barragePaused !== 0 ||
      baseline.currentProgramId !== (firstProgramId ?? null) ||
      baseline.totalHeat !== 0
    ) {
      maintenanceError(
        'V2_DATA_CLASSIFICATION_UNSAFE',
        'V1→v2 cutover requires the deterministic clean runtime baseline',
      )
    }
  }

  return {
    participantCount: seed.participantCount,
    discardCounts,
  }
}

function assessSyntheticV2UpgradeSource(
  database: SqliteDatabase,
  options: V2UpgradeOptions,
): { participantCount: number; resetEpoch: number } {
  const migrations = verifyMigrationHistoryAtVersion(
    database,
    options.migrationsPath,
    12,
  )
  if (!migrations.ready || migrations.availableVersion !== 13) {
    maintenanceError(
      'V2_MIGRATIONS_NOT_READY',
      `V2 upgrade requires an exact schema-12 database and migration 0013 as the repository tip: ${migrations.issues.join('; ')}`,
    )
  }

  const runtime = readProtocolRuntime(database)
  if (
    !runtime ||
    runtime.activeProtocolVersion !== '2' ||
    runtime.activationState !== 'V2_ACTIVE'
  ) {
    maintenanceError(
      'V2_PROTOCOL_STATE_INVALID',
      'V2 schema upgrade requires an active protocol v2 database',
    )
  }
  if (runtime.dataClassification !== 'SYNTHETIC_DEMO') {
    maintenanceError(
      'V2_DATA_CLASSIFICATION_UNSAFE',
      'V2 schema upgrade only accepts the explicitly classified synthetic Demo database',
    )
  }
  if (!runtime.cutoverBackupSha256 || !runtime.cutoverAt) {
    maintenanceError(
      'V2_PROTOCOL_STATE_INVALID',
      'V2 schema upgrade requires the original cutover backup evidence',
    )
  }
  if (runtime.v1ServiceInstanceId !== null) {
    maintenanceError(
      'V2_SERVICE_ACTIVE',
      'A registered legacy service still owns the database',
    )
  }
  if (options.participantCount !== 300) {
    maintenanceError(
      'V2_DATA_CLASSIFICATION_UNSAFE',
      'V2 schema upgrade requires the exact frozen 300-identity synthetic directory',
    )
  }

  const seed = verifyDemoSeed(database, options)
  if (!seed.ready || seed.participantCount !== 300) {
    maintenanceError(
      'V2_SEED_VERIFICATION_FAILED',
      `The fixed synthetic seed could not be verified: ${seed.issues.join('; ')}`,
    )
  }
  const integrityIssues = sqliteIntegrityIssues(database)
  if (integrityIssues.length > 0) {
    maintenanceError(
      'V2_DATA_CLASSIFICATION_UNSAFE',
      `SQLite integrity checks failed before upgrade: ${integrityIssues.join('; ')}`,
    )
  }
  const extraTables = unknownTables(database)
  if (extraTables.length > 0) {
    maintenanceError(
      'V2_DATA_CLASSIFICATION_UNSAFE',
      `Unknown tables prevent a controlled upgrade: ${extraTables.join(', ')}`,
    )
  }
  if (!schemaMatchesMigrations(database, options.migrationsPath, 12)) {
    maintenanceError(
      'V2_DATA_CLASSIFICATION_UNSAFE',
      'The live SQLite schema does not exactly match migrations 0001-0012',
    )
  }
  const v1MutableFacts = nonzeroCounts(tableCounts(database, V1_MUTABLE_TABLES))
  if (v1MutableFacts) {
    maintenanceError(
      'V2_DATA_CLASSIFICATION_UNSAFE',
      `Protocol v1 mutable state remains in the v2 database: ${v1MutableFacts}`,
    )
  }

  const state = database
    .prepare(
      `SELECT app.reset_epoch AS appResetEpoch,
              app.is_resetting AS isResetting,
              runtime.reset_epoch AS runtimeResetEpoch,
              (SELECT count(*) FROM v2_identity_slots) AS slotCount
       FROM app_state app
       CROSS JOIN v2_runtime_state runtime
       WHERE app.id = 1 AND runtime.id = 1`,
    )
    .get() as
    | {
        appResetEpoch: number
        isResetting: number
        runtimeResetEpoch: number
        slotCount: number
      }
    | undefined
  if (
    !state ||
    state.isResetting !== 0 ||
    state.appResetEpoch !== state.runtimeResetEpoch ||
    state.slotCount !== 300
  ) {
    maintenanceError(
      'V2_PROTOCOL_STATE_INVALID',
      'The schema-12 protocol v2 runtime is not at a stable synthetic maintenance boundary',
    )
  }

  return { participantCount: seed.participantCount, resetEpoch: state.runtimeResetEpoch }
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

async function createVerifiedBackup(
  database: SqliteDatabase,
  backupPath: string,
  expectedProtocol: '1' | '2',
): Promise<{ backupPath: string; sha256: string; dataVersion: number }> {
  const resolvedBackupPath = path.resolve(backupPath)
  if (!resolvedBackupPath) {
    maintenanceError('V2_BACKUP_REQUIRED', 'A backup path is required')
  }
  if (path.resolve(database.name) === resolvedBackupPath) {
    maintenanceError(
      'V2_BACKUP_REQUIRED',
      'The backup path must differ from the active database path',
    )
  }
  if (fs.existsSync(resolvedBackupPath)) {
    maintenanceError(
      'V2_BACKUP_EXISTS',
      'The maintenance backup path already exists and will not be overwritten',
    )
  }
  const parentPath = path.dirname(resolvedBackupPath)
  if (!fs.existsSync(parentPath)) {
    maintenanceError(
      'V2_BACKUP_REQUIRED',
      'The maintenance backup parent directory must already exist',
    )
  }

  const dataVersion = Number(
    database.pragma('data_version', { simple: true }),
  )
  const partialBackupPath = path.join(
    parentPath,
    `.${path.basename(resolvedBackupPath)}.partial-${randomUUID()}`,
  )
  try {
    await database.backup(partialBackupPath)
    const backup = new Database(partialBackupPath, {
      readonly: true,
      fileMustExist: true,
    })
    try {
      const runtime = readProtocolRuntime(backup)
      if (
        runtime?.activeProtocolVersion !== expectedProtocol ||
        runtime.activationState !==
          (expectedProtocol === '1' ? 'V1_ACTIVE' : 'V2_ACTIVE')
      ) {
        maintenanceError(
          'V2_BACKUP_FAILED',
          `The backup is not a readable protocol v${expectedProtocol} snapshot`,
        )
      }
      const integrity = backup.pragma('integrity_check', {
        simple: true,
      })
      if (integrity !== 'ok') {
        maintenanceError(
          'V2_BACKUP_FAILED',
          'The SQLite backup failed its integrity check',
        )
      }
    } finally {
      backup.close()
    }
    if (
      Number(database.pragma('data_version', { simple: true })) !== dataVersion
    ) {
      maintenanceError(
        expectedProtocol === '1'
          ? 'V2_DATA_CHANGED_DURING_CUTOVER'
          : 'V2_DATA_CHANGED_DURING_UPGRADE',
        'The database changed while the maintenance backup was being created',
      )
    }
    const sha256 = sha256File(partialBackupPath)
    try {
      fs.linkSync(partialBackupPath, resolvedBackupPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        maintenanceError(
          'V2_BACKUP_EXISTS',
          'The maintenance backup path was claimed concurrently and was not overwritten',
        )
      }
      throw error
    }
    return {
      backupPath: resolvedBackupPath,
      sha256,
      dataVersion,
    }
  } catch (error) {
    if (error instanceof V2MaintenanceError) throw error
    return maintenanceError(
      'V2_BACKUP_FAILED',
      `Could not create a consistent SQLite backup: ${error instanceof Error ? error.message : 'unknown failure'}`,
    )
  } finally {
    if (fs.existsSync(partialBackupPath)) {
      fs.rmSync(partialBackupPath, { force: true })
    }
  }
}

function clearV1MutableState(database: SqliteDatabase): void {
  database.exec(`
    DELETE FROM blocked_sources;
    DELETE FROM cooperative_lights;
    DELETE FROM barrages;
    DELETE FROM gift_transactions;
    DELETE FROM value_ledger;
    DELETE FROM participant_states;
    DELETE FROM activation_attempts;
    DELETE FROM sessions;
    DELETE FROM idempotency_records;
    DELETE FROM domain_events;
    DELETE FROM admin_operation_records;
  `)
}

function clearV2MutableState(database: SqliteDatabase): void {
  database.exec(`
    DELETE FROM v2_raffle_draws;
    DELETE FROM v2_raffle_state;
    DELETE FROM v2_screen_moderation_audit;
    DELETE FROM v2_barrage_publications;
    DELETE FROM v2_public_sources;
    DELETE FROM v2_screen_interaction_state;
    DELETE FROM v2_control_audit_context;
    DELETE FROM v2_final_recap_capsules;
    DELETE FROM v2_barrages;
    DELETE FROM v2_gift_transactions;
    DELETE FROM v2_domain_events;
    DELETE FROM v2_stream_cursors;
    DELETE FROM v2_idempotency_records;
    DELETE FROM v2_sessions;
    DELETE FROM v2_control_receipts;
    DELETE FROM v2_capsules;
    DELETE FROM v2_public_stars;
    DELETE FROM v2_reward_ledger;
    DELETE FROM v2_participant_states;
  `)
}

function resetLegacyRuntimeShell(
  database: SqliteDatabase,
  timestamp: string,
): void {
  database
    .prepare(
      `UPDATE runtime_state
       SET mode = 'REHEARSAL', status = 'READY', stage = 1,
           stage_revision = 0, display_batch = 0, barrage_paused = 0,
           updated_at = ?
       WHERE id = 1`,
    )
    .run(timestamp)
  database
    .prepare(
      `UPDATE program_runtime_state
       SET current_program_id = NULL, updated_at = ?
       WHERE id = 1`,
    )
    .run(timestamp)
}

function initializeV2Runtime(
  database: SqliteDatabase,
  resetEpoch: number,
  timestamp: string,
): void {
  database
    .prepare(
      `INSERT INTO v2_runtime_state (
         id, reset_epoch, mode, status, current_scene, run_revision,
         presentation_type, presentation_revision,
         public_aggregate_revision, admin_aggregate_revision,
         reward_rule_version,
         public_seq, admin_seq, completed_at, updated_at
       ) VALUES (
         1, ?, 'REHEARSAL', 'READY', NULL, 0,
         'NONE', 0, 0, 0, ?, 0, 0, NULL, ?
       )`,
    )
    .run(resetEpoch, V2_REWARD_RULE_VERSION, timestamp)
  database.prepare(
    `INSERT INTO v2_screen_interaction_state (
       id, reset_epoch, interaction_revision, barrage_paused,
       display_batch, next_display_seq, updated_at
     ) VALUES (1, ?, 0, 0, 0, 1, ?)`,
  ).run(resetEpoch, timestamp)
  database.prepare(
    `INSERT INTO v2_raffle_state (
       id, reset_epoch, display_active, raffle_revision, updated_at
     ) VALUES (1, ?, 0, 0, ?)`,
  ).run(resetEpoch, timestamp)
  database
    .prepare(
      `INSERT INTO v2_stream_cursors (reset_epoch, stream_id, stream_seq)
       VALUES (?, 'public', 0), (?, 'admin', 0)`,
    )
    .run(resetEpoch, resetEpoch)
}

export async function switchSyntheticDemoToV2(
  database: SqliteDatabase,
  options: V2CutoverOptions,
): Promise<V2CutoverResult> {
  assertDestructiveConfirmation(options.confirmation)
  assertMigrationsReady(database, options.migrationsPath)
  assertV1RuntimeCompatible(database)
  assertNoActiveV1ServiceLease(database)
  assertV1ServiceRegistrationObserved(database)
  const assessment = assessSyntheticDemoData(database, options, '1')
  const backup = await createVerifiedBackup(database, options.backupPath, '1')

  database.exec('BEGIN IMMEDIATE')
  try {
    if (
      Number(database.pragma('data_version', { simple: true })) !==
      backup.dataVersion
    ) {
      maintenanceError(
        'V2_DATA_CHANGED_DURING_CUTOVER',
        'The database changed after backup and before the cutover lock',
      )
    }
    assertMigrationsReady(database, options.migrationsPath)
    assertV1RuntimeCompatible(database)
    assertNoActiveV1ServiceLease(database)
    assertV1ServiceRegistrationObserved(database)
    assessSyntheticDemoData(database, options, '1')

    const timestamp = (options.now ?? (() => new Date()))().toISOString()
    const state = database
      .prepare(
        'SELECT reset_epoch AS resetEpoch FROM app_state WHERE id = 1',
      )
      .get() as { resetEpoch: number }
    const resetEpoch = state.resetEpoch + 1

    database
      .prepare(
        'UPDATE app_state SET is_resetting = 1, updated_at = ? WHERE id = 1',
      )
      .run(timestamp)
    restoreDemoSeedCatalogInTransaction(database, options, timestamp)
    clearV2MutableState(database)
    database.exec('DELETE FROM v2_identity_slots; DELETE FROM v2_runtime_state;')
    clearV1MutableState(database)
    resetLegacyRuntimeShell(database, timestamp)

    database
      .prepare(
        `INSERT INTO v2_identity_slots (
           identity_id, seed_index, public_star_id, formation_slot,
           reserved_reset_epoch, reserved_at
         )
         SELECT id, seed_index, public_star_id, 'slot:' || visual_seed, NULL, NULL
         FROM synthetic_identities
         WHERE enabled = 1
         ORDER BY seed_index`,
      )
      .run()
    initializeV2Runtime(database, resetEpoch, timestamp)
    database
      .prepare(
        `UPDATE app_state
         SET reset_epoch = ?, event_seq = 0, is_resetting = 0, updated_at = ?
         WHERE id = 1`,
      )
      .run(resetEpoch, timestamp)
    database
      .prepare(
        `UPDATE protocol_runtime
         SET active_protocol_version = '2',
             activation_state = 'V2_ACTIVE',
             data_classification = 'SYNTHETIC_DEMO',
             cutover_backup_sha256 = ?,
             cutover_at = ?,
             updated_at = ?
         WHERE id = 1`,
      )
      .run(backup.sha256, timestamp, timestamp)
    const verification = verifyV2Foundation(database, options)
    if (!verification.ready) {
      maintenanceError(
        'V2_PROTOCOL_STATE_INVALID',
        `V2 cutover verification failed: ${verification.issues.join('; ')}`,
      )
    }
    options.beforeCommit?.()
    database.exec('COMMIT')

    return {
      previousResetEpoch: state.resetEpoch,
      resetEpoch,
      backupPath: backup.backupPath,
      backupSha256: backup.sha256,
      participantCount: assessment.participantCount,
      discardCounts: assessment.discardCounts,
    }
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw new V2MaintenanceError(
      'V2_CUTOVER_ROLLED_BACK',
      `V2 cutover transaction rolled back; the verified v1 backup was retained at ${backup.backupPath}. Cause: ${error instanceof Error ? error.message : 'unknown failure'}`,
    )
  }
}

export async function upgradeSyntheticV2DatabaseFrom12To13(
  database: SqliteDatabase,
  options: V2UpgradeOptions,
): Promise<V2UpgradeResult> {
  assertDestructiveConfirmation(options.confirmation)
  const assessment = assessSyntheticV2UpgradeSource(database, options)
  const backup = await createVerifiedBackup(database, options.backupPath, '2')

  database.exec('BEGIN IMMEDIATE')
  try {
    if (
      Number(database.pragma('data_version', { simple: true })) !==
      backup.dataVersion
    ) {
      maintenanceError(
        'V2_DATA_CHANGED_DURING_UPGRADE',
        'The database changed after backup and before the upgrade lock',
      )
    }
    assessSyntheticV2UpgradeSource(database, options)
    const migration = migrateActiveV2DatabaseFrom12To13(
      database,
      options.migrationsPath,
      options.now,
    )
    const verification = verifyV2Foundation(database, options)
    if (!verification.ready) {
      maintenanceError(
        'V2_PROTOCOL_STATE_INVALID',
        `V2 schema upgrade verification failed: ${verification.issues.join('; ')}`,
      )
    }
    options.beforeCommit?.()
    database.exec('COMMIT')

    return {
      previousSchemaVersion: migration.previousVersion as 12,
      schemaVersion: migration.currentVersion as 13,
      resetEpoch: assessment.resetEpoch,
      backupPath: backup.backupPath,
      backupSha256: backup.sha256,
      participantCount: assessment.participantCount,
    }
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw new V2MaintenanceError(
      'V2_UPGRADE_ROLLED_BACK',
      `V2 schema upgrade rolled back; the verified schema-12 backup was retained at ${backup.backupPath}. Cause: ${error instanceof Error ? error.message : 'unknown failure'}`,
    )
  }
}

export function resetSyntheticV2Database(
  database: SqliteDatabase,
  options: V2ResetOptions,
): V2ResetResult {
  assertDestructiveConfirmation(options.confirmation)
  assessSyntheticDemoData(database, options, '2')
  const before = verifyV2Foundation(database, options)
  if (!before.ready) {
    maintenanceError(
      'V2_PROTOCOL_STATE_INVALID',
      `V2 reset refuses an inconsistent database: ${before.issues.join('; ')}`,
    )
  }
  const timestamp = (options.now ?? (() => new Date()))().toISOString()

  database.exec('BEGIN IMMEDIATE')
  try {
    assessSyntheticDemoData(database, options, '2')
    const locked = verifyV2Foundation(database, options)
    if (!locked.ready) {
      maintenanceError(
        'V2_PROTOCOL_STATE_INVALID',
        'V2 reset refuses state that changed before the maintenance lock: ' +
          locked.issues.join('; '),
      )
    }
    const state = database
      .prepare(
        'SELECT reset_epoch AS resetEpoch FROM v2_runtime_state WHERE id = 1',
      )
      .get() as { resetEpoch: number }
    const resetEpoch = state.resetEpoch + 1

    database
      .prepare(
        'UPDATE app_state SET is_resetting = 1, updated_at = ? WHERE id = 1',
      )
      .run(timestamp)
    clearV2MutableState(database)
    database.exec('DELETE FROM v2_runtime_state;')
    database
      .prepare(
        `UPDATE v2_identity_slots
         SET reserved_reset_epoch = NULL, reserved_at = NULL`,
      )
      .run()
    initializeV2Runtime(database, resetEpoch, timestamp)
    database
      .prepare(
        `UPDATE app_state
         SET reset_epoch = ?, event_seq = 0, is_resetting = 0, updated_at = ?
         WHERE id = 1`,
      )
      .run(resetEpoch, timestamp)
    database
      .prepare(
        'UPDATE protocol_runtime SET updated_at = ? WHERE id = 1',
      )
      .run(timestamp)
    options.beforeVerify?.({
      previousResetEpoch: state.resetEpoch,
      resetEpoch,
      timestamp,
    })
    const after = verifyV2Foundation(database, options)
    if (!after.ready) {
      maintenanceError(
        'V2_PROTOCOL_STATE_INVALID',
        `V2 reset verification failed: ${after.issues.join('; ')}`,
      )
    }
    database.exec('COMMIT')
    return { previousResetEpoch: state.resetEpoch, resetEpoch }
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw error
  }
}

export function verifyV2Foundation(
  database: SqliteDatabase,
  options: Omit<V2CutoverOptions, 'backupPath' | 'confirmation' | 'now'>,
): V2FoundationVerification {
  const issues: string[] = []
  const migrations = verifyMigrations(database, options.migrationsPath)
  if (!migrations.ready) issues.push(...migrations.issues)
  const extraTables = unknownTables(database)
  if (extraTables.length > 0) {
    issues.push(`Unknown tables are present: ${extraTables.join(', ')}`)
  }
  issues.push(...schemaDriftIssues(database))
  if (migrations.ready && !schemaMatchesMigrations(database, options.migrationsPath)) {
    issues.push('The live SQLite schema does not exactly match migrations 0001-0013')
  }

  const seed = verifyDemoSeed(database, options)
  if (!seed.ready) issues.push(...seed.issues)

  const protocol = readProtocolRuntime(database)
  if (
    protocol?.activeProtocolVersion !== '2' ||
    protocol.activationState !== 'V2_ACTIVE' ||
    protocol.dataClassification !== 'SYNTHETIC_DEMO'
  ) {
    issues.push('Protocol v2 is not explicitly active on synthetic Demo data')
  }
  if (!protocol?.cutoverBackupSha256 || !protocol.cutoverAt) {
    issues.push('Protocol v2 cutover backup evidence is missing')
  }

  let resetEpoch: number | null = null
  try {
    const runtime = database
      .prepare(
        `SELECT v.reset_epoch AS resetEpoch,
                v.run_revision AS runRevision,
                v.presentation_type AS presentationType,
                v.presentation_revision AS presentationRevision,
                v.public_aggregate_revision AS publicAggregateRevision,
                v.admin_aggregate_revision AS adminAggregateRevision,
                v.reward_rule_version AS rewardRuleVersion,
                a.reset_epoch AS appResetEpoch
         FROM v2_runtime_state v
         CROSS JOIN app_state a
         WHERE v.id = 1 AND a.id = 1`,
      )
      .get() as
      | {
          resetEpoch: number
          appResetEpoch: number
          runRevision: number
          presentationType: string
          presentationRevision: number
          publicAggregateRevision: number
          adminAggregateRevision: number
          rewardRuleVersion: string
        }
      | undefined
    resetEpoch = runtime?.resetEpoch ?? null
    if (!runtime || runtime.resetEpoch !== runtime.appResetEpoch) {
      issues.push('The v2 runtime and application reset epochs differ')
    }
    const currentEpoch = runtime?.resetEpoch
    if (currentEpoch === undefined) {
      throw new Error('Protocol v2 runtime row is missing')
    }
    if (!runtime) {
      throw new Error('Protocol v2 runtime row is missing')
    }
    if (runtime.rewardRuleVersion !== V2_REWARD_RULE_VERSION) {
      issues.push('The v2 runtime reward rule version is not supported')
    }
    const raffleState = database.prepare(
      `SELECT reset_epoch AS resetEpoch, display_active AS displayActive
       FROM v2_raffle_state WHERE id = 1`,
    ).get() as { resetEpoch: number; displayActive: number } | undefined
    if (
      !raffleState ||
      raffleState.resetEpoch !== currentEpoch ||
      Boolean(raffleState.displayActive) !== (runtime.presentationType === 'CAPSULE_INSERT')
    ) {
      issues.push('The v2 raffle state does not match the active runtime presentation')
    }
    const raffleDrawMismatchCount = Number(database.prepare(
      `SELECT count(*) FROM v2_raffle_draws draw
       LEFT JOIN v2_participant_states participant
         ON participant.reset_epoch = draw.reset_epoch
        AND participant.identity_id = draw.identity_id
       WHERE draw.reset_epoch != ?
          OR participant.onboarding_state != 'ADMITTED'
          OR draw.draw_sequence > (
            SELECT count(*) FROM v2_raffle_draws current_draw
            WHERE current_draw.reset_epoch = draw.reset_epoch
          )`,
    ).pluck().get(currentEpoch))
    if (raffleDrawMismatchCount !== 0) {
      issues.push('The v2 raffle contains an invalid epoch, participant or draw sequence')
    }

    const slotCount = countTableRows(database, 'v2_identity_slots')
    if (slotCount !== seed.participantCount) {
      issues.push('The deterministic v2 formation-slot directory is incomplete')
    }
    const slotMismatchCount = Number(
      database
        .prepare(
          `SELECT count(*)
           FROM v2_identity_slots slot
           LEFT JOIN synthetic_identities identity
             ON identity.id = slot.identity_id
           WHERE identity.id IS NULL
              OR slot.seed_index != identity.seed_index
              OR slot.public_star_id != identity.public_star_id
              OR slot.formation_slot != 'slot:' || identity.visual_seed
              OR (slot.reserved_reset_epoch IS NOT NULL
                  AND slot.reserved_reset_epoch != ?)`,
        )
        .pluck()
        .get(currentEpoch),
    )
    if (slotMismatchCount !== 0) {
      issues.push('The deterministic v2 slot directory does not match the seed')
    }
    const orphanReservationCount = Number(
      database
        .prepare(
          `SELECT count(*)
           FROM v2_identity_slots slot
           LEFT JOIN v2_participant_states participant
             ON participant.identity_id = slot.identity_id
            AND participant.reset_epoch = slot.reserved_reset_epoch
           WHERE slot.reserved_reset_epoch IS NOT NULL
             AND participant.identity_id IS NULL`,
        )
        .pluck()
        .get(),
    )
    if (orphanReservationCount !== 0) {
      issues.push('A reserved v2 formation slot has no current participant')
    }

    const v1MutableFacts = nonzeroCounts(
      tableCounts(database, V1_MUTABLE_TABLES),
    )
    if (v1MutableFacts) {
      issues.push(
        `Protocol v1 mutable state remains after v2 cutover: ${v1MutableFacts}`,
      )
    }

    for (const tableName of [
      'v2_participant_states',
      'v2_reward_ledger',
      'v2_public_stars',
      'v2_capsules',
      'v2_sessions',
      'v2_idempotency_records',
      'v2_stream_cursors',
      'v2_domain_events',
      'v2_control_receipts',
      'v2_gift_transactions',
      'v2_barrages',
      'v2_final_recap_capsules',
      'v2_raffle_draws',
    ]) {
      const wrongEpoch = Number(
        database
          .prepare(
            `SELECT count(*) FROM ${tableName} WHERE reset_epoch != ?`,
          )
          .pluck()
          .get(currentEpoch),
      )
      if (wrongEpoch !== 0) {
        issues.push(`${tableName} contains rows from another reset epoch`)
      }
    }

    const participantMismatchCount = Number(
      database
        .prepare(
          `SELECT count(*)
           FROM v2_participant_states participant
           LEFT JOIN v2_identity_slots slot
             ON slot.identity_id = participant.identity_id
           LEFT JOIN v2_public_stars star
             ON star.identity_id = participant.identity_id
                AND star.reset_epoch = participant.reset_epoch
           LEFT JOIN v2_capsules capsule
             ON capsule.identity_id = participant.identity_id
                AND capsule.reset_epoch = participant.reset_epoch
           WHERE slot.identity_id IS NULL
              OR slot.reserved_reset_epoch != participant.reset_epoch
              OR slot.reserved_at IS NULL
              OR (
                participant.onboarding_state = 'NEEDS_COLOR'
                AND (star.identity_id IS NOT NULL OR capsule.identity_id IS NOT NULL)
              )
              OR (
                participant.onboarding_state != 'NEEDS_COLOR'
                AND (
                  star.identity_id IS NULL
                  OR star.public_star_id != slot.public_star_id
                  OR star.formation_slot != slot.formation_slot
                  OR star.color_temperature_kelvin
                     != participant.color_temperature_kelvin
                  OR star.display_color != participant.display_color
                )
              )
              OR (
                participant.capsule_decision = 'SUBMITTED'
                AND capsule.identity_id IS NULL
              )
              OR (
                participant.capsule_decision != 'SUBMITTED'
                AND capsule.identity_id IS NOT NULL
              )
              OR (
                (participant.started_at IS NULL AND COALESCE(star.started, 0) != 0)
                OR
                (participant.started_at IS NOT NULL AND COALESCE(star.started, 0) != 1)
              )`,
        )
        .pluck()
        .get(),
    )
    if (participantMismatchCount !== 0) {
      issues.push('Participant, slot, public star or capsule facts disagree')
    }

    const rewardMismatchCount = Number(
      database
        .prepare(
          `SELECT count(*)
           FROM v2_participant_states participant
           WHERE (
             SELECT count(*)
             FROM v2_reward_ledger reward
             WHERE reward.reset_epoch = participant.reset_epoch
               AND reward.identity_id = participant.identity_id
               AND reward.event_key = 'ACTIVATED'
           ) != 1
           OR participant.starlight != (
             SELECT COALESCE(sum(reward.delta), 0)
             FROM v2_reward_ledger reward
             WHERE reward.reset_epoch = participant.reset_epoch
               AND reward.identity_id = participant.identity_id
           )
           OR EXISTS (
             SELECT 1
             FROM v2_reward_ledger reward
             CROSS JOIN v2_runtime_state current
             WHERE reward.reset_epoch = participant.reset_epoch
                AND reward.identity_id = participant.identity_id
                AND reward.reward_rule_version != current.reward_rule_version
           )
           OR EXISTS (
             SELECT 1
             FROM v2_reward_ledger reward
             WHERE reward.reset_epoch = participant.reset_epoch
               AND reward.identity_id = participant.identity_id
               AND reward.delta != CASE reward.event_key
                 WHEN 'ACTIVATED' THEN 20
                 WHEN 'CAPSULE_SUBMITTED' THEN 20
                 WHEN 'STAR_STARTED' THEN 40
                 WHEN 'FIRST_GIFT' THEN 10
                 WHEN 'FIRST_BARRAGE' THEN 10
                 WHEN 'COOPERATIVE_LIGHT' THEN 20
               END
           )
           OR (
             SELECT count(*)
             FROM v2_reward_ledger reward
             WHERE reward.reset_epoch = participant.reset_epoch
               AND reward.identity_id = participant.identity_id
               AND reward.event_key = 'CAPSULE_SUBMITTED'
           ) != CASE WHEN participant.capsule_decision = 'SUBMITTED' THEN 1 ELSE 0 END
           OR (
             SELECT count(*)
             FROM v2_reward_ledger reward
             WHERE reward.reset_epoch = participant.reset_epoch
               AND reward.identity_id = participant.identity_id
               AND reward.event_key = 'STAR_STARTED'
           ) != CASE WHEN participant.started_at IS NOT NULL THEN 1 ELSE 0 END
           OR (
             SELECT count(*)
             FROM v2_reward_ledger reward
             WHERE reward.reset_epoch = participant.reset_epoch
               AND reward.identity_id = participant.identity_id
               AND reward.event_key = 'FIRST_GIFT'
           ) != CASE WHEN participant.first_gift_at IS NOT NULL THEN 1 ELSE 0 END
           OR (
             SELECT count(*)
             FROM v2_reward_ledger reward
             WHERE reward.reset_epoch = participant.reset_epoch
               AND reward.identity_id = participant.identity_id
               AND reward.event_key = 'FIRST_BARRAGE'
           ) != CASE WHEN participant.first_barrage_at IS NOT NULL THEN 1 ELSE 0 END
           OR (
             SELECT count(*)
             FROM v2_reward_ledger reward
             WHERE reward.reset_epoch = participant.reset_epoch
               AND reward.identity_id = participant.identity_id
               AND reward.event_key = 'COOPERATIVE_LIGHT'
           ) != CASE WHEN participant.cooperative_light_at IS NOT NULL THEN 1 ELSE 0 END`,
        )
        .pluck()
        .get(),
    )
    if (rewardMismatchCount !== 0) {
      issues.push('Participant rewards do not match starlight or rule version')
    }

    const cursorMismatchCount = Number(
      database
        .prepare(
          `SELECT count(*)
           FROM v2_stream_cursors cursor
           WHERE cursor.stream_seq != (
             SELECT COALESCE(max(event.stream_seq), 0)
             FROM v2_domain_events event
             WHERE event.reset_epoch = cursor.reset_epoch
               AND event.stream_id = cursor.stream_id
           )
           OR cursor.stream_seq != (
             SELECT count(*)
             FROM v2_domain_events event
             WHERE event.reset_epoch = cursor.reset_epoch
               AND event.stream_id = cursor.stream_id
           )`,
        )
        .pluck()
        .get(),
    )
    const publicCursor = database
      .prepare(
        `SELECT stream_seq AS streamSeq
         FROM v2_stream_cursors
         WHERE reset_epoch = ? AND stream_id = 'public'`,
      )
      .get(currentEpoch) as { streamSeq: number } | undefined
    const adminCursor = database
      .prepare(
        `SELECT stream_seq AS streamSeq
         FROM v2_stream_cursors
         WHERE reset_epoch = ? AND stream_id = 'admin'`,
      )
      .get(currentEpoch) as { streamSeq: number } | undefined
    const runtimeCursor = database
      .prepare(
        `SELECT public_seq AS publicSeq, admin_seq AS adminSeq
         FROM v2_runtime_state WHERE id = 1`,
      )
      .get() as { publicSeq: number; adminSeq: number }
    const participantCursorCounts = database
        .prepare(
          `SELECT count(*)
           FROM v2_participant_states participant
           LEFT JOIN v2_stream_cursors cursor
             ON cursor.reset_epoch = participant.reset_epoch
            AND cursor.stream_id = 'participant:' || participant.identity_id
           WHERE cursor.stream_id IS NULL
           UNION ALL
           SELECT count(*)
           FROM v2_stream_cursors cursor
           LEFT JOIN v2_participant_states participant
             ON participant.reset_epoch = cursor.reset_epoch
            AND cursor.stream_id = 'participant:' || participant.identity_id
           WHERE cursor.stream_id LIKE 'participant:%'
             AND participant.identity_id IS NULL`,
        )
        .pluck()
        .all() as number[]
    const participantCursorMismatchCount = participantCursorCounts.reduce(
      (sum, count) => sum + Number(count),
      0,
    )
    if (
      cursorMismatchCount !== 0 ||
      participantCursorMismatchCount !== 0 ||
      !publicCursor ||
      !adminCursor ||
      runtimeCursor.publicSeq !== publicCursor.streamSeq ||
      runtimeCursor.adminSeq !== adminCursor.streamSeq
    ) {
      issues.push('V2 stream cursors do not match persisted event sequences')
    }

    const projectionRevisions = database
      .prepare(
        `SELECT
           COALESCE((
             SELECT revision FROM v2_domain_events
             WHERE reset_epoch = ? AND stream_id = 'public'
               AND event_name = 'runtime.changed'
             ORDER BY stream_seq DESC LIMIT 1
           ), 0) AS runRevision,
           COALESCE((
             SELECT revision FROM v2_domain_events
             WHERE reset_epoch = ? AND stream_id = 'public'
               AND event_name = 'presentation.changed'
             ORDER BY stream_seq DESC LIMIT 1
           ), 0) AS presentationRevision,
           COALESCE((
             SELECT revision FROM v2_domain_events
             WHERE reset_epoch = ? AND stream_id = 'public'
               AND event_name = 'aggregate.changed'
             ORDER BY stream_seq DESC LIMIT 1
           ), 0) AS publicAggregateRevision,
           COALESCE((
             SELECT revision FROM v2_domain_events
             WHERE reset_epoch = ? AND stream_id = 'admin'
               AND event_name = 'aggregate.changed'
             ORDER BY stream_seq DESC LIMIT 1
           ), 0) AS adminAggregateRevision`,
      )
      .get(currentEpoch, currentEpoch, currentEpoch, currentEpoch) as {
        runRevision: number
        presentationRevision: number
        publicAggregateRevision: number
        adminAggregateRevision: number
      }
    const interactionProjection = database
      .prepare(
        `SELECT state.interaction_revision AS interactionRevision,
                COALESCE((
                  SELECT revision FROM v2_domain_events
                  WHERE reset_epoch = ? AND stream_id = 'public'
                    AND event_name IN (
                      'barrage.published', 'barrage.removed', 'barrage.cleared',
                      'barrage.pause.changed', 'gift.sent', 'program.changed'
                    )
                  ORDER BY stream_seq DESC LIMIT 1
                ), 0) AS eventRevision
         FROM v2_screen_interaction_state state
         WHERE state.reset_epoch = ?`,
      )
      .get(currentEpoch, currentEpoch) as
      | { interactionRevision: number; eventRevision: number }
      | undefined
    const participantRevisionMismatchCount = Number(
      database
        .prepare(
          `SELECT count(*)
           FROM v2_participant_states participant
           WHERE participant.participant_revision != COALESCE((
             SELECT event.revision
             FROM v2_domain_events event
             WHERE event.reset_epoch = participant.reset_epoch
               AND event.stream_id = 'participant:' || participant.identity_id
               AND event.event_name = 'participant.snapshot.changed'
             ORDER BY event.stream_seq DESC LIMIT 1
           ), -1)`,
        )
        .pluck()
        .get(),
    )
    const starRevisionMismatchCount = Number(
      database
        .prepare(
          `SELECT count(*)
           FROM v2_public_stars star
           WHERE star.star_revision != COALESCE((
             SELECT event.revision
             FROM v2_domain_events event
             WHERE event.reset_epoch = star.reset_epoch
               AND event.stream_id = 'public'
               AND event.event_name = 'star.node.upserted'
               AND json_extract(event.payload_json, '$.star.publicStarId')
                   = star.public_star_id
             ORDER BY event.stream_seq DESC LIMIT 1
           ), -1)`,
        )
        .pluck()
        .get(),
    )
    const nonIncreasingProjectionRevisionCount = Number(
      database
        .prepare(
          `SELECT count(*)
           FROM v2_domain_events current
           WHERE EXISTS (
             SELECT 1
             FROM v2_domain_events previous
             WHERE previous.reset_epoch = current.reset_epoch
               AND previous.stream_id = current.stream_id
               AND previous.stream_seq < current.stream_seq
               AND previous.event_name = current.event_name
               AND (
                 current.event_name != 'star.node.upserted'
                 OR json_extract(previous.payload_json, '$.star.publicStarId')
                    = json_extract(current.payload_json, '$.star.publicStarId')
               )
               AND previous.revision >= current.revision
           )`,
        )
        .pluck()
        .get(),
    )
    const nonIncreasingInteractionRevisionCount = Number(
      database
        .prepare(
          `SELECT count(*)
           FROM v2_domain_events current
           WHERE current.reset_epoch = ? AND current.stream_id = 'public'
             AND current.event_name IN (
               'barrage.published', 'barrage.removed', 'barrage.cleared',
               'barrage.pause.changed', 'gift.sent', 'program.changed'
             )
             AND EXISTS (
               SELECT 1 FROM v2_domain_events previous
               WHERE previous.reset_epoch = current.reset_epoch
                 AND previous.stream_id = 'public'
                 AND previous.stream_seq < current.stream_seq
                 AND previous.event_name IN (
                   'barrage.published', 'barrage.removed', 'barrage.cleared',
                   'barrage.pause.changed', 'gift.sent', 'program.changed'
                 )
                 AND previous.revision >= current.revision
             )`,
        )
        .pluck()
        .get(currentEpoch),
    )
    if (
      runtime.runRevision !== projectionRevisions.runRevision ||
      runtime.presentationRevision !== projectionRevisions.presentationRevision ||
      runtime.publicAggregateRevision !==
        projectionRevisions.publicAggregateRevision ||
      runtime.adminAggregateRevision !== projectionRevisions.adminAggregateRevision ||
      !interactionProjection ||
      interactionProjection.interactionRevision !== interactionProjection.eventRevision ||
      participantRevisionMismatchCount !== 0 ||
      starRevisionMismatchCount !== 0 ||
      nonIncreasingProjectionRevisionCount !== 0 ||
      nonIncreasingInteractionRevisionCount !== 0
    ) {
      issues.push('V2 projection revisions do not match latest typed events')
    }

    const storedEvents = database
      .prepare(
        `SELECT reset_epoch AS resetEpoch, stream_id AS streamId,
                stream_seq AS streamSeq, event_id AS eventId,
                event_name AS name, revision, payload_json AS payloadJson
         FROM v2_domain_events
         ORDER BY reset_epoch, stream_id, stream_seq`,
      )
      .all() as Array<{
        resetEpoch: number
        streamId: string
        streamSeq: number
        eventId: string
        name: string
        revision: number
        payloadJson: string
      }>
    for (const event of storedEvents) {
      let payload: unknown
      try {
        payload = JSON.parse(event.payloadJson)
      } catch {
        issues.push('A persisted v2 event has invalid JSON')
        continue
      }
      if (
        !V2RealtimeEventEnvelopeSchema.safeParse({
          protocolVersion: '2',
          resetEpoch: event.resetEpoch,
          streamId: event.streamId,
          streamSeq: event.streamSeq,
          eventId: event.eventId,
          name: event.name,
          revision: event.revision,
          payload,
        }).success
      ) {
        issues.push('A persisted v2 event violates the shared event contract')
      }
    }
    issues.push(...sqliteIntegrityIssues(database))
  } catch (error) {
    issues.push(
      `Protocol v2 authoritative state is unavailable: ${
        error instanceof Error ? error.message : 'unknown verification failure'
      }`,
    )
  }

  return {
    ready: issues.length === 0,
    schemaVersion: migrations.currentVersion,
    protocolVersion: protocol?.activeProtocolVersion ?? null,
    resetEpoch,
    participantCount: seed.participantCount,
    issues: [...new Set(issues)],
  }
}
