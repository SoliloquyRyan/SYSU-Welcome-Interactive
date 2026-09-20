import type { SqliteDatabase } from '../db/open-database.js'
import { readV2Stage } from './v2-ceremony.js'

/**
 * The web control desk owns the current programme.  The local OBS bridge
 * consumes this small, token-protected cue and resolves the programme id to
 * an OBS scene using its local, operator-reviewed mapping file.
 */
export interface V2ObsSceneCue {
  cueId: string
  resetEpoch: number
  runRevision: number
  stageRevision: number
  interactionRevision: number
  stageMode: 'HOST' | 'PROGRAM' | 'AWARD'
  programId: string | null
  title: string
}

export function readV2ObsSceneCue(database: SqliteDatabase): V2ObsSceneCue | null {
  const runtime = database.prepare(`SELECT reset_epoch AS resetEpoch, status,
      current_scene AS currentScene, run_revision AS runRevision
    FROM v2_runtime_state WHERE id = 1`).get() as {
      resetEpoch: number
      status: string
      currentScene: string | null
      runRevision: number
    } | undefined
  if (!runtime || runtime.status !== 'RUNNING' || runtime.currentScene !== 'PROGRAM_SUPPORT') return null

  const stage = readV2Stage(database)

  const program = database.prepare(`SELECT id, title,
      CASE WHEN ceremony_type != '' THEN ceremony_type ELSE kind END AS kind
    FROM v2_program_catalog
    WHERE enabled = 1 AND id = (SELECT current_program_id FROM v2_program_catalog_state WHERE id = 1)`).get() as {
      id: string
      title: string
      kind: string
  } | undefined
  if (stage.mode !== 'HOST' && !program) return null
  // The webpage keeps SPEECH in HOST mode so it renders the host title/background,
  // while the OBS bridge still needs the reviewed, dedicated speech scene.
  const speechProgram = stage.mode === 'HOST' && program?.kind === 'SPEECH' ? program : null
  const stageProgram = stage.mode === 'HOST' ? speechProgram : program
  const cueMode = speechProgram ? 'PROGRAM' : stage.mode
  const interactionRevision = Number(database.prepare(
    'SELECT interaction_revision FROM v2_screen_interaction_state WHERE reset_epoch = ?',
  ).pluck().get(runtime.resetEpoch) ?? 0)
  return {
    cueId: `${runtime.resetEpoch}:${runtime.runRevision}:${stage.revision}:${interactionRevision}:${cueMode}:${stageProgram?.id ?? 'host'}`,
    resetEpoch: runtime.resetEpoch,
    runRevision: runtime.runRevision,
    stageRevision: stage.revision,
    interactionRevision,
    stageMode: cueMode,
    programId: stageProgram?.id ?? null,
    title: stageProgram ? stageProgram.title : '2026迎新晚会',
  }
}
