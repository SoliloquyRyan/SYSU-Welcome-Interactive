export const OBS_HOST_SCENE = '00 开场与集结'

/** Resolve one exact operator-reviewed OBS scene for a server stage cue. */
export function resolveObsScene(mapping, cue) {
  if (cue?.stageMode === 'HOST') return OBS_HOST_SCENE
  if (cue?.stageMode !== 'PROGRAM' && cue?.stageMode !== 'AWARD') return null
  const programId = cue?.programId
  if (typeof programId !== 'string' || !programId) return null
  const matches = (mapping ?? []).filter(entry => entry?.programId === programId && typeof entry.scene === 'string' && entry.scene.trim())
  return matches.length === 1 ? matches[0].scene : null
}

export function sceneCueKey(cue) {
  return typeof cue?.cueId === 'string' && cue.cueId ? cue.cueId : null
}
