-- V2-03 keeps the database bounded while allowing the shared contract's
-- 80 user-perceived grapheme limit (for example joined family emoji). SQLite
-- length() counts Unicode code points, so the original 80-code-point check was
-- stricter than the v2 contract. The service contract remains the authority.
ALTER TABLE v2_capsules RENAME TO v2_capsules_v2_02;

CREATE TABLE v2_capsules (
  identity_id TEXT PRIMARY KEY
    REFERENCES v2_participant_states(identity_id) ON DELETE CASCADE,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  capsule_id TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2048),
  candidate_scope_accepted_at TEXT NOT NULL,
  moderation_status TEXT NOT NULL CHECK (moderation_status IN (
    'SUBMITTED', 'SELECTED', 'DISPLAYED', 'REMOVED'
  )),
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (reset_epoch, capsule_id),
  FOREIGN KEY (reset_epoch, identity_id)
    REFERENCES v2_participant_states(reset_epoch, identity_id)
    ON DELETE CASCADE
);

INSERT INTO v2_capsules (
  identity_id, reset_epoch, capsule_id, text,
  candidate_scope_accepted_at, moderation_status, submitted_at, updated_at
)
SELECT identity_id, reset_epoch, capsule_id, text,
       candidate_scope_accepted_at, moderation_status, submitted_at, updated_at
FROM v2_capsules_v2_02;

DROP TABLE v2_capsules_v2_02;

CREATE INDEX v2_capsules_epoch_moderation_idx
  ON v2_capsules(reset_epoch, moderation_status, submitted_at);
