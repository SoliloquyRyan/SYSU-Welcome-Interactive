-- Retire the time-capsule product flow while preserving old columns and tables
-- for forward-only SQLite migration compatibility. Existing development text
-- is removed and color-locked participants are admitted directly.
UPDATE v2_participant_states
SET starlight = starlight
  - COALESCE((
      SELECT delta FROM v2_reward_ledger reward
      WHERE reward.reset_epoch = v2_participant_states.reset_epoch
        AND reward.identity_id = v2_participant_states.identity_id
        AND reward.event_key = 'CAPSULE_SUBMITTED'
    ), 0)
  + CASE WHEN started_at IS NOT NULL THEN 20 ELSE 0 END;

DELETE FROM v2_reward_ledger WHERE event_key = 'CAPSULE_SUBMITTED';
UPDATE v2_reward_ledger SET delta = 40 WHERE event_key = 'STAR_STARTED';
UPDATE v2_reward_ledger
SET reward_rule_version = 'v2-rewards-2026-08-30-raffle';
UPDATE v2_runtime_state
SET reward_rule_version = 'v2-rewards-2026-08-30-raffle';

DELETE FROM v2_final_recap_capsules;
DELETE FROM v2_capsules;

UPDATE v2_participant_states
SET onboarding_state = 'ADMITTED',
    capsule_decision = 'SKIPPED',
    capsule_skipped_at = COALESCE(capsule_skipped_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    admitted_at = COALESCE(admitted_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    admitted_scene = COALESCE(admitted_scene, (SELECT current_scene FROM v2_runtime_state WHERE id = 1)),
    admitted_run_revision = COALESCE(admitted_run_revision, (SELECT run_revision FROM v2_runtime_state WHERE id = 1)),
    participant_revision = participant_revision + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE color_locked_at IS NOT NULL;

UPDATE v2_runtime_state
SET presentation_type = 'NONE',
    presentation_revision = presentation_revision + CASE WHEN presentation_type = 'CAPSULE_INSERT' THEN 1 ELSE 0 END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 1;

CREATE TABLE v2_raffle_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  reset_epoch INTEGER NOT NULL UNIQUE CHECK (reset_epoch >= 1),
  display_active INTEGER NOT NULL DEFAULT 0 CHECK (display_active IN (0, 1)),
  raffle_revision INTEGER NOT NULL DEFAULT 0 CHECK (raffle_revision >= 0),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (reset_epoch) REFERENCES v2_runtime_state(reset_epoch) ON DELETE CASCADE
);

CREATE TABLE v2_raffle_draws (
  id TEXT PRIMARY KEY,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  draw_sequence INTEGER NOT NULL CHECK (draw_sequence > 0),
  identity_id TEXT NOT NULL,
  drawn_at TEXT NOT NULL,
  UNIQUE (reset_epoch, draw_sequence),
  UNIQUE (reset_epoch, identity_id),
  FOREIGN KEY (reset_epoch, identity_id)
    REFERENCES v2_participant_states(reset_epoch, identity_id) ON DELETE CASCADE
);

CREATE INDEX v2_raffle_draws_epoch_sequence_idx
  ON v2_raffle_draws(reset_epoch, draw_sequence);

INSERT INTO v2_raffle_state (
  id, reset_epoch, display_active, raffle_revision, updated_at
)
SELECT 1, reset_epoch, 0, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM v2_runtime_state WHERE id = 1;
