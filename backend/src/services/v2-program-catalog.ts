import { V2ProgramCatalogSchema } from '@sysu-welcome/contracts'
import { databaseTableExists } from '../db/open-database.js'
import type { SqliteDatabase } from '../db/open-database.js'

interface ProgramRow {
  id: string
  title: string
  order: number
  heat: number
  rawHeat: number
  heatAdjustment: number
  heatRevision: number
  kind: 'PERFORMANCE' | 'INTERLUDE' | 'DEFERRED' | 'AWARD' | 'SPEECH'
  formatLabel: string
  durationLabel: string
  performers: string
  giftsEnabled: boolean
  awardGroup: 'PROGRAM' | 'CAMPUS' | null
}
function columns(database: SqliteDatabase) {
  const extra = databaseTableExists(database, 'v2_awards')
  const adjustments = databaseTableExists(database, 'v2_program_heat_adjustments')
  const adjustment = adjustments ? `(SELECT heat_adjustment FROM v2_program_heat_adjustments
    WHERE program_id = v2_program_catalog.id AND reset_epoch = (SELECT reset_epoch FROM v2_runtime_state WHERE id = 1)
    ORDER BY revision DESC LIMIT 1)` : '0'
  const revision = adjustments ? `(SELECT MAX(revision) FROM v2_program_heat_adjustments
    WHERE program_id = v2_program_catalog.id AND reset_epoch = (SELECT reset_epoch FROM v2_runtime_state WHERE id = 1))` : '0'
  return `id, title, sort_order AS "order", heat + COALESCE(${adjustment}, 0) AS heat,
    heat AS rawHeat, COALESCE(${adjustment}, 0) AS heatAdjustment, COALESCE(${revision}, 0) AS heatRevision,
    ${extra ? "CASE WHEN ceremony_type != '' THEN ceremony_type ELSE kind END" : 'kind'} AS kind,
    format_label AS formatLabel, duration_label AS durationLabel, performers,
    ${extra ? 'gifts_enabled' : '1'} AS giftsEnabled,
    ${extra ? "NULLIF(award_group, '')" : 'NULL'} AS awardGroup`
}

function withDisplayCodes(rows: ProgramRow[]) {
  let programNumber = 0
  let interactionNumber = 0
  return rows.map((row) => ({
    ...row,
    giftsEnabled: row.kind === 'PERFORMANCE' && Boolean(row.giftsEnabled),
    displayCode: row.kind === 'PERFORMANCE'
      ? String(++programNumber).padStart(2, '0')
      : row.kind === 'AWARD' ? '颁奖' : row.kind === 'SPEECH' ? '讲话' : String.fromCharCode(65 + interactionNumber++),
  }))
}

export function readProgramCatalogInfo(database: SqliteDatabase) {
  return database.prepare(`SELECT catalog_revision AS revision, catalog_label AS label
    FROM v2_program_catalog_state WHERE id = 1`).get() as { revision: number; label: string }
}

export function readCurrentV2Program(database: SqliteDatabase) {
  const currentId = database.prepare('SELECT current_program_id FROM v2_program_catalog_state WHERE id = 1').pluck().get()
  const row = withDisplayCodes(database.prepare(`SELECT ${columns(database)} FROM v2_program_catalog
    WHERE enabled = 1 ORDER BY sort_order`).all() as ProgramRow[]).find(({ id }) => id === currentId)
  if (!row) return null
  if (databaseTableExists(database, 'v2_ceremony_state') && ['HOST', 'AWARD'].includes(String(database.prepare('SELECT mode FROM v2_ceremony_state WHERE id = 1').pluck().get()))) row.giftsEnabled = false
  const { order: _order, ...program } = row
  const giftCatalog = row.kind === 'PERFORMANCE' && row.giftsEnabled
    ? database.prepare(`SELECT gift.id, gift.name, gift.power_cost AS powerCost,
          COUNT(gift_tx.id) AS sentCount
        FROM gift_catalog gift
        LEFT JOIN v2_gift_transactions gift_tx
          ON gift_tx.gift_id = gift.id
         AND gift_tx.program_id = ?
         AND gift_tx.reset_epoch = (
           SELECT reset_epoch FROM v2_runtime_state WHERE id = 1
         )
        WHERE gift.enabled = 1
        GROUP BY gift.id, gift.name, gift.power_cost, gift.sort_order
        ORDER BY gift.sort_order`).all(row.id)
    : []
  return { ...program, giftCatalog }
}

