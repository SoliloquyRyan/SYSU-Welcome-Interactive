import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  captureInvitationTokenFromUrl,
  takePendingInvitationToken,
} from '../../frontend/src/services/invitation-entry.js'

const VALID_TOKEN = 'A'.repeat(43)

function locationFor(href: string) {
  const url = new URL(href)
  return {
    href: url.href,
    pathname: url.pathname,
  }
}

function historyMock() {
  return {
    state: { source: 'test' },
    replaceState: vi.fn(),
  }
}

describe('invitation entry token capture', () => {
  afterEach(() => {
    takePendingInvitationToken()
  })

  it('captures a valid /welcome token and removes only token from the address', () => {
    const history = historyMock()
    const location = locationFor(
      `https://demo.local/welcome?lang=zh&token=${VALID_TOKEN}&mode=rehearsal#stage-2`,
    )

    const captured = captureInvitationTokenFromUrl({ location, history })

    expect(captured).toBe(VALID_TOKEN)
    expect(history.replaceState).toHaveBeenCalledOnce()
    expect(history.replaceState).toHaveBeenCalledWith(
      history.state,
      '',
      '/welcome?lang=zh&mode=rehearsal#stage-2',
    )
  })

  it('accepts the trailing-slash welcome route', () => {
    const history = historyMock()
    const location = locationFor(
      `https://demo.local/welcome/?token=${VALID_TOKEN}&lang=zh#entry`,
    )

    const captured = captureInvitationTokenFromUrl({ location, history })

    expect(captured).toBe(VALID_TOKEN)
    expect(history.replaceState).toHaveBeenCalledWith(
      history.state,
      '',
      '/welcome/?lang=zh#entry',
    )
  })

  it('uses the configured base path without matching another welcome suffix', () => {
    const matchingHistory = historyMock()
    const captured = captureInvitationTokenFromUrl({
      location: locationFor(
        `https://demo.local/sysu/event/welcome?token=${VALID_TOKEN}&lang=zh`,
      ),
      history: matchingHistory,
      basePath: '/sysu/event/',
    })

    expect(captured).toBe(VALID_TOKEN)
    expect(matchingHistory.replaceState).toHaveBeenCalledWith(
      matchingHistory.state,
      '',
      '/sysu/event/welcome?lang=zh',
    )

    const unrelatedHistory = historyMock()
    expect(
      captureInvitationTokenFromUrl({
        location: locationFor(
          `https://demo.local/another/welcome?token=${'B'.repeat(43)}`,
        ),
        history: unrelatedHistory,
        basePath: '/sysu/event/',
      }),
    ).toBeNull()
    expect(unrelatedHistory.replaceState).not.toHaveBeenCalled()
  })

  it.each([
    '/welcome-preview',
    '/welcome/extra',
    '/not-welcome',
  ])('does not match a different root path: %s', (pathname) => {
    const history = historyMock()

    const captured = captureInvitationTokenFromUrl({
      location: locationFor(
        `https://demo.local${pathname}?token=${VALID_TOKEN}`,
      ),
      history,
    })

    expect(captured).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it('returns a captured token once and clears it from memory', () => {
    const history = historyMock()
    const location = locationFor(
      `https://demo.local/welcome?token=${VALID_TOKEN}`,
    )

    captureInvitationTokenFromUrl({ location, history })

    expect(takePendingInvitationToken()).toBe(VALID_TOKEN)
    expect(takePendingInvitationToken()).toBeNull()
  })

  it('removes an invalid token without retaining it', () => {
    captureInvitationTokenFromUrl({
      location: locationFor(
        `https://demo.local/welcome?token=${VALID_TOKEN}`,
      ),
      history: historyMock(),
    })
    const history = historyMock()
    const location = locationFor(
      'https://demo.local/welcome?token=invalid!&lang=zh#entry',
    )

    const captured = captureInvitationTokenFromUrl({ location, history })

    expect(captured).toBeNull()
    expect(takePendingInvitationToken()).toBeNull()
    expect(history.replaceState).toHaveBeenCalledWith(
      history.state,
      '',
      '/welcome?lang=zh#entry',
    )
  })

  it('does not inspect, rewrite or replace pending state outside /welcome', () => {
    captureInvitationTokenFromUrl({
      location: locationFor(
        `https://demo.local/welcome?token=${VALID_TOKEN}`,
      ),
      history: historyMock(),
    })
    const history = historyMock()
    const location = locationFor(
      `https://demo.local/screen?token=${'B'.repeat(43)}&lang=zh#live`,
    )

    const captured = captureInvitationTokenFromUrl({ location, history })

    expect(captured).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
    expect(takePendingInvitationToken()).toBe(VALID_TOKEN)
  })
})
