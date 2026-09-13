import { readV2Stage, readV2AwardSummaries, readV2Awards } from './v2-ceremony.js'
import { readCurrentV2Program, readV2ProgramSchedule, readProgramCatalogInfo } from './v2-program-catalog.js'
import {
  V2AdminSnapshotSchema,
  V2ScreenSnapshotSchema,
  type V2AdminSnapshot,
  type V2ScreenSnapshot,
} from '@sysu-welcome/contracts'

import type { SqliteDatabase } from '../db/open-database.js'
import { readV2ParticipantSnapshot as readParticipantSnapshot } from './v2-participant-onboarding.js'
import { readV2ClosingRecap } from './v2-closing-recap.js'
import { readV2LiveInteraction } from './v2-live-interactions.js'

interface RuntimeRow {
  resetEpoch: number
  mode: 'REHEARSAL' | 'LIVE'
  status: 'READY' | 'RUNNING' | 'PAUSED' | 'COMPLETED'
  currentScene: 'ASSEMBLY' | 'PROGRAM_SUPPORT' | 'COOPERATIVE_LIGHT' | null
  runRevision: number
  presentationType: 'NONE' | 'CAPSULE_INSERT' | 'RAFFLE' | 'FINALE_PREVIEW'
  presentationRevision: number
  publicAggregateRevision: number
  adminAggregateRevision: number
  rewardRuleVersion: string
  publicSeq: number
  adminSeq: number
}

function runtime(database: SqliteDatabase): RuntimeRow {
  return database.prepare(
    `SELECT reset_epoch AS resetEpoch, mode, status, current_scene AS currentScene,
            run_revision AS runRevision,
            CASE WHEN presentation_type = 'CAPSULE_INSERT' THEN 'RAFFLE'
                 ELSE presentation_type END AS presentationType,
            presentation_revision AS presentationRevision,
            public_aggregate_revision AS publicAggregateRevision,
            admin_aggregate_revision AS adminAggregateRevision,
            reward_rule_version AS rewardRuleVersion,
            public_seq AS publicSeq, admin_seq AS adminSeq
     FROM v2_runtime_state WHERE id = 1`,
  ).get() as RuntimeRow
}

function runtimeTuple(row: RuntimeRow) {
  return { mode: row.mode, status: row.status, currentScene: row.currentScene, runRevision: row.runRevision }
}

function stars(database: SqliteDatabase, epoch: number) {
  return (database.prepare(
    `SELECT public_star_id AS publicStarId,
            color_temperature_kelvin AS colorTemperatureKelvin,
            display_color AS displayColor, formation_slot AS formationSlot,
            started, star_revision AS starRevision, updated_at AS updatedAt
     FROM v2_public_stars WHERE reset_epoch = ? ORDER BY formation_slot`,
  ).all(epoch) as Array<Record<string, unknown> & { started: number }>).map(
    (star) => ({ ...star, started: star.started === 1 }),
  )
}

function capsuleRows(database: SqliteDatabase, row: RuntimeRow, recap = false) {
  if (recap) {
    return database.prepare(
      `SELECT capsule_id AS capsuleId, public_star_id AS publicStarId,
              color_temperature_kelvin AS colorTemperatureKelvin,
              display_color AS displayColor, text
       FROM v2_final_recap_capsules WHERE reset_epoch = ? ORDER BY position`,
    ).all(row.resetEpoch)
  }
  return database.prepare(
    `SELECT capsule.capsule_id AS capsuleId, star.public_star_id AS publicStarId,
            star.color_temperature_kelvin AS colorTemperatureKelvin,
            star.display_color AS displayColor, capsule.text
     FROM v2_capsules capsule JOIN v2_public_stars star
       ON star.reset_epoch = capsule.reset_epoch AND star.identity_id = capsule.identity_id
     WHERE capsule.reset_epoch = ? AND capsule.moderation_status = 'DISPLAYED'
     ORDER BY capsule.submitted_at LIMIT 6`,
  ).all(row.resetEpoch)
}

function presentation(database: SqliteDatabase, row: RuntimeRow) {
  if (row.presentationType === 'NONE') return { type: 'NONE' as const }
  if (row.presentationType === 'RAFFLE') return { type: 'RAFFLE' as const }
  if (row.presentationType === 'FINALE_PREVIEW') return { type: 'FINALE_PREVIEW' as const, rehearsal: true as const }
  return { type: 'CAPSULE_INSERT' as const, capsules: capsuleRows(database, row) }
}

