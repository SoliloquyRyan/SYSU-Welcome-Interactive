CREATE TABLE participant_states (
  identity_id TEXT PRIMARY KEY
    REFERENCES synthetic_identities(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL UNIQUE,
  power_balance INTEGER NOT NULL DEFAULT 100 CHECK (power_balance >= 0),
  starlight INTEGER NOT NULL DEFAULT 20 CHECK (starlight BETWEEN 0 AND 100),
  future_message TEXT CHECK (future_message IS NULL OR length(future_message) <= 80),
  future_message_saved_at TEXT,
  star_created_at TEXT NOT NULL,
  star_started_at TEXT,
  first_gift_at TEXT,
  first_barrage_at TEXT,
  cooperative_light_at TEXT,
  activated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE value_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_id TEXT NOT NULL
    REFERENCES participant_states(identity_id) ON DELETE CASCADE,
  business_key TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK (reason IN (
    'ACTIVATION',
    'FUTURE_MESSAGE',
    'STAR_STARTED',
    'FIRST_GIFT',
    'FIRST_BARRAGE',
    'COOPERATIVE_LIGHT',
    'GIFT_SPEND'
  )),
  power_delta INTEGER NOT NULL DEFAULT 0,
  starlight_delta INTEGER NOT NULL DEFAULT 0,
  power_balance_after INTEGER NOT NULL CHECK (power_balance_after >= 0),
  starlight_after INTEGER NOT NULL CHECK (starlight_after BETWEEN 0 AND 100),
  created_at TEXT NOT NULL
);

CREATE INDEX value_ledger_identity_time_idx
  ON value_ledger(identity_id, created_at);

CREATE TABLE gift_transactions (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL
    REFERENCES participant_states(identity_id) ON DELETE CASCADE,
  program_id TEXT NOT NULL
    REFERENCES program_catalog(id) ON DELETE RESTRICT,
  gift_id TEXT NOT NULL
    REFERENCES gift_catalog(id) ON DELETE RESTRICT,
  power_cost INTEGER NOT NULL CHECK (power_cost IN (5, 10, 20, 50)),
  command_key_digest TEXT NOT NULL CHECK (length(command_key_digest) = 64),
  created_at TEXT NOT NULL,
  UNIQUE (identity_id, command_key_digest)
);

CREATE INDEX gift_transactions_identity_idx
  ON gift_transactions(identity_id, created_at);
CREATE INDEX gift_transactions_program_idx
  ON gift_transactions(program_id, created_at);

CREATE TABLE barrages (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL
    REFERENCES participant_states(identity_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'PUBLISHED', 'REJECTED_BY_RULE', 'REMOVED'
  )),
  rejection_reason TEXT,
  command_key_digest TEXT NOT NULL CHECK (length(command_key_digest) = 64),
  display_seq INTEGER UNIQUE,
  display_batch INTEGER NOT NULL CHECK (display_batch >= 0),
  created_at TEXT NOT NULL,
  published_at TEXT,
  removed_at TEXT,
  UNIQUE (identity_id, command_key_digest),
  CHECK (
    (status = 'REJECTED_BY_RULE' AND rejection_reason IS NOT NULL
      AND display_seq IS NULL AND published_at IS NULL)
    OR
    (status IN ('PUBLISHED', 'REMOVED') AND rejection_reason IS NULL
      AND display_seq IS NOT NULL AND published_at IS NOT NULL)
  )
);

CREATE INDEX barrages_public_idx
  ON barrages(status, display_batch, display_seq);
CREATE INDEX barrages_identity_time_idx
  ON barrages(identity_id, created_at);

CREATE TABLE blocked_sources (
  identity_id TEXT PRIMARY KEY
    REFERENCES participant_states(identity_id) ON DELETE CASCADE,
  source_id TEXT NOT NULL UNIQUE,
  blocked_by_session_short_id TEXT NOT NULL,
  blocked_at TEXT NOT NULL
);

CREATE TABLE cooperative_lights (
  identity_id TEXT PRIMARY KEY
    REFERENCES participant_states(identity_id) ON DELETE CASCADE,
  business_key TEXT NOT NULL UNIQUE,
  completed_at TEXT NOT NULL
);

CREATE TABLE activation_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'INVALID', 'REVOKED', 'LOCKED')),
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX activation_attempts_time_idx
  ON activation_attempts(created_at);

CREATE TABLE program_runtime_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_program_id TEXT REFERENCES program_catalog(id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL
);

INSERT INTO program_runtime_state (id, current_program_id, updated_at)
VALUES (1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

ALTER TABLE domain_events ADD COLUMN audience_subject_id TEXT;

CREATE INDEX domain_events_audience_idx
  ON domain_events(reset_epoch, stream, audience_subject_id, event_seq);
