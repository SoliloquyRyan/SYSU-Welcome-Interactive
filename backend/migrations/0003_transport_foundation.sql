CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  session_type TEXT NOT NULL CHECK (session_type IN ('PARTICIPANT', 'ADMIN')),
  subject_id TEXT,
  secret_digest TEXT NOT NULL UNIQUE CHECK (length(secret_digest) = 64),
  roles_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(roles_json)),
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  short_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX sessions_subject_idx ON sessions(subject_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE idempotency_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  scope TEXT NOT NULL,
  key_digest TEXT NOT NULL CHECK (length(key_digest) = 64),
  request_digest TEXT NOT NULL CHECK (length(request_digest) = 64),
  response_status INTEGER NOT NULL CHECK (response_status BETWEEN 100 AND 599),
  response_body_json TEXT NOT NULL CHECK (json_valid(response_body_json)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (reset_epoch, scope, key_digest)
);

CREATE INDEX idempotency_expiry_idx ON idempotency_records(expires_at);

CREATE TABLE domain_events (
  event_seq INTEGER PRIMARY KEY CHECK (event_seq > 0),
  event_id TEXT NOT NULL UNIQUE,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  stream TEXT NOT NULL CHECK (stream IN ('public', 'screen', 'admin', 'participant')),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  committed_at TEXT NOT NULL,
  UNIQUE (reset_epoch, event_seq)
);

CREATE INDEX domain_events_epoch_stream_idx
  ON domain_events(reset_epoch, stream, event_seq);

CREATE TABLE admin_operation_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_short_id TEXT NOT NULL,
  roles_json TEXT NOT NULL CHECK (json_valid(roles_json)),
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX admin_operation_time_idx ON admin_operation_records(created_at);
