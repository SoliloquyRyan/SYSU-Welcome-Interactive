CREATE TABLE demo_seed_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  seed_version TEXT NOT NULL,
  seed_fingerprint TEXT NOT NULL CHECK (length(seed_fingerprint) = 64),
  participant_count INTEGER NOT NULL CHECK (participant_count > 0),
  generated_at TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE synthetic_identities (
  id TEXT PRIMARY KEY,
  seed_index INTEGER NOT NULL UNIQUE CHECK (seed_index > 0),
  display_name TEXT NOT NULL,
  demo_code_digest TEXT NOT NULL UNIQUE CHECK (length(demo_code_digest) = 64),
  public_star_id TEXT NOT NULL UNIQUE,
  visual_seed TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE invitation_tokens (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL UNIQUE REFERENCES synthetic_identities(id) ON DELETE RESTRICT,
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
  token_hint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE program_catalog (
  id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL UNIQUE CHECK (sort_order > 0),
  title TEXT NOT NULL UNIQUE,
  heat INTEGER NOT NULL DEFAULT 0 CHECK (heat >= 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE gift_catalog (
  id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL UNIQUE CHECK (sort_order > 0),
  name TEXT NOT NULL UNIQUE,
  power_cost INTEGER NOT NULL CHECK (power_cost IN (5, 10, 20, 50)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE admin_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_digest TEXT NOT NULL CHECK (length(password_digest) = 64),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
