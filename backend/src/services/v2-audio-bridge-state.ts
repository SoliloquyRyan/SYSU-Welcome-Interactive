import { z } from 'zod'
import type { SqliteDatabase } from '../db/open-database.js'

export const AUDIO_TRACK_IDS = ['b2-eason', 'r2-jj', 'r3-gem'] as const
/**
 * The answer index is operator-only data.  It is returned by the protected
 * admin audio-status endpoint so the control desk can verify the selected
 * mix before arming a round; it is never included in participant/screen
 * snapshots.
 */
export const AUDIO_TRACK_ANSWERS = Object.freeze({
  'b2-eason': '十年、爱情转移、红玫瑰',
  'r2-jj': '江南、修炼爱情、可惜没如果、小酒窝',
  'r3-gem': '泡沫、倒数、句号',
})
export const AudioBridgeHeartbeatSchema = z.object({
  connected: z.boolean(),
  tracks: z.array(z.object({
    trackId: z.enum(AUDIO_TRACK_IDS),
    inputUuid: z.string().trim().min(1).max(128),
    available: z.boolean(),
  }).strict()).max(3),
}).strict()
type Heartbeat = z.infer<typeof AudioBridgeHeartbeatSchema>
const connections = new WeakMap<SqliteDatabase, { heartbeat: Heartbeat; seenAt: number }>()
export function recordAudioHeartbeat(database: SqliteDatabase, input: unknown, now: Date) {
  const heartbeat = AudioBridgeHeartbeatSchema.parse(input)
  if (new Set(heartbeat.tracks.map(t => t.trackId)).size !== heartbeat.tracks.length ||
      new Set(heartbeat.tracks.map(t => t.inputUuid)).size !== heartbeat.tracks.length) {
    throw new Error('Audio bridge tracks must have unique ids and inputs')
  }
  connections.set(database, { heartbeat, seenAt: now.getTime() })
}
export function audioBridgeStatus(database: SqliteDatabase, now: Date = new Date()) {
  const connection = connections.get(database)
  const available = Boolean(connection?.heartbeat.connected && now.getTime() - connection.seenAt < 2500)
  return {
    available,
    tracks: available
      ? connection!.heartbeat.tracks.map(track => ({ ...track, answer: AUDIO_TRACK_ANSWERS[track.trackId] }))
      : [],
  }
}
export function audioInputReady(database: SqliteDatabase, trackId: string, inputUuid: string, now: Date) {
  return audioBridgeStatus(database, now).tracks.some(t => t.trackId === trackId && t.inputUuid === inputUuid && t.available)
}
