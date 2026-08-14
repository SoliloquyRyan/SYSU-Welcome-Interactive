import { expect, test as base } from '@playwright/test'

import {
  startDemoTestStack,
  type DemoTestStack,
} from '../fixtures/demo-stack.js'

interface V2DemoFixtures {
  browserEvidence: void
  demo: DemoTestStack
}

export const test = base.extend<V2DemoFixtures>({
  browserEvidence: [
    async ({ browser }, use, testInfo) => {
      testInfo.annotations.push({
        type: 'browser-version',
        description: browser.version(),
      })
      await use()
    },
    { auto: true },
  ],
  demo: async ({}, use) => {
    const stack = await startDemoTestStack({
      protocolVersion: '2',
      participantCount: 300,
      inProcess: true,
      startupTimeoutMs: 60_000,
    })
    try {
      await use(stack)
    } finally {
      await stack.stop()
    }
  },
})

export { expect }
