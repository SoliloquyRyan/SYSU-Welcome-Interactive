import type { SqliteDatabase } from './open-database.js'
import {
  restoreDemoSeedCatalogInTransaction,
  type SeedOptions,
} from './seed.js'
import { appendDomainEvent, type StoredRealtimeEvent } from '../realtime/events.js'

export interface ResetResult {
  previousResetEpoch: number
  resetEpoch: number
  event?: StoredRealtimeEvent
}

export interface ResetOptions {
  emitDomainEvent?: boolean
}

export function resetDemoDatabase(
  database: SqliteDatabase,
  options: SeedOptions,
  resetOptions: ResetOptions = {},
): ResetResult {
  const timestamp = (options.now ?? (() => new Date()))().toISOString()
  let previousResetEpoch = 0

  database.exec('BEGIN IMMEDIATE')
  try {
    const previous = database
      .prepare('SELECT reset_epoch AS resetEpoch FROM app_state WHERE id = 1')
      .get() as { resetEpoch: number }
    previousResetEpoch = previous.resetEpoch
    restoreDemoSeedCatalogInTransaction(database, options, timestamp)
    database
      .prepare(
        `UPDATE app_state SET is_resetting = 1, updated_at = ? WHERE id = 1`,
      )
      .run(timestamp)
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
        `UPDATE app_state
         SET reset_epoch = reset_epoch + 1, event_seq = 0,
             is_resetting = 0, updated_at = ?
         WHERE id = 1`,
      )
      .run(timestamp)
    let event: StoredRealtimeEvent | undefined
    if (resetOptions.emitDomainEvent) {
      event = appendDomainEvent(database, {
        stream: 'screen',
        type: 'demo.reset',
        committedAt: timestamp,
        payload: { previousResetEpoch },
      })
    }
    database.exec('COMMIT')

    return {
      previousResetEpoch,
      resetEpoch: previousResetEpoch + 1,
      ...(event ? { event } : {}),
    }
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  throw new Error('Reset transaction ended unexpectedly')
}
