import { ScreenSnapshotSchema, type ScreenSnapshot } from '@sysu-welcome/contracts'

import type { SqliteDatabase } from '../db/open-database.js'
import { readAggregateState } from './business-state.js'

interface StateRow {
  resetEpoch: number
  eventSeq: number
  mode: 'REHEARSAL' | 'LIVE'
  status: 'READY' | 'RUNNING' | 'PAUSED' | 'COMPLETED'
  stage: number
  stageRevision: number
  displayBatch: number
  barragePaused: number
  updatedAt: string
  currentProgramId: string | null
}

interface ProgramRow {
  id: string
  title: string
  sortOrder: number
  heat: number
}

export function readScreenSnapshot(
  database: SqliteDatabase,
  now: () => Date = () => new Date(),
): ScreenSnapshot {
  const state = database
    .prepare(
      `SELECT a.reset_epoch AS resetEpoch,
              a.event_seq AS eventSeq,
              r.mode,
              r.status,
              r.stage,
              r.stage_revision AS stageRevision,
              r.display_batch AS displayBatch,
              r.barrage_paused AS barragePaused,
              p.current_program_id AS currentProgramId,
              r.updated_at AS updatedAt
       FROM app_state a
       CROSS JOIN runtime_state r
       CROSS JOIN program_runtime_state p
       WHERE a.id = 1 AND r.id = 1 AND p.id = 1`,
    )
    .get() as StateRow | undefined

  if (!state) {
    throw new Error('Runtime foundation is unavailable')
  }

  const programs = database
    .prepare(
      `SELECT id, title, sort_order AS sortOrder, heat
       FROM program_catalog
       WHERE enabled = 1
       ORDER BY sort_order`,
    )
    .all() as ProgramRow[]

  const aggregates = readAggregateState(database)
  const starNodes = database
    .prepare(
      `SELECT i.public_star_id AS id, i.visual_seed AS visualSeed,
              p.star_temperature_kelvin AS starTemperatureKelvin,
              CASE WHEN p.star_started_at IS NULL THEN 0 ELSE 1 END AS started
       FROM participant_states p
       JOIN synthetic_identities i ON i.id = p.identity_id
       ORDER BY i.seed_index`,
    )
    .all() as Array<{
      id: string
      visualSeed: string
      starTemperatureKelvin: number | null
      started: number
    }>
  const publishedBarrages = database
    .prepare(
      `SELECT id, text, display_seq AS displaySeq,
              published_at AS publishedAt
       FROM barrages
       WHERE status = 'PUBLISHED' AND display_batch = ?
       ORDER BY display_seq DESC LIMIT 30`,
    )
    .all(state.displayBatch)

  return ScreenSnapshotSchema.parse({
    protocolVersion: '1',
    generatedAt: now().toISOString(),
    eventSeq: state.eventSeq,
    runtime: {
      resetEpoch: state.resetEpoch,
      stageRevision: state.stageRevision,
      mode: state.mode,
      status: state.status,
      stage: state.stage,
      barragePaused: state.barragePaused === 1,
      updatedAt: state.updatedAt,
      currentProgramId: state.currentProgramId,
    },
    displayBatch: state.displayBatch,
    programs: programs.map((program) => ({
      id: program.id,
      title: program.title,
      order: program.sortOrder,
      heat: program.heat,
    })),
    aggregates,
    starNodes: starNodes.map((node) => ({
      id: node.id,
      visualSeed: node.visualSeed,
      starTemperatureKelvin: node.starTemperatureKelvin,
      started: node.started === 1,
    })),
    publishedBarrages: publishedBarrages.reverse(),
  })
}
