import { V2AwardAdminSchema, V2StageSchema } from '@sysu-welcome/contracts'
import type { V2AdminCommandSchema } from '@sysu-welcome/contracts'
import type { SqliteDatabase } from '../db/open-database.js'
import { databaseTableExists } from '../db/open-database.js'
import { readV2ProgramRanking } from './v2-program-ranking.js'
import { readCurrentV2Program } from './v2-program-catalog.js'

export function readV2Awards(database: SqliteDatabase) {
  if (!databaseTableExists(database, 'v2_awards')) return []
  const rows = database.prepare(`SELECT id, group_code AS "group", title, description,
    entries_json AS entries, confirmed, revision FROM v2_awards ORDER BY sort_order`).all() as
    Array<{id: string; group: string; title: string; description: string; entries: string; confirmed: number; revision: number}>
  const ranked = databaseTableExists(database, 'v2_program_heat_adjustments')
  return rows.filter(raw => !ranked || raw.group !== 'PROGRAM' || raw.id === 'program-honors').map(raw => {
    if (ranked && raw.id === 'program-honors') {
      const ranking = readV2ProgramRanking(database)
      return V2AwardAdminSchema.parse({ ...raw, ...ranking, title: '节目颁奖', description: '动力值前三名', entryCount: ranking.confirmed ? ranking.entries.length : 0 })
    }
    const entries = JSON.parse(raw.entries)
    return V2AwardAdminSchema.parse({ ...raw, entries, confirmed: Boolean(raw.confirmed),
      entryCount: raw.confirmed ? entries.length : 0 })
  })
}

export function readV2AwardSummaries(database: SqliteDatabase) {
  return readV2Awards(database).map(({ entries: _entries, revision: _revision, ...summary }) => summary)
}

export function readV2Stage(database: SqliteDatabase) {
  const fallback = { revision: 0, mode: 'PROGRAM', revealed: false, page: 0, totalPages: 1, award: null }
  if (!databaseTableExists(database, 'v2_ceremony_state')) return V2StageSchema.parse(fallback)
  const row = database.prepare('SELECT revision, mode, award_id AS awardId, page, revealed FROM v2_ceremony_state WHERE id = 1').get() as
    { revision: number; mode: string; awardId: string | null; page: number; revealed: number } | undefined
  if (!row) return V2StageSchema.parse(fallback)
  const award = readV2Awards(database).find(({ id }) => id === row.awardId)
  const revealed = row.mode === 'AWARD' && Boolean(row.revealed) && Boolean(award?.confirmed)
  const pageSize = award?.entries.some(entry => entry.name.length > 24 || entry.detail.length > 70) ? 4 : 8
  const totalPages = revealed && award ? Math.max(1, Math.ceil(award.entries.length / pageSize)) : 1
  const page = Math.min(row.page, totalPages - 1)
  return V2StageSchema.parse({ revision: row.revision, mode: row.mode, revealed, page, totalPages,
    award: award && row.mode === 'AWARD' ? {
      id: award.id, group: award.group, title: award.title, description: award.description,
      confirmed: award.confirmed, entryCount: award.entryCount,
      entries: revealed ? award.entries.slice(page * pageSize, page * pageSize + pageSize) : [],
    } : null })
}

// Caller owns the transaction. Selecting a directory item always starts with a title,
// never replays an earlier winner reveal.
export function selectV2ProgramStage(database: SqliteDatabase) {
  const program = readCurrentV2Program(database)
  const mode = program?.kind === 'AWARD' ? 'AWARD' : !program || program.kind === 'SPEECH' ? 'HOST' : 'PROGRAM'
  const awardId = mode === 'AWARD' ? readV2Awards(database).find(({ group }) => group === program?.awardGroup)?.id ?? null : null
  database.prepare(`UPDATE v2_ceremony_state SET mode = ?, award_id = ?, page = 0,
    revealed = 0, revision = revision + 1 WHERE id = 1`).run(mode, awardId)
}

