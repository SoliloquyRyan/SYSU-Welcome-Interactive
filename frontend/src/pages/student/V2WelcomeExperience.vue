<script setup>
import { createGiftFlightQueue } from "../../rendering/gift-flight-queue"
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { useBuzzerCountdown } from '../../composables/useBuzzerCountdown'
import { useReducedMotion } from '../../composables/useReducedMotion'
import { useV2ParticipantRealtime } from '../../composables/useV2ParticipantRealtime'
import {
  ApiError,
  createIdempotencyKey,
  publicErrorMessage,
  v2ParticipantApi,
} from '../../services/api'
import { takePendingInvitationToken } from '../../services/invitation-entry'
import {
  STAR_TEMPERATURE_DEFAULT,
  STAR_TEMPERATURE_MAX,
  STAR_TEMPERATURE_MIN,
  STAR_TEMPERATURE_STEP,
  clampStarTemperature,
  starTemperatureColor,
} from '../../services/star-temperature'
import collegeWordmarkUrl from '../../assets/brand/sysu-intelligent-engineering-white.png'
import '../../styles/mobile-font.css'
import GiftSignalIcon from './GiftSignalIcon.vue'
import PersonalJourneyStage from './PersonalJourneyStage.vue'
import ProgramStageBackground from '../../components/ProgramStageBackground.vue'
import MobileProgramOpening from './MobileProgramOpening.vue'
import { createMobileProgramOpeningGate } from '../../rendering/mobile-program-opening'
import PersonalMemento from './PersonalMemento.vue'
import OpeningMusic from './OpeningMusic.vue'
import MobileBarrage from './MobileBarrage.vue'
import GiftStarshipFlight from '../../components/GiftStarshipFlight.vue'
import { CINEMA_TIMING } from '../../rendering/cinema-timing'
import { BARRAGE_COLORS, barragePaint } from '../../services/barrage-colors'
import { programCredits } from '../../services/program-credits'
import { interactionLabel } from '../../services/interaction-label'
import SignalTypeTitle from './SignalTypeTitle.vue'

import { PERSONAL_JOURNEY_PHASES } from './personal-journey-renderer'
import {
  COLOR_CONFIRM_CINEMATIC_DURATION_MS,
  DISCOVERY_CINEMATIC_DURATION_MS,
  DISCOVERY_VISIBLE_STABLE_MS,
  DISCOVERY_VISIBLE_WAIT_MAX_MS,
  ORBIT_HANDOFF_CINEMATIC_DURATION_MS,
  V2_MOBILE_TABS,
  actionAllowed,
  mobileSceneCopy,
  participantCommandAttempt,
  participantSnapshotCanReplace,
  shouldFinishCinematicOnHidden,
  shouldPlayDiscovery,
  shouldPlayOrbitHandoff,
  shouldPlayPullback,
  upsertPublicStar,
  visibleCharacterCount,
} from './v2-mobile-state'

const protectedRuntime = import.meta.env.VITE_DATA_PROFILE === 'PROTECTED'

const props = defineProps({
  capability: { type: Object, required: true },
})

const COLLEGE_WEBSITE_URL = 'https://ise.sysu.edu.cn/'
const PROGRAM_STATE_LABELS = Object.freeze({
  CURRENT: '进行中',
  NEXT: '下一节目',
  CLOSED: '已结束',
  UPCOMING: '待开始',
})
const ARCHIVE_METRIC_HELP = Object.freeze({
  power: '动力是可用于节目礼物的现场额度；送礼会扣减，初始额度由活动统一发放。',
})

const root = ref(null)
const journeyStage = ref(null)
const snapshot = ref(null)
const entryState = ref('checking')
const activeTab = ref('scene')
const colorPickerOpen = ref(false)
const mainDockBody = ref(null)
const tabScroll = {}
const cinematic = ref('')
const mobileProgramOpening = ref(false)
const pageHidden = ref(document.hidden)
const mobileOpeningGate = createMobileProgramOpeningGate()
function finishMobileProgramOpening() { mobileProgramOpening.value = false }
const displayName = ref('')
const studentNumber = ref('')
const colorKelvin = ref(STAR_TEMPERATURE_DEFAULT)
const liveBarrages = ref([])
const giftFlights = ref([])
const giftAnnouncement = ref('')
const giftFlightQueue = createGiftFlightQueue({
  duration: () => reducedMotion.value ? CINEMA_TIMING.starshipStaticMs : CINEMA_TIMING.starshipPhoneMs + 200,
  gap: CINEMA_TIMING.starshipGapMs,
  onChange: flight => {
    giftFlights.value = flight ? [flight] : []
    giftAnnouncement.value = flight ? '星舰 ×' + flight.quantity : ''
  },
})
const seenGiftFlights = new Set()
function clearLiveBarrages() {
  liveBarrages.value = []
}
function removeLiveBarrage(id) {
  liveBarrages.value = liveBarrages.value.filter(item => item.barrageId !== id)
}
function clearGiftFlights() {
  giftFlightQueue.clear()
}
function launchGiftFlight(gift) {
  if (snapshot.value?.stage?.mode && snapshot.value.stage.mode !== 'PROGRAM' || runtime.value?.status !== 'RUNNING' || runtime.value?.currentScene !== 'PROGRAM_SUPPORT' || snapshot.value?.presentation?.type !== 'NONE' || currentProgram.value?.id !== gift.programId) return
  if (document.hidden || gift.showStarship !== true || gift.giftId !== 'gift-starship' || seenGiftFlights.has(gift.giftEventId)) return
  colorPickerOpen.value = false
  seenGiftFlights.add(gift.giftEventId)
  if (seenGiftFlights.size > 128) seenGiftFlights.delete(seenGiftFlights.values().next().value)
  const flight = { id: gift.giftEventId, quantity: gift.quantity ?? 1 }
  giftFlightQueue.enqueue(flight)
}
const barrageColor = ref('white')
const barrageDraft = ref('')
const barrageConfirmOpen = ref(false)
const barrageConfirmCancel = ref(null)
const barrageSend = ref(null)
const giftQuantity = ref(1)
const voteChoice = ref('')
const dockTextInputFocused = ref(false)
const giftOpen = ref(false)
const logoutOpen = ref(false)
const titleMotionEnabled = ref(false)
const archiveMetricHelp = ref('')
const busy = ref('')
const persistentError = ref('')
const persistentNotice = ref('')
const toast = ref('')
const visualHeight = ref(null)
const compactKeyboard = ref(false)
const giftTrigger = ref(null)
const giftClose = ref(null)
const logoutTrigger = ref(null)
const logoutCancel = ref(null)
const sceneHeading = ref(null)
const reducedMotion = useReducedMotion()
const commandKeys = new Map()
let activationAttempt = null
let invitationToken = null
let toastTimer = null
let cinematicTimer = null
let cinematicResolve = null
let discoveryVisibilityCancel = null
let mounted = false
let titleObserver = null
/* Title measurement is installed below the computed copy. */
const observeTitle = async () => {
  await nextTick()
  titleObserver?.disconnect()
  const title = root.value?.querySelector('.scene-copy')
  if (!title) return
  const measure = () => {
    if (root.value) root.value.style.setProperty('--content-top', (title.getBoundingClientRect().bottom - root.value.getBoundingClientRect().top + 12) + 'px')
  }
  titleObserver = new ResizeObserver(measure)
  titleObserver.observe(title)
  measure()
}

let busyOwner = null
let sessionGeneration = 0
let snapshotRequestSequence = 0
let snapshotCommitSequence = 0
const snapshotControllers = new Set()

const participant = computed(() => snapshot.value?.participant ?? null)
const participantDisplayName = computed(() => participant.value?.displayName ?? '同学')
const personalStarCode = computed(() =>
  participant.value?.personalStarCode ?? participant.value?.ownPublicStarId ?? '等待编号',
)
const runtime = computed(() => snapshot.value?.runtime ?? null)
const admitted = computed(() => participant.value?.onboardingState === 'ADMITTED')
const completed = computed(() => runtime.value?.status === 'COMPLETED')
const navigationAvailable = computed(() => admitted.value || completed.value)
const modalOpen = computed(() => giftOpen.value || logoutOpen.value || barrageConfirmOpen.value)
const headerUnavailable = computed(() => modalOpen.value || Boolean(cinematic.value))
const sceneCopy = computed(() => mobileSceneCopy(snapshot.value))
const currentProgram = computed(() => snapshot.value?.currentProgram ?? null)
const liveInteraction = computed(() => snapshot.value?.liveInteraction ?? null)
const buzzerCountdown = useBuzzerCountdown(liveInteraction, computed(() => snapshot.value?.generatedAt))
const selectedGiftId = ref('gift-glimmer')
const selectedGift = computed(() => currentProgram.value?.giftCatalog?.find(g => g.id === selectedGiftId.value))
const giftTotal = computed(() => (selectedGift.value?.powerCost ?? 0) * giftQuantity.value)
const nextProgram = computed(() => snapshot.value?.programs?.find(({ state }) => state === 'NEXT') ?? null)
const viewCopy = computed(() => {
  if (activeTab.value === 'programs') {
    return {
      kicker: '现场编排',
      title: '节目单',
      subtitle: currentProgram.value
        ? `正在进行：${currentProgram.value.title}`
        : '',
    }
  }
  if (activeTab.value === 'archive') {
    return {
      kicker: '个人记录',
      title: '星际档案',
      subtitle: '',
    }
  }
  if (runtime.value?.status === 'RUNNING' && runtime.value?.currentScene === 'PROGRAM_SUPPORT') {
    if (snapshot.value?.stage?.mode === 'HOST' && currentProgram.value?.kind !== 'SPEECH') return { kicker: '迎新之夜', title: '此刻，共赴新程', subtitle: '' }
    return { kicker: snapshot.value?.presentation.type === 'RAFFLE' ? '互动环节二' : '正在现场', title: snapshot.value?.presentation.type === 'RAFFLE' ? '上台观众，即将揭晓' : currentProgram.value?.title ?? '等待节目', subtitle: snapshot.value?.presentation.type === 'RAFFLE' ? '抬头看向大屏，等待本轮上台观众公布。' : currentProgram.value ? programCredits(currentProgram.value) || '' : '' }
  }
  return {
    kicker: runtime.value?.status === 'COMPLETED' ? '活动终章' : '现场信号',
    title: sceneCopy.value.title,
    displayTitle: completed.value ? '今夜的星河，\n已经成形' : sceneCopy.value.title,
    subtitle: sceneCopy.value.subtitle,
  }
})
watch([viewCopy, visualHeight], observeTitle)
const viewRevealKey = computed(() => [
  activeTab.value,
  runtime.value?.status ?? 'UNKNOWN',
  runtime.value?.currentScene ?? 'READY',
].join(':'))
const selectedColor = computed(() => starTemperatureColor(colorKelvin.value))
const selectedBarrageStyle = computed(() => BARRAGE_COLORS.find(({ id }) => id === barrageColor.value) ?? BARRAGE_COLORS[0])
const premiumBarrageNeedsUnlock = computed(() => selectedBarrageStyle.value.cost > 0
  && !participant.value?.unlockedBarrageStyles?.includes(selectedBarrageStyle.value.id))
function barrageSwatch(color) { return color.personal ? selectedColor.value : color.paint }
const temperatureSpectrum = [2400, 3600, 5000, 6500, 9000, 12000]
  .map((kelvin) => `${starTemperatureColor(kelvin)} ${((kelvin - STAR_TEMPERATURE_MIN) / (STAR_TEMPERATURE_MAX - STAR_TEMPERATURE_MIN)) * 100}%`)
  .join(', ')
const discoveryActive = computed(() =>
  cinematic.value === 'discovery-pending' || cinematic.value === 'discovering',
)
const welcomeStyle = computed(() => ({
  '--selected-color': selectedColor.value,
  '--temperature-spectrum': `linear-gradient(90deg, ${temperatureSpectrum})`,
  '--discovery-duration': `${DISCOVERY_CINEMATIC_DURATION_MS}ms`,
  '--color-confirm-duration': `${COLOR_CONFIRM_CINEMATIC_DURATION_MS}ms`,
  '--orbit-handoff-duration': `${ORBIT_HANDOFF_CINEMATIC_DURATION_MS}ms`,
  ...(visualHeight.value ? { '--visual-height': `${visualHeight.value}px` } : {}),
}))
const ownPublicStar = computed(() => snapshot.value?.publicStars?.find(
  ({ publicStarId }) => publicStarId === participant.value?.ownPublicStarId,
) ?? null)
const journeyOwnStar = computed(() => snapshot.value ? ({
  id: personalStarCode.value,
  label: activeTab.value === 'scene' ? personalStarCode.value : '',
  formationSlot: ownPublicStar.value?.formationSlot ?? personalStarCode.value,
  color: selectedColor.value,
}) : null)
const archiveMetricMessage = computed(() => ARCHIVE_METRIC_HELP[archiveMetricHelp.value] ?? '')
const journeyPhase = computed(() => {
  if (cinematic.value === 'discovery-pending' || cinematic.value === 'discovering') {
    return PERSONAL_JOURNEY_PHASES.DISCOVERY
  }
  if (cinematic.value === 'color-confirm') return PERSONAL_JOURNEY_PHASES.CONFIRM
  if (cinematic.value === 'orbit-handoff') return PERSONAL_JOURNEY_PHASES.HANDOFF
  if (participant.value?.onboardingState === 'NEEDS_COLOR') return PERSONAL_JOURNEY_PHASES.SELECTION
  if (participant.value?.onboardingState === 'NEEDS_CAPSULE_DECISION') return PERSONAL_JOURNEY_PHASES.MESSAGE
  return PERSONAL_JOURNEY_PHASES.ORBIT
})
const journeyPlaying = computed(() => ['discovering', 'color-confirm', 'orbit-handoff'].includes(cinematic.value))
const programBackgroundVisible = computed(() => admitted.value && !completed.value
  && runtime.value?.currentScene === 'PROGRAM_SUPPORT' && !journeyPlaying.value)
const galaxyCapacityValid = computed(() => (snapshot.value?.publicStars?.length ?? 0) <= 300)
const connectionMessage = computed(() => {
  // COMPLETED intentionally closes realtime. The memento carries the durable
  // end state; intentional suspension must not look like a connection fault.
  if (completed.value) return ''
  if (!snapshot.value || realtime.state.value === 'online') return ''
  if (realtime.state.value === 'offline') return '设备已离线；未确认的内容不会自动提交。'
  if (realtime.lastError.value) return realtime.lastError.value
  return ['syncing', 'reconnecting'].includes(realtime.state.value)
    ? '正在恢复连接，请稍候…'
    : ''
})
const colorConnectionMessage = computed(() => {
  if (realtime.state.value === 'online') return ''
  if (realtime.state.value === 'offline') return '设备已离线；恢复连接后才能确认星色。'
  if (realtime.lastError.value) return realtime.lastError.value
  if (['syncing', 'reconnecting'].includes(realtime.state.value)) return '正在恢复连接，请稍候…'
  return '身份已保存，正在建立实时连接…'
})
const writesReady = computed(() =>
  realtime.state.value === 'online' &&
  galaxyCapacityValid.value &&
  ['READY', 'RUNNING'].includes(runtime.value?.status),
)
const giftInteractionReady = computed(() =>
  writesReady.value &&
  actionAllowed(snapshot.value, 'SEND_GIFT') &&
  Boolean(currentProgram.value && currentProgram.value.kind === 'PERFORMANCE' && currentProgram.value.giftsEnabled !== false),
)
const giftAvailabilityMessage = computed(() => {
  if (runtime.value?.status === 'PAUSED') return '现场已暂停，暂时不能送礼物。'
  if (runtime.value?.status === 'COMPLETED') return '本场活动已结束，礼物互动已经关闭。'
  if (realtime.state.value !== 'online') {
    return connectionMessage.value || '正在恢复连接，暂时不能送礼物。'
  }
  if (currentProgram.value && currentProgram.value.kind !== 'PERFORMANCE') return '互动环节不接收礼物，请按主持人和互动面板的现场说明参与。'
  if (!currentProgram.value || !actionAllowed(snapshot.value, 'SEND_GIFT')) {
    return '当前节目暂不接收礼物。'
  }
  return ''
})
const dockExpanded = computed(() =>
  activeTab.value !== 'scene',
)
const barrageLength = computed(() => visibleCharacterCount(barrageDraft.value))
const currentProgramGiftSummary = computed(() =>
  currentProgram.value?.giftCatalog?.filter(({ sentCount }) => sentCount > 0) ?? [],
)
const archiveGiftQuantity = computed(() =>
  participant.value?.giftHistory?.reduce((total, item) => total + item.quantity, 0) ?? 0,
)

function formatArchiveTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function applyGiftEvent(gift) {
  if (currentProgram.value?.id === gift.programId) {
    const catalogGift = currentProgram.value.giftCatalog?.find(item => item.id === gift.giftId)
    if (catalogGift) catalogGift.sentCount = Math.max(catalogGift.sentCount ?? 0, gift.sentCount ?? (catalogGift.sentCount ?? 0) + 1)
  }
  launchGiftFlight(gift)
}

function syncVisualViewport() {
  const height = window.visualViewport?.height ?? window.innerHeight
  visualHeight.value = Math.round(height)
  compactKeyboard.value = height <= 520 || height <= window.innerHeight * 0.7
}

function isTextEntryControl(target) {
  if (target instanceof HTMLTextAreaElement) return true
  return target instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button', 'submit'].includes(target.type)
}

function onDockFocusIn(event) {
  if (!isTextEntryControl(event.target)) return
  dockTextInputFocused.value = true
  syncVisualViewport()
}

function onDockFocusOut() {
  void nextTick(() => {
    dockTextInputFocused.value = isTextEntryControl(document.activeElement)
    syncVisualViewport()
  })
}

function setToast(message) {
  if (toastTimer !== null) clearTimeout(toastTimer)
  toast.value = message
  toastTimer = window.setTimeout(() => {
    toast.value = ''
    toastTimer = null
  }, 3500)
}

function captureSession() {
  return {
    generation: sessionGeneration,
    participantStreamId: snapshot.value?.participantStreamId ?? null,
  }
}

