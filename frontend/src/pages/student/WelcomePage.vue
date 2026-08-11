<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import BaseCard from '../../components/ui/BaseCard.vue'
import StatusPill from '../../components/ui/StatusPill.vue'
import { useRealtime } from '../../composables/useRealtime'
import { useReducedMotion } from '../../composables/useReducedMotion'
import {
  ApiError,
  commandVersion,
  createIdempotencyKey,
  participantApi,
  publicErrorMessage,
} from '../../services/api'
import { takePendingInvitationToken } from '../../services/invitation-entry'
import { applyParticipantRealtimeEvent } from '../../services/participant-realtime'
import {
  createRefreshCoalescer,
  shouldCommitSnapshot,
} from '../../services/refresh-coalescer'
import {
  STAR_TEMPERATURE_DEFAULT,
  STAR_TEMPERATURE_MAX,
  STAR_TEMPERATURE_MIN,
  STAR_TEMPERATURE_STEP,
  clampStarTemperature,
  starTemperatureStyle,
} from '../../services/star-temperature'

const stageNames = ['身份激活', '时光胶囊', '星星集结', '节目应援', '协同点亮', '星际档案']
const tabs = [
  { id: 'scene', label: '星程' },
  { id: 'programs', label: '节目单' },
  { id: 'archive', label: '档案' },
]

const entryState = ref('checking')
const invitationToken = ref(null)
const snapshot = ref(null)
const activeTab = ref('scene')
const displayName = ref('')
const demoCode = ref('')
const capsuleMessage = ref('')
const capsuleMessageDirty = ref(false)
const capsuleNoticeAccepted = ref(false)
const barrageText = ref('')
const publicNoticeAccepted = ref(false)
const giftSheetOpen = ref(false)
const busy = ref('')
const formError = ref('')
const successMessage = ref('')
const serviceNotice = ref('')
const activationKey = ref(null)
const capsuleMessageKey = ref(null)
const starKey = ref(null)
const starTemperatureKey = ref(null)
const starTemperatureKelvin = ref(STAR_TEMPERATURE_DEFAULT)
const lightKey = ref(null)
const barrageKey = ref(null)
const giftKeys = new Map()
const arrivalTransition = ref(false)
const reducedMotion = useReducedMotion()
let sessionGeneration = 0
let arrivalTimer = null

const isActive = computed(() => entryState.value === 'active' && Boolean(snapshot.value))
const runtime = computed(() => snapshot.value?.runtime ?? null)
const participant = computed(() => snapshot.value?.participant ?? null)
const stage = computed(() => runtime.value?.stage ?? 1)
const needsStarTemperature = computed(
  () => isActive.value && !participant.value?.starTemperatureLocked,
)
const selectedStarStyle = computed(() =>
  starTemperatureStyle(
    participant.value?.starTemperatureKelvin ?? starTemperatureKelvin.value,
  ),
)
const temperatureAriaText = computed(
  () => `${starTemperatureKelvin.value} Kelvin`,
)
const runtimeRunning = computed(() => runtime.value?.status === 'RUNNING')
const currentProgram = computed(() =>
  snapshot.value?.programs?.find((program) => program.state === 'CURRENT'),
)
const nextProgram = computed(() =>
  snapshot.value?.programs?.find((program) => program.state === 'NEXT'),
)

function clearParticipantSession() {
  sessionGeneration += 1
  snapshot.value = null
  capsuleMessage.value = ''
  capsuleMessageDirty.value = false
  capsuleNoticeAccepted.value = false
  arrivalTransition.value = false
  starTemperatureKelvin.value = STAR_TEMPERATURE_DEFAULT
  starTemperatureKey.value = null
  entryState.value = 'missing'
}

async function refreshSnapshot() {
  const generation = sessionGeneration
  let next
  try {
    next = await participantApi.snapshot()
  } catch (error) {
    if (
      generation === sessionGeneration
      && error instanceof ApiError
      && error.code === 'AUTH_REQUIRED'
    ) {
      clearParticipantSession()
    }
    throw error
  }
  if (generation !== sessionGeneration) return snapshot.value
  if (!shouldCommitSnapshot(snapshot.value, next)) return snapshot.value
  const previousStoredMessage = snapshot.value?.participant?.capsuleMessage ?? ''
  const nextStoredMessage = next.participant.capsuleMessage ?? ''
  snapshot.value = next
  if (!capsuleMessageDirty.value || nextStoredMessage !== previousStoredMessage) {
    capsuleMessage.value = nextStoredMessage
    capsuleMessageDirty.value = false
  }
  if (next.participant.capsulePublicNoticeAccepted) {
    capsuleNoticeAccepted.value = true
  }
  if (next.participant.starTemperatureKelvin !== null) {
    starTemperatureKelvin.value = next.participant.starTemperatureKelvin
  }
  entryState.value = 'active'
  return next
}

const realtimeRefresh = createRefreshCoalescer(refreshSnapshot, {
  delayMs: 50,
  onError: () => void realtime.resync('EVENT_REFRESH_FAILED'),
})

const realtime = useRealtime({
  stream: 'participant',
  enabled: isActive,
  resync: refreshSnapshot,
  onEvent: (event) => {
    if (event.stream === 'participant') {
      realtimeRefresh.schedule()
    } else {
      snapshot.value = applyParticipantRealtimeEvent(snapshot.value, event)
    }
  },
})

onBeforeUnmount(() => {
  sessionGeneration += 1
  if (arrivalTimer !== null) window.clearTimeout(arrivalTimer)
  realtimeRefresh.cancel()
})

const messageWritesAllowed = computed(
  () => realtime.canWrite.value && ['READY', 'RUNNING'].includes(runtime.value?.status),
)
const interactionWritesAllowed = computed(
  () => realtime.canWrite.value && runtimeRunning.value,
)
const connectionTone = computed(() =>
  realtime.state.value === 'online' ? 'success' : realtime.state.value === 'offline' ? 'danger' : 'warning',
)
const connectionLabel = computed(() => {
  const labels = {
    online: '实时同步',
    offline: '设备离线',
    syncing: '正在同步',
    connecting: '正在连接',
    reconnecting: '正在重连',
    idle: '等待会话',
  }
  return labels[realtime.state.value] ?? '连接检查中'
})

function resetActivationKey() {
  activationKey.value = null
  formError.value = ''
}

function visibleLength(value) {
  return Array.from(value.trim()).length
}

function isDefinitiveFailure(error) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
}

function validateActivation() {
  if (!displayName.value.trim() || visibleLength(displayName.value) > 40) {
    return '请输入 1–40 个字符的虚构姓名。'
  }
  if (!/^\d{6}$/.test(demoCode.value)) return '请输入邀请函上的六位 Demo 码。'
  return ''
}

async function boot() {
  invitationToken.value = takePendingInvitationToken()
  try {
    await refreshSnapshot()
  } catch (error) {
    if (error instanceof ApiError && error.code === 'AUTH_REQUIRED') {
      entryState.value = invitationToken.value ? 'activation' : 'missing'
      return
    }
    serviceNotice.value = publicErrorMessage(error)
    entryState.value = invitationToken.value ? 'activation' : 'missing'
  }
}

