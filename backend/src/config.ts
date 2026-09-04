import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { z } from 'zod'

export const BACKEND_ROOT = fileURLToPath(new URL('..', import.meta.url))

const EnvironmentSchema = z.object({
  DEMO_BACKEND_HOST: z.string().min(1).default('127.0.0.1'),
  DEMO_BACKEND_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DEMO_DATABASE_PATH: z.string().min(1).default('.data/demo.sqlite'),
  DEMO_SEED_MANIFEST_PATH: z
    .string()
    .min(1)
    .default('.data/demo-seed-manifest.json'),
  DEMO_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://127.0.0.1:5173'),
  DEMO_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DEMO_SECURE_COOKIES: z.enum(['0', '1']).default('0'),
  DEMO_TRUST_LOOPBACK_PROXY: z.enum(['0', '1']).default('0'),
  DEMO_SEED_PARTICIPANT_COUNT: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000)
    .default(300),
})

export interface AppConfig {
  host: string
  port: number
  databasePath: string
  seedManifestPath: string
  migrationsPath: string
  allowedOrigins: string[]
  logLevel: string
  seedParticipantCount: number
  secureCookies?: boolean
  trustLoopbackProxy?: boolean
}

function resolveBackendPath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(BACKEND_ROOT, value)
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = EnvironmentSchema.parse(environment)
  const allowedOrigins = parsed.DEMO_ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin)

  return {
    host: parsed.DEMO_BACKEND_HOST,
    port: parsed.DEMO_BACKEND_PORT,
    databasePath: resolveBackendPath(parsed.DEMO_DATABASE_PATH),
    seedManifestPath: resolveBackendPath(parsed.DEMO_SEED_MANIFEST_PATH),
    migrationsPath: path.resolve(BACKEND_ROOT, 'migrations'),
    allowedOrigins: [...new Set(allowedOrigins)],
    logLevel: parsed.DEMO_LOG_LEVEL,
    seedParticipantCount: parsed.DEMO_SEED_PARTICIPANT_COUNT,
    secureCookies: parsed.DEMO_SECURE_COOKIES === '1',
    trustLoopbackProxy: parsed.DEMO_TRUST_LOOPBACK_PROXY === '1',
  }
}
