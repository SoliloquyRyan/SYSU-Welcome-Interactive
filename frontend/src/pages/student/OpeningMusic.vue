<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
const props = defineProps({ scene: String, status: String })
const playing = ref(false)
let context, gain, timer
let step = 0
// Original sparse piano-like score. No film recording or copyrighted melody is bundled.
const notes = [48, 55, 62, 67, 64, 55, 60, 67, 50, 57, 65, 69, 62, 57, 65, 72]
function stop() {
  clearInterval(timer)
  playing.value = false
  if (!context || !gain) return
  gain.gain.cancelScheduledValues(context.currentTime)
  gain.gain.setTargetAtTime(0, context.currentTime, 1.1)
}
async function toggle() {
  if (playing.value) return stop()
  if (props.scene && props.scene !== 'ASSEMBLY') return
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return
  context ??= new AudioContext()
  if (!gain) { gain = context.createGain(); gain.gain.value = 0; gain.connect(context.destination) }
  await context.resume()
  if (props.scene && props.scene !== 'ASSEMBLY') return
  gain.gain.cancelScheduledValues(context.currentTime)
  gain.gain.setTargetAtTime(.16, context.currentTime, .8)
  playing.value = true
  const tick = () => {
    if (!playing.value) return
    const frequency = 440 * 2 ** ((notes[step++ % notes.length] - 69) / 12)
    for (const [ratio, amplitude] of [[1,.65],[2,.18],[3,.05]]) {
      const oscillator = context.createOscillator(), envelope = context.createGain()
      oscillator.type = 'sine'; oscillator.frequency.value = frequency * ratio
      const t = context.currentTime
      envelope.gain.setValueAtTime(0, t)
      envelope.gain.linearRampToValueAtTime(amplitude, t + .012)
      envelope.gain.exponentialRampToValueAtTime(.0001, t + 3.4)
      oscillator.connect(envelope); envelope.connect(gain)
      oscillator.start(t); oscillator.stop(t + 3.5)
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
    }
  }
  tick(); timer = setInterval(tick, 850)
}
watch(() => props.scene, scene => { if (scene && scene !== 'ASSEMBLY') stop() })
watch(() => props.status, status => { if (status === 'PAUSED' || status === 'COMPLETED') stop() })
const visibility = () => { if (document.hidden) stop() }
document.addEventListener('visibilitychange', visibility)
onBeforeUnmount(() => { stop(); document.removeEventListener('visibilitychange', visibility); void context?.close() })
</script>

<template>
  <button v-if="(!scene || scene === 'ASSEMBLY') && status !== 'PAUSED' && status !== 'COMPLETED'" class="opening-music" type="button" :aria-pressed="playing" @click="toggle">
    <span aria-hidden="true">{{ playing ? 'Ⅱ' : '♫' }}</span> {{ playing ? '关闭音乐' : '开启星海序曲' }}
  </button>
</template>

<style scoped>
.opening-music{position:absolute;right:18px;top:calc(env(safe-area-inset-top) + 72px);z-index:12;display:flex;align-items:center;gap:8px;min-height:44px;padding:9px 12px;border:1px solid #abcaff36;border-radius:30px;background:#091426bd;color:#cbdcf6;font:inherit;font-size:11px;backdrop-filter:blur(12px)}
</style>