type Fail = (code: 'REVISION_CONFLICT' | 'SCENE_ACTION_INVALID' | 'RESOURCE_NOT_FOUND', message: string) => never
export function applyV2CeremonyCommand(database: SqliteDatabase, request: ReturnType<typeof V2AdminCommandSchema.parse>,
  runtime: { status: string; currentScene: string | null; presentationType: string }, fail: Fail) {
  const stage = readV2Stage(database)
  if (!('expectedStageRevision' in request)) fail('SCENE_ACTION_INVALID', '此命令不属于舞台控制。')
  if (request.expectedStageRevision !== stage.revision) fail('REVISION_CONFLICT', '舞台已被其他主控更新，请重新操作。')
  const awards = readV2Awards(database)
  if (request.command === 'SAVE_AWARD') {
    if (request.group === 'PROGRAM') fail('SCENE_ACTION_INVALID', '节目奖按动力值前三名自动生成，请在节目动力值中调整。')
    if (runtime.status === 'COMPLETED') fail('SCENE_ACTION_INVALID', '活动结束后不能修改奖项。')
    const existing = awards.find(({ id }) => id === request.awardId)
    if ((existing?.revision ?? 0) !== request.expectedAwardRevision) fail('REVISION_CONFLICT', '名单已被其他主控更新。')
    if (stage.revealed && stage.award?.id === request.awardId) fail('SCENE_ACTION_INVALID', '请先收起名单，再修改。')
    if (!existing) fail('RESOURCE_NOT_FOUND', '请选择已配置的校园奖项。')
    if (existing && (existing.group !== request.group || existing.group === 'CAMPUS' && existing.title !== request.title)) fail('SCENE_ACTION_INVALID', '校园图鉴奖项分类与名称已确定。')
    if (request.confirmed && !request.entries.length) fail('SCENE_ACTION_INVALID', '请先录入获奖名单。')
    if (request.awardId === 'points-top20' && (request.entries.length > 20 || request.confirmed && request.entries.length !== 20)) fail('SCENE_ACTION_INVALID', '积分榜确认时须有 20 名获奖者，按排名顺序录入。')
    const entries = request.entries.map((entry, index) => ({ name: entry.name, detail: entry.detail,
      ...(request.awardId === 'points-top20' ? { rank: index + 1 } : {}) }))
    database.prepare(`INSERT INTO v2_awards(id, group_code, title, description, sort_order, entries_json, confirmed, revision)
      VALUES (?, ?, ?, '', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM v2_awards), ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, entries_json = excluded.entries_json,
        confirmed = excluded.confirmed, revision = v2_awards.revision + 1`)
      .run(request.awardId, request.group, request.title, JSON.stringify(entries), Number(request.confirmed))
  } else {
    const live = database.prepare('SELECT phase FROM v2_live_interaction_state WHERE id = 1').pluck().get()
    if (runtime.status !== 'RUNNING' || runtime.currentScene !== 'PROGRAM_SUPPORT' || runtime.presentationType !== 'NONE' || live !== 'IDLE') {
      fail('SCENE_ACTION_INVALID', '请在节目阶段结束当前互动或投影，再切换舞台。')
    }
    const program = readCurrentV2Program(database)
    if (request.command === 'SET_STAGE_MODE') {
      if (request.mode === 'PROGRAM' && (!program || program.kind === 'AWARD' || program.kind === 'SPEECH')) fail('SCENE_ACTION_INVALID', '请先选择节目或互动环节。')
      database.prepare('UPDATE v2_ceremony_state SET mode = ?, award_id = NULL, revealed = 0, page = 0 WHERE id = 1').run(request.mode)
    } else {
      if (program?.kind !== 'AWARD') fail('SCENE_ACTION_INVALID', '请先切换到颁奖环节。')
      if (request.command === 'SELECT_AWARD') {
        const award = awards.find(({ id }) => id === request.awardId)
        if (!award || award.group !== program.awardGroup) fail('RESOURCE_NOT_FOUND', '此奖项不属于当前颁奖环节。')
        database.prepare("UPDATE v2_ceremony_state SET mode = 'AWARD', award_id = ?, page = 0, revealed = 0 WHERE id = 1").run(request.awardId)
      } else {
        if (stage.mode !== 'AWARD' || !stage.award) fail('SCENE_ACTION_INVALID', '请先选择奖项。')
        if (request.command === 'REVEAL_AWARD') {
          if (!stage.award.confirmed || !stage.award.entryCount) fail('SCENE_ACTION_INVALID', stage.award.group === 'PROGRAM' ? '前三名须有三个节目且动力值不能并列，请先核对节目动力值。' : '名单尚未确认。')
          database.prepare('UPDATE v2_ceremony_state SET revealed = 1, page = 0 WHERE id = 1').run()
        } else if (request.command === 'HIDE_AWARD') {
          database.prepare('UPDATE v2_ceremony_state SET revealed = 0, page = 0 WHERE id = 1').run()
        } else if (request.command === 'SET_AWARD_PAGE') {
          if (!stage.revealed || request.page >= stage.totalPages) fail('SCENE_ACTION_INVALID', '此页名单不可展示。')
          database.prepare('UPDATE v2_ceremony_state SET page = ? WHERE id = 1').run(request.page)
        }
      }
    }
  }
  database.prepare('UPDATE v2_ceremony_state SET revision = revision + 1 WHERE id = 1').run()
}