function sessionIsCurrent(session, { allowEmpty = false } = {}) {
  if (!mounted || session.generation !== sessionGeneration) return false
  const participantStreamId = snapshot.value?.participantStreamId ?? null
  return (allowEmpty || session.participantStreamId !== null)
    && session.participantStreamId === participantStreamId
}

function abortSnapshotRequests() {
  sessionGeneration += 1
  for (const controller of snapshotControllers) controller.abort()
  snapshotControllers.clear()
  snapshotCommitSequence = snapshotRequestSequence
}

function clearSensitiveDrafts() {
  barrageDraft.value = ''
  barrageConfirmOpen.value = false
  voteChoice.value = ''
}

function cancelDiscoveryVisibilityWait() {
  const cancel = discoveryVisibilityCancel
  discoveryVisibilityCancel = null
  cancel?.()
}

function clearCinematicWait() {
  if (cinematicTimer !== null) clearTimeout(cinematicTimer)
  cinematicTimer = null
  const resolve = cinematicResolve
  cinematicResolve = null
  resolve?.()
}

function finishCinematic() {
  cancelDiscoveryVisibilityWait()
  clearCinematicWait()
  cinematic.value = ''
}

function waitForStableDocumentVisibility() {
  cancelDiscoveryVisibilityWait()
  return new Promise((resolve) => {
    let settled = false
    let stableTimer = null
    let maximumTimer = null

    function clearStableTimer() {
      if (stableTimer !== null) clearTimeout(stableTimer)
      stableTimer = null
    }

    function settle(ready) {
      if (settled) return
      settled = true
      clearStableTimer()
      if (maximumTimer !== null) clearTimeout(maximumTimer)
      maximumTimer = null
      document.removeEventListener('visibilitychange', scheduleStableWindow)
      if (discoveryVisibilityCancel === cancel) discoveryVisibilityCancel = null
      resolve(ready)
    }

    function scheduleStableWindow() {
      clearStableTimer()
      if (document.hidden) return
      stableTimer = window.setTimeout(() => {
        stableTimer = null
        if (document.hidden) {
          scheduleStableWindow()
          return
        }
        settle(true)
      }, DISCOVERY_VISIBLE_STABLE_MS)
    }

    function cancel() {
      settle(false)
    }

    discoveryVisibilityCancel = cancel
    document.addEventListener('visibilitychange', scheduleStableWindow)
    maximumTimer = window.setTimeout(() => settle(false), DISCOVERY_VISIBLE_WAIT_MAX_MS)
    scheduleStableWindow()
  })
}

function clearSession() {
  finishMobileProgramOpening()
  clearLiveBarrages()
  clearGiftFlights()
  seenGiftFlights.clear()
  abortSnapshotRequests()
  realtime.stop()
  snapshot.value = null
  clearSensitiveDrafts()
  commandKeys.clear()
  activationAttempt = null
  invitationToken = null
  displayName.value = ''
  studentNumber.value = ''
  colorKelvin.value = STAR_TEMPERATURE_DEFAULT
  activeTab.value = 'scene'
  titleMotionEnabled.value = false
  archiveMetricHelp.value = ''
  persistentError.value = ''
  persistentNotice.value = ''
  toast.value = ''
  if (toastTimer !== null) clearTimeout(toastTimer)
  toastTimer = null
  finishCinematic()
  giftOpen.value = false
  barrageConfirmOpen.value = false
  logoutOpen.value = false
  dockTextInputFocused.value = false
  busyOwner = null
  busy.value = ''
  entryState.value = 'activation'
}

function putSnapshot(next) {
  const previous = snapshot.value
  const resetLiveContent = !previous || (previous.resetEpoch !== next.resetEpoch || previous.runtime.status !== next.runtime.status || previous.runtime.currentScene !== next.runtime.currentScene || previous.presentation.type !== next.presentation.type)
  if (previous && resetLiveContent) {
    clearLiveBarrages()
    clearGiftFlights()
  }
  if (resetLiveContent || liveBarrages.value.length === 0) {
    liveBarrages.value = [...(next.publishedBarrages ?? [])]
  }
  if (previous?.resetEpoch !== next.resetEpoch) seenGiftFlights.clear()
  if (previous?.liveInteraction?.roundNumber !== next.liveInteraction?.roundNumber || next.liveInteraction?.phase !== 'VOTE_OPEN') {
    voteChoice.value = ''
  }
  snapshot.value = next
  if (next.participant.colorTemperatureKelvin !== null) {
    colorKelvin.value = next.participant.colorTemperatureKelvin
  } else if (!previous) {
    colorKelvin.value = STAR_TEMPERATURE_DEFAULT
  }
  if (next.runtime.status === 'COMPLETED' && previous?.runtime?.status !== 'COMPLETED') {
    clearSensitiveDrafts()
    giftOpen.value = false
    activeTab.value = 'scene'
  }
  entryState.value = 'active'
}

async function refreshSnapshot() {
  const requestGeneration = sessionGeneration
  const requestSequence = ++snapshotRequestSequence
  const controller = new AbortController()
  snapshotControllers.add(controller)
  try {
    const next = await v2ParticipantApi.snapshot({ signal: controller.signal })
    if (
      !mounted ||
      requestGeneration !== sessionGeneration ||
      requestSequence < snapshotCommitSequence
    ) return null
    if (!participantSnapshotCanReplace(snapshot.value, next)) {
      if (snapshot.value && next.resetEpoch !== snapshot.value.resetEpoch) {
        clearSession()
        persistentError.value = '活动已重置，请重新核验。'
        return null
      }
      persistentNotice.value = '已保留你最新的进度。'
      return snapshot.value
    }
    snapshotCommitSequence = requestSequence
    putSnapshot(next)
    return next
  } catch (error) {
    if (error?.name === 'AbortError') return null
    if (error instanceof ApiError && ['AUTH_REQUIRED', 'STALE_RESET_EPOCH'].includes(error.code)) {
      clearSession()
    }
    throw error
  } finally {
    snapshotControllers.delete(controller)
  }
}

async function onPublicEvent(frame) {
  const current = snapshot.value
  if (!current) return
  current.publicSeq = Math.max(current.publicSeq, frame.streamSeq)
  const payload = frame.payload
  if (frame.name === 'runtime.changed') {
    const playOpening = mobileOpeningGate.consume({
      previous: current.runtime, next: payload.runtime, resetEpoch: frame.resetEpoch,
      online: realtime.state.value === 'online', admitted: admitted.value,
      reduced: reducedMotion.value, hidden: document.hidden, cinematic: cinematic.value,
      presentation: current.presentation.type,
    })
    const next = await refreshSnapshot()
    if (playOpening && mounted && next?.runtime.runRevision === payload.runtime.runRevision
      && next.runtime.currentScene === 'PROGRAM_SUPPORT' && next.runtime.status === 'RUNNING'
      && next.presentation.type === 'NONE' && realtime.state.value === 'online'
      && admitted.value && !reducedMotion.value && !document.hidden && !cinematic.value) {
      mobileProgramOpening.value = true
    }
    return
  }
  if (frame.name === 'presentation.changed') {
    toast.value = ''
    colorPickerOpen.value = false
    current.presentation = payload.presentation
    current.presentationRevision = payload.presentationRevision
  } else if (frame.name === 'star.node.upserted') {
    upsertPublicStar(current.publicStars, payload.star)
  } else if (frame.name === 'aggregate.changed') {
    current.aggregate = payload.aggregate
    current.aggregateRevision = payload.aggregateRevision
  } else if (frame.name === 'barrage.published') {
    if (!document.hidden && current.runtime.status === 'RUNNING' && current.runtime.currentScene === 'PROGRAM_SUPPORT' && current.presentation.type === 'NONE' && !liveBarrages.value.some(({ barrageId }) => barrageId === payload.barrage.barrageId)) {
      while (liveBarrages.value.length >= 100) removeLiveBarrage(liveBarrages.value[0].barrageId)
      liveBarrages.value.push(payload.barrage)
    }
  } else if (frame.name === 'barrage.removed') {
    payload.barrageIds.forEach(removeLiveBarrage)
  } else if (frame.name === 'barrage.cleared') {
    clearLiveBarrages()
  } else if (frame.name === 'barrage.pause.changed') {
    current.interaction.interactionRevision = payload.interactionRevision
    current.interaction.barragePaused = payload.paused
  } else if (frame.name === 'gift.sent') {
    // A fresh command snapshot may already include this gift (or later gifts).
    // Deliver its visual without moving counts or interaction revision backwards.
    const stateIsNewer = current.interaction.interactionRevision > payload.interactionRevision
    current.interaction.interactionRevision = Math.max(current.interaction.interactionRevision, payload.interactionRevision)
    if (stateIsNewer) launchGiftFlight(payload.gift)
    else applyGiftEvent(payload.gift)
  } else if (frame.name === 'program.changed') {
    const beforeId = current.currentProgram?.id
    const beforeMode = current.stage?.mode
    await refreshSnapshot()
    if (beforeId !== snapshot.value?.currentProgram?.id || beforeMode !== snapshot.value?.stage?.mode) { clearGiftFlights(); giftOpen.value = false }
  } else if (frame.name === 'live.interaction.changed') {
    const previousRound = current.liveInteraction?.roundNumber
    const previousPhase = current.liveInteraction?.phase
    await refreshSnapshot()
    const next = snapshot.value?.liveInteraction
    if (next?.roundNumber !== previousRound || next?.phase !== previousPhase || next?.participation?.hasVoted) {
      voteChoice.value = ''
    }
  }
}

const realtime = useV2ParticipantRealtime({ snapshot, refresh: refreshSnapshot, onPublicEvent })
watch(() => [runtime.value?.status, runtime.value?.currentScene, snapshot.value?.presentation.type, realtime.state.value], () => {
  if (runtime.value?.status !== 'RUNNING' || runtime.value?.currentScene !== 'PROGRAM_SUPPORT'
    || snapshot.value?.presentation.type !== 'NONE' || realtime.state.value !== 'online') finishMobileProgramOpening()
})

function definitive(error) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
}

function waitForJourneyPhase(phase, duration) {
  clearCinematicWait()
  return new Promise((resolve) => {
    cinematicResolve = resolve
    void journeyStage.value?.waitForPhase(phase).then((result) => {
      if (result?.completed && cinematicResolve === resolve) clearCinematicWait()
    })
    // The production renderer's completion is authoritative; this only keeps
    // a lost canvas/context lifecycle edge from trapping the participant.
    cinematicTimer = window.setTimeout(
      () => clearCinematicWait(),
      duration + 450,
    )
  })
}

async function acceptActivation(response, activationSession) {
  if (!sessionIsCurrent(activationSession, { allowEmpty: true })) return
  putSnapshot(response.snapshot)
  titleMotionEnabled.value = Boolean(response.activationCreated)
  const activeSession = captureSession()
  let realtimeConnection = null
  if (!galaxyCapacityValid.value) {
    realtime.suspend('星系容量数据异常，已停止写入。')
  } else if (response.snapshot.runtime.status === 'COMPLETED') {
    realtime.suspend('本场活动已结束，你的记录已保存。')
  } else {
    // Synchronization is authoritative recovery, not presentation. Start it
    // immediately so the 2.8s camera never delays current state or writes.
    realtimeConnection = realtime.connect()
  }
  if (shouldPlayDiscovery({
    activationCreated: response.activationCreated,
    onboardingState: response.snapshot.participant.onboardingState,
    reducedMotion: reducedMotion.value,
  })) {
    cinematic.value = 'discovery-pending'
    const visibleReady = await waitForStableDocumentVisibility()
    if (!visibleReady || !sessionIsCurrent(activeSession) || reducedMotion.value || document.hidden) {
      finishCinematic()
    } else {
      cinematic.value = 'discovering'
      await nextTick()
      await waitForJourneyPhase(PERSONAL_JOURNEY_PHASES.DISCOVERY, DISCOVERY_CINEMATIC_DURATION_MS)
    }
    if (!sessionIsCurrent(activeSession)) return
    cinematic.value = ''
  }
  if (!sessionIsCurrent(activeSession)) return
  if (realtimeConnection) await realtimeConnection
  if (sessionIsCurrent(activeSession)) titleMotionEnabled.value = true
}

async function activate(method, fields) {
  if (busy.value === 'activation') return
  const activationSession = captureSession()
  const busyToken = {}
  busyOwner = busyToken
  busy.value = 'activation'
  persistentError.value = ''
  const request = {
    protocolVersion: '2',
    resetEpoch: props.capability.resetEpoch,
    method,
    ...fields,
  }
  const fingerprint = JSON.stringify(request)
  if (activationAttempt?.fingerprint !== fingerprint) {
    activationAttempt = { key: createIdempotencyKey(), fingerprint }
  }
  const attempt = activationAttempt
  try {
    const response = await v2ParticipantApi.activate({
      ...request,
      idempotencyKey: attempt.key,
    })
    if (!sessionIsCurrent(activationSession, { allowEmpty: true })) return
    if (activationAttempt?.key === attempt.key) activationAttempt = null
    invitationToken = null
    await acceptActivation(response, activationSession)
  } catch (error) {
    if (!sessionIsCurrent(activationSession, { allowEmpty: true })) return
    if (definitive(error)) {
      if (activationAttempt?.key === attempt.key) activationAttempt = null
      if (method === 'INVITATION_TOKEN') invitationToken = null
    }
    persistentError.value = publicErrorMessage(error)
    entryState.value = 'activation'
  } finally {
    if (busyOwner === busyToken) {
      busyOwner = null
      busy.value = ''
    }
  }
}

function activateAssisted() {
  const name = displayName.value.trim()
  if (!name || visibleCharacterCount(name) > 40) {
    persistentError.value = '请输入学生姓名（1–40 个字符）。'
    return
  }
  if (!/^\d{8}$/.test(studentNumber.value)) {
    persistentError.value = '请输入 8 位学号。'
    return
  }
  void activate('ASSISTED_STUDENT', {
    displayName: name,
    studentNumber: studentNumber.value,
  })
}

async function runCommand(command, fields, successMessage) {
  if (!mounted || !snapshot.value || !writesReady.value || !actionAllowed(snapshot.value, command)) return null
  const commandSession = captureSession()
  const busyToken = {}
  persistentError.value = ''
  busyOwner = busyToken
  busy.value = command
  const previousAttempt = commandKeys.get(command)
  const attempt = participantCommandAttempt(
    snapshot.value,
    command,
    fields,
    previousAttempt,
    createIdempotencyKey,
  )
  commandKeys.set(command, attempt)
  try {
    await v2ParticipantApi.command(attempt.request)
    if (!sessionIsCurrent(commandSession)) return null
    const next = await refreshSnapshot()
    if (!sessionIsCurrent(commandSession) || !next || !snapshot.value) return null
    if (commandKeys.get(command)?.key === attempt.key) commandKeys.delete(command)
    if (successMessage) setToast(successMessage)
    return next
  } catch (error) {
    if (!sessionIsCurrent(commandSession)) return null
    if (definitive(error) && commandKeys.get(command)?.key === attempt.key) commandKeys.delete(command)
    persistentError.value = publicErrorMessage(error)
    if (error instanceof ApiError && ['AUTH_REQUIRED', 'STALE_RESET_EPOCH'].includes(error.code)) {
      const message = persistentError.value
      clearSession()
      persistentError.value = message
    } else if (error instanceof ApiError && error.code === 'PROTOCOL_VERSION_MISMATCH') {
      realtime.suspend('手机端协议不兼容，已停止写入。')
    } else if (error instanceof ApiError && (error.recovery?.snapshotRequired || [
      'REVISION_CONFLICT',
      'SCENE_ACTION_INVALID',
      'RUNTIME_PAUSED',
      'RUNTIME_COMPLETED',
      'RESYNC_REQUIRED',
    ].includes(error.code))) {
      try {
        await refreshSnapshot()
        if (runtime.value?.status === 'COMPLETED') {
          realtime.suspend('本场活动已结束，你的记录已保存。')
        }
      } catch (refreshError) {
        if (refreshError instanceof ApiError && ['AUTH_REQUIRED', 'STALE_RESET_EPOCH'].includes(refreshError.code)) {
          const message = persistentError.value
          clearSession()
          persistentError.value = message
        }
      }
    }
    return null
  } finally {
    if (busyOwner === busyToken) {
      busyOwner = null
      busy.value = ''
    }
  }
}

async function lockColor() {
  const colorSession = captureSession()
  const previousState = participant.value?.onboardingState
  const next = await runCommand(
    'LOCK_COLOR',
    { colorTemperatureKelvin: clampStarTemperature(colorKelvin.value) },
    '',
  )
  if (!next || !sessionIsCurrent(colorSession)) return
  if (shouldPlayPullback({ previousState, nextSnapshot: next, reducedMotion: reducedMotion.value })) {
    cinematic.value = 'color-confirm'
    await nextTick()
    await waitForJourneyPhase(PERSONAL_JOURNEY_PHASES.CONFIRM, COLOR_CONFIRM_CINEMATIC_DURATION_MS)
    if (!sessionIsCurrent(colorSession)) return
    cinematic.value = ''
  }
  if (!sessionIsCurrent(colorSession)) return
  await playOrbitHandoff(previousState, next, colorSession)
  if (!sessionIsCurrent(colorSession)) return
  setToast('星色已锁定；你的星已经汇入智工星河。')
}

async function playOrbitHandoff(previousState, next, commandSession) {
  if (!shouldPlayOrbitHandoff({ previousState, nextSnapshot: next, reducedMotion: reducedMotion.value })) return
  cinematic.value = 'orbit-handoff'
  await nextTick()
  await waitForJourneyPhase(PERSONAL_JOURNEY_PHASES.HANDOFF, ORBIT_HANDOFF_CINEMATIC_DURATION_MS)
  if (!sessionIsCurrent(commandSession)) return
  cinematic.value = ''
}

async function startStar() {
  await runCommand('START_STAR', {}, '你的星已正式启动。')
}

async function cooperativeLight() {
  await runCommand('COOPERATIVE_LIGHT', {}, '你已完成协同点亮。')
}

