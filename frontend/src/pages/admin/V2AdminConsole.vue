<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import ActionDialog from '../../components/ui/ActionDialog.vue'
import { useBuzzerCountdown } from '../../composables/useBuzzerCountdown'
import BaseButton from '../../components/ui/BaseButton.vue'
import BaseCard from '../../components/ui/BaseCard.vue'
import StatusPill from '../../components/ui/StatusPill.vue'
import V2ProgramCatalog from './V2ProgramCatalog.vue'
import V2AwardsConsole from './V2AwardsConsole.vue'
import { useV2AdminRealtime } from '../../composables/useV2AdminRealtime'
import { ApiError, createIdempotencyKey, publicErrorMessage, v2AdminApi } from '../../services/api'
import { adminSnapshotCanReplace, createAdminSessionGeneration } from './v2-admin-state'
import { interactionLabel } from '../../services/interaction-label'

const sceneLabels = {
  ASSEMBLY: '01 星海集结', PROGRAM_SUPPORT: '02 节目应援', COOPERATIVE_LIGHT: '03 协同点亮',
}
const warningLabels = {
  ONBOARDING_PENDING: '仍有人尚未完成个人入场',
  STAR_START_PENDING: '仍有准入者尚未启动恒星',
  COOPERATIVE_LIGHT_PENDING: '仍有准入者尚未完成协同点亮',
}
const statusLabels = { READY: '待开始', RUNNING: '运行中', PAUSED: '已暂停', COMPLETED: '已完成' }
const presentationLabels = {
  NONE: '无活动投影',
  RAFFLE: '上台观众抽取',
  FINALE_PREVIEW: '终章预演',
}

const protectedRuntime = import.meta.env.VITE_DATA_PROFILE === 'PROTECTED'

const actionRequest = ref(null)
let actionResolve = null
function askAction(message, input = false) {
  actionResolve?.(false)
  actionRequest.value = { message, input }
  return new Promise(resolve => { actionResolve = resolve })
}
function answerAction(value) {
  actionRequest.value = null
  actionResolve?.(value)
  actionResolve = null
}
onBeforeUnmount(() => answerAction(false))

const authState = ref('checking')
const username = ref(protectedRuntime ? 'event-admin' : 'demo-admin')
const password = ref('')
const snapshot = ref(null)
const busy = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const receiptMessage = ref('')
const selectedProgramId = ref('')
const catalogSavedSignal = ref(0)
const awardSavedSignal = ref(0)
const heatSavedSignal = ref(0)
const buzzerPrompt = ref('准备抢答')
const votePrompt = ref('谁是卧底 · 现场投票')
const sessionGeneration = createAdminSessionGeneration()

const runtime = computed(() => snapshot.value?.runtime)
const presentation = computed(() => snapshot.value?.presentation)
const presentationLabel = computed(() => (
  presentationLabels[presentation.value?.type] ?? '状态未知'
))
const raffle = computed(() => snapshot.value?.raffle)
const currentProgram = computed(() => snapshot.value?.currentProgram)
const currentInteractionCode = computed(() => currentProgram.value?.kind !== 'PERFORMANCE'
  && ['A', 'B', 'C'].includes(currentProgram.value?.displayCode) ? currentProgram.value.displayCode : null)
const liveInteraction = computed(() => snapshot.value?.liveInteraction ?? { phase: 'IDLE', voteCandidates: [], totalVotes: 0 })
const buzzerCountdown = useBuzzerCountdown(liveInteraction, computed(() => snapshot.value?.generatedAt))
const barrages = computed(() => snapshot.value?.publishedBarrages ?? [])
const canWrite = computed(() => realtime.state.value === 'online' && !busy.value)
const roleWrite = role => canWrite.value && snapshot.value?.roles.some(item => item === 'ALL' || item === role)
const canStageWrite = computed(() => roleWrite('STAGE_CONTROLLER'))
const canReviewWrite = computed(() => roleWrite('REVIEWER'))
const canDemoWrite = computed(() => roleWrite('DEMO_ADMIN'))

async function refresh(expectedGeneration = sessionGeneration.capture()) {
  try {
    const next = await v2AdminApi.snapshot()
    if (!sessionGeneration.isCurrent(expectedGeneration)) return snapshot.value
    if (!adminSnapshotCanReplace(snapshot.value, next)) return snapshot.value
    snapshot.value = next
    if (!selectedProgramId.value || !next.programs.some(({ id }) => id === selectedProgramId.value)) {
      selectedProgramId.value = next.currentProgram?.id ?? next.programs[0]?.id ?? ''
    }
    authState.value = 'active'
    return next
  } catch (error) {
    if (!sessionGeneration.isCurrent(expectedGeneration)) return snapshot.value
    if (error instanceof ApiError && error.code === 'AUTH_REQUIRED') {
      sessionGeneration.advance()
      snapshot.value = null
      authState.value = 'login'
      busy.value = ''
      successMessage.value = ''
      realtime.stop()
      return null
    }
    throw error
  }
}

const realtime = useV2AdminRealtime({ snapshot, refresh })

async function boot() {
  const ownGeneration = sessionGeneration.capture()
  try {
    const current = await refresh(ownGeneration)
    if (sessionGeneration.isCurrent(ownGeneration) && current) await realtime.connect()
  } catch (error) {
    if (!sessionGeneration.isCurrent(ownGeneration)) return
    authState.value = 'login'
    errorMessage.value = publicErrorMessage(error)
  }
}

