<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useReducedMotion } from '../../composables/useReducedMotion'
import { useV2ScreenRealtime } from '../../composables/useV2ScreenRealtime'
import { v2ScreenApi } from '../../services/api'
import deepSpaceDustBackdrop from '../../assets/screen/deep-space-dust-d040.png'
import { createGalaxyRenderer } from './galaxy-renderer'

const sceneCopy = {
  ASSEMBLY: { title: '星海集结', subtitle: '每一颗抵达的星，正在汇入同一片星河' },
  PROGRAM_SUPPORT: { title: '节目共振', subtitle: '此刻的欢呼，正在现场发生' },
  COOPERATIVE_LIGHT: { title: '协同点亮', subtitle: '让彼此的光，在这一刻连成星海' },
}

const snapshot = ref(null)
const root = ref(null)
const canvas = ref(null)
const stageBackdrop = ref(null)
const sceneLayer = ref(null)
const sceneTransitionLayer = ref(null)
const finaleLayer = ref(null)
const flyingBarrages = ref([])
const errorMessage = ref('')
const reducedMotion = useReducedMotion()
const gsapReady = ref(false)
const sceneTransition = ref(null)
const finalePlayed = ref(false)
const rafflePhase = ref('waiting')
const raffleCode = ref('星海正在等待')
let renderer = null
let gsap = null
let gsapContext = null
let gsapPromise = null
let sceneTransitionTimeline = null
let sceneTransitionTimer = null
let sceneTransitionSerial = 0
let disposed = false
const activeAnimations = new Set()
const barrageAnimations = new Map()
let raffleTimer = null
let barrageSerial = 0

const DEFAULT_SCENE_TRANSITION_MS = 1800
const PROGRAM_OPENING_TRANSITION_MS = 8400
const MAX_FLYING_BARRAGES = 24
const BARRAGE_LANE_COUNT = 10

const runtime = computed(() => snapshot.value?.runtime)
const presentation = computed(() => snapshot.value?.presentation ?? { type: 'NONE' })
const currentScene = computed(() => runtime.value?.currentScene ?? 'ASSEMBLY')
const completed = computed(() => runtime.value?.status === 'COMPLETED')
const previewingFinale = computed(() => presentation.value.type === 'FINALE_PREVIEW')
const raffleActive = computed(() => presentation.value.type === 'RAFFLE')
const raffle = computed(() => snapshot.value?.raffle)
const raffleWinner = computed(() => raffle.value?.winners?.[0] ?? null)
const interactionVisible = computed(() =>
  runtime.value?.status === 'RUNNING'
  && currentScene.value === 'PROGRAM_SUPPORT'
  && presentation.value.type === 'NONE'
  && !sceneTransition.value,
)
const scene = computed(() => sceneCopy[currentScene.value] ?? sceneCopy.ASSEMBLY)
const openingProgram = computed(() => sceneTransition.value?.fromScene === 'ASSEMBLY'
  && sceneTransition.value?.toScene === 'PROGRAM_SUPPORT')
const connectionLabel = computed(() => {
  if (realtime.state.value === 'online') return ''
  if (realtime.lastError.value) return realtime.lastError.value
  return realtime.state.value === 'reconnecting' ? '现场信号恢复中' : '正在连接权威现场状态'
})

function snapStageBackdrop(nextScene = currentScene.value) {
  if (!stageBackdrop.value) return
  const visible = nextScene !== 'PROGRAM_SUPPORT'
  stageBackdrop.value.style.opacity = visible ? '1' : '0'
  stageBackdrop.value.style.visibility = visible ? 'visible' : 'hidden'
}

function putSnapshot(next, { reconnect = false } = {}) {
  const hadSnapshot = snapshot.value !== null
  const wasCompleted = snapshot.value?.runtime.status === 'COMPLETED'
  if (!hadSnapshot || reconnect) {
    stopSceneTransition({ snap: false })
    clearFlyingBarrages()
  }
  snapshot.value = next
  if ((!hadSnapshot || reconnect) && next.presentation.type === 'RAFFLE') {
    const winner = next.raffle?.winners?.[0]
    rafflePhase.value = winner ? 'revealed' : 'waiting'
    raffleCode.value = winner?.publicStarId ?? '星海正在等待'
  }
  renderer?.setStars(next.publicStars)
  if (!sceneTransition.value) renderer?.setMode(next.runtime.currentScene, { animate: false })
  if (!hadSnapshot || reconnect) snapStageBackdrop(next.runtime.currentScene)
  if (hadSnapshot && !wasCompleted && next.runtime.status === 'COMPLETED') {
    void playFinale()
  }
}

async function refresh(options = {}) {
  const next = await v2ScreenApi.snapshot()
  putSnapshot(next, options)
  return next
}

function trackAnimation(animation) {
  if (!animation) return animation
  activeAnimations.add(animation)
  return animation
}

function stopTrackedAnimations() {
  for (const animation of activeAnimations) animation.kill()
  activeAnimations.clear()
}

function clearSceneTransitionTimer() {
  if (sceneTransitionTimer) window.clearTimeout(sceneTransitionTimer)
  sceneTransitionTimer = null
}

