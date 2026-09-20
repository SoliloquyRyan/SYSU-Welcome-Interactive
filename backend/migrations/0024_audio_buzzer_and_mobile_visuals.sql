-- D-110: audio-armed buzzer rounds.
-- The bridge never writes public media paths. It sends a stable track id and
-- OBS input UUID after the operator has armed the round in the control panel.
PRAGMA defer_foreign_keys = ON;

ALTER TABLE v2_live_interaction_state ADD COLUMN opens_at TEXT;
ALTER TABLE v2_live_interaction_state ADD COLUMN audio_track_id TEXT;
ALTER TABLE v2_live_interaction_state ADD COLUMN audio_input_uuid TEXT;
ALTER TABLE v2_live_interaction_state ADD COLUMN audio_status TEXT NOT NULL DEFAULT 'IDLE'
  CHECK (audio_status IN ('IDLE', 'ARMED', 'COUNTDOWN', 'PAUSED', 'ENDED'));
ALTER TABLE v2_live_interaction_state ADD COLUMN audio_armed_at TEXT;
ALTER TABLE v2_live_interaction_state ADD COLUMN audio_trigger_event_id TEXT;

UPDATE v2_live_interaction_state
SET opens_at = CASE
  WHEN phase IN ('BUZZER_OPEN', 'BUZZER_LOCKED') AND opened_at IS NOT NULL
    THEN strftime('%Y-%m-%dT%H:%M:%fZ', opened_at, '+3 seconds')
  ELSE NULL
END,
audio_status = CASE
  WHEN phase IN ('BUZZER_OPEN', 'BUZZER_LOCKED') THEN 'COUNTDOWN'
  ELSE 'IDLE'
END;

-- Schema 19 made identity unique per round. A wrong answer must be able to
-- re-enter the same round, so retain every attempt and only keep sequence
-- uniqueness at the round level.
CREATE TABLE v2_buzzer_entries_24 (
  id TEXT PRIMARY KEY,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  segment_code TEXT NOT NULL CHECK (segment_code IN ('A', 'C')),
  identity_id TEXT NOT NULL,
  response_sequence INTEGER NOT NULL CHECK (response_sequence > 0),
  responded_at TEXT NOT NULL,
  answer_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (answer_status IN ('PENDING', 'WRONG', 'ACCEPTED')),
  FOREIGN KEY (reset_epoch, identity_id)
    REFERENCES v2_participant_states(reset_epoch, identity_id) ON DELETE CASCADE,
  UNIQUE (reset_epoch, round_number, response_sequence)
);
INSERT INTO v2_buzzer_entries_24
  (id, reset_epoch, round_number, segment_code, identity_id,
   response_sequence, responded_at, answer_status)
SELECT id, reset_epoch, round_number, segment_code, identity_id,
       response_sequence, responded_at, 'PENDING'
FROM v2_buzzer_entries;
DROP TABLE v2_buzzer_entries;
ALTER TABLE v2_buzzer_entries_24 RENAME TO v2_buzzer_entries;

CREATE INDEX v2_buzzer_entries_round_idx
  ON v2_buzzer_entries(reset_epoch, round_number, response_sequence);
CREATE INDEX v2_buzzer_entries_identity_idx
  ON v2_buzzer_entries(reset_epoch, round_number, identity_id);

CREATE TABLE v2_interaction_audio_arms (
  id TEXT PRIMARY KEY,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  segment_code TEXT NOT NULL CHECK (segment_code = 'A'),
  track_id TEXT NOT NULL CHECK (length(trim(track_id)) BETWEEN 1 AND 80),
  input_uuid TEXT NOT NULL CHECK (length(trim(input_uuid)) BETWEEN 1 AND 128),
  prompt TEXT NOT NULL CHECK (length(trim(prompt)) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'ARMED'
    CHECK (status IN ('ARMED', 'TRIGGERED', 'CANCELLED', 'CLOSED')),
  armed_at TEXT NOT NULL,
  triggered_at TEXT,
  trigger_event_id TEXT UNIQUE,
  FOREIGN KEY (reset_epoch) REFERENCES v2_runtime_state(reset_epoch) ON DELETE CASCADE,
  UNIQUE (reset_epoch, round_number)
);
CREATE INDEX v2_interaction_audio_arms_pending_idx
  ON v2_interaction_audio_arms(reset_epoch, status, round_number);

CREATE TABLE v2_interaction_audio_actions (
  id TEXT PRIMARY KEY,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  input_uuid TEXT NOT NULL CHECK (length(trim(input_uuid)) BETWEEN 1 AND 128),
  action TEXT NOT NULL CHECK (action IN ('PAUSE', 'RESUME')),
  created_at TEXT NOT NULL,
  acknowledged_at TEXT,
  FOREIGN KEY (reset_epoch) REFERENCES v2_runtime_state(reset_epoch) ON DELETE CASCADE
);
CREATE INDEX v2_interaction_audio_actions_pending_idx
  ON v2_interaction_audio_actions(reset_epoch, acknowledged_at, created_at);

PRAGMA defer_foreign_keys = OFF;
