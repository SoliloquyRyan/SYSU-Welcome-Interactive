-- D-061: operational v2 programs are independent of the immutable identity seed.
-- Preserve program identities, accumulated heat, selection and every gift row.
CREATE TABLE v2_program_catalog (
  id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL UNIQUE CHECK (sort_order > 0),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  kind TEXT NOT NULL DEFAULT 'PERFORMANCE' CHECK (kind IN ('PERFORMANCE', 'INTERLUDE', 'DEFERRED')),
  format_label TEXT NOT NULL DEFAULT '' CHECK (length(format_label) <= 40),
  duration_label TEXT NOT NULL DEFAULT '' CHECK (length(duration_label) <= 40),
  heat INTEGER NOT NULL DEFAULT 0 CHECK (heat >= 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO v2_program_catalog (id, sort_order, title, heat, enabled, created_at, updated_at)
SELECT id, sort_order, title, heat, enabled, created_at, updated_at FROM program_catalog;

CREATE TABLE v2_program_catalog_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_program_id TEXT REFERENCES v2_program_catalog(id) ON DELETE RESTRICT,
  catalog_revision INTEGER NOT NULL DEFAULT 0 CHECK (catalog_revision >= 0),
  catalog_label TEXT NOT NULL DEFAULT '初始节目目录' CHECK (length(catalog_label) BETWEEN 1 AND 80),
  updated_at TEXT NOT NULL
);

INSERT INTO v2_program_catalog_state (id, current_program_id, updated_at)
SELECT id, current_program_id, updated_at FROM program_runtime_state;

ALTER TABLE v2_gift_transactions RENAME TO v2_gift_transactions_before_0015;
DROP INDEX v2_gift_transactions_epoch_identity_idx;
CREATE TABLE v2_gift_transactions (
  id TEXT PRIMARY KEY,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  identity_id TEXT NOT NULL,
  program_id TEXT NOT NULL REFERENCES v2_program_catalog(id) ON DELETE RESTRICT,
  gift_id TEXT NOT NULL REFERENCES gift_catalog(id) ON DELETE RESTRICT,
  power_cost INTEGER NOT NULL CHECK (power_cost > 0),
  created_at TEXT NOT NULL,
  UNIQUE (reset_epoch, identity_id, id),
  FOREIGN KEY (reset_epoch, identity_id)
    REFERENCES v2_participant_states(reset_epoch, identity_id) ON DELETE CASCADE
);
INSERT INTO v2_gift_transactions SELECT * FROM v2_gift_transactions_before_0015;
DROP TABLE v2_gift_transactions_before_0015;
CREATE INDEX v2_gift_transactions_epoch_identity_idx
  ON v2_gift_transactions(reset_epoch, identity_id, created_at);
