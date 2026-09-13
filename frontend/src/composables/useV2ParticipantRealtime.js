import { onBeforeUnmount, ref } from 'vue'
import { applicationPath } from '../services/application-path'

function socketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${applicationPath('/ws/v2')}`
}

const PARTICIPANT_STREAM_ID = /^participant:[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const ACTIVE_CAPABILITY_KEYS = [
  'snapshotFirst',
  'splitStreams',
  'v1WriteAcceptedByV2',
  'v2BusinessWrites',
  'v2RealtimeEvents',
  'v2Snapshots',
]
const EVENT_KEYS = [
  'eventId',
  'name',
  'payload',
  'protocolVersion',
  'resetEpoch',
  'revision',
  'streamId',
  'streamSeq',
]

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function activeCapabilitiesValid(value) {
  return hasExactKeys(value, ACTIVE_CAPABILITY_KEYS)
    && value.v2BusinessWrites === true
    && value.v2Snapshots === true
    && value.v2RealtimeEvents === true
    && value.snapshotFirst === true
    && value.splitStreams === true
    && value.v1WriteAcceptedByV2 === false
}

function activeLifecycleFieldsValid(value) {
  return value.protocolVersion === '2'
    && value.contractVersion === '2'
    && value.activeRuntimeVersion === '2'
    && value.activationState === 'ACTIVE'
}

function isoDateTimeValid(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value))
}

function streamCursorValid(value) {
  return hasExactKeys(value, ['streamId', 'streamSeq'])
    && typeof value.streamId === 'string'
    && isNonNegativeInteger(value.streamSeq)
}

function publicEventRevision(name, payload) {
  if (!isRecord(payload)) return null
  if (
    name === 'runtime.changed'
    && hasExactKeys(payload, ['runtime'])
    && isRecord(payload.runtime)
    && isNonNegativeInteger(payload.runtime.runRevision)
  ) return payload.runtime.runRevision
  if (
    name === 'presentation.changed'
    && hasExactKeys(payload, ['presentation', 'presentationRevision'])
    && isRecord(payload.presentation)
    && isNonNegativeInteger(payload.presentationRevision)
  ) return payload.presentationRevision
  if (
    name === 'star.node.upserted'
    && hasExactKeys(payload, ['star'])
    && isRecord(payload.star)
    && isNonNegativeInteger(payload.star.starRevision)
  ) return payload.star.starRevision
  if (
    name === 'aggregate.changed'
    && hasExactKeys(payload, ['aggregate', 'aggregateRevision', 'projection'])
    && payload.projection === 'PUBLIC_AGGREGATE'
    && isRecord(payload.aggregate)
    && isNonNegativeInteger(payload.aggregateRevision)
  ) return payload.aggregateRevision
  if (
    name === 'barrage.published'
    && hasExactKeys(payload, ['barrage', 'interactionRevision'])
    && isRecord(payload.barrage)
    && isNonNegativeInteger(payload.interactionRevision)
  ) return payload.interactionRevision
  if (
    name === 'barrage.removed'
    && hasExactKeys(payload, ['barrageIds', 'interactionRevision'])
    && Array.isArray(payload.barrageIds)
    && payload.barrageIds.length >= 1
    && payload.barrageIds.length <= 8
    && payload.barrageIds.every((id) => typeof id === 'string' && id.length >= 1 && id.length <= 128)
    && isNonNegativeInteger(payload.interactionRevision)
  ) return payload.interactionRevision
  if (
    name === 'barrage.cleared'
    && hasExactKeys(payload, ['displayBatch', 'interactionRevision'])
    && isNonNegativeInteger(payload.displayBatch)
    && isNonNegativeInteger(payload.interactionRevision)
  ) return payload.interactionRevision
  if (
    name === 'barrage.pause.changed'
    && hasExactKeys(payload, ['interactionRevision', 'paused'])
    && typeof payload.paused === 'boolean'
    && isNonNegativeInteger(payload.interactionRevision)
  ) return payload.interactionRevision
  if (
    name === 'gift.sent'
    && hasExactKeys(payload, ['gift', 'interactionRevision'])
    && isRecord(payload.gift)
    && isNonNegativeInteger(payload.interactionRevision)
  ) return payload.interactionRevision
  if (
    name === 'program.changed'
    && hasExactKeys(payload, ['currentProgram', 'interactionRevision'])
    && (payload.currentProgram === null || isRecord(payload.currentProgram))
    && isNonNegativeInteger(payload.interactionRevision)
  ) return payload.interactionRevision
  if (
    name === 'live.interaction.changed'
    && hasExactKeys(payload, ['interactionRevision', 'liveInteraction'])
    && isRecord(payload.liveInteraction)
    && isNonNegativeInteger(payload.interactionRevision)
  ) return payload.interactionRevision
  return null
}

export function participantHelloAckValid(current, frame) {
  return isRecord(current)
    && hasExactKeys(frame, [
      'activationState',
      'activeRuntimeVersion',
      'capabilities',
      'clientSurface',
      'contractVersion',
      'protocolVersion',
      'resetEpoch',
      'serverTime',
      'type',
    ])
    && frame.type === 'HELLO_ACK'
    && activeLifecycleFieldsValid(frame)
    && frame.clientSurface === 'WELCOME'
    && isPositiveInteger(frame.resetEpoch)
    && frame.resetEpoch === current.resetEpoch
    && isoDateTimeValid(frame.serverTime)
    && activeCapabilitiesValid(frame.capabilities)
}

export function participantSubscriptionStreamsValid(current, streams) {
  if (
    !current
    || typeof current.participantStreamId !== 'string'
    || !PARTICIPANT_STREAM_ID.test(current.participantStreamId)
    || !Array.isArray(streams)
    || streams.length !== 2
  ) return false
  const expected = new Set(['public', current.participantStreamId])
  if (!streams.every(streamCursorValid)) return false
  const received = new Set(streams.map(({ streamId }) => streamId))
  return expected.size === 2
    && received.size === expected.size
    && streams.every(({ streamId }) => expected.has(streamId))
}

export function participantSubscriptionHighWaterValid(requested, streams) {
  if (
    !participantSubscriptionStreamsValid(requested, streams)
    || !isNonNegativeInteger(requested.publicSeq)
    || !isNonNegativeInteger(requested.participantSeq)
  ) return false
  const accepted = new Map(streams.map(({ streamId, streamSeq }) => [streamId, streamSeq]))
  return accepted.get('public') >= requested.publicSeq
    && accepted.get(requested.participantStreamId) >= requested.participantSeq
}

export function participantSubscribedFrameValid(requested, frame) {
  return hasExactKeys(frame, ['protocolVersion', 'resetEpoch', 'streams', 'type'])
    && frame.type === 'SUBSCRIBED'
    && frame.protocolVersion === '2'
    && isPositiveInteger(frame.resetEpoch)
    && frame.resetEpoch === requested?.resetEpoch
    && participantSubscriptionHighWaterValid(requested, frame.streams)
}

export function participantEventFrameValid(current, frame) {
  if (
    !current
    || !PARTICIPANT_STREAM_ID.test(current.participantStreamId ?? '')
    || !hasExactKeys(frame, EVENT_KEYS)
    || frame.protocolVersion !== '2'
    || !isPositiveInteger(frame.resetEpoch)
    || frame.resetEpoch !== current.resetEpoch
    || !isPositiveInteger(frame.streamSeq)
    || !isNonNegativeInteger(frame.revision)
    || typeof frame.eventId !== 'string'
    || frame.eventId.length < 1
    || frame.eventId.length > 128
    || frame.eventId !== `${frame.resetEpoch}:${frame.streamId}:${frame.streamSeq}`
  ) return false

  if (frame.streamId === 'public') {
    return publicEventRevision(frame.name, frame.payload) === frame.revision
  }
  if (frame.streamId !== current.participantStreamId) return false
  return frame.name === 'participant.snapshot.changed'
    && hasExactKeys(frame.payload, ['participantRevision', 'projection', 'requiresSnapshot'])
    && frame.payload.projection === 'SELF'
    && frame.payload.requiresSnapshot === true
    && isNonNegativeInteger(frame.payload.participantRevision)
    && frame.payload.participantRevision === frame.revision
}

export function participantStreamsCaughtUp(current, streams) {
  if (!participantSubscriptionStreamsValid(current, streams)) return false
  return streams.every(({ streamId, streamSeq }) => {
    const currentSeq = streamId === 'public'
      ? current.publicSeq
      : streamId === current.participantStreamId
        ? current.participantSeq
        : -1
    return isNonNegativeInteger(currentSeq) && currentSeq >= streamSeq
  })
}

export function useV2ParticipantRealtime({ snapshot, refresh, onPublicEvent }) {
  const state = ref('idle')
  const lastError = ref('')
  let socket = null
  let stopped = false
  let retryTimer = null
  let generation = 0
  let eventQueue = Promise.resolve()

  function closeSocket(reason = 'participant realtime stopped') {
    const previous = socket
    socket = null
    if (previous?.readyState < WebSocket.CLOSING) previous.close(1000, reason)
  }

  function stop() {
    generation += 1
    stopped = true
    clearTimeout(retryTimer)
    retryTimer = null
    closeSocket()
    state.value = 'idle'
  }

  function suspend(message = '实时连接已暂停') {
    generation += 1
    stopped = true
    clearTimeout(retryTimer)
    retryTimer = null
    closeSocket('participant realtime suspended')
    state.value = 'idle'
    lastError.value = message
  }

  function schedule() {
    if (stopped || retryTimer) return
    if (!navigator.onLine) {
      state.value = 'offline'
      lastError.value = '设备已离线；未确认的内容不会自动提交。'
      return
    }
    state.value = 'reconnecting'
    retryTimer = window.setTimeout(() => {
      retryTimer = null
      void connect()
    }, 1000)
  }

  async function resyncAndClose(next, message) {
    state.value = 'syncing'
    if (message) lastError.value = message
    try {
      await refresh({ reconnect: true })
    } catch (error) {
      lastError.value = error?.message ?? '权威状态同步失败。'
    }
    if (next.readyState < WebSocket.CLOSING) next.close(1012, 'participant resync')
  }

  async function applyFrame(frame, failClosed) {
    const current = snapshot.value
    if (!current || frame.resetEpoch !== current.resetEpoch) {
      await failClosed('运行代际已经更新，请重新核验。')
      return false
    }
    const isPublic = frame.streamId === 'public'
    const isParticipant = frame.streamId === current.participantStreamId
    if (!isPublic && !isParticipant) {
      await failClosed('实时事件流不在当前授权范围内。')
      return false
    }
    const currentSeq = isPublic ? current.publicSeq : current.participantSeq
    if (frame.streamSeq <= currentSeq) return true
    if (frame.streamSeq !== currentSeq + 1) {
      await failClosed('实时序列出现缺口，正在重取权威快照。')
      return false
    }
    if (isParticipant) {
      await refresh({ stream: 'participant' })
      return true
    }
    await onPublicEvent(frame)
    return true
  }

  async function connect() {
    generation += 1
    const ownGeneration = generation
    stopped = false
    lastError.value = ''
    clearTimeout(retryTimer)
    retryTimer = null
    closeSocket('participant reconnect')
    state.value = 'syncing'
    try {
      await refresh({ reconnect: true })
      if (stopped || generation !== ownGeneration) return false
    } catch (error) {
      lastError.value = error?.message ?? '权威状态同步失败。'
      schedule()
      return false
    }
    const baseline = snapshot.value
    if (!baseline) return false
    const requestedStreams = [
      { streamId: 'public', streamSeq: baseline.publicSeq },
      { streamId: baseline.participantStreamId, streamSeq: baseline.participantSeq },
    ]
    if (
      !isPositiveInteger(baseline.resetEpoch)
      || !participantSubscriptionStreamsValid(baseline, requestedStreams)
    ) {
      lastError.value = '权威快照中的实时游标无效。'
      schedule()
      return false
    }
    let deliveredPublicSeq = baseline.publicSeq
    const next = new WebSocket(socketUrl())
    socket = next
    let helloAcknowledged = false
    let subscribed = false
    let failedClosed = false
    let connectionSettled = false
    let acceptedStreams = []
    let resolveConnected
    const failClosed = async (message) => {
      if (failedClosed) return
      failedClosed = true
      subscribed = false
      await resyncAndClose(next, message)
    }
    const markOnlineIfCaughtUp = () => {
      if (
        failedClosed
        || !subscribed
        || connectionSettled
        || !participantStreamsCaughtUp(snapshot.value, acceptedStreams)
      ) return
      connectionSettled = true
      state.value = 'online'
      lastError.value = ''
      resolveConnected?.(true)
      next.dispatchEvent(new Event('v2-participant-subscribed'))
    }
    const connected = new Promise((resolve) => {
      resolveConnected = resolve
      const timeout = window.setTimeout(() => {
        if (next === socket && next.readyState < WebSocket.CLOSING) {
          lastError.value = '实时连接等待超时。'
          next.close(1013, 'participant subscribe timeout')
        }
        connectionSettled = true
        resolve(false)
      }, 5_000)
      next.addEventListener('close', () => {
        clearTimeout(timeout)
        if (!connectionSettled) {
          connectionSettled = true
          resolve(false)
        }
      }, { once: true })
      next.addEventListener('v2-participant-subscribed', () => clearTimeout(timeout), { once: true })
    })

    next.addEventListener('open', () => {
      next.send(JSON.stringify({
        type: 'HELLO',
        protocolVersion: '2',
        clientSurface: 'WELCOME',
        clientBuild: 'v2-08-welcome',
      }))
    })
    next.addEventListener('message', ({ data }) => {
      eventQueue = eventQueue.then(async () => {
        if (next !== socket || failedClosed) return
        let frame
        try {
          frame = JSON.parse(data)
        } catch {
          await failClosed('实时消息格式无效。')
          return
        }
        if (!isRecord(frame)) {
          await failClosed('实时协议帧格式无效，正在重取权威快照。')
          return
        }
        if (frame.type === 'HELLO_ACK') {
          if (
            helloAcknowledged
            || subscribed
            || !participantHelloAckValid(baseline, frame)
          ) {
            await failClosed('实时握手与 v2 ACTIVE 协议不一致。')
            return
          }
          helloAcknowledged = true
          next.send(JSON.stringify({
            type: 'SUBSCRIBE',
            protocolVersion: '2',
            resetEpoch: baseline.resetEpoch,
            streams: requestedStreams,
          }))
          return
        }
        if (frame.type === 'SUBSCRIBED') {
          if (
            !helloAcknowledged
            || subscribed
            || !participantSubscribedFrameValid(baseline, frame)
          ) {
            await failClosed('实时订阅确认与权威快照不一致。')
            return
          }
          subscribed = true
          acceptedStreams = frame.streams
          state.value = 'syncing'
          markOnlineIfCaughtUp()
          return
        }
        if (frame.type === 'ERROR') {
          const compatibleError = activeLifecycleFieldsValid(frame)
            && frame.resetEpoch === snapshot.value?.resetEpoch
            && isRecord(frame.error)
            && typeof frame.error.message === 'string'
          await failClosed(
            compatibleError ? frame.error.message : '实时错误帧与 v2 ACTIVE 协议不兼容。',
          )
          return
        }
        if (
          !helloAcknowledged
          || !subscribed
          || !participantEventFrameValid(snapshot.value, frame)
        ) {
          await failClosed('实时事件帧无效，正在重取权威快照。')
          return
        }
        // HTTP snapshots can arrive ahead of their in-flight WebSocket visuals.
        // Deliver these once on this connection, using the connection baseline
        // to suppress old events after reload/reconnect. State remains authoritative.
        const pendingVisual = frame.streamId === 'public'
          && frame.streamSeq > deliveredPublicSeq
          && frame.streamSeq <= snapshot.value.publicSeq
          && ['barrage.published', 'barrage.removed', 'barrage.cleared', 'gift.sent'].includes(frame.name)
        if (pendingVisual) await onPublicEvent(frame)
        else if (!await applyFrame(frame, failClosed)) return
        if (frame.streamId === 'public') deliveredPublicSeq = Math.max(deliveredPublicSeq, frame.streamSeq)
        markOnlineIfCaughtUp()
      }).catch((error) => failClosed(error?.message ?? '实时状态处理失败。'))
    })
    next.addEventListener('close', () => {
      if (next !== socket) return
      socket = null
      if (!stopped) schedule()
    })
    next.addEventListener('error', () => {
      lastError.value = '实时连接中断；未确认的内容不会自动提交。'
    })
    return connected
  }

  function handleOffline() {
    closeSocket('device offline')
    state.value = 'offline'
    lastError.value = '设备已离线；未确认的内容不会自动提交。'
  }

  function handleOnline() {
    if (!stopped) schedule()
  }

  window.addEventListener('offline', handleOffline)
  window.addEventListener('online', handleOnline)
  onBeforeUnmount(() => {
    stop()
    window.removeEventListener('offline', handleOffline)
    window.removeEventListener('online', handleOnline)
  })

  return { state, lastError, connect, stop, suspend }
}
