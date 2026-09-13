<script setup>
import { createGiftFlightQueue } from "../../rendering/gift-flight-queue"
import { useBuzzerCountdown } from '../../composables/useBuzzerCountdown'
import GiftSignalIcon from '../student/GiftSignalIcon.vue'
import ArrivalCount from '../../components/ArrivalCount.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useReducedMotion } from '../../composables/useReducedMotion'
import { useV2ScreenRealtime } from '../../composables/useV2ScreenRealtime'
import { v2ScreenApi } from '../../services/api'
import { barragePaint } from '../../services/barrage-colors'
import { programCredits } from '../../services/program-credits'
import { interactionLabel } from '../../services/interaction-label'
import GiftStarshipFlight from '../../components/GiftStarshipFlight.vue'
import ProgramStageBackground from '../../components/ProgramStageBackground.vue'
import { CINEMA_TIMING } from '../../rendering/cinema-timing'
import { createGalaxyRenderer } from './galaxy-renderer'
import { createCinematicGalaxyScene, projectPublicStar } from './cinematic-galaxy-scene'
import ClosingCredits from './ClosingCredits.vue'
import AwardStage from './AwardStage.vue'
import { createRaffleReveal } from './raffle-reveal'
import { cooperativeLightProgress, screenPresentationCanReplace, screenSnapshotCanReplace } from './v2-screen-state'

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
const giftFlights = ref([])
const errorMessage = ref('')
const route = useRoute()
const transparentMedia = computed(() => route.query.media === 'overlay')
const programCue = ref(null)
const pageHidden = ref(document.hidden)
let programCueTimer = null
const router = useRouter()
const systemReducedMotion = useReducedMotion()
const motionPreference = computed(() => ['system', 'reduced'].includes(route.query.motion) ? route.query.motion : 'full')
const reducedMotion = computed(() => motionPreference.value === 'reduced'
  || (motionPreference.value === 'system' && systemReducedMotion.value))
const showScreenSettings = computed(() => route.query.settings === '1')
const gsapReady = ref(false)
const sceneTransition = ref(null)
const finalePlayed = ref(false)
const finaleMotion = ref(false)
const raffleDisplay = ref({ phase: 'waiting', code: '星海正在等待', winner: null, history: [], animateReveal: false })
const raffleReveal = createRaffleReveal({ onChange: (next) => { raffleDisplay.value = next } })
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
const barrageTimers = new Map()
const giftFlightQueue = createGiftFlightQueue({
  duration: () => reducedMotion.value ? CINEMA_TIMING.starshipStaticMs : CINEMA_TIMING.starshipScreenMs + 200,
  gap: CINEMA_TIMING.starshipGapMs,
  onChange: flight => {
    giftFlights.value = flight ? [flight] : []

  },
})
const seenGiftFlights = new Set()
let barrageSerial = 0

const DEFAULT_SCENE_TRANSITION_MS = 1800
const PROGRAM_OPENING_TRANSITION_MS = CINEMA_TIMING.openingMs
const MAX_FLYING_BARRAGES = 24
const BARRAGE_LANE_COUNT = 10
const MAX_STATIC_BARRAGES = 3

function clearGiftFlights() {
  giftFlightQueue.clear()
}

function launchGiftFlight(gift) {
  if (!interactionVisible.value || snapshot.value?.currentProgram?.id !== gift.programId || document.hidden || gift.showStarship !== true || gift.giftId !== 'gift-starship' || seenGiftFlights.has(gift.giftEventId)) return
  seenGiftFlights.add(gift.giftEventId)
  if (seenGiftFlights.size > 256) seenGiftFlights.delete(seenGiftFlights.values().next().value)
  const flight = { id: gift.giftEventId, quantity: gift.quantity ?? 1 }
  giftFlightQueue.enqueue(flight)
}

function applyGiftEvent(gift) {
  if (snapshot.value?.currentProgram?.id === gift.programId) {
    const catalogGift = snapshot.value.currentProgram.giftCatalog?.find(item => item.id === gift.giftId)
    if (catalogGift) catalogGift.sentCount = gift.sentCount ?? (catalogGift.sentCount ?? 0) + 1
  }
  launchGiftFlight(gift)
}

const runtime = computed(() => snapshot.value?.runtime)
const presentation = computed(() => snapshot.value?.presentation ?? { type: 'NONE' })
const currentScene = computed(() => runtime.value?.currentScene ?? 'ASSEMBLY')
const completed = computed(() => runtime.value?.status === 'COMPLETED')
const previewingFinale = computed(() => presentation.value.type === 'FINALE_PREVIEW')
const raffleActive = computed(() => presentation.value.type === 'RAFFLE')
const raffle = computed(() => snapshot.value?.raffle)
const liveInteraction = computed(() => snapshot.value?.liveInteraction ?? { phase: 'IDLE', voteCandidates: [] })
const buzzerCountdown = useBuzzerCountdown(liveInteraction, computed(() => snapshot.value?.generatedAt))
const giftRoomStats = computed(() => snapshot.value?.currentProgram?.kind === 'PERFORMANCE'
  ? (snapshot.value.currentProgram.giftCatalog ?? [])
  : [])
const cooperative = computed(() => cooperativeLightProgress(snapshot.value?.aggregate))
const ceremonyStage = computed(() => snapshot.value?.stage ?? { mode: 'PROGRAM', revision: 0, revealed: false, page: 0, totalPages: 1, award: null })
const ceremonyVisible = computed(() => currentScene.value === 'PROGRAM_SUPPORT' && !openingProgram.value && !completed.value
  && presentation.value.type === 'NONE' && liveInteraction.value.phase === 'IDLE'
  && (ceremonyStage.value.mode !== 'PROGRAM' || !snapshot.value?.currentProgram))
