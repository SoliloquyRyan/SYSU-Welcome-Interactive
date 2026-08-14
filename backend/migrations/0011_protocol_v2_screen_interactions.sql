-- V2-07 keeps public interaction projection separate from private participant
-- facts.  Public barrages carry only anonymous source ids in the reviewer
-- projection and never expose participant identities to the screen stream.
CREATE TABLE v2_screen_interaction_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  reset_epoch INTEGER NOT NULL UNIQUE CHECK (reset_epoch >= 1),
  interaction_revision INTEGER NOT NULL CHECK (interaction_revision >= 0),
  barrage_paused INTEGER NOT NULL CHECK (barrage_paused IN (0, 1)),
  display_batch INTEGER NOT NULL CHECK (display_batch >= 0),
  next_display_seq INTEGER NOT NULL CHECK (next_display_seq >= 1),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (reset_epoch)
    REFERENCES v2_runtime_state(reset_epoch) ON DELETE CASCADE
);

CREATE TABLE v2_public_sources (
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  identity_id TEXT NOT NULL,
  source_id TEXT NOT NULL CHECK (length(source_id) BETWEEN 16 AND 64),
  created_at TEXT NOT NULL,
  blocked_at TEXT,
  blocked_by_session_short_id TEXT,
  PRIMARY KEY (reset_epoch, identity_id),
  UNIQUE (reset_epoch, source_id),
  FOREIGN KEY (reset_epoch, identity_id)
    REFERENCES v2_participant_states(reset_epoch, identity_id) ON DELETE CASCADE
);

CREATE TABLE v2_barrage_publications (
  barrage_id TEXT PRIMARY KEY
    REFERENCES v2_barrages(id) ON DELETE CASCADE,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  source_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PUBLISHED', 'REMOVED')),
  display_seq INTEGER NOT NULL CHECK (display_seq >= 1),
  display_batch INTEGER NOT NULL CHECK (display_batch >= 0),
  published_at TEXT NOT NULL,
  removed_at TEXT,
  removed_reason TEXT,
  removed_by_session_short_id TEXT,
  UNIQUE (reset_epoch, display_seq),
  FOREIGN KEY (reset_epoch, source_id)
    REFERENCES v2_public_sources(reset_epoch, source_id) ON DELETE CASCADE,
  CHECK (
    (status = 'PUBLISHED' AND removed_at IS NULL AND removed_reason IS NULL)
    OR
    (status = 'REMOVED' AND removed_at IS NOT NULL AND removed_reason IS NOT NULL)
  )
);

CREATE TABLE v2_screen_moderation_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  action TEXT NOT NULL CHECK (
    action IN ('SET_BARRAGE_PAUSED', 'REMOVE_BARRAGE', 'BLOCK_BARRAGE_SOURCE', 'CLEAR_BARRAGES')
  ),
  target_id TEXT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 240),
  session_short_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (reset_epoch)
    REFERENCES v2_runtime_state(reset_epoch) ON DELETE CASCADE
);

-- SQLite cannot widen the CHECK constraints on v2_domain_events in place.
-- Rebuild it without changing any v2 data so the v2-07 public interaction
-- events remain constrained by the shared contract at the application edge.
ALTER TABLE v2_domain_events RENAME TO v2_domain_events_v2_06;

CREATE TABLE v2_domain_events (
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  stream_id TEXT NOT NULL,
  stream_seq INTEGER NOT NULL CHECK (stream_seq > 0),
  event_id TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'runtime.changed', 'presentation.changed', 'star.node.upserted',
    'aggregate.changed', 'participant.snapshot.changed',
    'barrage.published', 'barrage.removed', 'barrage.cleared',
    'barrage.pause.changed', 'gift.sent'
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
        'barrage.cleared', 'barrage.pause.changed', 'gift.sent'
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
SELECT * FROM v2_domain_events_v2_06;
DROP TABLE v2_domain_events_v2_06;

CREATE INDEX v2_barrage_publications_visible_idx
  ON v2_barrage_publications(reset_epoch, status, display_batch, display_seq);
CREATE INDEX v2_barrages_epoch_created_idx
  ON v2_barrages(reset_epoch, created_at);
CREATE INDEX v2_gifts_epoch_created_idx
  ON v2_gift_transactions(reset_epoch, created_at);
CREATE INDEX v2_screen_moderation_audit_epoch_idx
  ON v2_screen_moderation_audit(reset_epoch, created_at);

INSERT INTO v2_screen_interaction_state (
  id, reset_epoch, interaction_revision, barrage_paused,
  display_batch, next_display_seq, updated_at
)
SELECT 1, reset_epoch, 0, 0, 0, 1, updated_at
FROM v2_runtime_state
WHERE id = 1;
