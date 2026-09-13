<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  PERSONAL_JOURNEY_PHASES,
  createPersonalJourneyRenderer,
} from './personal-journey-renderer'

const props = defineProps({
  phase: {
    type: String,
    default: PERSONAL_JOURNEY_PHASES.SELECTION,
  },
  playing: { type: Boolean, default: false },
  reduced: { type: Boolean, default: false },
  paused: { type: Boolean, default: false },
  color: { type: String, default: '#ffe3ad' },
  ownStar: { type: Object, default: null },
})

const emit = defineEmits(['phase-complete'])
const canvas = ref(null)
let renderer = null
let phaseEpoch = 0

function applyVisualState() {
  renderer?.setState({
    color: props.color,
    ownStar: props.ownStar,
    // D-030: the phone's ambient field is local visual atmosphere. It must
    // not change density or composition with the participant population.
    publicStars: [],
  })
}

function applyPhase() {
  if (!renderer) return
  const epoch = ++phaseEpoch
  renderer.setPhase(props.phase, {
    animate: props.playing && !props.reduced,
    fromProgress: 0,
    progress: props.phase === PERSONAL_JOURNEY_PHASES.DISCOVERY && !props.playing ? 0 : 1,
  })
  if (!props.playing || props.reduced) return
  void renderer.waitForPhase(props.phase).then((result) => {
    if (epoch !== phaseEpoch || !result?.completed) return
    emit('phase-complete', { phase: props.phase })
  })
}

onMounted(() => {
  renderer = createPersonalJourneyRenderer(canvas.value, {
    reduced: props.reduced,
    paused: props.paused,
  })
  applyVisualState()
  applyPhase()

})

watch(() => [props.color, props.ownStar], applyVisualState, { deep: true })
watch(() => [props.phase, props.playing], applyPhase)
watch(() => props.paused, (next) => renderer?.setPaused(next))
watch(() => props.reduced, (next) => {
  renderer?.setReduced(next)
  applyPhase()
})

onBeforeUnmount(() => {
  phaseEpoch += 1
  renderer?.destroy()
  renderer = null
})

defineExpose({
  waitForPhase(phase = props.phase) {
    return renderer?.waitForPhase(phase)
      ?? Promise.resolve({ completed: false, reason: 'renderer-unavailable' })
  },
  seek(progress) {
    renderer?.setProgress(progress)
  },
  renderNow(timestamp) {
    renderer?.renderNow(timestamp)
  },
})
</script>

<template>
  <div
    class="personal-journey-stage"
    aria-hidden="true"
    data-testid="personal-journey-stage"
    :data-phase="phase"
    :data-playing="playing ? 'true' : 'false'"
    data-background-system="orbital-signal-reset"
  >
    <canvas ref="canvas" class="personal-journey-stage__canvas"></canvas>
    <div class="personal-journey-stage__vignette"></div>
    <div class="personal-journey-stage__grain"></div>
  </div>
</template>

<style scoped>
.personal-journey-stage,
.personal-journey-stage__canvas,
.personal-journey-stage__vignette,
.personal-journey-stage__grain {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.personal-journey-stage {
  z-index: 0;
  overflow: hidden;
  background: var(--color-orbit-midnight);
}

.personal-journey-stage__canvas {
  z-index: 0;
}

.personal-journey-stage__vignette {
  z-index: 1;
  background:
    radial-gradient(ellipse at 50% 42%, transparent 34%, rgb(6 15 30 / 5%) 68%, rgb(8 12 18 / 12%) 100%),
    linear-gradient(180deg, rgb(8 12 18 / 12%), transparent 22%, transparent 76%, rgb(8 12 18 / 10%));
}

.personal-journey-stage__grain {
  z-index: 2;
  opacity: 0.032;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 120 120' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.92' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.8'/%3E%3C/svg%3E");
  mix-blend-mode: soft-light;
}

@media (prefers-reduced-motion: reduce) {
  .personal-journey-stage__grain {
    display: none;
  }
}
</style>
