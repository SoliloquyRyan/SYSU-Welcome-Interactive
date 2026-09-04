-- D-054: allow a newly initialized, source-attested protected roster to run
-- protocol v2 without pretending that it passed through the disposable Demo
-- cutover. The extra evidence columns stay null for v1 and synthetic Demo
-- rows, and are mandatory only for PROTECTED v2.
ALTER TABLE protocol_runtime RENAME TO protocol_runtime_before_0014;

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
  protected_source_sha256 TEXT
    CHECK (
      protected_source_sha256 IS NULL
      OR length(protected_source_sha256) = 64
    ),
  protected_imported_at TEXT,
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
      AND protected_source_sha256 IS NULL
      AND protected_imported_at IS NULL
    )
    OR
    (
      active_protocol_version = '2'
      AND data_classification = 'SYNTHETIC_DEMO'
      AND cutover_backup_sha256 IS NOT NULL
      AND cutover_at IS NOT NULL
      AND protected_source_sha256 IS NULL
      AND protected_imported_at IS NULL
      AND v1_service_instance_id IS NULL
      AND v1_service_lease_expires_at IS NULL
      AND v1_service_registered_at IS NOT NULL
      AND v1_service_generation > 0
      AND v1_service_listen_generation = v1_service_generation
      AND v1_service_clean_shutdown_generation = v1_service_generation
      AND v1_service_listened_at IS NOT NULL
      AND v1_service_clean_shutdown_at IS NOT NULL
    )
    OR
    (
      active_protocol_version = '2'
      AND data_classification = 'PROTECTED'
      AND cutover_backup_sha256 IS NULL
      AND cutover_at IS NULL
      AND protected_source_sha256 IS NOT NULL
      AND protected_imported_at IS NOT NULL
      AND v1_service_instance_id IS NULL
      AND v1_service_lease_expires_at IS NULL
      AND v1_service_registered_at IS NULL
      AND v1_service_generation = 0
      AND v1_service_listen_generation IS NULL
      AND v1_service_listened_at IS NULL
      AND v1_service_clean_shutdown_generation IS NULL
      AND v1_service_clean_shutdown_at IS NULL
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
  cutover_backup_sha256, cutover_at,
  protected_source_sha256, protected_imported_at,
  v1_service_instance_id, v1_service_lease_expires_at,
  v1_service_registered_at, v1_service_generation,
  v1_service_listen_generation, v1_service_listened_at,
  v1_service_clean_shutdown_generation, v1_service_clean_shutdown_at,
  updated_at
)
SELECT
  id, active_protocol_version, activation_state, data_classification,
  cutover_backup_sha256, cutover_at,
  NULL, NULL,
  v1_service_instance_id, v1_service_lease_expires_at,
  v1_service_registered_at, v1_service_generation,
  v1_service_listen_generation, v1_service_listened_at,
  v1_service_clean_shutdown_generation, v1_service_clean_shutdown_at,
  updated_at
FROM protocol_runtime_before_0014;

DROP TABLE protocol_runtime_before_0014;
