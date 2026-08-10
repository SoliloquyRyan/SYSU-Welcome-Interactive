<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import BaseCard from '../../components/ui/BaseCard.vue'
import StatusPill from '../../components/ui/StatusPill.vue'
import { useRealtime } from '../../composables/useRealtime'
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

const stageNames = ['身份激活', '未来寄语', '星星集结', '节目应援', '协同点亮', '星际档案']
const tabs = [
  { id: 'scene', label: '现场' },
  { id: 'programs', label: '节目' },
  { id: 'archive', label: '档案' },
]

const entryState = ref('checking')
const invitationToken = ref(null)
const snapshot = ref(null)
const activeTab = ref('scene')
const displayName = ref('')
const demoCode = ref('')
const futureMessage = ref('')
const barrageText = ref('')
const publicNoticeAccepted = ref(false)
const busy = ref('')
const formError = ref('')
const successMessage = ref('')
const serviceNotice = ref('')
const activationKey = ref(null)
const futureMessageKey = ref(null)
const starKey = ref(null)
const lightKey = ref(null)
const barrageKey = ref(null)
const giftKeys = new Map()
let sessionGeneration = 0

const isActive = computed(() => entryState.value === 'active' && Boolean(snapshot.value))
const runtime = computed(() => snapshot.value?.runtime ?? null)
const participant = computed(() => snapshot.value?.participant ?? null)
const stage = computed(() => runtime.value?.stage ?? 1)
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
  futureMessage.value = ''
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
  snapshot.value = next
  futureMessage.value = next.participant.futureMessage ?? ''
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