async function postBarrage(premiumConfirmed = false) {
  if (!barrageDraft.value.trim() || barrageLength.value > 40) {
    persistentError.value = '请输入 1–40 个可见字符的弹幕。'
    return
  }
  if (premiumBarrageNeedsUnlock.value && !premiumConfirmed) {
    if ((participant.value?.powerBalance ?? 0) < 10) {
      persistentError.value = '动力不足，暂时不能解锁这款高级弹幕。'
      return
    }
    persistentError.value = ''
    barrageConfirmOpen.value = true
    colorPickerOpen.value = false
    document.activeElement?.blur?.()
    await nextTick()
    barrageConfirmCancel.value?.focus({ preventScroll: true })
    return
  }
  const next = await runCommand('POST_BARRAGE', { text: barrageDraft.value.trim(), colorStyle: barrageColor.value }, '弹幕已送往现场。')
  if (next) {
    barrageDraft.value = ''
    await nextTick()
    if (!compactKeyboard.value) window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }
}

async function confirmPremiumBarrage() {
  barrageConfirmOpen.value = false
  await postBarrage(true)
  await nextTick()
  if (mounted) barrageSend.value?.focus({ preventScroll: true })
}

async function closePremiumBarrage() {
  barrageConfirmOpen.value = false
  await nextTick()
  barrageSend.value?.focus({ preventScroll: true })
}

async function buzzIn() {
  await runCommand('BUZZ_IN', {}, '已提交')
}

async function castAudienceVote() {
  if (!voteChoice.value) return
  const next = await runCommand('CAST_AUDIENCE_VOTE', { candidateStarId: voteChoice.value }, '已投票')
  if (next) voteChoice.value = ''
}

async function sendGift(gift) {
  if (!currentProgram.value) return
  const next = await runCommand('SEND_GIFT', {
    programId: currentProgram.value.id,
    giftId: gift.id,
    quantity: giftQuantity.value,
  }, `${gift.name} × ${giftQuantity.value} 已送出。`)
  if (next) { giftQuantity.value = 1; await closeGift() }
}

async function openGift() {
  document.activeElement?.blur?.()
  colorPickerOpen.value = false
  selectedGiftId.value = currentProgram.value?.giftCatalog?.[0]?.id ?? 'gift-glimmer'
  giftOpen.value = true
  giftQuantity.value = 1
  await nextTick()
  giftClose.value?.focus()
}

async function closeGift(restore = true) {
  giftOpen.value = false
  giftQuantity.value = 1
  if (restore) {
    await nextTick()
    giftTrigger.value?.focus({ preventScroll: true })
  }
}

async function openLogout() {
  document.activeElement?.blur?.()
  archiveMetricHelp.value = ''
  logoutOpen.value = true
  await nextTick()
  logoutCancel.value?.focus()
}

async function closeLogout(restore = true) {
  logoutOpen.value = false
  if (restore) {
    await nextTick()
    logoutTrigger.value?.focus({ preventScroll: true })
  }
}

async function confirmLogout() {
  abortSnapshotRequests()
  realtime.stop()
  const busyToken = {}
  busyOwner = busyToken
  busy.value = 'logout'
  try {
    await v2ParticipantApi.logout()
  } catch {
    // Local clearing is intentional even when the LAN service is unreachable.
  } finally {
    if (busyOwner === busyToken) {
      busyOwner = null
      busy.value = ''
    }
    clearSession()
  }
}

function trapDialog(event) {
  const focusable = [...event.currentTarget.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href]',
  )]
  const first = focusable[0]
  const last = focusable.at(-1)
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function onEscape(event) {
  if (event.key !== 'Escape') return
  finishMobileProgramOpening()
  if (logoutOpen.value) void closeLogout()
  else if (giftOpen.value) void closeGift()
  else if (barrageConfirmOpen.value) void closePremiumBarrage()
  else archiveMetricHelp.value = ''
}

function selectTab(tab) {
  if (!navigationAvailable.value) return
  if (tab !== 'archive') archiveMetricHelp.value = ''
  if (mainDockBody.value) tabScroll[activeTab.value] = mainDockBody.value.scrollTop
  colorPickerOpen.value = false
  activeTab.value = tab
  void nextTick(() => {
    if (mainDockBody.value) mainDockBody.value.scrollTop = tabScroll[tab] ?? 0
    if (!compactKeyboard.value) window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  })
}

function toggleArchiveMetricHelp(metric) {
  archiveMetricHelp.value = archiveMetricHelp.value === metric ? '' : metric
}

function programStateLabel(state) {
  return PROGRAM_STATE_LABELS[state] ?? state
}

watch(() => runtime.value?.currentScene, (next, previous) => {
  toast.value = ''
  colorPickerOpen.value = false
  const focused = document.activeElement
  if (previous === 'PROGRAM_SUPPORT' && next !== 'PROGRAM_SUPPORT') {
    barrageDraft.value = ''
    barrageConfirmOpen.value = false
    dockTextInputFocused.value = false
    giftOpen.value = false
  }
  if (admitted.value && activeTab.value === 'scene' && focused && root.value?.contains(focused)) {
    void nextTick(() => {
      if (!document.contains(focused)) sceneHeading.value?.focus()
    })
  }
})

watch(() => runtime.value?.status, (next, previous) => {
  toast.value = ''
  if (next === 'COMPLETED' && previous !== 'COMPLETED') {
    finishCinematic()
    realtime.suspend('本场活动已结束，你的记录已保存。')
    void nextTick(() => sceneHeading.value?.focus())
  }
})

watch(reducedMotion, (next) => {
  if (next) { finishCinematic(); finishMobileProgramOpening() }
})

function onVisibilityChange() {
  pageHidden.value = document.hidden
  if (document.hidden) {
    finishMobileProgramOpening()
    clearLiveBarrages()
    clearGiftFlights()
  }
  if (document.hidden && shouldFinishCinematicOnHidden(cinematic.value)) {
    finishCinematic()
  }
}

onMounted(async () => {
  mounted = true
  syncVisualViewport()
  window.visualViewport?.addEventListener('resize', syncVisualViewport)
  window.addEventListener('resize', syncVisualViewport)
  window.addEventListener('keydown', onEscape)
  document.addEventListener('visibilitychange', onVisibilityChange)
  const initialInvitationToken = takePendingInvitationToken()
  invitationToken = initialInvitationToken
  try {
    const initialSnapshot = await refreshSnapshot()
    if (!mounted || !initialSnapshot) return
    if (!galaxyCapacityValid.value) {
      realtime.suspend('星系容量数据异常，已停止写入。')
    } else if (runtime.value?.status === 'COMPLETED') {
      realtime.suspend('本场活动已结束，你的记录已保存。')
    } else {
      await realtime.connect()
    }
    titleMotionEnabled.value = true
    return
  } catch (error) {
    if (!mounted) return
    if (!(error instanceof ApiError) || error.code !== 'AUTH_REQUIRED') {
      persistentError.value = publicErrorMessage(error)
      entryState.value = 'activation'
      return
    }
  }
  if (initialInvitationToken) {
    // The anonymous snapshot probe intentionally clears any stale local
    // session. Keep this one-use credential only in the current boot frame so
    // AUTH_REQUIRED cannot erase the NFC/QR activation that follows it.
    invitationToken = initialInvitationToken
    await activate('INVITATION_TOKEN', { token: initialInvitationToken })
  } else {
    entryState.value = 'activation'
  }
})

