<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import BaseCard from '../../components/ui/BaseCard.vue'
import StatusPill from '../../components/ui/StatusPill.vue'
import { useRealtime } from '../../composables/useRealtime'
import {
  adminApi,
  ApiError,
  commandVersion,
  createIdempotencyKey,
  publicErrorMessage,
} from '../../services/api'
import {
  createRefreshCoalescer,
  shouldCommitSnapshot,
} from '../../services/refresh-coalescer'

const roles = [
  { id: 'REVIEWER', label: '内容处置' },
  { id: 'STAGE_CONTROLLER', label: '阶段控制' },
  { id: 'DEMO_ADMIN', label: 'Demo 管理' },
  { id: 'ALL', label: '全部能力' },
]
const stageNames = ['身份激活', '时光胶囊', '星星集结', '节目应援', '协同点亮', '星际档案']

const authState = ref('checking')
const username = ref('demo-admin')
const password = ref('')
const snapshot = ref(null)
const selectedMode = ref('REHEARSAL')
const targetStage = ref(1)
const selectedProgramId = ref('')
const busy = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const uncertainCommand = ref(null)
const pendingKeys = new Map()
let sessionGeneration = 0

const isAuthenticated = computed(() => authState.value === 'active' && Boolean(snapshot.value))
const runtime = computed(() => snapshot.value?.runtime ?? null)
const session = computed(() => snapshot.value?.session ?? null)
const canControl = computed(
  () => realtime.canWrite.value && uncertainCommand.value === null,
)
const hasRole = (role) =>
  session.value?.roles?.includes('ALL') || session.value?.roles?.includes(role)

function clearAdminSession() {
  sessionGeneration += 1
  snapshot.value = null
  uncertainCommand.value = null
  pendingKeys.clear()
  authState.value = 'login'
}

async function refreshSnapshot() {
  const generation = sessionGeneration
  let next
  try {
    next = await adminApi.snapshot()
  } catch (error) {
    if (
      generation === sessionGeneration
      && error instanceof ApiError
      && error.code === 'AUTH_REQUIRED'
    ) {
      clearAdminSession()
    }
    throw error
  }
  if (generation !== sessionGeneration) return snapshot.value
  if (!shouldCommitSnapshot(snapshot.value, next)) return snapshot.value
  const previous = snapshot.value
  const resetChanged =
    previous !== null
    && previous.runtime.resetEpoch !== next.runtime.resetEpoch
  snapshot.value = next
  if (!previous || resetChanged || previous.runtime.mode !== next.runtime.mode) {
    selectedMode.value = next.runtime.mode
  }
  if (!previous || resetChanged || previous.runtime.stage !== next.runtime.stage) {
    targetStage.value = next.runtime.stage
  }
  if (
    !previous
    || resetChanged
    || previous.runtime.currentProgramId !== next.runtime.currentProgramId
  ) {
    selectedProgramId.value = next.runtime.currentProgramId ?? next.programs[0]?.id ?? ''
  }
  authState.value = 'active'
  return next
}

const realtimeRefresh = createRefreshCoalescer(refreshSnapshot, {
  delayMs: 50,
  onError: () => void realtime.resync('EVENT_REFRESH_FAILED'),
})

const realtime = useRealtime({
  stream: 'screen',
  enabled: isAuthenticated,
  resync: refreshSnapshot,
  onEvent: () => realtimeRefresh.schedule(),
})

onBeforeUnmount(() => {
  sessionGeneration += 1
  realtimeRefresh.cancel()
})

const connectionTone = computed(() =>
  realtime.state.value === 'online' ? 'success' : realtime.state.value === 'offline' ? 'danger' : 'warning',
)
const connectionLabel = computed(() => {
  const labels = {
    online: '实时同步',
    offline: '离线',
    syncing: '同步中',
    connecting: '连接中',
    reconnecting: '重连中',
    idle: '无会话',
  }
  return labels[realtime.state.value] ?? '检查中'
})

function keyFor(action) {
  if (!pendingKeys.has(action)) pendingKeys.set(action, createIdempotencyKey())
  return pendingKeys.get(action)
}