async function login() {
  if (!username.value.trim() || !password.value) {
    errorMessage.value = protectedRuntime
      ? '请输入现场后台账号和密码。'
      : '请输入后台账号和密码。'
    return
  }
  const ownGeneration = sessionGeneration.advance()
  realtime.stop()
  busy.value = 'login'; errorMessage.value = ''; receiptMessage.value = ''
  try {
    const next = await v2AdminApi.login({ username: username.value.trim(), password: password.value })
    if (!sessionGeneration.isCurrent(ownGeneration)) return
    snapshot.value = next
    password.value = ''
    authState.value = 'active'
    successMessage.value = '已登录。'
    await realtime.connect()
  } catch (error) {
    if (sessionGeneration.isCurrent(ownGeneration)) errorMessage.value = error instanceof ApiError && error.code === 'AUTH_REQUIRED' ? '账号或密码不正确，请重新输入。' : publicErrorMessage(error)
  } finally {
    if (sessionGeneration.isCurrent(ownGeneration)) busy.value = ''
  }
}

async function logout() {
  const ownGeneration = sessionGeneration.advance()
  busy.value = 'logout'
  realtime.stop()
  try { await v2AdminApi.logout() } catch { /* local session still clears */ }
  if (!sessionGeneration.isCurrent(ownGeneration)) return
  snapshot.value = null; authState.value = 'login'; busy.value = ''; successMessage.value = ''; receiptMessage.value = ''
}

function base(command) {
  return { protocolVersion: '2', resetEpoch: snapshot.value.resetEpoch, idempotencyKey: createIdempotencyKey(), command }
}

// Authoritative success feedback: a 200 response alone does not prove the
// authoritative state changed (D-021 OBS-01/02 lesson). After the snapshot
// refresh, compare the revision family this command owns and echo it back.
const RUN_REVISION_COMMANDS = new Set(['START', 'ADVANCE', 'PAUSE', 'RESUME', 'COMPLETE'])
const PRESENTATION_COMMANDS = new Set(['PREVIEW_FINALE', 'CLEAR_PRESENTATION', 'OPEN_RAFFLE', 'DRAW_RAFFLE', 'CLOSE_RAFFLE', 'CLEAR_RAFFLE'])
const INTERACTION_COMMANDS = new Set(['UPDATE_PROGRAM_CATALOG', 'SET_PROGRAM', 'SET_PROGRAM_HEAT', 'SET_BARRAGE_PAUSED', 'REMOVE_BARRAGE', 'BLOCK_BARRAGE_SOURCE', 'CLEAR_BARRAGES', 'OPEN_BUZZER', 'OPEN_AUDIENCE_VOTE', 'REVEAL_AUDIENCE_VOTE', 'CLOSE_LIVE_INTERACTION'])

function revisionSnapshot() {
  return {
    run: runtime.value?.runRevision ?? null,
    presentation: snapshot.value?.presentationRevision ?? null,
    interaction: snapshot.value?.interaction?.interactionRevision ?? null,
    resetEpoch: snapshot.value?.resetEpoch ?? null,
  }
}

function feedbackSuffix(command, before, after, result) {
  const receipt = [
    result?.resetEpoch !== undefined ? `epoch=${result.resetEpoch}` : '',
    result?.runtime?.runRevision !== undefined ? `runRev=${result.runtime.runRevision}` : '',
    result?.presentationRevision !== undefined ? `presentRev=${result.presentationRevision}` : '',
    result?.interactionRevision !== undefined ? `interactRev=${result.interactionRevision}` : '',
  ].filter(Boolean).join(' ')
  let unchanged = ''
  if (RUN_REVISION_COMMANDS.has(command) && before.run !== null && after.run === before.run) {
    unchanged = '（注意：权威 runRevision 未变化，请刷新核对）'
  } else if (PRESENTATION_COMMANDS.has(command) && before.presentation !== null && after.presentation === before.presentation) {
    unchanged = '（注意：权威 presentationRevision 未变化，请刷新核对）'
  } else if (INTERACTION_COMMANDS.has(command) && before.interaction !== null && after.interaction === before.interaction) {
    unchanged = '（注意：权威 interactionRevision 未变化，请刷新核对）'
  }
  return { receipt, unchanged }
}

async function runCommand(body, success, allowOverride = false, confirmedWarnings = []) {
  const ownGeneration = sessionGeneration.capture()
  const before = revisionSnapshot()
  busy.value = body.command; errorMessage.value = ''; successMessage.value = ''; receiptMessage.value = ''
  const applySuccess = async (result) => {
    if (!sessionGeneration.isCurrent(ownGeneration)) return
    await refresh(ownGeneration)
    if (!sessionGeneration.isCurrent(ownGeneration)) return
    const suffix = feedbackSuffix(body.command, before, revisionSnapshot(), result)
    successMessage.value = `${success}${suffix.unchanged}`
    receiptMessage.value = suffix.receipt
  }
  try {
    const result = await v2AdminApi.command(body)
    await applySuccess(result)
    return result
  } catch (error) {
    if (!sessionGeneration.isCurrent(ownGeneration)) return
    if (allowOverride && error instanceof ApiError && error.code === 'READINESS_CONFIRMATION_REQUIRED') {
      const warnings = error.details?.warnings ?? snapshot.value.readinessWarnings
      const alreadyConfirmed = warnings.length > 0
        && warnings.every((item) => confirmedWarnings.includes(item))
      const accepted = alreadyConfirmed || await askAction(`现场就绪情况已更新：${warnings.map((item) => warningLabels[item] ?? item).join('；')}。\n仍然推进吗？`)
      if (accepted) {
        try {
          const result = await v2AdminApi.command({ ...body, idempotencyKey: createIdempotencyKey(), overrideReadinessWarnings: true })
          await applySuccess(result)
        } catch (overrideError) {
          if (sessionGeneration.isCurrent(ownGeneration)) {
            errorMessage.value = publicErrorMessage(overrideError)
          }
        }
      }
    } else errorMessage.value = publicErrorMessage(error)
  } finally {
    if (sessionGeneration.isCurrent(ownGeneration)) busy.value = ''
  }
}