async function submitActivation() {
  formError.value = validateActivation()
  successMessage.value = ''
  if (formError.value) return
  if (!invitationToken.value) {
    formError.value = '入口信息已从本页清除，请重新轻触或扫码。'
    return
  }
  if (!navigator.onLine) {
    formError.value = '设备当前离线，无法核验。'
    return
  }

  busy.value = 'activation'
  activationKey.value ??= createIdempotencyKey()
  try {
    await participantApi.activate(
      {
        token: invitationToken.value,
        displayName: displayName.value.trim(),
        demoCode: demoCode.value,
      },
      activationKey.value,
    )
    await refreshSnapshot()
    invitationToken.value = null
    activationKey.value = null
    successMessage.value = '身份已激活，欢迎进入现场。'
  } catch (error) {
    if (isDefinitiveFailure(error)) activationKey.value = null
    formError.value =
      error instanceof ApiError && ['VALIDATION_FAILED', 'AUTH_REQUIRED'].includes(error.code)
        ? '核验未通过，请确认邀请入口和填写信息后重试。'
        : publicErrorMessage(error)
  } finally {
    busy.value = ''
  }
}

async function handleCommandError(error) {
  if (
    error instanceof ApiError
    && ['AUTH_REQUIRED', 'RESET_EPOCH_CHANGED'].includes(error.code)
  ) {
    clearParticipantSession()
    return error.code === 'RESET_EPOCH_CHANGED'
      ? 'Demo 已重置，请重新轻触或扫码进入。'
      : '会话已失效，请重新轻触或扫码进入。'
  }
  if (error instanceof ApiError && ['STALE_STAGE', 'RUNTIME_PAUSED'].includes(error.code)) {
    try {
      await refreshSnapshot()
    } catch {
      // Keep the original actionable error.
    }
  }
  return publicErrorMessage(error)
}

async function submitCapsuleMessage() {
  formError.value = ''
  successMessage.value = ''
  if (visibleLength(capsuleMessage.value) < 1 || visibleLength(capsuleMessage.value) > 80) {
    formError.value = '时光胶囊需要 1–80 个可见字符。'
    return
  }
  if (!capsuleNoticeAccepted.value) {
    formError.value = '请先确认你已知悉内容可能经人工筛选后匿名上屏。'
    return
  }
  busy.value = 'capsule-message'
  const wasSubmitted = participant.value.capsuleMessageSubmitted
  capsuleMessageKey.value ??= createIdempotencyKey()
  try {
    await participantApi.submitCapsuleMessage(
      {
        ...commandVersion(snapshot.value),
        text: capsuleMessage.value.trim(),
        publicDisplayNoticeAccepted: true,
      },
      capsuleMessageKey.value,
    )
    await refreshSnapshot()
    capsuleMessageDirty.value = false
    capsuleMessageKey.value = null
    successMessage.value = wasSubmitted
      ? '时光胶囊已更新，并重新进入人工筛选候选池。'
      : '时光胶囊已提交，现已进入人工筛选候选池。'
  } catch (error) {
    if (isDefinitiveFailure(error)) capsuleMessageKey.value = null
    formError.value = await handleCommandError(error)
  } finally {
    busy.value = ''
  }
}

function editCapsuleMessage() {
  capsuleMessageDirty.value = true
  capsuleMessageKey.value = null
}

function finishArrivalTransition() {
  if (arrivalTimer !== null) {
    window.clearTimeout(arrivalTimer)
    arrivalTimer = null
  }
  arrivalTransition.value = false
}

function playArrivalTransition() {
  if (reducedMotion.value) {
    arrivalTransition.value = false
    return
  }
  arrivalTransition.value = true
  arrivalTimer = window.setTimeout(finishArrivalTransition, 900)
}

function previewStarTemperature(value) {
  starTemperatureKelvin.value = clampStarTemperature(value)
  starTemperatureKey.value = null
}

async function confirmStarTemperature() {
  formError.value = ''
  successMessage.value = ''
  busy.value = 'star-temperature'
  starTemperatureKey.value ??= createIdempotencyKey()
  try {
    await participantApi.lockStarTemperature(
      {
        ...commandVersion(snapshot.value),
        temperatureKelvin: starTemperatureKelvin.value,
      },
      starTemperatureKey.value,
    )
    playArrivalTransition()
    await refreshSnapshot()
    starTemperatureKey.value = null
    successMessage.value = '恒星色温已确认，时光胶囊入口已经开启。'
  } catch (error) {
    if (isDefinitiveFailure(error)) starTemperatureKey.value = null
    formError.value = await handleCommandError(error)
  } finally {
    busy.value = ''
  }
}

async function startStar() {
  formError.value = ''
  successMessage.value = ''
  busy.value = 'star'
  starKey.value ??= createIdempotencyKey()
  try {
    await participantApi.startStar(commandVersion(snapshot.value), starKey.value)
    await refreshSnapshot()
    starKey.value = null
    successMessage.value = '你的匿名星星已加入全场集结。'
  } catch (error) {
    if (isDefinitiveFailure(error)) starKey.value = null
    formError.value = await handleCommandError(error)
  } finally {
    busy.value = ''
  }
}

async function sendGift(programId, gift) {
  formError.value = ''
  successMessage.value = ''
  const actionId = `${programId}:${gift.id}`
  busy.value = `gift:${gift.id}`
  const key = giftKeys.get(actionId) ?? createIdempotencyKey()
  giftKeys.set(actionId, key)
  try {
    await participantApi.sendGift(
      { ...commandVersion(snapshot.value), programId, giftId: gift.id },
      key,
    )
    await refreshSnapshot()
    giftKeys.delete(actionId)
    giftSheetOpen.value = false
    successMessage.value = `已送出“${gift.name}”，动力值以最新余额为准。`
  } catch (error) {
    if (isDefinitiveFailure(error)) giftKeys.delete(actionId)
    formError.value = await handleCommandError(error)
  } finally {
    busy.value = ''
  }
}

async function sendBarrage() {
  formError.value = ''
  successMessage.value = ''
  const length = visibleLength(barrageText.value)
  if (length < 1 || length > 40) {
    formError.value = '弹幕需要 1–40 个可见字符。'
    return
  }
  if (!publicNoticeAccepted.value) {
    formError.value = '请先确认弹幕会以匿名形式公开展示。'
    return
  }
  busy.value = 'barrage'
  barrageKey.value ??= createIdempotencyKey()
  try {
    await participantApi.sendBarrage(
      {
        ...commandVersion(snapshot.value),
        text: barrageText.value.trim(),
        publicNoticeAccepted: true,
      },
      barrageKey.value,
    )
    await refreshSnapshot()
    barrageText.value = ''
    barrageKey.value = null
    successMessage.value = '弹幕已通过本地规则并匿名发布。'
  } catch (error) {
    if (isDefinitiveFailure(error)) barrageKey.value = null
    formError.value = await handleCommandError(error)
  } finally {
    busy.value = ''
  }
}

async function cooperativeLight() {
  formError.value = ''
  successMessage.value = ''
  busy.value = 'light'
  lightKey.value ??= createIdempotencyKey()
  try {
    await participantApi.light(commandVersion(snapshot.value), lightKey.value)
    await refreshSnapshot()
    lightKey.value = null
    successMessage.value = '协同点亮已完成。'
  } catch (error) {
    if (isDefinitiveFailure(error)) lightKey.value = null
    formError.value = await handleCommandError(error)
  } finally {
    busy.value = ''
  }
}

async function logout() {
  sessionGeneration += 1
  busy.value = 'logout'
  try {
    await participantApi.logout()
  } catch {
    // The local session is cleared from this page even if the service is unavailable.
  } finally {
    // Also invalidate refreshes that started after logout began but before it completed.
    clearParticipantSession()
    busy.value = ''
  }
}

onMounted(boot)
</script>

