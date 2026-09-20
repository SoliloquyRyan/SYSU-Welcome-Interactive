<script>
export function createWelcomeRouteController({
  eventTarget,
  discover,
  handshake,
  isRuntimeActive,
  formatError,
  commit,
}) {
  let mounted = false
  let inFlight = false
  let generation = 0
  let currentSurface = 'checking'

  function isCurrent(attempt) {
    return mounted && attempt === generation
  }

  function commitCurrent(attempt, state) {
    if (!isCurrent(attempt)) return false
    currentSurface = state.surface
    commit(state)
    return true
  }

  async function retry() {
    if (!mounted || inFlight) return false

    const attempt = ++generation
    inFlight = true
    commitCurrent(attempt, {
      surface: 'checking',
      capability: null,
      errorMessage: '',
    })

    try {
      const discoveredCapability = await discover()
      if (!isCurrent(attempt)) return false

      if (!isRuntimeActive(discoveredCapability)) {
        commitCurrent(attempt, {
          surface: 'v1',
          capability: discoveredCapability,
          errorMessage: '',
        })
        return true
      }

      const handshakeResult = await handshake({
        clientSurface: 'WELCOME',
        clientBuild: 'v2-08-welcome',
      })
      if (!isCurrent(attempt)) return false
      if (
        !isRuntimeActive(handshakeResult)
        || handshakeResult.resetEpoch !== discoveredCapability.resetEpoch
      ) {
        throw new Error('手机端握手与能力发现不一致。')
      }

      commitCurrent(attempt, {
        surface: 'v2',
        capability: discoveredCapability,
        errorMessage: '',
      })
      return true
    } catch (error) {
      commitCurrent(attempt, {
        surface: 'error',
        capability: null,
        errorMessage: formatError(error),
      })
      return false
    } finally {
      if (attempt === generation) inFlight = false
    }
  }

  function handleOnline() {
    if (currentSurface === 'error') void retry()
  }

  function mount() {
    if (mounted) return false
    mounted = true
    eventTarget.addEventListener('online', handleOnline)
    return retry()
  }

  function unmount() {
    if (!mounted) return
    mounted = false
    generation += 1
    inFlight = false
    eventTarget.removeEventListener('online', handleOnline)
  }

  return { mount, retry, unmount }
}
</script>

<script setup>
import '../../styles/mobile-font.css'
import '../../styles/phone-typography.css'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import WelcomePage from './WelcomePage.vue'
import V2WelcomeExperience from './V2WelcomeExperience.vue'
import { protocolCapabilityApi, publicErrorMessage } from '../../services/api'
import { isV2RuntimeActive } from '../../services/protocol-compatibility'

const surface = ref('checking')
const capability = ref(null)
const errorMessage = ref('')
const bootFallbackCapability = Object.freeze({
  protocolVersion: '2',
  contractVersion: '2',
  activeRuntimeVersion: '2',
  activationState: 'ACTIVE',
  resetEpoch: 1,
  serverTime: new Date().toISOString(),
  endpoints: { v2Handshake: '/api/v2/handshake', v2Realtime: '/ws/v2' },
  capabilities: {
    snapshotFirst: true,
    splitStreams: true,
    v1WriteAcceptedByV2: false,
    v2BusinessWrites: true,
    v2RealtimeEvents: true,
    v2Snapshots: true,
  },
})
let bootFallbackTimer = null

const controller = createWelcomeRouteController({
  eventTarget: window,
  discover: () => protocolCapabilityApi.discover(),
  handshake: (input) => protocolCapabilityApi.handshake(input),
  isRuntimeActive: isV2RuntimeActive,
  formatError: publicErrorMessage,
  commit: (next) => {
    // A late compatibility-check error must not tear down the usable V2
    // entry shell after the network fallback has already rendered it.
    if (surface.value === 'v2' && next.surface === 'error') return
    surface.value = next.surface
    capability.value = next.capability
    errorMessage.value = next.errorMessage
  },
})

function retryCapabilityCheck() {
  void controller.retry()
}

onMounted(() => {
  void controller.mount()
  bootFallbackTimer = window.setTimeout(() => {
    if (surface.value === 'checking') {
      surface.value = 'v2'
      capability.value = bootFallbackCapability
      errorMessage.value = ''
    }
  }, 3000)
})
onBeforeUnmount(() => {
  if (bootFallbackTimer !== null) window.clearTimeout(bootFallbackTimer)
  bootFallbackTimer = null
  controller.unmount()
})
</script>

<template>
  <V2WelcomeExperience v-if="surface === 'v2'" :capability="capability" />
  <WelcomePage v-else-if="surface === 'v1'" />
  <section
    v-else
    class="welcome-route-state"
    :role="surface === 'error' ? 'alert' : 'status'"
  >
    <span aria-hidden="true" class="route-star">✦</span>
    <p>{{ surface === 'error' ? errorMessage : '正在确认手机端协议…' }}</p>
    <button
      v-if="surface === 'error'"
      class="welcome-route-retry"
      type="button"
      @click="retryCapabilityCheck"
    >
      重试
    </button>
  </section>
</template>

<style scoped>
.welcome-route-state{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;width:min(100%,430px);height:100dvh;margin:auto;padding:24px;color:#f2f6ff;background:linear-gradient(180deg,#17152588,#101321c9),url('../../assets/star-city/phone-mist-city.svg') center/cover;text-align:center}
.welcome-route-retry{min-width:112px;min-height:44px;border:1px solid rgba(136,196,255,.72);border-radius:999px;padding:10px 24px;color:#f7fbff;background:#123763;font:inherit;font-weight:700;cursor:pointer}
.welcome-route-retry:focus-visible{outline:3px solid #b8dcff;outline-offset:3px}
.route-star{font-size:44px;color:#c6b6df;line-height:1}
</style>
