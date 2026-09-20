<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import ActionDialog from '../../components/ui/ActionDialog.vue'
import { useBuzzerCountdown } from '../../composables/useBuzzerCountdown'
import BaseButton from '../../components/ui/BaseButton.vue'
import BaseCard from '../../components/ui/BaseCard.vue'
import StatusPill from '../../components/ui/StatusPill.vue'
import V2ProgramCatalog from './V2ProgramCatalog.vue'
import { programVisual } from '../../rendering/program-visuals'
import { createAdminWorkflow } from './admin-workflow'
import { watch } from 'vue'
import V2AwardsConsole from './V2AwardsConsole.vue'
import { useV2AdminRealtime } from '../../composables/useV2AdminRealtime'
import { ApiError, createIdempotencyKey, publicErrorMessage, v2AdminApi } from '../../services/api'
import { adminSnapshotCanReplace, createAdminSessionGeneration } from './v2-admin-state'
import { interactionLabel } from '../../services/interaction-label'

const sceneLabels = {
  ASSEMBLY: '01 星海集结', PROGRAM_SUPPORT: '02 节目应援', COOPERATIVE_LIGHT: '03 谢幕准备',
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
function askAction(message, input = false, labels = {}) {
  actionResolve?.(false)
  actionRequest.value = { message, input, ...labels }
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
const workflowBusy = ref('')
const workflowProgress = ref(null)
const workflow = createAdminWorkflow()
const startMode = ref(protectedRuntime ? 'LIVE' : 'REHEARSAL')
const errorMessage = ref('')
const successMessage = ref('')
const receiptMessage = ref('')
const selectedProgramId = ref('')
const activePanel = ref('programs')
const barragePage = ref(0)
const panelTabs = [{id:'programs',label:'节目'},{id:'interaction',label:'互动'},{id:'awards',label:'颁奖'},{id:'barrages',label:'弹幕'},{id:'manage',label:'管理'}]
const catalogSavedSignal = ref(0)
const awardSavedSignal = ref(0)
const heatSavedSignal = ref(0)
const buzzerPrompt = ref('准备抢答')
const audioTrackId = ref('b2-eason')
const audioBridge = ref({available:false,tracks:[],arm:null})
const selectedAudio = computed(() => audioBridge.value.tracks.find(t => t.trackId === audioTrackId.value && t.available))
let audioPollBusy = false
const audioPollTimer = setInterval(async () => {
  if (audioPollBusy || authState.value !== 'active') return
  audioPollBusy = true
  const generation = sessionGeneration.capture()
  try { const value = await v2AdminApi.audioStatus(); if(sessionGeneration.isCurrent(generation)) audioBridge.value = value }
  catch { audioBridge.value = {available:false,tracks:[],arm:null} }
  finally { audioPollBusy = false }
}, 800)
onBeforeUnmount(() => clearInterval(audioPollTimer))
const AUDIO_TRACKS = [
  { id: 'b2-eason', label: 'B2 · 陈奕迅 · mix', answer: '十年、爱情转移、红玫瑰' },
  { id: 'r2-jj', label: 'R2 · 林俊杰 · mix', answer: '江南、修炼爱情、可惜没如果、小酒窝' },
  { id: 'r3-gem', label: 'R3 · 邓紫棋 · mix', answer: '泡沫、倒数、句号' },
]
const selectedAudioAnswer = computed(() => selectedAudio.value?.answer
  ?? AUDIO_TRACKS.find(item => item.id === audioTrackId.value)?.answer
  ?? '答案索引未同步')
const votePrompt = ref('谁是卧底 · 现场投票')
const voteCandidateCount = ref(6)
const candidatePage=ref(0)
const voteLabels = ref(Array.from({ length: 12 }, (_, index) => `${index + 1}号选手`))
const draftCandidates = computed(() => voteLabels.value.slice(0, Math.max(2, Math.min(12, Number(voteCandidateCount.value) || 2))).map((label, index) => label.trim() || `${index + 1}号选手`))
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
const canWrite = computed(() => realtime.state.value === 'online' && !busy.value && !workflowBusy.value)
const nextProgram = computed(() => {
  const programs = snapshot.value?.programs ?? []
  const index = currentProgram.value ? programs.findIndex(item => item.id === currentProgram.value.id) : -1
  return index < 0 ? programs[0] ?? null : programs[index + 1] ?? null
})
const preparedProgram = computed(() => snapshot.value?.programs.find(item => item.id === selectedProgramId.value))
const canFinishInteraction = computed(() => canStageWrite.value && runtime.value?.status === 'RUNNING' && runtime.value?.currentScene === 'PROGRAM_SUPPORT'
  && presentation.value?.type === 'NONE' && ['BUZZER_LOCKED', 'VOTE_REVEALED'].includes(liveInteraction.value.phase) && Boolean(nextProgram.value))
watch(() => runtime.value?.mode, mode => { if (mode) startMode.value = mode })
const roleWrite = role => canWrite.value && snapshot.value?.roles.some(item => item === 'ALL' || item === role)
const canStageWrite = computed(() => roleWrite('STAGE_CONTROLLER'))
const canReviewWrite = computed(() => roleWrite('REVIEWER'))
const canDemoWrite = computed(() => roleWrite('DEMO_ADMIN'))

watch([() => currentProgram.value?.kind, currentInteractionCode], ([kind, code]) => {
  if (code) activePanel.value = 'interaction'
  else if (kind === 'AWARD') activePanel.value = 'awards'
  else if (kind === 'PERFORMANCE' || kind === 'SPEECH') activePanel.value = 'programs'
})

const canSelectProgram = computed(() => canStageWrite.value && runtime.value?.status === 'RUNNING' && runtime.value.currentScene === 'PROGRAM_SUPPORT' && presentation.value?.type === 'NONE' && liveInteraction.value.phase === 'IDLE')
const resetReason = computed(() => !snapshot.value?.roles.includes('ALL') ? '需要主控管理权限' : runtime.value?.status === 'RUNNING' ? '先暂停活动，再归档重置' : !canWrite.value ? '等待连接或当前操作完成' : '归档后全部人员重新入场，保留名单和配置')
const obsCue = computed(() => {
  const item=preparedProgram.value ?? currentProgram.value
  if (!item || item.kind!=='PERFORMANCE') return '对应节目背景；网页确认切换后，OBS 桥接自动同步对应场景。'
  return programVisual(item).mode==='overlay' ? '透明叠层：网页确认切换后，OBS 桥接自动同步对应场景；节目媒体仍按主持口令播放。' : '完整节目背景：网页确认切换后，OBS 桥接自动同步对应场景；现场音源按主持口令开始。'
})
const accountSummary=computed(()=>['STUDENT','STAFF','GUEST'].map(kind=>snapshot.value?.accountCounts.find(item=>item.kind===kind)??{kind,total:0,admitted:0}))
const barragePages=computed(()=>Math.max(1,Math.ceil(barrages.value.length/4)))
watch(barragePages,pages=>barragePage.value=Math.min(barragePage.value,pages-1))
let formalResetAttempt=null
async function resetRound() {
  if (!canWrite.value || !snapshot.value.roles.includes('ALL') || runtime.value.status==='RUNNING') return
  const epoch=snapshot.value.resetEpoch
  const answer=await askAction('先归档并校验本轮数据库，再清除入场、星色、送礼、弹幕和互动记录。保留名单、工作账号、节目与校园奖草稿；全部人员重新入场。\n请输入“重新开场”确认。',true,{title:'归档并重置本轮',inputLabel:'确认文字'})
  if(answer!=='重新开场'){if(answer)errorMessage.value='确认文字不匹配，未执行重置。';return}
  if(snapshot.value.resetEpoch!==epoch)return
  formalResetAttempt??={...base('RESET_FORMAL_ROUND'),expectedRunRevision:runtime.value.runRevision,confirmation:'重新开场'}
  const result=await runCommand(formalResetAttempt,'旧轮次已归档，新轮次等待开始。全部人员需重新入场。')
  if(result?.ok){formalResetAttempt=null;activePanel.value='manage';await realtime.connect()}
  else if(result?.error instanceof ApiError && result.error.status>=400 && result.error.status<500) formalResetAttempt=null
}
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
const INTERACTION_COMMANDS = new Set(['UPDATE_PROGRAM_CATALOG', 'SET_PROGRAM', 'ADVANCE_PROGRAM', 'SET_PROGRAM_HEAT', 'SET_BARRAGE_PAUSED', 'REMOVE_BARRAGE', 'BLOCK_BARRAGE_SOURCE', 'CLEAR_BARRAGES', 'OPEN_BUZZER', 'ARM_AUDIO_BUZZER', 'MARK_BUZZER_WRONG', 'OPEN_AUDIENCE_VOTE', 'REVEAL_AUDIENCE_VOTE', 'CLOSE_LIVE_INTERACTION'])

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
  if (!workflowBusy.value) workflowProgress.value = null
  const ownGeneration = sessionGeneration.capture()
  const before = revisionSnapshot()
  busy.value = body.command; errorMessage.value = ''; successMessage.value = ''; receiptMessage.value = ''
  const applySuccess = async (result) => {
    if (!sessionGeneration.isCurrent(ownGeneration)) return { ok: false }
    await refresh(ownGeneration)
    if (!sessionGeneration.isCurrent(ownGeneration) || !snapshot.value) return { ok: false }
    const suffix = feedbackSuffix(body.command, before, revisionSnapshot(), result)
    successMessage.value = success + suffix.unchanged
    receiptMessage.value = suffix.receipt
    return { ok: true, result, snapshot: snapshot.value }
  }
  try {
    return await applySuccess(await v2AdminApi.command(body))
  } catch (error) {
    if (!sessionGeneration.isCurrent(ownGeneration)) return { ok: false }
    if (allowOverride && error instanceof ApiError && error.code === 'READINESS_CONFIRMATION_REQUIRED') {
      const warnings = error.details?.warnings ?? snapshot.value.readinessWarnings
      const alreadyConfirmed = warnings.length > 0 && warnings.every(item => confirmedWarnings.includes(item))
      const accepted = alreadyConfirmed || await askAction('现场就绪情况已更新：' + warnings.map(item => warningLabels[item] ?? item).join('；') + '。仍然推进吗？')
      if (accepted) {
        try { return await applySuccess(await v2AdminApi.command({ ...body, idempotencyKey: createIdempotencyKey(), overrideReadinessWarnings: true })) }
        catch (overrideError) { if (sessionGeneration.isCurrent(ownGeneration)) errorMessage.value = publicErrorMessage(overrideError) }
      }
    } else errorMessage.value = publicErrorMessage(error)
    return { ok: false, error }
  } finally { if (sessionGeneration.isCurrent(ownGeneration)) busy.value = '' }
}

async function setMode(mode) {
  if (!await askAction(`确认切换为${mode === 'LIVE' ? '现场' : '排练'}模式？`)) return
  return runCommand({ ...base('SET_MODE'), expectedRunRevision: runtime.value.runRevision, targetMode: mode, confirmed: true }, '模式已更新。')
}
async function start() {
  if (!canStageWrite.value || runtime.value.status !== 'READY') return
  const targetMode = startMode.value, epoch = snapshot.value.resetEpoch
  if (!await askAction('以' + (targetMode === 'LIVE' ? '现场' : '排练') + '模式开始活动并显示晚会报幕背景？')) return
  if (!canStageWrite.value || snapshot.value.resetEpoch !== epoch) return
  const ready = s => s.runtime.status === 'READY' && s.runtime.currentScene === null
  const steps = []
  if (runtime.value.mode !== targetMode) steps.push({ label: '设置开始模式', canRun: ready,
    build: s => ({ ...base('SET_MODE'), expectedRunRevision: s.runtime.runRevision, targetMode, confirmed: true }),
    matches: s => ready(s) && s.runtime.mode === targetMode })
  steps.push({ label: '开始活动', canRun: s => ready(s) && s.runtime.mode === targetMode,
    build: s => ({ ...base('START'), expectedRunRevision: s.runtime.runRevision, confirmed: true }),
    matches: s => s.runtime.mode === targetMode && s.runtime.status === 'RUNNING' && s.runtime.currentScene === 'PROGRAM_SUPPORT' })
  await runWorkflow('开始活动', steps)
}

async function runWorkflow(name, steps) {
  if (workflowBusy.value || busy.value || realtime.state.value !== 'online') return
  const generation = sessionGeneration.capture()
  workflowBusy.value = name
  try {
    const result = await workflow.run({ steps, read: () => snapshot.value,
      isCurrent: () => sessionGeneration.isCurrent(generation) && realtime.state.value === 'online',
      execute: (body, label) => runCommand(body, label + '已完成。'),
      onProgress: progress => { if (sessionGeneration.isCurrent(generation)) workflowProgress.value = progress },
    })
    if (!result.ok && sessionGeneration.isCurrent(generation)) await refresh(generation).catch(() => {})
  } finally { workflowBusy.value = '' }
}

async function finishInteractionAndNext() {
  if (!canFinishInteraction.value) return
  const source = currentProgram.value.id, target = nextProgram.value.id, title = nextProgram.value.title, epoch = snapshot.value.resetEpoch
  if (!await askAction('收起已完成的互动，并将当前节目切换为“' + title + '”？网页确认后 OBS 桥接会自动同步对应场景。')) return
  if (!canFinishInteraction.value || snapshot.value.resetEpoch !== epoch) return
  const same = s => s.runtime.status === 'RUNNING' && s.runtime.currentScene === 'PROGRAM_SUPPORT'
    && s.presentation.type === 'NONE' && s.currentProgram?.id === source && s.programs.find(item => item.state === 'NEXT')?.id === target
  await runWorkflow('进入下一项', [
    { label: '收起互动结果', canRun: s => same(s) && ['BUZZER_LOCKED', 'VOTE_REVEALED'].includes(s.liveInteraction.phase),
      build: s => ({ ...base('CLOSE_LIVE_INTERACTION'), expectedInteractionRevision: s.interaction.interactionRevision, confirmed: true }),
      matches: s => same(s) && s.liveInteraction.phase === 'IDLE' },
    { label: '切换下一项', canRun: s => same(s) && s.liveInteraction.phase === 'IDLE',
      build: s => ({ ...base('ADVANCE_PROGRAM'), expectedRunRevision: s.runtime.runRevision, expectedInteractionRevision: s.interaction.interactionRevision, expectedStageRevision: s.stage.revision, confirmed: true }),
      matches: s => s.currentProgram?.id === target && s.runtime.status === 'RUNNING' && s.runtime.currentScene === 'PROGRAM_SUPPORT' },
  ])
}
function advanceProgram() {
  if (!nextProgram.value || !canSelectProgram.value) return
  return runCommand({ ...base('ADVANCE_PROGRAM'), expectedRunRevision: runtime.value.runRevision,
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    expectedStageRevision: snapshot.value.stage.revision, confirmed: true }, '下一项已按节目单执行。')
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
  }, '当前节目已更新，OBS 正在同步对应场景。')
}
function selectProgram(id) {
  selectedProgramId.value = id
  return setProgram()
}
async function ceremonyCommand(body) {
  if (body.command === 'REVEAL_AWARD' && !await askAction('确定向大屏揭晓当前获奖名单？')) return
  const result = await runCommand({ ...base(body.command), expectedRunRevision: runtime.value.runRevision, ...body }, body.command === 'SET_PROGRAM_HEAT' ? '节目动力值已更新。' : '舞台已更新。')
  if (result?.ok && body.command === 'SAVE_AWARD') awardSavedSignal.value++
  if (result?.ok && body.command === 'SET_PROGRAM_HEAT') heatSavedSignal.value++
}
async function applyProgramCatalog({ catalog, expectedCatalogRevision }) {
  const ownGeneration = sessionGeneration.capture()
  const result = await runCommand({
    ...base('UPDATE_PROGRAM_CATALOG'), expectedRunRevision: runtime.value.runRevision,
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    expectedCatalogRevision, catalog, confirmed: true,
  }, `节目目录已应用，共 ${catalog.items.length} 项。`)
  if (result?.ok && sessionGeneration.isCurrent(ownGeneration)) catalogSavedSignal.value += 1
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
  if (runtime.value.currentScene !== 'ASSEMBLY') return
  return confirmProgress('ADVANCE', '确认进入节目控制阶段？', '已进入节目控制阶段。')
}
function pause() { return runCommand({ ...base('PAUSE'), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, confirmed: true }, '全场已暂停。') }
function resume() { return runCommand({ ...base('RESUME'), expectedRunRevision: runtime.value.runRevision, confirmed: true }, '全场已恢复。') }
async function previewFinale() {
  if (!canStageWrite.value || runtime.value.mode !== 'REHEARSAL' || presentation.value.type !== 'NONE') return
  if (!await askAction('预览约 165 秒电影片尾？排练结束后仍可返回节目。')) return
  const steps = []
  if (runtime.value.currentScene !== 'COOPERATIVE_LIGHT') steps.push({ label: '进入谢幕准备',
    canRun: s => s.runtime.mode === 'REHEARSAL' && s.runtime.status === 'RUNNING' && s.presentation.type === 'NONE',
    build: s => ({ ...base('SET_SCENE'), expectedRunRevision: s.runtime.runRevision, expectedPresentationRevision: s.presentationRevision, targetScene: 'COOPERATIVE_LIGHT', confirmed: true }),
    matches: s => s.runtime.currentScene === 'COOPERATIVE_LIGHT' })
  steps.push({ label: '播放片尾预览', canRun: s => s.runtime.mode === 'REHEARSAL' && s.runtime.status === 'RUNNING' && s.runtime.currentScene === 'COOPERATIVE_LIGHT' && s.presentation.type === 'NONE',
    build: s => ({ ...base('PREVIEW_FINALE'), expectedRunRevision: s.runtime.runRevision, expectedPresentationRevision: s.presentationRevision, confirmed: true }),
    matches: s => s.presentation.type === 'FINALE_PREVIEW' })
  return runWorkflow('片尾预览', steps)
}

