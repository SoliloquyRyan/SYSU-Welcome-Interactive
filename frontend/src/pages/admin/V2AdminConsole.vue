<script setup>
import { computed, ref } from 'vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import BaseCard from '../../components/ui/BaseCard.vue'
import StatusPill from '../../components/ui/StatusPill.vue'
import { useV2AdminRealtime } from '../../composables/useV2AdminRealtime'
import { ApiError, createIdempotencyKey, publicErrorMessage, v2AdminApi } from '../../services/api'
import { adminSnapshotCanReplace, createAdminSessionGeneration } from './v2-admin-state'

const sceneLabels = {
  ASSEMBLY: '01 星海集结', PROGRAM_SUPPORT: '02 节目应援', COOPERATIVE_LIGHT: '03 协同点亮',
}
const warningLabels = {
  ONBOARDING_PENDING: '仍有人尚未完成个人入场',
  STAR_START_PENDING: '仍有准入者尚未启动恒星',
  COOPERATIVE_LIGHT_PENDING: '仍有准入者尚未完成协同点亮',
}
const statusLabels = { READY: '待开始', RUNNING: '运行中', PAUSED: '已暂停', COMPLETED: '已完成' }

const authState = ref('checking')
const username = ref('demo-admin')
const password = ref('')
const snapshot = ref(null)
const busy = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const selectedCapsules = ref([])
const selectedProgramId = ref('')
const sessionGeneration = createAdminSessionGeneration()

const runtime = computed(() => snapshot.value?.runtime)
const presentation = computed(() => snapshot.value?.presentation)
const candidates = computed(() => snapshot.value?.capsuleCandidates ?? [])
const barrages = computed(() => snapshot.value?.publishedBarrages ?? [])
const selectedCandidates = computed(() => candidates.value.filter((item) => item.moderationStatus === 'SELECTED'))
const canWrite = computed(() => realtime.state.value === 'online' && !busy.value)

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
    selectedCapsules.value = selectedCapsules.value.filter((id) =>
      next.capsuleCandidates.some((item) => item.capsuleId === id && item.moderationStatus === 'SELECTED'))
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
    errorMessage.value = '请输入共用 Demo 账号和密码。'; return
  }
  const ownGeneration = sessionGeneration.advance()
  realtime.stop()
  busy.value = 'login'; errorMessage.value = ''
  try {
    const next = await v2AdminApi.login({ username: username.value.trim(), password: password.value })
    if (!sessionGeneration.isCurrent(ownGeneration)) return
    snapshot.value = next
    password.value = ''
    authState.value = 'active'
    successMessage.value = 'v2 管理会话已建立。'
    await realtime.connect()
  } catch (error) {
    if (sessionGeneration.isCurrent(ownGeneration)) errorMessage.value = publicErrorMessage(error)
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
  snapshot.value = null; authState.value = 'login'; busy.value = ''
}

function base(command) {
  return { protocolVersion: '2', resetEpoch: snapshot.value.resetEpoch, idempotencyKey: createIdempotencyKey(), command }
}

// Authoritative success feedback: a 200 response alone does not prove the
// authoritative state changed (D-021 OBS-01/02 lesson). After the snapshot
// refresh, compare the revision family this command owns and echo it back.
const RUN_REVISION_COMMANDS = new Set(['START', 'ADVANCE', 'PAUSE', 'RESUME', 'COMPLETE'])
const PRESENTATION_COMMANDS = new Set(['PREVIEW_FINALE', 'CLEAR_PRESENTATION', 'SHOW_CAPSULE_INSERT', 'REMOVE_CAPSULE'])
const INTERACTION_COMMANDS = new Set(['SET_PROGRAM', 'SET_BARRAGE_PAUSED', 'REMOVE_BARRAGE', 'BLOCK_BARRAGE_SOURCE', 'CLEAR_BARRAGES'])

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
  return receipt || unchanged ? `${receipt ? `权威回执 ${receipt}；` : ''}${unchanged}`.replace(/；$/, '') : ''
}

