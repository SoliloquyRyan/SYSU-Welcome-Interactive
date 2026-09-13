<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { MOBILE_PROGRAM_OPENING_MS } from '../../rendering/mobile-program-opening'
import { createMobileSupernovaRenderer } from '../../rendering/mobile-supernova-renderer'

const emit = defineEmits(['finish'])
const canvas = ref(null)
let renderer = null
let timer = null
let mediaQuery = null
let finished = false

function finish() {
  if (finished) return
  finished = true
  renderer?.destroy()
  if (timer !== null) window.clearTimeout(timer)
  emit('finish')
}
function onVisibilityChange() { if (document.hidden) finish() }
function onMotionChange(event) { if (event.matches) finish() }

onMounted(() => {
  mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (document.hidden || mediaQuery.matches) { finish(); return }
  if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', onMotionChange)
  else mediaQuery.addListener?.(onMotionChange)
  document.addEventListener('visibilitychange', onVisibilityChange)
  try {
    renderer = createMobileSupernovaRenderer(canvas.value, { durationMs: MOBILE_PROGRAM_OPENING_MS, onComplete: finish })
  } catch { finish(); return }
  if (!renderer) { finish(); return }
  // The same bounded lifetime remains the fallback if a browser stops delivering frames.
  timer = window.setTimeout(finish, MOBILE_PROGRAM_OPENING_MS)
})
onBeforeUnmount(() => {
  finished = true
  renderer?.destroy()
  if (timer !== null) window.clearTimeout(timer)
  if (mediaQuery?.removeEventListener) mediaQuery.removeEventListener('change', onMotionChange)
  else mediaQuery?.removeListener?.(onMotionChange)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div class="mobile-program-opening" data-testid="mobile-program-opening" data-supernova-style="filament-ejecta">
    <canvas ref="canvas" class="opening-supernova-canvas" aria-hidden="true"></canvas>
    <button type="button" class="opening-skip" aria-label="跳过开场动画" @click="finish">跳过</button>
  </div>
</template>

<style scoped>
.mobile-program-opening{position:absolute;inset:0;z-index:6;pointer-events:none}
.opening-supernova-canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.opening-skip{position:absolute;right:18px;top:max(78px,calc(env(safe-area-inset-top) + 62px));min-width:58px;min-height:44px;padding:8px 12px;pointer-events:auto;border:1px solid #afc9df3d;border-radius:12px;color:#d7e5f2;background:rgba(8,18,31,.6);font:inherit;font-size:12px;letter-spacing:.08em}
.opening-skip:focus-visible{outline:2px solid #a6d3ff;outline-offset:3px}
@media(prefers-reduced-motion:reduce){.mobile-program-opening{display:none}}
</style>