function complete() {
  return confirmProgress('COMPLETE', '确认结束晚会？大屏将显示“感谢你的参与”，送礼、弹幕与投票立即停止，活动锁定为只读。', '活动已完成并锁定终章。')
}
function clearPresentation() { return runCommand({ ...base('CLEAR_PRESENTATION'), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, confirmed: true }, '活动投影已清除。') }
function liveCommand(command, payload, success) {
  return runCommand({
    ...base(command),
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    ...payload,
    confirmed: true,
  }, success)
}
function openBuzzer() {
  if (currentInteractionCode.value !== 'A') return
  const defaultPrompt = currentInteractionCode.value === 'A' ? '歌名 decoder · 立即抢答' : '谁是最“人” · 立即抢答'
  return liveCommand('OPEN_BUZZER', {
    segmentCode: currentInteractionCode.value,
    prompt: buzzerPrompt.value.trim() || defaultPrompt,
  }, `${interactionLabel(currentInteractionCode.value)}抢答已开放。`)
}
function armAudioBuzzer() {
  if (currentInteractionCode.value !== 'A' || !audioBridge.value.available || !selectedAudio.value) {
    errorMessage.value = '自动触发不可用，请启动本机 OBS 桥接并核对 mix 音源。'
    return
  }
  return liveCommand('ARM_AUDIO_BUZZER', {
    segmentCode: 'A', trackId: audioTrackId.value, inputUuid: selectedAudio.value.inputUuid,
    prompt: buzzerPrompt.value.trim() || '歌名 decoder · 立即抢答',
  }, '已布置音频抢答，OBS 桥接会自动播放对应 mix，播放开始后倒数 10 秒。')
}
function markBuzzerWrong() {
  return liveCommand('MARK_BUZZER_WRONG', { segmentCode: 'A' }, '已判错，原音频将续播并继续抢答。')
}
async function openAudienceVote() {
  if (!canStageWrite.value || liveInteraction.value.phase !== 'IDLE') return
  const candidates = [...draftCandidates.value], prompt = votePrompt.value.trim() || '谁是卧底 · 现场投票'
  const epoch = snapshot.value.resetEpoch, revision = snapshot.value.interaction.interactionRevision
  if (!await askAction(`开放“${prompt}”？选手：${candidates.join('、')}。开放后本轮选手不可修改。`)) return
  if (!canStageWrite.value || snapshot.value.resetEpoch !== epoch || snapshot.value.interaction.interactionRevision !== revision) return
  return liveCommand('OPEN_AUDIENCE_VOTE', { prompt, candidates }, '互动二投票已开放。')
}
async function revealAudienceVote() {
  if (!canStageWrite.value || liveInteraction.value.phase !== 'VOTE_OPEN') return
  const epoch = snapshot.value.resetEpoch, round = liveInteraction.value.roundNumber
  if (!await askAction('结束本轮投票并向大屏揭晓结果？')) return
  if (!canStageWrite.value || snapshot.value.resetEpoch !== epoch || liveInteraction.value.roundNumber !== round || liveInteraction.value.phase !== 'VOTE_OPEN') return
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

function openSurfaceWindow(surface) {
  const target = new URL(surface === 'screen' ? 'screen' : 'welcome', window.location.href)
  if (surface === 'screen') {
    target.searchParams.set('motion', 'full')
    target.searchParams.set('media', 'background')
    target.searchParams.set('audio', 'off')
  }
  const name = surface === 'screen' ? 'sysu-welcome-screen' : 'sysu-welcome-web'
  const opened = window.open(target.href, name, 'popup=yes,width=1920,height=1080,resizable=yes,noopener')
  if (!opened) {
    errorMessage.value = '浏览器拦截了新窗口，请允许控制台打开节目网页。'
    return
  }
  opened.focus?.()
  successMessage.value = surface === 'screen' ? '已打开最新版节目大屏窗口。' : '已打开观众网页窗口。'
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
      <div class="console-brand"><span class="console-star" aria-hidden="true">✦</span><div><p>迎新之夜 · 2026</p><h1 id="v2-admin-title">现场控制台</h1></div></div>
      <div class="v2-heading-actions">
        <span v-if="runtime" class="console-mode">{{ runtime.mode === 'LIVE' ? '现场' : '排练' }} · {{ statusLabels[runtime.status] }}</span>
        <StatusPill v-if="snapshot" :tone="realtime.state.value === 'online' ? 'success' : 'warning'">
          {{ realtime.state.value === 'online' ? '实时已连接' : '正在恢复同步' }}
        </StatusPill>
        <BaseButton v-if="snapshot" variant="secondary" size="sm" @click="openSurfaceWindow('screen')">打开节目大屏</BaseButton>
        <BaseButton v-if="snapshot" variant="secondary" size="sm" @click="openSurfaceWindow('welcome')">打开观众网页</BaseButton>
        <BaseButton v-if="snapshot" variant="secondary" :disabled="Boolean(busy || workflowBusy)" @click="logout">退出</BaseButton>
      </div>
    </header>

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
      <section class="fixed-runtime" aria-label="运行控制">
        <StatusPill>{{ statusLabels[runtime.status] }}</StatusPill><span>第 {{ snapshot.resetEpoch }} 轮</span>
        <select v-model="startMode" aria-label="开始模式" :disabled="!canStageWrite || runtime.status!=='READY'"><option value="LIVE">现场</option><option value="REHEARSAL">排练</option></select>
        <BaseButton :disabled="!canStageWrite || runtime.status!=='READY'" title="待开始时可用" @click="start">开始活动</BaseButton>
        <BaseButton variant="secondary" :disabled="!canStageWrite || !['RUNNING','PAUSED'].includes(runtime.status)" @click="runtime.status==='PAUSED' ? resume() : pause()">{{ runtime.status==='PAUSED' ? '恢复运行' : '全场暂停' }}</BaseButton>
      </section>
      <section v-if="activePanel !== 'interaction'" class="fixed-cue" aria-label="当前与下一项">
        <div><small>正在进行 · 服务器已确认</small><h2 :title="currentProgram?.title">{{ currentProgram?.title || (runtime.currentScene ? sceneLabels[runtime.currentScene].slice(3) : '等待开场') }}</h2><span>{{ snapshot.stage?.mode==='HOST' ? '报幕／主题背景' : currentProgram?.durationLabel || '按主持口令推进' }}</span></div>
        <div><small>待执行</small><strong>{{ preparedProgram?.title || '请在节目页选择' }}</strong><small>下一项 · {{ nextProgram?.title || '主持结束语 → 感谢卡' }}</small></div><p>{{ obsCue }}</p>
      </section>
      <nav v-if="activePanel !== 'interaction'" class="fixed-stage-actions" aria-label="常用舞台操作">
        <BaseButton variant="secondary" :disabled="!canSelectProgram || snapshot.stage?.mode==='HOST'" title="互动先收尾；报幕暂停送礼" @click="ceremonyCommand({command:'SET_STAGE_MODE',expectedStageRevision:snapshot.stage.revision,mode:'HOST'})">报幕／主题背景</BaseButton>
        <BaseButton variant="secondary" :disabled="!canSelectProgram || !currentProgram || ['AWARD','SPEECH'].includes(currentProgram.kind) || snapshot.stage?.mode==='PROGRAM'" @click="ceremonyCommand({command:'SET_STAGE_MODE',expectedStageRevision:snapshot.stage.revision,mode:'PROGRAM'})">返回节目</BaseButton>
        <BaseButton :disabled="!canSelectProgram || !preparedProgram || preparedProgram.id===currentProgram?.id" @click="setProgram">执行选中项</BaseButton>
        <BaseButton variant="secondary" :disabled="!canSelectProgram || !nextProgram" title="开放中的互动须先完成" @click="advanceProgram">下一项</BaseButton>
        <BaseButton variant="danger" :disabled="!canStageWrite || runtime.mode!=='LIVE' || runtime.status!=='RUNNING' || !['PROGRAM_SUPPORT','COOPERATIVE_LIGHT'].includes(runtime.currentScene) || liveInteraction.phase!=='IDLE'" title="主持结束语后确认，活动将锁定为只读" @click="complete">结束晚会</BaseButton>
      </nav>
      <nav class="console-tabs" aria-label="控台工作区"><button v-for="tab in panelTabs" :key="tab.id" type="button" :aria-pressed="activePanel===tab.id" @click="activePanel=tab.id">{{ tab.label }}</button></nav>
      <div class="console-workspace">
        <V2ProgramCatalog v-show="activePanel==='programs'" :snapshot="snapshot" :can-write="canWrite" :saved-signal="catalogSavedSignal" @prepare="selectedProgramId=$event" @select="selectProgram" @advance="advanceProgram" @apply="applyProgramCatalog" />
        <section v-if="activePanel==='interaction'" class="interaction-tab" aria-label="互动完整控制区">
          <BaseCard padding="md" class="interaction-control-panel" aria-label="互动主控面板">
            <div class="panel-heading"><div><p class="interaction-code">当前节目</p><h2>{{ currentProgram?.title || '等待开场' }}</h2><p>下一项 · {{ nextProgram?.title || '主持结束语 → 感谢卡' }}</p></div><StatusPill>{{ snapshot.stage?.mode === 'HOST' ? '报幕／主题背景' : runtime.status }}</StatusPill></div>
            <label class="interaction-program-choice">待执行节目<select v-model="selectedProgramId" aria-label="待执行节目" :disabled="!canSelectProgram"><option v-for="program in snapshot.programs" :key="program.id" :value="program.id">{{ program.displayCode }} · {{ program.title }}</option></select></label>
            <nav class="interaction-stage-actions" aria-label="互动舞台操作">
              <BaseButton variant="secondary" :disabled="!canSelectProgram || snapshot.stage?.mode==='HOST'" @click="ceremonyCommand({command:'SET_STAGE_MODE',expectedStageRevision:snapshot.stage.revision,mode:'HOST'})">报幕／主题背景</BaseButton>
              <BaseButton variant="secondary" :disabled="!canSelectProgram || !currentProgram || ['AWARD','SPEECH'].includes(currentProgram.kind) || snapshot.stage?.mode==='PROGRAM'" @click="ceremonyCommand({command:'SET_STAGE_MODE',expectedStageRevision:snapshot.stage.revision,mode:'PROGRAM'})">返回节目</BaseButton>
              <BaseButton :disabled="!canSelectProgram || !preparedProgram || preparedProgram.id===currentProgram?.id" @click="setProgram">执行选中项</BaseButton>
              <BaseButton variant="secondary" :disabled="!canSelectProgram || !nextProgram" @click="advanceProgram">下一项</BaseButton>
              <BaseButton v-if="['BUZZER_LOCKED', 'VOTE_REVEALED'].includes(liveInteraction.phase) && nextProgram" variant="secondary" :disabled="!canFinishInteraction" @click="finishInteractionAndNext">收起互动并进入下一项</BaseButton>
            </nav>
          </BaseCard>
          <section v-if="!currentInteractionCode && liveInteraction.phase === 'IDLE'" class="context-summary"><h2>当前环节</h2><p>{{ currentProgram?.title || '等待开场' }}</p><span>{{ currentProgram?.giftsEnabled ? '礼物与现场聊天已就绪' : '按流程执行节目与舞台操作' }}</span></section>

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

        <section v-if="currentInteractionCode === 'A'" class="interaction-operation" aria-labelledby="buzzer-heading">
          <div><h3 id="buzzer-heading">抢答 · OBS 音频自动倒数</h3><p>点击布置后自动播放对应 mix；播放开始，服务器立即进入 10 秒倒数。</p></div>
          <label>本题音频<select v-model="audioTrackId" :disabled="liveInteraction.phase !== 'IDLE' || liveInteraction.audio?.status === 'ARMED'"><option v-for="track in AUDIO_TRACKS" :key="track.id" :value="track.id">{{ track.label }}</option></select></label>
          <p role="status" class="audio-bridge-status">{{ audioBridge.available && selectedAudio ? 'OBS 已连接 · 本题 mix 已匹配' : '自动触发不可用 · 请检查本机桥接与 mix 素材' }}</p>
          <p role="status" class="audio-answer"><strong>本题答案：</strong>{{ selectedAudioAnswer }}</p>
          <label>大屏提示<input v-model="buzzerPrompt" maxlength="120" :placeholder="currentInteractionCode === 'A' ? '歌名 decoder · 立即抢答' : '谁是最“人” · 立即抢答'"></label>
          <div class="control-actions">
            <BaseButton :disabled="!canStageWrite || !audioBridge.available || !selectedAudio || snapshot.stage?.mode !== 'PROGRAM' || runtime.status !== 'RUNNING' || presentation.type !== 'NONE' || liveInteraction.phase !== 'IDLE' || liveInteraction.audio?.status !== 'IDLE'" @click="armAudioBuzzer">{{ liveInteraction.audio?.status === 'ARMED' ? '等待 OBS 播放 mix' : '布置 10 秒自动抢答' }}</BaseButton>
            <BaseButton variant="secondary" :disabled="!canStageWrite || (liveInteraction.phase === 'IDLE' && liveInteraction.audio?.status !== 'ARMED')" @click="closeLiveInteraction">关闭本轮互动</BaseButton>
            <BaseButton variant="secondary" :disabled="!canStageWrite || liveInteraction.phase !== 'BUZZER_LOCKED'" @click="markBuzzerWrong">答错，继续抢答</BaseButton>
            <BaseButton :disabled="!canStageWrite || liveInteraction.phase !== 'BUZZER_LOCKED'" @click="liveCommand('CLOSE_LIVE_INTERACTION', {answerAccepted:true}, '回答正确，本轮已结束。')">答对，结束本轮</BaseButton>
          </div>
          <p v-if="liveInteraction.audio?.status === 'ARMED'" class="open-notice" role="status">已布置：{{ AUDIO_TRACKS.find(item => item.id === audioBridge.arm?.trackId)?.label || audioBridge.arm?.trackId }} · OBS 将自动播放，播放后倒数 10 秒</p>
          <p v-if="liveInteraction.audio?.status === 'ENDED'" role="status">音频已播放完毕；抢答仍按当前状态进行，请手动收题。</p>
          <div v-if="liveInteraction.phase === 'BUZZER_LOCKED'" class="buzzer-result" role="status"><span>第一响应</span><strong>{{ liveInteraction.leader?.publicStarId }}</strong></div>
          <p v-else-if="liveInteraction.phase === 'BUZZER_OPEN'" class="open-notice" role="status">{{ buzzerCountdown ? `倒计时 ${buzzerCountdown}` : '抢答开放' }}</p>
        </section>

        <section v-else-if="currentInteractionCode === 'B'" class="interaction-operation" aria-labelledby="audience-heading">
          <div><h3 id="audience-heading">谁是卧底 · 选手与投票</h3><p>设置 2～12 位现场选手，确认后开放观众投票。</p></div>
          <fieldset :disabled="!canStageWrite || liveInteraction.phase !== 'IDLE'" class="vote-candidate-editor">
            <label>选手人数<input v-model.number="voteCandidateCount" type="number" min="2" max="12"></label>
            <label v-for="(_, i) in draftCandidates.slice(candidatePage*6,candidatePage*6+6)" :key="i+candidatePage*6">选手 {{ i+candidatePage*6+1 }}<input v-model="voteLabels[i+candidatePage*6]" maxlength="40" :placeholder="`${i+candidatePage*6+1}号选手`"></label>
            <label>投票题目<input v-model="votePrompt" maxlength="120"></label>
          </fieldset>
          <nav v-if="draftCandidates.length>6" class="candidate-paging"><BaseButton variant="secondary" :disabled="candidatePage===0" @click="candidatePage=0">1–6</BaseButton><BaseButton variant="secondary" :disabled="candidatePage===1" @click="candidatePage=1">7–12</BaseButton></nav>
          <div class="control-actions">
            <BaseButton v-if="liveInteraction.phase === 'IDLE'" :disabled="!canStageWrite || runtime.status !== 'RUNNING' || presentation.type !== 'NONE'" @click="openAudienceVote">确认选手并开放投票</BaseButton>
            <BaseButton v-if="liveInteraction.phase === 'VOTE_OPEN'" :disabled="!canStageWrite" @click="revealAudienceVote">关闭投票并揭晓</BaseButton>
            <BaseButton v-if="liveInteraction.phase === 'VOTE_REVEALED'" variant="secondary" :disabled="!canStageWrite" @click="closeLiveInteraction">收起本轮结果</BaseButton>
          </div>
          <div v-if="liveInteraction.phase.startsWith('VOTE')" class="admin-vote-board">
            <p>已收到 <strong>{{ liveInteraction.totalVotes }}</strong> 票</p>
            <ul><li v-for="candidate in liveInteraction.voteCandidates" :key="candidate.candidateId"><span>{{ candidate.displayLabel }}</span><i><b :style="{ transform: `scaleX(${liveInteraction.totalVotes ? (candidate.voteCount ?? 0) / liveInteraction.totalVotes : 0})` }"></b></i><strong>{{ candidate.voteCount ?? 0 }}</strong></li></ul>
          </div>
        </section>
        <section v-else-if="currentInteractionCode === 'C'" class="interaction-operation"><h3>谁是最“人” · 线下互动</h3><p>由主持人组织现场互动。结束后在节目目录执行下一项。</p></section>



      </BaseCard>

      </section>
        <V2AwardsConsole v-show="activePanel==='awards'" :snapshot="snapshot" :can-write="canWrite" :saved-signal="awardSavedSignal" :heat-saved-signal="heatSavedSignal" @command="ceremonyCommand" @select="selectProgram" />
        <section v-show="activePanel==='barrages'"><BaseCard padding="md" class="moderation-panel">
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
          <li v-for="item in barrages.slice(barragePage*4,barragePage*4+4)" :key="item.barrageId">
            <div><p><strong>{{ item.publicStarId || '星号待同步' }}</strong> · {{ item.text }}</p><small>{{ new Date(item.publishedAt).toLocaleTimeString('zh-CN') }}</small></div>
            <div class="candidate-actions">
              <BaseButton variant="secondary" :disabled="!canReviewWrite" @click="removeBarrage(item)">撤下</BaseButton>
              <BaseButton variant="danger" :disabled="!canReviewWrite" @click="blockBarrageSource(item)">屏蔽来源</BaseButton>
            </div>
          </li>
        </ul>
      <nav class="list-pagination"><BaseButton :disabled="barragePage===0" @click="barragePage--">上一页</BaseButton><span>{{ barragePage+1 }} / {{ barragePages }}</span><BaseButton :disabled="barragePage+1>=barragePages" @click="barragePage++">下一页</BaseButton></nav></BaseCard>
      </section>
        <section v-show="activePanel==='manage'" class="manage-tab">
          <h2>现场与数据管理</h2><div class="account-counts"><div v-for="item in accountSummary" :key="item.kind"><span>{{ {STUDENT:'学生',STAFF:'工作人员',GUEST:'游客'}[item.kind] }}</span><strong>{{ item.admitted }} <small>/ {{ item.kind==='GUEST' ? 94 : item.total }}</small></strong><small>已入场</small></div></div>
          <p>已入场 {{ snapshot.funnel.admittedCount }} · 待选色 {{ snapshot.funnel.onboardingPendingCount }}</p>
          <div class="control-actions"><BaseButton variant="secondary" :disabled="!canStageWrite || runtime.mode!=='REHEARSAL' || runtime.status!=='RUNNING' || presentation.type!=='NONE'" @click="previewFinale">预览电影片尾</BaseButton><BaseButton variant="secondary" :disabled="!canWrite || presentation.type==='NONE' || runtime.status==='COMPLETED'" @click="clearPresentation">收起预览</BaseButton><BaseButton v-for="scene in Object.keys(sceneLabels)" :key="scene" variant="secondary" :disabled="!canStageWrite || runtime.mode!=='REHEARSAL' || runtime.status!=='RUNNING' || scene===runtime.currentScene" @click="setScene(scene)">{{ sceneLabels[scene] }}</BaseButton></div>
          <p class="quiet">网页切换节目后，OBS 通过本机桥接自动同步对应场景；排练场景按钮只在排练模式可用。</p>
          <p v-for="warning in snapshot.readinessWarnings" :key="warning" class="quiet">{{ warningLabels[warning] }}</p>
          <details v-if="snapshot.roundArchives?.length"><summary>最近归档记录</summary><p v-for="item in snapshot.roundArchives.slice(0,3)" :key="item.sourceEpoch">第 {{ item.sourceEpoch }} 轮 · {{ new Date(item.at).toLocaleString('zh-CN') }} · 校验 {{ item.sha256.slice(0,12) }}</p></details>
          <BaseButton v-if="!protectedRuntime" variant="secondary" :disabled="!canDemoWrite" @click="resetDemo">重置合成 Demo</BaseButton>
        </section>
      </div>
      <footer class="console-footer"><span role="status" :title="errorMessage || successMessage || resetReason">{{ errorMessage || realtime.lastError.value || successMessage || resetReason }}</span><BaseButton variant="danger" :disabled="!canWrite || !snapshot.roles.includes('ALL') || runtime.status==='RUNNING'" :title="resetReason" @click="resetRound">归档并重置本轮</BaseButton></footer>
    </template>
    <div v-if="snapshot && workflowProgress" class="workflow-receipt" :class="{ 'is-failed': workflowProgress.ok === false }" role="status">
      <strong>{{ workflowProgress.ok === true ? '操作已完成' : workflowProgress.ok === false ? '操作已停止，请核对现场状态' : '正在执行：' + workflowProgress.current }}</strong>
      <span v-if="workflowProgress.completed.length">已确认：{{ workflowProgress.completed.join(' → ') }}</span>
      <span v-if="workflowProgress.ok === false">待核对／待完成：{{ workflowProgress.pending.join(' → ') }}。已停止后续步骤，可使用单项操作继续。</span>
    </div>
    <div v-if="errorMessage || realtime.lastError.value || authState === 'active' && successMessage" class="feedback-stack">
      <p v-if="errorMessage || realtime.lastError.value" class="feedback error" role="alert">{{ errorMessage || realtime.lastError.value }}</p>
      <div v-else class="feedback success"><p role="status">{{ successMessage }}</p><details v-if="receiptMessage" class="receipt-details"><summary>操作回执</summary><code>{{ receiptMessage }}</code></details></div>
    </div>
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
.live-control-card{background:linear-gradient(145deg,#102034bd,#08111ec7)}.interaction-control-panel{background:linear-gradient(145deg,#172e49d9,#091522d9);border-color:#9fc5ef35}.interaction-stage-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.interaction-stage-actions>button{min-height:44px}.interaction-operation{gap:16px}.interaction-operation>.control-actions{justify-content:flex-start}.panel-heading{gap:14px}.panel-heading p{font-size:.8rem}.interaction-code{letter-spacing:.08em}.vote-control{padding:18px;background:#9fc5ef08;border-color:#91b9e42b}.winner-list li{background:#9dc5ed08}.buzzer-result,.open-notice{background:#75aef00b}.maintenance-details>summary{cursor:pointer;font-size:.9rem;font-weight:500;min-height:28px}.maintenance-details>p{margin:14px 0;line-height:1.7;font-size:.82rem}.danger-card{border-color:#d6887c36;background:#36202524}
.v2-admin summary:focus-visible{outline:2px solid var(--color-orbit-focus);outline-offset:4px}
@media(max-width:680px){.v2-admin{gap:14px}.v2-heading{align-items:center;gap:16px;padding-block:8px}.v2-heading-actions{width:100%;justify-content:space-between}.v2-admin :deep(.base-card){padding:18px}.runtime-facts{gap:8px}.runtime-facts>div{padding:10px}.runtime-facts strong{font-size:.9rem}.runtime-card>.control-actions>button{flex:1 1 130px;margin-right:0;white-space:normal;line-height:1.4;padding-block:10px}.panel-heading>.control-actions{width:100%}.panel-heading>.control-actions>button{flex:1 1 120px}.interaction-stage-actions{display:grid;grid-template-columns:1fr;gap:8px}.interaction-stage-actions>button{width:100%;white-space:normal}.attendance-overview>summary{padding:13px 16px;flex-wrap:wrap;gap:6px}.attendance-overview>summary>span{font-size:.73rem}.feedback-stack{top:auto}.feedback{padding:10px 12px}.v2-admin .login-card{padding:22px}.interaction-operation input{box-sizing:border-box}.candidate-actions>button{flex:1;min-width:0}}

.audio-bridge-status,.audio-answer{font-size:12px!important}.audio-answer{padding:8px 10px;border-left:2px solid #9bc6eb70;background:#9bc6eb0d;color:#d8e9fb!important}.audio-answer strong{color:#fff}.interaction-operation select{min-height:36px;color:inherit;background:#1c2638;border:1px solid #93a8c340;border-radius:6px;padding:5px 10px}
.vote-candidate-editor{border:0;padding:0;display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}.vote-candidate-editor label:last-child{grid-column:1/-1}
</style>

<style scoped src="./obs-console.css"></style>

<style scoped src="./half-screen-console.css"></style>
