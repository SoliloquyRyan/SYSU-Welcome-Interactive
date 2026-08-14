<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  as: { type: String, default: 'h2' },
  text: { type: String, required: true },
  accessibleLabel: { type: String, default: '' },
  replayKey: { type: [String, Number], default: '' },
  animate: { type: Boolean, default: true },
  reduced: { type: Boolean, default: false },
})

const element = ref(null)
const visibleCount = ref(0)
const completed = ref(false)
const staticCompletion = ref(false)
let revealTimer = null

const glyphs = computed(() => Array.from(props.text))
const visibleText = computed(() => glyphs.value.slice(0, visibleCount.value).join(''))

function clearReveal() {
  if (revealTimer !== null) window.clearTimeout(revealTimer)
  revealTimer = null
}

function finishReveal({ settleCursor = false } = {}) {
  clearReveal()
  visibleCount.value = glyphs.value.length
  completed.value = true
  staticCompletion.value = !settleCursor
}

function revealNext() {
  if (visibleCount.value >= glyphs.value.length) {
    finishReveal({ settleCursor: true })
    return
  }
  const glyph = glyphs.value[visibleCount.value]
  visibleCount.value += 1
  const delay = glyph === '\n' ? 92 : /[，。！？：]/u.test(glyph) ? 108 : 54
  revealTimer = window.setTimeout(revealNext, delay)
}

function playReveal() {
  clearReveal()
  if (!props.animate || props.reduced || document.hidden) {
    finishReveal()
    return
  }
  visibleCount.value = 0
  completed.value = false
  staticCompletion.value = false
  revealTimer = window.setTimeout(revealNext, 90)
}

function onVisibilityChange() {
  if (document.hidden) finishReveal()
}

function focus() {
  element.value?.focus()
}

watch(() => [props.text, props.replayKey], playReveal, { flush: 'post' })
watch(() => [props.animate, props.reduced], ([animate, reduced]) => {
  if (!animate || reduced) finishReveal()
})

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  playReveal()
})

onBeforeUnmount(() => {
  clearReveal()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

defineExpose({ focus })
</script>

<template>
  <component
    :is="as"
    ref="element"
    class="signal-type-title"
    :aria-label="accessibleLabel || text.replaceAll('\n', '')"
  >
    <span class="signal-type-title__measure" aria-hidden="true">{{ text }}<span class="signal-type-title__caret signal-type-title__caret--measure"></span></span>
    <span
      class="signal-type-title__typed"
      :class="{ 'is-complete': completed, 'is-static': staticCompletion, 'is-reduced': reduced }"
      aria-hidden="true"
    >{{ visibleText }}<span class="signal-type-title__caret"></span></span>
  </component>
</template>

<style scoped>
.signal-type-title {
  position: relative;
  display: block;
  width: fit-content;
  max-width: 100%;
}

.signal-type-title__measure,
.signal-type-title__typed {
  white-space: pre-line;
}

.signal-type-title__measure {
  visibility: hidden;
}

.signal-type-title__typed {
  position: absolute;
  inset: 0;
}

.signal-type-title__caret {
  display: inline-block;
  width: 0.075em;
  height: 0.9em;
  margin-left: 0.12em;
  vertical-align: -0.08em;
  background: linear-gradient(180deg, rgba(228, 246, 255, 0.98), rgba(91, 190, 255, 0.74));
  box-shadow: 0 0 10px rgba(90, 184, 255, 0.58);
  opacity: 0.88;
  animation: signal-caret-blink 520ms steps(1, end) infinite;
}

.signal-type-title__caret--measure {
  animation: none;
  opacity: 0;
}

.signal-type-title__typed.is-complete .signal-type-title__caret {
  animation: signal-caret-settle 520ms steps(1, end) 4 forwards;
}

.signal-type-title__typed.is-static .signal-type-title__caret,
.signal-type-title__typed.is-reduced .signal-type-title__caret {
  animation: none;
  opacity: 0.36;
}

@keyframes signal-caret-blink {
  0%, 46% { opacity: 0.88; }
  47%, 100% { opacity: 0.2; }
}

@keyframes signal-caret-settle {
  0%, 46% { opacity: 0.8; }
  47%, 100% { opacity: 0.32; }
}

@media (prefers-reduced-motion: reduce) {
  .signal-type-title__caret {
    animation: none !important;
    opacity: 0.36;
  }
}
</style>