async function setMode(mode) {
  if (!await askAction(`确认切换为${mode === 'LIVE' ? '现场' : '排练'}模式？`)) return
  return runCommand({ ...base('SET_MODE'), expectedRunRevision: runtime.value.runRevision, targetMode: mode, confirmed: true }, '模式已更新。')
}
async function start() {
  if (!await askAction('确认开始并进入“星海集结”？')) return
  return runCommand({ ...base('START'), expectedRunRevision: runtime.value.runRevision, confirmed: true }, '全场已开始。')
}
function setScene(scene) {
  return runCommand({ ...base('SET_SCENE'), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, targetScene: scene, confirmed: true }, '排练场景已切换。')
}
function setProgram() {
  if (!selectedProgramId.value) return
  return runCommand({
    ...base('SET_PROGRAM'),
    expectedRunRevision: runtime.value.runRevision,
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    programId: selectedProgramId.value,
    confirmed: true,
  }, '当前节目已更新。')
}
function selectProgram(id) {
  selectedProgramId.value = id
  return setProgram()
}
async function ceremonyCommand(body) {
  if (body.command === 'REVEAL_AWARD' && !await askAction('确定向大屏揭晓当前获奖名单？')) return
  const result = await runCommand({ ...base(body.command), expectedRunRevision: runtime.value.runRevision, ...body }, body.command === 'SET_PROGRAM_HEAT' ? '节目动力值已更新。' : '舞台已更新。')
  if (result && body.command === 'SAVE_AWARD') awardSavedSignal.value++
  if (result && body.command === 'SET_PROGRAM_HEAT') heatSavedSignal.value++
}
async function applyProgramCatalog({ catalog, expectedCatalogRevision }) {
  const ownGeneration = sessionGeneration.capture()
  const result = await runCommand({
    ...base('UPDATE_PROGRAM_CATALOG'), expectedRunRevision: runtime.value.runRevision,
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    expectedCatalogRevision, catalog, confirmed: true,
  }, `节目目录已应用，共 ${catalog.items.length} 项。`)
  if (result && sessionGeneration.isCurrent(ownGeneration)) catalogSavedSignal.value += 1
}
async function confirmProgress(command, message, success) {
  const warnings = [...snapshot.value.readinessWarnings]
  const body = { ...base(command), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, confirmed: true, overrideReadinessWarnings: false }
  const warningText = warnings.length
    ? `\n${warnings.map((item) => warningLabels[item] ?? item).join('；')}。确认即表示知悉这些未完成项并继续。`
    : ''
  if (!await askAction(`${message}${warningText}`)) return
  // Recheck warnings at the server; only the displayed warnings can reuse
  // this confirmation. New warnings still require an explicit decision.
  return runCommand(body, success, true, warnings)
}
function advance() {
  const next = snapshot.value.programs.find(({ state }) => state === 'NEXT')
  const message = runtime.value.currentScene === 'PROGRAM_SUPPORT'
    ? `确认结束节目应援并进入协同点亮？进入后不能回到节目。${next ? `目录中接下来还有“${next.title}”，如需换节目请使用“切换到下一项”。` : ''}`
    : '确认结束星海集结并进入节目应援？'
  return confirmProgress('ADVANCE', message, '已推进到下一场景。')
}
function pause() { return runCommand({ ...base('PAUSE'), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, confirmed: true }, '全场已暂停。') }
function resume() { return runCommand({ ...base('RESUME'), expectedRunRevision: runtime.value.runRevision, confirmed: true }, '全场已恢复。') }
function previewFinale() { return runCommand({ ...base('PREVIEW_FINALE'), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, confirmed: true }, '终章预览已打开。') }
function complete() {
  return confirmProgress('COMPLETE', '这是不可逆操作。确认结束活动并锁定终章？', '活动已完成并锁定终章。')
}
function clearPresentation() { return runCommand({ ...base('CLEAR_PRESENTATION'), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, confirmed: true }, '活动投影已清除。') }
function raffleCommand(command, success) {
  return runCommand({ ...base(command), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, confirmed: true }, success)
}
function openRaffle() { return raffleCommand('OPEN_RAFFLE', '上台观众抽取大屏已开启。') }
function drawRaffle() { return raffleCommand('DRAW_RAFFLE', '已抽出一位上台观众，大屏将按顺序揭晓。') }
function closeRaffle() { return raffleCommand('CLOSE_RAFFLE', '观众抽取大屏已关闭，候选记录已保留。') }
async function clearRaffle() {
  if (!await askAction('确认清空本轮全部上台观众记录？此操作仅用于排练。')) return
  return raffleCommand('CLEAR_RAFFLE', '排练观众抽取记录已清空。')
}
function liveCommand(command, payload, success) {
  return runCommand({
    ...base(command),
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    ...payload,
    confirmed: true,
  }, success)
}
function openBuzzer() {
  if (!['A', 'C'].includes(currentInteractionCode.value)) return
  const defaultPrompt = currentInteractionCode.value === 'A' ? '歌名 decoder · 立即抢答' : '谁是最“人” · 立即抢答'
  return liveCommand('OPEN_BUZZER', {
    segmentCode: currentInteractionCode.value,
    prompt: buzzerPrompt.value.trim() || defaultPrompt,
  }, `${interactionLabel(currentInteractionCode.value)}抢答已开放。`)
}
function openAudienceVote() {
  return liveCommand('OPEN_AUDIENCE_VOTE', { prompt: votePrompt.value.trim() || '谁是卧底 · 现场投票' }, '互动环节二 的观众投票已开放。')
}
function revealAudienceVote() {
  return liveCommand('REVEAL_AUDIENCE_VOTE', {}, '投票结果已在大屏揭晓。')
}
function closeLiveInteraction() {
  return liveCommand('CLOSE_LIVE_INTERACTION', {}, '本轮互动已关闭。')
}
function setBarragePaused(paused) {
  return runCommand({
    ...base('SET_BARRAGE_PAUSED'),
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    paused,
  }, paused ? '新弹幕发布已暂停。' : '新弹幕发布已恢复。')
}
async function removeBarrage(item) {
  const reason = await askAction('撤下这条弹幕', true)
  if (!reason) return
  return runCommand({
    ...base('REMOVE_BARRAGE'),
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    barrageId: item.barrageId,
    reason,
    confirmed: true,
  }, '弹幕已从大屏撤下。')
}
async function blockBarrageSource(item) {
  const reason = await askAction('屏蔽此来源，后续将不能发送弹幕', true)
  if (!reason) return
  if (!await askAction('确认屏蔽该星号来源并撤下它当前仍显示的弹幕？')) return
  return runCommand({
    ...base('BLOCK_BARRAGE_SOURCE'),
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    sourceId: item.sourceId,
    reason,
    confirmed: true,
  }, '该星号来源已屏蔽，相关公开弹幕已撤下。')
}
async function clearBarrages() {
  const reason = await askAction('清除当前公开弹幕', true)
  if (!reason) return
  if (!await askAction('确认清除当前全部公开弹幕？')) return
  return runCommand({
    ...base('CLEAR_BARRAGES'),
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    reason,
    confirmed: true,
  }, '公开弹幕已清屏。')
}
async function resetDemo() {
  if (!await askAction('确认清空本轮全部合成运行事实并建立新代际？此操作不可撤销。')) return
  return runCommand({ ...base('RESET_DEMO'), confirmation: 'RESET DEMO', syntheticDataConfirmed: true }, 'Demo 已重置，管理会话已安全轮换。')
}