<template>
  <section
    class="mobile-stage portal"
    :class="{
      'portal--active': isActive && !needsStarTemperature && !arrivalTransition,
      'portal--temperature': needsStarTemperature,
      'portal--transition': arrivalTransition,
    }"
    aria-labelledby="welcome-title"
  >
    <header class="portal-brand">
      <div>
        <p>SYSU · 智能工程学院</p>
        <h1 id="welcome-title">星海抵达</h1>
      </div>
      <StatusPill v-if="isActive" size="sm" :tone="connectionTone">{{ connectionLabel }}</StatusPill>
      <span v-else class="portal-brand__index">ARRIVAL / 01</span>
    </header>

    <p v-if="serviceNotice" class="inline-message warning" role="status">{{ serviceNotice }}</p>

    <div v-if="!isActive" class="entry-layout">
      <section class="entry-visual" aria-label="邀请入口星海">
        <div>
          <p class="eyebrow">一人一星 · 共同抵达</p>
          <h2>在星海中，找到属于你的微光</h2>
          <p>轻触邀请函后，入口只用于建立本次合成身份会话。</p>
        </div>
        <div class="entry-star" aria-hidden="true" data-motion="decorative">
          <span></span>
        </div>
        <p class="entry-coordinate">22.52°N / SIGNAL READY</p>
      </section>

      <section v-if="entryState === 'checking'" class="entry-panel" aria-live="polite">
        <p class="eyebrow">入口检查</p>
        <h2>正在检查入口与会话</h2>
        <p class="helper">请稍候，页面不会把邀请令牌写入本地存储。</p>
      </section>

      <section v-else-if="entryState === 'activation'" class="entry-panel">
        <form class="form-stack" novalidate @submit.prevent="submitActivation">
          <div>
            <p class="eyebrow">备用核验 · 01</p>
            <h2>使用邀请函上的合成信息核验</h2>
            <p class="helper">只使用虚构姓名和六位 Demo 码，请勿填写真实个人信息。</p>
          </div>
          <div class="field-pair">
            <label for="display-name">虚构姓名</label>
            <input
              id="display-name"
              v-model="displayName"
              name="displayName"
              autocomplete="off"
              maxlength="40"
              @input="resetActivationKey"
            />
          </div>
          <div class="field-pair">
            <label for="demo-code">六位 Demo 码</label>
            <input
              id="demo-code"
              v-model="demoCode"
              name="demoCode"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              pattern="[0-9]{6}"
              @input="resetActivationKey"
            />
          </div>
          <p v-if="formError" class="inline-message danger" role="alert">{{ formError }}</p>
          <BaseButton type="submit" block size="lg" :loading="busy === 'activation'">
            {{ busy === 'activation' ? '正在核验' : '进入现场' }}
          </BaseButton>
        </form>
      </section>

      <section v-else-if="entryState === 'missing'" class="entry-panel entry-panel--missing">
        <p class="eyebrow">入口已清除</p>
        <h2>请重新轻触邀请函或扫描二维码</h2>
        <p class="helper">为了保护入口信息，本页不会保存已从地址栏移除的邀请令牌。</p>
      </section>
    </div>

    <section
      v-else-if="needsStarTemperature"
      class="temperature-selection"
      aria-labelledby="temperature-title"
      :style="selectedStarStyle"
    >
      <div class="temperature-copy">
        <p class="eyebrow">STELLAR SIGNATURE / 02</p>
        <h2 id="temperature-title">选择你的恒星色温</h2>
        <p>拖动只会预览光色；确认后，本场活动中的个人星点与集体星海都会保持一致。</p>
      </div>

      <div class="temperature-starfield" aria-hidden="true" data-motion="decorative">
        <span class="temperature-orbit temperature-orbit--outer"></span>
        <span class="temperature-orbit temperature-orbit--inner"></span>
        <span class="temperature-star"></span>
      </div>

      <div class="temperature-control">
        <div class="temperature-readout">
          <label for="star-temperature">恒星色温</label>
          <output for="star-temperature">{{ starTemperatureKelvin.toLocaleString('zh-CN') }} K</output>
        </div>
        <input
          id="star-temperature"
          :value="starTemperatureKelvin"
          type="range"
          :min="STAR_TEMPERATURE_MIN"
          :max="STAR_TEMPERATURE_MAX"
          :step="STAR_TEMPERATURE_STEP"
          :aria-valuetext="temperatureAriaText"
          @input="previewStarTemperature($event.target.value)"
        />
        <div class="temperature-scale" aria-hidden="true">
          <span>2,400 K</span><span>12,000 K</span>
        </div>
        <BaseButton
          type="button"
          block
          size="lg"
          :loading="busy === 'star-temperature'"
          @click="confirmStarTemperature"
        >
          {{ busy === 'star-temperature' ? '正在写入星图' : '确认星色 · 进入星辰' }}
        </BaseButton>
        <p v-if="formError" class="inline-message danger" role="alert">{{ formError }}</p>
      </div>
    </section>

    <section
      v-else-if="arrivalTransition"
      class="arrival-transition"
      :style="selectedStarStyle"
      aria-labelledby="arrival-transition-title"
    >
      <button type="button" class="arrival-transition__skip" @click="finishArrivalTransition">
        跳过过场
      </button>
      <div class="arrival-transition__field" aria-hidden="true" data-motion="decorative">
        <span class="arrival-transition__path"></span>
        <span class="arrival-transition__wave arrival-transition__wave--one"></span>
        <span class="arrival-transition__wave arrival-transition__wave--two"></span>
        <span class="arrival-transition__star"></span>
      </div>
      <div class="arrival-transition__copy">
        <p class="eyebrow">SIGNAL LOCKED / CAPSULE READY</p>
        <h2 id="arrival-transition-title">你的星辰正在进入轨道</h2>
        <p>下一站，留下此刻的时光胶囊。</p>
      </div>
    </section>

    <template v-else>
      <nav class="portal-tabs" aria-label="参与者页面">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          :aria-current="activeTab === tab.id ? 'page' : undefined"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>

      <ol class="compact-stages" aria-label="六阶段进度">
        <li
          v-for="(name, index) in stageNames"
          :key="name"
          :class="{ completed: stage > index + 1, current: stage === index + 1 }"
          :aria-current="stage === index + 1 ? 'step' : undefined"
        >
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <em>{{ name }}</em>
        </li>
      </ol>

      <div class="participant-bar">
        <div>
          <strong>{{ participant.displayName }}</strong>
          <span>星号 {{ participant.publicStarId }}</span>
        </div>
        <BaseButton variant="ghost" size="sm" :loading="busy === 'logout'" @click="logout">退出</BaseButton>
      </div>

      <div class="value-grid" aria-label="个人数值">
        <div><span>动力</span><strong class="power">{{ participant.powerBalance }}</strong></div>
        <div><span>星光</span><strong class="starlight">{{ participant.starlight }} / 100</strong></div>
      </div>

      <div class="portal-feedback">
        <p v-if="runtime.status === 'PAUSED' || !realtime.canWrite.value" class="inline-message warning" role="status">
          {{ runtime.status === 'PAUSED' ? '现场互动已暂停；当前内容仍可查看。' : '正在恢复实时同步，暂时不能提交操作。' }}
        </p>
        <p v-if="formError" class="inline-message danger" role="alert">{{ formError }}</p>
        <p v-if="successMessage" class="inline-message success" role="status">{{ successMessage }}</p>
      </div>

      <main class="portal-view">
        <section v-if="activeTab === 'scene'" class="tab-panel scene-panel" aria-labelledby="scene-title">
          <div class="section-heading">
            <div>
              <p class="eyebrow">星程 {{ String(stage).padStart(2, '0') }} / 06</p>
              <h2 id="scene-title">{{ stageNames[stage - 1] }}</h2>
            </div>
            <StatusPill size="sm" :tone="runtimeRunning ? 'success' : 'warning'">{{ runtime.status }}</StatusPill>
          </div>

          <div class="scene-canvas" aria-hidden="true">
            <span class="scene-canvas__orbit scene-canvas__orbit--one"></span>
            <span class="scene-canvas__orbit scene-canvas__orbit--two"></span>
            <div
              class="personal-star"
              :class="{ 'personal-star--started': participant.starStarted }"
              :style="selectedStarStyle"
              data-motion="decorative"
            >
              <span class="personal-star__glow"></span>
              <span class="personal-star__core"></span>
              <small>{{ participant.publicStarId }}</small>
            </div>
          </div>

          <section v-if="stage <= 2" class="task-surface task-surface--capsule">
            <form class="form-stack" @submit.prevent="submitCapsuleMessage">
              <div>
                <p class="task-kicker">TIME CAPSULE</p>
                <h3>{{ stage === 1 ? '身份已激活，留下此刻的一句话' : '留下此刻的一句话' }}</h3>
                <p class="capsule-disclosure" role="status">
                  你写下的内容可能经人工筛选后，以星号和星色在现场大屏展示；提交不保证一定上屏。
                </p>
              </div>
              <label for="capsule-message">时光胶囊留言</label>
              <textarea
                id="capsule-message"
                v-model="capsuleMessage"
                maxlength="160"
                rows="3"
                @input="editCapsuleMessage"
              ></textarea>
              <label class="capsule-consent">
                <input v-model="capsuleNoticeAccepted" type="checkbox" />
                <span>我已知悉：提交后内容会进入人工筛选候选池，可能以星号和星色匿名上屏。</span>
              </label>
              <span class="counter">{{ visibleLength(capsuleMessage) }} / 80</span>
              <BaseButton
                type="submit"
                block
                :disabled="!messageWritesAllowed || !capsuleNoticeAccepted"
                :loading="busy === 'capsule-message'"
              >
                {{ participant.capsuleMessageSubmitted ? '更新时光胶囊' : '提交时光胶囊' }}
              </BaseButton>
            </form>
          </section>

          <section v-else-if="stage === 3" class="task-surface">
            <p class="task-kicker">STAR ASSEMBLY</p>
            <h3>让你的星点进入共同星海</h3>
            <p>星点由稳定种子生成，多设备看到的身份保持一致。</p>
            <BaseButton
              block
              :disabled="!interactionWritesAllowed || participant.starStarted"
              :loading="busy === 'star'"
              @click="startStar"
            >
              {{ participant.starStarted ? '星星已启动' : '启动我的星星' }}
            </BaseButton>
          </section>

          <section v-else-if="stage === 4" class="task-surface live-program-strip">
            <div>
              <p class="task-kicker">NOW PLAYING</p>
              <h3>{{ currentProgram?.title ?? '等待主控选择' }}</h3>
              <p v-if="nextProgram">下一节目：{{ nextProgram.title }}</p>
            </div>
            <span>热度 {{ currentProgram?.heat ?? 0 }}</span>
          </section>

          <section v-else-if="stage === 5" class="task-surface">
            <p class="task-kicker">COOPERATIVE LIGHT</p>
            <h3>全场协同点亮</h3>
            <p>每位参与者最多完成一次，刷新不会重复计分。</p>
            <BaseButton
              block
              :disabled="!interactionWritesAllowed || participant.cooperativeLightCompleted"
              :loading="busy === 'light'"
              @click="cooperativeLight"
            >
              {{ participant.cooperativeLightCompleted ? '点亮已完成' : '参与全场点亮' }}
            </BaseButton>
          </section>

          <section v-else class="task-surface">
            <p class="task-kicker">ARRIVAL ARCHIVE</p>
            <h3>你的星际档案已经开放</h3>
            <p>档案只向当前参与者会话展示，不进入公共大屏。</p>
            <BaseButton block @click="activeTab = 'archive'">查看个人档案</BaseButton>
          </section>

          <form v-if="stage === 4" class="live-area" @submit.prevent="sendBarrage">
            <label class="check-row">
              <input v-model="publicNoticeAccepted" type="checkbox" />
              <span>我知道这条内容会以匿名形式公开出现在现场大屏。</span>
            </label>
            <div class="live-dock">
              <label class="visually-hidden" for="barrage-text">弹幕内容</label>
              <input
                id="barrage-text"
                v-model="barrageText"
                maxlength="120"
                placeholder="说点什么…"
                @input="barrageKey = null"
              />
              <button
                type="button"
                class="gift-trigger"
                :disabled="!interactionWritesAllowed || !currentProgram"
                :aria-expanded="giftSheetOpen"
                aria-controls="gift-sheet"
                @click="giftSheetOpen = !giftSheetOpen"
              >
                礼物
              </button>
              <BaseButton
                type="submit"
                :disabled="!interactionWritesAllowed || runtime.barragePaused"
                :loading="busy === 'barrage'"
              >
                {{ runtime.barragePaused ? '弹幕已暂停' : '匿名发送' }}
              </BaseButton>
            </div>
          </form>

          <div v-if="giftSheetOpen && currentProgram" class="gift-sheet-layer">
            <button type="button" class="gift-sheet-scrim" aria-label="关闭礼物面板" @click="giftSheetOpen = false"></button>
            <section id="gift-sheet" class="gift-sheet" role="dialog" aria-modal="true" aria-labelledby="gift-sheet-title">
              <div class="gift-sheet__heading">
                <div><p class="task-kicker">SIGNAL GIFT</p><h3 id="gift-sheet-title">选择一束星光</h3></div>
                <button type="button" aria-label="关闭礼物面板" @click="giftSheetOpen = false">关闭</button>
              </div>
              <div class="gift-grid">
                <BaseButton
                  v-for="gift in snapshot.gifts"
                  :key="gift.id"
                  variant="secondary"
                  :disabled="!interactionWritesAllowed || busy.startsWith('gift:') || participant.powerBalance < gift.powerCost"
                  :loading="busy === `gift:${gift.id}`"
                  @click="sendGift(currentProgram.id, gift)"
                >
                  {{ gift.name }} · {{ gift.powerCost }}
                </BaseButton>
              </div>
            </section>
          </div>
        </section>

        <section v-else-if="activeTab === 'programs'" class="tab-panel program-panel" aria-labelledby="program-title">
          <div class="section-heading">
            <div>
              <p class="eyebrow">PROGRAM / SCHEDULE</p>
              <h2 id="program-title">节目单</h2>
            </div>
            <StatusPill size="sm" :tone="stage === 4 && runtimeRunning ? 'success' : 'warning'">
              {{ stage === 4 && runtimeRunning ? '互动开放' : '只读' }}
            </StatusPill>
          </div>

          <div class="program-list">
            <article v-for="(program, index) in snapshot.programs" :key="program.id" class="program-row">
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <div>
                <small>{{ program.state }}</small>
                <h3>{{ program.title }}</h3>
              </div>
              <strong v-if="program.state === 'CURRENT'">正在进行</strong>
              <strong v-else-if="program.state === 'NEXT'">下一节目</strong>
            </article>
          </div>
          <p v-if="nextProgram" class="program-next">下一节目：{{ nextProgram.title }}</p>
        </section>

        <section v-else class="tab-panel archive-panel" aria-labelledby="archive-title">
          <div class="section-heading">
            <div><p class="eyebrow">PERSONAL ARCHIVE</p><h2 id="archive-title">个人星际档案</h2></div>
            <StatusPill size="sm" :tone="snapshot.archiveAvailable ? 'success' : 'info'">
              {{ snapshot.archiveAvailable ? '完整档案' : '成长中' }}
            </StatusPill>
          </div>
          <BaseCard padding="md" class="archive-card">
            <dl>
              <div><dt>星号</dt><dd>{{ participant.publicStarId }}</dd></div>
              <div><dt>恒星色温</dt><dd>{{ participant.starTemperatureKelvin.toLocaleString('zh-CN') }} K</dd></div>
              <div><dt>动力值</dt><dd>{{ participant.powerBalance }}</dd></div>
              <div><dt>星光值</dt><dd>{{ participant.starlight }} / 100</dd></div>
              <div><dt>互动次数</dt><dd>{{ participant.interactionCount }}</dd></div>
              <div><dt>礼物次数</dt><dd>{{ participant.giftCount }}</dd></div>
              <div><dt>公开弹幕</dt><dd>{{ participant.publishedBarrageCount }}</dd></div>
              <div><dt>胶囊候选</dt><dd>{{ participant.capsuleMessageSubmitted ? '已提交' : '未提交' }}</dd></div>
            </dl>
            <div class="capsule-message">
              <strong>时光胶囊</strong>
              <p>{{ participant.capsuleMessage ?? '尚未提交' }}</p>
            </div>
          </BaseCard>
        </section>
      </main>
    </template>
  </section>