function clearSceneMotionStyles() {
  for (const element of [sceneLayer.value, stageBackdrop.value]) {
    if (!element) continue
    element.style.removeProperty('opacity')
    element.style.removeProperty('visibility')
    element.style.removeProperty('transform')
    element.style.removeProperty('will-change')
  }
}

function finishSceneTransition(transitionId) {
  if (sceneTransition.value?.id !== transitionId) return
  const targetScene = sceneTransition.value.toScene
  if (sceneTransitionTimeline) activeAnimations.delete(sceneTransitionTimeline)
  sceneTransitionTimeline = null
  clearSceneTransitionTimer()
  clearSceneMotionStyles()
  // The DOM timeline and the vsync-aligned Canvas loop use different clocks. Snap the
  // renderer synchronously before declaring the transition idle so OBS can
  // never sample a stale opaque frame in the small interval between them.
  renderer?.setMode(targetScene, { animate: false })
  sceneTransition.value = null
}

function stopSceneTransition({ clear = true, snap = true } = {}) {
  if (sceneTransitionTimeline) {
    sceneTransitionTimeline.kill()
    activeAnimations.delete(sceneTransitionTimeline)
    sceneTransitionTimeline = null
  }
  clearSceneTransitionTimer()
  clearSceneMotionStyles()
  if (snap) snapStageBackdrop()
  if (clear) sceneTransition.value = null
}

async function loadGsap() {
  if (gsap || reducedMotion.value || disposed) return gsap
  if (!gsapPromise) {
    gsapPromise = import('gsap')
      .then((module) => module.gsap)
      .catch(() => null)
  }
  const loadedGsap = await gsapPromise
  if (!loadedGsap || disposed) return null
  gsap = loadedGsap
  gsapReady.value = true
  gsapContext = gsap.context(() => {}, root.value)
  return gsap
}

function visualCopy(sceneName) {
  const copy = sceneCopy[sceneName] ?? sceneCopy.ASSEMBLY
  return copy
}

function sceneTransitionDuration(fromScene, toScene) {
  return fromScene === 'ASSEMBLY' && toScene === 'PROGRAM_SUPPORT'
    ? PROGRAM_OPENING_TRANSITION_MS
    : DEFAULT_SCENE_TRANSITION_MS
}

function prepareSceneTransition(fromScene, toScene, nextRuntime) {
  if (fromScene === toScene) return null
  stopSceneTransition()
  clearFlyingBarrages()
  if (
    reducedMotion.value
    || document.hidden
    || nextRuntime?.status === 'COMPLETED'
    || presentation.value.type !== 'NONE'
  ) return null

  const previousCopy = visualCopy(fromScene)
  const transitionId = ++sceneTransitionSerial
  const durationMs = sceneTransitionDuration(fromScene, toScene)
  sceneTransition.value = {
    id: transitionId,
    fromScene,
    toScene,
    fromTitle: previousCopy.title,
    fromSubtitle: previousCopy.subtitle,
    durationMs,
    openingProgram: fromScene === 'ASSEMBLY' && toScene === 'PROGRAM_SUPPORT',
  }
  return transitionId
}

function stopRaffleTimer() {
  if (raffleTimer) window.clearInterval(raffleTimer)
  raffleTimer = null
}

