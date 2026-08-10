import os from 'node:os'
import path from 'node:path'

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: path.join(os.tmpdir(), 'sysu-welcome-playwright-output'),
  reporter: [['./tests/e2e/reporters/sanitized-reporter.ts']],
  use: {
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium-ci',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
      },
    },
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        channel: 'chrome',
      },
    },
    {
      name: 'msedge',
      use: {
        ...devices['Desktop Edge'],
        browserName: 'chromium',
        channel: 'msedge',
      },
    },
  ],
})