</template>

<style scoped>
/* G5 /welcome visual root: poetic star sea × astronomical editorial. */
.portal {
  --welcome-canvas: #02050c;
  --welcome-deep: #050b16;
  --welcome-surface: #081322;
  --welcome-surface-strong: #0c1a2d;
  --welcome-line: rgba(159, 186, 226, 0.24);
  --welcome-line-strong: rgba(187, 210, 242, 0.42);
  --welcome-text: #f2f6fd;
  --welcome-secondary: #aab8cc;
  --welcome-tertiary: #73849e;
  --welcome-blue: #6f9fe8;
  --welcome-gold: #ffd79a;
  --welcome-success: #8bd8bd;
  --welcome-danger: #ff8796;
  position: relative;
  width: min(100%, 430px);
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  padding:
    max(12px, env(safe-area-inset-top))
    18px
    max(12px, env(safe-area-inset-bottom));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
  overflow: hidden;
  color: var(--welcome-text);
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  text-align: left;
}

.portal--active {
  grid-template-rows: auto 44px 50px 44px 44px auto minmax(0, 1fr);
  gap: 6px;
}

.portal--temperature {
  grid-template-rows: auto minmax(0, 1fr);
}

.portal--transition {
  grid-template-rows: auto minmax(0, 1fr);
}

