-- V2-02 is intentionally non-destructive. Applying this migration only
-- prepares isolated v2 storage and leaves the active runtime on protocol v1.
CREATE TABLE protocol_runtime (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_protocol_version TEXT NOT NULL
    CHECK (active_protocol_version IN ('1', '2')),
  activation_state TEXT NOT NULL
    CHECK (activation_state IN ('V1_ACTIVE', 'V2_ACTIVE')),
  data_classification TEXT NOT NULL
    CHECK (data_classification IN (
      'UNVERIFIED', 'SYNTHETIC_DEMO', 'PROTECTED'
    )),
  cutover_backup_sha256 TEXT
    CHECK (
      cutover_backup_sha256 IS NULL
      OR length(cutover_backup_sha256) = 64
    ),
  cutover_at TEXT,
  v1_service_instance_id TEXT
    CHECK (
      v1_service_instance_id IS NULL
      OR length(v1_service_instance_id) BETWEEN 1 AND 128
    ),
  v1_service_lease_expires_at TEXT,
  v1_service_registered_at TEXT,
  v1_service_generation INTEGER NOT NULL DEFAULT 0
    CHECK (v1_service_generation >= 0),
  v1_service_listen_generation INTEGER
    CHECK (
      v1_service_listen_generation IS NULL
      OR v1_service_listen_generation BETWEEN 1 AND v1_service_generation
    ),
  v1_service_listened_at TEXT,
  v1_service_clean_shutdown_generation INTEGER
    CHECK (
      v1_service_clean_shutdown_generation IS NULL
      OR v1_service_clean_shutdown_generation BETWEEN 1 AND v1_service_generation
    ),
  v1_service_clean_shutdown_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    (active_protocol_version = '1' AND activation_state = 'V1_ACTIVE')
    OR
    (active_protocol_version = '2' AND activation_state = 'V2_ACTIVE')
  ),
  CHECK (
    (
      active_protocol_version = '1'
      AND data_classification IN ('UNVERIFIED', 'SYNTHETIC_DEMO', 'PROTECTED')
      AND cutover_backup_sha256 IS NULL
      AND cutover_at IS NULL
    )
    OR
    (
      active_protocol_version = '2'
      AND data_classification = 'SYNTHETIC_DEMO'
      AND cutover_backup_sha256 IS NOT NULL
      AND cutover_at IS NOT NULL
      AND v1_service_instance_id IS NULL
      AND v1_service_lease_expires_at IS NULL
      AND v1_service_registered_at IS NOT NULL
      AND v1_service_generation > 0
      AND v1_service_listen_generation = v1_service_generation
      AND v1_service_clean_shutdown_generation = v1_service_generation
      AND v1_service_listened_at IS NOT NULL
      AND v1_service_clean_shutdown_at IS NOT NULL
    )
  ),
  CHECK (
    (v1_service_instance_id IS NULL AND v1_service_lease_expires_at IS NULL)
    OR
    (
      active_protocol_version = '1'
      AND v1_service_instance_id IS NOT NULL
      AND v1_service_lease_expires_at IS NOT NULL
      AND v1_service_registered_at IS NOT NULL
    )
  ),
  CHECK (
    (v1_service_listen_generation IS NULL AND v1_service_listened_at IS NULL)
    OR
    (v1_service_listen_generation IS NOT NULL AND v1_service_listened_at IS NOT NULL)
  ),
  CHECK (
    (
      v1_service_clean_shutdown_generation IS NULL
      AND v1_service_clean_shutdown_at IS NULL
    )
    OR
    (
      v1_service_clean_shutdown_generation IS NOT NULL
      AND v1_service_clean_shutdown_at IS NOT NULL
      AND v1_service_listen_generation IS NOT NULL
      AND v1_service_clean_shutdown_generation <= v1_service_listen_generation
    )
  )
);

