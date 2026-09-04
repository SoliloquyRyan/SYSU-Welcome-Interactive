import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { prepareFormalRuntime } from '../../scripts/formal-runtime.mjs'

describe('D-056 formal runtime environment', () => {
  let temporaryDirectory: string
  let repositoryRoot: string
  let runtimeDirectory: string

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sysu-welcome-formal-runtime-'),
    )
    repositoryRoot = path.join(temporaryDirectory, 'repository')
    runtimeDirectory = path.join(temporaryDirectory, 'runtime')
    fs.mkdirSync(repositoryRoot)
    fs.mkdirSync(runtimeDirectory, { mode: 0o700 })
    fs.writeFileSync(path.join(runtimeDirectory, '2026-roster.sqlite'), 'sqlite', {
      mode: 0o600,
    })
    fs.writeFileSync(
      path.join(runtimeDirectory, '2026-runtime-secret.json'),
      JSON.stringify({ profile: 'PROTECTED_ROSTER', participantCount: 220 }),
      { mode: 0o600 },
    )
    fs.writeFileSync(path.join(runtimeDirectory, '2026-nfc-map.csv'), 'synthetic', {
      mode: 0o600,
    })
  })

  afterEach(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  it('prepares an external production runtime with HTTPS and fail-closed cookie/proxy flags', () => {
    const result = prepareFormalRuntime({
      repositoryRoot,
      environment: {
        FORMAL_RUNTIME_DIR: runtimeDirectory,
        FORMAL_PUBLIC_ORIGIN: 'https://welcome.example.edu.cn',
      },
      mode: 'production',
      platform: process.platform,
    })

    expect(result).toMatchObject({
      participantCount: 220,
      publicOrigin: 'https://welcome.example.edu.cn',
    })
    expect(result.environment).toMatchObject({
      NODE_ENV: 'production',
      DEMO_BACKEND_HOST: '127.0.0.1',
      DEMO_ALLOWED_ORIGINS: 'https://welcome.example.edu.cn',
      DEMO_SECURE_COOKIES: '1',
      DEMO_TRUST_LOOPBACK_PROXY: '1',
      VITE_DATA_PROFILE: 'PROTECTED',
    })
  })

  it.each([
    [{ FORMAL_PUBLIC_ORIGIN: 'http://welcome.example.edu.cn' }, /HTTPS origin/],
    [{ FORMAL_PUBLIC_ORIGIN: 'https://welcome.example.edu.cn/event' }, /HTTPS origin/],
    [
      {
        FORMAL_PUBLIC_ORIGIN: 'https://welcome.example.edu.cn',
        DEMO_BACKEND_HOST: '0.0.0.0',
      },
      /loopback/,
    ],
    [
      {
        FORMAL_PUBLIC_ORIGIN: 'https://welcome.example.edu.cn',
        DEMO_SECURE_COOKIES: '0',
      },
      /DEMO_SECURE_COOKIES/,
    ],
  ])('rejects unsafe production configuration %#', (overrides, expected) => {
    expect(() =>
      prepareFormalRuntime({
        repositoryRoot,
        environment: {
          FORMAL_RUNTIME_DIR: runtimeDirectory,
          ...overrides,
        },
        mode: 'production',
        platform: process.platform,
      }),
    ).toThrowError(expected)
  })

  it('rejects production data stored inside the code checkout', () => {
    const nestedRuntime = path.join(repositoryRoot, 'backend', '.private')
    fs.mkdirSync(nestedRuntime, { recursive: true })
    for (const filename of [
      '2026-roster.sqlite',
      '2026-runtime-secret.json',
      '2026-nfc-map.csv',
    ]) {
      fs.copyFileSync(path.join(runtimeDirectory, filename), path.join(nestedRuntime, filename))
    }

    expect(() =>
      prepareFormalRuntime({
        repositoryRoot,
        environment: {
          FORMAL_RUNTIME_DIR: nestedRuntime,
          FORMAL_PUBLIC_ORIGIN: 'https://welcome.example.edu.cn',
        },
        mode: 'production',
        platform: process.platform,
      }),
    ).toThrowError(/代码目录之外/)
  })

  it('rejects group-readable POSIX formal files before startup', () => {
    fs.chmodSync(path.join(runtimeDirectory, '2026-nfc-map.csv'), 0o640)

    expect(() =>
      prepareFormalRuntime({
        repositoryRoot,
        environment: {
          FORMAL_RUNTIME_DIR: runtimeDirectory,
          FORMAL_PUBLIC_ORIGIN: 'https://welcome.example.edu.cn',
        },
        mode: 'production',
        platform: 'linux',
      }),
    ).toThrowError(/权限过宽/)
  })
})
