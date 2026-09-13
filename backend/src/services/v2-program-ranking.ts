import type { V2AdminCommandSchema } from '@sysu-welcome/contracts'
import type { SqliteDatabase } from '../db/open-database.js'
import { readV2ProgramSchedule } from './v2-program-catalog.js'

export function readV2ProgramRanking(database: SqliteDatabase) {
  const programs = readV2ProgramSchedule(database).filter(program => program.kind === 'PERFORMANCE')
    .sort((a, b) => b.heat - a.heat || a.order - b.order)
  const confirmed = programs.length >= 3 && !programs.slice(0, 3).some((program, index) => programs[index + 1]?.heat === program.heat)
  const entries = programs.slice(0, 3).map((program, index) => ({
    name: program.title, detail: `${program.heat} 动力值${program.performers ? ' · ' + program.performers : ''}`, rank: index + 1,
  }))
  return { entries, confirmed, revision: programs.reduce((sum, program) => sum + program.heatRevision, 0) }
}

type Fail = (code: 'REVISION_CONFLICT' | 'SCENE_ACTION_INVALID' | 'RESOURCE_NOT_FOUND', message: string) => never
export function applyV2ProgramHeat(database: SqliteDatabase, request: Extract<ReturnType<typeof V2AdminCommandSchema.parse>, { command: 'SET_PROGRAM_HEAT' }>,
  runtime: { status: string; resetEpoch: number }, actor: { sessionShortId: string; requestId: string }, timestamp: string, fail: Fail) {
  if (!database.inTransaction) throw new Error('Programme adjustment requires a transaction')
  if (runtime.status === 'COMPLETED') fail('SCENE_ACTION_INVALID', '活动结束后不能修改节目动力值。')
  const stage = database.prepare('SELECT revision, award_id AS awardId, revealed FROM v2_ceremony_state WHERE id = 1').get() as { revision: number; awardId: string | null; revealed: number }
  if (stage.revision !== request.expectedStageRevision) fail('REVISION_CONFLICT', '舞台状态已更新，请重新操作。')
  if (stage.revealed && stage.awardId === 'program-honors') fail('SCENE_ACTION_INVALID', '请先收起节目获奖名单，再调整动力值。')
  const program = readV2ProgramSchedule(database).find(item => item.id === request.programId)
  if (!program || program.kind !== 'PERFORMANCE') fail('RESOURCE_NOT_FOUND', '请选择正式节目。')
  if (request.expectedHeatRevision !== program.heatRevision || request.expectedRawHeat !== program.rawHeat) {
    fail('REVISION_CONFLICT', '节目动力值已变化，请核对最新数值后重新确定。')
  }
  database.prepare(`INSERT INTO v2_program_heat_adjustments(reset_epoch, program_id, raw_heat, target_heat,
    previous_adjustment, heat_adjustment, revision, session_short_id, request_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(runtime.resetEpoch, program.id, program.rawHeat, request.heat,
      program.heatAdjustment, request.heat - program.rawHeat, program.heatRevision + 1, actor.sessionShortId, actor.requestId, timestamp)
  database.prepare('UPDATE v2_ceremony_state SET revision = revision + 1 WHERE id = 1').run()
}
