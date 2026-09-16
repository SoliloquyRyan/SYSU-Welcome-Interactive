import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectObs } from './obs/obs-client.mjs'
import { meterEnvelope, resolveProgramMedia, validateAudioMapping } from './obs/audio-sources.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const readOnly = args.includes('--check') || args.includes('--list-inputs')
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
if (args.includes('--help')) {
  console.log('OBS 音乐光尘：pnpm obs:audio [--check | --list-inputs] [--mapping <节目素材对应.json>] [--track 1] [--duration <秒>]')
  console.log('--list-inputs / --check 只读检查输入、静音、输出轨道与映射；liveInputs 可显式指定调音台输入。')
  console.log('默认读取本机 OBS WebSocket 鉴权配置，仅连接 loopback。Ctrl+C 退出，不切场、不播放媒体。')
  process.exit(0)
}
const configPath = process.env.OBS_WEBSOCKET_CONFIG ?? path.join(process.env.APPDATA ?? '', 'obs-studio/plugin_config/obs-websocket/config.json')
const mappingPath = option('--mapping') ?? process.env.OBS_PROGRAM_MAPPING ?? path.resolve(root, '../OBS-迎新晚会-20260913/节目素材对应.json')
const outputTrack = Number(option('--track') ?? 1)
const duration = option('--duration') === undefined ? null : Number(option('--duration'))
if (!Number.isInteger(outputTrack) || outputTrack < 1 || outputTrack > 6 || (duration !== null && (!Number.isFinite(duration) || duration <= 0))) throw new Error('OBS_AUDIO_OPTIONS_INVALID')
let stopping = false, currentClient = null, reconnectWake = null, durationTimer = null
const neutral = { version: 1, level: 0, available: false }
const emit = (client, data) => client.request('CallVendorRequest', { vendorName: 'obs-browser', requestType: 'emit_event', requestData: { event_name: 'sysu:audio-envelope', event_data: data } })
async function stop() {
  if (stopping) return
  stopping = true; clearTimeout(durationTimer); reconnectWake?.()
  if (currentClient) { if (!readOnly) await emit(currentClient, neutral).catch(() => {}); currentClient.close() }
}
process.on('SIGINT', stop); process.on('SIGTERM', stop)

async function session(config, mapping) {
  let client = null, ended = false, eligible = new Set(), revision = 0, resolving = false, refreshTimer, meterTimer, sending = false, lastSent = 0, latest = neutral, lastMeter = 0
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
  client = await connectObs({
    url: 'ws://127.0.0.1:' + (config.server_port ?? 4455), password: process.env.OBS_PASSWORD ?? config.server_password ?? '',
    subscriptions: 1 | 2 | 4 | 8 | 128 | 256 | 65536,
    onEvent(type, data) {
      if (type === 'InputVolumeMeters') { latest = meterEnvelope(data, eligible); lastMeter = performance.now(); return }
      if (/Scene|Input|Media/.test(type)) {
        revision++; eligible = new Set(); latest = neutral
        void refresh()
      }
    },
  })
  currentClient = client
  try {
    const version = await client.request('GetVersion')
    const required = ['GetCurrentProgramScene', 'GetInputList', 'GetSceneItemList', 'GetGroupSceneItemList', 'GetInputSettings', 'GetInputMute', 'GetInputAudioTracks', 'GetInputAudioMonitorType', 'GetSourceActive', 'CallVendorRequest']
    if (mapping.some(entry => entry.liveInputs?.length)) required.push('GetSpecialInputs')
    if (required.some(request => !version.availableRequests?.includes(request))) throw new Error('OBS_REQUIRED_REQUEST_UNAVAILABLE')
    if (readOnly) {
      const resolved = await resolveProgramMedia(client, mapping, outputTrack, { inspectAll: true })
      console.log(JSON.stringify({ scene: resolved.sceneName, track: outputTrack, selectedCount: resolved.inputs.size, inputs: resolved.details }, null, 2))
      console.log('OBS_AUDIO_CHECK_OK'); return
    }
    await emit(client, neutral)
    await refresh()
    console.log('OBS ' + version.obsVersion + ' 已连接；当前匹配 ' + eligible.size + ' 个节目音源。仅驱动大屏光尘。')
    refreshTimer = setInterval(refresh, 2000)
    meterTimer = setInterval(async () => {
      const now = performance.now()
      if (sending || now - lastSent < 50 || stopping) return
      lastSent = now; sending = true
      try { await emit(client, now - lastMeter <= 500 ? latest : neutral) }
      catch { client.close() }
      finally { sending = false }
    }, 50)
    await client.closed
  } finally { ended = true; clearInterval(refreshTimer); clearInterval(meterTimer); client.close(); if (currentClient === client) currentClient = null }
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
