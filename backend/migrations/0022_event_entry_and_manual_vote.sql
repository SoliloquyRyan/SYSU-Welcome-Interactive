-- D-108. Defer RESTRICT while replacing only the slot parent table; all child
-- rows retain their identity keys. foreign_key_check is required before commit.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE v2_identity_slots_22 (
  identity_id TEXT PRIMARY KEY REFERENCES synthetic_identities(id) ON DELETE RESTRICT,
  seed_index INTEGER NOT NULL UNIQUE CHECK (seed_index BETWEEN 1 AND 400),
  public_star_id TEXT NOT NULL UNIQUE CHECK (
    length(public_star_id) = 6 AND public_star_id GLOB '[A-Z]-[0-9][0-9][0-9][0-9]'),
  formation_slot TEXT NOT NULL UNIQUE CHECK (length(formation_slot) BETWEEN 1 AND 64),
  reserved_reset_epoch INTEGER CHECK (reserved_reset_epoch >= 1),
  reserved_at TEXT,
  CHECK ((reserved_reset_epoch IS NULL AND reserved_at IS NULL)
    OR (reserved_reset_epoch IS NOT NULL AND reserved_at IS NOT NULL))
);
INSERT INTO v2_identity_slots_22 SELECT * FROM v2_identity_slots;
DROP TABLE v2_identity_slots;
ALTER TABLE v2_identity_slots_22 RENAME TO v2_identity_slots;

ALTER TABLE synthetic_identities ADD COLUMN account_type TEXT NOT NULL DEFAULT 'STUDENT'
  CHECK (account_type IN ('STUDENT', 'STAFF'));
ALTER TABLE v2_gift_transactions ADD COLUMN score_eligible INTEGER NOT NULL DEFAULT 1
  CHECK (score_eligible IN (0, 1));

-- Historical identity-bound votes remain intact and readable. New rounds use
-- their own candidate namespace, with no participant identity in a candidate.
CREATE TABLE v2_manual_vote_candidates (
  reset_epoch INTEGER NOT NULL REFERENCES v2_runtime_state(reset_epoch) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  candidate_id TEXT NOT NULL,
  display_label TEXT NOT NULL CHECK (length(trim(display_label)) BETWEEN 1 AND 40),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 1 AND 12),
  PRIMARY KEY (reset_epoch, round_number, candidate_id),
  UNIQUE (reset_epoch, round_number, sort_order)
);
CREATE TABLE v2_manual_audience_votes (
  id TEXT PRIMARY KEY,
  reset_epoch INTEGER NOT NULL,
  round_number INTEGER NOT NULL,
  identity_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (reset_epoch, round_number, identity_id),
  FOREIGN KEY (reset_epoch, identity_id)
    REFERENCES v2_participant_states(reset_epoch, identity_id) ON DELETE CASCADE,
  FOREIGN KEY (reset_epoch, round_number, candidate_id)
    REFERENCES v2_manual_vote_candidates(reset_epoch, round_number, candidate_id) ON DELETE CASCADE
);
CREATE INDEX v2_manual_votes_candidate_idx
  ON v2_manual_audience_votes(reset_epoch, round_number, candidate_id);
