import path from 'node:path'

export const INTERACTION_TRACKS = Object.freeze({
  'b2-eason': ['b2', 'mix'],
  'r2-jj': ['r2', 'mix'],
  'r3-gem': ['r3', 'mix'],
})

export function normal(value) {
  return typeof value === 'string' ? value.toLowerCase().replaceAll('\\', '/').replaceAll(/[^a-z0-9]+/g, '') : ''
}

export function interactionTrackForSettings(settings) {
  if (!settings || settings.is_local_file === false) return null
  const raw = settings.local_file ?? settings.file ?? ''
  const basename = path.posix.basename(String(raw).replaceAll('\\', '/'))
  // Only the three supplied assets are eligible.  Matching the complete
  // filename shape prevents hint/answer/remix files from arming a round.
  const match = /^(b2|r2|r3)_[^/]+_mix\.mp3$/i.exec(basename)
  if (!match) return null
  const prefix = match[1].toLowerCase()
  return Object.entries(INTERACTION_TRACKS).find(([, tokens]) => tokens[0] === prefix)?.[0] ?? null
}

export function uniqueInteractionInputs(inputs) {
  const result = new Map()
  const duplicates = new Set()
  for (const item of inputs ?? []) {
    const trackId = interactionTrackForSettings(item.settings)
    if (!trackId || !item.inputUuid) continue
    if (result.has(trackId)) { duplicates.add(trackId); continue }
    result.set(trackId, { trackId, inputUuid: item.inputUuid, inputName: item.inputName, available: Boolean(item.available) })
  }
  return [...result.values()].map((item) => duplicates.has(item.trackId) ? { ...item, available: false, conflict: true } : item)
}
