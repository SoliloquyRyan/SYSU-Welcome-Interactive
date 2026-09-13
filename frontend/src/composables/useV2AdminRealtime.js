import { onBeforeUnmount, ref } from 'vue'
import { applicationPath } from '../services/application-path'

function socketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${applicationPath('/ws/v2')}`
}

export function useV2AdminRealtime({ snapshot, refresh }) {
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
    if (previous?.readyState < WebSocket.CLOSING) previous.close(1000, 'admin session ended')
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

  async function connect() {
    stop()
    stopped = false
    const ownGeneration = generation
    state.value = 'syncing'
    try {
      await refresh()
      if (stopped || generation !== ownGeneration) return
    } catch (error) {
      lastError.value = error?.message ?? '后台状态同步失败'
      schedule()
      return
    }
    const current = snapshot.value
    if (!current) return
    const next = new WebSocket(socketUrl())
    socket = next
    let helloAcknowledged = false
    let subscribed = false
    let failedClosed = false
    let frameQueue = Promise.resolve()
    const failClosed = async (message) => {
      if (next !== socket || failedClosed) return
      failedClosed = true
      subscribed = false
      state.value = 'syncing'
      lastError.value = message
      try {
        await refresh()
      } catch (error) {
        if (next !== socket) return
        lastError.value = error?.message ?? message
      }
      if (next !== socket) return
      if (next.readyState < WebSocket.CLOSING) next.close(1012, 'admin realtime resync')
    }
    next.addEventListener('open', () => {
      next.send(JSON.stringify({
        type: 'HELLO', protocolVersion: '2', clientSurface: 'ADMIN', clientBuild: 'v2-07-admin',
      }))
    })
    next.addEventListener('message', ({ data }) => {
      frameQueue = frameQueue.then(async () => {
        if (next !== socket || failedClosed) return
        let frame
        try { frame = JSON.parse(data) } catch { await failClosed('实时消息格式无效'); return }
        if (frame.type === 'HELLO_ACK') {
          if (helloAcknowledged || subscribed || frame.protocolVersion !== '2') {
            await failClosed('实时握手协议无效，正在重取权威快照')
            return
          }
          helloAcknowledged = true
          next.send(JSON.stringify({
            type: 'SUBSCRIBE', protocolVersion: '2', resetEpoch: current.resetEpoch,
            streams: [
              { streamId: 'public', streamSeq: current.publicSeq },
              { streamId: 'admin', streamSeq: current.adminSeq },
            ],
          }))
          return
        }
        if (frame.type === 'SUBSCRIBED') {
          if (
            !helloAcknowledged
            || subscribed
            || frame.protocolVersion !== '2'
            || frame.resetEpoch !== current.resetEpoch
          ) {
            await failClosed('实时订阅确认无效，正在重取权威快照')
            return
          }
          subscribed = true
          state.value = 'online'
          lastError.value = ''
          return
        }
        if (frame.type === 'ERROR') {
          await failClosed(frame.error?.message ?? '实时连接被拒绝')
          return
        }
        if (
          !subscribed
          || frame.protocolVersion !== '2'
          || !['public', 'admin'].includes(frame.streamId)
          || !Number.isSafeInteger(frame.streamSeq)
          || frame.streamSeq < 0
        ) {
          await failClosed('实时协议帧无效，正在重取权威快照')
          return
        }
        if (frame.resetEpoch !== snapshot.value?.resetEpoch) {
          await failClosed('运行代际已经更新，正在重取权威快照')
          return
        }
        const cursor = frame.streamId === 'public' ? snapshot.value.publicSeq : snapshot.value.adminSeq
        if (frame.streamSeq <= cursor) return
        if (frame.streamSeq !== cursor + 1) {
          await failClosed('实时序列出现缺口，正在重取权威快照')
          return
        }
        await refresh()
        if (next !== socket || failedClosed) return
        const refreshedCursor = frame.streamId === 'public'
          ? snapshot.value?.publicSeq
          : snapshot.value?.adminSeq
        if (!Number.isSafeInteger(refreshedCursor) || refreshedCursor < frame.streamSeq) {
          await failClosed('权威快照未追平实时事件，正在重新连接')
        }
      }).catch((error) => {
        if (next !== socket) return
        return failClosed(error?.message ?? '实时状态处理失败')
      })
    })
    next.addEventListener('close', () => {
      if (next !== socket) return
      socket = null
      if (!stopped) schedule()
    })
    next.addEventListener('error', () => {
      lastError.value = '实时连接中断'
    })
  }

  onBeforeUnmount(stop)
  return { state, lastError, connect, stop }
}
