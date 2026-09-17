-- Retain account_type for schema-22 directory fingerprints; account_kind is the
-- authoritative role from schema 23 onward. No identity parent table is rebuilt.
ALTER TABLE synthetic_identities ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'STUDENT'
  CHECK (account_kind IN ('STUDENT', 'STAFF', 'GUEST'));
UPDATE synthetic_identities SET account_kind = account_type;

CREATE TABLE v2_guest_credentials (
  identity_id TEXT PRIMARY KEY REFERENCES synthetic_identities(id) ON DELETE RESTRICT,
  reset_epoch INTEGER NOT NULL,
  recovery_digest TEXT NOT NULL UNIQUE CHECK (length(recovery_digest) = 64),
  creation_key_digest TEXT NOT NULL UNIQUE CHECK (length(creation_key_digest) = 64),
  creation_request_digest TEXT NOT NULL CHECK (length(creation_request_digest) = 64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Deliberately independent of the current runtime row: these receipts survive
-- a round reset and make a lost response or repeated command non-destructive.
CREATE TABLE v2_round_archives (
  source_epoch INTEGER PRIMARY KEY,
  target_epoch INTEGER NOT NULL UNIQUE CHECK (target_epoch = source_epoch + 1),
  idempotency_key_digest TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL,
  archive_filename TEXT NOT NULL UNIQUE,
  archive_sha256 TEXT NOT NULL CHECK (length(archive_sha256) = 64),
  created_at TEXT NOT NULL
);

-- Stable IDs preserve media/theme bindings and all existing transactions.
UPDATE v2_program_catalog SET performers='王奇琦' WHERE id='event2026-03' AND performers='王奇琪';
UPDATE v2_program_catalog SET duration_label='约 5 分钟' WHERE id='ceremony-program-awards' AND duration_label='';
UPDATE v2_program_catalog SET duration_label='约 8 分钟' WHERE id='ceremony-speech' AND duration_label='';
UPDATE v2_program_catalog SET duration_label='约 15 分钟' WHERE id='ceremony-campus-awards' AND duration_label='';
