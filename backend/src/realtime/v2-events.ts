import {
  V2RealtimeEventEnvelopeSchema,
  type V2RealtimeEventEnvelope,
} from '@sysu-welcome/contracts'

import type { SqliteDatabase } from '../db/open-database.js'

export const V2_EVENT_HISTORY_LIMIT = 5_000

export function readV2EventStorageCursor(database: SqliteDatabase): number {
  return Number(database.prepare('SELECT COALESCE(max(rowid), 0) FROM v2_domain_events').pluck().get())
}

export function readV2LiveEventsAfter(
  database: SqliteDatabase,
  resetEpoch: number,
  afterStorageRowId: number,
): Array<{ storageRowId: number; event: V2RealtimeEventEnvelope }> {
  const rows = database.prepare(
    `SELECT rowid AS storageRowId, stream_id AS streamId,
            stream_seq AS streamSeq, event_id AS eventId,
            event_name AS name, revision, payload_json AS payloadJson
     FROM v2_domain_events WHERE reset_epoch = ? AND rowid > ?
     ORDER BY rowid LIMIT ?`,
  ).all(resetEpoch, afterStorageRowId, V2_EVENT_HISTORY_LIMIT) as Array<{
    storageRowId: number; streamId: string; streamSeq: number; eventId: string
    name: string; revision: number; payloadJson: string
  }>
  return rows.map((row) => ({
    storageRowId: row.storageRowId,
    event: V2RealtimeEventEnvelopeSchema.parse({
      protocolVersion: '2', resetEpoch, streamId: row.streamId,
      streamSeq: row.streamSeq, eventId: row.eventId, name: row.name,
      revision: row.revision, payload: JSON.parse(row.payloadJson),
    }),
  }))
}

export function readV2StreamCursor(
  database: SqliteDatabase,
  resetEpoch: number,
  streamId: string,
): number {
  return Number(database.prepare(
    `SELECT stream_seq FROM v2_stream_cursors
     WHERE reset_epoch = ? AND stream_id = ?`,
  ).pluck().get(resetEpoch, streamId) ?? 0)
}

export function readV2EventsAfter(
  database: SqliteDatabase,
  resetEpoch: number,
  streamId: string,
  afterSeq: number,
  limit = V2_EVENT_HISTORY_LIMIT,
): V2RealtimeEventEnvelope[] {
  const earliest = Number(database.prepare(
    `SELECT min(stream_seq) FROM v2_domain_events
     WHERE reset_epoch = ? AND stream_id = ?`,
  ).pluck().get(resetEpoch, streamId) ?? 0)
  const current = readV2StreamCursor(database, resetEpoch, streamId)
  if (afterSeq > current || (earliest > 0 && afterSeq + 1 < earliest)) {
    throw new V2StreamHistoryUnavailable(streamId)
  }
  const rows = database.prepare(
    `SELECT stream_seq AS streamSeq, event_id AS eventId,
            event_name AS name, revision, payload_json AS payloadJson
     FROM v2_domain_events WHERE reset_epoch = ? AND stream_id = ?
       AND stream_seq > ? ORDER BY stream_seq LIMIT ?`,
  ).all(resetEpoch, streamId, afterSeq, limit) as Array<{
    streamSeq: number; eventId: string; name: string; revision: number; payloadJson: string
  }>
  if (rows.length === limit && rows.at(-1)!.streamSeq < current) {
    throw new V2StreamHistoryUnavailable(streamId)
  }
  return rows.map((row) => V2RealtimeEventEnvelopeSchema.parse({
    protocolVersion: '2', resetEpoch, streamId, streamSeq: row.streamSeq,
    eventId: row.eventId, name: row.name, revision: row.revision,
    payload: JSON.parse(row.payloadJson),
  }))
}

export class V2StreamHistoryUnavailable extends Error {
  constructor(readonly streamId: string) {
    super(`V2 stream history is unavailable for ${streamId}`)
    this.name = 'V2StreamHistoryUnavailable'
  }
}
