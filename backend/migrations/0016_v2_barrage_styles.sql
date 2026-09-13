ALTER TABLE v2_barrages ADD COLUMN color_style TEXT NOT NULL DEFAULT 'white'
  CHECK (color_style IN ('white','warm','gold','blue','violet','aurora','sunset','nebula'));
CREATE TABLE v2_interaction_unlocks (
  reset_epoch INTEGER NOT NULL,
  identity_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('STYLE','PROGRAM_ALLOWANCE')),
  item_key TEXT NOT NULL,
  power_delta INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(reset_epoch, identity_id, kind, item_key),
  FOREIGN KEY(reset_epoch, identity_id) REFERENCES v2_participant_states(reset_epoch, identity_id) ON DELETE CASCADE
);