.portal h1,
.portal h2,
.portal h3,
.portal p {
  color: inherit;
}

.portal h2,
.portal h3 {
  margin: 0;
}

.portal .eyebrow,
.task-kicker,
.portal-brand__index,
.entry-coordinate,
.participant-bar span,
.compact-stages span,
.program-row > span,
.program-row small {
  color: var(--welcome-tertiary);
  font-family: var(--font-family-mono);
  font-size: 0.66rem;
  font-weight: 650;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.portal-brand {
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgba(159, 186, 226, 0.14);
}

.portal-brand div {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.portal-brand p {
  margin: 0;
  color: var(--welcome-secondary);
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.portal-brand h1 {
  margin: 0;
  color: var(--welcome-text);
  font-size: 0.82rem;
  font-weight: 560;
  letter-spacing: 0.12em;
  white-space: nowrap;
}

.portal :deep(.status-pill) {
  --pill-border: rgba(139, 216, 189, 0.42);
  --pill-surface: rgba(7, 20, 34, 0.92);
  border-radius: 999px;
  letter-spacing: 0.06em;
}

.portal :deep(.status-pill__dot) {
  border-radius: 50%;
}

.entry-layout {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(170px, 1fr) auto;
  gap: 12px;
}

.entry-visual {
  position: relative;
  min-height: 0;
  padding: clamp(10px, 3vh, 26px) 4px 0;
  overflow: hidden;
}

.entry-visual > div:first-child {
  position: relative;
  z-index: 2;
  max-width: 290px;
}

.entry-visual h2 {
  max-width: 9.5em;
  margin-top: 8px;
  font-size: clamp(1.8rem, 8.5vw, 2.5rem);
  font-weight: 610;
  line-height: 1.12;
  letter-spacing: -0.035em;
}

.entry-visual p:not(.eyebrow, .entry-coordinate) {
  max-width: 24em;
  margin: 12px 0 0;
  color: var(--welcome-secondary);
  font-size: 0.82rem;
  line-height: 1.7;
}

.entry-star {
  position: absolute;
  width: 168px;
  height: 168px;
  right: -18px;
  bottom: -12px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(132, 165, 211, 0.12);
  border-radius: 50%;
}

.entry-star::before,
.entry-star::after {
  position: absolute;
  content: "";
  border: 1px solid rgba(132, 165, 211, 0.1);
  border-radius: 50%;
}

.entry-star::before { inset: 22px; }
.entry-star::after { inset: 52px; }

.entry-star span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff4dc;
  box-shadow:
    0 0 8px rgba(255, 230, 184, 0.92),
    0 0 24px rgba(255, 214, 146, 0.5),
    0 0 52px rgba(111, 159, 232, 0.24);
  animation: welcome-star-breathe 5.4s ease-in-out infinite;
}

.entry-coordinate {
  position: absolute;
  right: 0;
  bottom: 0;
  margin: 0;
}

.temperature-selection {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(132px, 1fr) auto;
  gap: 10px;
  overflow: hidden;
}

.temperature-copy {
  padding-top: clamp(8px, 2.2vh, 20px);
}

.temperature-copy h2 {
  max-width: 10em;
  margin-top: 6px;
  font-size: clamp(1.7rem, 7.8vw, 2.25rem);
  font-weight: 610;
  line-height: 1.12;
  letter-spacing: -0.035em;
}

.temperature-copy > p:last-child {
  max-width: 31em;
  margin: 9px 0 0;
  color: var(--welcome-secondary);
  font-size: 0.76rem;
  line-height: 1.55;
}

.temperature-starfield {
  position: relative;
  min-height: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.temperature-starfield::before,
.temperature-starfield::after {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  content: "";
  background: rgba(222, 234, 251, 0.72);
  box-shadow:
    -142px -54px rgba(222, 234, 251, 0.36),
    -116px 62px rgba(222, 234, 251, 0.46),
    -78px -86px rgba(222, 234, 251, 0.3),
    -38px 77px rgba(222, 234, 251, 0.28),
    42px -74px rgba(222, 234, 251, 0.42),
    83px 64px rgba(222, 234, 251, 0.34),
    126px -34px rgba(222, 234, 251, 0.32),
    154px 46px rgba(222, 234, 251, 0.24);
}

.temperature-starfield::after {
  opacity: 0.42;
  transform: rotate(23deg) scale(0.86);
}

.temperature-orbit {
  position: absolute;
  border: 1px solid rgba(151, 181, 225, 0.12);
  border-radius: 50%;
}

.temperature-orbit--outer {
  width: min(82vw, 330px);
  aspect-ratio: 2.1;
  transform: rotate(-12deg);
}

.temperature-orbit--inner {
  width: min(54vw, 220px);
  aspect-ratio: 1.6;
  border-color: rgba(151, 181, 225, 0.08);
  transform: rotate(26deg);
}

.temperature-star {
  position: relative;
  z-index: 2;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--star-temperature-color);
  box-shadow:
    0 0 8px color-mix(in srgb, var(--star-temperature-color) 96%, white),
    0 0 26px color-mix(in srgb, var(--star-temperature-color) 62%, transparent),
    0 0 64px color-mix(in srgb, var(--star-temperature-color) 30%, transparent);
  transition:
    background-color 180ms ease,
    box-shadow 180ms ease;
  animation: welcome-star-breathe 5.4s ease-in-out infinite;
}

.temperature-control {
  padding: 14px;
  border: 1px solid var(--welcome-line);
  border-top-color: var(--welcome-line-strong);
  border-radius: 14px;
  background: rgba(5, 13, 25, 0.94);
}

.temperature-readout,
.temperature-scale {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.arrival-transition {
  position: relative;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
}

.arrival-transition__skip {
  position: absolute;
  z-index: 4;
  top: 8px;
  right: 0;
  min-width: 88px;
  min-height: 44px;
  border: 0;
  color: var(--welcome-secondary);
  background: transparent;
  font: inherit;
  font-size: 0.72rem;
}

.arrival-transition__field {
  position: relative;
  min-height: 0;
  display: grid;
  place-items: center;
}

.arrival-transition__field::before,
.arrival-transition__field::after {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  content: "";
  background: rgba(225, 237, 255, 0.68);
  box-shadow:
    -146px -120px rgba(225, 237, 255, 0.24),
    -118px 86px rgba(225, 237, 255, 0.4),
    -62px -74px rgba(225, 237, 255, 0.32),
    42px 112px rgba(225, 237, 255, 0.28),
    94px -98px rgba(225, 237, 255, 0.36),
    142px 44px rgba(225, 237, 255, 0.3);
}

.arrival-transition__field::after {
  opacity: 0.45;
  transform: rotate(31deg) scale(0.82);
}

.arrival-transition__path {
  position: absolute;
  width: min(92vw, 390px);
  height: min(44vw, 185px);
  border: 1px solid rgba(145, 177, 223, 0.16);
  border-radius: 50%;
  transform: rotate(-16deg) scaleX(0.2);
  opacity: 0;
  animation: arrival-path-form 560ms 120ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.arrival-transition__wave {
  position: absolute;
  width: 32px;
  height: 32px;
  border: 1px solid color-mix(in srgb, var(--star-temperature-color) 54%, transparent);
  border-radius: 50%;
  opacity: 0;
  animation: arrival-wave 620ms 180ms ease-out forwards;
}

.arrival-transition__wave--two {
  animation-delay: 280ms;
}

.arrival-transition__star {
  position: relative;
  z-index: 2;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--star-temperature-color);
  box-shadow:
    0 0 10px color-mix(in srgb, var(--star-temperature-color) 96%, white),
    0 0 32px color-mix(in srgb, var(--star-temperature-color) 70%, transparent),
    0 0 82px color-mix(in srgb, var(--star-temperature-color) 32%, transparent);
  animation: arrival-star-enter 680ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.arrival-transition__copy {
  padding: 18px 0 clamp(18px, 4vh, 34px);
  opacity: 0;
  transform: translateY(8px);
  animation: arrival-copy-in 240ms 420ms ease-out forwards;
}

.arrival-transition__copy h2 {
  max-width: 9em;
  margin-top: 7px;
  font-size: clamp(1.8rem, 8vw, 2.35rem);
  font-weight: 610;
  line-height: 1.12;
  letter-spacing: -0.035em;
}

.arrival-transition__copy > p:last-child {
  margin: 8px 0 0;
  color: var(--welcome-secondary);
  font-size: 0.8rem;
}

.temperature-readout output {
  color: var(--star-temperature-color);
  font-family: var(--font-family-mono);
  font-size: 1rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.temperature-control input[type='range'] {
  width: 100%;
  min-height: 44px;
  margin: 2px 0 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  accent-color: var(--star-temperature-color);
  cursor: pointer;
}

.temperature-control input[type='range']::-webkit-slider-runnable-track {
  height: 8px;
  border: 1px solid rgba(238, 244, 255, 0.22);
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    #ff7656 0%,
    #ffab62 22%,
    #ffd98b 43%,
    #fff4dc 62%,
    #dceaff 82%,
    #a9ccff 100%
  );
}

.temperature-control input[type='range']::-webkit-slider-thumb {
  width: 24px;
  height: 24px;
  margin-top: -9px;
  border: 3px solid #07101d;
  border-radius: 50%;
  appearance: none;
  background: var(--star-temperature-color);
  box-shadow:
    0 0 0 2px rgba(236, 244, 255, 0.72),
    0 0 18px color-mix(in srgb, var(--star-temperature-color) 72%, transparent);
}

.temperature-control input[type='range']::-moz-range-track {
  height: 8px;
  border: 1px solid rgba(238, 244, 255, 0.22);
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    #ff7656 0%,
    #ffab62 22%,
    #ffd98b 43%,
    #fff4dc 62%,
    #dceaff 82%,
    #a9ccff 100%
  );
}

.temperature-control input[type='range']::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border: 3px solid #07101d;
  border-radius: 50%;
  background: var(--star-temperature-color);
  box-shadow: 0 0 0 2px rgba(236, 244, 255, 0.72);
}

.temperature-scale {
  margin: -2px 0 10px;
  color: var(--welcome-tertiary);
  font-family: var(--font-family-mono);
  font-size: 0.56rem;
  font-variant-numeric: tabular-nums;
}

.entry-panel,
.task-surface {
  border: 1px solid var(--welcome-line);
  border-top-color: var(--welcome-line-strong);
  border-radius: 14px;
  background: rgba(6, 15, 27, 0.96);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
}

.entry-panel {
  padding: 18px;
}

.entry-panel h2 {
  margin: 5px 0 7px;
  font-size: clamp(1.3rem, 5.8vw, 1.65rem);
  font-weight: 620;
  line-height: 1.28;
}

.entry-panel--missing {
  align-self: end;
  padding-block: 24px;
}

.portal .helper,
.task-surface p,
.live-program-strip p,
.program-next,
.capsule-message p {
  color: var(--welcome-secondary);
}

.portal .helper {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.55;
}

.portal .form-stack {
  display: grid;
  gap: 10px;
}

.field-pair {
  display: grid;
  gap: 5px;
}

.portal label {
  color: var(--welcome-secondary);
  font-size: 0.78rem;
  font-weight: 560;
}

.portal input,
.portal textarea {
  width: 100%;
  min-height: 46px;
  padding: 10px 12px;
  border: 1px solid rgba(152, 182, 226, 0.34);
  border-radius: 10px;
  color: var(--welcome-text);
  background: #030a14;
  caret-color: var(--welcome-gold);
  font: inherit;
  font-size: 1rem;
}

.portal textarea {
  min-height: 76px;
  max-height: 88px;
  resize: none;
}

.portal input::placeholder,
.portal textarea::placeholder {
  color: #71819a;
}

.portal input:focus-visible,
.portal textarea:focus-visible,
.portal button:focus-visible,
.portal :deep(.base-button:focus-visible) {
  outline: 2px solid #b8d4ff;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(111, 159, 232, 0.22);
}

.portal :deep(.base-button) {
  min-height: 46px;
  border-color: rgba(159, 186, 226, 0.36);
  border-radius: 10px;
  color: var(--welcome-text);
  background: #11213a;
  box-shadow: none;
  transition:
    opacity 160ms ease,
    background-color 160ms ease,
    border-color 160ms ease;
  touch-action: manipulation;
}

.portal :deep(.base-button:hover:not(:disabled)),
.portal :deep(.base-button:active:not(:disabled)) {
  transform: none;
}

.portal :deep(.base-button--primary) {
  border-color: #739fe1;
  color: #06101f;
  background: #9cc2fb;
}

.portal :deep(.base-button--secondary) {
  color: var(--welcome-text);
  background: #0b192d;
}

.portal :deep(.base-button--ghost) {
  color: var(--welcome-secondary);
  background: transparent;
}

.portal :deep(.base-button:disabled) {
  border-color: rgba(159, 186, 226, 0.16);
  color: #65748a;
  background: #08101d;
  opacity: 1;
}

.portal-tabs {
  height: 44px;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 0;
  border-bottom: 1px solid var(--welcome-line);
  background: transparent;
}

.portal-tabs button {
  position: relative;
  min-height: 44px;
  border: 0;
  color: var(--welcome-tertiary);
  background: transparent;
  font-size: 0.88rem;
  font-weight: 560;
  letter-spacing: 0.04em;
  touch-action: manipulation;
}

.portal-tabs button[aria-current='page'] {
  color: var(--welcome-text);
  background: transparent;
}

.portal-tabs button[aria-current='page']::after {
  position: absolute;
  right: 22%;
  bottom: -1px;
  left: 22%;
  height: 2px;
  border-radius: 2px;
  content: "";
  background: var(--welcome-blue);
  box-shadow: 0 0 12px rgba(111, 159, 232, 0.58);
}

.compact-stages {
  position: relative;
  height: 50px;
  margin: 0;
  padding: 0 2px;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0;
  background: transparent;
  list-style: none;
}

.compact-stages::before {
  position: absolute;
  top: 17px;
  right: 8%;
  left: 8%;
  height: 1px;
  content: "";
  background: rgba(159, 186, 226, 0.22);
}

.compact-stages li {
  position: relative;
  min-height: 44px;
  padding: 0;
  display: grid;
  place-items: start center;
  align-content: start;
  gap: 5px;
  color: var(--welcome-tertiary);
  background: transparent;
  font-size: 0.58rem;
  text-align: center;
}

.compact-stages li::before {
  position: relative;
  z-index: 1;
  width: 7px;
  height: 7px;
  margin-top: 14px;
  border: 1px solid var(--welcome-tertiary);
  border-radius: 50%;
  content: "";
  background: var(--welcome-deep);
}

.compact-stages li.completed::before {
  border-color: var(--welcome-blue);
  background: var(--welcome-blue);
}

.compact-stages li.current::before {
  width: 10px;
  height: 10px;
  margin-top: 12px;
  border: 0;
  background: var(--welcome-gold);
  box-shadow: 0 0 13px rgba(255, 215, 154, 0.68);
}

.compact-stages li span {
  position: absolute;
  top: 27px;
  color: inherit;
  font-size: 0.52rem;
}

.compact-stages li.current span {
  color: var(--welcome-gold);
}

.compact-stages li em {
  position: absolute;
  width: max-content;
  max-width: 64px;
  top: 36px;
  color: transparent;
  font-size: 0.52rem;
  font-style: normal;
  pointer-events: none;
}

.compact-stages li.current em {
  color: var(--welcome-secondary);
}

.participant-bar {
  min-height: 44px;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  border-bottom: 1px solid rgba(159, 186, 226, 0.12);
}

.participant-bar div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.participant-bar strong {
  max-width: 10em;
  overflow: hidden;
  color: var(--welcome-text);
  font-size: 0.9rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.participant-bar :deep(.base-button) {
  min-height: 44px;
  padding-inline: 12px;
}

.value-grid {
  min-height: 44px;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  border-bottom: 1px solid rgba(159, 186, 226, 0.14);
}

.value-grid > div {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.value-grid > div + div {
  padding-left: 16px;
  border-left: 1px solid rgba(159, 186, 226, 0.16);
}

.value-grid span {
  color: var(--welcome-tertiary);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
}

.value-grid strong {
  color: var(--welcome-text);
  font-family: var(--font-family-mono);
  font-size: 1.15rem;
  font-variant-numeric: tabular-nums;
}

.value-grid .starlight { color: var(--welcome-gold); }

.portal-feedback {
  position: relative;
  z-index: 20;
  min-height: 0;
  pointer-events: none;
}

.portal .inline-message {
  margin: 0 0 6px;
  padding: 9px 11px;
  border: 1px solid currentColor;
  border-left-width: 3px;
  border-radius: 8px;
  color: var(--welcome-secondary);
  background: rgba(3, 9, 17, 0.96);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
  font-size: 0.75rem;
  line-height: 1.4;
}

.portal .inline-message.warning { color: var(--welcome-gold); }
.portal .inline-message.danger { color: var(--welcome-danger); }
.portal .inline-message.success { color: var(--welcome-success); }

.entry-panel .inline-message {
  box-shadow: none;
}

.portal-view {
  min-height: 0;
  overflow: hidden;
}

.tab-panel {
  height: 100%;
  min-height: 0;
}

.scene-panel {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(82px, 1fr) auto;
  gap: 8px;
}

.scene-panel:has(.live-area) {
  grid-template-rows: auto minmax(70px, 1fr) auto auto;
}

.section-heading {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-heading h2 {
  margin-top: 3px;
  font-size: clamp(1.35rem, 6vw, 1.75rem);
  font-weight: 590;
  letter-spacing: -0.025em;
}

.scene-canvas {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.scene-canvas__orbit {
  position: absolute;
  border: 1px solid rgba(143, 174, 218, 0.14);
  border-radius: 50%;
  transform: rotate(-18deg);
}

.scene-canvas__orbit--one {
  width: 78%;
  height: 72%;
  top: 9%;
  left: 11%;
}

.scene-canvas__orbit--two {
  width: 48%;
  height: 104%;
  top: -4%;
  left: 26%;
  border-color: rgba(143, 174, 218, 0.08);
  transform: rotate(24deg);
}

.personal-star {
  position: absolute;
  width: 122px;
  height: 122px;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  transform: translate(-50%, -50%);
}

.personal-star__glow {
  position: absolute;
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--star-temperature-color) 22%, transparent),
    transparent 68%
  );
  filter: blur(7px);
}

.personal-star__core {
  position: relative;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--star-temperature-color);
  box-shadow:
    0 0 8px color-mix(in srgb, var(--star-temperature-color) 96%, white),
    0 0 22px color-mix(in srgb, var(--star-temperature-color) 58%, transparent);
  animation: welcome-star-breathe 5.4s ease-in-out infinite;
}

.personal-star--started .personal-star__core {
  background: var(--star-temperature-color);
  box-shadow:
    0 0 9px color-mix(in srgb, var(--star-temperature-color) 96%, white),
    0 0 28px color-mix(in srgb, var(--star-temperature-color) 72%, transparent);
}

.personal-star small {
  position: absolute;
  top: calc(50% + 18px);
  color: var(--welcome-tertiary);
  font-family: var(--font-family-mono);
  font-size: 0.58rem;
  letter-spacing: 0.12em;
}

.task-surface {
  padding: 13px 14px;
}

.task-surface h3 {
  margin: 3px 0 5px;
  font-size: 1rem;
  font-weight: 590;
}

.task-surface p {
  margin: 0 0 9px;
  font-size: 0.74rem;
  line-height: 1.5;
}

.task-surface--capsule {
  padding: 12px 14px;
}

.task-surface--capsule .form-stack {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px 10px;
}

.task-surface--capsule .form-stack > div,
.task-surface--capsule label,
.task-surface--capsule textarea {
  grid-column: 1 / -1;
}

.task-surface--capsule .capsule-disclosure {
  margin-top: 7px;
  padding: 8px 10px;
  border-left: 2px solid var(--welcome-gold);
  color: #e7d5b9;
  background: rgba(255, 215, 154, 0.06);
  font-size: 0.68rem;
  line-height: 1.45;
}

.task-surface--capsule .capsule-consent {
  min-height: 32px;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: start;
  gap: 7px;
  color: var(--welcome-secondary);
  font-size: 0.64rem;
  line-height: 1.35;
}

.task-surface--capsule .capsule-consent input {
  width: 18px;
  min-height: 18px;
  margin: 0;
  accent-color: var(--welcome-blue);
}

.task-surface--capsule :deep(.base-button) {
  min-width: 126px;
  width: auto;
}

.counter {
  align-self: center;
  justify-self: start;
  color: var(--welcome-tertiary);
}

.live-program-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.live-program-strip > span {
  flex: none;
  color: var(--welcome-gold);
  font-family: var(--font-family-mono);
  font-size: 0.72rem;
}

.live-area {
  display: grid;
  gap: 5px;
}

.check-row {
  min-height: 28px;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: start;
  gap: 7px;
  color: var(--welcome-secondary);
  font-size: 0.62rem;
  line-height: 1.3;
}

.check-row input {
  width: 18px;
  min-height: 18px;
  margin: 0;
  accent-color: var(--welcome-blue);
}

.live-dock {
  min-height: 52px;
  padding: 4px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 50px auto;
  gap: 5px;
  border: 1px solid var(--welcome-line-strong);
  border-radius: 14px;
  background: #050d19;
  box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.22);
}

.live-dock input {
  min-height: 42px;
  padding-inline: 10px;
  border-color: transparent;
  background: transparent;
}

.live-dock :deep(.base-button),
.gift-trigger {
  min-height: 44px;
  padding-inline: 11px;
  white-space: nowrap;
}

.gift-trigger {
  border: 1px solid rgba(159, 186, 226, 0.3);
  border-radius: 9px;
  color: var(--welcome-gold);
  background: #0b192d;
  font: inherit;
  font-size: 0.74rem;
  font-weight: 650;
}

.gift-trigger:disabled {
  color: #65748a;
  opacity: 0.7;
}

.gift-sheet-layer {
  position: absolute;
  z-index: 60;
  inset: 0;
  display: grid;
  align-items: end;
}

.gift-sheet-scrim {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.62);
}

