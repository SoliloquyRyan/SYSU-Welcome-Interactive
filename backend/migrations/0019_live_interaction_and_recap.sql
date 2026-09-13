-- D-089: authoritative A/C buzzer rounds, B audience voting, and personal
-- barrage colour. Existing identities, programme heat and interaction history
-- are preserved; the new live state starts idle.
ALTER TABLE v2_barrages ADD COLUMN custom_color TEXT
  CHECK (
    custom_color IS NULL
    OR (
      length(custom_color) = 7
      AND custom_color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
    )
  );

CREATE TABLE v2_live_interaction_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  reset_epoch INTEGER NOT NULL UNIQUE CHECK (reset_epoch >= 1),
  segment_code TEXT CHECK (segment_code IS NULL OR segment_code IN ('A', 'B', 'C')),
  phase TEXT NOT NULL DEFAULT 'IDLE'
    CHECK (phase IN ('IDLE', 'BUZZER_OPEN', 'BUZZER_LOCKED', 'VOTE_OPEN', 'VOTE_REVEALED')),
  round_number INTEGER NOT NULL DEFAULT 0 CHECK (round_number >= 0),
  prompt TEXT NOT NULL DEFAULT '' CHECK (length(prompt) <= 120),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  opened_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (reset_epoch) REFERENCES v2_runtime_state(reset_epoch) ON DELETE CASCADE,
  CHECK (
    (phase = 'IDLE' AND segment_code IS NULL AND prompt = '' AND opened_at IS NULL)
    OR
    (phase IN ('BUZZER_OPEN', 'BUZZER_LOCKED') AND segment_code IN ('A', 'C') AND length(trim(prompt)) > 0 AND opened_at IS NOT NULL)
    OR
    (phase IN ('VOTE_OPEN', 'VOTE_REVEALED') AND segment_code = 'B' AND length(trim(prompt)) > 0 AND opened_at IS NOT NULL)
  )
);

CREATE TABLE v2_buzzer_entries (
  id TEXT PRIMARY KEY,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  segment_code TEXT NOT NULL CHECK (segment_code IN ('A', 'C')),
  identity_id TEXT NOT NULL,
  response_sequence INTEGER NOT NULL CHECK (response_sequence > 0),
  responded_at TEXT NOT NULL,
  UNIQUE (reset_epoch, round_number, identity_id),
  UNIQUE (reset_epoch, round_number, response_sequence),
  FOREIGN KEY (reset_epoch, identity_id)
    REFERENCES v2_participant_states(reset_epoch, identity_id) ON DELETE CASCADE
);

CREATE TABLE v2_audience_votes (
  id TEXT PRIMARY KEY,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  identity_id TEXT NOT NULL,
  candidate_identity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (reset_epoch, round_number, identity_id),
  FOREIGN KEY (reset_epoch, identity_id)
    REFERENCES v2_participant_states(reset_epoch, identity_id) ON DELETE CASCADE,
  FOREIGN KEY (reset_epoch, candidate_identity_id)
    REFERENCES v2_participant_states(reset_epoch, identity_id) ON DELETE CASCADE
);

CREATE INDEX v2_buzzer_entries_round_idx
  ON v2_buzzer_entries(reset_epoch, round_number, response_sequence);
CREATE INDEX v2_audience_votes_round_idx
  ON v2_audience_votes(reset_epoch, round_number, candidate_identity_id);

INSERT INTO v2_live_interaction_state (
  id, reset_epoch, segment_code, phase, round_number, prompt,
  revision, opened_at, updated_at
)
SELECT 1, reset_epoch, NULL, 'IDLE', 0, '', 0, NULL,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM v2_runtime_state WHERE id = 1;

-- SQLite cannot widen the event-name CHECK in place. Preserve all prior
-- append-only events while admitting the new public live-interaction event.
ALTER TABLE v2_domain_events RENAME TO v2_domain_events_v2_18;

CREATE TABLE v2_domain_events (
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  stream_id TEXT NOT NULL,
  stream_seq INTEGER NOT NULL CHECK (stream_seq > 0),
  event_id TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'runtime.changed', 'presentation.changed', 'star.node.upserted',
    'aggregate.changed', 'participant.snapshot.changed',
    'barrage.published', 'barrage.removed', 'barrage.cleared',
    'barrage.pause.changed', 'gift.sent', 'program.changed',
    'live.interaction.changed'
  )),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  committed_at TEXT NOT NULL,
  PRIMARY KEY (reset_epoch, stream_id, stream_seq),
  FOREIGN KEY (reset_epoch, stream_id)
    REFERENCES v2_stream_cursors(reset_epoch, stream_id) ON DELETE CASCADE,
  CHECK (
    event_id = (
      CAST(reset_epoch AS TEXT) || ':' || stream_id || ':' ||
      CAST(stream_seq AS TEXT)
    )
  ),
  CHECK (
    (
      stream_id = 'public'
      AND event_name IN (
        'runtime.changed', 'presentation.changed', 'star.node.upserted',
        'aggregate.changed', 'barrage.published', 'barrage.removed',
        'barrage.cleared', 'barrage.pause.changed', 'gift.sent',
        'program.changed', 'live.interaction.changed'
      )
    )
    OR (stream_id = 'admin' AND event_name = 'aggregate.changed')
    OR (
      stream_id LIKE 'participant:%'
      AND event_name = 'participant.snapshot.changed'
    )
  )
);

INSERT INTO v2_domain_events
SELECT * FROM v2_domain_events_v2_18;
DROP TABLE v2_domain_events_v2_18;
