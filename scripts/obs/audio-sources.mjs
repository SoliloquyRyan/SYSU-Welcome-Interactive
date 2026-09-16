import path from 'node:path'

export function mediaKey(value) {
  return typeof value === 'string' ? path.win32.normalize(value).replaceAll('\\', '/').toLowerCase() : ''
}

export function mediaMatches(settings, allowed) {
  if (settings.is_local_file === false) return false
  if (settings.local_file) return allowed.has(mediaKey(settings.local_file))
  const playlist = settings.playlist?.filter(item => !item.hidden).map(item => mediaKey(item.value)) ?? []
  return playlist.length > 0 && playlist.every(file => allowed.has(file))
}

// Traverse only the program scene's enabled tree, never the studio preview.
export function validateAudioMapping(mapping) {
  if (!Array.isArray(mapping) || mapping.some(item => !item || typeof item.scene !== 'string' || !item.scene.trim()
    || !Array.isArray(item.media) || item.media.some(file => typeof file !== 'string')
    || (item.liveInputs !== undefined && (!Array.isArray(item.liveInputs) || item.liveInputs.some(name => typeof name !== 'string' || !name.trim()))))) throw new Error('OBS_MAPPING_INVALID')
  if (new Set(mapping.map(item => item.scene)).size !== mapping.length) throw new Error('OBS_MAPPING_INVALID')
  return mapping
}

export async function inspectInputAudio(client, input, outputTrack = 1) {
  const selector = { inputName: input.inputName }
  try {
    const [{ inputMuted }, { inputAudioTracks }, { monitorType }, activity] = await Promise.all([
      client.request('GetInputMute', selector), client.request('GetInputAudioTracks', selector),
      client.request('GetInputAudioMonitorType', selector), client.request('GetSourceActive', { sourceName: input.inputName }),
    ])
    const routed = inputAudioTracks?.[String(outputTrack)] === true
    const reason = inputMuted ? 'muted' : !routed ? 'wrong-track' : monitorType === 'OBS_MONITORING_TYPE_MONITOR_ONLY' ? 'monitor-only' : null
    return { name: input.inputName, kind: input.unversionedInputKind ?? input.inputKind, muted: inputMuted, tracks: inputAudioTracks,
      monitorType, videoActive: activity.videoActive, available: !reason, reason }
  } catch { return { name: input.inputName, available: false, reason: 'unavailable-or-no-audio' } }
}

export async function resolveProgramMedia(client, mapping, outputTrack = 1, { inspectAll = false } = {}) {
  const { currentProgramSceneName: sceneName } = await client.request('GetCurrentProgramScene')
  const entry = mapping.find(item => item.scene === sceneName)
  if (!entry && !inspectAll) return { sceneName, inputs: new Set(), details: [] }
  const allowed = new Set((entry?.media ?? []).map(mediaKey).filter(Boolean))
  const live = new Set(entry?.liveInputs ?? [])
  const { inputs: allInputs } = await client.request('GetInputList')
  const byName = new Map(allInputs.map(input => [input.inputName, input]))
  const visible = new Map(), visited = new Set()
  async function walk(name, group = false, depth = 0) {
    if (depth > 12 || visited.has(name)) return
    visited.add(name)
    const { sceneItems } = await client.request(group ? 'GetGroupSceneItemList' : 'GetSceneItemList', { sceneName: name })
    for (const item of sceneItems) {
      if (!item.sceneItemEnabled) continue
      if (item.isGroup) await walk(item.sourceName, true, depth + 1)
      else if (item.sourceType === 'OBS_SOURCE_TYPE_SCENE') await walk(item.sourceName, false, depth + 1)
      else if (byName.has(item.sourceName)) visible.set(item.sourceName, byName.get(item.sourceName))
    }
  }
  await walk(sceneName)
  // Special/global mixer inputs are considered only when explicitly named.
  const globals = live.size ? new Set(Object.values(await client.request('GetSpecialInputs')).filter(Boolean)) : new Set()
  const inputs = new Set()
  const details = []
  for (const input of allInputs) {
    const explicitLive = live.has(input.inputName)
    const visibleInProgram = visible.has(input.inputName)
    let matched = false
    if (explicitLive) matched = visibleInProgram || globals.has(input.inputName)
    else if (visibleInProgram && ['ffmpeg_source', 'vlc_source'].includes(input.unversionedInputKind ?? input.inputKind)) {
      const { inputSettings } = await client.request('GetInputSettings', { inputName: input.inputName })
      matched = mediaMatches(inputSettings, allowed)
    }
    if (!matched && !inspectAll) continue
    const status = await inspectInputAudio(client, input, outputTrack)
    // Audio-only live inputs need not be videoActive. Their active meter must
    // still arrive before meterEnvelope marks audio as available.
    const selected = matched && status.available && (explicitLive || status.videoActive)
    if (selected) inputs.add(input.inputUuid || input.inputName)
    details.push({ ...status, explicitLive, visibleInProgram, matched, selected: Boolean(selected),
      reason: status.reason ?? (!matched ? 'not-in-program-mapping' : !selected ? 'inactive-media' : null) })
  }
  for (const name of live) if (!byName.has(name)) details.push({ name, explicitLive: true, selected: false, available: false, reason: 'missing-input' })
  return { sceneName, inputs, details }
}

export function meterEnvelope(event, eligible) {
  let rms = 0, observed = false
  for (const input of event?.inputs ?? []) {
    if (!eligible.has(input.inputUuid || input.inputName)) continue
    observed = true
    for (const channel of input.inputLevelsMul ?? []) {
      // OBS sends [post-fader RMS, post-fader peak, input peak]. Mute and
      // volume are already applied to RMS; multiplying gain again is wrong.
      if (Number.isFinite(channel[0]) && channel[0] >= 0) rms = Math.max(rms, channel[0])
    }
  }
  const level = rms > .000001 ? Math.max(0, Math.min(1, (20 * Math.log10(rms) + 54) / 46)) : 0
  return { version: 1, level, available: observed }
}