function raffleState(database: SqliteDatabase, epoch: number, includeNames: boolean) {
  const state = database.prepare(
    `SELECT display_active AS displayActive, raffle_revision AS raffleRevision
     FROM v2_raffle_state WHERE reset_epoch = ?`,
  ).get(epoch) as { displayActive: number; raffleRevision: number }
  const nameColumn = includeNames ? ', identity.display_name AS displayName' : ''
  const winners = database.prepare(
    `SELECT draw.id AS raffleDrawId, draw.draw_sequence AS drawSequence,
            slot.public_star_id AS publicStarId,
            star.display_color AS displayColor, draw.drawn_at AS drawnAt${nameColumn}
     FROM v2_raffle_draws draw
     JOIN v2_identity_slots slot ON slot.reserved_reset_epoch = draw.reset_epoch
       AND slot.identity_id = draw.identity_id
     LEFT JOIN v2_public_stars star ON star.reset_epoch = draw.reset_epoch
       AND star.identity_id = draw.identity_id
     ${includeNames ? 'JOIN synthetic_identities identity ON identity.id = draw.identity_id' : ''}
     WHERE draw.reset_epoch = ? ORDER BY draw.draw_sequence DESC`,
  ).all(epoch)
  const eligibleCount = Number(database.prepare(
    `SELECT count(*) FROM v2_participant_states
     WHERE reset_epoch = ? AND onboarding_state = 'ADMITTED'`,
  ).pluck().get(epoch))
  return {
    displayActive: state.displayActive === 1,
    raffleRevision: state.raffleRevision,
    eligibleCount,
    remainingCount: Math.max(0, eligibleCount - winners.length),
    winners,
  }
}

function aggregate(database: SqliteDatabase, epoch: number) {
  return database.prepare(
    `SELECT
       (SELECT count(*) FROM v2_participant_states WHERE reset_epoch = ?) AS activatedCount,
       (SELECT count(*) FROM v2_public_stars WHERE reset_epoch = ?) AS publicStarCount,
       (SELECT count(*) FROM v2_participant_states WHERE reset_epoch = ? AND onboarding_state = 'ADMITTED') AS admittedCount,
       (SELECT count(*) FROM v2_public_stars WHERE reset_epoch = ? AND started = 1) AS starStartedCount,
       (SELECT count(*) FROM v2_participant_states WHERE reset_epoch = ? AND cooperative_light_at IS NOT NULL) AS cooperativeLightCount,
       (SELECT COALESCE(sum(starlight), 0) FROM v2_participant_states WHERE reset_epoch = ?) AS totalStarlight`,
  ).get(epoch, epoch, epoch, epoch, epoch, epoch)
}

function funnel(database: SqliteDatabase, epoch: number, now: Date) {
  const row = database.prepare(
    `SELECT count(*) AS activatedCount,
       sum(CASE WHEN color_locked_at IS NOT NULL THEN 1 ELSE 0 END) AS publicStarCount,
       sum(CASE WHEN onboarding_state = 'ADMITTED' THEN 1 ELSE 0 END) AS admittedCount,
       sum(CASE WHEN onboarding_state != 'ADMITTED' THEN 1 ELSE 0 END) AS onboardingPendingCount,
       sum(CASE WHEN capsule_decision = 'SUBMITTED' THEN 1 ELSE 0 END) AS capsuleSubmittedCount,
       sum(CASE WHEN capsule_decision = 'SKIPPED' THEN 1 ELSE 0 END) AS capsuleSkippedCount,
       sum(CASE WHEN started_at IS NOT NULL THEN 1 ELSE 0 END) AS starStartedCount,
       sum(CASE WHEN cooperative_light_at IS NOT NULL THEN 1 ELSE 0 END) AS cooperativeLightCount
     FROM v2_participant_states WHERE reset_epoch = ?`,
  ).get(epoch) as Record<string, number | null>
  return {
    activatedCount: Number(row.activatedCount ?? 0), publicStarCount: Number(row.publicStarCount ?? 0),
    admittedCount: Number(row.admittedCount ?? 0), onboardingPendingCount: Number(row.onboardingPendingCount ?? 0),
    capsuleSubmittedCount: Number(row.capsuleSubmittedCount ?? 0), capsuleSkippedCount: Number(row.capsuleSkippedCount ?? 0),
    starStartedCount: Number(row.starStartedCount ?? 0), cooperativeLightCount: Number(row.cooperativeLightCount ?? 0),
    onlineParticipantSessions: Number(database.prepare(
      `SELECT count(DISTINCT subject_id) FROM v2_sessions WHERE reset_epoch = ?
         AND session_type = 'PARTICIPANT' AND revoked_at IS NULL AND expires_at > ?`,
    ).pluck().get(epoch, now.toISOString())),
  }
}