async function boot() {
  try {
    await refreshSnapshot()
  } catch (error) {
    if (error instanceof ApiError && error.code === 'AUTH_REQUIRED') {
      clearAdminSession()
      return
    }
    authState.value = 'login'
    errorMessage.value = publicErrorMessage(error)
  }
}

async function login() {
  errorMessage.value = ''
  successMessage.value = ''
  if (!username.value.trim() || !password.value) {
    errorMessage.value = '请输入共用 Demo 账号和密码。'
    return
  }
  busy.value = 'login'
  try {
    await adminApi.login({ username: username.value.trim(), password: password.value })
    password.value = ''
    await refreshSnapshot()
    successMessage.value = '管理会话已建立。'
  } catch (error) {
    errorMessage.value =
      error instanceof ApiError && ['AUTH_REQUIRED', 'VALIDATION_FAILED'].includes(error.code)
        ? '登录失败，请检查共用 Demo 账号。'
        : publicErrorMessage(error)
  } finally {
    busy.value = ''
  }
}

async function logout() {
  if (
    uncertainCommand.value
    && !window.confirm('上一次控制结果尚未确认。现在退出会放弃安全重试收据；重新登录后请先核对权威阶段。仍要退出吗？')
  ) {
    return
  }
  sessionGeneration += 1
  busy.value = 'logout'
  try {
    await adminApi.logout()
  } catch {
    // Always remove private management state from the page.
  } finally {
    // Also invalidate refreshes that started after logout began but before it completed.
    clearAdminSession()
    busy.value = ''
  }
}

async function execute(actionId, request, successText) {
  errorMessage.value = ''
  successMessage.value = ''
  if (busy.value) {
    errorMessage.value = '上一项控制仍在处理中，请等待明确结果。'
    return
  }
  if (!canControl.value) {
    errorMessage.value = '实时状态尚未同步，当前控制已锁定。'
    return
  }
  const key = keyFor(actionId)
  busy.value = actionId
  try {
    await request(key)
    pendingKeys.delete(actionId)
    await refreshSnapshot()
    successMessage.value = successText
  } catch (error) {
    const definitiveFailure =
      error instanceof ApiError && error.status >= 400 && error.status < 500
    if (definitiveFailure) {
      pendingKeys.delete(actionId)
    } else {
      uncertainCommand.value = { actionId, key, request, successText }
      errorMessage.value = '上一次控制的结果尚未确认。为避免重复执行，其他控制已锁定；联网后请安全重试原操作。'
      return
    }
    if (error instanceof ApiError && error.code === 'AUTH_REQUIRED') {
      clearAdminSession()
    } else if (error instanceof ApiError && ['STALE_STAGE', 'RESET_EPOCH_CHANGED'].includes(error.code)) {
      try {
        await refreshSnapshot()
      } catch {
        // The public error remains the most useful message.
      }
    }
    errorMessage.value = publicErrorMessage(error)
  } finally {
    busy.value = ''
  }
}

async function retryUncertainCommand() {
  const receipt = uncertainCommand.value
  if (!receipt || busy.value || !realtime.canWrite.value) return
  errorMessage.value = ''
  successMessage.value = ''
  busy.value = `retry:${receipt.actionId}`
  try {
    await receipt.request(receipt.key)
    pendingKeys.delete(receipt.actionId)
    uncertainCommand.value = null
    await refreshSnapshot()
    successMessage.value = `${receipt.successText}（原操作已安全确认）`
  } catch (error) {
    if (
      error instanceof ApiError
      && error.status >= 400
      && error.status < 500
    ) {
      pendingKeys.delete(receipt.actionId)
      uncertainCommand.value = null
      if (error.code === 'AUTH_REQUIRED') {
        clearAdminSession()
      } else if (['STALE_STAGE', 'RESET_EPOCH_CHANGED'].includes(error.code)) {
        try {
          await refreshSnapshot()
        } catch {
          // Keep the original public error when the recovery snapshot also fails.
        }
      }
    }
    errorMessage.value = publicErrorMessage(error)
  } finally {
    busy.value = ''
  }
}