onBeforeUnmount(() => {
  finishMobileProgramOpening()
  titleObserver?.disconnect()
  clearLiveBarrages()
  clearGiftFlights()
  mounted = false
  abortSnapshotRequests()
  if (toastTimer !== null) clearTimeout(toastTimer)
  finishCinematic()
  clearSensitiveDrafts()
  dockTextInputFocused.value = false
  window.visualViewport?.removeEventListener('resize', syncVisualViewport)
  window.removeEventListener('resize', syncVisualViewport)
  window.removeEventListener('keydown', onEscape)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <section
    ref="root"
    class="v2-welcome"
    :class="{
      'is-keyboard': compactKeyboard && dockTextInputFocused,
      'is-content-page': navigationAvailable && (activeTab !== 'scene' || runtime?.currentScene === 'PROGRAM_SUPPORT'),
      'is-live-chat': admitted && activeTab === 'scene' && runtime?.currentScene === 'PROGRAM_SUPPORT' && runtime?.status === 'RUNNING' && snapshot?.presentation.type === 'NONE',
      'is-onboarding': snapshot && !admitted,
      'is-completed': runtime?.status === 'COMPLETED',
      'is-discovery-active': discoveryActive,
      'is-discovery-pending': cinematic === 'discovery-pending',
      'is-discovering': cinematic === 'discovering',
      'is-color-confirming': cinematic === 'color-confirm',
      'is-orbit-handoff': cinematic === 'orbit-handoff',
    }"
    :style="welcomeStyle"
    data-visual-palette="orbital-signal-spectrum"
    :data-program-opening="mobileProgramOpening ? 'playing' : 'settled'"
  >
    <OpeningMusic :scene="runtime?.currentScene" :status="runtime?.status" />
    <PersonalJourneyStage
      v-if="!programBackgroundVisible"
      ref="journeyStage"
      :phase="journeyPhase"
      :playing="journeyPlaying"
      :reduced="reducedMotion"
      :paused="pageHidden || runtime?.status === 'PAUSED'"
      :color="selectedColor"
      :own-star="journeyOwnStar"
    />
    <ProgramStageBackground v-else compact :reduced="reducedMotion" :paused="pageHidden || runtime?.status === 'PAUSED'" />
    <MobileProgramOpening v-if="mobileProgramOpening && programBackgroundVisible" @finish="finishMobileProgramOpening" />
    <GiftStarshipFlight
      v-for="flight in giftFlights"
      :key="flight.id"
      surface="phone"
      :quantity="flight.quantity"
      :reduced="reducedMotion"
    />
    <span class="sr-only" aria-live="assertive">{{ giftAnnouncement }}</span>

    <header
      class="v2-welcome__header"
      :inert="headerUnavailable ? true : undefined"
      :aria-hidden="headerUnavailable ? 'true' : undefined"
    >
      <a
        class="v2-welcome__college-link"
        :href="COLLEGE_WEBSITE_URL"
        target="_blank"
        rel="noopener noreferrer external"
        aria-label="访问中山大学智能工程学院官网（新窗口打开）"
      >
        <img
          :src="collegeWordmarkUrl"
          width="961"
          height="156"
          alt=""
        >
      </a>
       <button
        v-if="snapshot"
        ref="logoutTrigger"
        type="button"
         class="v2-welcome__logout"
         @click="openLogout"
       >退出登录</button>
    </header>

    <main
      class="v2-welcome__main"
      :inert="modalOpen ? true : undefined"
      :aria-hidden="modalOpen ? 'true' : undefined"
    >
      <section v-if="entryState === 'checking'" class="entry-copy" role="status">
        <p class="kicker">信号检索</p>
        <h2>正在寻找属于你的信号</h2>
      </section>

      <section v-else-if="!snapshot" class="entry-copy">
        <p class="kicker">身份核验</p>
        <h2>重新进入你的星域</h2>
        <p>输入学生姓名与 8 位学号，或再次轻触 NFC、扫描邀请函。</p>
      </section>

      <section
        v-else-if="!completed && participant?.onboardingState === 'NEEDS_COLOR'"
        class="color-onboarding"
        :class="{
          'color-onboarding--pending': cinematic === 'discovery-pending',
          'color-onboarding--discovering cinematic--discovering': cinematic === 'discovering',
          'color-onboarding--settled': !discoveryActive,
        }"
        :style="{ '--discovery-duration': `${DISCOVERY_CINEMATIC_DURATION_MS}ms` }"
        data-testid="color-onboarding"
      >
        <div
          class="discovery-copy"
          :aria-hidden="discoveryActive ? undefined : 'true'"
          :role="discoveryActive ? 'status' : undefined"
          :aria-live="discoveryActive ? 'polite' : undefined"
        >
          <p class="kicker">星体定位</p>
          <p class="discovery-person">{{ participantDisplayName }}</p>
          <SignalTypeTitle
            text="找到属于你的星"
            :accessible-label="`找到属于 ${participantDisplayName} 的星`"
            :replay-key="`discovery-${cinematic}`"
            :animate="titleMotionEnabled && cinematic === 'discovering'"
            :reduced="reducedMotion"
            :delay-ms="Math.round(DISCOVERY_CINEMATIC_DURATION_MS * 0.72)"
          />
          <p class="discovery-welcome">
            <strong>星星编号 {{ personalStarCode }}</strong>
            <span>欢迎参加智能工程学院迎新晚会</span>
          </p>
        </div>

        <div
          class="selection-copy"
          :inert="discoveryActive ? true : undefined"
          :aria-hidden="discoveryActive ? 'true' : undefined"
        >
          <p class="kicker">星星编号 · {{ personalStarCode }}</p>
          <SignalTypeTitle
            :text="'为这颗星\n选择一种光'"
            accessible-label="为你的星选择颜色"
            :replay-key="discoveryActive ? 'color-waiting' : 'color-ready'"
            :animate="titleMotionEnabled && !discoveryActive"
            :reduced="reducedMotion"
          />
        </div>
      </section>

      <section v-else-if="cinematic === 'color-confirm'" class="cinematic cinematic--color-confirm" aria-live="polite">
        <p class="kicker">色温锁定</p>
        <h2>这束光，已经属于你</h2>
        <p>星色已保存，正在为你接入星河轨道。</p>
      </section>

      <section v-else-if="cinematic === 'orbit-handoff'" class="cinematic cinematic--orbit-handoff" aria-live="polite">
        <p class="kicker">轨道接入</p>
        <h2>从一颗星，到一片星河</h2>
        <p>你的星正沿着自己的轨道，汇入流动星系。</p>
      </section>

      <section v-else class="scene-copy" :class="`scene-${runtime?.currentScene?.toLowerCase() ?? 'ready'}`" role="status" aria-live="polite">
        <p class="kicker">{{ viewCopy.kicker }}</p>
        <SignalTypeTitle
          id="view-title"
          ref="sceneHeading"
          tabindex="-1"
          :text="viewCopy.displayTitle ?? viewCopy.title"
          :accessible-label="viewCopy.title"
          :replay-key="viewRevealKey"
          :animate="false"
          :reduced="reducedMotion"
        />
        <p v-if="viewCopy.subtitle">{{ viewCopy.subtitle }}</p>
      </section>
    </main>

    <aside
      class="operation-dock"
      :class="{ 'operation-dock--chat': admitted && activeTab === 'scene' && runtime?.currentScene === 'PROGRAM_SUPPORT', 'operation-dock--expanded': dockExpanded, 'operation-dock--keyboard': compactKeyboard && dockTextInputFocused }"
      :inert="modalOpen ? true : undefined"
      :aria-hidden="modalOpen ? 'true' : undefined"
      @focusin="onDockFocusIn"
      @focusout="onDockFocusOut"
    >
      <p v-if="persistentError" class="dock-message dock-message--error" role="alert">{{ persistentError }}</p>
      <p v-else-if="connectionMessage && participant?.onboardingState !== 'NEEDS_COLOR'" class="dock-message dock-message--warning" role="status">{{ connectionMessage }}</p>
      <p v-else-if="runtime?.status === 'PAUSED'" class="dock-message dock-message--warning" role="status">现场已暂停，输入会保留在本页，但不会排队或自动提交。</p>
      <p v-else-if="persistentNotice" class="dock-message" role="status">{{ persistentNotice }}</p>

      <div v-if="!snapshot && (entryState === 'checking' || busy === 'activation')" class="dock-body dock-waiting" role="status">
        <span aria-hidden="true"></span><p>正在核验邀请，找回你的星…</p>
      </div>

      <form v-else-if="!snapshot" class="dock-body entry-form" novalidate @submit.prevent="activateAssisted">
        <label>学生姓名<input v-model="displayName" autocomplete="off" maxlength="40" placeholder="请输入学生姓名" aria-describedby="v2-assisted-disclosure" /></label>
        <label>8 位学号<input v-model="studentNumber" inputmode="numeric" autocomplete="off" maxlength="8" pattern="[0-9]{8}" placeholder="00000001" aria-describedby="v2-assisted-disclosure" /></label>
        <button class="dock-primary" type="submit" :disabled="busy === 'activation'">
          {{ busy === 'activation' ? '正在核验…' : '核验并重新进入' }}
        </button>
        <p id="v2-assisted-disclosure" class="dock-disclosure">{{ protectedRuntime ? '请填写邀请函对应的姓名与 8 位学号以恢复本人档案；也可重新轻触 NFC 或扫码。' : '当前排练仅识别分配的测试姓名与 8 位编号，不会核验真实学籍信息；也可重新轻触 NFC 或扫码。' }}</p>
      </form>

      <div
        v-else-if="!completed && participant?.onboardingState === 'NEEDS_COLOR'"
        class="dock-body color-stage"
        :class="{
          'color-stage--pending': cinematic === 'discovery-pending',
          'color-stage--discovering': cinematic === 'discovering',
          'color-stage--settled': !discoveryActive,
        }"
        :style="{ '--discovery-duration': `${DISCOVERY_CINEMATIC_DURATION_MS}ms` }"
        data-testid="persistent-color-stage"
      >
        <div
          class="dock-discovery-status"
          :aria-hidden="discoveryActive ? undefined : 'true'"
          :role="discoveryActive ? 'status' : undefined"
        >
          <span aria-hidden="true"></span>
          <p>{{ cinematic === 'discovery-pending' ? '正在确认前台信号…' : '沿学院蓝轨道持续捕获信标…' }}</p>
        </div>

        <div
          class="color-control"
          :inert="discoveryActive ? true : undefined"
          :aria-hidden="discoveryActive ? 'true' : undefined"
          data-testid="persistent-color-controls"
        >
          <div class="color-control__summary">
            <label for="v2-star-temperature">恒星色温</label>
            <output for="v2-star-temperature" :style="{ color: selectedColor }">{{ colorKelvin.toLocaleString('zh-CN') }} K</output>
          </div>
          <p v-if="colorConnectionMessage" class="color-control__connection" role="status" aria-live="polite">{{ colorConnectionMessage }}</p>
          <input
            id="v2-star-temperature"
            v-model.number="colorKelvin"
            type="range"
            :min="STAR_TEMPERATURE_MIN"
            :max="STAR_TEMPERATURE_MAX"
            :step="STAR_TEMPERATURE_STEP"
            aria-describedby="v2-star-temperature-scale"
            :aria-valuetext="`${colorKelvin.toLocaleString('zh-CN')} 开尔文`"
          />
          <div id="v2-star-temperature-scale" class="temperature-scale"><span>暖红</span><span>日光</span><span>冷蓝</span></div>
          <p class="color-control__commitment">确认后本场不可更改</p>
          <button class="dock-primary" type="button" :disabled="!writesReady || Boolean(busy)" @click="lockColor">
            {{ busy === 'LOCK_COLOR' ? '正在确认…' : '确认星色' }}
          </button>
        </div>
      </div>

      <div v-else-if="cinematic === 'color-confirm'" class="dock-body dock-waiting">
        <span aria-hidden="true"></span><p>星色已经保存，正在建立星河轨道。</p>
      </div>

      <div v-else-if="cinematic === 'orbit-handoff'" class="dock-body dock-handoff-status" role="status">
        <small>轨道接入</small><strong>星色已确认</strong><p>带着你选择的光，汇入今夜的星河。</p>
      </div>

      <template v-else>
        <div ref="mainDockBody" :key="viewRevealKey" class="dock-body admitted-panel page-reveal">
          <template v-if="activeTab === 'scene'">
            <PersonalMemento v-if="runtime?.status === 'COMPLETED'" :participant="participant" :star-code="personalStarCode" :color="selectedColor" @open-archive="selectTab('archive')" />
            <div v-else-if="runtime?.status === 'PAUSED'" class="terminal-copy">
              <strong>互动暂时停止</strong><p>恢复后会从当前现场环节继续。</p>
            </div>
            <div v-else-if="runtime?.status === 'READY'" class="terminal-copy">
              <strong>{{ snapshot.aggregate.publicStarCount }} 颗星，已在这里相遇</strong><p>入场已完成，稍后一起启程。</p>
            </div>
            <button
              v-else-if="runtime?.currentScene === 'ASSEMBLY' && actionAllowed(snapshot, 'START_STAR')"
              class="dock-primary"
              type="button"
              :disabled="!writesReady || Boolean(busy)"
              @click="startStar"
            >{{ busy === 'START_STAR' ? '正在启动…' : '启动我的星' }}</button>
            <div v-else-if="runtime?.currentScene === 'ASSEMBLY'" class="terminal-copy">
              <strong>{{ participant.started ? '星星已启动' : '已进入星海集结' }}</strong><p>等待现场进入下一环节。</p>
            </div>

            <section v-else-if="snapshot.presentation.type === 'RAFFLE'" class="phone-raffle" aria-label="正在抽取上台观众"><span class="phone-raffle__star" aria-hidden="true">✦</span><small>互动环节二</small><h3>正在抽取上台观众</h3><p></p><span class="phone-raffle__code">{{ personalStarCode }}</span></section>
            <form v-else-if="runtime?.currentScene === 'PROGRAM_SUPPORT'" class="program-composer" @submit.prevent="postBarrage()">
              <div class="now-playing"><span>现场聊天</span><span v-if="currentProgram?.kind === 'PERFORMANCE' && currentProgram.giftsEnabled !== false">热度 {{ currentProgram.heat }}</span></div>

              <div v-if="currentProgramGiftSummary.length" class="current-program-gifts" aria-label="当前节目收到的礼物">
                <span>本节目收到</span>
                <ul>
                  <li v-for="gift in currentProgramGiftSummary" :key="gift.id + '-' + gift.sentCount" class="gift-received" :data-gift-id="gift.id"><GiftSignalIcon :gift-id="gift.id" aria-hidden="true" /><span>{{ gift.name }}</span><strong>{{ gift.id === 'gift-starship' ? `${(gift.sentCount ?? 0) * gift.powerCost} 礼物值` : `×${gift.sentCount ?? 0}` }}</strong></li>
                </ul>
              </div>
              <MobileBarrage :items="liveBarrages" />
              <section v-if="liveInteraction && liveInteraction.phase !== 'IDLE'" class="live-interaction-card" :class="`is-${liveInteraction.phase.toLowerCase()}`" aria-live="polite">
                <small>{{ interactionLabel(liveInteraction.segmentCode) }} · 第 {{ liveInteraction.roundNumber }} 轮</small>
                <h3 v-if="liveInteraction.prompt">{{ liveInteraction.prompt }}</h3>
                <template v-if="liveInteraction.phase === 'BUZZER_OPEN'">
                  <output v-if="buzzerCountdown" class="buzzer-countdown" aria-label="抢答倒计时">{{ buzzerCountdown }}</output>
                  <button class="buzzer-button" type="button" :disabled="buzzerCountdown > 0 || !actionAllowed(snapshot, 'BUZZ_IN') || Boolean(busy)" @click="buzzIn">{{ buzzerCountdown ? '准备抢答' : busy === 'BUZZ_IN' ? '提交中…' : '立即抢答' }}</button>
                </template>
                <template v-else-if="liveInteraction.phase === 'BUZZER_LOCKED'">
                  <strong class="buzzer-result">{{ liveInteraction.leader?.publicStarId ?? '结果锁定中' }}</strong>
                  <p>{{ liveInteraction.participation.hasBuzzed ? `你的顺位：${liveInteraction.participation.buzzPosition}` : '本轮已结束' }}</p>
                </template>
                <template v-else-if="liveInteraction.phase === 'VOTE_OPEN'">

                  <div class="vote-options" role="radiogroup" aria-label="上台观众候选">
                    <label v-for="candidate in liveInteraction.voteCandidates" :key="candidate.publicStarId" :style="{ '--candidate-color': candidate.displayColor }"><input v-model="voteChoice" type="radio" name="audience-vote" :value="candidate.publicStarId" :disabled="liveInteraction.participation.hasVoted"><span>{{ candidate.publicStarId }}</span></label>
                  </div>
                  <button class="dock-primary" type="button" :disabled="!voteChoice || !actionAllowed(snapshot, 'CAST_AUDIENCE_VOTE') || Boolean(busy)" @click="castAudienceVote">{{ liveInteraction.participation.hasVoted ? '本轮已投票' : '确定' }}</button>
                </template>
                <template v-else>
                  <div class="vote-results"><div v-for="candidate in liveInteraction.voteCandidates" :key="candidate.publicStarId"><span>{{ candidate.publicStarId }}</span><i :style="{ transform: `scaleX(${liveInteraction.totalVotes ? (candidate.voteCount ?? 0) / liveInteraction.totalVotes : 0})` }"></i><strong>{{ candidate.voteCount ?? 0 }}</strong></div></div>
                  <p>共收到 {{ liveInteraction.totalVotes }} 票</p>
                </template>
              </section>
              <div v-show="colorPickerOpen" id="barrage-style-picker" class="barrage-style-picker"><div class="barrage-colors" role="group" aria-label="弹幕星色">
                <button v-for="color in BARRAGE_COLORS" :key="color.id" type="button" :aria-pressed="barrageColor === color.id" :aria-label="`${color.name}，${color.cost && !participant.unlockedBarrageStyles?.includes(color.id) ? '首次发送解锁需 10 动力' : '免费'}`" :title="color.name" :style="{'--swatch':barrageSwatch(color)}" @click="barrageColor = color.id"></button>
              </div>
              <p class="barrage-color-help">{{ BARRAGE_COLORS.find(c => c.id === barrageColor)?.name }} · {{ ['aurora','sunset','nebula'].includes(barrageColor) && !participant.unlockedBarrageStyles?.includes(barrageColor) ? '10 动力 · 本场解锁' : '免费使用' }}</p></div>
              <label class="sr-only" for="v2-barrage">弹幕</label>
              <div class="composer-row">
                <input
                  id="v2-barrage"
                  v-model="barrageDraft"
                  :disabled="!actionAllowed(snapshot, 'POST_BARRAGE') || snapshot.interaction.barragePaused"
                  :placeholder="snapshot.interaction.barragePaused ? '现场暂停接收弹幕' : '发送弹幕…'"
                />
                <button ref="barrageSend" class="dock-primary dock-primary--compact" type="submit" :disabled="!writesReady || !actionAllowed(snapshot, 'POST_BARRAGE') || snapshot.interaction.barragePaused || Boolean(busy)">发送</button>
              </div>
              <div class="composer-tools">
                <div class="composer-identity"><button class="style-trigger" type="button" aria-controls="barrage-style-picker" :aria-expanded="colorPickerOpen" @click="colorPickerOpen = !colorPickerOpen">星色 <span :style="{ background: barrageSwatch(selectedBarrageStyle) }"></span></button><small>{{ personalStarCode }} · {{ barrageLength }} / 40</small></div>
                <button
                  ref="giftTrigger"
                  v-if="currentProgram?.kind === 'PERFORMANCE' && currentProgram.giftsEnabled !== false"
                  class="gift-trigger"
                  type="button"
                  aria-label="送礼物"
                  aria-haspopup="dialog"
                  :aria-expanded="giftOpen"
                  @click="openGift"
                ><span>送礼物</span><small>余额 {{ participant.powerBalance }}</small></button>
              </div>
            </form>

            <section v-else-if="runtime?.currentScene === 'COOPERATIVE_LIGHT'" class="cooperative-card">
              <div class="cooperative-count"><span>此刻，与你一起点亮</span><strong>{{ snapshot.aggregate.cooperativeLightCount }}<small> / {{ snapshot.aggregate.admittedCount }}</small></strong></div>
              <progress :value="snapshot.aggregate.cooperativeLightCount" :max="Math.max(1,snapshot.aggregate.admittedCount)" aria-label="全场点亮进度"></progress>
              <button v-if="actionAllowed(snapshot, 'COOPERATIVE_LIGHT')" class="dock-primary" type="button" :disabled="!writesReady || Boolean(busy)" @click="cooperativeLight">{{ busy === 'COOPERATIVE_LIGHT' ? '正在点亮…' : '参与全场点亮' }}</button>
              <div v-else class="terminal-copy"><strong>{{ participant.cooperativeLightAt ? '点亮已完成' : '已进入协同点亮' }}</strong><p>{{ participant.cooperativeLightAt ? '你的光，已与全场相连。' : '等待现场发出点亮信号。' }}</p></div>
            </section>
          </template>

          <section v-else-if="activeTab === 'programs'" class="program-list" aria-labelledby="view-title">
            <header><span>{{ snapshot.programs.filter(item => item.kind === 'PERFORMANCE').length }} 个节目 · {{ snapshot.programs.filter(item => ['INTERLUDE','DEFERRED'].includes(item.kind)).length }} 个互动环节</span></header>
            <ol>
              <li v-for="program in snapshot.programs" :key="program.id" :class="[`is-${program.state.toLowerCase()}`, { 'is-segment': program.kind !== 'PERFORMANCE' }]">
                <span v-if="program.kind === 'PERFORMANCE'">{{ program.displayCode }}</span>
                <div><strong>{{ program.title }}</strong><small v-if="program.kind === 'PERFORMANCE' && programCredits(program)" class="program-performers">{{ programCredits(program) }}</small></div>
                <em v-if="program.state === 'CURRENT'">进行中</em>
              </li>
            </ol>
          </section>

          <section v-else class="archive" aria-labelledby="view-title" :style="{ '--identity-color': selectedColor }">
            <header>
              <div><small>这一束光，属于</small><strong class="archive-owner">{{ participantDisplayName }}</strong></div>
              <strong>{{ personalStarCode }}</strong>
            </header>
            <dl>

              <div><dt>星色</dt><dd>{{ participant.colorTemperatureKelvin ? `${participant.colorTemperatureKelvin.toLocaleString('zh-CN')} K` : '未选色' }}</dd></div>
              <div class="archive-metric archive-metric--interactive" :class="{ 'is-open': archiveMetricHelp === 'power' }">
                <dt><button type="button" aria-controls="archive-metric-help" :aria-expanded="archiveMetricHelp === 'power'" :aria-describedby="archiveMetricHelp === 'power' ? 'archive-metric-help' : undefined" @click="toggleArchiveMetricHelp('power')">动力<i aria-hidden="true">?</i></button></dt>
                <dd>{{ participant.powerBalance }}</dd>
              </div>

            </dl>
            <div id="archive-metric-help" class="archive-metric-help" :class="{ 'is-visible': archiveMetricMessage }" :role="archiveMetricMessage ? 'tooltip' : undefined" :aria-hidden="archiveMetricMessage ? undefined : 'true'" aria-live="polite">
              <p v-if="archiveMetricMessage">{{ archiveMetricMessage }}</p>

            </div>
            <section class="archive-activity" aria-labelledby="archive-gifts-title">
              <header>
                <div><small>今晚的应援</small><strong id="archive-gifts-title" class="archive-activity-title">礼物足迹</strong></div>
                <strong>{{ archiveGiftQuantity }} 份</strong>
              </header>
              <ul v-if="participant.giftHistory?.length" class="archive-gift-list">
                <li v-for="item in participant.giftHistory" :key="`${item.programId}-${item.giftId}`">
                  <span class="archive-gift-icon" aria-hidden="true"><GiftSignalIcon :gift-id="item.giftId" /></span>
                  <div><strong>{{ item.programTitle }}</strong><small>{{ item.giftName }} × {{ item.quantity }}</small></div>
                  <span>{{ item.totalPower }} 动力</span>
                </li>
              </ul>
              <p v-else class="archive-empty">暂无礼物记录</p>
            </section>
            <section class="archive-activity" aria-labelledby="archive-barrages-title">
              <header>
                <div><small>今晚说过的话</small><strong id="archive-barrages-title" class="archive-activity-title">我的弹幕</strong></div>
                <strong>{{ participant.barrageHistory?.length ?? 0 }} 条</strong>
              </header>
              <ul v-if="participant.barrageHistory?.length" class="archive-barrage-list">
                <li v-for="item in participant.barrageHistory" :key="item.barrageId">
                  <p :style="barragePaint(item.colorStyle, item.customColor)">{{ item.text }}</p>
                  <small>{{ formatArchiveTime(item.createdAt) }}<span v-if="item.status === 'REMOVED'"> · 已撤下</span></small>
                </li>
              </ul>
              <p v-else class="archive-empty">暂无弹幕记录</p>
            </section>
          </section>
        </div>

        <nav class="dock-tabs" aria-label="手机端主导航">
          <button v-for="tab in V2_MOBILE_TABS" :key="tab.id" type="button" :aria-current="activeTab === tab.id ? 'page' : undefined" @click="selectTab(tab.id)">{{ tab.label }}</button>
        </nav>
      </template>
    </aside>
    <p v-if="toast && !modalOpen" class="dock-toast" role="status">{{ toast }}</p>

    <Transition name="mobile-sheet"><div v-if="giftOpen" class="modal-backdrop">
      <section id="v2-gift-sheet" class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="gift-title" :aria-describedby="giftAvailabilityMessage ? 'gift-description gift-availability' : 'gift-description'" @keydown.tab="trapDialog">
        <header><div><small>节目应援</small><h2 id="gift-title">送礼物</h2></div><button ref="giftClose" type="button" aria-label="关闭礼物面板" @click="closeGift()">返回</button></header>
        <div class="gift-balance" aria-label="当前动力余额">
          <span>可用动力</span>
          <output>{{ participant.powerBalance }}<small>动力</small></output>
        </div>
        <p id="gift-description">{{ currentProgram?.title }} · 虚拟礼物</p>

        <p v-if="giftAvailabilityMessage && currentProgram?.giftCatalog?.length" id="gift-availability" class="modal-status" role="status">{{ giftAvailabilityMessage }}</p>
        <div v-if="currentProgram?.giftCatalog?.length" class="gift-grid">
          <button
            v-for="gift in currentProgram.giftCatalog"
            :key="gift.id"
            type="button"
            :class="`gift-${gift.id.replace('gift-', '')}`"
            :aria-label="`${gift.name}，单个 ${gift.powerCost} 动力，本次 ${giftQuantity} 个共 ${gift.powerCost * giftQuantity} 动力，本节目已送 ${gift.sentCount ?? 0} 份${participant.powerBalance < gift.powerCost * giftQuantity ? '，动力不足' : ''}`"
            :aria-pressed="selectedGiftId === gift.id"
            :disabled="!giftInteractionReady || Boolean(busy)"
            @click="selectedGiftId = gift.id"
          >
            <span class="gift-icon-shell" aria-hidden="true"><GiftSignalIcon :gift-id="gift.id" /></span>
            <span v-if="selectedGiftId === gift.id" class="gift-selection-mark" aria-hidden="true">✓</span>
            <span class="gift-copy"><strong>{{ gift.name }}</strong></span>
            <output>{{ gift.powerCost }}<small>动力 / 个</small></output>
          </button>
        </div>
        <p v-else id="gift-availability" class="gift-empty" role="status">{{ giftAvailabilityMessage || '等待节目开始' }}</p>
        <template v-if="currentProgram?.giftCatalog?.length">
        <div class="gift-amount" role="group" aria-label="选择赠送数量">
          <span>数量</span>
          <div><button type="button" aria-label="减少礼物数量" :disabled="giftQuantity <= 1" @click="giftQuantity--">−</button><output>{{ giftQuantity }}</output><button type="button" aria-label="增加礼物数量" :disabled="giftQuantity >= 20" @click="giftQuantity++">＋</button></div>
        </div>
          <div class="gift-send-row"><span><small class="gift-total-label">{{ selectedGift?.name }} × {{ giftQuantity }}</small>{{ giftTotal }} 动力<small v-if="participant.powerBalance < giftTotal">动力不足</small></span><button class="dock-primary" type="button" :disabled="!selectedGift || !giftInteractionReady || participant.powerBalance < giftTotal || Boolean(busy)" @click="sendGift(selectedGift)">发送</button></div>
        </template>
      </section>
    </div>

    </Transition>
    <div v-if="barrageConfirmOpen" class="modal-backdrop modal-backdrop--dialog">
      <section class="confirm-dialog premium-barrage-confirm" role="alertdialog" aria-modal="true" aria-labelledby="premium-barrage-title" aria-describedby="premium-barrage-description" @keydown.tab="trapDialog">

        <h2 id="premium-barrage-title">解锁「{{ selectedBarrageStyle.name }}」</h2>
        <p id="premium-barrage-description">10 动力 · 本场解锁并发送</p>
        <blockquote :style="barragePaint(barrageColor, barrageColor === 'personal' ? selectedColor : null)">{{ barrageDraft }}</blockquote>
        <p class="premium-balance">剩余 {{ participant.powerBalance - 10 }} 动力</p>
        <div class="dock-actions"><button ref="barrageConfirmCancel" class="dock-secondary" type="button" @click="closePremiumBarrage()">返回</button><button class="dock-primary" type="button" :disabled="Boolean(busy)" @click="confirmPremiumBarrage">确定</button></div>
      </section>
    </div>
    <div v-if="logoutOpen" class="modal-backdrop modal-backdrop--dialog">
      <section class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="logout-title" aria-describedby="logout-description" @keydown.tab="trapDialog">
        <h2 id="logout-title">退出当前身份？</h2>
        <p id="logout-description">退出后可重新核验或扫码进入。{{ barrageDraft ? '未提交的弹幕草稿将丢失。' : '' }}</p>
        <div class="dock-actions"><button ref="logoutCancel" class="dock-secondary" type="button" @click="closeLogout()">返回</button><button class="dock-danger" type="button" :disabled="busy === 'logout'" @click="confirmLogout">确定</button></div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.barrage-colors{display:flex;gap:12px;padding:6px 2px}.barrage-colors button{width:22px;height:22px;border-radius:50%;border:2px solid transparent;outline-offset:3px}.barrage-colors button[aria-pressed="true"]{outline:1px solid #d5e7ff}.barrage-color-help,.gift-allowance{color:#9eafc9;font-size:11px;line-height:1.6}
.live-interaction-card{display:grid;gap:12px;margin:0 0 14px;padding:16px;border:1px solid rgba(122,180,255,.24);border-radius:14px;background:radial-gradient(circle at 100% 0,rgba(92,148,255,.16),transparent 45%),rgba(5,18,38,.78);box-shadow:0 16px 40px rgba(0,6,20,.28)}
.live-interaction-card>small{color:#86baff;font:650 10px var(--font-data);letter-spacing:.17em}.live-interaction-card h3{margin:0;color:#eef6ff;font-size:18px;line-height:1.45}.live-interaction-card p{margin:0;color:#9fb1c9;font-size:12px;line-height:1.65}
.buzzer-button{min-height:82px;border:1px solid rgba(145,202,255,.58);border-radius:50%;color:#f5fbff;background:radial-gradient(circle at 45% 36%,#6bbaff,#2c66d9 52%,#0d2c74);box-shadow:0 0 0 8px rgba(84,145,255,.09),0 14px 34px rgba(19,81,205,.38);font:700 20px var(--font-ui);letter-spacing:.08em}.buzzer-button:active{transform:scale(.96)}.buzzer-button:disabled{opacity:.52}
.buzzer-result{display:block;color:#e9f4ff;font:720 30px var(--font-data);letter-spacing:.14em;text-align:center;text-shadow:0 0 22px rgba(114,181,255,.62)}
.vote-options{display:grid;grid-template-columns:1fr 1fr;gap:8px}.vote-options label{position:relative;min-height:48px}.vote-options input{position:absolute;opacity:0}.vote-options span{display:grid;min-height:48px;place-items:center;border:1px solid rgba(146,184,231,.2);border-radius:10px;background:rgba(7,23,46,.72);color:#cbdaf0;font:600 13px var(--font-data);box-shadow:inset 3px 0 0 var(--candidate-color,#7bb4ff)}.vote-options input:checked+span{border-color:#9dccff;background:rgba(49,103,194,.3);color:#fff;box-shadow:0 0 0 2px rgba(104,174,255,.14),inset 3px 0 0 var(--candidate-color,#7bb4ff)}.vote-options input:focus-visible+span{outline:2px solid #d9ebff;outline-offset:2px}
.vote-results{display:grid;gap:9px}.vote-results>div{display:grid;grid-template-columns:72px minmax(0,1fr) 28px;align-items:center;gap:8px;font:600 11px var(--font-data)}.vote-results i{height:7px;border-radius:99px;background:linear-gradient(90deg,#6aaeff,#a8dcff);transform-origin:left;transition:transform .45s ease}
.gift-amount{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border:1px solid rgba(147,190,244,.16);border-radius:12px;background:rgba(8,25,49,.56)}.gift-amount>span{display:grid;gap:2px}.gift-amount small{color:#8fa4bf;font-size:10px}.gift-amount strong{font-size:13px}.gift-amount>div{display:grid;grid-template-columns:44px 42px 44px;align-items:center}.gift-amount button{min-height:44px;border:1px solid rgba(155,198,249,.18);color:#dcecff;background:#102746;font-size:20px}.gift-amount output{text-align:center;font:700 16px var(--font-data)}
.premium-barrage-confirm{border-color:rgba(197,164,255,.35);background:radial-gradient(circle at 85% 0,rgba(125,83,229,.24),transparent 42%),#081326}.premium-barrage-confirm>small{color:#c4a7ff;font:650 10px var(--font-data);letter-spacing:.2em}.premium-barrage-confirm blockquote{margin:4px 0;padding:18px;border:1px solid rgba(197,179,255,.18);border-radius:12px;background:rgba(8,17,38,.72);font-size:18px;line-height:1.5;text-align:center}.premium-barrage-confirm dl{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0}.premium-barrage-confirm dl div{padding:10px;border-radius:10px;background:rgba(126,151,204,.08)}.premium-barrage-confirm dt{color:#8fa4bf;font-size:10px}.premium-barrage-confirm dd{margin:4px 0 0;color:#eef5ff;font:650 14px var(--font-data)}
.v2-welcome {
  /* Cross-surface Orbital Signal tokens: primitive → semantic → component. */
  --primitive-midnight-950: var(--color-orbit-deep);
  --primitive-blue-500: var(--color-orbit-signal);
  --primitive-blue-300: var(--color-orbit-signal-soft);
  --primitive-cyan-400: var(--color-orbit-cyan);
  --primitive-slate-300: var(--color-orbit-text-secondary);
  --primitive-star-neutral: var(--color-orbit-star);
  --semantic-signal-primary: var(--primitive-blue-500);
  --semantic-signal-secondary: var(--primitive-cyan-400);
  --semantic-focus-neutral: var(--primitive-star-neutral);
  --semantic-status-muted: var(--primitive-slate-300);
  --component-corridor-far: color-mix(in srgb, var(--semantic-signal-primary) 38%, transparent);
  --component-corridor-near: color-mix(in srgb, var(--semantic-signal-secondary) 52%, transparent);
  --component-signal-axis: color-mix(in srgb, var(--semantic-signal-secondary) 76%, transparent);
  --component-target-lock: color-mix(in srgb, var(--semantic-signal-secondary) 72%, transparent);
  --component-focus-halo: color-mix(in srgb, var(--semantic-signal-primary) 20%, transparent);
  --dock-bg: rgba(4, 10, 24, 0.36);
  --dock-border: var(--color-orbit-border-subtle);
  --ink: var(--color-orbit-text-primary);
  --muted: var(--color-orbit-text-secondary);
  --accent: var(--color-orbit-signal-soft);
  --font-ui: "Welcome Sans SC", var(--font-family-cjk);
  --font-display: var(--font-ui);
  --font-signal: var(--font-ui);
  --font-data: "Welcome Sans SC", var(--font-family-data);
  --mobile-title-size: clamp(1.8rem, 8.2vw, 2rem);
  position: relative;
  isolation: isolate;
  width: 100%;
  height: var(--visual-height, 100vh);
  height: var(--visual-height, 100dvh);
  min-height: min(420px, var(--visual-height, 100dvh));
  overflow: hidden;
  color: var(--ink);
  background: var(--color-orbit-midnight);
  font-family: var(--font-ui);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

.v2-welcome *,
.v2-welcome *::before,
.v2-welcome *::after {
  box-sizing: border-box;
}

.v2-welcome__galaxy,
.v2-welcome__nebula {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.v2-welcome__galaxy {
  z-index: 0;
  transform: scale(1);
  transform-origin: 50% 42%;
  opacity: 1;
}
.v2-welcome.is-onboarding:not(.is-orbit-handoff) .v2-welcome__galaxy {
  transform: scale(1.16);
  opacity: 0.34;
}
.v2-welcome.is-orbit-handoff .v2-welcome__galaxy {
  animation: orbit-galaxy-reveal var(--orbit-handoff-duration) cubic-bezier(0.22, 0.72, 0.2, 1) both;
}

.v2-welcome__nebula {
  z-index: 1;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 18% 25%, rgba(48, 111, 224, 0.14), transparent 34%),
    radial-gradient(ellipse at 82% 45%, rgba(54, 206, 224, 0.09), transparent 38%);
  mix-blend-mode: screen;
}

.v2-welcome__header {
  position: absolute;
  z-index: 5;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: max(20px, env(safe-area-inset-top)) 28px 12px;
  background: linear-gradient(180deg, rgba(2, 5, 12, 0.64), rgba(2, 5, 12, 0.12) 58%, transparent);
  pointer-events: none;
}

.v2-welcome.is-discovery-active .v2-welcome__header,
.v2-welcome.is-color-confirming .v2-welcome__header,
.v2-welcome.is-orbit-handoff .v2-welcome__header {
  transform: translate3d(0, -10px, 0);
  opacity: 0;
  pointer-events: none;
}

.v2-welcome__header > * { pointer-events: auto; }

.v2-welcome__college-link {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  border-radius: 10px;
  text-decoration: none;
}

.v2-welcome__college-link img {
  display: block;
  width: clamp(164px, 48vw, 196px);
  height: auto;
  object-fit: contain;
}

.v2-welcome__college-link:focus-visible {
  outline: 2px solid var(--color-orbit-focus);
  outline-offset: 4px;
}

.v2-welcome__logout {
  position: relative;
  min-width: 72px;
  min-height: 44px;
  padding: 0 10px 0 20px;
  border: 0;
  border-radius: 2px;
  color: rgba(220, 234, 255, 0.84);
  background: transparent;
  font: 500 var(--font-size-xs) var(--font-ui);
  letter-spacing: 0.08em;
  cursor: pointer;
}
.v2-welcome__logout::before,
.v2-welcome__logout::after {
  position: absolute;
  left: 7px;
  width: 8px;
  height: 8px;
  border-left: 1px solid rgba(126, 190, 255, 0.7);
  content: "";
}
.v2-welcome__logout::before { top: 10px; border-top: 1px solid rgba(126, 190, 255, 0.7); }
.v2-welcome__logout::after { bottom: 10px; border-bottom: 1px solid rgba(126, 190, 255, 0.7); }
.v2-welcome__logout:hover,
.v2-welcome__logout:focus-visible {
  color: #f3f8ff;
  background: linear-gradient(90deg, transparent, rgba(96, 160, 242, 0.16));
}
.v2-welcome__logout:focus-visible { outline: 2px solid var(--color-orbit-focus); outline-offset: 2px; }

.modal-sheet header button {
  min-width: 52px;
  min-height: 44px;
  border: 1px solid rgba(205, 219, 255, 0.2);
  border-radius: 999px;
  color: #dce6ff;
  background: rgba(5, 11, 25, 0.42);
  font: inherit;
  cursor: pointer;
}

.v2-welcome__main {
  position: absolute;
  z-index: 2;
  inset: 108px 28px 214px;
  display: grid;
  place-items: center;
  text-align: center;
  pointer-events: none;
}

.v2-welcome__main section { max-width: 340px; }
.v2-welcome__main h2 {
  margin: 8px 0 9px;
  font-family: var(--font-display);
  font-size: var(--mobile-title-size);
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: 0.045em;
  font-variant-ligatures: none;
  text-shadow: none;
}
.v2-welcome__main p:not(.kicker) {
  margin: 0;
  color: var(--color-orbit-text-secondary);
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.8;
}
.v2-welcome__main small {
  display: inline-block;
  margin-top: 12px;
  color: #7f91b5;
}

.v2-welcome:not(.is-onboarding):not(.is-orbit-handoff) .v2-welcome__main {
  inset: 108px 28px auto;
  display: block;
  height: auto;
  text-align: left;
}
.v2-welcome:not(.is-onboarding):not(.is-orbit-handoff) .scene-copy {
  width: 100%;
  max-width: none;
  text-align: left;
}
.v2-welcome:not(.is-onboarding):not(.is-orbit-handoff) .scene-copy h2 {
  margin: 12px 0 12px;
  font-size: var(--mobile-title-size);
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: 0.045em;
}
.v2-welcome:not(.is-onboarding):not(.is-orbit-handoff) .scene-copy p:not(.kicker) {
  max-width: 300px;
  color: var(--color-orbit-text-secondary);
  font-size: 0.875rem;
  line-height: 1.8;
}
.v2-welcome:not(.is-onboarding):not(.is-orbit-handoff) .scene-copy small {
  margin-top: 8px;
  color: rgba(159, 180, 214, 0.72);
  font-size: var(--font-size-xs);
}
.cinematic--color-confirm,
.cinematic--orbit-handoff {
  align-self: end;
  margin-bottom: 8vh;
  opacity: 0;
}
.kicker {
  margin: 0;
  color: var(--color-orbit-text-secondary);
  font-family: var(--font-ui);
  font-size: var(--font-size-xs);
  font-weight: 400;
  letter-spacing: 0.08em;
}

.color-onboarding {
  position: absolute;
  inset: 0;
  width: 100%;
  max-width: none !important;
  isolation: isolate;
}

.discovery-field {
  position: fixed;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.discovery-corridor {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  transform-origin: 50% 42%;
  opacity: 0;
  will-change: transform, opacity;
}

.discovery-corridor--far {
  color: var(--component-corridor-far);
  transform: scale(0.16);
}

.discovery-corridor--near {
  color: var(--component-corridor-near);
  transform: scale(0.08);
}

.discovery-corridor path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1px;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
.discovery-corridor--near path { stroke-width: 1.35px; }

.discovery-signal-axis {
  position: fixed;
  z-index: 1;
  top: 42vh;
  left: 50%;
  width: min(84vw, 328px);
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--component-signal-axis) 18%, var(--primitive-blue-300) 50%, var(--component-signal-axis) 82%, transparent);
  transform: translate3d(-50%, -50%, 0) scaleX(0.2);
  opacity: 0;
  will-change: transform, opacity;
}

.discovery-signal-axis::before,
.discovery-signal-axis::after {
  position: absolute;
  top: -4px;
  width: 1px;
  height: 9px;
  background: var(--semantic-signal-secondary);
  content: "";
}
.discovery-signal-axis::before { left: 18%; }
.discovery-signal-axis::after { right: 18%; }

.discovery-lock {
  position: fixed;
  z-index: 1;
  top: 42vh;
  left: 50%;
  width: 118px;
  height: 76px;
  border: 1px solid var(--component-target-lock);
  border-inline-color: color-mix(in srgb, var(--semantic-signal-primary) 24%, transparent);
  border-radius: 50%;
  transform: translate3d(-50%, -50%, 0) scale(1);
  opacity: 0.14;
  will-change: transform, opacity;
}

.discovery-motes {
  position: fixed;
  z-index: 1;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  color: rgba(172, 220, 255, 0.72);
  transform-origin: 50% 42%;
  transform: scale(0.4);
  opacity: 0;
  will-change: transform, opacity;
}
.discovery-motes circle { fill: currentColor; }
.discovery-motes path {
  fill: none;
  stroke: currentColor;
  stroke-width: 0.18px;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
.color-onboarding--discovering .discovery-motes {
  animation: discovery-motes var(--discovery-duration) linear both;
}

.focus-star {
  position: fixed;
  z-index: 4;
  top: 42vh;
  left: 50%;
  width: 70px;
  aspect-ratio: 1;
  transform: translate3d(-50%, -50%, 0);
  opacity: 1;
  will-change: transform, opacity;
}

.focus-star > span {
  position: absolute;
  inset: -30%;
  border-radius: 50%;
  mix-blend-mode: screen;
}

.focus-star__neutral {
  background: radial-gradient(
    circle at 50% 50%,
    #fff 0 4%,
    var(--semantic-focus-neutral) 7%,
    color-mix(in srgb, var(--semantic-focus-neutral) 68%, transparent) 14%,
    var(--component-focus-halo) 30%,
    transparent 60%
  );
  opacity: 1;
}

.focus-star__temperature {
  background: radial-gradient(
    circle at 50% 50%,
    transparent 0 8%,
    color-mix(in srgb, var(--selected-color) 82%, transparent) 12%,
    color-mix(in srgb, var(--selected-color) 44%, transparent) 24%,
    color-mix(in srgb, var(--selected-color) 14%, transparent) 42%,
    transparent 62%
  );
  opacity: 1;
}

.selection-copy {
  position: absolute;
  z-index: 3;
  top: 0;
  right: auto;
  left: 0;
  width: 100%;
  margin: 0;
  text-align: left;
  transform: translate3d(0, 0, 0);
  opacity: 1;
  will-change: transform, opacity;
}
.selection-copy h2 {
  margin: 12px 0 16px;
  font-size: var(--mobile-title-size);
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: 0.045em;
}
.selection-copy p:not(.kicker) {
  max-width: 300px;
  color: var(--color-orbit-text-secondary);
  font-size: 0.875rem;
  line-height: 1.8;
}

.discovery-copy {
  position: fixed;
  z-index: 3;
  top: 62%;
  right: 28px;
  left: 28px;
  text-align: center;
  text-shadow: 0 2px 28px rgba(0, 0, 0, 0.8);
  transform: translate3d(0, 12px, 0);
  opacity: 0;
  will-change: transform, opacity;
}
.discovery-copy h2 {
  font-size: 1.62rem;
  font-weight: 500;
  letter-spacing: 0.05em;
}
.discovery-copy .signal-type-title { margin: 8px auto 10px; }
.discovery-person {
  margin: 8px 0 0 !important;
  color: rgba(205, 224, 250, 0.8) !important;
  font-family: var(--font-data);
  font-size: var(--font-size-xs) !important;
  letter-spacing: 0.12em;
}
.discovery-welcome {
  display: grid;
  gap: 4px;
  justify-items: center;
}
.discovery-welcome strong {
  color: #d9ebff;
  font: 600 var(--font-size-xs) var(--font-data);
  letter-spacing: 0.06em;
}
.discovery-welcome span { color: rgba(195, 210, 235, 0.76); font-size: var(--font-size-xs); }
.discovery-copy p:not(.kicker),
.selection-copy p:not(.kicker) { margin: 0; }

.focus-star--pending {
  transform: translate3d(-50%, -50%, 0) scale(0.12);
  opacity: 0.12;
}
.focus-star--pending .focus-star__neutral { opacity: 1; }
.focus-star--pending .focus-star__temperature { opacity: 0; }
.color-onboarding--pending .discovery-lock {
  transform: translate3d(-50%, -50%, 0) scale(0.55);
  opacity: 0;
}
.color-onboarding--pending .discovery-copy { opacity: 0; }
.color-onboarding--pending .selection-copy {
  transform: translate3d(0, 10px, 0);
  opacity: 0;
}

.color-onboarding--discovering .discovery-corridor--far {
  animation: discovery-corridor-far var(--discovery-duration) linear both;
}
.color-onboarding--discovering .discovery-corridor--near {
  animation: discovery-corridor-near var(--discovery-duration) linear both;
}
.color-onboarding--discovering .discovery-signal-axis {
  animation: discovery-signal-axis var(--discovery-duration) linear both;
}
.color-onboarding--discovering .discovery-lock {
  animation: discovery-target-lock var(--discovery-duration) linear both;
}
.focus-star--discovering {
  animation: discovery-focus-star var(--discovery-duration) linear both;
}
.focus-star--discovering .focus-star__neutral {
  animation: discovery-neutral-star var(--discovery-duration) linear both;
}
.focus-star--discovering .focus-star__temperature {
  animation: discovery-temperature-star var(--discovery-duration) linear both;
}
.color-onboarding--discovering .discovery-copy {
  animation: discovery-heading-exit var(--discovery-duration) linear both;
}
.color-onboarding--discovering .selection-copy {
  animation: discovery-selection-enter var(--discovery-duration) linear both;
}

.v2-welcome.is-discovery-active .operation-dock { opacity: 0.9; }
.v2-welcome.is-discovering .operation-dock {
  animation: discovery-dock-presence var(--discovery-duration) linear both;
  will-change: opacity;
}

.focus-star--confirming {
  animation: color-confirm-star var(--color-confirm-duration) cubic-bezier(0.2, 0.76, 0.2, 1) both;
}
.focus-star--confirming .focus-star__temperature {
  animation: color-confirm-glow var(--color-confirm-duration) ease-out both;
}
.focus-star--handoff {
  animation: orbit-handoff-star var(--orbit-handoff-duration) cubic-bezier(0.2, 0.72, 0.18, 1) both;
}
.focus-star--hidden {
  transform: translate3d(-50%, -50%, 0) scale(0.12);
  opacity: 0;
  visibility: hidden;
}

.operation-dock {
  position: absolute;
  z-index: 6;
  display: flex;
  flex-direction: column;
  left: 16px;
  right: 16px;
  bottom: max(16px, env(safe-area-inset-bottom));
  max-height: min(52%, 430px);
  overflow: hidden;
  border: 1px solid transparent;
  border-top-color: var(--dock-border);
  border-radius: var(--shape-panel);
  background: var(--color-orbit-surface-1);
  box-shadow: none;
}

@supports ((-webkit-backdrop-filter: blur(18px)) or (backdrop-filter: blur(18px))) {
  .operation-dock {
    background: linear-gradient(180deg, rgba(7, 16, 31, 0.16), rgba(2, 8, 21, 0.54));
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
  }
}

.operation-dock::before {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 12px;
  left: 12px;
  height: 1px;
  background: linear-gradient(90deg, var(--selected-color, #d7eeff), transparent 36%);
  pointer-events: none;
  content: "";
}
.operation-dock::after {
  position: absolute;
  z-index: 2;
  right: 9px;
  bottom: 9px;
  width: 12px;
  height: 9px;
  border-right: 1px solid rgba(116, 197, 255, 0.32);
  border-bottom: 1px solid rgba(116, 197, 255, 0.24);
  pointer-events: none;
  content: "";
}
.v2-welcome.is-discovery-active .operation-dock,
.v2-welcome.is-color-confirming .operation-dock,
.v2-welcome.is-orbit-handoff .operation-dock {
  animation: none;
  transform: translate3d(0, 28px, 0);
  opacity: 0;
  pointer-events: none;
}

.operation-dock--expanded { max-height: min(61%, 520px); }
.operation-dock.operation-dock--chat { max-height: min(72%, 620px); }
.operation-dock--chat .dock-body { max-height: none; }
.dock-body,
.program-list,
.archive {
  min-height: 0;
  max-height: calc(min(61vh, 520px) - 58px);
  padding: 20px 12px 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.operation-dock:not(.operation-dock--expanded) .dock-body { padding-block: 20px 16px; }
.admitted-panel > .program-list,
.admitted-panel > .archive { padding: 0; max-height: none; overflow: visible; }

.dock-message,
.dock-toast {
  flex: 0 0 auto;
  margin: 0;
  padding: 11px 17px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: #dbe6ff;
  background: rgba(74, 116, 197, 0.12);
  font-size: 0.78rem;
  line-height: 1.45;
}
.dock-message--warning { color: #ffe4aa; background: rgba(152, 104, 23, 0.14); }
.dock-message--error { color: #ffd2d2; background: rgba(173, 51, 69, 0.18); }
.dock-toast {
  color: #dcecff;
  background: linear-gradient(90deg, rgba(65, 117, 190, 0.14), rgba(46, 170, 190, 0.07));
  letter-spacing: 0.015em;
}

.entry-form,
.program-composer { display: grid; gap: 16px; }
.entry-form label {
  display: grid;
  gap: 6px;
  color: #dce5f9;
  font-size: 0.78rem;
  font-weight: 500;
}
.entry-form input,
.program-composer input {
  width: 100%;
  min-height: 46px;
  border: 1px solid rgba(183, 205, 255, 0.2);
  border-radius: var(--shape-control);
  outline: none;
  color: #fff;
  background: rgba(2, 7, 18, 0.18);
  font: inherit;
}
.entry-form input,
.program-composer input { padding: 0 13px; font: 400 1rem var(--font-ui); }
.entry-form input:focus,
.program-composer input:focus {
  border-color: var(--color-orbit-focus);
  box-shadow: 0 0 0 3px rgba(87, 145, 255, 0.2);
}
.dock-disclosure,
.counter { margin: 0; color: #8999b5; font-size: var(--font-size-xs); line-height: 1.45; }
.counter { justify-self: end; }
.counter.invalid { color: #ff9caa; }
.check-row {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  padding-block: 5px;
  color: #aab6ce;
  font-size: var(--font-size-xs);
  line-height: 1.45;
  cursor: pointer;
}
.check-row input { width: 22px; height: 22px; flex: 0 0 auto; margin: 0; accent-color: #76a9ff; }
.program-composer .check-row input { min-height: 22px; padding: 0; }
.check-row span > small { display: block; margin-top: 3px; color: var(--color-orbit-text-secondary); font: 400 var(--font-size-xs) var(--font-data); }

.dock-primary,
.dock-secondary,
.dock-danger,
.gift-trigger,
.text-action,
.dock-tabs button,
.gift-grid button {
  min-height: 44px;
  border: 0;
  border-radius: var(--shape-control);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.dock-primary {
  min-height: 48px;
  padding: 0 18px;
  border: 1px solid var(--color-orbit-text-primary);
  color: var(--color-orbit-midnight);
  background: var(--color-orbit-text-primary);
  box-shadow: none;
}
.dock-primary:hover:not(:disabled) { background: #fff; }
.dock-secondary,
.gift-trigger,
.text-action {
  padding: 0 15px;
  color: #d9e5ff;
  background: rgba(130, 165, 228, 0.075);
  border: 1px solid rgba(182, 205, 255, 0.13);
}
.dock-danger { padding: 0 18px; color: #fff; background: #a9364a; }
button:disabled { opacity: 1; cursor: not-allowed; }
button:active:not(:disabled) { opacity: 0.82; }
.dock-actions { display: grid; grid-template-columns: 1fr 1.2fr; gap: 10px; }
.dock-primary--compact { min-width: 70px; padding-inline: 12px; }

.dock-waiting {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #c7d3eb;
  font-size: 0.82rem;
}
.dock-waiting p { margin: 0; }
.dock-waiting span {
  width: 10px;
  aspect-ratio: 1;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #9ac5ff;
  box-shadow: 0 0 18px #73a9ff;
  animation: signal-pulse 1.2s ease-in-out infinite alternate;
}
.dock-handoff-status {
  display: grid;
  gap: 5px;
  min-height: 112px;
  align-content: center;
  text-align: left;
}
.dock-handoff-status small { color: #82aef5; font-size: var(--font-size-xs); letter-spacing: 0.16em; }
.dock-handoff-status strong { color: #eef5ff; font-size: 1rem; }
.dock-handoff-status p { margin: 0; color: #9aa9c5; font-size: 0.75rem; line-height: 1.5; }

.color-stage {
  display: grid;
  flex: 0 1 auto;
  min-height: 0;
}
.color-stage > * { grid-area: 1 / 1; }
.dock-discovery-status {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  min-height: 0;
  color: #aebfdd;
  text-align: center;
  opacity: 0;
  will-change: transform, opacity;
}
.dock-discovery-status span {
  width: 54px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--semantic-signal-secondary), transparent);
}
.dock-discovery-status p { margin: 0; font-size: 0.78rem; line-height: 1.5; }
.color-control {
  display: grid;
  gap: 8px;
  transform: translate3d(0, 0, 0);
  opacity: 1;
  will-change: transform, opacity;
}
.color-stage--pending .dock-discovery-status { opacity: 1; }
.color-stage--pending .color-control {
  transform: translate3d(0, 10px, 0);
  opacity: 0;
}
.color-stage--discovering .dock-discovery-status {
  animation: discovery-status-exit var(--discovery-duration) linear both;
}
.color-stage--discovering .color-control {
  animation: discovery-selection-enter var(--discovery-duration) linear both;
}
.color-control__summary { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.color-control__connection {
  display: grid;
  align-items: center;
  min-height: 36px;
  margin: 0;
  color: var(--semantic-status-muted);
  font-size: var(--font-size-xs);
  line-height: 1.35;
}
.color-control__summary label { color: var(--color-orbit-text-secondary); font-size: 0.8rem; font-weight: 400; }
.color-control__summary output {
  color: var(--selected-color, #eef4ff);
  font-family: var(--font-data);
  font-size: 1.12rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.color-control input[type="range"] {
  width: 100%;
  height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
}
.color-control input[type="range"]::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: var(--temperature-spectrum);
}
.color-control input[type="range"]::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: var(--temperature-spectrum);
}
.color-control input[type="range"]::-webkit-slider-thumb {
  width: 22px;
  height: 22px;
  margin-top: -9px;
  border: 6px solid var(--color-orbit-midnight);
  border-radius: 50%;
  background: var(--selected-color);
  box-shadow: 0 0 0 1px var(--selected-color), 0 0 18px color-mix(in srgb, var(--selected-color) 25%, transparent);
  appearance: none;
  -webkit-appearance: none;
}
.color-control input[type="range"]::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: 6px solid var(--color-orbit-midnight);
  border-radius: 50%;
  background: var(--selected-color);
  box-shadow: 0 0 0 1px var(--selected-color);
}
.temperature-scale { display: flex; justify-content: space-between; margin-top: -10px; color: var(--color-orbit-text-secondary); font-size: var(--font-size-xs); }
.color-control__commitment { margin: 12px 0 4px; color: var(--color-orbit-text-secondary); font-size: var(--font-size-xs); text-align: center; }

.terminal-copy { text-align: left; }
.terminal-copy strong { display: block; font-size: 0.9rem; font-weight: 600; }
.terminal-copy p { margin: 4px 0 0; color: #9aa9c5; font-size: var(--font-size-xs); }

.now-playing,
.composer-row,
.composer-tools,
.program-list header,
.archive header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.now-playing small,
.program-list small,
.archive small,
.modal-sheet small { display: block; color: #82aef5; font-size: var(--font-size-xs); letter-spacing: 0.13em; }
.now-playing > div { min-width: 0; }
.now-playing strong { display: block; margin-top: 8px; font-size: 1rem; font-weight: 500; line-height: 1.5; overflow-wrap: anywhere; }
.now-playing > span {
  flex: 0 0 auto;
  color: var(--color-orbit-text-primary);
  font-family: var(--font-data);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.composer-row input { flex: 1; min-width: 0; }
.composer-tools .check-row { flex: 1; }
.gift-trigger {
  flex: 0 0 auto;
  display: grid;
  align-content: center;
  justify-items: start;
  min-width: 84px;
  padding-block: 6px;
  line-height: 1.05;
}
.gift-trigger > span { font-size: 0.78rem; }
.gift-trigger > small {
  margin-top: 4px;
  color: rgba(166, 193, 231, 0.74);
  font-family: var(--font-data);
  font-size: var(--font-size-xs);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.035em;
}

.dock-tabs {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(3, 1fr);
  padding: 6px 0 2px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
.dock-tabs button {
  position: relative;
  color: #8795b1;
  background: transparent;
  font-size: 0.8rem;
  font-weight: 500;
}
.dock-tabs button[aria-current="page"] { color: #fff; background: transparent; }
.dock-tabs button[aria-current="page"]::after {
  position: absolute;
  right: 32%;
  bottom: 3px;
  left: 32%;
  height: 1px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgba(128, 201, 255, 0.92), transparent);
  box-shadow: 0 0 8px rgba(94, 178, 255, 0.48);
  content: "";
}
.dock-tabs i {
  position: absolute;
  top: 8px;
  right: calc(50% - 29px);
  width: 6px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: #ffbd72;
}

.modal-sheet h2,
.confirm-dialog h2 { margin: 2px 0 0; font-size: 1.08rem; }
.panel-context,
.archive-owner {
  display: block;
  margin-top: 4px;
  color: #e7efff;
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 1.3;
}
.archive-owner {
  max-width: 190px;
  overflow-wrap: anywhere;
}
.program-list header > span { color: #9aa8c2; font-size: var(--font-size-xs); }
.program-list ol { display: grid; gap: 8px; margin: 14px 0 0; padding: 0; list-style: none; }
.program-list li {
  display: grid;
  grid-template-columns: 30px 1fr auto;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-radius: var(--shape-item);
  color: #8793aa;
  background: rgba(255, 255, 255, 0.035);
}
.program-list li > span {
  color: #65728e;
  font: 700 var(--font-size-xs) var(--font-data);
  font-variant-numeric: tabular-nums;
}
.program-list li strong { display: block; margin-top: 2px; color: #b8c2d5; font-size: 0.8rem; }
.program-list li em { color: #8dbaff; font-size: var(--font-size-xs); font-style: normal; }
.program-list li.is-current { color: #fff; background: rgba(107, 157, 255, 0.13); }
.program-list li.is-current strong { color: #8dbaff; }
.program-list li .program-performers { display:block; margin-top:6px; color:#91a0b7; font-size:12px; line-height:1.6 }

.archive header > strong {
  color: #a9c8ff;
  font-family: var(--font-data);
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
}
.archive dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  margin: 14px 0 8px;
  border-top: 1px solid rgba(157, 201, 255, 0.1);
  border-bottom: 1px solid rgba(157, 201, 255, 0.08);
}
.archive dl > div {
  position: relative;
  min-width: 0;
  padding: 12px 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.archive dl > div:nth-child(odd) { border-right: 1px solid rgba(157, 201, 255, 0.08); }
.archive dl > div:nth-child(n + 3) { border-top: 1px solid rgba(157, 201, 255, 0.08); }
.archive dt { color: #7f8ca6; font-size: var(--font-size-xs); }
.archive dd {
  margin: 3px 0 0;
  font-family: var(--font-data);
  font-size: 0.98rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.archive-metric--interactive {
  transition: background-color 180ms ease;
}
.archive-metric--interactive.is-open {
  background: linear-gradient(90deg, rgba(73, 130, 202, 0.11), rgba(73, 130, 202, 0.025));
}
.archive-metric dt button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 44px;
  min-height: 44px;
  margin: -10px -4px -5px;
  padding: 10px 4px 5px;
  border: 0;
  color: #91a1bd;
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.archive-metric dt button i {
  display: grid;
  width: 15px;
  height: 15px;
  place-items: center;
  border: 1px solid rgba(139, 190, 255, 0.38);
  border-radius: 2px;
  color: #a8cdff;
  font: 600 0.58rem var(--font-data);
  font-style: normal;
}
.archive-metric dt button:focus-visible {
  outline: 2px solid var(--color-orbit-focus);
  outline-offset: 2px;
}
.archive-metric-help {
  display: grid;
  min-height: 62px;
  align-items: center;
  margin: 0 0 10px;
  padding: 10px 12px;
  border-left: 1px solid transparent;
  border-radius: 2px 7px 2px 7px;
  color: rgba(161, 178, 207, 0);
  background: transparent;
  opacity: 0;
  transform: translate3d(0, 6px, 0);
  visibility: hidden;
  transition: opacity 180ms ease, transform 180ms ease, visibility 0s linear 180ms;
}
.archive-metric-help.is-visible {
  border-left-color: rgba(117, 196, 255, 0.7);
  color: #c9d9f1;
  background: linear-gradient(90deg, rgba(65, 131, 207, 0.13), rgba(2, 8, 20, 0.08));
  opacity: 1;
  transform: translate3d(0, 0, 0);
  visibility: visible;
  transition-delay: 0s;
}
.archive-metric-help p { margin: 0; font-size: var(--font-size-xs); line-height: 1.5; }
.text-action { min-height: 38px; }

.modal-backdrop {
  position: absolute;
  z-index: 20;
  inset: 0;
  display: grid;
  align-items: end;
  padding: 14px 12px max(14px, env(safe-area-inset-bottom));
  background: rgba(0, 3, 10, 0.68);
}
.modal-backdrop--dialog { place-items: center; padding: 20px; }
.modal-sheet,
.confirm-dialog {
  width: 100%;
  max-height: min(68vh, 520px);
  overflow-y: auto;
  padding: 18px;
  border: 1px solid rgba(183, 205, 255, 0.18);
  border-radius: var(--shape-sheet);
  color: #f7f9ff;
  background: rgba(5, 13, 29, 0.78);
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.58);
}
@supports ((-webkit-backdrop-filter: blur(18px)) or (backdrop-filter: blur(18px))) {
  .modal-sheet,
  .confirm-dialog {
    background: linear-gradient(145deg, rgba(30, 58, 94, 0.34), rgba(3, 9, 22, 0.58));
    -webkit-backdrop-filter: blur(18px) saturate(122%);
    backdrop-filter: blur(18px) saturate(122%);
  }
}
.modal-sheet header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.modal-sheet > p,
.confirm-dialog > p:not(.kicker) { color: #9eabc3; font-size: 0.78rem; line-height: 1.55; }
.modal-sheet > .modal-status { color: #ffe4aa; }
.gift-balance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 14px;
  padding: 12px 2px;
  border-top: 1px solid rgba(173, 211, 255, 0.13);
  border-bottom: 1px solid rgba(173, 211, 255, 0.09);
}
.gift-balance b { display: block; margin-top: 4px; font-size: 0.82rem; font-weight: 600; }
.gift-balance output {
  display: flex;
  align-items: baseline;
  gap: 5px;
  color: #f7fbff;
  font-family: var(--font-data);
  font-size: 1.45rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.gift-balance output small { color: #8da4c4; font-family: var(--font-ui); font-size: var(--font-size-xs); letter-spacing: 0; }
.gift-grid { display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 15px; }
.gift-grid button {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  justify-items: stretch;
  gap: 11px;
  min-height: 72px;
  padding: 10px 12px;
  color: #edf3ff;
  text-align: left;
  background: linear-gradient(105deg, rgba(116, 157, 235, 0.105), rgba(48, 89, 144, 0.025));
  border: 1px solid rgba(183, 205, 255, 0.13);
}
.gift-grid button:not(:disabled):hover { border-color: rgba(151, 210, 255, 0.34); background-color: rgba(110, 166, 235, 0.14); }
.gift-grid button:disabled { background: var(--color-orbit-disabled-surface); }
.gift-icon-shell {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: var(--shape-control);
  background: color-mix(in srgb, currentColor 8%, transparent);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.09), 0 0 24px color-mix(in srgb, currentColor 9%, transparent);
}
.gift-copy { min-width: 0; }
.gift-copy strong { display: block; overflow: hidden; font-size: 0.84rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.gift-grid .gift-copy small { margin-top: 5px; color: #8594b0; font-size: var(--font-size-xs); letter-spacing: 0.025em; }
.gift-grid output {
  display: grid;
  justify-items: end;
  color: #f0f5ff;
  font-family: var(--font-data);
  font-size: 1.02rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.gift-grid output small { margin-top: 3px; color: #71819e; font-family: var(--font-ui); font-size: var(--font-size-xs); letter-spacing: 0; }
.gift-glimmer .gift-icon-shell { color: #ffe1a1; }
.gift-beacon .gift-icon-shell { color: #76d8ff; }
.gift-orbit .gift-icon-shell { color: #9db6ff; }
.gift-starship .gift-icon-shell { color: #ddc5ff; }
.gift-empty {
  margin: 15px 0 0;
  padding: 13px 0;
  border-top: 1px solid rgba(183, 205, 255, 0.1);
  color: #8e9db7;
  font-size: var(--font-size-xs);
  line-height: 1.55;
}
.confirm-dialog { max-width: 340px; }
.confirm-dialog .dock-actions { margin-top: 17px; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible {
  outline: 3px solid var(--color-orbit-focus);
  outline-offset: 3px;
}

.v2-welcome button:disabled {
  color: var(--color-orbit-disabled-text);
  border-color: var(--color-orbit-border-subtle);
  background: var(--color-orbit-disabled-surface);
  box-shadow: none;
}

@keyframes signal-pulse {
  from { opacity: 0.45; transform: scale(0.78); }
  to { opacity: 1; transform: scale(1.1); }
}
@keyframes discovery-motes {
  0% { opacity: 0; transform: scale(0.4); }
  18% { opacity: 0.18; transform: scale(0.62); }
  50% { opacity: 0.58; transform: scale(1.08); }
  76% { opacity: 0.36; transform: scale(1.72); }
  88% { opacity: 0; transform: scale(2.16); }
  100% { opacity: 0; transform: scale(2.28); }
}
@keyframes discovery-corridor-far {
  0% { opacity: 0; transform: scale(0.16); }
  18% { opacity: 0.24; transform: scale(0.45); }
  35% { opacity: 0.5; transform: scale(0.82); }
  62% { opacity: 0.54; transform: scale(1.55); }
  74% { opacity: 0.3; transform: scale(2.4); }
  82% { opacity: 0; transform: scale(3.4); }
  100% { opacity: 0; transform: scale(3.8); }
}
@keyframes discovery-corridor-near {
  0% { opacity: 0; transform: scale(0.08); }
  18% { opacity: 0.08; transform: scale(0.18); }
  35% { opacity: 0.42; transform: scale(0.52); }
  62% { opacity: 0.56; transform: scale(1.35); }
  76% { opacity: 0.24; transform: scale(2.5); }
  82% { opacity: 0; transform: scale(3.2); }
  100% { opacity: 0; transform: scale(3.6); }
}
@keyframes discovery-signal-axis {
  0% { opacity: 0; transform: translate3d(-50%, -50%, 0) scaleX(0.2); }
  18% { opacity: 0; transform: translate3d(-50%, -50%, 0) scaleX(0.2); }
  60% { opacity: 0; transform: translate3d(-50%, -50%, 0) scaleX(0.34); }
  62% { opacity: 0; transform: translate3d(-50%, -50%, 0) scaleX(0.4); }
  70% { opacity: 0.16; transform: translate3d(-50%, -50%, 0) scaleX(0.72); }
  78% { opacity: 0.28; transform: translate3d(-50%, -50%, 0) scaleX(1); }
  82% { opacity: 0.16; transform: translate3d(-50%, -50%, 0) scaleX(0.9); }
  88% { opacity: 0; transform: translate3d(-50%, -50%, 0) scaleX(0.78); }
  100% { opacity: 0; transform: translate3d(-50%, -50%, 0) scaleX(0.72); }
}
@keyframes discovery-target-lock {
  0% { opacity: 0; transform: translate3d(-50%, -50%, 0) scale(0.55); }
  18% { opacity: 0; transform: translate3d(-50%, -50%, 0) scale(0.58); }
  62% { opacity: 0.08; transform: translate3d(-50%, -50%, 0) scale(0.72); }
  78% { opacity: 0.38; transform: translate3d(-50%, -50%, 0) scale(1); }
  82% { opacity: 0.28; transform: translate3d(-50%, -50%, 0) scale(1); }
  90% { opacity: 0.14; transform: translate3d(-50%, -50%, 0) scale(1); }
  100% { opacity: 0.14; transform: translate3d(-50%, -50%, 0) scale(1); }
}
@keyframes discovery-focus-star {
  0% { opacity: 0.12; transform: translate3d(-50%, -50%, 0) scale(0.12); }
  18% { opacity: 0.24; transform: translate3d(-50%, -50%, 0) scale(0.16); }
  62% { opacity: 0.58; transform: translate3d(-50%, -50%, 0) scale(0.32); }
  82% { opacity: 1; transform: translate3d(-50%, -50%, 0) scale(1); }
  100% { opacity: 1; transform: translate3d(-50%, -50%, 0) scale(1); }
}
@keyframes discovery-neutral-star {
  0% { opacity: 1; transform: scale(1); }
  18% { opacity: 1; transform: scale(1); }
  62% { opacity: 1; transform: scale(1); }
  82% { opacity: 1; transform: scale(1); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes discovery-temperature-star {
  0% { opacity: 0; transform: scale(1); }
  18% { opacity: 0; transform: scale(1); }
  62% { opacity: 0; transform: scale(1); }
  82% { opacity: 0; transform: scale(1); }
  94% { opacity: 0.84; transform: scale(1); }
  96% { opacity: 1; transform: scale(1); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes discovery-heading-exit {
  0%, 68% { opacity: 0; transform: translate3d(0, 12px, 0); }
  76%, 92% { opacity: 1; transform: translate3d(0, 0, 0); }
  100% { opacity: 0; transform: translate3d(0, -6px, 0); }
}
@keyframes discovery-status-exit {
  0% { opacity: 1; transform: translate3d(0, 0, 0); }
  18% { opacity: 1; transform: translate3d(0, 0, 0); }
  62% { opacity: 1; transform: translate3d(0, 0, 0); }
  82% { opacity: 0; transform: translate3d(0, -4px, 0); }
  100% { opacity: 0; transform: translate3d(0, -4px, 0); }
}
@keyframes discovery-selection-enter {
  0% { opacity: 0; transform: translate3d(0, 10px, 0); }
  98% { opacity: 0; transform: translate3d(0, 10px, 0); }
  100% { opacity: 0; transform: translate3d(0, 10px, 0); }
}
@keyframes discovery-dock-presence {
  0% { opacity: 0.9; }
  18% { opacity: 0.78; }
  62% { opacity: 0.72; }
  82% { opacity: 0.8; }
  94% { opacity: 0.96; }
  96% { opacity: 1; }
  100% { opacity: 1; }
}
@keyframes color-confirm-star {
  0% { opacity: 1; transform: translate3d(-50%, -50%, 0) scale(1); }
  24% { opacity: 1; transform: translate3d(-50%, -50%, 0) scale(1.34); }
  48% { opacity: 1; transform: translate3d(-50%, -50%, 0) scale(0.94); }
  100% { opacity: 1; transform: translate3d(-50%, calc(-50% - 17vh), 0) scale(0.82); }
}
@keyframes color-confirm-glow {
  0% { opacity: 1; transform: scale(1); }
  30% { opacity: 1; transform: scale(1.72); }
  62% { opacity: 0.82; transform: scale(1.08); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes orbit-handoff-star {
  0% { opacity: 1; transform: translate3d(-50%, calc(-50% - 17vh), 0) scale(0.82); }
  18% { opacity: 1; transform: translate3d(-50%, calc(-50% - 17vh), 0) scale(0.94); }
  72% { opacity: 0.88; }
  100% {
    opacity: 0;
    transform: translate3d(
      calc(var(--orbit-target-x, 50vw) - 50vw - 50%),
      calc(var(--orbit-target-y, 42vh) - 42vh - 50%),
      0
    ) scale(0.12);
  }
}
@keyframes orbit-galaxy-reveal {
  0% { opacity: 0.34; transform: scale(1.28); }
  24% { opacity: 0.42; transform: scale(1.2); }
  72% { opacity: 0.9; transform: scale(1.04); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes orbit-dock-exit {
  0% { opacity: 1; transform: translate3d(0, 0, 0); }
  40% { opacity: 0.82; transform: translate3d(0, 5px, 0); }
  76% { opacity: 0.18; transform: translate3d(0, 18px, 0); }
  100% { opacity: 0; transform: translate3d(0, 24px, 0); }
}

@media (max-height: 620px) {
  .v2-welcome { --mobile-title-size: 1.5rem; }
  .v2-welcome__header { padding-top: max(8px, env(safe-area-inset-top)); }
  .v2-welcome__college-link img { width: clamp(148px, 46vw, 172px); }
  .v2-welcome__main { inset: 58px 18px 176px; }
  .v2-welcome:not(.is-onboarding):not(.is-orbit-handoff) .v2-welcome__main { inset: 68px 18px auto; }
  .v2-welcome__main p:not(.kicker),
  .scene-copy small { display: none; }
  .discovery-copy .discovery-person { display: block; }
  .discovery-copy .discovery-welcome { display: grid; }
  .v2-welcome__main h2 { font-size: var(--mobile-title-size); }
  .selection-copy h2 { font-size: var(--mobile-title-size); }
  .focus-star { width: 54px; }
  .operation-dock { max-height: min(64%, 390px); bottom: max(6px, env(safe-area-inset-bottom)); }
  .operation-dock--expanded { max-height: min(72%, 430px); }
}

.v2-welcome.is-keyboard .v2-welcome__main { opacity: 0; visibility: hidden; }
.v2-welcome.is-keyboard .operation-dock {
  max-height: calc(var(--visual-height, 100dvh) - 64px);
  background: #081126;
}
.v2-welcome.is-keyboard .program-composer { padding-block: 10px; }
.v2-welcome.is-keyboard .now-playing,
.v2-welcome.is-keyboard .gift-trigger { display: none; }

@media (prefers-reduced-motion: reduce) {
  .v2-welcome *,
  .v2-welcome *::before,
  .v2-welcome *::after {
    scroll-behavior: auto !important;
    animation: none !important;
    transition: none !important;
  }
}

.cooperative-count { display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:18px; }
.cooperative-count > span { font-size:13px;color:#a8b9d0; }
.cooperative-count strong { color:#e2efff;font-size:28px;font-weight:500; }
.cooperative-count small { color:#9eafc9;font-size:13px; }
.cooperative-card progress { display:block;width:100%;height:3px;margin-bottom:24px;border:0;accent-color:#b4d4fa;border-radius:3px; }
.cooperative-card .dock-primary { width:100%;border-radius:10px; }
/* D-070: content-first phone pages; input remains outside the chat scroller. */
.v2-welcome.is-content-page .v2-welcome__main { inset: 96px 28px auto; }
.scene-copy :deep(.signal-type-title__caret) { display: none; }
.v2-welcome.is-content-page .scene-copy h2 { font-size: 26px; line-height: 1.4; letter-spacing: .02em; }
.v2-welcome.is-content-page .scene-copy > p:last-child { font-size: 13px; line-height: 1.6; margin-top: 8px; }
.v2-welcome.is-content-page .operation-dock { top: 228px; max-height: none; background: linear-gradient(180deg,rgba(4,14,29,.38),rgba(2,9,21,.2)); border-color: rgba(170,211,255,.1); border-radius: 16px; box-shadow: inset 0 1px rgba(218,239,255,.035),0 16px 42px rgba(0,4,14,.14); -webkit-backdrop-filter: none; backdrop-filter: none; }
.v2-welcome.is-live-chat .operation-dock { border-color: transparent; border-radius: 0; background: linear-gradient(180deg,transparent 0%,rgba(2,9,21,.04) 58%,rgba(2,8,19,.34) 100%); box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
.v2-welcome.is-live-chat .operation-dock::before { opacity: .28; }
.v2-welcome.is-live-chat .operation-dock::after { opacity: 0; }
.v2-welcome.is-content-page .admitted-panel { flex: 1; min-height: 0; max-height: none; padding: 18px 16px; }
.v2-welcome.is-live-chat .admitted-panel { display: flex; overflow: hidden; padding: 14px 12px 8px; }
.v2-welcome.is-live-chat .program-composer { display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 8px; }
.v2-welcome.is-live-chat .now-playing { flex: 0 0 auto; color: #9eafc9; font-size: 12px; margin: 0; padding: 0 4px 8px; border-bottom: 1px solid #a3bdd51a; }
.current-program-gifts { flex: 0 0 auto; min-width: 0; padding: 1px 4px 3px; color: #8ea3bf; font-size: 10px; }
.current-program-gifts > span { display: block; margin-bottom: 5px; letter-spacing: .08em; }
.current-program-gifts ul { display: flex; gap: 6px; margin: 0; padding: 0 0 3px; overflow-x: auto; list-style: none; scrollbar-width: none; }
.current-program-gifts li { display: inline-grid; flex: 0 0 auto; grid-template-columns: 18px auto auto; align-items: center; gap: 4px; min-height: 30px; padding: 4px 8px; border: 1px solid rgba(164,207,255,.1); border-radius: 999px; color: #c8d7eb; background: rgba(8,25,45,.28); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
.current-program-gifts li :deep(svg) { width: 16px; height: 16px; }
.current-program-gifts li strong { color: #f0f7ff; font: 600 11px var(--font-data); }
.v2-welcome.is-live-chat :deep(.mobile-live-barrage) { flex: 1; min-height: 40px; margin: 0; padding: 0 4px; border: 0; background: transparent; display: flex; flex-direction: column; }
.v2-welcome.is-live-chat :deep(.mobile-live-barrage header) { display: none; }
.v2-welcome.is-live-chat :deep(.mobile-chat-scroll) { height: auto; flex: 1; min-height: 0; }
.v2-welcome.is-live-chat :deep(.mobile-chat-message) { padding-block: 8px; font-size: 14px; }
.v2-welcome.is-live-chat :deep(.mobile-chat-empty) { padding: 30px 8px; }
.composer-row,.composer-tools,.barrage-style-picker { flex: 0 0 auto; }
.composer-row input { min-width: 0; border-radius: 10px; font-size: 14px; }
.composer-row .dock-primary { border-radius: 10px; }
.composer-tools { gap: 8px; }
.composer-identity { display: flex; align-items: center; gap: 10px; min-width: 0; }
.composer-identity > small { color: #9eafc9; font-size: 11px; white-space: nowrap; }
.style-trigger { display: flex; gap: 7px; align-items: center; min-width: 60px; min-height: 44px; border: 0; background: transparent; color: #dae4f4; font: inherit; font-size: 12px; padding: 0 4px; }
.style-trigger span { width: 14px; height: 14px; border-radius: 50%; }
.barrage-style-picker { padding: 6px; border: 1px solid rgba(155,202,255,.1); border-radius: 12px; background: rgba(10,30,52,.42); -webkit-backdrop-filter: blur(7px); backdrop-filter: blur(7px); }
.barrage-colors { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 0; padding: 0; }
.barrage-colors button { width: 100%; min-width: 0; height: 44px; border: 0; border-radius: 8px; background: transparent; display: grid; place-items: center; outline: none; }
.barrage-colors button::after { content: ''; width: 22px; height: 22px; border-radius: 50%; background: var(--swatch); }
.barrage-colors button[aria-pressed="true"]::after { outline: 1px solid #edf4ff; outline-offset: 3px; }
.barrage-colors button:focus-visible { outline: 2px solid #8dbaff; }
.barrage-style-picker .barrage-color-help { margin: 6px 4px 2px; }
.composer-tools .gift-trigger { min-height: 44px; border-radius: 10px; padding: 6px 10px; }
.program-list header { color: #94a6c1; font-size: 12px; margin-bottom: 14px; }
.program-list li { padding: 15px 2px; background: transparent; border-bottom: 1px solid #a7c1de18; border-radius: 0; }
.program-list li strong { font-size: 16px; font-weight: 500; line-height: 1.5; color: #dae3f1; }
.program-list li .program-performers { color: #93a3bc; letter-spacing: 0; font-size: 12px; margin-top: 6px; }
.program-list li.is-current { background: #599eef10; border-radius: 10px; padding-inline: 10px; }
.program-list li.is-current strong,.program-list li.is-current .program-performers { color: #8dbaff; }
.program-list li.is-segment { grid-template-columns: minmax(0, 1fr); gap: 5px; margin: 1px 0; padding: 11px 2px; border: 0; border-radius: 0; background: transparent; text-align: center; }
.program-list li.is-segment > div { display: flex; align-items: center; gap: 10px; }
.program-list li.is-segment > div::before,.program-list li.is-segment > div::after { content: ''; flex: 1 0 20px; height: 1px; background: linear-gradient(90deg, transparent, #a8bedc45); }
.program-list li.is-segment > div::after { transform: rotate(180deg); }
.program-list li.is-segment strong { flex: 0 1 auto; color: #b9c9df; font-size: 13px; letter-spacing: .04em; line-height: 1.6; }
.program-list li.is-segment.is-current strong { color: #8dbaff; }
.program-list li.is-segment em { justify-self: center; }
.archive header { padding: 18px 14px; border: 1px solid #c6d7ef20; border-left: 2px solid var(--identity-color); border-radius: 12px; background: linear-gradient(120deg,#263d5844,transparent); }
.archive header > strong { color: var(--identity-color); font-size: 18px; }
.archive dl { grid-template-columns: repeat(3,minmax(0,1fr)); margin-top: 18px; }
.archive dl > div:first-child { grid-column: auto; }
.archive dl > div { border: 0!important; padding: 12px 6px; }
.archive dl > div + div { border-left: 1px solid rgba(157,201,255,.1)!important; }
.archive-metric-help:not(.is-visible) { display: none; }
.archive dl dt { min-height: 44px; display: flex; align-items: center; }
.archive dl dd { font-size: 20px; font-weight: 500; }
.archive header small { letter-spacing: 0; color: #9eafc9; }
.archive-activity { margin-top: 18px; padding-top: 16px; border-top: 1px solid rgba(174,211,255,.12); }
.archive-activity > header { padding: 0; border: 0; border-left: 0; border-radius: 0; background: transparent; }
.archive-activity-title { display: block; margin: 3px 0 0; color: #edf5ff; font-size: 15px; font-weight: 560; }
.archive-activity > header > strong { color: #a9c8ef; font-size: 12px; }
.archive-gift-list,.archive-barrage-list { display: grid; gap: 8px; margin: 12px 0 0; padding: 0; list-style: none; }
.archive-gift-list li { display: grid; grid-template-columns: 34px minmax(0,1fr) auto; align-items: center; gap: 9px; min-height: 54px; padding: 8px 10px; border: 1px solid rgba(164,207,255,.09); border-radius: 10px; background: rgba(8,25,45,.28); }
.archive-gift-icon { display: grid; width: 32px; height: 32px; place-items: center; color: #a7d9ff; }
.archive-gift-icon :deep(svg) { width: 28px; height: 28px; }
.archive-gift-list li div { min-width: 0; }
.archive-gift-list li div strong { display: block; overflow: hidden; color: #dbe9fa; font-size: 13px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.archive-gift-list li div small { margin-top: 3px; color: #92a7c2; font-size: 11px; letter-spacing: 0; }
.archive-gift-list li > span:last-child { color: #9eb5d0; font: 500 11px var(--font-data); white-space: nowrap; }
.archive-barrage-list li { padding: 9px 11px; border: 1px solid rgba(164,207,255,.09); border-radius: 5px 12px 12px 12px; background: rgba(8,25,45,.25); }
.archive-barrage-list p { margin: 0; color: #edf6ff; font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
.archive-barrage-list small { margin-top: 5px; color: #7f95b2; font: 10px var(--font-data); letter-spacing: .02em; }
.archive-barrage-list small span { color: #c8a6a6; }
.archive-empty { margin: 12px 0 0; padding: 14px 10px; color: #8298b4; background: rgba(8,25,45,.15); font-size: 12px; line-height: 1.6; }
.dock-toast { position: absolute; left: 24px; right: 24px; top: 64px; bottom: auto; z-index: 12; pointer-events: none; border-radius: 10px; border: 1px solid #bfd8ff2b; background: #10243bef; font-size: 12px; box-shadow: 0 8px 28px #0005; }
.phone-raffle { display: grid; justify-items: center; align-content: center; min-height: 280px; text-align: center; padding: 24px 8px; }
.phone-raffle__star { color: #c8ddfa; font-size: 68px; line-height: 1.4; }
.phone-raffle h3 { font-size: 22px; font-weight: 500; margin: 10px 0; }
.phone-raffle p,.phone-raffle small { color: #9eafc9; font-size: 13px; line-height: 1.8; }
.phone-raffle__code { margin-top: 22px; letter-spacing: .12em; color: #d6e6ff; }
.gift-balance { display: flex; flex-wrap: nowrap; justify-content: space-between; gap: 12px; }
.gift-balance > span { flex: 1; min-width: 100px; }
.gift-balance output { flex: 0 0 auto; white-space: nowrap; }
.modal-sheet .gift-allowance { margin: 12px 0 8px; color: #c0d7ed; font-size: 12px; }
.modal-backdrop { background: rgba(0,3,10,.46); }
.modal-sheet { border-radius: 18px; max-height: calc(100dvh - 96px); background: linear-gradient(145deg,rgba(17,39,65,.78),rgba(3,11,25,.72)); -webkit-backdrop-filter: blur(12px) saturate(116%); backdrop-filter: blur(12px) saturate(116%); }
.gift-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
.gift-grid button { grid-template-columns: 1fr auto; gap: 8px; min-height: 124px; border-radius: 12px; }
.gift-icon-shell { grid-column: 1 / -1; }
.gift-grid button small { font-size: 11px; letter-spacing: 0; }
.gift-copy .gift-quantity { display: block; margin-top: 6px; color: #aac2df; font-size: 10px; line-height: 1.3; white-space: nowrap; }
.page-reveal { animation: mobile-page-enter 200ms ease-out both; }
@keyframes mobile-page-enter { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
.mobile-sheet-enter-active,.mobile-sheet-leave-active { transition: opacity 220ms ease; }
.mobile-sheet-enter-active .modal-sheet,.mobile-sheet-leave-active .modal-sheet { transition: transform 240ms cubic-bezier(.2,.8,.2,1); }
.mobile-sheet-enter-from,.mobile-sheet-leave-to { opacity: 0; }
.mobile-sheet-enter-from .modal-sheet,.mobile-sheet-leave-to .modal-sheet { transform: translateY(22px); }
.v2-welcome.is-completed .personal-memento { padding: 8px 2px; }
.v2-welcome.is-completed .operation-dock { border-radius: 16px; background: #081425db; }
@media (max-width: 380px) { .barrage-colors { grid-template-columns: repeat(4,minmax(0,1fr)); } }
@media (max-height: 620px) {
 .v2-welcome.is-content-page .v2-welcome__main { inset: 68px 22px auto; }
 .v2-welcome.is-content-page .operation-dock { top: 140px; }
 .v2-welcome.is-content-page .scene-copy h2 { font-size: 22px; }
 .gift-grid button { min-height: 92px; }
 .gift-icon-shell { grid-column: auto; }
}
.v2-welcome.is-keyboard.is-content-page .operation-dock { top: 58px; bottom: max(6px,env(safe-area-inset-bottom)); max-height: none; }
.v2-welcome.is-keyboard .dock-tabs,.v2-welcome.is-keyboard .barrage-style-picker,.v2-welcome.is-keyboard .style-trigger { display: none; }
.v2-welcome.is-keyboard.is-live-chat .admitted-panel { padding: 8px 12px; }
.v2-welcome.is-keyboard .composer-tools { min-height: 20px; }
.v2-welcome.is-keyboard .dock-toast { top: 64px; bottom: auto; }
@media (prefers-reduced-motion: reduce) {
 .page-reveal { animation: none; }
 .mobile-sheet-enter-active,.mobile-sheet-leave-active,.mobile-sheet-enter-active .modal-sheet,.mobile-sheet-leave-active .modal-sheet { transition: none; }
 .mobile-sheet-enter-from .modal-sheet,.mobile-sheet-leave-to .modal-sheet { transform: none; }
}



/* D-092: one visual language, compact interactions above the composer. */
.v2-welcome.is-content-page .operation-dock{top:var(--content-top,228px)}
.v2-welcome.is-content-page .admitted-panel{overflow-y:auto;overscroll-behavior:contain}
.v2-welcome.is-live-chat .admitted-panel{overflow:hidden;padding-top:8px}
.v2-welcome.is-live-chat .program-composer{gap:6px}
.v2-welcome.is-live-chat .scene-copy h2{font-size:26px;line-height:1.3}
.v2-welcome.is-live-chat :deep(.mobile-chat-message){padding:4px 8px;font-size:13px;line-height:1.4}
.v2-welcome.is-live-chat :deep(.mobile-chat-stack){gap:4px;padding-block:6px}
.v2-welcome.is-live-chat :deep(.mobile-chat-sender){display:inline;margin-right:7px;font-size:10px}
.composer-row input,.composer-row .dock-primary{min-height:44px;border-radius:5px}
.live-interaction-card{flex:0 0 auto;display:grid;grid-template-columns:1fr auto;gap:6px 12px;margin:2px 0;padding:11px 12px;border:1px solid #a4bdd127;border-left:2px solid #a4c4d9;border-radius:4px;background:rgba(6,15,27,.88);box-shadow:none;max-height:210px;overflow:auto}
.live-interaction-card>small{grid-column:1/-1;color:#8b9eae;font-size:9px;letter-spacing:.08em;font-weight:400}
.live-interaction-card h3{font-size:13px;line-height:1.45;font-weight:500;max-width:230px}
.live-interaction-card>p{grid-column:1/-1;font-size:11px}
.live-interaction-card .buzzer-button{grid-column:1/-1;min-height:44px;border-radius:4px;border:1px solid #94afc049;background:#dae5ec;color:#0a1521;font:500 15px var(--font-ui);box-shadow:none;letter-spacing:.06em}
.buzzer-countdown{grid-column:2;grid-row:2;color:#dceaf3;font:500 28px/1 var(--font-data);align-self:center}
.live-interaction-card .buzzer-result{grid-column:1/-1;font:500 23px var(--font-data);text-shadow:none;text-align:left}
.live-interaction-card .vote-options,.live-interaction-card .vote-results,.live-interaction-card .dock-primary{grid-column:1/-1}
.vote-options span{border-radius:4px;background:#0e1b2a;font-weight:400}
.vote-options input:checked+span{background:#283b4b;border-color:#afc6d7;box-shadow:none}
.current-program-gifts>span{display:none}
.current-program-gifts li{border-radius:4px;min-height:25px;padding:3px 6px}
.gift-received{animation:gift-received-pop .72s cubic-bezier(.2,.7,.25,1) both;transform-origin:center}
@keyframes gift-received-pop{0%{transform:scale(.84)}24%{transform:scale(1.17)}44%{transform:scale(.94)}64%{transform:scale(1.07)}82%{transform:scale(.98)}100%{transform:scale(1)}}
.modal-sheet{border-radius:12px!important}
.modal-backdrop{background:rgba(0,3,10,.24)}
.modal-sheet,.confirm-dialog{background:linear-gradient(135deg,rgba(30,48,65,.55),rgba(6,16,28,.48));border:1px solid rgba(197,223,244,.32);-webkit-backdrop-filter:blur(22px) saturate(145%);backdrop-filter:blur(22px) saturate(145%);box-shadow:inset 0 1px rgba(255,255,255,.14),0 20px 60px rgba(0,0,0,.28)}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.modal-sheet,.confirm-dialog{background:rgba(8,19,32,.88)}}

.gift-grid{margin:10px 0 14px;gap:8px}
.gift-grid button{min-height:92px;border-radius:5px;box-shadow:none}
.gift-grid button[aria-pressed=true]{border-color:#bfd2df;background:#293c4f;box-shadow:inset 0 0 0 1px #bfd2df66}
.gift-grid .gift-icon-shell{width:27px;height:27px;border-radius:0;background:transparent;box-shadow:none}
.gift-amount{border-radius:5px;padding:6px 10px;background:#0b1928}
.gift-amount button{background:#132333}
.gift-send-row{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:14px}
.gift-send-row>span{font:500 18px var(--font-data)}
.gift-send-row small{font-size:11px;color:#d7a691;letter-spacing:0}
.gift-send-row .dock-primary{min-width:120px;min-height:44px;border-radius:5px}
.premium-barrage-confirm{gap:12px;border-radius:12px}
.premium-barrage-confirm h2{font-size:21px}
.premium-barrage-confirm blockquote{padding:12px;border-radius:4px;background:#101d2b;border-color:#8ba3b822;font-size:16px}
.premium-barrage-confirm .premium-balance{margin:0;color:#96a9ba;font-size:12px}
.premium-barrage-confirm .dock-actions button{border-radius:4px}
@media(max-height:680px){.v2-welcome.is-content-page .v2-welcome__main{top:83px}.v2-welcome.is-live-chat .scene-copy h2{font-size:22px}.live-interaction-card{max-height:155px;padding:8px 10px}.live-interaction-card h3{font-size:12px}.live-interaction-card>small{font-size:9px}.v2-welcome.is-content-page .admitted-panel{padding:10px 12px}.v2-welcome.is-live-chat .now-playing{padding-bottom:4px}.composer-tools .gift-trigger{padding-block:2px}}
@media(prefers-reduced-motion:reduce){.gift-received{animation:none}}


/* D-094: consistent rounded glass and one brief gift-color pulse. */
.current-program-gifts li{position:relative;isolation:isolate;border-radius:10px;--gift-tint:#ffe1a1}
.current-program-gifts li[data-gift-id="gift-beacon"]{--gift-tint:#76d8ff}
.current-program-gifts li[data-gift-id="gift-orbit"]{--gift-tint:#9db6ff}
.current-program-gifts li[data-gift-id="gift-starship"]{--gift-tint:#ddc5ff}
.current-program-gifts li::after{content:'';position:absolute;inset:-1px;z-index:-1;pointer-events:none;border-radius:inherit;border:1px solid var(--gift-tint);background:radial-gradient(ellipse at 50% 100%,var(--gift-tint),transparent 85%);box-shadow:0 0 20px color-mix(in srgb,var(--gift-tint) 35%,transparent);opacity:0}
.current-program-gifts li.gift-received::after{animation:gift-color-flash .72s ease-out both}
@keyframes gift-color-flash{0%{opacity:0}18%{opacity:.58}100%{opacity:0}}

.modal-sheet{border-radius:22px!important}
.modal-sheet,.confirm-dialog{border-radius:22px;background:linear-gradient(135deg,rgba(30,48,65,.36),rgba(6,16,28,.30));border-color:rgba(197,223,244,.24);-webkit-backdrop-filter:blur(18px) saturate(145%);backdrop-filter:blur(18px) saturate(145%)}
.modal-backdrop{background:rgba(0,3,10,.16)}
.gift-grid button,.gift-amount,.premium-barrage-confirm blockquote,.live-interaction-card{border-radius:14px}
.gift-grid button[aria-pressed=true]{background:rgba(54,80,102,.50)}
.gift-amount{background:rgba(11,25,40,.48)}
.gift-amount button,.gift-send-row .dock-primary,.confirm-dialog .dock-actions button,.modal-sheet header button,.composer-row input,.composer-row .dock-primary,.live-interaction-card .buzzer-button,.vote-options span{border-radius:10px}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.modal-sheet,.confirm-dialog{background:rgba(8,19,32,.88)}}
@media(prefers-reduced-motion:reduce){.current-program-gifts li::after{animation:none;opacity:0}}

/* D-099: local glass controls share the same hierarchy and comfortable edges. */
.v2-welcome:not(.is-content-page) .operation-dock{border:1px solid rgba(180,210,239,.15);border-radius:18px;background:linear-gradient(150deg,rgba(20,37,55,.4),rgba(3,10,20,.28));box-shadow:inset 0 1px rgba(230,244,255,.035)}
.entry-form input{border-radius:12px;min-height:48px;background:rgba(3,10,19,.36);border-color:rgba(157,191,224,.24)}
.entry-form .dock-primary,.color-control .dock-primary{border-radius:12px}
.v2-welcome__logout{border:1px solid rgba(158,193,226,.17);border-radius:12px;background:rgba(8,20,34,.3)}
.v2-welcome__logout::before,.v2-welcome__logout::after{display:none}
.gift-grid button{position:relative}.gift-grid .gift-icon-shell{border:0}
.gift-selection-mark{position:absolute;right:10px;top:10px;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;color:#0b1c2b;background:#cee4f4;font-size:12px;font-weight:600}
.gift-send-row>span{line-height:1.35}.gift-send-row .gift-total-label{display:block;margin-bottom:3px;color:#9fb6cc;font:400 11px/1.5 var(--font-ui)}
.live-interaction-card{border-color:rgba(177,205,227,.19);background:linear-gradient(130deg,rgba(25,43,60,.5),rgba(5,16,28,.48));-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.v2-welcome.is-completed .operation-dock{background:linear-gradient(150deg,rgba(20,37,55,.55),rgba(3,10,20,.5));border-radius:18px}

</style>