void boot()
</script>

<template>
  <section
    class="v2-admin"
    aria-labelledby="v2-admin-title"
    data-visual-palette="orbital-signal-spectrum"
    data-surface-role="operations"
  >
    <ActionDialog :request="actionRequest" @answer="answerAction" />
    <header class="v2-heading">
      <div><p>迎新之夜 · 2026</p><h1 id="v2-admin-title">现场控制台</h1></div>
      <div class="v2-heading-actions">
        <StatusPill v-if="snapshot" :tone="realtime.state.value === 'online' ? 'success' : 'warning'">
          {{ realtime.state.value === 'online' ? '实时已连接' : '正在恢复同步' }}
        </StatusPill>
        <BaseButton v-if="snapshot" variant="secondary" :disabled="Boolean(busy)" @click="logout">退出</BaseButton>
      </div>
    </header>

    <div v-if="errorMessage || realtime.lastError.value || authState === 'active' && successMessage" class="feedback-stack">
      <p v-if="errorMessage || realtime.lastError.value" class="feedback error" role="alert">{{ errorMessage || realtime.lastError.value }}</p>
      <div v-else class="feedback success"><p role="status">{{ successMessage }}</p><details v-if="receiptMessage" class="receipt-details"><summary>操作回执</summary><code>{{ receiptMessage }}</code></details></div>
    </div>

    <BaseCard v-if="authState === 'checking'" padding="md"><p>正在连接控制台…</p></BaseCard>
    <BaseCard v-else-if="authState === 'login'" padding="lg" class="login-card">
      <h2>{{ protectedRuntime ? '现场后台登录' : '排练后台登录' }}</h2>
      <form class="login-form" @submit.prevent="login">
        <label>账号<input v-model="username" autocomplete="username" required :disabled="busy === 'login'"></label>
        <label>密码<input v-model="password" type="password" autocomplete="current-password" required :disabled="busy === 'login'"></label>
        <BaseButton type="submit" :loading="busy === 'login'">{{ busy === 'login' ? '登录中…' : '登录' }}</BaseButton>
      </form>
    </BaseCard>

    <template v-else-if="snapshot">

      <BaseCard padding="md" class="runtime-card">
        <div class="runtime-facts">
          <div><span>模式</span><strong>{{ runtime.mode === 'LIVE' ? '现场' : '排练' }}</strong></div>
          <div :data-status="runtime.status"><span>状态</span><strong>{{ statusLabels[runtime.status] }}</strong></div>
          <div><span>当前场景</span><strong>{{ runtime.currentScene ? sceneLabels[runtime.currentScene] : '尚未开始' }}</strong></div>
          <div :data-presentation="presentation.type"><span>活动投影</span><strong>{{ presentationLabel }}</strong></div>
        </div>
        <div class="control-actions">
          <template v-if="runtime.status === 'READY'">
            <BaseButton variant="secondary" :disabled="!canStageWrite" @click="setMode(runtime.mode === 'LIVE' ? 'REHEARSAL' : 'LIVE')">切换为{{ runtime.mode === 'LIVE' ? '排练' : '现场' }}</BaseButton>
            <BaseButton :disabled="!canStageWrite" @click="start">开始活动</BaseButton>
          </template>
          <template v-if="runtime.status === 'RUNNING'">
            <BaseButton variant="secondary" :disabled="!canStageWrite" @click="pause">暂停</BaseButton>
            <BaseButton v-if="runtime.mode === 'LIVE' && runtime.currentScene !== 'COOPERATIVE_LIGHT'" :disabled="!canStageWrite" @click="advance">推进下一场景</BaseButton>
            <BaseButton v-if="runtime.mode === 'REHEARSAL'" v-for="scene in Object.keys(sceneLabels)" :key="scene" variant="secondary" :disabled="!canStageWrite || scene === runtime.currentScene" @click="setScene(scene)">{{ sceneLabels[scene] }}</BaseButton>
            <BaseButton v-if="runtime.mode === 'REHEARSAL' && runtime.currentScene === 'COOPERATIVE_LIGHT' && presentation.type === 'NONE'" :disabled="!canStageWrite" @click="previewFinale">预览终章</BaseButton>
            <BaseButton v-if="runtime.mode === 'LIVE' && runtime.currentScene === 'COOPERATIVE_LIGHT'" variant="danger" :disabled="!canStageWrite" @click="complete">结束并锁定终章</BaseButton>
          </template>
          <BaseButton v-if="runtime.status === 'PAUSED'" :disabled="!canStageWrite" @click="resume">恢复运行</BaseButton>
          <BaseButton v-if="presentation.type !== 'NONE' && runtime.status !== 'COMPLETED'" variant="secondary" :disabled="!canWrite" @click="clearPresentation">清除当前投影</BaseButton>
        </div>
      </BaseCard>

      <V2ProgramCatalog :snapshot="snapshot" :can-write="canWrite" :saved-signal="catalogSavedSignal"
        @select="selectProgram" @apply="applyProgramCatalog" />

      <BaseCard v-if="currentInteractionCode || liveInteraction.phase !== 'IDLE'" padding="md" class="live-control-card" :data-interaction="currentInteractionCode || 'NONE'">
        <div class="panel-heading">
          <div>
            <p class="interaction-code">{{ currentInteractionCode ? interactionLabel(currentInteractionCode) : '现场互动' }}</p>
            <h2>现场互动</h2>
            <p v-if="currentInteractionCode">{{ currentProgram?.title }}</p>

          </div>
          <StatusPill :tone="liveInteraction.phase === 'IDLE' ? 'neutral' : liveInteraction.phase.endsWith('OPEN') ? 'warning' : 'success'">
            {{ liveInteraction.phase === 'IDLE' ? '互动待命' : liveInteraction.phase === 'BUZZER_OPEN' ? (buzzerCountdown ? '准备抢答' : '抢答开放') : liveInteraction.phase === 'BUZZER_LOCKED' ? '首位已锁定' : liveInteraction.phase === 'VOTE_OPEN' ? '投票开放' : '结果已揭晓' }}
          </StatusPill>
        </div>

        <section v-if="['A', 'C'].includes(currentInteractionCode)" class="interaction-operation" aria-labelledby="buzzer-heading">
          <div><h3 id="buzzer-heading">抢答</h3></div>
          <label>大屏提示<input v-model="buzzerPrompt" maxlength="120" :placeholder="currentInteractionCode === 'A' ? '歌名 decoder · 立即抢答' : '谁是最“人” · 立即抢答'"></label>
          <div class="control-actions">
            <BaseButton v-if="liveInteraction.phase === 'IDLE'" :disabled="!canStageWrite || runtime.status !== 'RUNNING' || presentation.type !== 'NONE'" @click="openBuzzer">开始抢答</BaseButton>
            <BaseButton v-else variant="secondary" :disabled="!canStageWrite" @click="closeLiveInteraction">关闭本轮互动</BaseButton>
          </div>
          <div v-if="liveInteraction.phase === 'BUZZER_LOCKED'" class="buzzer-result" role="status"><span>第一响应</span><strong>{{ liveInteraction.leader?.publicStarId }}</strong></div>
          <p v-else-if="liveInteraction.phase === 'BUZZER_OPEN'" class="open-notice" role="status">{{ buzzerCountdown ? `倒计时 ${buzzerCountdown}` : '抢答开放' }}</p>
        </section>

        <section v-else-if="currentInteractionCode === 'B'" class="interaction-operation" aria-labelledby="audience-heading">
          <div><h3 id="audience-heading">上台观众抽取与投票</h3><p>抽取 2–12 位观众后开放投票。</p></div>
          <div class="control-actions">
            <BaseButton v-if="presentation.type === 'NONE' && liveInteraction.phase === 'IDLE'" :disabled="!canStageWrite || !raffle?.remainingCount" @click="openRaffle">开启观众抽取</BaseButton>
            <BaseButton v-if="presentation.type === 'RAFFLE'" :disabled="!canStageWrite || !raffle?.remainingCount || (raffle?.winners.length ?? 0) >= 12" @click="drawRaffle">抽取一位</BaseButton>
            <BaseButton v-if="presentation.type === 'RAFFLE'" variant="secondary" :disabled="!canStageWrite" @click="closeRaffle">完成抽取</BaseButton>
            <BaseButton v-if="runtime.mode === 'REHEARSAL' && raffle?.winners.length && liveInteraction.phase === 'IDLE' && presentation.type === 'NONE'" variant="danger" :disabled="!canDemoWrite" @click="clearRaffle">清空排练结果</BaseButton>
          </div>
          <dl class="raffle-summary">
            <div><dt>可抽取观众</dt><dd>{{ raffle?.eligibleCount ?? 0 }}</dd></div>
            <div><dt>仍可抽取</dt><dd>{{ raffle?.remainingCount ?? 0 }}</dd></div>
            <div><dt>上台候选</dt><dd>{{ raffle?.winners.length ?? 0 }} / 12</dd></div>
          </dl>
          <p v-if="!raffle?.winners.length" class="quiet">还没有抽取上台观众。</p>
          <ol v-else class="winner-list" aria-label="已抽取的上台观众">
            <li v-for="item in raffle.winners.slice(0, 12)" :key="item.raffleDrawId"><span>候选 {{ item.drawSequence }}</span><strong>{{ item.displayName }}</strong><code>{{ item.publicStarId }}</code></li>
          </ol>
          <p v-if="presentation.type === 'RAFFLE'" class="quiet">大屏会逐位揭晓。请等最后一位展示完成，再点击「完成抽取」。</p>
          <div v-if="presentation.type === 'NONE' && raffle?.winners.length >= 2" class="vote-control">
            <label>投票标题<input v-model="votePrompt" maxlength="120" placeholder="谁是卧底 · 现场投票"></label>
            <div class="control-actions">
              <BaseButton v-if="liveInteraction.phase === 'IDLE'" :disabled="!canStageWrite || runtime.status !== 'RUNNING'" @click="openAudienceVote">开放观众投票</BaseButton>
              <BaseButton v-if="liveInteraction.phase === 'VOTE_OPEN'" :disabled="!canStageWrite" @click="revealAudienceVote">揭晓投票结果</BaseButton>
              <BaseButton v-if="['VOTE_OPEN', 'VOTE_REVEALED'].includes(liveInteraction.phase)" variant="secondary" :disabled="!canStageWrite" @click="closeLiveInteraction">关闭本轮互动</BaseButton>
            </div>
            <div v-if="liveInteraction.phase.startsWith('VOTE')" class="admin-vote-board">
              <p>已收到 <strong>{{ liveInteraction.totalVotes }}</strong> 票</p>
              <ul><li v-for="candidate in liveInteraction.voteCandidates" :key="candidate.publicStarId"><span>{{ candidate.publicStarId }}</span><i><b :style="{ transform: `scaleX(${liveInteraction.totalVotes ? (candidate.voteCount ?? 0) / liveInteraction.totalVotes : 0})` }"></b></i><strong>{{ candidate.voteCount ?? 0 }}</strong></li></ul>
            </div>
          </div>
        </section>


      </BaseCard>

      <V2AwardsConsole :snapshot="snapshot" :can-write="canWrite" :saved-signal="awardSavedSignal" :heat-saved-signal="heatSavedSignal" @command="ceremonyCommand" @select="selectProgram" />
      <details class="attendance-overview"><summary><strong>现场进度</strong><span>已入场 {{ snapshot.funnel.admittedCount }} · {{ snapshot.readinessWarnings.length ? `${snapshot.readinessWarnings.length} 项待确认` : '准备就绪' }}</span></summary>
        <div class="v2-grid">
        <BaseCard padding="md">
          <h2>入场进度</h2>
          <dl class="metrics">
            <div><dt>已激活</dt><dd>{{ snapshot.funnel.activatedCount }}</dd></div>
            <div><dt>已选星色</dt><dd>{{ snapshot.funnel.publicStarCount }}</dd></div>
            <div><dt>已入场</dt><dd>{{ snapshot.funnel.admittedCount }}</dd></div>
            <div><dt>待完成入场</dt><dd>{{ snapshot.funnel.onboardingPendingCount }}</dd></div>
            <div><dt>恒星已启动</dt><dd>{{ snapshot.funnel.starStartedCount }}</dd></div>
            <div><dt>协同点亮完成</dt><dd>{{ snapshot.funnel.cooperativeLightCount }}</dd></div>
          </dl>
        </BaseCard>
        <BaseCard padding="md">
          <h2>推进前检查</h2>
          <p v-if="!snapshot.readinessWarnings.length" class="quiet">准备就绪。</p>
          <ul v-else class="warning-list"><li v-for="warning in snapshot.readinessWarnings" :key="warning">{{ warningLabels[warning] }}</li></ul>

        </BaseCard>
      </div>
      </details>


      <BaseCard padding="md">
        <div class="panel-heading">
          <div>
            <h2>弹幕管理</h2>
            <p>撤下消息或屏蔽来源。</p>
          </div>
          <div class="control-actions">
            <BaseButton
              variant="secondary"
              :disabled="!canReviewWrite || runtime.status === 'COMPLETED'"
              @click="setBarragePaused(!snapshot.interaction.barragePaused)"
            >{{ snapshot.interaction.barragePaused ? '恢复新弹幕' : '暂停新弹幕' }}</BaseButton>
            <BaseButton variant="danger" :disabled="!canWrite || !barrages.length" @click="clearBarrages">公开弹幕清屏</BaseButton>
          </div>
        </div>
        <p v-if="snapshot.interaction.barragePaused" class="pause-notice" role="status">新弹幕已暂停。</p>
        <p v-if="!barrages.length" class="quiet">当前没有公开弹幕。</p>
        <ul v-else class="barrage-list">
          <li v-for="item in barrages" :key="item.barrageId">
            <div><p><strong>{{ item.publicStarId || '星号待同步' }}</strong> · {{ item.text }}</p><small>{{ new Date(item.publishedAt).toLocaleTimeString('zh-CN') }}</small></div>
            <div class="candidate-actions">
              <BaseButton variant="secondary" :disabled="!canReviewWrite" @click="removeBarrage(item)">撤下</BaseButton>
              <BaseButton variant="danger" :disabled="!canReviewWrite" @click="blockBarrageSource(item)">屏蔽来源</BaseButton>
            </div>
          </li>
        </ul>
      </BaseCard>
      <BaseCard v-if="!protectedRuntime" padding="md" class="danger-card">
        <details class="maintenance-details"><summary>排练数据管理</summary>
          <p class="quiet">重置将清空本轮合成运行记录并创建新场次，无法撤销。正式名单不能在此重置。</p>
          <BaseButton variant="danger" :disabled="!canDemoWrite" @click="resetDemo">重置合成 Demo</BaseButton>
        </details>
      </BaseCard>
    </template>
  </section>