function randomStarCode() {
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26))
  return `${letter}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
}

function playRaffleReveal(winner) {
  stopRaffleTimer()
  if (!winner) {
    rafflePhase.value = 'waiting'
    raffleCode.value = '星海正在等待'
    return
  }
  if (reducedMotion.value) {
    rafflePhase.value = 'revealed'
    raffleCode.value = winner.publicStarId
    return
  }
  rafflePhase.value = 'rolling'
  raffleCode.value = randomStarCode()
  const startedAt = performance.now()
  raffleTimer = window.setInterval(() => {
    raffleCode.value = randomStarCode()
    if (performance.now() - startedAt >= 1800) {
      stopRaffleTimer()
      raffleCode.value = winner.publicStarId
      rafflePhase.value = 'revealed'
    }
  }, 70)
}

function removeFlyingBarrage(barrageId) {
  const animation = barrageAnimations.get(barrageId)
  if (animation) {
    animation.kill()
    activeAnimations.delete(animation)
    barrageAnimations.delete(barrageId)
  }
  flyingBarrages.value = flyingBarrages.value.filter((item) => item.barrageId !== barrageId)
}

function clearFlyingBarrages() {
  for (const animation of barrageAnimations.values()) {
    animation.kill()
    activeAnimations.delete(animation)
  }
  barrageAnimations.clear()
  flyingBarrages.value = []
}

function finishBarrageFlight(barrageId) {
  removeFlyingBarrage(barrageId)
}

async function animateBarrage(barrage) {
  if (!interactionVisible.value || reducedMotion.value || document.hidden) return
  const serial = barrageSerial++
  const flight = {
    barrageId: barrage.barrageId,
    text: barrage.text,
    lane: serial % BARRAGE_LANE_COUNT,
    durationMs: 9_800 + (serial % 5) * 420,
  }
  const overflow = [...flyingBarrages.value, flight]
    .slice(0, Math.max(0, flyingBarrages.value.length + 1 - MAX_FLYING_BARRAGES))
  for (const item of overflow) removeFlyingBarrage(item.barrageId)
  flyingBarrages.value = [...flyingBarrages.value, flight]
  await nextTick()
  const element = [...(root.value?.querySelectorAll('[data-barrage-id]') ?? [])]
    .find((item) => item.dataset.barrageId === barrage.barrageId)
  if (!element || !gsap || !root.value) return
  const viewportWidth = root.value.getBoundingClientRect().width
  const itemWidth = element.getBoundingClientRect().width
  const duration = flight.durationMs / 1000
  let timeline
  timeline = trackAnimation(gsap.timeline({
    defaults: { overwrite: 'auto' },
    onComplete: () => {
      activeAnimations.delete(timeline)
      barrageAnimations.delete(barrage.barrageId)
      flyingBarrages.value = flyingBarrages.value.filter(
        (item) => item.barrageId !== barrage.barrageId,
      )
    },
  }))
  barrageAnimations.set(barrage.barrageId, timeline)
  timeline
    .fromTo(element, { x: viewportWidth + 36 }, {
      x: -itemWidth - 48,
      duration,
      ease: 'none',
    }, 0)
    .fromTo(element, { autoAlpha: 0 }, {
      autoAlpha: 1,
      duration: 0.34,
      ease: 'power2.out',
    }, 0)
    .to(element, {
      autoAlpha: 0,
      duration: 0.42,
      ease: 'power2.in',
    }, Math.max(0, duration - 0.42))
}

async function playSceneTransition(transitionId) {
  if (!transitionId || reducedMotion.value || completed.value) {
    stopSceneTransition()
    return
  }

  await nextTick()
  if (sceneTransition.value?.id !== transitionId) return
  const cue = sceneTransition.value
  const layer = sceneTransitionLayer.value
  const nextSceneLayer = cue.toScene === 'PROGRAM_SUPPORT' ? null : sceneLayer.value
  if (!layer || (!cue.openingProgram && !nextSceneLayer)) {
    stopSceneTransition()
    return
  }

  if (!gsap) await loadGsap()
  sceneTransitionTimer = window.setTimeout(
    () => finishSceneTransition(transitionId),
    cue.durationMs + 360,
  )
  if (!gsap) {
    return
  }

  const outgoing = layer.querySelector('.v2-scene-transition__outgoing')
  const aperture = layer.querySelector('.v2-scene-transition__aperture')
  const rails = layer.querySelectorAll('.v2-scene-transition__rail')
  const fromBackdrop = cue.fromScene === 'PROGRAM_SUPPORT' ? 0 : 1
  const toBackdrop = cue.toScene === 'PROGRAM_SUPPORT' ? 0 : 1
  const incomingOffset = cue.toScene === 'PROGRAM_SUPPORT' ? -18 : 18

  sceneTransitionTimeline = gsap.timeline({
    defaults: { overwrite: 'auto' },
    onComplete: () => finishSceneTransition(transitionId),
  })
  trackAnimation(sceneTransitionTimeline)

  if (cue.openingProgram) {
    sceneTransitionTimeline
      .addLabel('handover', 0)
      .set(stageBackdrop.value, { autoAlpha: 1 }, 'handover')
      .to(stageBackdrop.value, {
        autoAlpha: 0,
        duration: 2.4,
        ease: 'sine.inOut',
      }, 'handover+=0.08')
    if (outgoing) {
      sceneTransitionTimeline.fromTo(outgoing, { autoAlpha: 1, y: 0, scale: 1 }, {
        autoAlpha: 0,
        y: -7,
        scale: 0.992,
        duration: 2.56,
        ease: 'sine.inOut',
      }, 'handover+=0.12')
    }
    sceneTransitionTimeline
      .add(() => {}, cue.durationMs / 1000)
    return
  }

  sceneTransitionTimeline.fromTo(stageBackdrop.value, { autoAlpha: fromBackdrop }, {
    autoAlpha: toBackdrop,
    duration: 1.36,
    ease: 'power2.inOut',
  }, 0)
  if (outgoing) {
    sceneTransitionTimeline.fromTo(outgoing, { autoAlpha: 1, y: 0, scale: 1 }, {
      autoAlpha: 0,
      y: -22,
      scale: 0.94,
      duration: 0.56,
      ease: 'power2.in',
    }, 0)
  }
  const incomingFrom = cue.toScene === 'PROGRAM_SUPPORT'
    ? { autoAlpha: 0, yPercent: -50, y: incomingOffset, scale: 0.985 }
    : { autoAlpha: 0, y: incomingOffset, scale: 0.985 }
  const incomingTo = cue.toScene === 'PROGRAM_SUPPORT'
    ? { autoAlpha: 1, yPercent: -50, y: 0, scale: 1, duration: 0.64, ease: 'power2.out' }
    : { autoAlpha: 1, y: 0, scale: 1, duration: 0.64, ease: 'power2.out' }
  sceneTransitionTimeline
    .fromTo(aperture, { autoAlpha: 0, scale: 0.34 }, {
      autoAlpha: 0.76,
      scale: 1.42,
      duration: 1.18,
      ease: 'power3.out',
    }, 0.08)
    .to(aperture, { autoAlpha: 0, duration: 0.48, ease: 'power2.out' }, 0.96)
    .fromTo(rails, { autoAlpha: 0, scaleY: 0.14 }, {
      autoAlpha: 0.7,
      scaleY: 1,
      stagger: 0.08,
      duration: 0.68,
      ease: 'power3.out',
    }, 0.16)
    .to(rails, { autoAlpha: 0, duration: 0.48, ease: 'power2.out' }, 0.9)
    .fromTo(nextSceneLayer, incomingFrom, incomingTo, 0.92)
    .add(() => {}, cue.durationMs / 1000)
}

async function playFinale() {
  if (finalePlayed.value || reducedMotion.value || !gsap) return
  finalePlayed.value = true
  await nextTick()
  if (!finaleLayer.value) return
  const halo = root.value?.querySelector('.v2-finale__halo')
  const copy = root.value?.querySelectorAll('.v2-finale__copy > *') ?? []
  let timeline
  timeline = trackAnimation(gsap.timeline({
    onComplete: () => activeAnimations.delete(timeline),
  }))
  timeline
    .fromTo(finaleLayer.value, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'power2.out' })
    .fromTo(halo, { scale: 0.72, opacity: 0 }, { scale: 1, opacity: 0.75, duration: 2.2, ease: 'power3.out' }, 0)
    .fromTo(copy, { y: 18, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.18, duration: 0.72, ease: 'power2.out' }, 1.5)
    .to(finaleLayer.value, { opacity: 1, duration: 2.2, ease: 'none' })
}

async function onLiveEvent(frame) {
  if (!snapshot.value) return
  snapshot.value.publicSeq = frame.streamSeq
  const payload = frame.payload
  if (frame.name === 'runtime.changed') {
    const previousScene = currentScene.value
    const nextScene = payload.runtime.currentScene ?? 'ASSEMBLY'
    const transitionId = prepareSceneTransition(previousScene, nextScene, payload.runtime)
    snapshot.value.runtime = payload.runtime
    renderer?.setMode(nextScene, {
      animate: Boolean(transitionId),
      durationMs: sceneTransition.value?.durationMs ?? DEFAULT_SCENE_TRANSITION_MS,
    })
    if (!transitionId && previousScene !== nextScene) snapStageBackdrop(nextScene)
    if (transitionId) await playSceneTransition(transitionId)
    if (payload.runtime.status === 'COMPLETED') {
      clearFlyingBarrages()
      await playFinale()
    }
  } else if (frame.name === 'presentation.changed') {
    const previousWinnerId = snapshot.value.raffle?.winners?.[0]?.raffleDrawId ?? null
    if (payload.presentation.type === 'RAFFLE') {
      await refresh()
      const nextWinner = snapshot.value.raffle?.winners?.[0] ?? null
      if (nextWinner?.raffleDrawId !== previousWinnerId) playRaffleReveal(nextWinner)
      else if (!nextWinner) playRaffleReveal(null)
    } else {
      snapshot.value.presentation = payload.presentation
      snapshot.value.presentationRevision = payload.presentationRevision
      stopRaffleTimer()
    }
    if (payload.presentation.type !== 'NONE') {
      stopSceneTransition()
      stopTrackedAnimations()
      clearFlyingBarrages()
    }
  } else if (frame.name === 'star.node.upserted') {
    const star = payload.star
    const index = snapshot.value.publicStars.findIndex((item) => item.publicStarId === star.publicStarId)
    if (index === -1) snapshot.value.publicStars.push(star)
    else snapshot.value.publicStars[index] = star
    renderer?.upsertStar(star)
  } else if (frame.name === 'aggregate.changed') {
    snapshot.value.aggregate = payload.aggregate
    snapshot.value.aggregateRevision = payload.aggregateRevision
  } else if (frame.name === 'barrage.published') {
    snapshot.value.interaction.interactionRevision = payload.interactionRevision
    snapshot.value.publishedBarrages = [...snapshot.value.publishedBarrages, payload.barrage].slice(-8)
    await animateBarrage(payload.barrage)
  } else if (frame.name === 'barrage.removed') {
    snapshot.value.interaction.interactionRevision = payload.interactionRevision
    snapshot.value.publishedBarrages = snapshot.value.publishedBarrages.filter((item) => !payload.barrageIds.includes(item.barrageId))
    for (const barrageId of payload.barrageIds) removeFlyingBarrage(barrageId)
  } else if (frame.name === 'barrage.cleared') {
    snapshot.value.interaction = { ...snapshot.value.interaction, interactionRevision: payload.interactionRevision, displayBatch: payload.displayBatch }
    snapshot.value.publishedBarrages = []
    clearFlyingBarrages()
  } else if (frame.name === 'barrage.pause.changed') {
    snapshot.value.interaction = { ...snapshot.value.interaction, interactionRevision: payload.interactionRevision, barragePaused: payload.paused }
  } else if (frame.name === 'gift.sent') {
    snapshot.value.interaction.interactionRevision = payload.interactionRevision
  } else if (frame.name === 'program.changed') {
    await refresh()
  }
}

const realtime = useV2ScreenRealtime({ snapshot, refresh, onLiveEvent })

watch(currentScene, (next) => {
  document.documentElement.classList.toggle('v2-program-overlay', next === 'PROGRAM_SUPPORT' && !completed.value)
})
watch(completed, (next) => {
  document.documentElement.classList.toggle('v2-program-overlay', currentScene.value === 'PROGRAM_SUPPORT' && !next)
})

watch(reducedMotion, (next) => {
  renderer?.setReduced(next)
  if (next) {
    stopSceneTransition()
    stopTrackedAnimations()
    clearFlyingBarrages()
    stopRaffleTimer()
    const animatedElements = root.value?.querySelectorAll(
      '.v2-finale, .v2-finale__halo, .v2-finale__copy > *, [data-barrage-id]',
    ) ?? []
    for (const element of animatedElements) {
      element.style.removeProperty('opacity')
      element.style.removeProperty('visibility')
      element.style.removeProperty('transform')
    }
    if (raffleActive.value) playRaffleReveal(raffleWinner.value)
  } else {
    void loadGsap()
  }
})

function onVisibilityChange() {
  if (document.hidden) {
    stopSceneTransition()
    clearFlyingBarrages()
  }
}

onMounted(async () => {
  document.documentElement.classList.add('v2-screen-active')
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (canvas.value) {
    renderer = createGalaxyRenderer(canvas.value, {
      reduced: reducedMotion.value,
      backdropUrl: deepSpaceDustBackdrop,
    })
  }
  if (!reducedMotion.value) await loadGsap()
  try { await realtime.connect() } catch (error) { errorMessage.value = error?.message ?? '大屏启动失败' }
})

onBeforeUnmount(() => {
  disposed = true
  document.documentElement.classList.remove('v2-screen-active', 'v2-program-overlay')
  document.removeEventListener('visibilitychange', onVisibilityChange)
  renderer?.destroy()
  stopSceneTransition({ snap: false })
  stopTrackedAnimations()
  clearFlyingBarrages()
  gsapContext?.revert()
  stopRaffleTimer()
})
</script>

<template>
  <section
    ref="root"
    class="v2-screen"
    :class="[
      `scene-${currentScene.toLowerCase()}`,
      {
        'is-completed': completed,
        'is-scene-transitioning': Boolean(sceneTransition),
        'is-opening-program': openingProgram,
        'is-gsap-ready': gsapReady,
      },
    ]"
    :data-scene-transition="sceneTransition ? `${sceneTransition.fromScene}->${sceneTransition.toScene}` : 'idle'"
    data-program-transition-style="stellar-collapse-supernova-reveal"
    data-transition-architecture="native-webgl2-supernova-with-canvas2d-fallback"
    data-screen-palette="orbital-signal-spectrum"
    data-visual-palette="orbital-signal-spectrum"
  >
    <div ref="stageBackdrop" class="v2-stage-backdrop" aria-hidden="true"></div>
    <canvas ref="canvas" class="v2-galaxy" aria-hidden="true"></canvas>

    <p v-if="connectionLabel || errorMessage" class="v2-signal" role="status">
      {{ errorMessage || connectionLabel }}
    </p>

    <template v-if="snapshot">
      <div v-if="sceneTransition" ref="sceneTransitionLayer" class="v2-scene-transition" aria-hidden="true">
        <div class="v2-scene-transition__aperture"><i></i></div>
        <div class="v2-scene-transition__rails">
          <i class="v2-scene-transition__rail is-left"></i>
          <i class="v2-scene-transition__rail is-right"></i>
        </div>
        <div v-if="sceneTransition.fromScene !== 'PROGRAM_SUPPORT'" class="v2-scene-transition__outgoing">
          <p class="v2-kicker">SYSU · WELCOME NIGHT</p>
          <h2>{{ sceneTransition.fromTitle }}</h2>
          <p>{{ sceneTransition.fromSubtitle }}</p>
        </div>
      </div>

      <div v-if="completed || previewingFinale" ref="finaleLayer" class="v2-finale">
        <div class="v2-finale__halo" aria-hidden="true"></div>
        <div class="v2-finale__copy">
          <p v-if="previewingFinale" class="v2-finale__preview">排练预览 · 不代表活动已结束</p>
          <p class="v2-kicker">SYSU · WELCOME NIGHT</p>
          <h1>{{ completed ? '今夜的星河，已经成形' : '星河终章预览' }}</h1>
          <p>{{ completed ? '本场活动已结束，感谢每一颗星的抵达。' : '终章画面仅供排练检查。' }}</p>
          <dl class="v2-finale__metrics">
            <div><dt>抵达星点</dt><dd>{{ snapshot.aggregate.publicStarCount }}</dd></div>
            <div><dt>完成入场</dt><dd>{{ snapshot.aggregate.admittedCount }}</dd></div>
            <div><dt>累计星光</dt><dd>{{ snapshot.aggregate.totalStarlight }}</dd></div>
            <div><dt>协同点亮</dt><dd>{{ snapshot.aggregate.cooperativeLightCount }}</dd></div>
          </dl>
        </div>
      </div>

      <div v-else-if="raffleActive" class="v2-raffle" :class="`is-${rafflePhase}`">
        <div class="v2-raffle__orbit" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="v2-raffle__content">
          <p class="v2-kicker">MID-SHOW · STAR DRAW</p>
          <h1>星河幸运坐标</h1>
          <p class="v2-raffle__hint">{{ rafflePhase === 'waiting' ? '等待主控抽取第一颗幸运星' : rafflePhase === 'rolling' ? '正在穿越星海定位坐标' : '恭喜这颗幸运星' }}</p>
          <strong class="v2-raffle__code">{{ raffleCode }}</strong>
          <div class="v2-raffle__meta"><span>已抽取 {{ raffle?.winners.length ?? 0 }}</span><span>剩余 {{ raffle?.remainingCount ?? 0 }}</span></div>
          <ol v-if="raffle?.winners.length" class="v2-raffle__history" aria-label="本轮中奖星星代号">
            <li v-for="item in raffle.winners.slice(0, 6)" :key="item.raffleDrawId" :class="{ current: item.raffleDrawId === raffleWinner?.raffleDrawId }">{{ item.publicStarId }}</li>
          </ol>
        </div>
      </div>

      <div v-else-if="currentScene !== 'PROGRAM_SUPPORT'" ref="sceneLayer" class="v2-scene-copy">
        <p v-if="runtime.mode === 'REHEARSAL'" class="v2-rehearsal">排练模式</p>
        <p class="v2-kicker">SYSU · WELCOME NIGHT</p>
        <h1>{{ scene.title }}</h1>
        <p>{{ scene.subtitle }}</p>
      </div>

      <div v-if="flyingBarrages.length" class="v2-barrage-stream" aria-live="polite">
        <p
          v-for="item in flyingBarrages"
          :key="item.barrageId"
          class="v2-barrage-stream__item"
          :data-barrage-id="item.barrageId"
          :style="{
            top: `${8 + item.lane * 8.8}vh`,
            '--v2-barrage-duration': `${item.durationMs}ms`,
          }"
          @animationend="finishBarrageFlight(item.barrageId)"
        >
          {{ item.text }}
        </p>
      </div>
    </template>
  </section>
</template>

<style>
html.v2-screen-active,html.v2-screen-active body{overflow:hidden;background:var(--color-orbit-midnight)}
html.v2-screen-active .app-shell.route-screen{width:100%;height:100vh;min-height:0;padding:0;background:var(--color-orbit-midnight)}
html.v2-screen-active .route-screen .page-content{width:100%;height:100%;min-height:0;padding:0;align-items:stretch}
html.v2-screen-active .route-screen .page-content>*{animation:none}
html.v2-screen-active .ambient-field--screen{display:none}
html.v2-program-overlay,html.v2-program-overlay body,html.v2-program-overlay .app-shell.route-screen{background:transparent!important}
</style>

<style scoped>
.v2-screen{position:relative;width:100%;height:100vh;overflow:hidden;color:var(--color-orbit-text-primary);background:transparent;font-family:var(--font-family-cjk);isolation:isolate}
.v2-stage-backdrop{position:absolute;z-index:0;inset:0;visibility:visible;opacity:1;background:radial-gradient(ellipse at 58% 44%,rgba(66,126,238,.18) 0,rgba(13,27,52,.54) 24%,rgba(1,3,10,.94) 58%,transparent 80%),radial-gradient(circle at 82% 15%,rgba(74,219,233,.065),transparent 32%),radial-gradient(circle at 18% 82%,rgba(126,176,255,.05),transparent 38%),linear-gradient(132deg,#050b18 0,var(--color-orbit-midnight) 58%,#020611 100%)}
.v2-stage-backdrop::after{position:absolute;inset:0;background:radial-gradient(ellipse at 55% 47%,transparent 0 43%,rgba(0,2,8,.18) 70%,rgba(0,1,5,.76) 100%),linear-gradient(108deg,transparent 18%,rgba(126,176,255,.026) 42%,transparent 63%);content:''}
.scene-program_support .v2-stage-backdrop{visibility:hidden;opacity:0}.is-scene-transitioning .v2-stage-backdrop{visibility:visible;transition:opacity 1.36s cubic-bezier(.45,0,.2,1)}.is-opening-program .v2-stage-backdrop{visibility:visible;opacity:1}.is-gsap-ready.is-scene-transitioning .v2-stage-backdrop{transition:none}
.v2-galaxy{position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none}
.v2-signal{position:absolute;z-index:9;top:24px;right:28px;margin:0;padding:8px 12px;border:1px solid rgba(255,200,102,.45);color:var(--color-orbit-warm);background:rgba(7,12,25,.86);font-family:var(--font-family-signal);font-size:14px}
.v2-scene-copy{position:absolute;z-index:2;inset:0;display:grid;place-content:center;text-align:center;pointer-events:none}
.v2-kicker,.v2-rehearsal{margin:0 0 16px;color:var(--color-orbit-text-secondary);font-family:var(--font-family-signal);font-size:clamp(12px,1vw,18px);letter-spacing:.24em}.v2-rehearsal{color:var(--color-orbit-warm);letter-spacing:.12em}
.v2-scene-copy h1,.v2-finale h1{margin:0;font-family:var(--font-family-display);font-size:clamp(56px,7vw,128px);line-height:1.02;font-weight:620;letter-spacing:.04em}.scene-assembly .v2-scene-copy h1{text-shadow:0 12px 44px rgba(0,0,0,.7)}
.v2-scene-copy>p:last-of-type,.v2-finale__copy>p{font-size:clamp(18px,1.45vw,28px);color:var(--color-orbit-text-secondary)}
.scene-assembly .v2-scene-copy,.is-opening-program .v2-scene-transition__outgoing{place-content:end start;padding:0 0 8vh 6.5vw;text-align:left}
.scene-assembly .v2-scene-copy h1,.is-opening-program .v2-scene-transition__outgoing h2{font-size:clamp(54px,5.1vw,96px);font-weight:560;letter-spacing:.1em}
.scene-assembly .v2-scene-copy>p:last-of-type,.is-opening-program .v2-scene-transition__outgoing>p:last-of-type{max-width:680px;color:var(--color-orbit-text-tertiary);font-size:clamp(16px,1.15vw,22px);letter-spacing:.03em}
.v2-scene-transition{position:absolute;z-index:3;inset:0;overflow:hidden;pointer-events:none}
.v2-scene-transition__outgoing{position:absolute;z-index:5;inset:0;display:grid;place-content:center;text-align:center;transform-origin:50% 50%}
.v2-scene-transition__outgoing h2{margin:0;font-family:var(--font-family-display);font-size:clamp(56px,7vw,128px);line-height:1.02;font-weight:620;letter-spacing:.04em;text-shadow:0 12px 44px rgba(0,0,0,.7)}
.v2-scene-transition__outgoing>p:last-of-type{font-size:clamp(18px,1.45vw,28px);color:var(--color-orbit-text-secondary)}
.v2-scene-transition__aperture{position:absolute;z-index:2;top:50%;left:50%;width:min(54vw,980px);height:min(24vw,430px);border:1px solid rgba(164,204,255,.38);border-radius:50%;box-shadow:0 0 34px rgba(91,151,227,.16);transform:translate(-50%,-50%)}
.v2-scene-transition__aperture i{position:absolute;top:50%;left:50%;width:8px;height:8px;border-radius:50%;background:#ffe2a0;box-shadow:0 0 18px rgba(255,218,143,.78);transform:translate(-50%,-50%)}
.v2-scene-transition__rails{position:absolute;z-index:2;inset:0}
.v2-scene-transition__rail{position:absolute;top:7vh;bottom:7vh;width:1px;background:linear-gradient(180deg,transparent,rgba(139,190,255,.74) 31%,rgba(255,219,146,.64) 50%,rgba(139,190,255,.74) 69%,transparent);box-shadow:0 0 16px rgba(103,164,240,.3);transform-origin:50% 50%}
.v2-scene-transition__rail.is-left{left:16.5vw}.v2-scene-transition__rail.is-right{right:16.5vw}
.is-opening-program :is(.v2-scene-transition__aperture,.v2-scene-transition__rails){display:none}
.is-scene-transitioning :is(.v2-stage-backdrop,.v2-scene-copy,.v2-scene-transition__outgoing,.v2-scene-transition__aperture,.v2-scene-transition__rail){will-change:transform,opacity}
.is-scene-transitioning:not(.is-gsap-ready) .v2-scene-transition__outgoing{animation:v2-scene-outgoing .58s cubic-bezier(.4,0,1,1) both}
.is-scene-transitioning:not(.is-gsap-ready) .v2-scene-transition__aperture{animation:v2-scene-aperture 1.46s cubic-bezier(.2,.8,.2,1) both}
.is-scene-transitioning:not(.is-gsap-ready) .v2-scene-transition__rail{animation:v2-scene-rail 1.38s cubic-bezier(.2,.8,.2,1) both}
.is-scene-transitioning:not(.is-gsap-ready) .v2-scene-copy{--v2-incoming-y:18px;animation:v2-scene-incoming 1.58s cubic-bezier(.2,.8,.2,1) both}
.is-opening-program:not(.is-gsap-ready) .v2-stage-backdrop{animation:v2-program-backdrop 8.4s linear both}
.is-opening-program:not(.is-gsap-ready) .v2-scene-transition__outgoing{animation:v2-program-outgoing 8.4s cubic-bezier(.45,0,.2,1) both}
.v2-barrage-stream{position:absolute;z-index:4;inset:0;overflow:hidden;pointer-events:none}
.v2-barrage-stream__item{position:absolute;left:0;max-width:72vw;margin:0;padding:0;color:#f8fbff;background:none;border:0;font-size:clamp(25px,1.75vw,38px);font-weight:560;line-height:1.18;letter-spacing:.04em;white-space:nowrap;-webkit-text-stroke:.35px rgba(4,10,22,.7);text-shadow:0 2px 5px rgba(0,0,0,.96),0 0 15px rgba(104,171,255,.34);opacity:0;transform:translateX(calc(100vw + 40px));will-change:transform,opacity;animation:v2-barrage-flight var(--v2-barrage-duration,10s) linear both}
.is-gsap-ready .v2-barrage-stream__item{animation:none}
@keyframes v2-scene-outgoing{to{opacity:0;transform:translateY(-22px) scale(.94)}}
@keyframes v2-scene-aperture{0%{opacity:0;transform:translate(-50%,-50%) scale(.34)}62%{opacity:.76}100%{opacity:0;transform:translate(-50%,-50%) scale(1.42)}}
@keyframes v2-scene-rail{0%{opacity:0;transform:scaleY(.14)}52%{opacity:.7;transform:scaleY(1)}100%{opacity:0;transform:scaleY(1)}}
@keyframes v2-scene-incoming{0%,58%{opacity:0;transform:translateY(var(--v2-incoming-y)) scale(.985)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes v2-program-backdrop{0%,3%{visibility:visible;opacity:1}13%{visibility:visible;opacity:.72}29%,100%{visibility:hidden;opacity:0}}
@keyframes v2-program-outgoing{0%,4%{opacity:1;transform:translateY(0) scale(1)}14%{opacity:.82;transform:translateY(-2px) scale(.998)}32%,100%{opacity:0;transform:translateY(-10px) scale(.985)}}
@keyframes v2-barrage-flight{0%{opacity:0;transform:translateX(calc(100vw + 40px))}4%{opacity:1}96%{opacity:1}100%{opacity:0;transform:translateX(-110%)}}
.v2-raffle{position:absolute;z-index:7;inset:0;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% 46%,rgba(27,48,94,.94),rgba(3,7,17,.985) 68%);text-align:center}.v2-raffle__content{position:relative;z-index:2;width:min(1280px,88vw)}.v2-raffle h1{margin:0;font-family:var(--font-family-display);font-size:clamp(48px,5vw,92px);letter-spacing:.08em}.v2-raffle__hint{margin:22px 0 8px;color:var(--color-orbit-text-secondary);font-size:clamp(18px,1.4vw,28px)}.v2-raffle__code{display:block;margin:12px 0 28px;color:#ffe8a4;font:700 clamp(74px,11vw,190px)/1 var(--font-family-data);letter-spacing:.08em;text-shadow:0 0 22px rgba(255,217,119,.55),0 0 72px rgba(83,150,255,.4)}.v2-raffle.is-rolling .v2-raffle__code{filter:blur(1px);opacity:.85}.v2-raffle.is-revealed .v2-raffle__code{animation:raffle-reveal .75s cubic-bezier(.2,.8,.2,1)}.v2-raffle__meta{display:flex;justify-content:center;gap:36px;color:var(--color-orbit-text-tertiary);font-family:var(--font-family-data);font-size:18px}.v2-raffle__history{list-style:none;display:flex;justify-content:center;flex-wrap:wrap;gap:10px;margin:30px 0 0;padding:0}.v2-raffle__history li{padding:8px 15px;border:1px solid rgba(145,178,226,.3);color:var(--color-orbit-text-tertiary);background:rgba(7,14,29,.5);font-family:var(--font-family-data)}.v2-raffle__history li.current{border-color:rgba(255,222,139,.75);color:#ffe7a6}.v2-raffle__orbit{position:absolute;width:min(76vw,1180px);aspect-ratio:1;border-radius:50%;border:1px solid rgba(117,168,242,.12);animation:raffle-orbit 20s linear infinite}.v2-raffle__orbit i{position:absolute;width:9px;height:9px;border-radius:50%;background:#ffe4a0;box-shadow:0 0 24px #ffe4a0}.v2-raffle__orbit i:nth-child(1){top:11%;left:22%}.v2-raffle__orbit i:nth-child(2){top:59%;right:2%}.v2-raffle__orbit i:nth-child(3){bottom:7%;left:34%}@keyframes raffle-orbit{to{transform:rotate(360deg)}}@keyframes raffle-reveal{0%{transform:scale(.78);opacity:.35}65%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
.v2-finale{position:absolute;z-index:8;inset:0;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% 48%,rgba(22,51,101,.72),rgba(2,5,12,.97) 68%)}.v2-finale__halo{position:absolute;width:min(70vw,1100px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,rgba(146,192,255,.26),rgba(88,131,216,.08) 38%,transparent 68%)}.v2-finale__copy{position:relative;z-index:1;width:min(1500px,88vw);text-align:center}.v2-finale__preview{color:#ffc86c!important;font-weight:700}.v2-finale__metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin:44px 0 0;font-family:var(--font-family-data)}.v2-finale__metrics div{padding:18px;border-top:1px solid rgba(170,202,246,.34)}.v2-finale__metrics dt{color:var(--color-orbit-text-tertiary);font-size:16px}.v2-finale__metrics dd{margin:5px 0 0;font-size:clamp(28px,3vw,52px);font-weight:700}
@media(prefers-reduced-motion:reduce){.v2-scene-transition,.v2-barrage-stream{display:none}.v2-screen *{animation:none!important;transition:none!important}}
</style>
