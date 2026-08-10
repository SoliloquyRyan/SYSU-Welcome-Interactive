import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'

interface SanitizedTestResult {
  project: string
  browserVersion: string
  title: string
  status: TestResult['status']
  durationMs: number
  failureCheckpoint?: string
}

const require = createRequire(import.meta.url)
const playwrightPackage = require('@playwright/test/package.json') as {
  version: string
}

function pnpmVersion(): string {
  const match = process.env.npm_config_user_agent?.match(/(?:^|\s)pnpm\/([^\s]+)/u)
  return match?.[1] ?? 'unknown'
}

export default class SanitizedReporter implements Reporter {
  private startedAt = ''
  private results: SanitizedTestResult[] = []

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.startedAt = new Date().toISOString()
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const failureCheckpoint = test.annotations.find(
      (annotation) => annotation.type === 'failure-checkpoint',
    )?.description
    this.results.push({
      project: test.parent.project()?.name ?? 'unknown',
      browserVersion:
        test.annotations.find(
          (annotation) => annotation.type === 'browser-version',
        )?.description ?? 'unknown',
      title: test.title,
      status: result.status,
      durationMs: result.duration,
      ...(failureCheckpoint ? { failureCheckpoint } : {}),
    })
  }

  onEnd(result: FullResult): void {
    const reportPath = path.resolve('tests', 'reports', 'g3-browser.json')
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(
      reportPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          startedAt: this.startedAt,
          finishedAt: new Date().toISOString(),
          status: result.status,
          total: this.results.length,
          environment: {
            platform: process.platform,
            release: os.release(),
            architecture: process.arch,
            node: process.version,
            pnpm: pnpmVersion(),
            playwright: playwrightPackage.version,
          },
          tests: this.results,
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
  }
}