function interaction(database: SqliteDatabase, epoch: number) {
  const row = database.prepare(
    `SELECT interaction_revision AS interactionRevision,
            barrage_paused AS barragePaused, display_batch AS displayBatch
     FROM v2_screen_interaction_state WHERE reset_epoch = ?`,
  ).get(epoch) as { interactionRevision: number; barragePaused: number; displayBatch: number }
  return { ...row, barragePaused: row.barragePaused === 1 }
}

function publishedBarrages(database: SqliteDatabase, epoch: number, includeSource: boolean) {
  const source = includeSource ? ', publication.source_id AS sourceId' : ''
  return database.prepare(
    `SELECT barrage.id AS barrageId, barrage.text,
            CASE WHEN barrage.custom_color IS NOT NULL THEN 'personal' ELSE barrage.color_style END AS colorStyle,
            barrage.custom_color AS customColor,
            star.public_star_id AS publicStarId,
            publication.display_seq AS displaySeq,
            publication.published_at AS publishedAt${source}
     FROM v2_barrage_publications publication
     JOIN v2_barrages barrage ON barrage.id = publication.barrage_id
     JOIN v2_public_stars star ON star.identity_id = barrage.identity_id AND star.reset_epoch = barrage.reset_epoch
     JOIN v2_screen_interaction_state state ON state.reset_epoch = publication.reset_epoch
     WHERE publication.reset_epoch = ? AND publication.status = 'PUBLISHED'
       AND publication.display_batch = state.display_batch
     ORDER BY publication.display_seq DESC LIMIT 8`,
  ).all(epoch).reverse()
}

function capsuleCandidates(database: SqliteDatabase, epoch: number) {
  return database.prepare(
    `SELECT capsule.capsule_id AS capsuleId,
            star.public_star_id AS publicStarId,
            star.color_temperature_kelvin AS colorTemperatureKelvin,
            star.display_color AS displayColor,
            capsule.text, capsule.moderation_status AS moderationStatus,
            participant.participant_revision AS participantRevision,
            capsule.submitted_at AS submittedAt, capsule.updated_at AS updatedAt
     FROM v2_capsules capsule
     JOIN v2_public_stars star ON star.reset_epoch = capsule.reset_epoch
       AND star.identity_id = capsule.identity_id
     JOIN v2_participant_states participant ON participant.reset_epoch = capsule.reset_epoch
       AND participant.identity_id = capsule.identity_id
     WHERE capsule.reset_epoch = ?
     ORDER BY CASE capsule.moderation_status
       WHEN 'DISPLAYED' THEN 0 WHEN 'SELECTED' THEN 1
       WHEN 'SUBMITTED' THEN 2 ELSE 3 END,
       capsule.updated_at DESC`,
  ).all(epoch)
}

function adminWarnings(
  database: SqliteDatabase,
  row: RuntimeRow,
  adminFunnel: ReturnType<typeof funnel>,
) {
  if (row.status !== 'RUNNING') return []
  const warnings: Array<'ONBOARDING_PENDING' | 'STAR_START_PENDING' | 'COOPERATIVE_LIGHT_PENDING'> = []
  if (adminFunnel.onboardingPendingCount > 0) warnings.push('ONBOARDING_PENDING')
  if (row.currentScene === 'ASSEMBLY') {
    const pending = Number(database.prepare(
      `SELECT count(*) FROM v2_participant_states
       WHERE reset_epoch = ? AND onboarding_state = 'ADMITTED'
         AND (admitted_scene IS NULL OR admitted_scene = 'ASSEMBLY')
         AND started_at IS NULL`,
    ).pluck().get(row.resetEpoch))
    if (pending > 0) warnings.push('STAR_START_PENDING')
  }
  if (row.currentScene === 'COOPERATIVE_LIGHT') {
    const pending = Number(database.prepare(
      `SELECT count(*) FROM v2_participant_states
       WHERE reset_epoch = ? AND onboarding_state = 'ADMITTED'
         AND cooperative_light_at IS NULL`,
    ).pluck().get(row.resetEpoch))
    if (pending > 0) warnings.push('COOPERATIVE_LIGHT_PENDING')
  }
  return warnings
}

function consistentRead<T>(database: SqliteDatabase, read: () => T): T {
  if (database.inTransaction) return read()
  database.exec('BEGIN')
  try {
    const value = read()
    database.exec('COMMIT')
    return value
  } catch (error) {
    if (database.inTransaction) database.exec('ROLLBACK')
    throw error
  }
}

