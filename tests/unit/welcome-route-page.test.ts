import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

type RouteState = {
  surface: 'checking' | 'error' | 'v1' | 'v2'
  capability: unknown
  errorMessage: string
}

type Listener = () => void

function fakeEventTarget() {
  const listeners = new Map<string, Set<Listener>>()
  return {
    addEventListener(type: string, listener: Listener) {
      const group = listeners.get(type) ?? new Set<Listener>()
      group.add(listener)
      listeners.set(type, group)
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener)
    },
    dispatch(type: string) {
      for (const listener of listeners.get(type) ?? []) listener()
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0
    },
  }
}

const componentPath = fileURLToPath(
  new URL('../../frontend/src/pages/student/WelcomeRoutePage.vue', import.meta.url),
)
const componentSource = readFileSync(componentPath, 'utf8')
const controllerSource = componentSource.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1]

if (!controllerSource) throw new Error('WelcomeRoutePage controller script is missing.')

const controllerModule = await import(
  `data:text/javascript;base64,${Buffer.from(controllerSource).toString('base64')}`
)
const createWelcomeRouteController = controllerModule.createWelcomeRouteController as Function

function activeCapability(resetEpoch = 1) {
  return { active: true, resetEpoch }
}

describe('welcome route capability recovery', () => {
  it('shows an explicit retry control in the error state', () => {
    expect(componentSource).toMatch(
      /<button[\s\S]*v-if="surface === 'error'"[\s\S]*@click="retryCapabilityCheck"[\s\S]*>\s*重试\s*<\/button>/,
    )
  })

  it('retries a transient discovery failure on online without falling back to v1', async () => {
    const eventTarget = fakeEventTarget()
    const states: RouteState[] = []
    const discover = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(activeCapability())
    const handshake = vi.fn().mockResolvedValue(activeCapability())
    const controller = createWelcomeRouteController({
      eventTarget,
      discover,
      handshake,
      isRuntimeActive: (value: { active?: boolean }) => value?.active === true,
      formatError: () => '网络暂时不可用，请重试。',
      commit: (state: RouteState) => states.push(state),
    })

    await controller.mount()
    expect(states.at(-1)).toMatchObject({
      surface: 'error',
      errorMessage: '网络暂时不可用，请重试。',
    })

    eventTarget.dispatch('online')
    await vi.waitFor(() => expect(discover).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(states.at(-1)?.surface).toBe('v2'))

    expect(handshake).toHaveBeenCalledWith({
      clientSurface: 'WELCOME',
      clientBuild: 'v2-08-welcome',
    })
    expect(states.some((state) => state.surface === 'v1')).toBe(false)
    controller.unmount()
  })

  it('supports an explicit retry after failure', async () => {
    const states: RouteState[] = []
    const discover = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(activeCapability())
    const controller = createWelcomeRouteController({
      eventTarget: fakeEventTarget(),
      discover,
      handshake: vi.fn().mockResolvedValue(activeCapability()),
      isRuntimeActive: (value: { active?: boolean }) => value?.active === true,
      formatError: () => '暂时无法连接。',
      commit: (state: RouteState) => states.push(state),
    })

    await controller.mount()
    await controller.retry()

    expect(states.at(-1)?.surface).toBe('v2')
    expect(discover).toHaveBeenCalledTimes(2)
    controller.unmount()
  })

  it('retries a transient handshake failure online and never selects v1', async () => {
    const eventTarget = fakeEventTarget()
    const states: RouteState[] = []
    const handshake = vi
      .fn()
      .mockRejectedValueOnce(new Error('handshake interrupted'))
      .mockResolvedValueOnce(activeCapability())
    const controller = createWelcomeRouteController({
      eventTarget,
      discover: vi.fn().mockResolvedValue(activeCapability()),
      handshake,
      isRuntimeActive: (value: { active?: boolean }) => value?.active === true,
      formatError: () => '握手暂时失败，请重试。',
      commit: (state: RouteState) => states.push(state),
    })

    await controller.mount()
    expect(states.at(-1)?.surface).toBe('error')

    eventTarget.dispatch('online')
    await vi.waitFor(() => expect(handshake).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(states.at(-1)?.surface).toBe('v2'))

    expect(states.some((state) => state.surface === 'v1')).toBe(false)
    controller.unmount()
  })

  it('removes online recovery and ignores a pending result after unmount', async () => {
    const eventTarget = fakeEventTarget()
    const states: RouteState[] = []
    let resolveDiscovery!: (value: unknown) => void
    const discovery = new Promise((resolve) => {
      resolveDiscovery = resolve
    })
    const discover = vi.fn().mockReturnValue(discovery)
    const controller = createWelcomeRouteController({
      eventTarget,
      discover,
      handshake: vi.fn(),
      isRuntimeActive: (value: { active?: boolean }) => value?.active === true,
      formatError: () => '不应提交此错误。',
      commit: (state: RouteState) => states.push(state),
    })

    const pendingMount = controller.mount()
    expect(eventTarget.listenerCount('online')).toBe(1)
    controller.unmount()
    expect(eventTarget.listenerCount('online')).toBe(0)

    resolveDiscovery(activeCapability())
    await pendingMount
    eventTarget.dispatch('online')
    await Promise.resolve()

    expect(states.map((state) => state.surface)).toEqual(['checking'])
    expect(discover).toHaveBeenCalledOnce()
  })
})