async function saveFutureMessage() {
  formError.value = ''
  successMessage.value = ''
  if (visibleLength(futureMessage.value) < 1 || visibleLength(futureMessage.value) > 80) {
    formError.value = '寄语需要 1–80 个可见字符。'
    return
  }
  busy.value = 'message'
  const wasSaved = participant.value.futureMessageSaved
  futureMessageKey.value ??= createIdempotencyKey()
  try {
    await participantApi.saveFutureMessage(
      { ...commandVersion(snapshot.value), text: futureMessage.value.trim() },
      futureMessageKey.value,
    )
    await refreshSnapshot()
    futureMessageKey.value = null
    successMessage.value = wasSaved
      ? '私密寄语已更新，仅你本人可在档案中查看。'
      : '私密寄语已保存，仅你本人可在档案中查看。'
  } catch (error) {
    if (isDefinitiveFailure(error)) futureMessageKey.value = null
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
  <section class="mobile-stage portal" aria-labelledby="welcome-title">
    <div class="page-heading">
      <div>
        <p class="eyebrow">NFC / QR · 本地 Demo</p>
        <h1 id="welcome-title">星际信标</h1>
      </div>
      <StatusPill v-if="isActive" :tone="connectionTone">{{ connectionLabel }}</StatusPill>
    </div>

    <p v-if="serviceNotice" class="inline-message warning" role="status">{{ serviceNotice }}</p>

    <BaseCard v-if="entryState === 'checking'" padding="lg" aria-live="polite">
      <h2>正在检查入口与会话</h2>
      <p>请稍候，页面不会把邀请令牌写入本地存储。</p>
    </BaseCard>

    <BaseCard v-else-if="entryState === 'activation'" padding="lg">
      <form class="form-stack" novalidate @submit.prevent="submitActivation">
        <div>
          <p class="eyebrow">01 · 身份激活</p>
          <h2>使用邀请函上的合成信息核验</h2>
          <p class="helper">本 Demo 只使用虚构姓名和六位 Demo 码，请勿填写真实个人信息。</p>
        </div>
        <label for="display-name">虚构姓名</label>
        <input
          id="display-name"
          v-model="displayName"
          name="displayName"
          autocomplete="off"
          maxlength="40"
          @input="resetActivationKey"
        />
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
        <p v-if="formError" class="inline-message danger" role="alert">{{ formError }}</p>
        <BaseButton type="submit" block :loading="busy === 'activation'">
          {{ busy === 'activation' ? '正在核验' : '进入现场' }}
        </BaseButton>
      </form>
    </BaseCard>

    <BaseCard v-else-if="entryState === 'missing'" padding="lg">
      <p class="eyebrow">入口已清除</p>
      <h2>请重新轻触邀请函或扫描二维码</h2>
      <p class="helper">为了保护入口信息，本页不会保存已从地址栏移除的邀请令牌。</p>
    </BaseCard>

    <template v-else-if="isActive">
      <div class="participant-bar">
        <div>
          <strong>{{ participant.displayName }}</strong>
          <span>星号 {{ participant.publicStarId }}</span>
        </div>
        <BaseButton variant="ghost" size="sm" :loading="busy === 'logout'" @click="logout">退出</BaseButton>
      </div>

      <div class="value-grid" aria-label="个人数值">
        <BaseCard padding="sm"><span>动力值</span><strong class="power">{{ participant.powerBalance }}</strong></BaseCard>
        <BaseCard padding="sm"><span>星光值</span><strong class="starlight">{{ participant.starlight }} / 100</strong></BaseCard>
      </div>

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

      <p v-if="runtime.status === 'PAUSED' || !realtime.canWrite.value" class="inline-message warning" role="status">
        {{ runtime.status === 'PAUSED' ? '现场互动已暂停；当前内容仍可查看。' : '正在恢复实时同步，暂时不能提交操作。' }}
      </p>
      <p v-if="formError" class="inline-message danger" role="alert">{{ formError }}</p>
      <p v-if="successMessage" class="inline-message success" role="status">{{ successMessage }}</p>

      <section v-if="activeTab === 'scene'" class="tab-panel" aria-labelledby="scene-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">当前任务 · {{ String(stage).padStart(2, '0') }}</p>
            <h2 id="scene-title">{{ stageNames[stage - 1] }}</h2>
          </div>
          <StatusPill :tone="runtimeRunning ? 'success' : 'warning'">{{ runtime.status }}</StatusPill>
        </div>

        <BaseCard v-if="stage <= 2" padding="md">
          <form class="form-stack" @submit.prevent="saveFutureMessage">
            <div>
              <h3>{{ stage === 1 ? '身份已激活，写给未来的自己' : '写给未来的自己' }}</h3>
              <p class="helper">正文最多 80 个可见字符，仅进入你的个人档案，永不公开。</p>
            </div>
            <label for="future-message">私密未来寄语</label>
            <textarea
              id="future-message"
              v-model="futureMessage"
              maxlength="160"
              rows="4"
              @input="futureMessageKey = null"
            ></textarea>
            <span class="counter">{{ visibleLength(futureMessage) }} / 80</span>
            <BaseButton
              type="submit"
              block
              :disabled="!messageWritesAllowed"
              :loading="busy === 'message'"
            >
              {{ participant.futureMessageSaved ? '更新私密寄语' : '保存私密寄语' }}
            </BaseButton>
          </form>
        </BaseCard>

        <BaseCard v-else-if="stage === 3" padding="md">
          <h3>启动你的匿名星星</h3>
          <p>星星外观由稳定种子生成，多设备看到的结果保持一致。</p>
          <BaseButton
            block
            :disabled="!interactionWritesAllowed || participant.starStarted"
            :loading="busy === 'star'"
            @click="startStar"
          >
            {{ participant.starStarted ? '星星已启动' : '启动我的星星' }}
          </BaseButton>
        </BaseCard>

        <BaseCard v-else-if="stage === 4" padding="md">
          <h3>当前节目：{{ currentProgram?.title ?? '等待主控选择' }}</h3>
          <p>前往节目页送出虚拟礼物或匿名弹幕；不涉及支付、充值或兑换。</p>
          <BaseButton block @click="activeTab = 'programs'">打开节目互动</BaseButton>
        </BaseCard>

        <BaseCard v-else-if="stage === 5" padding="md">
          <h3>全场协同点亮</h3>
          <p>每位参与者最多完成一次，重复点击或刷新不会重复计分。</p>
          <BaseButton
            block
            :disabled="!interactionWritesAllowed || participant.cooperativeLightCompleted"
            :loading="busy === 'light'"
            @click="cooperativeLight"
          >
            {{ participant.cooperativeLightCompleted ? '点亮已完成' : '参与全场点亮' }}
          </BaseButton>
        </BaseCard>

        <BaseCard v-else padding="md">
          <h3>你的星际档案已经开放</h3>
          <p>档案只向当前参与者会话展示，不进入公共大屏。</p>
          <BaseButton block @click="activeTab = 'archive'">查看个人档案</BaseButton>
        </BaseCard>

        <ol class="compact-stages" aria-label="六阶段进度">
          <li v-for="(name, index) in stageNames" :key="name" :class="{ current: stage === index + 1 }">
            <span>{{ index + 1 }}</span>{{ name }}
          </li>
        </ol>
      </section>

      <section v-else-if="activeTab === 'programs'" class="tab-panel" aria-labelledby="program-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">节目应援</p>
            <h2 id="program-title">当前与下一节目</h2>
          </div>
          <StatusPill :tone="stage === 4 && runtimeRunning ? 'success' : 'warning'">
            {{ stage === 4 && runtimeRunning ? '互动开放' : '只读' }}
          </StatusPill>
        </div>

        <div class="program-list">
          <BaseCard v-for="program in snapshot.programs" :key="program.id" padding="md">
            <div class="program-heading">
              <div><small>{{ program.state }}</small><h3>{{ program.title }}</h3></div>
              <strong>热度 {{ program.heat }}</strong>
            </div>
            <div v-if="program.state === 'CURRENT'" class="gift-grid">
              <BaseButton
                v-for="gift in snapshot.gifts"
                :key="gift.id"
                variant="secondary"
                :disabled="!interactionWritesAllowed || stage !== 4 || busy.startsWith('gift:') || participant.powerBalance < gift.powerCost"
                :loading="busy === `gift:${gift.id}`"
                @click="sendGift(program.id, gift)"
              >
                {{ gift.name }} · {{ gift.powerCost }}
              </BaseButton>
            </div>
          </BaseCard>
        </div>

        <BaseCard padding="md">
          <form class="form-stack" @submit.prevent="sendBarrage">
            <div>
              <h3>发送匿名弹幕</h3>
              <p class="helper">通过敏感词、链接、联系方式、长度与频率规则后会立即公开展示。</p>
            </div>
            <label for="barrage-text">弹幕内容</label>
            <textarea
              id="barrage-text"
              v-model="barrageText"
              maxlength="120"
              rows="3"
              @input="barrageKey = null"
            ></textarea>
            <span class="counter">{{ visibleLength(barrageText) }} / 40</span>
            <label class="check-row">
              <input v-model="publicNoticeAccepted" type="checkbox" />
              <span>我知道这条内容会以匿名形式公开出现在现场大屏。</span>
            </label>
            <BaseButton
              type="submit"
              block
              :disabled="!interactionWritesAllowed || stage !== 4 || runtime.barragePaused"
              :loading="busy === 'barrage'"
            >
              {{ runtime.barragePaused ? '弹幕已暂停' : '匿名发送' }}
            </BaseButton>
          </form>
        </BaseCard>
        <p v-if="nextProgram" class="helper">下一节目：{{ nextProgram.title }}</p>
      </section>

      <section v-else class="tab-panel" aria-labelledby="archive-title">
        <div class="section-heading">
          <div><p class="eyebrow">本人可见</p><h2 id="archive-title">个人星际档案</h2></div>
          <StatusPill :tone="snapshot.archiveAvailable ? 'success' : 'info'">
            {{ snapshot.archiveAvailable ? '完整档案' : '成长中' }}
          </StatusPill>
        </div>
        <BaseCard padding="md" class="archive-card">
          <dl>
            <div><dt>星号</dt><dd>{{ participant.publicStarId }}</dd></div>
            <div><dt>动力值</dt><dd>{{ participant.powerBalance }}</dd></div>
            <div><dt>星光值</dt><dd>{{ participant.starlight }} / 100</dd></div>
            <div><dt>互动次数</dt><dd>{{ participant.interactionCount }}</dd></div>
            <div><dt>礼物次数</dt><dd>{{ participant.giftCount }}</dd></div>
            <div><dt>公开弹幕</dt><dd>{{ participant.publishedBarrageCount }}</dd></div>
          </dl>
          <div class="private-message">
            <strong>私密未来寄语</strong>
            <p>{{ participant.futureMessage ?? '尚未保存' }}</p>
          </div>
        </BaseCard>
      </section>
    </template>
  </section>
</template>

<style scoped>
.portal {
  display: block;
  width: min(760px, 100%);
}

.page-heading,
.section-heading,
.participant-bar,
.program-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.page-heading h1,
.section-heading h2,
.program-heading h3 {
  margin-bottom: 0;
}

h2,
h3,
p {
  overflow-wrap: anywhere;
}

h2 {
  margin: var(--space-2) 0 var(--space-4);
  font-size: clamp(1.65rem, 6vw, 2.45rem);
}

h3 {
  margin: 0 0 var(--space-3);
}

.helper,
.tab-panel p,
.participant-bar span,
.value-grid span {
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.form-stack {
  display: grid;
  gap: var(--space-3);
}

label {
  font-weight: var(--font-weight-semibold);
}

input,
textarea {
  width: 100%;
  min-height: 48px;
  padding: 12px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  background: var(--color-paper-100);
  font: inherit;
}

textarea {
  resize: vertical;
}

input:focus-visible,
textarea:focus-visible {
  outline: 3px solid var(--color-brand-primary);
  outline-offset: 2px;
}

.inline-message {
  margin: var(--space-4) 0;
  padding: 12px 14px;
  border-left: 5px solid currentColor;
  background: var(--color-paper-100);
  line-height: 1.5;
}

.inline-message.warning { color: var(--color-warning); }
.inline-message.danger { color: var(--color-danger); }
.inline-message.success { color: var(--color-success); }

.participant-bar {
  margin-top: var(--space-6);
  padding-block: var(--space-3);
  border-block: 1px solid var(--color-border-subtle);
}

.participant-bar div {
  display: grid;
  gap: 2px;
}

.value-grid {
  margin: var(--space-4) 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.value-grid :deep(.base-card) {
  display: grid;
  gap: var(--space-2);
}

.value-grid strong {
  font-size: var(--font-size-xl);
}

.power { color: var(--color-power); }
.starlight { color: var(--color-starlight); }

.portal-tabs {
  margin: var(--space-5) 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--color-border-strong);
}

.portal-tabs button {
  min-height: 48px;
  border: 0;
  border-right: 1px solid var(--color-border-strong);
  color: var(--color-text-primary);
  background: var(--color-paper-100);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.portal-tabs button:last-child { border-right: 0; }
.portal-tabs button[aria-current='page'] {
  color: var(--color-on-dark);
  background: var(--color-brand-primary);
}

.tab-panel,
.program-list {
  display: grid;
  gap: var(--space-4);
}

.section-heading {
  align-items: end;
}

.counter {
  justify-self: end;
  color: var(--color-text-secondary);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
}

.compact-stages {
  margin: var(--space-4) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: var(--color-border-subtle);
  list-style: none;
}

.compact-stages li {
  min-height: 52px;
  padding: 8px;
  display: grid;
  align-content: center;
  gap: 2px;
  background: var(--color-paper-100);
  font-size: var(--font-size-xs);
}

.compact-stages li.current {
  box-shadow: inset 5px 0 0 var(--color-brand-primary);
  font-weight: var(--font-weight-bold);
}

.compact-stages span {
  color: var(--color-brand-primary);
  font-family: var(--font-family-mono);
}

.program-heading {
  align-items: start;
}

.program-heading small {
  color: var(--color-brand-primary);
  font-family: var(--font-family-mono);
}

.gift-grid {
  margin-top: var(--space-4);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.check-row {
  min-height: 44px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: start;
  gap: var(--space-3);
  font-weight: var(--font-weight-regular);
  line-height: 1.5;
}

.check-row input {
  width: 22px;
  min-height: 22px;
  margin: 2px 0 0;
}

.archive-card dl {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.archive-card dl div {
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
}

.archive-card dt {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.archive-card dd {
  margin: var(--space-1) 0 0;
  font-weight: var(--font-weight-bold);
}

.private-message {
  margin-top: var(--space-5);
  padding: var(--space-4);
  border-left: 5px solid var(--color-starlight);
  background: var(--color-surface-soft);
}

@media (max-width: 560px) {
  .page-heading,
  .section-heading,
  .program-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .compact-stages,
  .archive-card dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