async function runCommand(body, success, allowOverride = false) {
  const ownGeneration = sessionGeneration.capture()
  const before = revisionSnapshot()
  busy.value = body.command; errorMessage.value = ''; successMessage.value = ''
  const applySuccess = async (result) => {
    if (!sessionGeneration.isCurrent(ownGeneration)) return
    await refresh(ownGeneration)
    if (!sessionGeneration.isCurrent(ownGeneration)) return
    const suffix = feedbackSuffix(body.command, before, revisionSnapshot(), result)
    successMessage.value = suffix ? `${success}（${suffix}）` : success
  }
  try {
    const result = await v2AdminApi.command(body)
    await applySuccess(result)
  } catch (error) {
    if (!sessionGeneration.isCurrent(ownGeneration)) return
    if (allowOverride && error instanceof ApiError && error.code === 'READINESS_CONFIRMATION_REQUIRED') {
      const warnings = error.details?.warnings ?? snapshot.value.readinessWarnings
      const accepted = window.confirm(`${warnings.map((item) => warningLabels[item] ?? item).join('；')}。\n仍然推进吗？`)
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

function setMode(mode) {
  if (!window.confirm(`确认切换为${mode === 'LIVE' ? '现场' : '排练'}模式？`)) return
  return runCommand({ ...base('SET_MODE'), expectedRunRevision: runtime.value.runRevision, targetMode: mode, confirmed: true }, '模式已更新。')
}
function start() {
  if (!window.confirm('确认开始并进入“星海集结”？')) return
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
function advance() {
  if (!window.confirm('确认推进到下一个全场场景？')) return
  return runCommand({ ...base('ADVANCE'), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, confirmed: true, overrideReadinessWarnings: false }, '已推进到下一场景。', true)
}
function pause() { return runCommand({ ...base('PAUSE'), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, confirmed: true }, '全场已暂停。') }
function resume() { return runCommand({ ...base('RESUME'), expectedRunRevision: runtime.value.runRevision, confirmed: true }, '全场已恢复。') }
function previewFinale() { return runCommand({ ...base('PREVIEW_FINALE'), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, confirmed: true }, '终章预览已打开。') }
function complete() {
  if (!window.confirm('这是不可逆操作。确认结束活动并锁定终章？')) return
  return runCommand({ ...base('COMPLETE'), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, confirmed: true, overrideReadinessWarnings: false }, '活动已完成并锁定终章。', true)
}
function clearPresentation() { return runCommand({ ...base('CLEAR_PRESENTATION'), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, confirmed: true }, '活动投影已清除。') }
function selectCapsule(item) { return runCommand({ ...base('SELECT_CAPSULE'), capsuleId: item.capsuleId, expectedParticipantRevision: item.participantRevision, confirmed: true }, '胶囊已选中。') }
function showCapsules() {
  const capsuleIds = selectedCapsules.value
  if (!capsuleIds.length) { errorMessage.value = '请先勾选 1～6 条已选胶囊。'; return }
  return runCommand({ ...base('SHOW_CAPSULE_INSERT'), expectedRunRevision: runtime.value.runRevision, expectedPresentationRevision: snapshot.value.presentationRevision, capsuleIds, confirmed: true }, '胶囊插播已上屏。')
}
function removeCapsule(item) {
  const reason = window.prompt('请输入撤下原因（会写入管理审计）')?.trim()
  if (!reason) return
  return runCommand({ ...base('REMOVE_CAPSULE'), capsuleId: item.capsuleId, expectedParticipantRevision: item.participantRevision, expectedPresentationRevision: snapshot.value.presentationRevision, reason, confirmed: true }, '胶囊已安全撤下。')
}
function setBarragePaused(paused) {
  return runCommand({
    ...base('SET_BARRAGE_PAUSED'),
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    paused,
  }, paused ? '新弹幕发布已暂停。' : '新弹幕发布已恢复。')
}
function removeBarrage(item) {
  const reason = window.prompt('请输入撤下原因（会写入安全审计）')?.trim()
  if (!reason) return
  return runCommand({
    ...base('REMOVE_BARRAGE'),
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    barrageId: item.barrageId,
    reason,
    confirmed: true,
  }, '弹幕已从大屏撤下。')
}
function blockBarrageSource(item) {
  const reason = window.prompt('请输入屏蔽匿名来源的原因（该来源后续不能再发送）')?.trim()
  if (!reason) return
  if (!window.confirm('确认屏蔽该匿名来源并撤下它当前仍显示的弹幕？')) return
  return runCommand({
    ...base('BLOCK_BARRAGE_SOURCE'),
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    sourceId: item.sourceId,
    reason,
    confirmed: true,
  }, '匿名来源已屏蔽，相关公开弹幕已撤下。')
}
function clearBarrages() {
  const reason = window.prompt('请输入清屏原因（会写入安全审计）')?.trim()
  if (!reason) return
  if (!window.confirm('确认清除当前全部公开弹幕？')) return
  return runCommand({
    ...base('CLEAR_BARRAGES'),
    expectedInteractionRevision: snapshot.value.interaction.interactionRevision,
    reason,
    confirmed: true,
  }, '公开弹幕已清屏。')
}
function resetDemo() {
  if (!window.confirm('确认清空本轮全部合成运行事实并建立新代际？此操作不可撤销。')) return
  return runCommand({ ...base('RESET_DEMO'), confirmation: 'RESET DEMO', syntheticDataConfirmed: true }, 'Demo 已重置，管理会话已安全轮换。')
}

void boot()
</script>

<template>
  <section class="v2-admin" aria-labelledby="v2-admin-title">
    <header class="v2-heading">
      <div><p>协议 v2 · 匿名现场运营</p><h1 id="v2-admin-title">三场景控制台</h1></div>
      <div class="v2-heading-actions">
        <StatusPill v-if="snapshot" :tone="realtime.state.value === 'online' ? 'success' : 'warning'">
          {{ realtime.state.value === 'online' ? '权威实时已连接' : '正在恢复同步' }}
        </StatusPill>
        <BaseButton v-if="snapshot" variant="secondary" @click="logout">退出</BaseButton>
      </div>
    </header>

    <BaseCard v-if="authState === 'checking'" padding="lg"><p>正在检查 v2 管理会话…</p></BaseCard>
    <BaseCard v-else-if="authState === 'login'" padding="lg" class="login-card">
      <h2>共用 Demo 后台登录</h2>
      <label>账号<input v-model="username" autocomplete="username"></label>
      <label>密码<input v-model="password" type="password" autocomplete="current-password" @keyup.enter="login"></label>
      <BaseButton :disabled="busy === 'login'" @click="login">{{ busy === 'login' ? '登录中…' : '登录' }}</BaseButton>
    </BaseCard>

    <template v-else-if="snapshot">
      <p v-if="errorMessage || realtime.lastError.value" class="feedback error" role="alert">{{ errorMessage || realtime.lastError.value }}</p>
      <p v-if="successMessage" class="feedback success" role="status">{{ successMessage }}</p>

      <BaseCard padding="lg" class="runtime-card">
        <div class="runtime-facts">
          <div><span>模式</span><strong>{{ runtime.mode === 'LIVE' ? '现场' : '排练' }}</strong></div>
          <div><span>状态</span><strong>{{ statusLabels[runtime.status] }}</strong></div>
          <div><span>当前场景</span><strong>{{ runtime.currentScene ? sceneLabels[runtime.currentScene] : '尚未开始' }}</strong></div>
          <div><span>活动投影</span><strong>{{ presentation.type }}</strong></div>
        </div>
        <div class="control-actions">
          <template v-if="runtime.status === 'READY'">
            <BaseButton variant="secondary" :disabled="!canWrite" @click="setMode(runtime.mode === 'LIVE' ? 'REHEARSAL' : 'LIVE')">切换为{{ runtime.mode === 'LIVE' ? '排练' : '现场' }}</BaseButton>
            <BaseButton :disabled="!canWrite" @click="start">开始活动</BaseButton>
          </template>
          <template v-if="runtime.status === 'RUNNING'">
            <BaseButton variant="secondary" :disabled="!canWrite" @click="pause">暂停</BaseButton>
            <BaseButton v-if="runtime.mode === 'LIVE' && runtime.currentScene !== 'COOPERATIVE_LIGHT'" :disabled="!canWrite" @click="advance">推进下一场景</BaseButton>
            <BaseButton v-if="runtime.mode === 'REHEARSAL'" v-for="scene in Object.keys(sceneLabels)" :key="scene" variant="secondary" :disabled="!canWrite || scene === runtime.currentScene" @click="setScene(scene)">{{ sceneLabels[scene] }}</BaseButton>
            <BaseButton v-if="runtime.mode === 'REHEARSAL' && runtime.currentScene === 'COOPERATIVE_LIGHT' && presentation.type === 'NONE'" :disabled="!canWrite" @click="previewFinale">预览终章</BaseButton>
            <BaseButton v-if="runtime.mode === 'LIVE' && runtime.currentScene === 'COOPERATIVE_LIGHT'" variant="danger" :disabled="!canWrite" @click="complete">结束并锁定终章</BaseButton>
          </template>
          <BaseButton v-if="runtime.status === 'PAUSED'" :disabled="!canWrite" @click="resume">恢复运行</BaseButton>
          <BaseButton v-if="presentation.type !== 'NONE' && runtime.status !== 'COMPLETED'" variant="secondary" :disabled="!canWrite" @click="clearPresentation">清除当前投影</BaseButton>
        </div>
      </BaseCard>

      <div class="v2-grid">
        <BaseCard padding="lg">
          <h2>匿名入场漏斗</h2>
          <dl class="metrics">
            <div><dt>已激活</dt><dd>{{ snapshot.funnel.activatedCount }}</dd></div>
            <div><dt>已锁色入星系</dt><dd>{{ snapshot.funnel.publicStarCount }}</dd></div>
            <div><dt>已完成个人入场</dt><dd>{{ snapshot.funnel.admittedCount }}</dd></div>
            <div><dt>个人入场待处理</dt><dd>{{ snapshot.funnel.onboardingPendingCount }}</dd></div>
            <div><dt>胶囊已提交</dt><dd>{{ snapshot.funnel.capsuleSubmittedCount }}</dd></div>
            <div><dt>胶囊待补写</dt><dd>{{ snapshot.funnel.capsuleSkippedCount }}</dd></div>
          </dl>
        </BaseCard>
        <BaseCard padding="lg">
          <h2>推进前检查</h2>
          <p v-if="!snapshot.readinessWarnings.length" class="quiet">当前没有就绪警告。</p>
          <ul v-else class="warning-list"><li v-for="warning in snapshot.readinessWarnings" :key="warning">{{ warningLabels[warning] }}</li></ul>
          <p class="quiet">警告不会硬卡现场；推进时必须再次明确确认。权限、旧 revision、断线和错误状态仍是硬门。</p>
        </BaseCard>
      </div>

      <BaseCard padding="lg">
        <div class="capsule-heading"><div><h2>人工胶囊审核与插播</h2><p>正文只在受限后台显示；不会自动轮播或由 AI 公开。</p></div><BaseButton v-if="runtime.status === 'RUNNING' && presentation.type === 'NONE'" :disabled="!canWrite || !selectedCapsules.length" @click="showCapsules">插播已勾选（{{ selectedCapsules.length }}/6）</BaseButton></div>
        <p v-if="!candidates.length" class="quiet">暂无胶囊候选。</p>
        <ul v-else class="capsule-list">
          <li v-for="item in candidates" :key="item.capsuleId">
            <label v-if="item.moderationStatus === 'SELECTED'"><input v-model="selectedCapsules" type="checkbox" :value="item.capsuleId" :disabled="selectedCapsules.length >= 6 && !selectedCapsules.includes(item.capsuleId)"><span class="sr-only">勾选 {{ item.publicStarId }}</span></label>
            <div><strong>{{ item.publicStarId }}</strong><span class="candidate-status">{{ item.moderationStatus }}</span><p>{{ item.text }}</p></div>
            <div class="candidate-actions"><BaseButton v-if="item.moderationStatus === 'SUBMITTED' && runtime.status !== 'COMPLETED'" variant="secondary" :disabled="!canWrite" @click="selectCapsule(item)">选中</BaseButton><BaseButton v-if="item.moderationStatus !== 'REMOVED'" variant="danger" :disabled="!canWrite" @click="removeCapsule(item)">撤下</BaseButton></div>
          </li>
        </ul>
      </BaseCard>

      <BaseCard padding="lg">
        <div class="capsule-heading">
          <div><h2>节目单与礼物</h2><p>只有节目支持场景的当前节目可接收礼物；节目媒体仍由 OBS/导播控制。</p></div>
          <div class="program-control">
            <label for="v2-current-program">当前节目</label>
            <select id="v2-current-program" v-model="selectedProgramId">
              <option v-for="program in snapshot.programs" :key="program.id" :value="program.id">
                {{ String(program.order).padStart(2, '0') }} · {{ program.title }} · 热度 {{ program.heat }}
              </option>
            </select>
            <BaseButton
              variant="secondary"
              :disabled="!canWrite || runtime.status !== 'RUNNING' || runtime.currentScene !== 'PROGRAM_SUPPORT' || !selectedProgramId"
              @click="setProgram"
            >设为当前节目</BaseButton>
          </div>
        </div>
      </BaseCard>

      <BaseCard padding="lg">
        <div class="capsule-heading">
          <div>
            <h2>直播互动安全控制</h2>
            <p>大屏不显示身份；后台只使用会话内匿名来源标识执行撤下或屏蔽。</p>
          </div>
          <div class="control-actions">
            <BaseButton
              variant="secondary"
              :disabled="!canWrite || runtime.status === 'COMPLETED'"
              @click="setBarragePaused(!snapshot.interaction.barragePaused)"
            >{{ snapshot.interaction.barragePaused ? '恢复新弹幕' : '暂停新弹幕' }}</BaseButton>
            <BaseButton variant="danger" :disabled="!canWrite || !barrages.length" @click="clearBarrages">公开弹幕清屏</BaseButton>
          </div>
        </div>
        <p v-if="snapshot.interaction.barragePaused" class="pause-notice" role="status">新弹幕发布已暂停；已持久化的礼物与后台安全处置不受影响。</p>
        <p v-if="!barrages.length" class="quiet">当前没有公开弹幕。</p>
        <ul v-else class="barrage-list">
          <li v-for="item in barrages" :key="item.barrageId">
            <div><p>{{ item.text }}</p><small>{{ new Date(item.publishedAt).toLocaleTimeString('zh-CN') }}</small></div>
            <div class="candidate-actions">
              <BaseButton variant="secondary" :disabled="!canWrite" @click="removeBarrage(item)">撤下</BaseButton>
              <BaseButton variant="danger" :disabled="!canWrite" @click="blockBarrageSource(item)">屏蔽来源</BaseButton>
            </div>
          </li>
        </ul>
      </BaseCard>
      <BaseCard padding="lg" class="danger-card">
        <h2>Demo 管理</h2>
        <p class="quiet">仅合成数据可重置；服务端会再次执行数据分类硬门并轮换当前会话。</p>
        <BaseButton variant="danger" :disabled="!canWrite" @click="resetDemo">重置合成 Demo</BaseButton>
      </BaseCard>
    </template>
  </section>
</template>

<style scoped>
.v2-admin{display:grid;gap:var(--space-5);max-width:1240px;margin:0 auto;padding:var(--space-5)}
.v2-heading,.v2-heading-actions,.capsule-heading,.control-actions,.candidate-actions{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap}
.v2-heading p,.capsule-heading p,.quiet{color:var(--color-text-secondary)}
.login-card{display:grid;gap:var(--space-4);max-width:480px}.login-card label{display:grid;gap:var(--space-2)}
.login-card input{min-height:44px;padding:0 12px;border:1px solid var(--color-border-subtle);background:var(--color-paper-300);color:inherit}
.feedback{padding:var(--space-3);border-radius:var(--radius-md)}.error{background:color-mix(in srgb,var(--color-danger) 16%,transparent)}.success{background:color-mix(in srgb,var(--color-success) 16%,transparent)}
.runtime-card{display:grid;gap:var(--space-4)}.runtime-facts,.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--space-3)}
.runtime-facts div,.metrics div{padding:var(--space-3);border:1px solid var(--color-border-subtle)}.runtime-facts span,.metrics dt{display:block;color:var(--color-text-secondary);font-size:var(--font-size-xs)}.metrics dd{margin:4px 0 0;font-size:var(--font-size-xl);font-weight:700}
.v2-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)}.warning-list{display:grid;gap:var(--space-2);color:var(--color-warning)}
.capsule-list{list-style:none;padding:0;display:grid;gap:var(--space-2)}.capsule-list li{display:grid;grid-template-columns:auto 1fr auto;gap:var(--space-3);align-items:start;padding:var(--space-3);border:1px solid var(--color-border-subtle)}.capsule-list p{margin:6px 0 0;white-space:pre-wrap}.candidate-status{margin-left:8px;color:var(--color-text-secondary);font-size:var(--font-size-xs)}
.barrage-list{list-style:none;padding:0;display:grid;gap:var(--space-2)}.barrage-list li{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);padding:var(--space-3);border:1px solid var(--color-border-subtle)}.barrage-list p{margin:0;white-space:pre-wrap}.barrage-list small{display:block;margin-top:5px;color:var(--color-text-secondary)}.pause-notice{padding:var(--space-3);background:color-mix(in srgb,var(--color-warning) 14%,transparent)}
.danger-card{border-left:6px solid var(--color-danger)}
.program-control{display:flex;align-items:end;gap:var(--space-3);flex-wrap:wrap}.program-control label{display:grid;gap:var(--space-2);color:var(--color-text-secondary);font-size:var(--font-size-xs)}.program-control select{min-height:44px;min-width:min(360px,72vw);padding:0 12px;border:1px solid var(--color-border-subtle);background:var(--color-paper-300);color:inherit}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
@media(max-width:760px){.v2-grid{grid-template-columns:1fr}.runtime-facts,.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.capsule-list li{grid-template-columns:auto 1fr}.candidate-actions{grid-column:2;justify-content:flex-start}}
</style>
