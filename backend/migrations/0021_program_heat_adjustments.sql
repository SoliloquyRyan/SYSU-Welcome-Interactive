-- D-097: append-only operator adjustments; original gift facts stay untouched.
CREATE TABLE v2_program_heat_adjustments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 reset_epoch INTEGER NOT NULL CHECK(reset_epoch >= 1),
 program_id TEXT NOT NULL REFERENCES v2_program_catalog(id),
 raw_heat INTEGER NOT NULL CHECK(raw_heat >= 0),
 target_heat INTEGER NOT NULL CHECK(target_heat >= 0),
 previous_adjustment INTEGER NOT NULL,
 heat_adjustment INTEGER NOT NULL CHECK(heat_adjustment = target_heat - raw_heat),
 revision INTEGER NOT NULL CHECK(revision >= 1),
 session_short_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(reset_epoch, program_id, revision)
);
CREATE INDEX v2_program_heat_current ON v2_program_heat_adjustments(reset_epoch, program_id, revision DESC);
-- A legacy manual programme award must not remain on air when ranking takes over.
UPDATE v2_ceremony_state SET award_id = 'program-honors', revealed = 0, page = 0, revision = revision + 1
 WHERE award_id IN (SELECT id FROM v2_awards WHERE group_code = 'PROGRAM');