INSERT INTO protocol_runtime (
  id, active_protocol_version, activation_state, data_classification,
  cutover_backup_sha256, cutover_at, v1_service_instance_id,
  v1_service_lease_expires_at, v1_service_registered_at,
  v1_service_generation, v1_service_listen_generation,
  v1_service_listened_at, v1_service_clean_shutdown_generation,
  v1_service_clean_shutdown_at, updated_at
) VALUES (
  1, '1', 'V1_ACTIVE', 'UNVERIFIED', NULL, NULL, NULL, NULL, NULL,
  0, NULL, NULL, NULL, NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

CREATE TABLE v2_runtime_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  reset_epoch INTEGER NOT NULL UNIQUE CHECK (reset_epoch >= 1),
  mode TEXT NOT NULL CHECK (mode IN ('REHEARSAL', 'LIVE')),
  status TEXT NOT NULL
    CHECK (status IN ('READY', 'RUNNING', 'PAUSED', 'COMPLETED')),
  current_scene TEXT
    CHECK (
      current_scene IS NULL
      OR current_scene IN (
        'ASSEMBLY', 'PROGRAM_SUPPORT', 'COOPERATIVE_LIGHT'
      )
    ),
  run_revision INTEGER NOT NULL CHECK (run_revision >= 0),
  presentation_type TEXT NOT NULL
    CHECK (presentation_type IN (
      'NONE', 'CAPSULE_INSERT', 'FINALE_PREVIEW'
    )),
  presentation_revision INTEGER NOT NULL CHECK (presentation_revision >= 0),
  public_aggregate_revision INTEGER NOT NULL
    CHECK (public_aggregate_revision >= 0),
  admin_aggregate_revision INTEGER NOT NULL
    CHECK (admin_aggregate_revision >= 0),
  reward_rule_version TEXT NOT NULL,
  public_seq INTEGER NOT NULL CHECK (public_seq >= 0),
  admin_seq INTEGER NOT NULL CHECK (admin_seq >= 0),
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    (status = 'READY' AND current_scene IS NULL AND completed_at IS NULL)
    OR
    (
      status IN ('RUNNING', 'PAUSED')
      AND current_scene IS NOT NULL
      AND completed_at IS NULL
    )
    OR
    (
      mode = 'LIVE'
      AND status = 'COMPLETED'
      AND current_scene = 'COOPERATIVE_LIGHT'
      AND completed_at IS NOT NULL
    )
  ),
  CHECK (
    status NOT IN ('READY', 'PAUSED', 'COMPLETED')
    OR presentation_type = 'NONE'
  ),
  CHECK (
    presentation_type != 'FINALE_PREVIEW'
    OR (
      mode = 'REHEARSAL'
      AND status = 'RUNNING'
      AND current_scene = 'COOPERATIVE_LIGHT'
    )
  )
);

CREATE TABLE v2_identity_slots (
  identity_id TEXT PRIMARY KEY
    REFERENCES synthetic_identities(id) ON DELETE RESTRICT,
  seed_index INTEGER NOT NULL UNIQUE CHECK (seed_index BETWEEN 1 AND 300),
  public_star_id TEXT NOT NULL UNIQUE,
  formation_slot TEXT NOT NULL UNIQUE
    CHECK (length(formation_slot) BETWEEN 1 AND 64),
  reserved_reset_epoch INTEGER CHECK (reserved_reset_epoch >= 1),
  reserved_at TEXT,
  CHECK (
    (reserved_reset_epoch IS NULL AND reserved_at IS NULL)
    OR
    (reserved_reset_epoch IS NOT NULL AND reserved_at IS NOT NULL)
  ),
  CHECK (
    length(public_star_id) = 6
    AND public_star_id GLOB '[A-Z]-[0-9][0-9][0-9][0-9]'
  )
);

