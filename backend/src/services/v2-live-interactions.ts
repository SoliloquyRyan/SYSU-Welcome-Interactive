import { readV2ProgramSchedule } from './v2-program-catalog.js'
import type { SqliteDatabase } from '../db/open-database.js'

interface LiveStateRow {
  revision: number
  segmentCode: 'A' | 'B' | 'C' | null
  phase: 'IDLE' | 'BUZZER_OPEN' | 'BUZZER_LOCKED' | 'VOTE_OPEN' | 'VOTE_REVEALED'
  roundNumber: number
  prompt: string
  openedAt: string | null
}

function hasLiveInteractionTables(database: SqliteDatabase): boolean {
  return Boolean(database.prepare(
    `SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'v2_live_interaction_state'`,
  ).pluck().get())
}

export function readLiveInteractionRow(database: SqliteDatabase, resetEpoch: number): LiveStateRow {
  if (!hasLiveInteractionTables(database)) {
    return { revision: 0, segmentCode: null, phase: 'IDLE', roundNumber: 0, prompt: '', openedAt: null }
  }
  return database.prepare(`SELECT revision, segment_code AS segmentCode, phase,
      round_number AS roundNumber, prompt, opened_at AS openedAt
    FROM v2_live_interaction_state WHERE reset_epoch = ?`).get(resetEpoch) as LiveStateRow
}

export function currentInteractionCode(database: SqliteDatabase): 'A' | 'B' | 'C' | null {
  const rows = readV2ProgramSchedule(database)
  const currentId = database.prepare(
    'SELECT current_program_id FROM v2_program_catalog_state WHERE id = 1',
  ).pluck().get()
  let index = 0
  for (const row of rows) {
    if (!['INTERLUDE', 'DEFERRED'].includes(row.kind)) continue
    const code = String.fromCharCode(65 + index++) as 'A' | 'B' | 'C'
    if (row.id === currentId) return ['A', 'B', 'C'].includes(code) ? code : null
  }
  return null
}

export function readV2LiveInteraction(
  database: SqliteDatabase,
  resetEpoch: number,
  options: { identityId?: string; showHiddenResults?: boolean } = {},
): any {
  const state = readLiveInteractionRow(database, resetEpoch)
  const leader = state.phase.startsWith('BUZZER')
    ? database.prepare(`SELECT slot.public_star_id AS publicStarId,
          star.display_color AS displayColor
        FROM v2_buzzer_entries entry
        JOIN v2_identity_slots slot ON slot.identity_id = entry.identity_id
        LEFT JOIN v2_public_stars star ON star.reset_epoch = entry.reset_epoch
          AND star.identity_id = entry.identity_id
        WHERE entry.reset_epoch = ? AND entry.round_number = ?
        ORDER BY entry.response_sequence LIMIT 1`).get(resetEpoch, state.roundNumber) ?? null
    : null
  const buzzCount = state.phase.startsWith('BUZZER')
    ? Number(database.prepare(`SELECT COUNT(*) FROM v2_buzzer_entries
        WHERE reset_epoch = ? AND round_number = ?`).pluck().get(resetEpoch, state.roundNumber))
    : 0
  const revealVotes = state.phase === 'VOTE_REVEALED' || options.showHiddenResults === true
  const candidates = state.phase.startsWith('VOTE')
    ? database.prepare(`SELECT slot.public_star_id AS publicStarId,
          star.display_color AS displayColor,
          CASE WHEN ? THEN COUNT(vote.id) ELSE NULL END AS voteCount
        FROM v2_raffle_draws draw
        JOIN v2_identity_slots slot ON slot.identity_id = draw.identity_id
        LEFT JOIN v2_public_stars star ON star.reset_epoch = draw.reset_epoch
          AND star.identity_id = draw.identity_id
        LEFT JOIN v2_audience_votes vote ON vote.reset_epoch = draw.reset_epoch
          AND vote.round_number = ? AND vote.candidate_identity_id = draw.identity_id
        WHERE draw.reset_epoch = ?
        GROUP BY draw.identity_id, slot.public_star_id, star.display_color, draw.draw_sequence
        ORDER BY draw.draw_sequence LIMIT 12`).all(revealVotes ? 1 : 0, state.roundNumber, resetEpoch) as Array<{
          publicStarId: string
          displayColor: string | null
          voteCount: number | null
        }>
    : []
  const totalVotes = state.phase.startsWith('VOTE')
    ? Number(database.prepare(`SELECT COUNT(*) FROM v2_audience_votes
        WHERE reset_epoch = ? AND round_number = ?`).pluck().get(resetEpoch, state.roundNumber))
    : 0
  const base = {
    revision: state.revision,
    segmentCode: state.segmentCode,
    phase: state.phase,
    roundNumber: state.roundNumber,
    prompt: state.prompt,
    opensAt: state.phase.startsWith('BUZZER') && state.openedAt
      ? new Date(Date.parse(state.openedAt) + 3000).toISOString() : null,
    buzzCount,
    leader,
    voteCandidates: candidates.map((candidate) => ({
      ...candidate,
      voteCount: candidate.voteCount === null ? null : Number(candidate.voteCount),
    })),
    totalVotes,
    resultsVisible: state.phase === 'VOTE_REVEALED',
  }
  if (!options.identityId) return base
  if (!hasLiveInteractionTables(database)) {
    return {
      ...base,
      participation: { hasBuzzed: false, buzzPosition: null, hasVoted: false, votedFor: null },
    }
  }
  const buzz = database.prepare(`SELECT response_sequence AS responseSequence
    FROM v2_buzzer_entries WHERE reset_epoch = ? AND round_number = ? AND identity_id = ?`)
    .get(resetEpoch, state.roundNumber, options.identityId) as { responseSequence: number } | undefined
  const vote = database.prepare(`SELECT slot.public_star_id AS publicStarId
    FROM v2_audience_votes audience_vote
    JOIN v2_identity_slots slot ON slot.identity_id = audience_vote.candidate_identity_id
    WHERE audience_vote.reset_epoch = ? AND audience_vote.round_number = ?
      AND audience_vote.identity_id = ?`).get(resetEpoch, state.roundNumber, options.identityId) as
    { publicStarId: string } | undefined
  return {
    ...base,
    participation: {
      hasBuzzed: Boolean(buzz),
      buzzPosition: buzz?.responseSequence ?? null,
      hasVoted: Boolean(vote),
      votedFor: vote?.publicStarId ?? null,
    },
  }
}