function elevate(role) {
  const nextRoles = role === 'ALL'
    ? ['ALL']
    : Array.from(new Set([...(session.value.roles ?? []).filter((item) => item !== 'ALL'), role]))
  const body = { ...commandVersion(snapshot.value), roles: nextRoles }
  return execute(
    `role:${role}`,
    (key) => adminApi.setRoles(body, key),
    `当前会话已取得“${roles.find((item) => item.id === role)?.label}”能力。`,
  )
}

function setMode() {
  const mode = selectedMode.value
  if (!window.confirm(`确认切换为${mode === 'LIVE' ? '现场' : '排练'}模式？`)) return
  const body = { ...commandVersion(snapshot.value), action: 'SET_MODE', mode, confirmed: true }
  return execute(
    `mode:${mode}`,
    (key) => adminApi.runtime(body, key),
    '运行模式已更新。',
  )
}

function runtimeAction(action, options = {}) {
  const labels = {
    START: '开始活动',
    PAUSE: '暂停互动',
    RESUME: '恢复互动',
    ADVANCE: '推进到下一阶段',
    COMPLETE: '结束活动',
  }
  const needsConfirm = ['ADVANCE', 'COMPLETE'].includes(action)
  if (needsConfirm && !window.confirm(`确认${labels[action]}？`)) return
  const body = {
    ...commandVersion(snapshot.value),
    action,
    confirmed: needsConfirm,
    ...options,
  }
  return execute(
    `runtime:${action}:${runtime.value.stage}`,
    (key) => adminApi.runtime(body, key),
    `${labels[action]}已执行。`,
  )
}

function jumpStage() {
  const stage = Number(targetStage.value)
  const body = {
    ...commandVersion(snapshot.value),
    action: 'JUMP',
    targetStage: stage,
    confirmed: false,
  }
  return execute(
    `runtime:JUMP:${stage}`,
    (key) => adminApi.runtime(body, key),
    `排练已切换到阶段 ${stage}。`,
  )
}

function setProgram() {
  const programId = selectedProgramId.value
  const body = {
    ...commandVersion(snapshot.value),
    action: 'SET_PROGRAM',
    programId,
    confirmed: false,
  }
  return execute(
    `program:${programId}`,
    (key) => adminApi.runtime(body, key),
    '当前节目已更新。',
  )
}

function removeBarrage(barrage) {
  const body = { ...commandVersion(snapshot.value), confirmed: false }
  return execute(
    `remove:${barrage.id}`,
    (key) => adminApi.removeBarrage(barrage.id, body, key),
    '弹幕已从公共展示中移除。',
  )
}

function blockSource(barrage) {
  if (!window.confirm('确认屏蔽该匿名来源并移除其当前可见弹幕？')) return
  const body = { ...commandVersion(snapshot.value), confirmed: true }
  return execute(
    `block:${barrage.sourceId}`,
    (key) => adminApi.blockSource(barrage.sourceId, body, key),
    '匿名来源已屏蔽。',
  )
}

function toggleBarragePause() {
  const paused = !runtime.value.barragePaused
  const body = { ...commandVersion(snapshot.value), paused }
  return execute(
    `barrage-pause:${paused}`,
    (key) => adminApi.pauseBarrages(body, key),
    paused ? '新弹幕已暂停。' : '新弹幕已恢复。',
  )
}

function clearBarrages() {
  if (!window.confirm('确认紧急清除当前大屏弹幕？时光胶囊候选不会受影响。')) return
  const body = { ...commandVersion(snapshot.value), confirmed: true }
  return execute(
    `clear:${runtime.value.resetEpoch}:${runtime.value.stageRevision}`,
    (key) => adminApi.clearBarrages(body, key),
    '当前公共弹幕已清屏。',
  )
}

