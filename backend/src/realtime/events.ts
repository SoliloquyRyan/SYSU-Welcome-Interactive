import { randomUUID } from 'node:crypto'

import {
  G2RealtimeEventEnvelopeSchema,
  RealtimeEventEnvelopeSchema,
  type RealtimeEventEnvelope,
  type RealtimeStream,
} from '@sysu-welcome/contracts'

import type { SqliteDatabase } from '../db/open-database.js'

export interface StoredRealtimeEvent extends RealtimeEventEnvelope {
  audienceSubjectId: string | null
}

const PARTICIPANT_ALIAS_EXCLUSION_PREFIX = '__exclude-participant__:'

export function participantAliasExclusion(subjectId: string): string {
  return `${PARTICIPANT_ALIAS_EXCLUSION_PREFIX}${subjectId}`
}

export function isParticipantAliasExcludedFor(
  marker: string | null | undefined,
  subjectId: string | null,
): boolean {
  return (
    subjectId !== null && marker === participantAliasExclusion(subjectId)
  )
}

interface EventRow {
  eventSeq: number
  eventId: string
  resetEpoch: number
  stream: RealtimeStream
  eventType: string
  payloadJson: string
  committedAt: string
  audienceSubjectId: string | null
}

function fromRow(row: EventRow): StoredRealtimeEvent {
  const envelope = RealtimeEventEnvelopeSchema.parse({
    protocolVersion: '1',
    resetEpoch: row.resetEpoch,
    stream: row.stream,
    eventSeq: row.eventSeq,
    eventId: row.eventId,
    type: row.eventType,
    committedAt: row.committedAt,
    payload: JSON.parse(row.payloadJson),
  })
  if (envelope.stream === 'screen') {
    G2RealtimeEventEnvelopeSchema.parse(envelope)
  }
  return { ...envelope, audienceSubjectId: row.audienceSubjectId }
}

export function createParticipantPublicAlias(
  event: StoredRealtimeEvent,
  excludeSubjectId?: string,
): StoredRealtimeEvent {
  if (event.stream !== 'participant') {
    throw new Error('Only participant events can be mapped to a public alias')
  }
  const payload = event.payload as { publicAggregate?: unknown }
  const alias = G2RealtimeEventEnvelopeSchema.parse({
    protocolVersion: event.protocolVersion,
    resetEpoch: event.resetEpoch,
    stream: 'screen',
    eventSeq: event.eventSeq,
    eventId: `${event.eventId}:public`,
    type: 'aggregate.updated',
    committedAt: event.committedAt,
    payload: payload.publicAggregate,
  })
  return {
    ...alias,
    audienceSubjectId: excludeSubjectId
      ? participantAliasExclusion(excludeSubjectId)
      : null,
  }
}

export function appendDomainEvent(
  database: SqliteDatabase,
  input: {
    stream: RealtimeStream
    type: string
    payload: unknown
    committedAt: string
    audienceSubjectId?: string | null
  },
): StoredRealtimeEvent {
  if (!database.inTransaction) {
    throw new Error('Domain events must be appended inside the business transaction')
  }
  const state = database
    .prepare(
      `UPDATE app_state
       SET event_seq = event_seq + 1, updated_at = ?
       WHERE id = 1
       RETURNING reset_epoch AS resetEpoch, event_seq AS eventSeq`,
    )
    .get(input.committedAt) as { resetEpoch: number; eventSeq: number }
  const envelope = RealtimeEventEnvelopeSchema.parse({
    protocolVersion: '1',
    resetEpoch: state.resetEpoch,
    stream: input.stream,
    eventSeq: state.eventSeq,
    eventId: randomUUID(),
    type: input.type,
    committedAt: input.committedAt,
    payload: input.payload,
  })
  if (envelope.stream === 'screen') {
    G2RealtimeEventEnvelopeSchema.parse(envelope)
  }
  database
    .prepare(
      `INSERT INTO domain_events (
         event_seq, event_id, reset_epoch, stream, event_type,
         payload_json, committed_at, audience_subject_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      envelope.eventSeq,
      envelope.eventId,
      envelope.resetEpoch,
      envelope.stream,
      envelope.type,
      JSON.stringify(envelope.payload),
      envelope.committedAt,
      input.audienceSubjectId ?? null,
    )
  return { ...envelope, audienceSubjectId: input.audienceSubjectId ?? null }
}

export function readEventCursor(database: SqliteDatabase): {
  resetEpoch: number
  eventSeq: number
} {
  return database
    .prepare(
      `SELECT reset_epoch AS resetEpoch, event_seq AS eventSeq
       FROM app_state WHERE id = 1`,
    )
    .get() as { resetEpoch: number; eventSeq: number }
}

export function readEventsAfter(
  database: SqliteDatabase,
  input: {
    stream: RealtimeStream
    afterEventSeq: number
    subjectId?: string | null
    limit?: number
  },
): StoredRealtimeEvent[] {
  const limit = Math.min(Math.max(input.limit ?? 1_000, 1), 5_000)
  const access =
    input.stream === 'admin'
      ? `stream IN ('public', 'screen', 'admin', 'participant')`
      : `stream IN ('public', 'screen', 'participant')`
  const parameters: unknown[] = [input.afterEventSeq]
  parameters.push(limit)
  const rows = database
    .prepare(
      `SELECT event_seq AS eventSeq, event_id AS eventId,
              reset_epoch AS resetEpoch, stream, event_type AS eventType,
              payload_json AS payloadJson, committed_at AS committedAt,
              audience_subject_id AS audienceSubjectId
       FROM domain_events
       WHERE event_seq > ? AND ${access}
       ORDER BY event_seq
       LIMIT ?`,
    )
    .all(...parameters) as EventRow[]
  return rows.map((row) => {
    const event = fromRow(row)
    if (event.stream !== 'participant') return event
    if (
      input.stream === 'participant' &&
      event.audienceSubjectId === (input.subjectId ?? null)
    ) {
      return event
    }
    return createParticipantPublicAlias(event)
  })
}

export function createResyncRequiredEvent(
  database: SqliteDatabase,
  reason: 'EPOCH_CHANGED' | 'EVENT_GAP' | 'HISTORY_UNAVAILABLE',
  now: Date = new Date(),
): RealtimeEventEnvelope {
  const cursor = readEventCursor(database)
  return G2RealtimeEventEnvelopeSchema.parse({
    protocolVersion: '1',
    resetEpoch: cursor.resetEpoch,
    stream: 'screen',
    eventSeq: cursor.eventSeq,
    eventId: randomUUID(),
    type: 'resync.required',
    committedAt: now.toISOString(),
    payload: { reason },
  })
}