const interactionVisible = computed(() =>
  runtime.value?.status === 'RUNNING'
  && currentScene.value === 'PROGRAM_SUPPORT'
  && presentation.value.type === 'NONE'
  && liveInteraction.value.phase === 'IDLE'
  && !ceremonyVisible.value
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
  if (disposed) return
  if (!screenSnapshotCanReplace(snapshot.value, next)) {
    if (screenPresentationCanReplace(snapshot.value, next)) {
      snapshot.value.presentation = next.presentation
      snapshot.value.presentationRevision = next.presentationRevision
      snapshot.value.raffle = next.raffle
      syncRaffleDisplay(!reconnect)
    }
    return
  }
  const hadSnapshot = snapshot.value !== null
  const newEpoch = snapshot.value?.resetEpoch !== next.resetEpoch
  const wasCompleted = snapshot.value?.runtime.status === 'COMPLETED'
  if (newEpoch) finalePlayed.value = false
  if (!hadSnapshot || reconnect || newEpoch) {
    finaleMotion.value = false
    stopSceneTransition({ snap: false })
    stopTrackedAnimations()
    clearFinaleMotionStyles()
    clearFlyingBarrages()
    clearGiftFlights()
    if (newEpoch) seenGiftFlights.clear()
  }
  snapshot.value = next
  syncRaffleDisplay(hadSnapshot && !reconnect && !newEpoch)
  renderer?.setCooperativeProgress(next.aggregate)
  renderer?.setStars(next.publicStars)
  if (!sceneTransition.value) renderer?.setMode(next.runtime.currentScene, { animate: false })
  if (!hadSnapshot || reconnect || newEpoch) snapStageBackdrop(next.runtime.currentScene)
  if (hadSnapshot && !reconnect && !newEpoch && !wasCompleted && next.runtime.status === 'COMPLETED') {
    void playFinale()
  }
}

function syncRaffleDisplay(animate) {
  raffleReveal.sync(raffle.value?.winners ?? [], {
    animate: animate && raffleActive.value && !reducedMotion.value && !document.hidden,
  })
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

function clearFinaleMotionStyles() {
  const elements = root.value?.querySelectorAll('.v2-finale, .v2-finale__halo, .v2-finale__copy > *') ?? []
  for (const element of elements) {
    element.style.removeProperty('opacity')
    element.style.removeProperty('visibility')
    element.style.removeProperty('transform')
  }
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
  // GSAP's ticker and wall-clock adjustments must not shorten the native shot.
  const remaining = sceneTransition.value.durationMs - (performance.now() - sceneTransition.value.startedAt)
  if (remaining > 16) {
    clearSceneTransitionTimer()
    sceneTransitionTimer = window.setTimeout(() => finishSceneTransition(transitionId), remaining)
    return
  }
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
    startedAt: performance.now(),
    openingProgram: fromScene === 'ASSEMBLY' && toScene === 'PROGRAM_SUPPORT',
  }
  return transitionId
}

function removeFlyingBarrage(barrageId) {
  window.clearTimeout(barrageTimers.get(barrageId))
  barrageTimers.delete(barrageId)
  const animation = barrageAnimations.get(barrageId)
  if (animation) {
    animation.kill()
    activeAnimations.delete(animation)
    barrageAnimations.delete(barrageId)
  }
  flyingBarrages.value = flyingBarrages.value.filter((item) => item.barrageId !== barrageId)
}

