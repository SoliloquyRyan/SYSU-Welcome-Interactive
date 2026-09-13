CREATE TEMP TABLE gift_catalog_before_0017 AS
SELECT * FROM gift_catalog;

CREATE TEMP TABLE gift_transactions_before_0017 AS
SELECT * FROM gift_transactions;

CREATE TEMP TABLE v2_gift_transactions_before_0017 AS
SELECT * FROM v2_gift_transactions;

DROP TABLE gift_transactions;
DROP TABLE v2_gift_transactions;
DROP TABLE gift_catalog;

CREATE TABLE gift_catalog (
  id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL UNIQUE CHECK (sort_order > 0),
  name TEXT NOT NULL UNIQUE,
  power_cost INTEGER NOT NULL CHECK (power_cost IN (1, 5, 10, 20)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO gift_catalog (
  id, sort_order, name, power_cost, enabled, created_at, updated_at
)
SELECT id, sort_order, name,
       CASE id
         WHEN 'gift-glimmer' THEN 1
         WHEN 'gift-beacon' THEN 5
         WHEN 'gift-orbit' THEN 10
         WHEN 'gift-starship' THEN 20
         ELSE power_cost
       END,
       enabled, created_at, updated_at
FROM gift_catalog_before_0017;

CREATE TABLE gift_transactions (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL
    REFERENCES participant_states(identity_id) ON DELETE CASCADE,
  program_id TEXT NOT NULL
    REFERENCES program_catalog(id) ON DELETE RESTRICT,
  gift_id TEXT NOT NULL
    REFERENCES gift_catalog(id) ON DELETE RESTRICT,
  power_cost INTEGER NOT NULL CHECK (power_cost IN (1, 5, 10, 20, 50)),
  command_key_digest TEXT NOT NULL CHECK (length(command_key_digest) = 64),
  created_at TEXT NOT NULL,
  UNIQUE (identity_id, command_key_digest)
);

INSERT INTO gift_transactions
SELECT * FROM gift_transactions_before_0017;
CREATE INDEX gift_transactions_identity_idx
  ON gift_transactions(identity_id, created_at);
CREATE INDEX gift_transactions_program_idx
  ON gift_transactions(program_id, created_at);

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

INSERT INTO v2_gift_transactions
SELECT * FROM v2_gift_transactions_before_0017;
CREATE INDEX v2_gift_transactions_epoch_identity_idx
  ON v2_gift_transactions(reset_epoch, identity_id, created_at);

DROP TABLE gift_catalog_before_0017;
DROP TABLE gift_transactions_before_0017;
DROP TABLE v2_gift_transactions_before_0017;