</template>

<style scoped>
.v2-admin {
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: 0;
  display: grid;
  gap: var(--space-4);
}

.v2-admin :deep(.base-card) {
  overflow: hidden;
  backdrop-filter: none;
}

.v2-heading,
.v2-heading-actions,
.panel-heading,
.control-actions,
.candidate-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.v2-heading {
  min-height: 112px;
  align-items: end;
  padding: var(--space-3) 0 var(--space-2);
}

.v2-heading p,
.panel-heading p,
.quiet {
  color: var(--color-text-secondary);
}

.v2-heading p {
  margin: 0;
  color: var(--color-orbit-signal-soft);
  font-family: var(--font-family-signal);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.1em;
}

.v2-heading h1 {
  margin: var(--space-2) 0 0;
  color: var(--color-text-primary);
  font-family: var(--font-family-display);
  font-size: clamp(2.2rem, 4.2vw, 3.65rem);
  font-weight: 600;
  letter-spacing: 0.035em;
  line-height: 1.05;
}

.v2-heading-actions {
  justify-content: flex-end;
}

.login-card {
  width: min(480px, 100%);
  display: grid;
  gap: var(--space-4);
}

.login-card h2,
.v2-admin h2 {
  margin: 0;
  font-size: var(--font-size-xl);
  line-height: 1.3;
}