export function readV2ProgramSchedule(database: SqliteDatabase) {
  const currentId = database.prepare('SELECT current_program_id FROM v2_program_catalog_state WHERE id = 1').pluck().get()
  const rows = withDisplayCodes(database.prepare(`SELECT ${columns(database)} FROM v2_program_catalog WHERE enabled = 1 ORDER BY sort_order`).all() as ProgramRow[])
  const currentIndex = rows.findIndex(({ id }) => id === currentId)
  return rows.map((program, index) => ({
    ...program,
    state: index === currentIndex ? 'CURRENT' as const
      : currentIndex >= 0 && index === currentIndex + 1 ? 'NEXT' as const
        : currentIndex >= 0 && index < currentIndex ? 'CLOSED' as const : 'UPCOMING' as const,
  }))
}

// Caller owns the permission, READY/revision checks and the write transaction.
export function applyV2ProgramCatalog(database: SqliteDatabase, input: unknown, timestamp: string) {
  if (!database.inTransaction) throw new Error('Program catalog update requires a transaction')
  const catalog = V2ProgramCatalogSchema.parse(input)
  const oldRows = database.prepare('SELECT id FROM v2_program_catalog ORDER BY sort_order').all() as Array<{ id: string }>
  const allIds = new Set([...oldRows.map(({ id }) => id), ...catalog.items.map(({ id }) => id)])
  if (allIds.size > 256) throw new Error('Program history exceeds the maintenance limit')
  // Retain omitted identities and historical gifts. Reserve fresh positions so
  // exchanging two positions cannot trip SQLite's immediate UNIQUE constraint.
  const offset = Number(database.prepare('SELECT COALESCE(MAX(sort_order), 0) FROM v2_program_catalog').pluck().get()) + 1000
  database.prepare('UPDATE v2_program_catalog SET sort_order = sort_order + ?, enabled = 0').run(offset)
  const upsert = database.prepare(`INSERT INTO v2_program_catalog
    (id, sort_order, title, kind, format_label, duration_label, performers, heat, enabled, created_at, updated_at, ceremony_type, gifts_enabled, award_group)
    VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, (SELECT performers FROM v2_program_catalog WHERE id = ?), ''), 0, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET sort_order = excluded.sort_order, title = excluded.title,
      kind = excluded.kind, format_label = excluded.format_label, duration_label = excluded.duration_label,
      performers = excluded.performers, enabled = 1, updated_at = excluded.updated_at,
      ceremony_type = excluded.ceremony_type, gifts_enabled = excluded.gifts_enabled, award_group = excluded.award_group`)
  for (const item of catalog.items) {
    upsert.run(item.id, item.order, item.title, ['AWARD', 'SPEECH'].includes(item.kind) ? 'DEFERRED' : item.kind, item.formatLabel, item.durationLabel, item.performers ?? null, item.id, timestamp, timestamp, ['AWARD', 'SPEECH'].includes(item.kind) ? item.kind : '',
      Number(item.kind === 'PERFORMANCE' && item.giftsEnabled !== false && !['光年之外', '《光年之外》'].includes(item.title)), item.kind === 'AWARD' ? item.awardGroup ?? 'PROGRAM' : '')
  }
  const retired = database.prepare('SELECT id FROM v2_program_catalog WHERE enabled = 0 ORDER BY sort_order').all() as Array<{ id: string }>
  retired.forEach(({ id }, index) => database.prepare('UPDATE v2_program_catalog SET sort_order = ? WHERE id = ?').run(1000 + index, id))
  // A READY directory does not designate an on-stage item yet.
  database.prepare(`UPDATE v2_program_catalog_state SET current_program_id = NULL,
    catalog_revision = catalog_revision + 1, catalog_label = ?, updated_at = ? WHERE id = 1`).run(catalog.label, timestamp)
}