CREATE TABLE v2_participant_states (
  identity_id TEXT PRIMARY KEY
    REFERENCES v2_identity_slots(identity_id) ON DELETE RESTRICT,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  participant_revision INTEGER NOT NULL CHECK (participant_revision >= 0),
  onboarding_state TEXT NOT NULL
    CHECK (onboarding_state IN (
      'NEEDS_COLOR', 'NEEDS_CAPSULE_DECISION', 'ADMITTED'
    )),
  activated_at TEXT NOT NULL,
  color_temperature_kelvin INTEGER
    CHECK (
      color_temperature_kelvin IS NULL
      OR color_temperature_kelvin BETWEEN 2400 AND 12000
    ),
  display_color TEXT,
  color_locked_at TEXT,
  capsule_decision TEXT NOT NULL
    CHECK (capsule_decision IN ('NONE', 'SKIPPED', 'SUBMITTED')),
  capsule_skipped_at TEXT,
  admitted_at TEXT,
  admitted_scene TEXT
    CHECK (
      admitted_scene IS NULL
      OR admitted_scene IN (
        'ASSEMBLY', 'PROGRAM_SUPPORT', 'COOPERATIVE_LIGHT'
      )
    ),
  admitted_run_revision INTEGER CHECK (admitted_run_revision >= 0),
  started_at TEXT,
  first_gift_at TEXT,
  first_barrage_at TEXT,
  cooperative_light_at TEXT,
  power_balance INTEGER NOT NULL CHECK (power_balance BETWEEN 0 AND 100),
  starlight INTEGER NOT NULL CHECK (starlight BETWEEN 0 AND 100),
  updated_at TEXT NOT NULL,
  UNIQUE (reset_epoch, identity_id),
  FOREIGN KEY (reset_epoch)
    REFERENCES v2_runtime_state(reset_epoch) ON DELETE CASCADE,
  CHECK (
    display_color IS NULL
    OR (
      length(display_color) = 7
      AND display_color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
    )
  ),
  CHECK (
    (
      onboarding_state = 'NEEDS_COLOR'
      AND color_temperature_kelvin IS NULL
      AND display_color IS NULL
      AND color_locked_at IS NULL
      AND capsule_decision = 'NONE'
      AND capsule_skipped_at IS NULL
      AND admitted_at IS NULL
      AND admitted_scene IS NULL
      AND admitted_run_revision IS NULL
      AND started_at IS NULL
      AND first_gift_at IS NULL
      AND first_barrage_at IS NULL
      AND cooperative_light_at IS NULL
      AND power_balance = 100
    )
    OR
    (
      onboarding_state = 'NEEDS_CAPSULE_DECISION'
      AND color_temperature_kelvin IS NOT NULL
      AND display_color IS NOT NULL
      AND color_locked_at IS NOT NULL
      AND capsule_decision = 'NONE'
      AND capsule_skipped_at IS NULL
      AND admitted_at IS NULL
      AND admitted_scene IS NULL
      AND admitted_run_revision IS NULL
      AND started_at IS NULL
      AND first_gift_at IS NULL
      AND first_barrage_at IS NULL
      AND cooperative_light_at IS NULL
      AND power_balance = 100
    )
    OR
    (
      onboarding_state = 'ADMITTED'
      AND color_temperature_kelvin IS NOT NULL
      AND display_color IS NOT NULL
      AND color_locked_at IS NOT NULL
      AND capsule_decision IN ('SKIPPED', 'SUBMITTED')
      AND (
        capsule_decision != 'SKIPPED'
        OR capsule_skipped_at IS NOT NULL
      )
      AND admitted_at IS NOT NULL
      AND admitted_run_revision IS NOT NULL
    )
  )
);

CREATE INDEX v2_participant_epoch_onboarding_idx
  ON v2_participant_states(reset_epoch, onboarding_state);

CREATE TABLE v2_reward_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  identity_id TEXT NOT NULL
    REFERENCES v2_participant_states(identity_id) ON DELETE CASCADE,
  event_key TEXT NOT NULL CHECK (event_key IN (
    'ACTIVATED', 'CAPSULE_SUBMITTED', 'STAR_STARTED',
    'FIRST_GIFT', 'FIRST_BARRAGE', 'COOPERATIVE_LIGHT'
  )),
  delta INTEGER NOT NULL CHECK (delta >= 0),
  reward_rule_version TEXT NOT NULL
    CHECK (length(reward_rule_version) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL,
  UNIQUE (reset_epoch, identity_id, event_key),
  FOREIGN KEY (reset_epoch, identity_id)
    REFERENCES v2_participant_states(reset_epoch, identity_id)
    ON DELETE CASCADE
);

CREATE TABLE v2_public_stars (
  identity_id TEXT PRIMARY KEY
    REFERENCES v2_participant_states(identity_id) ON DELETE CASCADE,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  public_star_id TEXT NOT NULL UNIQUE,
  color_temperature_kelvin INTEGER NOT NULL
    CHECK (color_temperature_kelvin BETWEEN 2400 AND 12000),
  display_color TEXT NOT NULL,
  formation_slot TEXT NOT NULL UNIQUE,
  started INTEGER NOT NULL DEFAULT 0 CHECK (started IN (0, 1)),
  star_revision INTEGER NOT NULL CHECK (star_revision >= 0),
  updated_at TEXT NOT NULL,
  UNIQUE (reset_epoch, public_star_id),
  FOREIGN KEY (reset_epoch, identity_id)
    REFERENCES v2_participant_states(reset_epoch, identity_id)
    ON DELETE CASCADE,
  CHECK (
    length(public_star_id) = 6
    AND public_star_id GLOB '[A-Z]-[0-9][0-9][0-9][0-9]'
  ),
  CHECK (length(formation_slot) BETWEEN 1 AND 64),
  CHECK (
    length(display_color) = 7
    AND display_color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
  )
);

CREATE TABLE v2_capsules (
  identity_id TEXT PRIMARY KEY
    REFERENCES v2_participant_states(identity_id) ON DELETE CASCADE,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  capsule_id TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 80),
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

CREATE INDEX v2_capsules_epoch_moderation_idx
  ON v2_capsules(reset_epoch, moderation_status, submitted_at);