.login-card label {
  display: grid;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.login-card input,
.program-control select,
.interaction-operation input {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  outline: 0;
  color: var(--color-text-primary);
  background: color-mix(in srgb, var(--color-orbit-surface-1) 88%, transparent);
  font: inherit;
}

.login-card input:focus-visible,
.program-control select:focus-visible,
.interaction-operation input:focus-visible {
  border-color: var(--color-focus-ring);
  outline: 3px solid color-mix(in srgb, var(--color-focus-ring) 28%, transparent);
  outline-offset: 2px;
}

.feedback {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid currentColor;
  border-radius: var(--radius-md);
}

.error {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 11%, transparent);
}

.success {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 10%, transparent);
}

.runtime-card {
  position: relative;
  display: grid;
  gap: var(--space-4);
}

.runtime-card::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--color-orbit-signal), var(--color-orbit-cyan), transparent 82%);
  content: "";
}

.runtime-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.runtime-facts div,
.metrics div,
.raffle-summary div {
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-orbit-surface-3) 34%, transparent);
}

.runtime-facts span,
.metrics dt,
.raffle-summary dt {
  display: block;
  color: var(--color-text-tertiary);
  font-family: var(--font-family-signal);
  font-size: var(--font-size-xs);
  letter-spacing: 0.055em;
}

