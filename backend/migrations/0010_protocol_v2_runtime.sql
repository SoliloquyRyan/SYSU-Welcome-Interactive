CREATE TABLE v2_gift_transactions (
  id TEXT PRIMARY KEY,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  identity_id TEXT NOT NULL,
  program_id TEXT NOT NULL REFERENCES program_catalog(id) ON DELETE RESTRICT,
  gift_id TEXT NOT NULL REFERENCES gift_catalog(id) ON DELETE RESTRICT,
  power_cost INTEGER NOT NULL CHECK (power_cost > 0),
  created_at TEXT NOT NULL,
  UNIQUE (reset_epoch, identity_id, id),
  FOREIGN KEY (reset_epoch, identity_id)
    REFERENCES v2_participant_states(reset_epoch, identity_id) ON DELETE CASCADE
);

CREATE INDEX v2_gift_transactions_epoch_identity_idx
  ON v2_gift_transactions(reset_epoch, identity_id, created_at);

CREATE TABLE v2_barrages (
  id TEXT PRIMARY KEY,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  identity_id TEXT NOT NULL,
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2048),
  created_at TEXT NOT NULL,
  UNIQUE (reset_epoch, identity_id, id),
  FOREIGN KEY (reset_epoch, identity_id)
    REFERENCES v2_participant_states(reset_epoch, identity_id) ON DELETE CASCADE
);

CREATE INDEX v2_barrages_epoch_identity_idx
  ON v2_barrages(reset_epoch, identity_id, created_at);

CREATE TABLE v2_final_recap_capsules (
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 6),
  capsule_id TEXT NOT NULL,
  public_star_id TEXT NOT NULL,
  color_temperature_kelvin INTEGER NOT NULL CHECK (color_temperature_kelvin BETWEEN 2400 AND 12000),
  display_color TEXT NOT NULL,
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2048),
  captured_at TEXT NOT NULL,
  PRIMARY KEY (reset_epoch, position),
  UNIQUE (reset_epoch, capsule_id),
  FOREIGN KEY (reset_epoch) REFERENCES v2_runtime_state(reset_epoch) ON DELETE CASCADE
);

CREATE TABLE v2_control_audit_context (
  receipt_id INTEGER PRIMARY KEY
    REFERENCES v2_control_receipts(id) ON DELETE CASCADE,
  readiness_warnings_json TEXT NOT NULL CHECK (json_valid(readiness_warnings_json)),
  funnel_json TEXT NOT NULL CHECK (json_valid(funnel_json)),
  override_readiness_warnings INTEGER NOT NULL CHECK (override_readiness_warnings IN (0, 1)),
  live_completion INTEGER NOT NULL CHECK (live_completion IN (0, 1))
);
