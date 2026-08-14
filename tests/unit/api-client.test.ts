import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiRequest } from '../../frontend/src/services/api.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('frontend API recovery metadata', () => {
  it('preserves v2 reset and snapshot recovery hints on failed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'error',
      protocolVersion: '2',
      resetEpoch: 9,
      error: {
        code: 'REVISION_CONFLICT',
        message: '请先恢复权威状态。',
        requestId: 'request-mobile-recovery',
        retryable: false,
      },
      recovery: {
        snapshotRequired: true,
        scope: 'ALL_AUTHORIZED',
      },
    }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    })))

    let thrown: unknown
    try {
      await apiRequest('/api/v2/participant/commands')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ApiError)
    expect(thrown).toMatchObject({
      code: 'REVISION_CONFLICT',
      status: 409,
      requestId: 'request-mobile-recovery',
      retryable: false,
      resetEpoch: 9,
      recovery: { snapshotRequired: true, scope: 'ALL_AUTHORIZED' },
    })
  })

  it('preserves an explicit caller abort so stale snapshot work can be discarded silently', async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new DOMException('cancelled by session change', 'AbortError'),
    ))

    await expect(apiRequest('/api/v2/participant/snapshot', {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('keeps the internal timeout when a caller signal is present but never aborts', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_path, options) => (
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(new DOMException('request timed out', 'AbortError'))
        }, { once: true })
      })
    )))

    const request = apiRequest('/api/v2/participant/snapshot', {
      signal: controller.signal,
    })
    const rejection = expect(request).rejects.toMatchObject({
      name: 'ApiError',
      code: 'SERVICE_UNAVAILABLE',
    })
    await vi.advanceTimersByTimeAsync(15_000)

    await rejection
    expect(controller.signal.aborted).toBe(false)
  })

  it('keeps the timeout active while an already-started JSON response body stalls', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_path, options) => Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(new DOMException('response body timed out', 'AbortError'))
        }, { once: true })
      }),
    })))

    const request = apiRequest('/api/v2/participant/snapshot', {
      signal: controller.signal,
    })
    const rejection = expect(request).rejects.toMatchObject({
      name: 'ApiError',
      code: 'SERVICE_UNAVAILABLE',
    })
    await vi.advanceTimersByTimeAsync(15_000)

    await rejection
    expect(controller.signal.aborted).toBe(false)
  })
})
