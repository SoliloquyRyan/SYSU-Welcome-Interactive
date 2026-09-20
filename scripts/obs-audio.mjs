import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { connectObs } from './obs/obs-client.mjs'
import { meterEnvelope, resolveProgramMedia, validateAudioMapping } from './obs/audio-sources.mjs'
import { uniqueInteractionInputs } from './obs/interaction-audio.mjs'
import { autoStartMediaAction } from './obs/audio-playback.mjs'
import { resolveObsScene, sceneCueKey } from './obs/scene-sync.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const readOnly = args.includes('--check') || args.includes('--list-inputs')
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
if (args.includes('--help')) {
  console.log('OBS 音乐光尘：pnpm obs:audio [--check | --list-inputs] [--mapping <节目素材对应.json>] [--track 1] [--duration <秒>]')
  console.log('--list-inputs / --check 只读检查输入、静音、输出轨道与映射；liveInputs 可显式指定调音台输入。')
  console.log('默认读取本机 OBS WebSocket 鉴权配置，仅连接 loopback；桥接在线时按网页节目自动同步 OBS 场景。--check 只读，不切场、不播放媒体。')
  process.exit(0)
}
const configPath = process.env.OBS_WEBSOCKET_CONFIG ?? path.join(process.env.APPDATA ?? '', 'obs-studio/plugin_config/obs-websocket/config.json')
const mappingPath = option('--mapping') ?? process.env.OBS_PROGRAM_MAPPING ?? path.resolve(root, '../OBS-迎新晚会-20260913/节目素材对应.json')
const outputTrack = Number(option('--track') ?? 1)
const duration = option('--duration') === undefined ? null : Number(option('--duration'))
const bridgeUrl = (process.env.OBS_AUDIO_BRIDGE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
const bridgeToken = process.env.OBS_AUDIO_BRIDGE_TOKEN ?? ''
if (!Number.isInteger(outputTrack) || outputTrack < 1 || outputTrack > 6 || (duration !== null && (!Number.isFinite(duration) || duration <= 0))) throw new Error('OBS_AUDIO_OPTIONS_INVALID')
let stopping = false, currentClient = null, reconnectWake = null, durationTimer = null
const neutral = { version: 1, level: 0, available: false }
const emit = (client, data) => client.request('CallVendorRequest', { vendorName: 'obs-browser', requestType: 'emit_event', requestData: { event_name: 'sysu:audio-envelope', event_data: data } })
async function stop() {
  if (stopping) return
  stopping = true; clearTimeout(durationTimer); reconnectWake?.()
  if (currentClient) { if (!readOnly) await emit(currentClient, neutral).catch(() => {}); currentClient.close() }
}

async function bridgeRequest(pathname, init = {}) {
  if (!bridgeToken || readOnly) return null
  const bridgeOrigin = new URL(bridgeUrl).origin
  const response = await fetch(bridgeUrl + pathname, {
    ...init,
    headers: { ...(init.headers ?? {}), origin: bridgeOrigin, 'content-type': 'application/json', 'x-obs-audio-token': bridgeToken },
  })
  if (!response.ok) throw new Error('OBS_BRIDGE_HTTP_' + response.status)
  return response.json()
}
async function bridgeHeartbeat(tracks, connected) {
  if (!bridgeToken || readOnly) return
  await bridgeRequest('/api/v2/integrations/obs/heartbeat', {
    method: 'POST', body: JSON.stringify({ connected, tracks }),
  }).catch(() => {})
}
process.on('SIGINT', stop); process.on('SIGTERM', stop)

async function session(config, mapping) {
  let client = null, ended = false, eligible = new Set(), revision = 0, resolving = false, refreshTimer, meterTimer, actionTimer, inputTimer, armTimer, sceneTimer, sending = false, lastSent = 0, latest = neutral, lastMeter = 0
  let armedAudio = null
  let autoStartedArmId = null, armPollBusy = false
  let scenePollBusy = false, lastSceneCue = null, lastSceneSyncError = ''
  let interactionInputs = []
  const sendMediaEvent = (event, data) => {
    const inputUuid = data?.inputUuid ?? ''
    if (!inputUuid || !armedAudio?.armId || armedAudio.inputUuid !== inputUuid) return
    void bridgeRequest('/api/v2/integrations/obs/audio-event', { method: 'POST', body: JSON.stringify({
      resetEpoch: armedAudio.resetEpoch, roundNumber: armedAudio.roundNumber, armId: armedAudio.armId,
      eventId: `${event.toLowerCase()}:${armedAudio.armId}:${inputUuid}:${randomUUID()}`,
      event, trackId: armedAudio.trackId, inputUuid,
    }) }).catch(() => {})
  }
  const refreshArm = async () => {
    if (!bridgeToken || stopping || !client || armPollBusy) return
    armPollBusy = true
    try {
      const next = await bridgeRequest('/api/v2/integrations/obs/audio-arm')
      const nextArm = next?.arm ?? null
      armedAudio = nextArm
      // A TRIGGERED row can be returned after reconnect. Never restart it.
      if (!nextArm || nextArm.status !== 'ARMED') {
        if (!nextArm) autoStartedArmId = null
        return
      }
      if (autoStartedArmId === nextArm.armId) return
      const status = await client.request('GetMediaInputStatus', { inputUuid: nextArm.inputUuid })
      await client.request('TriggerMediaInputAction', {
        inputUuid: nextArm.inputUuid,
        mediaAction: autoStartMediaAction(status.mediaState),
      })
      autoStartedArmId = nextArm.armId
    } finally { armPollBusy = false }
  }
  const refreshScene = async () => {
    if (!bridgeToken || stopping || !client || scenePollBusy) return
    scenePollBusy = true
    try {
      const payload = await bridgeRequest('/api/v2/integrations/obs/scene-cue')
      const cue = payload?.cue ?? null
      if (!cue) { lastSceneCue = null; lastSceneSyncError = ''; return }
      const targetScene = resolveObsScene(mapping, cue)
      if (!targetScene) {
        const error = `OBS_SCENE_MAPPING_MISSING:${cue.stageMode ?? 'UNKNOWN'}:${cue.programId ?? 'host'}`
        if (lastSceneSyncError !== error) console.error(`OBS 场景同步失败：${cue.stageMode === 'HOST' ? '报幕主题场景' : `服务器节目 ${cue.title ?? cue.programId}`} 没有唯一场景映射。`)
        lastSceneSyncError = error
        return
      }
      const current = await client.request('GetCurrentProgramScene')
      if (current.currentProgramSceneName === targetScene) {
        lastSceneCue = sceneCueKey(cue)
        lastSceneSyncError = ''
        return
      }
      await client.request('SetCurrentProgramScene', { sceneName: targetScene })
      const after = await client.request('GetCurrentProgramScene')
      if (after.currentProgramSceneName !== targetScene) throw new Error('OBS_SCENE_SYNC_VERIFY_FAILED')
      const key = sceneCueKey(cue)
      if (lastSceneCue !== key) console.log(`OBS 场景已同步：${cue.title ?? cue.programId} → ${targetScene}`)
      lastSceneCue = key
      lastSceneSyncError = ''
    } catch (error) {
      const code = error?.message ?? 'OBS_SCENE_SYNC_FAILED'
      if (lastSceneSyncError !== code) console.error(`OBS 场景同步暂不可用：${code}。网页节目状态保留，桥接会重试。`)
      lastSceneSyncError = code
    } finally { scenePollBusy = false }
  }
  const refresh = async () => {
    if (resolving || stopping || ended || !client) return
    resolving = true
    const ownRevision = revision
    try {
      const resolved = await resolveProgramMedia(client, mapping, outputTrack)
      if (!ended && revision === ownRevision) eligible = resolved.inputs
    } catch { eligible = new Set() }
    finally { resolving = false }
  }
  const discoverInteractionInputs = async (obsClient) => {
    const { inputs = [] } = await obsClient.request('GetInputList')
    const candidates = []
    for (const input of inputs) {
      try {
        const { inputSettings = {} } = await obsClient.request('GetInputSettings', { inputUuid: input.inputUuid })
        const [{ inputMuted = false }, { inputAudioTracks = {} }] = await Promise.all([
          obsClient.request('GetInputMute', { inputUuid: input.inputUuid }),
          obsClient.request('GetInputAudioTracks', { inputUuid: input.inputUuid }),
        ])
        candidates.push({ ...input, settings: inputSettings, available: !inputMuted && inputAudioTracks[String(outputTrack)] === true })
      } catch { /* unavailable sources remain absent from the heartbeat */ }
    }
    return uniqueInteractionInputs(candidates)
  }
  client = await connectObs({
    url: 'ws://127.0.0.1:' + (config.server_port ?? 4455), password: process.env.OBS_PASSWORD ?? config.server_password ?? '',
    subscriptions: 1 | 2 | 4 | 8 | 128 | 256 | 65536,
    onEvent(type, data) {
      if (type === 'InputVolumeMeters') { latest = meterEnvelope(data, eligible); lastMeter = performance.now(); return }
      if (type === 'MediaInputPlaybackStarted' || type === 'MediaInputPlaybackEnded') {
        // Never refresh the arm after receiving an OBS event: doing so can bind
        // a delayed event to the next question. The cached arm is the identity
        // observed before playback and the server performs the final check.
        sendMediaEvent(type === 'MediaInputPlaybackStarted' ? 'STARTED' : 'ENDED', data)
        return
      }
      if (/Scene|Input|Media/.test(type)) {
        revision++; eligible = new Set(); latest = neutral
        void refresh()
      }
    },
  })
  currentClient = client
  try {
    const version = await client.request('GetVersion')
    const required = ['GetCurrentProgramScene', 'SetCurrentProgramScene', 'GetInputList', 'GetSceneItemList', 'GetGroupSceneItemList', 'GetInputSettings', 'GetInputMute', 'GetInputAudioTracks', 'GetInputAudioMonitorType', 'GetSourceActive', 'CallVendorRequest', 'GetMediaInputStatus', 'TriggerMediaInputAction']
    if (mapping.some(entry => entry.liveInputs?.length)) required.push('GetSpecialInputs')
    if (required.some(request => !version.availableRequests?.includes(request))) throw new Error('OBS_REQUIRED_REQUEST_UNAVAILABLE')
    if (readOnly) {
      const resolved = await resolveProgramMedia(client, mapping, outputTrack, { inspectAll: true })
      interactionInputs = await discoverInteractionInputs(client)
      console.log(JSON.stringify({ scene: resolved.sceneName, track: outputTrack, selectedCount: resolved.inputs.size, interactionTracks: interactionInputs, inputs: resolved.details }, null, 2))
      console.log('OBS_AUDIO_CHECK_OK'); return
    }
    await emit(client, neutral)
    await refresh()
    interactionInputs = await discoverInteractionInputs(client)
    await bridgeHeartbeat(interactionInputs.map(({ trackId, inputUuid, available }) => ({ trackId, inputUuid, available })), true)
    console.log('OBS ' + version.obsVersion + ' 已连接；当前匹配 ' + eligible.size + ' 个节目音源。驱动大屏光尘并同步节目场景。')
    refreshTimer = setInterval(refresh, 2000)
    if (bridgeToken) {
      const syncArm = async () => { try { await refreshArm() } catch { armedAudio = null } }
      armTimer = setInterval(syncArm, 500)
      await syncArm()
      const syncScene = async () => { await refreshScene() }
      sceneTimer = setInterval(syncScene, 500)
      await syncScene()
      let actionPollBusy = false
      const pollActions = async () => {
        if (actionPollBusy || stopping) return
        actionPollBusy = true
        try {
          const payload = await bridgeRequest('/api/v2/integrations/obs/audio-actions')
          for (const action of payload?.actions ?? []) {
            if (!action.inputUuid) continue
            try {
              const status = await client.request('GetMediaInputStatus', { inputUuid: action.inputUuid })
              if (action.action === 'PAUSE' && status.mediaState !== 'OBS_MEDIA_STATE_PAUSED') {
                await client.request('TriggerMediaInputAction', { inputUuid: action.inputUuid, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE' })
              } else if (action.action === 'RESUME' && status.mediaState === 'OBS_MEDIA_STATE_PAUSED') {
                await client.request('TriggerMediaInputAction', { inputUuid: action.inputUuid, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY' })
              }
              await bridgeRequest(`/api/v2/integrations/obs/audio-actions/${encodeURIComponent(action.id)}/ack`, { method: 'POST', body: JSON.stringify({ resetEpoch: action.resetEpoch }) })
            } catch { /* leave the action pending for the next poll */ }
          }
        } catch { /* bridge is fail-closed; atmosphere continues without control */ }
        finally { actionPollBusy = false }
      }
      actionTimer = setInterval(pollActions, 120)
      const refreshInputs = async () => {
        interactionInputs = await discoverInteractionInputs(client).catch(() => interactionInputs)
        await bridgeHeartbeat(interactionInputs.map(({ trackId, inputUuid, available }) => ({ trackId, inputUuid, available })), true)
      }
      inputTimer = setInterval(refreshInputs, 1000)
    }
    meterTimer = setInterval(async () => {
      const now = performance.now()
      if (sending || now - lastSent < 50 || stopping) return
      lastSent = now; sending = true
      try { await emit(client, now - lastMeter <= 500 ? latest : neutral) }
      catch { client.close() }
      finally { sending = false }
    }, 50)
    await client.closed
  } finally { ended = true; clearInterval(refreshTimer); clearInterval(meterTimer); clearInterval(actionTimer); clearInterval(inputTimer); clearInterval(armTimer); clearInterval(sceneTimer); await bridgeHeartbeat([], false); client.close(); if (currentClient === client) currentClient = null }
}

try {
  const config = JSON.parse((await fs.readFile(configPath, 'utf8')).replace(/^\uFEFF/, ''))
  if (!config.server_enabled) throw new Error('OBS_WEBSOCKET_DISABLED')
  if (!config.auth_required) throw new Error('OBS_AUTH_REQUIRED')
  const mapping = validateAudioMapping(JSON.parse((await fs.readFile(mappingPath, 'utf8')).replace(/^\uFEFF/, '')))
  if (duration) durationTimer = setTimeout(stop, duration * 1000)
  while (!stopping) {
    try { await session(config, mapping); if (readOnly) break }
    catch (error) {
      console.error('音乐光尘未连接：' + (error.message.startsWith('OBS_') ? error.message : 'OBS_CONNECTION_FAILED') + '。大屏保持环境动效。')
      if (readOnly || ['OBS_REQUIRED_REQUEST_UNAVAILABLE', 'OBS_REQUEST_204'].includes(error.message)) { process.exitCode = 1; break }
    }
    if (!stopping) await new Promise(done => { const timer = setTimeout(done, 3000); reconnectWake = () => { clearTimeout(timer); done() } })
  }
} catch (error) {
  console.error('音乐光尘无法启动：' + (error.message?.startsWith('OBS_') ? error.message : 'OBS_CONFIG_OR_MAPPING_UNAVAILABLE'))
  console.error('请核对 OBS：工具 → WebSocket 服务器设置 → 启用服务器并保留身份验证；素材映射用 --mapping 指定。')
  process.exitCode = 1
} finally { await stop() }