CREATE TABLE v2_sessions (
  id TEXT PRIMARY KEY,
  session_type TEXT NOT NULL CHECK (session_type IN ('PARTICIPANT', 'ADMIN')),
  subject_id TEXT,
  secret_digest TEXT NOT NULL UNIQUE CHECK (length(secret_digest) = 64),
  roles_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(roles_json)),
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  short_id TEXT NOT NULL,
  read_only INTEGER NOT NULL DEFAULT 0 CHECK (read_only IN (0, 1)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (reset_epoch)
    REFERENCES v2_runtime_state(reset_epoch) ON DELETE CASCADE
);

CREATE INDEX v2_sessions_subject_idx ON v2_sessions(subject_id);
CREATE INDEX v2_sessions_expiry_idx ON v2_sessions(expires_at);
CREATE INDEX v2_sessions_epoch_subject_idx
  ON v2_sessions(reset_epoch, session_type, subject_id);

CREATE TABLE v2_idempotency_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  scope TEXT NOT NULL,
  key_digest TEXT NOT NULL CHECK (length(key_digest) = 64),
  request_digest TEXT NOT NULL CHECK (length(request_digest) = 64),
  response_status INTEGER NOT NULL CHECK (response_status BETWEEN 100 AND 599),
  response_body_json TEXT NOT NULL CHECK (json_valid(response_body_json)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (reset_epoch, scope, key_digest),
  FOREIGN KEY (reset_epoch)
    REFERENCES v2_runtime_state(reset_epoch) ON DELETE CASCADE
);

CREATE INDEX v2_idempotency_expiry_idx
  ON v2_idempotency_records(expires_at);

CREATE TABLE v2_stream_cursors (
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  stream_id TEXT NOT NULL
    CHECK (
      stream_id IN ('public', 'admin')
      OR stream_id LIKE 'participant:%'
    ),
  stream_seq INTEGER NOT NULL CHECK (stream_seq >= 0),
  PRIMARY KEY (reset_epoch, stream_id),
  FOREIGN KEY (reset_epoch)
    REFERENCES v2_runtime_state(reset_epoch) ON DELETE CASCADE,
  CHECK (
    stream_id IN ('public', 'admin')
    OR (
      stream_id LIKE 'participant:%'
      AND length(stream_id) > length('participant:')
      AND length(stream_id) <= length('participant:') + 64
      AND instr(substr(stream_id, length('participant:') + 1), ':') = 0
      AND substr(stream_id, length('participant:') + 1)
        NOT GLOB '*[^A-Za-z0-9_-]*'
      AND substr(stream_id, length('participant:') + 1, 1)
        GLOB '[A-Za-z0-9]'
    )
  )
);

CREATE TABLE v2_domain_events (
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  stream_id TEXT NOT NULL,
  stream_seq INTEGER NOT NULL CHECK (stream_seq > 0),
  event_id TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'runtime.changed', 'presentation.changed', 'star.node.upserted',
    'aggregate.changed', 'participant.snapshot.changed'
  )),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  committed_at TEXT NOT NULL,
  PRIMARY KEY (reset_epoch, stream_id, stream_seq),
  FOREIGN KEY (reset_epoch, stream_id)
    REFERENCES v2_stream_cursors(reset_epoch, stream_id) ON DELETE CASCADE,
  CHECK (
    event_id = (
      CAST(reset_epoch AS TEXT) || ':' || stream_id || ':' ||
      CAST(stream_seq AS TEXT)
    )
  ),
  CHECK (
    (
      stream_id = 'public'
      AND event_name IN (
        'runtime.changed', 'presentation.changed',
        'star.node.upserted', 'aggregate.changed'
      )
    )
    OR
    (
      stream_id = 'admin'
      AND event_name = 'aggregate.changed'
    )
    OR
    (
      stream_id LIKE 'participant:%'
      AND event_name = 'participant.snapshot.changed'
    )
  )
);

CREATE TABLE v2_control_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reset_epoch INTEGER NOT NULL CHECK (reset_epoch >= 1),
  idempotency_key_digest TEXT NOT NULL CHECK (length(idempotency_key_digest) = 64),
  command TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('APPLIED', 'REPLAYED')),
  before_run_revision INTEGER NOT NULL CHECK (before_run_revision >= 0),
  after_run_revision INTEGER NOT NULL CHECK (after_run_revision >= 0),
  before_presentation_revision INTEGER NOT NULL
    CHECK (before_presentation_revision >= 0),
  after_presentation_revision INTEGER NOT NULL
    CHECK (after_presentation_revision >= 0),
  session_short_id TEXT NOT NULL,
  roles_json TEXT NOT NULL CHECK (json_valid(roles_json)),
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (reset_epoch, idempotency_key_digest),
  FOREIGN KEY (reset_epoch)
    REFERENCES v2_runtime_state(reset_epoch) ON DELETE CASCADE
);

CREATE INDEX v2_control_receipts_epoch_time_idx
  ON v2_control_receipts(reset_epoch, created_at);