function clearFlyingBarrages() {
  for (const timer of barrageTimers.values()) window.clearTimeout(timer)
  barrageTimers.clear()
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
  if (!interactionVisible.value || document.hidden) return
  const staticDisplay = reducedMotion.value
  const serial = barrageSerial++
  const flight = {
    barrageId: barrage.barrageId,
    text: barrage.text,
    colorStyle: barrage.colorStyle,
    lane: serial % BARRAGE_LANE_COUNT,
    durationMs: 9_800 + (serial % 5) * 420,
    gsapAnimated: Boolean(gsap) && !staticDisplay,
  }
  const capacity = staticDisplay ? MAX_STATIC_BARRAGES : MAX_FLYING_BARRAGES
  const overflow = [...flyingBarrages.value, flight]
    .slice(0, Math.max(0, flyingBarrages.value.length + 1 - capacity))
  for (const item of overflow) removeFlyingBarrage(item.barrageId)
  flyingBarrages.value = [...flyingBarrages.value, flight]
  // Both CSS fallback and static text expire even when animationend is lost.
  barrageTimers.set(flight.barrageId, window.setTimeout(
    () => removeFlyingBarrage(flight.barrageId), flight.durationMs + 400,
  ))
  if (staticDisplay) return
  await nextTick()
  const element = [...(root.value?.querySelectorAll('[data-barrage-id]') ?? [])]
    .find((item) => item.dataset.barrageId === barrage.barrageId)
  if (!element || !flight.gsapAnimated || !gsap || !root.value || reducedMotion.value || document.hidden) return
  const viewportWidth = root.value.getBoundingClientRect().width
  const itemWidth = element.getBoundingClientRect().width
  const duration = flight.durationMs / 1000
  let timeline
  timeline = trackAnimation(gsap.timeline({
    defaults: { overwrite: 'auto' },
    onComplete: () => {
      activeAnimations.delete(timeline)
      barrageAnimations.delete(barrage.barrageId)
      removeFlyingBarrage(barrage.barrageId)
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

  sceneTransitionTimer = window.setTimeout(
    () => finishSceneTransition(transitionId),
    cue.durationMs + 360,
  )
  if (!gsap) await loadGsap()
  if (!gsap || disposed || reducedMotion.value || document.hidden || sceneTransition.value?.id !== transitionId) {
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

async function playFinale({ preview = false } = {}) {
  if ((!preview && finalePlayed.value) || reducedMotion.value || document.hidden) return
  if (!preview) finalePlayed.value = true
  finaleMotion.value = true
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
      await refresh()
      clearFlyingBarrages()
      await playFinale()
    }
  } else if (frame.name === 'presentation.changed') {
    const leavingFinalePreview = previewingFinale.value && payload.presentation.type !== 'FINALE_PREVIEW'
    if (['RAFFLE', 'FINALE_PREVIEW'].includes(payload.presentation.type)) {
      await refresh()
    } else {
      snapshot.value.presentation = payload.presentation
      snapshot.value.presentationRevision = payload.presentationRevision
      raffleReveal.sync(snapshot.value.raffle?.winners ?? [])
    }
    if (payload.presentation.type !== 'NONE' || leavingFinalePreview) {
      stopSceneTransition()
      stopTrackedAnimations()
      clearFinaleMotionStyles()
      clearFlyingBarrages()
      clearGiftFlights()
    }
    if (payload.presentation.type === 'FINALE_PREVIEW') await playFinale({ preview: true })
  } else if (frame.name === 'star.node.upserted') {
    const star = payload.star
    const index = snapshot.value.publicStars.findIndex((item) => item.publicStarId === star.publicStarId)
    if (index === -1) snapshot.value.publicStars.push(star)
    else snapshot.value.publicStars[index] = star
    renderer?.upsertStar(star)
  } else if (frame.name === 'aggregate.changed') {
    snapshot.value.aggregate = payload.aggregate
    snapshot.value.aggregateRevision = payload.aggregateRevision
    renderer?.setCooperativeProgress(payload.aggregate, { animate: true })
  } else if (frame.name === 'barrage.published') {
    snapshot.value.interaction.interactionRevision = payload.interactionRevision
    snapshot.value.publishedBarrages = [...snapshot.value.publishedBarrages, payload.barrage].slice(-8)
    await animateBarrage(payload.barrage)
  } else if (frame.name === 'barrage.removed') {
    snapshot.value.interaction.interactionRevision = payload.interactionRevision
    snapshot.value.publishedBarrages = snapshot.value.publishedBarrages.filter((item) => !payload.barrageIds.includes(item.barrageId))
    if (snapshot.value.closingRecap) {
      snapshot.value.closingRecap.barrages = (snapshot.value.closingRecap.barrages ?? []).filter(item => !payload.barrageIds.includes(item.barrageId))
    }
    for (const barrageId of payload.barrageIds) removeFlyingBarrage(barrageId)
    if (completed.value || previewingFinale.value) await refresh()
  } else if (frame.name === 'barrage.cleared') {
    snapshot.value.interaction = { ...snapshot.value.interaction, interactionRevision: payload.interactionRevision, displayBatch: payload.displayBatch }
    snapshot.value.publishedBarrages = []
    if (snapshot.value.closingRecap) snapshot.value.closingRecap.barrages = []
    clearFlyingBarrages()
  } else if (frame.name === 'barrage.pause.changed') {
    snapshot.value.interaction = { ...snapshot.value.interaction, interactionRevision: payload.interactionRevision, barragePaused: payload.paused }
  } else if (frame.name === 'gift.sent') {
    snapshot.value.interaction.interactionRevision = payload.interactionRevision
    applyGiftEvent(payload.gift)
  } else if (frame.name === 'program.changed') {
    const changed = snapshot.value?.currentProgram?.id !== payload.currentProgram?.id
    await refresh()
    if (changed) { clearTimeout(programCueTimer); programCue.value = null; clearGiftFlights(); clearFlyingBarrages() }
    if (changed && interactionVisible.value) {
      programCue.value = snapshot.value.currentProgram
      programCueTimer = setTimeout(() => { programCue.value = null }, 8500)
    }
  } else if (frame.name === 'live.interaction.changed') {
    snapshot.value.interaction.interactionRevision = payload.interactionRevision
    snapshot.value.liveInteraction = payload.liveInteraction
    clearFlyingBarrages()
    clearGiftFlights()
  }
}

const realtime = useV2ScreenRealtime({ snapshot, refresh, onLiveEvent })

watch(() => realtime.state.value, (next) => {
  if (next !== 'online') {
    finaleMotion.value = false
    stopSceneTransition()
    stopTrackedAnimations()
    clearFinaleMotionStyles()
    clearFlyingBarrages()
    clearGiftFlights()
    renderer?.setMode(currentScene.value, { animate: false })
    raffleReveal.sync(raffle.value?.winners ?? [])
  }
})

watch(interactionVisible, (visible) => {
  if (!visible) { clearFlyingBarrages(); clearGiftFlights() }
})

watch(transparentMedia, () => renderer?.setProgramBackdrop(false))

watch(() => runtime.value?.status, (status) => {
  if (status !== 'RUNNING') stopSceneTransition()
})

watch([currentScene, () => runtime.value?.status, presentation], () => {
  if (!interactionVisible.value) { clearTimeout(programCueTimer); programCue.value = null }
})

watch(currentScene, (next) => {
  document.documentElement.classList.toggle('v2-program-overlay', next === 'PROGRAM_SUPPORT' && !completed.value)
})
watch(completed, (next) => {
  document.documentElement.classList.toggle('v2-program-overlay', currentScene.value === 'PROGRAM_SUPPORT' && !next)
})

watch(reducedMotion, (next) => {
  document.documentElement.classList.toggle('v2-stage-motion-full', !next)
}, { immediate: true, flush: 'sync' })

watch(reducedMotion, (next) => {
  renderer?.setReduced(next)
  clearFlyingBarrages()
  if (next) {
    finaleMotion.value = false
    stopSceneTransition()
    stopTrackedAnimations()
    clearFinaleMotionStyles()
    raffleReveal.sync(raffle.value?.winners ?? [])
  } else {
    void loadGsap()
  }
})

function onVisibilityChange() {
  pageHidden.value = document.hidden
  if (document.hidden) {
    finaleMotion.value = false
    clearTimeout(programCueTimer)
    programCue.value = null
    stopSceneTransition()
    stopTrackedAnimations()
    clearFinaleMotionStyles()
    clearFlyingBarrages()
    clearGiftFlights()
    raffleReveal.sync(raffle.value?.winners ?? [])
  }
}

onMounted(async () => {
  document.documentElement.classList.add('v2-screen-active')
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (canvas.value) {
    renderer = createGalaxyRenderer(canvas.value, {
      reduced: reducedMotion.value,
      cinematicSceneFactory: createCinematicGalaxyScene,
      projectCinematicStar: projectPublicStar,
      programBackdrop: false,
    })
  }
  if (!reducedMotion.value) void loadGsap()
  try { await realtime.connect() } catch (error) { errorMessage.value = error?.message ?? '大屏启动失败' }
})

onBeforeUnmount(() => {
  clearTimeout(programCueTimer)
  disposed = true
  document.documentElement.classList.remove('v2-screen-active', 'v2-program-overlay')
  document.documentElement.classList.remove('v2-stage-motion-full')
  document.removeEventListener('visibilitychange', onVisibilityChange)
  renderer?.destroy()
  stopSceneTransition({ snap: false })
  stopTrackedAnimations()
  clearFlyingBarrages()
  clearGiftFlights()
  gsapContext?.revert()
  raffleReveal.destroy()
})
</script>

<template>
  <section
    ref="root"
    class="v2-screen"
    :style="{ '--opening-duration': `${PROGRAM_OPENING_TRANSITION_MS}ms` }"
    :class="[
      `scene-${currentScene.toLowerCase()}`,
      {
        'is-completed': completed,
        'is-motion-paused': pageHidden || runtime?.status === 'PAUSED',
        'is-scene-transitioning': Boolean(sceneTransition),
        'is-opening-program': openingProgram,
        'is-gsap-ready': gsapReady,
        'is-reduced-motion': reducedMotion,
      },
    ]"
    :data-scene-transition="sceneTransition ? `${sceneTransition.fromScene}->${sceneTransition.toScene}` : 'idle'"
    :data-motion-policy="motionPreference"
    :data-motion-state="reducedMotion ? 'static' : 'full'"
    :data-system-reduced-motion="String(systemReducedMotion)"
    data-program-transition-style="stellar-collapse-supernova-reveal"
    data-transition-architecture="native-webgl2-supernova-with-canvas2d-fallback"
    data-screen-palette="orbital-signal-spectrum"
    data-visual-palette="orbital-signal-spectrum"
  >
    <div ref="stageBackdrop" class="v2-stage-backdrop" aria-hidden="true"></div>
    <ProgramStageBackground v-if="currentScene === 'PROGRAM_SUPPORT' && !completed && !transparentMedia && !ceremonyVisible"
      class="v2-program-stage" :reduced="reducedMotion" :paused="pageHidden || runtime?.status === 'PAUSED'" />
    <Transition name="ceremony-fade"><AwardStage v-if="ceremonyVisible" :stage="ceremonyStage" :title="snapshot?.currentProgram?.kind === 'SPEECH' ? snapshot.currentProgram.title : ''" :reduced="reducedMotion" :paused="pageHidden || runtime?.status === 'PAUSED'" /></Transition>
    <canvas ref="canvas" class="v2-galaxy" aria-hidden="true"></canvas>
    <ArrivalCount v-if="snapshot && currentScene === 'ASSEMBLY' && !completed && presentation.type === 'NONE'"
      :count="snapshot.aggregate.admittedCount" :reduced="reducedMotion" />
    <GiftStarshipFlight
      v-for="flight in giftFlights"
      :key="flight.id"
      surface="screen"
      :quantity="flight.quantity"
      :reduced="reducedMotion"
    />

    <aside v-if="showScreenSettings" class="v2-screen-settings" aria-label="大屏动效设置">
      <label for="screen-motion-policy">大屏动效</label>
      <select id="screen-motion-policy" :value="motionPreference"
        @change="router.replace({ query: { ...route.query, motion: $event.target.value } })">
        <option value="full">舞台完整动效</option>
        <option value="system">跟随系统设置</option>
        <option value="reduced">静态显示</option>
      </select>
      <label for="screen-media">节目底图</label>
      <select id="screen-media" :value="transparentMedia ? 'overlay' : 'background'" @change="router.replace({query: {...route.query, media: $event.target.value}})">
        <option value="background">学院舞台底图</option><option value="overlay">透明叠加表演视频</option>
      </select>
      <p role="status">当前：{{ reducedMotion ? '静态显示，弹幕保留正文' : '完整动效' }}</p>
      <p>系统动画偏好：{{ systemReducedMotion ? '减少动态' : '正常动态' }}</p>
      <p>{{ connectionLabel || '大屏实时已连接' }}</p>
      <button type="button" @click="router.replace({ query: { ...route.query, settings: undefined } })">隐藏设置</button>
    </aside>

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
        <ClosingCredits :key="`${snapshot.resetEpoch}-${completed ? 'complete' : 'preview'}`"
          :programs="snapshot.programs ?? []" :aggregate="snapshot.aggregate"
          :recap="snapshot.closingRecap"
          :reduced="reducedMotion" :paused="pageHidden || runtime?.status === 'PAUSED'"
          :play="finaleMotion" :preview="previewingFinale" />
      </div>

      <div v-else-if="raffleActive" class="v2-raffle" :class="[`is-${raffleDisplay.phase}`, { 'is-live-reveal': raffleDisplay.animateReveal }]">
        <div class="v2-raffle__orbit" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="v2-raffle__content">
          <p class="v2-kicker">互动环节二 · 上台观众</p>
          <h1>上台观众抽取</h1>
          <p class="v2-raffle__hint">{{ raffleDisplay.phase === 'waiting' ? '等待主控抽取第一位上台观众' : raffleDisplay.phase === 'rolling' ? '正在穿越星海定位坐标' : '请这位观众来到舞台' }}</p>
          <strong class="v2-raffle__code">{{ raffleDisplay.code }}</strong>
          <div class="v2-raffle__meta"><span>已抽取 {{ raffle?.winners.length ?? 0 }}</span><span>剩余 {{ raffle?.remainingCount ?? 0 }}</span></div>
          <ol v-if="raffleDisplay.history.length" class="v2-raffle__history" aria-label="已揭晓的上台观众星号">
            <li v-for="item in raffleDisplay.history.slice(0, 6)" :key="item.raffleDrawId" :class="{ current: item.raffleDrawId === raffleDisplay.winner?.raffleDrawId }">{{ item.publicStarId }}</li>
          </ol>
        </div>
      </div>

      <div v-else-if="liveInteraction.phase !== 'IDLE'" class="v2-live-interaction" :class="`is-${liveInteraction.phase.toLowerCase()}`">
        <div class="v2-live-interaction__rings" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="v2-live-interaction__content">
          <p class="v2-kicker">{{ interactionLabel(liveInteraction.segmentCode) }} · 第 {{ liveInteraction.roundNumber }} 轮</p>
          <h1>{{ liveInteraction.prompt }}</h1>
          <template v-if="liveInteraction.phase === 'BUZZER_OPEN'">
            <strong class="v2-buzzer-status" :class="{ 'is-countdown': buzzerCountdown }">{{ buzzerCountdown || '抢答开放' }}</strong>
          </template>
          <template v-else-if="liveInteraction.phase === 'BUZZER_LOCKED'">
            <strong class="v2-buzzer-winner">{{ liveInteraction.leader?.publicStarId }}</strong><p>获得抢答权</p>
          </template>
          <template v-else>
            <p class="v2-vote-count">已收到 <strong>{{ liveInteraction.totalVotes }}</strong> 票</p>
            <div class="v2-vote-board">
              <article v-for="candidate in liveInteraction.voteCandidates" :key="candidate.publicStarId" :style="{ '--candidate-color': candidate.displayColor }">
                <span>{{ candidate.publicStarId }}</span><i><b :style="{ transform: `scaleX(${liveInteraction.totalVotes && candidate.voteCount !== null ? candidate.voteCount / liveInteraction.totalVotes : 0})` }"></b></i><strong>{{ liveInteraction.resultsVisible ? candidate.voteCount : '—' }}</strong>
              </article>
            </div>
            <p>{{ liveInteraction.resultsVisible ? '本轮结果已经揭晓' : '投票进行中' }}</p>
          </template>
        </div>
      </div>

      <div v-else-if="currentScene !== 'PROGRAM_SUPPORT'" ref="sceneLayer" class="v2-scene-copy">
        <p v-if="runtime.mode === 'REHEARSAL'" class="v2-rehearsal">排练模式</p>
        <p class="v2-kicker">SYSU · WELCOME NIGHT</p>
        <h1>{{ scene.title }}</h1>
        <p>{{ scene.subtitle }}</p>
        <div v-if="currentScene === 'COOPERATIVE_LIGHT'" class="v2-cooperative-progress">
          <p role="status"><strong>{{ cooperative.count }}</strong> 颗星已点亮<span>本场已入场 {{ cooperative.admitted }} 人</span></p>
          <div class="v2-cooperative-progress__track" role="progressbar" aria-label="协同点亮进度"
            :aria-valuenow="cooperative.count" :aria-valuemin="0" :aria-valuemax="Math.max(1, cooperative.admitted)"
            :aria-valuetext="`${cooperative.count} 人已点亮，${cooperative.admitted} 人已入场`">
            <i :style="{ transform: `scaleX(${cooperative.ratio})` }"></i>
          </div>
          <p>在手机上轻触「参与全场点亮」，让星河更亮一些</p>
        </div>
      </div>

      <div v-if="interactionVisible && programCue" :key="programCue.id" class="program-title-cue">
        <span v-if="programCue.kind === 'PERFORMANCE'">PROGRAM {{ programCue.displayCode }}</span><h2>{{ programCue.title }}</h2><p v-if="programCredits(programCue)">{{ programCredits(programCue) }}</p>
      </div>
      <aside v-if="interactionVisible && giftRoomStats.length" class="v2-gift-room-stats" aria-label="当前节目礼物统计">
        <ul><li v-for="gift in giftRoomStats" :class="{ 'gift-received': gift.sentCount > 0 }" :key="gift.id + '-' + gift.sentCount" :data-gift-id="gift.id"><GiftSignalIcon :gift-id="gift.id" aria-hidden="true" /><span>{{ gift.name }}</span><strong>×{{ gift.sentCount ?? 0 }}</strong></li></ul>
      </aside>
      <div v-if="flyingBarrages.length" class="v2-barrage-stream" aria-live="polite">
        <p
          v-for="(item, index) in flyingBarrages"
          :key="item.barrageId"
          class="v2-barrage-stream__item"
          :class="{ 'is-gsap-animated': item.gsapAnimated }"
          :data-barrage-id="item.barrageId"
          :style="{
            ...barragePaint(item.colorStyle, item.customColor),
            top: `${reducedMotion ? 10 + index * 13 : 8 + item.lane * 8.8}vh`,
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
.ceremony-fade-enter-active,.ceremony-fade-leave-active{transition:opacity .55s ease}.ceremony-fade-enter-from,.ceremony-fade-leave-to{opacity:0}.is-reduced-motion .ceremony-fade-enter-active,.is-reduced-motion .ceremony-fade-leave-active{transition:none}
.is-motion-paused :deep(*){animation-play-state:paused!important}
.program-title-cue{position:absolute;z-index:5;left:7vw;bottom:12vh;max-width:82vw;padding:24px 32px;border-left:3px solid #95caff;background:linear-gradient(90deg,#061326dc,transparent);animation:program-credit 8.5s ease both;text-shadow:0 2px 12px #000}
.program-title-cue span{font-size:15px;letter-spacing:.3em;color:#9ab9dc}.program-title-cue h2{margin:12px 0;font-size:clamp(40px,4vw,80px);font-weight:550;letter-spacing:.06em}.program-title-cue p{font-size:clamp(22px,1.6vw,32px);color:#c6d4e7;letter-spacing:.12em}
@keyframes program-credit{0%{opacity:0;transform:translateY(18px)}12%,76%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-8px)}}
.v2-raffle__code{color:#e3f0ff!important;text-shadow:0 0 45px #8abfff55!important}.v2-raffle__orbit{opacity:.55}.v2-raffle__history li{border-color:#94b6ed40!important;border-radius:8px;color:#bed2ef!important}
.v2-screen{position:relative;width:100%;height:100vh;overflow:hidden;color:var(--color-orbit-text-primary);background:transparent;font-family:var(--font-family-cjk);isolation:isolate}
.v2-stage-backdrop{position:absolute;z-index:0;inset:0;visibility:visible;opacity:1;background:radial-gradient(ellipse at 58% 44%,rgba(66,126,238,.18) 0,rgba(13,27,52,.54) 24%,rgba(1,3,10,.94) 58%,transparent 80%),radial-gradient(circle at 82% 15%,rgba(74,219,233,.065),transparent 32%),radial-gradient(circle at 18% 82%,rgba(126,176,255,.05),transparent 38%),linear-gradient(132deg,#050b18 0,var(--color-orbit-midnight) 58%,#020611 100%)}
.v2-stage-backdrop::after{position:absolute;inset:0;background:radial-gradient(ellipse at 55% 47%,transparent 0 43%,rgba(0,2,8,.18) 70%,rgba(0,1,5,.76) 100%),linear-gradient(108deg,transparent 18%,rgba(126,176,255,.026) 42%,transparent 63%);content:''}
.scene-program_support .v2-stage-backdrop{visibility:hidden;opacity:0}.is-scene-transitioning .v2-stage-backdrop{visibility:visible;transition:opacity 1.36s cubic-bezier(.45,0,.2,1)}.is-opening-program .v2-stage-backdrop{visibility:visible;opacity:1}.is-gsap-ready.is-scene-transitioning .v2-stage-backdrop{transition:none}
.v2-galaxy{position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none}
.v2-signal{position:absolute;z-index:9;top:24px;right:28px;margin:0;padding:8px 12px;border:1px solid rgba(255,200,102,.45);color:var(--color-orbit-warm);background:rgba(7,12,25,.86);font-family:var(--font-family-signal);font-size:14px}
.v2-scene-copy{position:absolute;z-index:2;inset:0;display:grid;place-content:center;text-align:center;pointer-events:none}
.v2-cooperative-progress{width:min(680px,76vw);margin:28px auto 0;font-size:clamp(20px,1.5vw,30px);color:var(--color-orbit-text-secondary)}
.v2-cooperative-progress p{margin:14px 0}
.v2-cooperative-progress strong{font-family:var(--font-family-data);font-size:clamp(42px,4vw,72px);color:var(--color-orbit-text-primary);font-variant-numeric:tabular-nums}
.v2-cooperative-progress span{display:block;margin-top:8px;font-size:20px}
.v2-cooperative-progress__track{height:4px;margin:24px 0;background:var(--color-orbit-border-subtle);overflow:hidden}
.v2-cooperative-progress__track i{display:block;width:100%;height:100%;background:var(--color-orbit-text-primary);transform-origin:left}
.v2-kicker,.v2-rehearsal{margin:0 0 16px;color:var(--color-orbit-text-secondary);font-family:var(--font-family-signal);font-size:clamp(12px,1vw,18px);letter-spacing:.24em}.v2-rehearsal{color:var(--color-orbit-warm);letter-spacing:.12em}
.v2-scene-copy h1,.v2-finale h1{margin:0;font-family:var(--font-family-display);font-size:clamp(56px,7vw,128px);line-height:1.02;font-weight:620;letter-spacing:.04em}.scene-assembly .v2-scene-copy h1{text-shadow:0 12px 44px rgba(0,0,0,.7)}
.v2-scene-copy>p:last-of-type,.v2-finale__copy>p{font-size:clamp(18px,1.45vw,28px);color:var(--color-orbit-text-secondary)}
.scene-assembly .v2-scene-copy,.is-opening-program .v2-scene-transition__outgoing{place-content:end start;padding:0 0 10vh 6.5vw;text-align:left}
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
.is-opening-program:not(.is-gsap-ready) .v2-stage-backdrop{animation:v2-program-backdrop var(--opening-duration) linear both}
.is-opening-program:not(.is-gsap-ready) .v2-scene-transition__outgoing{animation:v2-program-outgoing var(--opening-duration) cubic-bezier(.45,0,.2,1) both}
.v2-barrage-stream{position:absolute;z-index:4;inset:0;overflow:hidden;pointer-events:none}
.v2-barrage-stream__item{position:absolute;left:0;max-width:72vw;margin:0;padding:0;color:#f8fbff;background:none;border:0;font-size:clamp(25px,1.75vw,38px);font-weight:560;line-height:1.18;letter-spacing:.04em;white-space:nowrap;-webkit-text-stroke:.35px rgba(4,10,22,.7);text-shadow:0 2px 5px rgba(0,0,0,.96),0 0 15px rgba(104,171,255,.34);opacity:0;transform:translateX(calc(100vw + 40px));will-change:transform,opacity;animation:v2-barrage-flight var(--v2-barrage-duration,10s) linear both}
.v2-barrage-stream__item.is-gsap-animated{animation:none}
@keyframes v2-scene-outgoing{to{opacity:0;transform:translateY(-22px) scale(.94)}}
@keyframes v2-scene-aperture{0%{opacity:0;transform:translate(-50%,-50%) scale(.34)}62%{opacity:.76}100%{opacity:0;transform:translate(-50%,-50%) scale(1.42)}}
@keyframes v2-scene-rail{0%{opacity:0;transform:scaleY(.14)}52%{opacity:.7;transform:scaleY(1)}100%{opacity:0;transform:scaleY(1)}}
@keyframes v2-scene-incoming{0%,58%{opacity:0;transform:translateY(var(--v2-incoming-y)) scale(.985)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes v2-program-backdrop{0%,3%{visibility:visible;opacity:1}13%{visibility:visible;opacity:.72}29%,100%{visibility:hidden;opacity:0}}
@keyframes v2-program-outgoing{0%,4%{opacity:1;transform:translateY(0) scale(1)}14%{opacity:.82;transform:translateY(-2px) scale(.998)}32%,100%{opacity:0;transform:translateY(-10px) scale(.985)}}
@keyframes v2-barrage-flight{0%{opacity:0;transform:translateX(calc(100vw + 40px))}4%{opacity:1}96%{opacity:1}100%{opacity:0;transform:translateX(-110%)}}
.v2-raffle{position:absolute;z-index:7;inset:0;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% 46%,rgba(27,48,94,.94),rgba(3,7,17,.985) 68%);text-align:center}.v2-raffle__content{position:relative;z-index:2;width:min(1280px,88vw)}.v2-raffle h1{margin:0;font-family:var(--font-family-display);font-size:clamp(48px,5vw,92px);letter-spacing:.08em}.v2-raffle__hint{margin:22px 0 8px;color:var(--color-orbit-text-secondary);font-size:clamp(18px,1.4vw,28px)}.v2-raffle__code{display:block;margin:12px 0 28px;color:#ffe8a4;font:700 clamp(74px,11vw,190px)/1 var(--font-family-data);letter-spacing:.08em;text-shadow:0 0 22px rgba(255,217,119,.55),0 0 72px rgba(83,150,255,.4)}.v2-raffle.is-rolling .v2-raffle__code{filter:blur(1px);opacity:.85}.v2-raffle.is-revealed.is-live-reveal .v2-raffle__code{animation:raffle-reveal .75s cubic-bezier(.2,.8,.2,1)}.v2-raffle__meta{display:flex;justify-content:center;gap:36px;color:var(--color-orbit-text-tertiary);font-family:var(--font-family-data);font-size:18px}.v2-raffle__history{list-style:none;display:flex;justify-content:center;flex-wrap:wrap;gap:10px;margin:30px 0 0;padding:0}.v2-raffle__history li{padding:8px 15px;border:1px solid rgba(145,178,226,.3);color:var(--color-orbit-text-tertiary);background:rgba(7,14,29,.5);font-family:var(--font-family-data)}.v2-raffle__history li.current{border-color:rgba(255,222,139,.75);color:#ffe7a6}.v2-raffle__orbit{position:absolute;width:min(76vw,1180px);aspect-ratio:1;border-radius:50%;border:1px solid rgba(117,168,242,.12);animation:raffle-orbit 20s linear infinite}.v2-raffle__orbit i{position:absolute;width:9px;height:9px;border-radius:50%;background:#ffe4a0;box-shadow:0 0 24px #ffe4a0}.v2-raffle__orbit i:nth-child(1){top:11%;left:22%}.v2-raffle__orbit i:nth-child(2){top:59%;right:2%}.v2-raffle__orbit i:nth-child(3){bottom:7%;left:34%}@keyframes raffle-orbit{to{transform:rotate(360deg)}}@keyframes raffle-reveal{0%{transform:scale(.78);opacity:.35}65%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
.v2-live-interaction{position:absolute;z-index:7;inset:0;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% 42%,rgba(19,58,113,.94),rgba(2,7,18,.99) 69%);text-align:center}.v2-live-interaction::before{position:absolute;inset:0;background:linear-gradient(110deg,transparent 20%,rgba(119,187,255,.055) 46%,transparent 67%);content:'';animation:live-scan 5.5s ease-in-out infinite}.v2-live-interaction__rings{position:absolute;width:min(78vw,1200px);aspect-ratio:1;border:1px solid rgba(130,190,255,.14);border-radius:50%;box-shadow:0 0 90px rgba(64,145,255,.08);animation:live-ring 16s linear infinite}.v2-live-interaction__rings i{position:absolute;inset:13%;border:1px solid rgba(159,210,255,.12);border-radius:50%}.v2-live-interaction__rings i:nth-child(2){inset:28%;border-color:rgba(255,214,143,.13)}.v2-live-interaction__rings i:nth-child(3){inset:42%;background:#d9edff;border:0;box-shadow:0 0 28px #9ccbff,0 0 90px #4e9bff;border-radius:50%}.v2-live-interaction__content{position:relative;z-index:2;width:min(1180px,86vw)}.v2-live-interaction h1{max-width:1000px;margin:0 auto 4vh;font:520 clamp(44px,5vw,88px)/1.25 var(--font-family-display);letter-spacing:.06em}.v2-buzzer-status{display:block;color:#e8f5ff;font:650 clamp(52px,7vw,116px)/1 var(--font-family-data);letter-spacing:.14em;text-shadow:0 0 22px rgba(123,194,255,.9),0 0 84px rgba(63,136,255,.6);animation:buzzer-breathe 1.05s ease-in-out infinite alternate}.v2-live-interaction__content>p:last-child{color:#aebfd6;font-size:clamp(18px,1.5vw,28px);letter-spacing:.08em}.v2-buzzer-winner{display:block;margin:12px 0 18px;color:#fff0c8;font:700 clamp(76px,11vw,180px)/1 var(--font-family-data);letter-spacing:.1em;text-shadow:0 0 24px rgba(255,223,145,.74),0 0 90px rgba(72,151,255,.48);animation:winner-arrival .8s cubic-bezier(.15,.85,.22,1.18) both}.v2-vote-count{font-size:clamp(20px,1.6vw,30px)!important}.v2-vote-count strong{color:#f5d998;font:600 clamp(34px,3vw,58px) var(--font-family-data)}.v2-vote-board{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 34px;margin:28px auto;width:min(980px,88vw)}.v2-vote-board article{display:grid;grid-template-columns:150px minmax(120px,1fr) 52px;align-items:center;gap:14px;text-align:left}.v2-vote-board article>span{color:var(--candidate-color,#cfe2ff);font-family:var(--font-family-data);font-size:clamp(16px,1.25vw,24px)}.v2-vote-board article>i{height:7px;overflow:hidden;border-radius:99px;background:rgba(145,180,226,.13)}.v2-vote-board article>i>b{display:block;width:100%;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--candidate-color,#74b4ff),#f5da9d);box-shadow:0 0 16px var(--candidate-color,#74b4ff);transform-origin:left;transition:transform .65s cubic-bezier(.2,.8,.2,1)}.v2-vote-board article>strong{color:#eef6ff;font-family:var(--font-family-data);font-size:22px;text-align:right}@keyframes live-scan{0%,100%{transform:translateX(-24%);opacity:.25}50%{transform:translateX(24%);opacity:1}}@keyframes live-ring{to{transform:rotate(360deg)}}@keyframes buzzer-breathe{to{filter:brightness(1.2);transform:scale(1.025)}}@keyframes winner-arrival{from{opacity:0;transform:scale(.72)}to{opacity:1;transform:scale(1)}}
.v2-gift-room-stats{position:absolute;z-index:5;right:4.5vw;bottom:8vh;width:min(300px,24vw);padding:18px 20px;border:1px solid rgba(157,201,255,.2);border-radius:12px;background:linear-gradient(145deg,rgba(8,22,45,.84),rgba(4,11,25,.68));box-shadow:0 18px 60px rgba(0,5,16,.38);backdrop-filter:blur(10px)}.v2-gift-room-stats>p{margin:0 0 12px;color:#87b8f0;font:600 11px var(--font-family-signal);letter-spacing:.22em}.v2-gift-room-stats ul{display:grid;gap:9px;margin:0;padding:0;list-style:none}.v2-gift-room-stats li{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:baseline;padding:8px 0;border-top:1px solid rgba(151,190,236,.12);overflow:hidden;animation:gift-count-pop .46s cubic-bezier(.2,.9,.25,1.2)}.v2-gift-room-stats li span{color:#bdcce0;font-size:clamp(13px,1vw,17px)}.v2-gift-room-stats li strong{color:#f4dcaa;font:600 clamp(19px,1.5vw,28px) var(--font-family-data);font-variant-numeric:tabular-nums}.v2-gift-room-stats li i{position:absolute;right:0;bottom:0;width:38%;height:1px;background:linear-gradient(90deg,transparent,#e8ca8e);box-shadow:0 0 10px #7fb7ff}@keyframes gift-count-pop{from{opacity:.45;transform:translateX(9px) scale(.98)}to{opacity:1;transform:none}}
.v2-finale{position:absolute;z-index:8;inset:0;overflow:hidden;background:transparent}
.v2-screen-settings{position:absolute;z-index:12;top:24px;left:24px;display:grid;gap:10px;box-sizing:border-box;width:min(320px,calc(100vw - 48px));max-height:calc(100dvh - 48px);overflow:auto;padding:22px;color:#f2f6ff;background:#0b16248a;backdrop-filter:blur(22px) saturate(140%);border:1px solid #96afc447;border-radius:20px;box-shadow:0 18px 70px #0005;font-size:16px}.v2-screen-settings label{font-weight:650}.v2-screen-settings p{margin:0}.v2-screen-settings select,.v2-screen-settings button{min-height:44px;padding:8px 12px;border:1px solid #75869f;border-radius:12px;color:#f2f6ff;background:#1c2d45;font:inherit}
.is-reduced-motion .v2-scene-transition{display:none}.v2-screen.is-reduced-motion *{animation:none!important;transition:none!important}.is-reduced-motion .v2-barrage-stream__item{left:6.5vw;max-width:87vw;opacity:1;transform:none;white-space:normal;will-change:auto}.is-reduced-motion .v2-live-interaction::before{display:none}.is-reduced-motion .v2-live-interaction__rings{opacity:.38}.is-reduced-motion .v2-gift-room-stats li{animation:none}


/* The existing galaxy opening reveals the shared stage underneath its canvas. */
.v2-program-stage{z-index:0}
.is-opening-program .v2-program-stage{animation:program-stage-reveal var(--opening-duration) linear both}
@keyframes program-stage-reveal{0%,55%{opacity:0}80%{opacity:.5}100%{opacity:1}}
.v2-live-interaction,.v2-raffle{background:rgba(3,8,17,.7)}
.v2-live-interaction::before,.v2-live-interaction__rings{display:none}
.v2-live-interaction h1{font-weight:400;letter-spacing:.03em;font-size:clamp(40px,4vw,70px)}
.v2-buzzer-status{font-weight:400;text-shadow:none;animation:none;color:#ccdfeb}
.v2-buzzer-status.is-countdown{font-size:180px;letter-spacing:0;color:#e8f1f6}
.v2-buzzer-winner{font-weight:450;text-shadow:none;color:#dfeaf0}
.v2-gift-room-stats{border-radius:5px;background:#07101bd9;box-shadow:none;backdrop-filter:none}
.v2-gift-room-stats li{overflow:visible;animation:none}
.v2-gift-room-stats li.gift-received{animation:gift-received-pop .72s cubic-bezier(.2,.7,.25,1) both}
.v2-gift-room-stats li strong{color:#d6e7ef}
.v2-gift-room-stats li strong small{font:400 12px var(--font-family-cjk);color:#96aaba}
@keyframes gift-received-pop{0%{transform:scale(.84)}24%{transform:scale(1.17)}44%{transform:scale(.94)}64%{transform:scale(1.07)}82%{transform:scale(.98)}100%{transform:scale(1)}}

/* D-093: individual gift chips; the wrapper has no visible panel. */
.v2-gift-room-stats{width:auto;max-width:90vw;padding:0;border:0;border-radius:0;background:none;box-shadow:none;backdrop-filter:none}
.v2-gift-room-stats ul{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:16px}
.v2-gift-room-stats li{grid-template-columns:28px auto auto;gap:10px;align-items:center;padding:12px 18px;border:1px solid #bbd5ee40;border-radius:12px;background:rgba(12,25,39,.52);backdrop-filter:blur(12px) saturate(135%);overflow:visible;animation:none;box-shadow:inset 0 1px #eef8ff12}
.v2-gift-room-stats li.gift-received{animation:gift-received-pop .72s cubic-bezier(.2,.9,.3,1)}
.v2-gift-room-stats li>svg{width:28px;height:28px;color:#c1ddf1}
.v2-gift-room-stats li>small{grid-column:2/4;color:#b4c6d6;font:400 12px var(--font-family-data);text-align:right}
.v2-screen.is-reduced-motion .v2-gift-room-stats li{animation:none}

/* D-094: consistent rounded glass and one brief gift-color pulse. */
.v2-gift-room-stats li{position:relative;isolation:isolate;border-radius:18px;--gift-tint:#ffe1a1}
.v2-gift-room-stats li[data-gift-id="gift-beacon"]{--gift-tint:#76d8ff}
.v2-gift-room-stats li[data-gift-id="gift-orbit"]{--gift-tint:#9db6ff}
.v2-gift-room-stats li[data-gift-id="gift-starship"]{--gift-tint:#ddc5ff}
.v2-gift-room-stats li::after{content:'';position:absolute;inset:-1px;z-index:-1;pointer-events:none;border-radius:inherit;border:1px solid var(--gift-tint);background:radial-gradient(ellipse at 50% 100%,var(--gift-tint),transparent 85%);box-shadow:0 0 20px color-mix(in srgb,var(--gift-tint) 35%,transparent);opacity:0}
.v2-gift-room-stats li.gift-received::after{animation:gift-color-flash .72s ease-out both}
@keyframes gift-color-flash{0%{opacity:0}18%{opacity:.58}100%{opacity:0}}
.v2-screen.is-reduced-motion .v2-gift-room-stats li::after{animation:none;opacity:0}
</style>
