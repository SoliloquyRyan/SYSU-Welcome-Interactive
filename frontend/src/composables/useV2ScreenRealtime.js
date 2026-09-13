import { onBeforeUnmount, ref } from 'vue'
import { applicationPath } from '../services/application-path'

function socketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${applicationPath('/ws/v2')}`
}

export function useV2ScreenRealtime({ snapshot, refresh, onLiveEvent }) {
  const state = ref('idle')
  const lastError = ref('')
  let socket = null
  let stopped = false
  let retryTimer = null
  let generation = 0

  function stop() {
    generation += 1
    stopped = true
    clearTimeout(retryTimer)
    retryTimer = null
    const previous = socket
    socket = null
    if (previous?.readyState < WebSocket.CLOSING) previous.close(1000, 'screen unmounted')
    state.value = 'idle'
  }

  function schedule() {
    if (stopped || retryTimer) return
    state.value = 'reconnecting'
    retryTimer = window.setTimeout(() => {
      retryTimer = null
      void connect()
    }, 1000)
  }

  async function resyncAndClose(next, message = '') {
    if (message) lastError.value = message
    try { await refresh({ reconnect: true }) } catch (error) {
      lastError.value = error?.message ?? '大屏权威状态同步失败'
    }
    next.close()
  }

  async function connect() {
    stop()
    stopped = false
    const ownGeneration = generation
    state.value = 'syncing'
    try {
      await refresh({ reconnect: true })
      if (stopped || generation !== ownGeneration) return
    } catch (error) {
      lastError.value = error?.message ?? '大屏权威状态同步失败'
      schedule()
      return
    }
    const baseline = snapshot.value
    if (!baseline) return
    const next = new WebSocket(socketUrl())
    socket = next
    let subscribed = false
    next.addEventListener('open', () => {
      next.send(JSON.stringify({
        type: 'HELLO', protocolVersion: '2', clientSurface: 'SCREEN', clientBuild: 'v2-07-screen',
      }))
    })
    next.addEventListener('message', async ({ data }) => {
      if (next !== socket) return
      let frame
      try { frame = JSON.parse(data) } catch {
        await resyncAndClose(next, '实时消息格式无效')
        return
      }
      if (frame.type === 'HELLO_ACK') {
        next.send(JSON.stringify({
          type: 'SUBSCRIBE', protocolVersion: '2', resetEpoch: baseline.resetEpoch,
          streams: [{ streamId: 'public', streamSeq: baseline.publicSeq }],
        }))
        return
      }
      if (frame.type === 'SUBSCRIBED') {
        subscribed = true
        state.value = 'online'
        lastError.value = ''
        return
      }
      if (frame.type === 'ERROR') {
        await resyncAndClose(next, frame.error?.message ?? '实时连接被拒绝')
        return
      }
      if (!subscribed || frame.protocolVersion !== '2' || frame.streamId !== 'public') return
      const current = snapshot.value
      if (!current || frame.resetEpoch !== current.resetEpoch) {
        await resyncAndClose(next, '运行代际已更新')
        return
      }
      if (frame.streamSeq <= current.publicSeq) return
      if (frame.streamSeq !== current.publicSeq + 1) {
        await resyncAndClose(next, '实时序列出现缺口，正在重取快照')
        return
      }
      await onLiveEvent(frame)
    })
    next.addEventListener('close', () => {
      if (next !== socket) return
      socket = null
      if (!stopped) schedule()
    })
    next.addEventListener('error', () => { lastError.value = '实时连接中断' })
  }

  onBeforeUnmount(stop)
  return { state, lastError, connect, stop }
}