.gift-sheet {
  position: relative;
  z-index: 1;
  padding: 16px 14px max(16px, env(safe-area-inset-bottom));
  border: 1px solid var(--welcome-line-strong);
  border-radius: 18px 18px 0 0;
  background: #07111f;
  box-shadow: 0 -24px 70px rgba(0, 0, 0, 0.52);
  animation: welcome-sheet-in 220ms ease-out both;
}

.gift-sheet__heading {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.gift-sheet__heading button {
  min-width: 44px;
  min-height: 44px;
  border: 0;
  color: var(--welcome-secondary);
  background: transparent;
}

.gift-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.program-panel,
.archive-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 12px;
  overflow: hidden;
}

.program-list {
  min-height: 0;
  display: grid;
  align-content: center;
  gap: 0;
}

.program-row {
  min-height: 76px;
  padding: 10px 2px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(159, 186, 226, 0.18);
}

.program-row > span {
  color: var(--welcome-blue);
}

.program-row small {
  display: block;
  margin-bottom: 4px;
}

.program-row h3 {
  margin: 0;
  color: var(--welcome-text);
  font-size: 1rem;
  font-weight: 560;
}

.program-row > strong {
  color: var(--welcome-secondary);
  font-size: 0.68rem;
  font-weight: 560;
}

