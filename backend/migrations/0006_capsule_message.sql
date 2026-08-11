ALTER TABLE participant_states
  RENAME COLUMN future_message TO capsule_message;

ALTER TABLE participant_states
  RENAME COLUMN future_message_saved_at TO capsule_message_submitted_at;

ALTER TABLE participant_states
  ADD COLUMN capsule_public_notice_at TEXT;

ALTER TABLE participant_states
  ADD COLUMN capsule_candidate_status TEXT NOT NULL DEFAULT 'NOT_SUBMITTED'
  CHECK (capsule_candidate_status IN (
    'NOT_SUBMITTED',
    'LEGACY_PRIVATE',
    'SUBMITTED',
    'SELECTED',
    'DISPLAYED',
    'REMOVED'
  ));

UPDATE participant_states
SET capsule_candidate_status = 'LEGACY_PRIVATE'
WHERE capsule_message_submitted_at IS NOT NULL;

ALTER TABLE value_ledger RENAME TO value_ledger_legacy;

CREATE TABLE value_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_id TEXT NOT NULL
    REFERENCES participant_states(identity_id) ON DELETE CASCADE,
  business_key TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK (reason IN (
    'ACTIVATION',
    'FUTURE_MESSAGE_LEGACY',
    'CAPSULE_MESSAGE',
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

INSERT INTO value_ledger (
  id, identity_id, business_key, reason, power_delta, starlight_delta,
  power_balance_after, starlight_after, created_at
)
SELECT
  id, identity_id, business_key,
  CASE
    WHEN reason = 'FUTURE_MESSAGE' THEN 'FUTURE_MESSAGE_LEGACY'
    ELSE reason
  END,
  power_delta, starlight_delta, power_balance_after, starlight_after, created_at
FROM value_ledger_legacy;

DROP TABLE value_ledger_legacy;

CREATE INDEX value_ledger_identity_time_idx
  ON value_ledger(identity_id, created_at);
