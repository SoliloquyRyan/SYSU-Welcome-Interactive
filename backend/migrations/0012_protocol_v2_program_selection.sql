-- V2-08 makes the current program a server-authoritative projection. SQLite
-- cannot widen the event-name CHECK in place, so rebuild the append-only event
-- table while preserving every existing row and its stream cursor identity.
ALTER TABLE v2_domain_events RENAME TO v2_domain_events_v2_07;

CREATE TABLE v2_domain_events (
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  stream_id TEXT NOT NULL,
  stream_seq INTEGER NOT NULL CHECK (stream_seq > 0),
  event_id TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'runtime.changed', 'presentation.changed', 'star.node.upserted',
    'aggregate.changed', 'participant.snapshot.changed',
    'barrage.published', 'barrage.removed', 'barrage.cleared',
    'barrage.pause.changed', 'gift.sent', 'program.changed'
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
        'program.changed'
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
SELECT * FROM v2_domain_events_v2_07;
DROP TABLE v2_domain_events_v2_07;