.program-next {
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid rgba(159, 186, 226, 0.16);
  font-size: 0.74rem;
}

.archive-panel {
  overflow-y: auto;
  scrollbar-width: thin;
}

.portal .archive-card {
  --card-background: rgba(6, 15, 27, 0.96);
  --card-border-color: var(--welcome-line);
  --card-border-top: 1px solid var(--welcome-line-strong);
  --card-color: var(--welcome-text);
  --card-radius: 14px;
  --card-shadow: none;
}

.archive-card dl {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.archive-card dl div {
  padding-bottom: 10px;
  border-color: rgba(159, 186, 226, 0.16);
  border-bottom: 1px solid rgba(159, 186, 226, 0.16);
}

.archive-card dt {
  color: var(--welcome-tertiary);
}

.archive-card dd {
  margin: 4px 0 0;
  color: var(--welcome-text);
  font-family: var(--font-family-mono);
}

.capsule-message {
  margin-top: 16px;
  padding: 14px;
  border-left: 2px solid var(--welcome-gold);
  background: rgba(255, 215, 154, 0.06);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@keyframes welcome-star-breathe {
  0%, 100% { opacity: 0.78; transform: scale(0.92); }
  50% { opacity: 1; transform: scale(1.08); }
}

@keyframes welcome-sheet-in {
  from { transform: translateY(12px); }
  to { transform: translateY(0); }
}

@keyframes arrival-star-enter {
  from { opacity: 0; transform: translate3d(-46vw, 24vh, 0) scale(0.55); }
  64% { opacity: 1; transform: translate3d(0, 0, 0) scale(1.28); }
  to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}

@keyframes arrival-wave {
  from { opacity: 0.58; transform: scale(0.25); }
  to { opacity: 0; transform: scale(6.5); }
}

@keyframes arrival-path-form {
  from { opacity: 0; transform: rotate(-16deg) scaleX(0.2); }
  to { opacity: 1; transform: rotate(-16deg) scaleX(1); }
}

@keyframes arrival-copy-in {
  to { opacity: 1; transform: translateY(0); }
}

@media (max-height: 760px) {
  .temperature-selection {
    grid-template-rows: auto minmax(100px, 1fr) auto;
    gap: 5px;
  }

  .temperature-copy {
    padding-top: 4px;
  }

  .temperature-copy > p:last-child {
    margin-top: 5px;
    line-height: 1.4;
  }

  .temperature-control {
    padding: 10px 12px;
  }

  .portal--active {
    grid-template-rows: auto 44px 46px 42px 40px auto minmax(0, 1fr);
    gap: 3px;
  }

  .compact-stages {
    height: 46px;
  }

  .compact-stages li.current em {
    display: none;
  }

  .scene-panel {
    gap: 5px;
  }

  .scene-canvas {
    min-height: 58px;
  }

  .task-surface {
    padding-block: 9px;
  }
}

@media (min-width: 700px) {
  .portal {
    border-inline: 1px solid rgba(159, 186, 226, 0.12);
    background: rgba(2, 5, 12, 0.24);
  }
}

@media (prefers-reduced-motion: reduce) {
  .entry-star span,
  .temperature-star,
  .arrival-transition__path,
  .arrival-transition__wave,
  .arrival-transition__star,
  .arrival-transition__copy,
  .personal-star__core,
  .gift-sheet {
    animation: none;
  }
}
</style>