.runtime-facts strong {
  display: block;
  margin-top: 5px;
  overflow-wrap: anywhere;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}

.runtime-facts [data-status="RUNNING"] strong { color: var(--color-success); }
.runtime-facts [data-status="PAUSED"] strong { color: var(--color-warning); }
.runtime-facts [data-status="COMPLETED"] strong { color: var(--color-orbit-star); }
.runtime-facts [data-presentation="NONE"] strong { color: var(--color-text-secondary); }

.runtime-card > .control-actions {
  justify-content: flex-start;
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}

.v2-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.metrics {
  margin: var(--space-4) 0 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.metrics dd,
.raffle-summary dd {
  margin: 5px 0 0;
  font-family: var(--font-family-data);
  font-size: var(--font-size-xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.panel-heading {
  align-items: start;
}

.panel-heading > div:first-child {
  min-width: 0;
  flex: 1 1 320px;
}

.panel-heading p {
  max-width: 72ch;
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

.warning-list {
  display: grid;
  gap: var(--space-2);
  color: var(--color-warning);
}

.raffle-card {
  border-top-color: color-mix(in srgb, var(--color-orbit-warm) 70%, transparent);
}

.live-control-card {
  border-top-color: color-mix(in srgb, var(--color-orbit-cyan) 72%, transparent);
  background:
    radial-gradient(circle at 100% 0, color-mix(in srgb, var(--color-orbit-signal) 10%, transparent), transparent 38%),
    var(--color-surface-panel);
}

.interaction-code {
  margin: 0 0 var(--space-2) !important;
  color: var(--color-orbit-cyan) !important;
  font-family: var(--font-family-data);
  font-size: var(--font-size-xs) !important;
  font-weight: 700;
  letter-spacing: .18em;
}

.interaction-operation {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
}

.interaction-operation h3 {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-lg);
}

.interaction-operation p {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.interaction-operation > label,
.vote-control > label {
  display: grid;
  gap: var(--space-2);
  max-width: 680px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.interaction-operation input {
  width: 100%;
}

.buzzer-result,
.open-notice {
  padding: var(--space-4);
  border: 1px solid color-mix(in srgb, var(--color-orbit-cyan) 32%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-orbit-signal) 8%, transparent);
}

.buzzer-result {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-4);
}

.buzzer-result span,
.buzzer-result small {
  color: var(--color-text-secondary);
}

.buzzer-result strong {
  color: var(--color-orbit-warm);
  font-family: var(--font-family-data);
  font-size: clamp(1.6rem, 3vw, 2.8rem);
}

.vote-control {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid color-mix(in srgb, var(--color-orbit-warm) 22%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-orbit-warm) 5%, transparent);
}

.admin-vote-board > p strong {
  color: var(--color-orbit-warm);
  font-family: var(--font-family-data);
  font-size: var(--font-size-xl);
}

.admin-vote-board ul {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2) var(--space-4);
  margin: var(--space-3) 0 0;
  padding: 0;
  list-style: none;
}

.admin-vote-board li {
  display: grid;
  grid-template-columns: 112px minmax(60px, 1fr) 28px;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.admin-vote-board li > span,
.admin-vote-board li > strong {
  font-family: var(--font-family-data);
}

.admin-vote-board li > i {
  height: 5px;
  overflow: hidden;
  border-radius: 99px;
  background: var(--color-border-subtle);
}

.admin-vote-board li > i > b {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-orbit-signal), var(--color-orbit-warm));
  transform-origin: left;
  transition: transform var(--motion-duration-normal) var(--motion-ease-standard);
}

.interaction-empty {
  margin: var(--space-4) 0 0;
  padding: var(--space-4);
  border: 1px dashed var(--color-border-subtle);
  color: var(--color-text-secondary);
  text-align: center;
}

.raffle-summary {
  margin: var(--space-4) 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.raffle-summary div {
  border-color: color-mix(in srgb, var(--color-orbit-warm) 24%, transparent);
  background: color-mix(in srgb, var(--color-orbit-warm) 7%, transparent);
}

.winner-list,
.barrage-list {
  margin: var(--space-4) 0 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
  list-style: none;
}

.winner-list li,
.barrage-list li {
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-orbit-surface-3) 26%, transparent);
}

.winner-list li {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
}

.winner-list span,
.barrage-list small {
  color: var(--color-text-secondary);
}

.winner-list code {
  color: var(--color-orbit-warm);
  font-family: var(--font-family-data);
  font-size: var(--font-size-md);
}

.barrage-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.barrage-list li > div:first-child {
  min-width: 0;
}

.barrage-list p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.barrage-list small {
  display: block;
  margin-top: 5px;
}