function changeInvitation(invitation) {
  const status = invitation.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE'
  if (!window.confirm(`确认将入口 ${invitation.tokenHint} 设置为 ${status}？`)) return
  const body = { ...commandVersion(snapshot.value), status, confirmed: true }
  return execute(
    `invitation:${invitation.id}:${status}`,
    (key) => adminApi.setInvitationStatus(invitation.id, body, key),
    '邀请入口状态已更新。',
  )
}

function resetDemo() {
  if (!window.confirm('确认确定性重置 Demo？激活、积分、互动与旧会话将被清除。')) return
  const actionId = `reset:${runtime.value.resetEpoch}`
  const body = { ...commandVersion(snapshot.value), confirmation: 'RESET DEMO' }
  return execute(
    actionId,
    (key) => adminApi.reset(body, key),
    'Demo 已重置，当前管理会话已安全轮换。',
  )
}

onMounted(boot)
</script>

<template>
  <section class="admin-stage console" aria-labelledby="admin-title">
    <div class="console-heading">
      <div>
        <p class="eyebrow">内部页面 · 共用 Demo 账号</p>
        <h1 id="admin-title">现场控制台</h1>
      </div>
      <StatusPill v-if="isAuthenticated" :tone="connectionTone">{{ connectionLabel }}</StatusPill>
    </div>

    <BaseCard v-if="authState === 'checking'" padding="lg" aria-live="polite">
      <h2>正在检查管理会话</h2>
    </BaseCard>

    <BaseCard v-else-if="authState === 'login'" class="login-card" padding="lg">
      <form class="form-stack" @submit.prevent="login">
        <div>
          <h2>登录控制台</h2>
          <p>操作记录只关联会话短 ID，不代表个人身份审计。</p>
        </div>
        <label for="admin-username">共用账号</label>
        <input id="admin-username" v-model="username" autocomplete="username" />
        <label for="admin-password">密码</label>
        <input id="admin-password" v-model="password" type="password" autocomplete="current-password" />
        <p v-if="errorMessage" class="inline-message danger" role="alert">{{ errorMessage }}</p>
        <p v-if="successMessage" class="inline-message success" role="status">{{ successMessage }}</p>
        <BaseButton type="submit" block :loading="busy === 'login'">
          {{ busy === 'login' ? '正在登录' : '登录' }}
        </BaseButton>
      </form>
    </BaseCard>

    <template v-else-if="isAuthenticated">
      <div class="runtime-strip">
        <div><span>模式</span><strong>{{ runtime.mode }}</strong></div>
        <div><span>状态</span><strong>{{ runtime.status }}</strong></div>
        <div><span>阶段</span><strong>{{ runtime.stage }} · {{ stageNames[runtime.stage - 1] }}</strong></div>
        <div><span>版本</span><strong>R{{ runtime.stageRevision }} / E{{ runtime.resetEpoch }}</strong></div>
        <BaseButton variant="ghost" size="sm" :loading="busy === 'logout'" @click="logout">退出</BaseButton>
      </div>

      <div v-if="uncertainCommand" class="inline-message warning uncertain-command" role="alert">
        <span>上一次控制的结果尚未确认。其他控制保持锁定，安全重试会复用原请求与原幂等键。</span>
        <BaseButton
          size="sm"
          variant="secondary"
          :disabled="!realtime.canWrite.value"
          :loading="busy.startsWith('retry:')"
          @click="retryUncertainCommand"
        >安全重试原操作</BaseButton>
      </div>
      <p v-else-if="!realtime.canWrite.value" class="inline-message warning" role="status">
        实时状态尚未同步，所有控制已锁定；当前快照仍可查看。
      </p>
      <p v-if="errorMessage" class="inline-message danger" role="alert">{{ errorMessage }}</p>
      <p v-if="successMessage" class="inline-message success" role="status">{{ successMessage }}</p>

      <div class="console-grid">
        <BaseCard as="section" padding="md" aria-labelledby="roles-title">
          <div class="module-heading"><div><p class="eyebrow">会话 {{ session.shortId }}</p><h2 id="roles-title">当前能力</h2></div></div>
          <div class="role-grid">
            <div v-for="role in roles" :key="role.id" class="role-row">
              <span>{{ role.label }}</span>
              <StatusPill v-if="hasRole(role.id)" tone="success" size="sm">已取得</StatusPill>
              <BaseButton
                v-else
                size="sm"
                variant="secondary"
                :disabled="!canControl"
                :loading="busy === `role:${role.id}`"
                @click="elevate(role.id)"
              >取得权限</BaseButton>
            </div>
          </div>
        </BaseCard>

        <BaseCard as="section" padding="md" aria-labelledby="runtime-title">
          <div class="module-heading"><div><p class="eyebrow">运行控制</p><h2 id="runtime-title">阶段与模式</h2></div></div>
          <div class="form-stack">
            <label for="runtime-mode">运行模式</label>
            <div class="control-row">
              <select id="runtime-mode" v-model="selectedMode" :disabled="runtime.status !== 'READY'">
                <option value="REHEARSAL">排练</option>
                <option value="LIVE">现场</option>
              </select>
              <BaseButton
                variant="secondary"
                :disabled="!canControl || !hasRole('STAGE_CONTROLLER') || runtime.status !== 'READY' || selectedMode === runtime.mode"
                @click="setMode"
              >应用模式</BaseButton>
            </div>
            <div class="action-grid">
              <BaseButton :disabled="!canControl || !hasRole('STAGE_CONTROLLER') || runtime.status !== 'READY'" @click="runtimeAction('START')">开始</BaseButton>
              <BaseButton :disabled="!canControl || !hasRole('STAGE_CONTROLLER') || runtime.status !== 'RUNNING'" @click="runtimeAction('PAUSE')">暂停互动</BaseButton>
              <BaseButton :disabled="!canControl || !hasRole('STAGE_CONTROLLER') || runtime.status !== 'PAUSED'" @click="runtimeAction('RESUME')">恢复</BaseButton>
              <BaseButton :disabled="!canControl || !hasRole('STAGE_CONTROLLER') || runtime.mode !== 'LIVE' || runtime.status !== 'RUNNING' || runtime.stage >= 6" @click="runtimeAction('ADVANCE')">现场推进</BaseButton>
              <BaseButton variant="danger" :disabled="!canControl || !hasRole('STAGE_CONTROLLER') || runtime.stage !== 6 || runtime.status !== 'RUNNING'" @click="runtimeAction('COMPLETE')">结束活动</BaseButton>
            </div>
            <label for="target-stage">排练跳转阶段</label>
            <div class="control-row">
              <select id="target-stage" v-model.number="targetStage" :disabled="runtime.mode !== 'REHEARSAL'">
                <option v-for="(name, index) in stageNames" :key="name" :value="index + 1">{{ index + 1 }} · {{ name }}</option>
              </select>
              <BaseButton
                variant="secondary"
                :disabled="!canControl || !hasRole('STAGE_CONTROLLER') || runtime.mode !== 'REHEARSAL' || runtime.status !== 'RUNNING'"
                @click="jumpStage"
              >跳转</BaseButton>
            </div>
          </div>
        </BaseCard>

        <BaseCard as="section" padding="md" aria-labelledby="metrics-title">
          <div class="module-heading"><div><p class="eyebrow">匿名统计</p><h2 id="metrics-title">运行概况</h2></div></div>
          <dl class="metric-list">
            <div><dt>已激活</dt><dd>{{ snapshot.metrics.activatedCount }}</dd></div>
            <div><dt>参与者在线</dt><dd>{{ snapshot.metrics.onlineParticipantSessions }}</dd></div>
            <div><dt>有效激活</dt><dd>{{ snapshot.metrics.successfulActivations }}</dd></div>
            <div><dt>无效入口</dt><dd>{{ snapshot.metrics.invalidEntryAttempts }}</dd></div>
            <div><dt>公开弹幕</dt><dd>{{ snapshot.metrics.publishedBarrageCount }}</dd></div>
            <div><dt>最近失败</dt><dd>{{ snapshot.metrics.recentFailureCount }}</dd></div>
          </dl>
        </BaseCard>

        <BaseCard as="section" padding="md" aria-labelledby="programs-title">
          <div class="module-heading"><div><p class="eyebrow">固定虚构目录</p><h2 id="programs-title">节目与礼物</h2></div></div>
          <label for="current-program">当前节目</label>
          <div class="control-row">
            <select id="current-program" v-model="selectedProgramId">
              <option v-for="program in snapshot.programs" :key="program.id" :value="program.id">{{ program.order }} · {{ program.title }} · 热度 {{ program.heat }}</option>
            </select>
            <BaseButton variant="secondary" :disabled="!canControl || !hasRole('STAGE_CONTROLLER') || runtime.status !== 'RUNNING' || runtime.stage !== 4" @click="setProgram">设为当前</BaseButton>
          </div>
          <ul class="plain-list">
            <li v-for="gift in snapshot.gifts" :key="gift.id"><span>{{ gift.name }}</span><strong>{{ gift.powerCost }} 动力值</strong></li>
          </ul>
        </BaseCard>

        <BaseCard as="section" class="span-two" padding="md" aria-labelledby="barrages-title">
          <div class="module-heading split">
            <div><p class="eyebrow">只处理公共内容</p><h2 id="barrages-title">已发布弹幕</h2></div>
            <div class="module-actions">
              <BaseButton variant="secondary" size="sm" :disabled="!canControl || !hasRole('REVIEWER')" @click="toggleBarragePause">{{ runtime.barragePaused ? '恢复新弹幕' : '暂停新弹幕' }}</BaseButton>
              <BaseButton variant="danger" size="sm" :disabled="!canControl || !hasRole('DEMO_ADMIN')" @click="clearBarrages">紧急清屏</BaseButton>
            </div>
          </div>
          <p v-if="snapshot.publishedBarrages.length === 0" class="empty-state">当前没有公开弹幕。时光胶囊候选需由后续人工筛选模块处理。</p>
          <ul v-else class="moderation-list">
            <li v-for="barrage in snapshot.publishedBarrages" :key="barrage.id">
              <div><strong>{{ barrage.text }}</strong><small>#{{ barrage.displaySeq }} · {{ barrage.publishedAt }}</small></div>
              <div class="module-actions">
                <BaseButton size="sm" variant="secondary" :disabled="!canControl || !hasRole('REVIEWER')" @click="removeBarrage(barrage)">下屏</BaseButton>
                <BaseButton size="sm" variant="danger" :disabled="!canControl || !hasRole('REVIEWER')" @click="blockSource(barrage)">屏蔽来源</BaseButton>
              </div>
            </li>
          </ul>
        </BaseCard>

        <BaseCard as="section" class="span-two" padding="md" aria-labelledby="invitations-title">
          <div class="module-heading"><div><p class="eyebrow">仅显示脱敏提示</p><h2 id="invitations-title">邀请入口状态</h2></div></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>入口</th><th>合成身份</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="invitation in snapshot.invitations" :key="invitation.id">
                  <td>{{ invitation.tokenHint }}</td><td>{{ invitation.identityId }}</td><td>{{ invitation.status }}</td>
                  <td><BaseButton size="sm" :variant="invitation.status === 'ACTIVE' ? 'danger' : 'secondary'" :disabled="!canControl || !hasRole('DEMO_ADMIN')" @click="changeInvitation(invitation)">{{ invitation.status === 'ACTIVE' ? '撤销' : '恢复' }}</BaseButton></td>
                </tr>
              </tbody>
            </table>
          </div>
        </BaseCard>

        <BaseCard as="section" class="span-two" padding="md" aria-labelledby="operations-title">
          <div class="module-heading"><div><p class="eyebrow">不作个人身份归因</p><h2 id="operations-title">最近会话操作</h2></div></div>
          <p v-if="snapshot.recentOperations.length === 0" class="empty-state">当前没有会话操作记录。</p>
          <div v-else class="table-wrap operations-table">
            <table>
              <thead><tr><th>会话短 ID</th><th>当时角色</th><th>动作</th><th>结果</th><th>时间</th></tr></thead>
              <tbody>
                <tr v-for="(operation, index) in snapshot.recentOperations" :key="`${operation.sessionShortId}:${operation.createdAt}:${index}`">
                  <td>{{ operation.sessionShortId }}</td>
                  <td>{{ operation.roles.join(' / ') || '无' }}</td>
                  <td>{{ operation.action }}</td>
                  <td>{{ operation.result }}</td>
                  <td>{{ operation.createdAt }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </BaseCard>

        <BaseCard as="section" class="span-two danger-zone" padding="md" aria-labelledby="reset-title">
          <div><p class="eyebrow">危险操作</p><h2 id="reset-title">确定性重置</h2><p>清除激活、积分、内容、互动和旧会话；固定合成目录与邀请入口保持一致。</p></div>
          <BaseButton
            variant="danger"
            :disabled="!canControl || !hasRole('DEMO_ADMIN')"
            :loading="busy === `reset:${runtime.resetEpoch}` || busy.startsWith('retry:reset:')"
            @click="resetDemo"
          >重置 Demo</BaseButton>
        </BaseCard>
      </div>
    </template>
  </section>
</template>

<style scoped>
.console {
  width: min(1120px, 100%);
}

.console h1 {
  max-width: none;
}

.console-heading,
.module-heading,
.runtime-strip,
.control-row,
.module-actions,
.danger-zone {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

h2 {
  margin: var(--space-1) 0 var(--space-4);
  font-size: var(--font-size-xl);
}

p {
  color: var(--color-text-secondary);
  line-height: 1.55;
}

.login-card {
  width: min(520px, 100%);
  margin-top: var(--space-6);
}

.form-stack {
  display: grid;
  gap: var(--space-3);
}

label {
  font-weight: var(--font-weight-semibold);
}

input,
select {
  width: 100%;
  min-height: 48px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  background: var(--color-paper-100);
  font: inherit;
}

input:focus-visible,
select:focus-visible {
  outline: 3px solid var(--color-brand-primary);
  outline-offset: 2px;
}

.runtime-strip {
  margin: var(--space-5) 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border-strong);
  background: var(--color-paper-100);
  flex-wrap: wrap;
}

.runtime-strip div {
  display: grid;
  gap: 2px;
}

.runtime-strip span,
.moderation-list small {
  color: var(--color-text-secondary);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
}

.inline-message {
  margin: var(--space-4) 0;
  padding: 12px 14px;
  border-left: 5px solid currentColor;
  background: var(--color-paper-100);
}

.inline-message.warning { color: var(--color-warning); }
.inline-message.danger { color: var(--color-danger); }
.inline-message.success { color: var(--color-success); }

.uncertain-command {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.console-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.span-two {
  grid-column: 1 / -1;
}

.role-grid,
.metric-list,
.plain-list,
.moderation-list {
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
  list-style: none;
}

.role-row,
.plain-list li,
.moderation-list li {
  min-height: 52px;
  padding-block: var(--space-2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.control-row > :first-child {
  flex: 1;
}

.metric-list {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.metric-list div {
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border-subtle);
}

.metric-list dt {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.metric-list dd {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
}

.split {
  align-items: end;
}

.moderation-list li > div:first-child {
  min-width: 0;
  display: grid;
  gap: var(--space-1);
}

.moderation-list strong {
  overflow-wrap: anywhere;
}

.empty-state {
  padding: var(--space-5);
  border: 1px dashed var(--color-border-subtle);
}

.table-wrap {
  max-height: 360px;
  overflow: auto;
  border: 1px solid var(--color-border-subtle);
}

table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

th,
td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border-subtle);
  white-space: nowrap;
}

th {
  position: sticky;
  top: 0;
  background: var(--color-paper-300);
}

.danger-zone {
  border-left: 7px solid var(--color-danger);
}

@media (max-width: 820px) {
  .console-grid {
    grid-template-columns: 1fr;
  }

  .span-two {
    grid-column: auto;
  }

  .console-heading,
  .module-heading.split,
  .danger-zone {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 560px) {
  .metric-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .control-row,
  .module-actions,
  .uncertain-command {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
