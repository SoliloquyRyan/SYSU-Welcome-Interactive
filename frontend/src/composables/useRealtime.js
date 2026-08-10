import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createConnectGate } from '../services/connect-gate'

const RETRY_DELAYS = [500, 1000, 2000, 4000, 8000, 10000]

const VISIBLE_EVENT_STREAMS = Object.freeze({
  public: new Set(['public', 'screen']),
  screen: new Set(['public', 'screen']),
  participant: new Set(['public', 'screen', 'participant']),
  admin: new Set(['public', 'screen', 'admin']),
})

export function isEventVisibleToRealtimeAccess(accessStream, eventStream) {
  return VISIBLE_EVENT_STREAMS[accessStream]?.has(eventStream) ?? false
}

function websocketUrl(stream, resetEpoch, afterEventSeq) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL(`${protocol}//${window.location.host}/ws`)
  url.searchParams.set('stream', stream)
  url.searchParams.set('resetEpoch', String(resetEpoch ?? 1))
  url.searchParams.set('afterEventSeq', String(afterEventSeq ?? 0))
  return url.toString()
}

export function useRealtime({ stream, resync, onEvent, enabled = true }) {
  const state = ref('idle')
  const synced = ref(false)
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
  const lastError = ref('')
  const lastEventSeq = ref(0)
  const resetEpoch = ref(null)

  let socket = null
  let stopped = false
  let retryIndex = 0
  let retryTimer = null
  const connectGate = createConnectGate()
  let eventQueue = Promise.resolve()

  const isEnabled = () =>
    typeof enabled === 'object' && enabled !== null ? enabled.value : enabled

  const canWrite = computed(
    () => online.value && synced.value && state.value === 'online',
  )

  function acceptSnapshot(snapshot) {
    const runtime = snapshot?.runtime ?? snapshot
    resetEpoch.value = runtime?.resetEpoch ?? resetEpoch.value ?? 1
    lastEventSeq.value = Number(snapshot?.eventSeq ?? 0)
  }

  function detachSocket(reason = 'resync') {
    const previous = socket
    socket = null
    if (previous && previous.readyState < WebSocket.CLOSING) {
      previous.close(1000, reason)
    }
  }

  function scheduleReconnect() {
    if (stopped || !online.value || retryTimer || !isEnabled()) return
    synced.value = false
    state.value = 'reconnecting'
    const base = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)]
    const delay = Math.round(base * (0.9 + Math.random() * 0.2))
    retryIndex += 1
    retryTimer = window.setTimeout(() => {
      retryTimer = null
      connect('RECONNECT')
    }, delay)
  }

  async function restart(reason) {
    if (stopped || !isEnabled()) return
    synced.value = false
    detachSocket('resync')
    await connect(reason)
  }

  async function handleMessage(message, sourceSocket) {
    if (sourceSocket !== socket || !synced.value || state.value !== 'online') return

    let event
    try {
      event = JSON.parse(message.data)
    } catch {
      await restart('INVALID_EVENT')
      return
    }

    if (!event || event.protocolVersion !== '1') return
    if (event.type === 'resync.required') {
      await restart(event.payload?.reason ?? 'SERVER_REQUEST')
      return
    }
    if (resetEpoch.value !== null && event.resetEpoch < resetEpoch.value) return
    if (resetEpoch.value !== null && event.resetEpoch > resetEpoch.value) {
      await restart('EPOCH_CHANGED')
      return
    }
    if (!isEventVisibleToRealtimeAccess(stream, event.stream)) return

    const sequence = Number(event.eventSeq)
    if (!Number.isSafeInteger(sequence) || sequence < 0) {
      await restart('INVALID_SEQUENCE')
      return
    }
    if (sequence <= lastEventSeq.value) return
    if (sequence !== lastEventSeq.value + 1) {
      await restart('EVENT_GAP')
      return
    }

    lastEventSeq.value = sequence
    resetEpoch.value = event.resetEpoch
    try {
      await onEvent?.(event)
    } catch (error) {
      lastError.value = error?.message ?? '实时事件应用失败'
      await restart('EVENT_APPLY_FAILED')
    }
  }

  async function connect(reason = 'INITIAL') {
    if (stopped || !online.value || !isEnabled()) return
    if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return
    if (!connectGate.enter()) return

    synced.value = false
    state.value = 'syncing'
    try {
      const snapshot = await resync(reason)
      if (!snapshot || stopped || !isEnabled()) return
      acceptSnapshot(snapshot)

      const nextSocket = new WebSocket(
        websocketUrl(stream, resetEpoch.value, lastEventSeq.value),
      )
      socket = nextSocket
      nextSocket.addEventListener('open', () => {
        if (nextSocket !== socket) return
        retryIndex = 0
        lastError.value = ''
        synced.value = true
        state.value = 'online'
      })
      nextSocket.addEventListener('message', (message) => {
        eventQueue = eventQueue
          .then(() => handleMessage(message, nextSocket))
          .catch(async (error) => {
            lastError.value = error?.message ?? '实时事件处理失败'
            await restart('EVENT_PROCESSING_FAILED')
          })
      })
      nextSocket.addEventListener('close', () => {
        if (nextSocket !== socket) return
        socket = null
        synced.value = false
        if (!stopped) scheduleReconnect()
      })
      nextSocket.addEventListener('error', () => {
        if (nextSocket !== socket) return
        lastError.value = '实时连接中断'
      })
    } catch (error) {
      lastError.value = error?.message ?? '状态同步失败'
      scheduleReconnect()
    } finally {
      if (connectGate.leave() && !stopped && online.value && isEnabled()) {
        void connect('PENDING')
      }
    }
  }

  function handleOffline() {
    online.value = false
    synced.value = false
    state.value = 'offline'
    detachSocket('offline')
  }

  function handleOnline() {
    online.value = true
    retryIndex = 0
    void connect('ONLINE')
  }

  function handleVisibility() {
    if (document.visibilityState === 'visible' && state.value !== 'online') {
      handleOnline()
    }
  }

  onMounted(() => {
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)
    if (isEnabled()) void connect()
  })

  watch(
    () => isEnabled(),
    (value) => {
      if (value) {
        retryIndex = 0
        void connect('ENABLED')
      } else {
        connectGate.cancelPending()
        window.clearTimeout(retryTimer)
        retryTimer = null
        synced.value = false
        state.value = 'idle'
        detachSocket('stream disabled')
      }
    },
  )

  onBeforeUnmount(() => {
    stopped = true
    window.clearTimeout(retryTimer)
    detachSocket('page closed')
    window.removeEventListener('offline', handleOffline)
    window.removeEventListener('online', handleOnline)
    document.removeEventListener('visibilitychange', handleVisibility)
  })

  return {
    state,
    synced,
    online,
    canWrite,
    lastError,
    lastEventSeq,
    resetEpoch,
    resync: restart,
  }
}
