import { expect, test as base } from '@playwright/test'

import {
  startDemoTestStack,
  type DemoTestStack,
} from '../fixtures/demo-stack.js'

interface DemoFixtures {
  browserEvidence: void
  demo: DemoTestStack
}

export const test = base.extend<DemoFixtures>({
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
    const stack = await startDemoTestStack({ participantCount: 4 })
    try {
      await use(stack)
    } finally {
      await stack.stop()
    }
  },
})

export { expect }