function readScreen(database: SqliteDatabase, now: Date): V2ScreenSnapshot {
  const row = runtime(database)
  return V2ScreenSnapshotSchema.parse({
    status: 'ok', protocolVersion: '2', resetEpoch: row.resetEpoch,
    generatedAt: now.toISOString(), runtime: runtimeTuple(row),
    presentation: presentation(database, row), presentationRevision: row.presentationRevision,
    rewardRuleVersion: row.rewardRuleVersion, publicSeq: row.publicSeq,
    publicStars: stars(database, row.resetEpoch), aggregateRevision: row.publicAggregateRevision,
    aggregate: aggregate(database, row.resetEpoch), currentProgram: readCurrentV2Program(database),
    programs: readV2ProgramSchedule(database),
    stage: readV2Stage(database),
    awards: readV2AwardSummaries(database),
    interaction: interaction(database, row.resetEpoch),
    publishedBarrages: publishedBarrages(database, row.resetEpoch, false),
    raffle: raffleState(database, row.resetEpoch, false),
    liveInteraction: readV2LiveInteraction(database, row.resetEpoch),
    finalRecap: capsuleRows(database, row, true),
    closingRecap: readV2ClosingRecap(database, row.resetEpoch,
      row.status === 'COMPLETED' || row.presentationType === 'FINALE_PREVIEW'),
  })
}

export function readV2ScreenSnapshot(database: SqliteDatabase, now = new Date()): V2ScreenSnapshot {
  return consistentRead(database, () => readScreen(database, now))
}

function readAdminSnapshot(
  database: SqliteDatabase,
  roles: Array<'STAGE_CONTROLLER' | 'REVIEWER' | 'DEMO_ADMIN' | 'ALL'>,
  now = new Date(),
): V2AdminSnapshot {
  const row = runtime(database)
  const adminFunnel = funnel(database, row.resetEpoch, now)
  const lastReceipt = database.prepare(
    `SELECT command, result, before_run_revision AS beforeRunRevision,
            after_run_revision AS afterRunRevision,
            before_presentation_revision AS beforePresentationRevision,
            after_presentation_revision AS afterPresentationRevision,
            created_at AS at
     FROM v2_control_receipts WHERE reset_epoch = ? ORDER BY id DESC LIMIT 1`,
  ).get(row.resetEpoch) ?? null
  const warnings = adminWarnings(database, row, adminFunnel)
  const candidateRows = roles.includes('ALL') || roles.includes('REVIEWER')
    ? capsuleCandidates(database, row.resetEpoch)
    : []
  return V2AdminSnapshotSchema.parse({
    status: 'ok', protocolVersion: '2', resetEpoch: row.resetEpoch,
    generatedAt: now.toISOString(), runtime: runtimeTuple(row),
    presentation: presentation(database, row), presentationRevision: row.presentationRevision,
    rewardRuleVersion: row.rewardRuleVersion, publicSeq: row.publicSeq, adminSeq: row.adminSeq,
    roles, aggregateRevision: row.adminAggregateRevision, funnel: adminFunnel,
    readinessWarnings: warnings, interaction: interaction(database, row.resetEpoch),
    publishedBarrages: publishedBarrages(database, row.resetEpoch, true),
    raffle: raffleState(database, row.resetEpoch, true),
    liveInteraction: readV2LiveInteraction(database, row.resetEpoch, { showHiddenResults: true }),
    capsuleCandidates: candidateRows,
    lastControlReceipt: lastReceipt,
    currentProgram: readCurrentV2Program(database), programs: readV2ProgramSchedule(database),
    stage: readV2Stage(database),
    awards: readV2Awards(database),
    programCatalog: readProgramCatalogInfo(database),
    finalRecap: capsuleRows(database, row, true),
    closingRecap: readV2ClosingRecap(database, row.resetEpoch,
      row.status === 'COMPLETED' || row.presentationType === 'FINALE_PREVIEW'),
  })
}

export function readV2AdminSnapshot(
  database: SqliteDatabase,
  roles: Array<'STAGE_CONTROLLER' | 'REVIEWER' | 'DEMO_ADMIN' | 'ALL'>,
  now = new Date(),
): V2AdminSnapshot {
  return consistentRead(database, () => readAdminSnapshot(database, roles, now))
}

export function readV2ParticipantSnapshot(
  database: SqliteDatabase,
  participantId: string,
  now = new Date(),
) {
  return consistentRead(database, () => readParticipantSnapshot(database, participantId, now))
}
