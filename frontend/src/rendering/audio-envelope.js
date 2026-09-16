export const AUDIO_ENVELOPE_EVENT = 'sysu:audio-envelope'
export const AUDIO_STALE_MS = 500
export const AUDIO_RELEASE_MS = 800
// A normalized envelope, never audio samples or OBS credentials.
export function createAudioEnvelope() {
  let target = 0, level = 0, receivedAt = -Infinity, lastFrame = null, available = false, releaseAt = null, releaseFrom = 0
  return {
    receive(data, now) {
      if (data?.version !== 1 || typeof data.available !== 'boolean' || !Number.isFinite(data.level) || data.level < 0 || data.level > 1) return false
      target = data.available ? data.level : 0; available = data.available; receivedAt = now
      if (available) releaseAt = null
      else if (releaseAt === null) { releaseAt = now; releaseFrom = level }
      return true
    },
    sample(now) {
      const dt = lastFrame === null ? 16 : Math.min(100, Math.max(0, now - lastFrame)); lastFrame = now
      if (now - receivedAt > AUDIO_STALE_MS || !available) {
        if (releaseAt === null) { releaseAt = receivedAt + AUDIO_STALE_MS; releaseFrom = level }
        level = releaseFrom * Math.max(0, 1 - (now - releaseAt) / AUDIO_RELEASE_MS)
        return { level, available: false }
      }
      level += (target - level) * (1 - Math.exp(-dt / (target > level ? 110 : 290)))
      return { level, available: true }
    },
    reset() { target = level = 0; available = false; receivedAt = -Infinity; lastFrame = null; releaseAt = null; releaseFrom = 0 },
  }
}
