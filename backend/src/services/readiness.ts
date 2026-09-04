import type { ReadyResponse } from '@sysu-welcome/contracts'

import type { AppConfig } from '../config.js'
import { verifyMigrations } from '../db/migrate.js'
import type { SqliteDatabase } from '../db/open-database.js'
import { verifyIdentityDirectory } from '../db/seed.js'
import type { RealtimeHub } from '../realtime/hub.js'

export function readReadiness(
  database: SqliteDatabase,
  config: AppConfig,
  realtime: RealtimeHub,
  requestId: string,
  now: () => Date = () => new Date(),
): ReadyResponse {
  let databaseReady = true
  let migrationReady = false
  let schemaVersion: number | null = null
  let seedReady = false
  let seedVersion: string | null = null
  let seedParticipantCount = 0
  let resetEpoch: number | null = null
  let stageRevision: number | null = null

  try {
    database.prepare('SELECT 1').get()
    const migrations = verifyMigrations(database, config.migrationsPath)
    migrationReady = migrations.ready
    schemaVersion = migrations.currentVersion

    if (migrationReady) {
      const seed = verifyIdentityDirectory(database, {
        manifestPath: config.seedManifestPath,
        participantCount: config.seedParticipantCount,
      })
      seedReady = seed.ready
      seedVersion = seed.seedVersion
      seedParticipantCount = seed.participantCount

      const state = database
        .prepare(
          `SELECT a.reset_epoch AS resetEpoch,
                  r.stage_revision AS stageRevision
           FROM app_state a
           CROSS JOIN runtime_state r
           WHERE a.id = 1 AND r.id = 1`,
        )
        .get() as
        | { resetEpoch: number; stageRevision: number }
        | undefined
      resetEpoch = state?.resetEpoch ?? null
      stageRevision = state?.stageRevision ?? null
    }
  } catch {
    databaseReady = false
  }

  const ready =
    databaseReady && migrationReady && seedReady && realtime.ready

  return {
    status: ready ? 'ready' : 'not_ready',
    service: 'sysu-welcome-backend',
    protocolVersion: '1',
    now: now().toISOString(),
    checks: {
      database: databaseReady ? 'ready' : 'not_ready',
      migrations: migrationReady ? 'ready' : 'not_ready',
      seed: seedReady ? 'ready' : 'not_ready',
      realtime: realtime.ready ? 'ready' : 'not_ready',
    },
    schemaVersion,
    seedVersion,
    seedParticipantCount,
    resetEpoch,
    stageRevision,
    ...(ready
      ? {}
      : {
          error: {
            code: 'SERVICE_UNAVAILABLE' as const,
            message: '服务基础数据尚未就绪，请先完成对应运行配置。',
            requestId,
          },
        }),
  }
}