.pause-notice {
  margin: var(--space-4) 0 0;
  padding: var(--space-3);
  border-left: 3px solid var(--color-warning);
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
}

.danger-card {
  border-color: color-mix(in srgb, var(--color-danger) 36%, transparent);
  border-left: 3px solid var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 5%, var(--color-surface-panel));
}

.program-control {
  display: flex;
  align-items: end;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.program-control label {
  display: grid;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.program-control select {
  min-width: min(360px, 72vw);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

@media (max-width: 900px) {
  .v2-grid { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
  .v2-heading {
    min-height: 0;
    align-items: start;
    padding-top: var(--space-2);
  }

  .v2-heading-actions {
    justify-content: flex-start;
  }

  .runtime-facts,
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .panel-heading {
    display: grid;
    justify-items: stretch;
  }

  .control-actions,
  .candidate-actions {
    justify-content: flex-start;
  }

  .program-control,
  .program-control label,
  .program-control select {
    width: 100%;
    min-width: 0;
  }

  .winner-list li {
    grid-template-columns: 80px minmax(0, 1fr);
  }

  .winner-list code,
  .candidate-actions {
    grid-column: 2;
  }

  .admin-vote-board ul { grid-template-columns: 1fr; }
  .buzzer-result { grid-template-columns: 1fr; }
}

@media (max-width: 420px) {
  .v2-admin { gap: var(--space-3); }
  .v2-heading h1 { font-size: 2.15rem; }
  .runtime-facts div,
  .metrics div,
  .raffle-summary div { padding: 10px; }
  .raffle-summary { gap: var(--space-2); }
  .barrage-list li { align-items: flex-start; flex-direction: column; }
}

/* D-099: keep show controls close; secondary operational evidence is expandable. */
.v2-admin{gap:18px;--radius-md:10px;--radius-sm:8px;--card-radius:18px;--card-border-top:1px solid #91b9e42b;--card-background:linear-gradient(145deg,#0e192cc7,#08111ec2);--card-shadow:0 12px 38px #00000014}
.v2-admin :deep(.base-card){backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.v2-heading{min-height:94px;padding-block:8px}.v2-heading h1{font-size:clamp(2rem,3.2vw,2.85rem);line-height:1.2;letter-spacing:.025em}
.v2-heading-actions{gap:10px}.v2-admin h2{font-size:1.08rem;font-weight:600}.login-card{max-width:440px;padding:26px}.login-form{display:grid;gap:18px}.login-form label{gap:8px}.login-form input{width:100%;box-sizing:border-box}.login-form>button{margin-top:4px}
.feedback-stack{position:relative;max-width:100%}.feedback{border-width:1px;background:#07111eee;box-shadow:0 10px 30px #0003;font-size:.88rem;line-height:1.6}.feedback p{margin:0}.receipt-details{margin-top:4px;font-size:.72rem;color:var(--color-text-secondary)}.receipt-details summary{cursor:pointer;min-height:28px;align-content:center}.receipt-details code{display:block;padding-block:4px;white-space:normal;overflow-wrap:anywhere}
.runtime-facts{gap:12px}.runtime-facts>div{padding:14px;border:0;background:#9bc4eb07}.runtime-card>.control-actions{gap:10px;justify-content:flex-start}.control-actions,.candidate-actions{justify-content:flex-start}.runtime-card>.control-actions>button:first-child{margin-right:6px}
.attendance-overview{border:1px solid #91b9e42b;border-radius:16px;background:#07122166;overflow:hidden}.attendance-overview>summary{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:15px 20px;min-height:48px;cursor:pointer;list-style:none}.attendance-overview>summary::after{content:'+';font-size:1.1rem;color:var(--color-text-secondary)}.attendance-overview[open]>summary::after{content:'−'}.attendance-overview>summary>span{margin-left:auto;color:var(--color-text-secondary);font-size:.8rem}.attendance-overview>summary>strong{font-size:.92rem;font-weight:500}.attendance-overview .v2-grid{gap:0;border-top:1px solid #91b9e41a}.attendance-overview :deep(.base-card){border:0;border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none}
.live-control-card{background:linear-gradient(145deg,#102034bd,#08111ec7)}.interaction-operation{gap:16px}.interaction-operation>.control-actions{justify-content:flex-start}.panel-heading{gap:14px}.panel-heading p{font-size:.8rem}.interaction-code{letter-spacing:.08em}.vote-control{padding:18px;background:#9fc5ef08;border-color:#91b9e42b}.winner-list li{background:#9dc5ed08}.buzzer-result,.open-notice{background:#75aef00b}.maintenance-details>summary{cursor:pointer;font-size:.9rem;font-weight:500;min-height:28px}.maintenance-details>p{margin:14px 0;line-height:1.7;font-size:.82rem}.danger-card{border-color:#d6887c36;background:#36202524}
.v2-admin summary:focus-visible{outline:2px solid var(--color-orbit-focus);outline-offset:4px}
@media(max-width:680px){.v2-admin{gap:14px}.v2-heading{align-items:center;gap:16px;padding-block:8px}.v2-heading-actions{width:100%;justify-content:space-between}.v2-admin :deep(.base-card){padding:18px}.runtime-facts{gap:8px}.runtime-facts>div{padding:10px}.runtime-facts strong{font-size:.9rem}.runtime-card>.control-actions>button{flex:1 1 130px;margin-right:0;white-space:normal;line-height:1.4;padding-block:10px}.panel-heading>.control-actions{width:100%}.panel-heading>.control-actions>button{flex:1 1 120px}.attendance-overview>summary{padding:13px 16px;flex-wrap:wrap;gap:6px}.attendance-overview>summary>span{font-size:.73rem}.feedback-stack{top:auto}.feedback{padding:10px 12px}.v2-admin .login-card{padding:22px}.interaction-operation input{box-sizing:border-box}.candidate-actions>button{flex:1;min-width:0}}

</style>
