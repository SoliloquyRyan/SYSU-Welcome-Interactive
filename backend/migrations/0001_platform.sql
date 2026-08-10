CREATE TABLE app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  event_seq INTEGER NOT NULL CHECK (event_seq >= 0),
  seed_version TEXT,
  seed_fingerprint TEXT,
  is_resetting INTEGER NOT NULL DEFAULT 0 CHECK (is_resetting IN (0, 1)),
  updated_at TEXT NOT NULL
);

INSERT INTO app_state (
  id,
  reset_epoch,
  event_seq,
  seed_version,
  seed_fingerprint,
  is_resetting,
  updated_at
) VALUES (
  1,
  1,
  0,
  NULL,
  NULL,
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

CREATE TABLE runtime_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL CHECK (mode IN ('REHEARSAL', 'LIVE')),
  status TEXT NOT NULL CHECK (status IN ('READY', 'RUNNING', 'PAUSED', 'COMPLETED')),
  stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 6),
  stage_revision INTEGER NOT NULL CHECK (stage_revision >= 0),
  display_batch INTEGER NOT NULL CHECK (display_batch >= 0),
  barrage_paused INTEGER NOT NULL DEFAULT 0 CHECK (barrage_paused IN (0, 1)),
  updated_at TEXT NOT NULL
);

INSERT INTO runtime_state (
  id,
  mode,
  status,
  stage,
  stage_revision,
  display_batch,
  barrage_paused,
  updated_at
) VALUES (
  1,
  'REHEARSAL',
  'READY',
  1,
  0,
  0,
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
