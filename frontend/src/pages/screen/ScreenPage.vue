<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import BaseCard from '../../components/ui/BaseCard.vue'
import StatusPill from '../../components/ui/StatusPill.vue'
import { useRealtime } from '../../composables/useRealtime'
import { useReducedMotion } from '../../composables/useReducedMotion'
import { publicErrorMessage, screenApi } from '../../services/api'
import { starTemperatureStyle } from '../../services/star-temperature'
import { formationText, starFormationStyle } from '../../services/star-formation'
import {
  createRefreshCoalescer,
  shouldCommitSnapshot,
} from '../../services/refresh-coalescer'

const stageNames = ['身份激活', '时光胶囊', '星星集结', '节目应援', '协同点亮', '星际档案']
const snapshot = ref(null)
const loadError = ref('')
const staleSince = ref(null)
const giftEvents = ref([])
const giftTimers = new Set()
const reducedMotion = useReducedMotion()
const selectedStarId = ref(null)
const finalePhase = ref('idle')
let finaleTimer = null

async function refreshSnapshot() {
  try {
    await screenApi.ready()
    const next = await screenApi.snapshot()
    if (!shouldCommitSnapshot(snapshot.value, next)) return snapshot.value
    snapshot.value = next
    loadError.value = ''
    return next
  } catch (error) {
    loadError.value = publicErrorMessage(error)
    throw error
  }
}

function addGiftEvent(payload, sourceEvent) {
  const program = snapshot.value?.programs?.find((item) => item.id === payload.programId)
  const giftEvent = {
    id:
      sourceEvent?.eventId ??
      `${payload.programId}:${payload.giftId}:${sourceEvent?.eventSeq ?? Date.now()}`,
    giftId: payload.giftId,
    powerCost: payload.powerCost,
    programTitle: program?.title ?? '当前节目',
  }
  giftEvents.value = [giftEvent, ...giftEvents.value].slice(0, reducedMotion.value ? 4 : 8)
  if (!reducedMotion.value) {
    const timer = window.setTimeout(() => {
      giftEvents.value = giftEvents.value.filter((item) => item.id !== giftEvent.id)
      giftTimers.delete(timer)
    }, 3000)
    giftTimers.add(timer)
  }
}

function applyEvent(event) {
  if (!snapshot.value) return
  snapshot.value.eventSeq = Math.max(
    snapshot.value.eventSeq ?? 0,
    Number(event.eventSeq) || 0,
  )
  const payload = event.payload ?? {}
  switch (event.type) {
    case 'runtime.stage.changed':
      snapshot.value.runtime = { ...snapshot.value.runtime, ...payload }
      break
    case 'runtime.status.changed':
      snapshot.value.runtime = { ...snapshot.value.runtime, ...payload }
      break
    case 'program.changed':
      snapshot.value.runtime.currentProgramId = payload.programId
      snapshot.value.programs = snapshot.value.programs.map((program) => ({
        ...program,
        state: program.id === payload.programId ? 'CURRENT' : program.state === 'CURRENT' ? 'CLOSED' : program.state,
      }))
      break
    case 'participant.activated':
      snapshot.value.aggregates.activatedCount = payload.activatedCount
      break
    case 'aggregate.updated':
    case 'cooperation.updated':
      snapshot.value.aggregates = { ...snapshot.value.aggregates, ...payload }
      break
    case 'star.started':
      snapshot.value.aggregates.starStartedCount = payload.starStartedCount
      break
    case 'gift.accepted': {
      snapshot.value.programs = snapshot.value.programs.map((program) =>
        program.id === payload.programId ? { ...program, heat: payload.programHeat } : program,
      )
      addGiftEvent(payload, event)
      break
    }
    case 'barrage.published':
      snapshot.value.publishedBarrages = [
        ...snapshot.value.publishedBarrages.filter((item) => item.id !== payload.barrage.id),
        payload.barrage,
      ].sort((a, b) => a.displaySeq - b.displaySeq)
      break
    case 'barrage.removed':
    case 'source.blocked':
      snapshot.value.publishedBarrages = snapshot.value.publishedBarrages.filter(
        (item) => !(payload.barrageIds ?? []).includes(item.id),
      )
      break
    case 'barrage.cleared':
      snapshot.value.displayBatch = payload.displayBatch
      snapshot.value.publishedBarrages = []
      snapshot.value.runtime.stageRevision = payload.stageRevision
      break
    case 'barrage.pause.changed':
      snapshot.value.runtime = {
        ...snapshot.value.runtime,
        barragePaused: payload.paused,
        stageRevision: payload.stageRevision,
      }
      break
    case 'capsule.display.changed':
      snapshot.value.displayedCapsules = payload.displayedCapsules ?? []
      break
    default:
      break
  }
}

const realtimeRefresh = createRefreshCoalescer(refreshSnapshot, {
  delayMs: 50,
  onError: () => void realtime.resync('EVENT_REFRESH_FAILED'),
})

const realtime = useRealtime({
  stream: 'screen',
  protocolPolicy: 'v1-preview',
  resync: refreshSnapshot,
  onEvent: (event) => {
    applyEvent(event)
    realtimeRefresh.schedule()
  },
})

const runtime = computed(() => snapshot.value?.runtime ?? null)
const aggregates = computed(() => snapshot.value?.aggregates ?? {})
const currentProgram = computed(() =>
  snapshot.value?.programs?.find((program) => program.id === runtime.value?.currentProgramId)
  ?? snapshot.value?.programs?.find((program) => program.state === 'CURRENT'),
)
const nextProgram = computed(() =>
  snapshot.value?.programs?.find((program) => program.state === 'NEXT'),
)
const cooperationPercent = computed(() => {
  const eligible = aggregates.value.eligibleParticipantCount ?? 0
  if (eligible === 0) return 0
  return Math.min(100, Math.round(((aggregates.value.cooperativeLightCount ?? 0) / eligible) * 100))
})
const visibleBarrages = computed(() => snapshot.value?.publishedBarrages?.slice(-14) ?? [])
const visibleStars = computed(() => snapshot.value?.starNodes?.slice(0, 300) ?? [])
const displayedCapsules = computed(() => snapshot.value?.displayedCapsules ?? [])
const selectedStar = computed(() =>
  visibleStars.value.find((star) => star.id === selectedStarId.value) ?? null,
)
const finaleIntensity = computed(() => {
  const active = aggregates.value.activatedCount || 1
  const averageStarlight = (aggregates.value.totalStarlight || 0) / active
  return Math.min(1, Math.max(0.42, averageStarlight / 100))
})
const connectionTone = computed(() =>
  realtime.state.value === 'online'
    ? 'success'
    : ['offline', 'protocol_error'].includes(realtime.state.value)
      ? 'danger'
      : 'warning',
)
const connectionLabel = computed(() => {
  if (realtime.state.value === 'protocol_error') {
    return realtime.lastError.value || '协议版本不兼容'
  }
  const labels = {
    online: '实时',
    offline: '离线',
    syncing: '同步快照',
    connecting: '连接中',
    reconnecting: '重连中',
  }
  return labels[realtime.state.value] ?? '准备中'
})

watch(
  () => realtime.state.value,
  (state) => {
    if (state === 'online') staleSince.value = null
    else staleSince.value ??= new Date().toLocaleTimeString('zh-CN', { hour12: false })
  },
  { immediate: true },
)

watch(
  () => runtime.value?.status,
  (status, previousStatus) => {
    if (finaleTimer !== null) {
      window.clearTimeout(finaleTimer)
      finaleTimer = null
    }
    if (status !== 'COMPLETED') {
      finalePhase.value = 'idle'
      return
    }
    // When the screen is already open, retain the short closing animation.
    // A newly opened screen at COMPLETED goes straight to the locked end card.
    if (previousStatus && previousStatus !== 'COMPLETED' && !reducedMotion.value) {
      finalePhase.value = 'gathering'
      finaleTimer = window.setTimeout(() => {
        finalePhase.value = 'locked'
        finaleTimer = null
      }, 5200)
      return
    }
    finalePhase.value = 'locked'
  },
)

function selectStar(starId) {
  selectedStarId.value = selectedStarId.value === starId ? null : starId
}

function formationStyle(star, index) {
  return {
    ...starFormationStyle(star, index),
    ...starTemperatureStyle(star.starTemperatureKelvin),
  }
}

onBeforeUnmount(() => {
  realtimeRefresh.cancel()
  giftTimers.forEach((timer) => window.clearTimeout(timer))
  giftTimers.clear()
  if (finaleTimer !== null) window.clearTimeout(finaleTimer)
})
</script>

<template>
  <section class="screen-stage live-screen" aria-labelledby="screen-title">
    <header class="screen-heading compact">
      <div>
        <p class="eyebrow">智能工程学院 · 迎新互动现场</p>
        <h1 id="screen-title">{{ runtime ? stageNames[runtime.stage - 1] : '智工星域' }}</h1>
      </div>
      <div class="screen-status" aria-live="polite">
        <StatusPill v-if="runtime?.mode === 'REHEARSAL'" tone="warning">排练模式</StatusPill>
        <StatusPill :tone="connectionTone">{{ connectionLabel }}</StatusPill>
      </div>
    </header>

    <BaseCard v-if="!snapshot" class="screen-message" variant="outline" padding="lg">
      <p class="eyebrow">{{ realtime.state.value === 'syncing' ? '正在同步' : '尚未就绪' }}</p>
      <h2>{{ loadError || '正在读取现场权威快照…' }}</h2>
      <p>页面会自动重试；请勿通过刷新或手工数据模拟绕过未就绪状态。</p>
    </BaseCard>

    <template v-else>
      <div v-if="realtime.state.value === 'protocol_error'" class="safe-banner" role="alert">
        {{ realtime.lastError.value || '协议版本不兼容，实时连接已停止。' }}
      </div>
      <div v-else-if="realtime.state.value !== 'online'" class="safe-banner" role="status">
        实时连接中断，保留 {{ snapshot.generatedAt }} 的最后可信快照
        <span v-if="staleSince">· {{ staleSince }} 起正在重连</span>
      </div>
      <div v-if="runtime.status === 'READY'" class="safe-banner ready" role="status">
        系统已就绪，等待后台开始活动
      </div>
      <div v-if="runtime.status === 'PAUSED'" class="safe-banner paused" role="status">
        现场互动已暂停 · 当前画面保持静态
      </div>

      <div class="scene" :data-stage="runtime.stage" aria-label="现场阶段画面">
        <section v-if="runtime.status === 'COMPLETED' && finalePhase === 'locked'" class="final-lock-scene" aria-labelledby="final-lock-title">
          <p class="scene-kicker">INTELLIGENT ENGINEERING · 2026</p>
          <div class="final-lock-scene__glow" aria-hidden="true"></div>
          <h2 id="final-lock-title">智工星河<br />迎新晚会圆满结束</h2>
          <p>每一束星光，都会成为下一段旅程的起点。</p>
          <span>感谢 {{ aggregates.activatedCount }} 位新同学共同点亮今晚</span>
        </section>

        <section v-else-if="runtime.stage === 1" class="activation-scene" aria-labelledby="activation-title">
          <p class="scene-kicker">SIGNAL RECEIVED</p>
          <h2 id="activation-title">新的信标正在接入</h2>
          <strong class="hero-number">{{ aggregates.activatedCount }}</strong>
          <p>个匿名参与状态已经激活</p>
          <div class="scene-metrics">
            <div><span>已创建星星</span><strong>{{ aggregates.starCreatedCount }}</strong></div>
            <div><span>累计星光</span><strong>{{ aggregates.totalStarlight }}</strong></div>
          </div>
        </section>

        <section v-else-if="runtime.stage === 2" class="message-scene" aria-labelledby="message-title">
          <p class="scene-kicker">TIME CAPSULE CANDIDATES</p>
          <h2 id="message-title">把此刻留在星海</h2>
          <p v-if="displayedCapsules.length === 0" class="scene-copy">参与者提交的内容会进入人工筛选候选池；等待后台选中第一条星光寄语。</p>
          <div v-else class="capsule-wall" aria-label="人工选中的时光胶囊">
            <article v-for="capsule in displayedCapsules" :key="capsule.publicStarId" class="capsule-display-card">
              <i aria-hidden="true" :style="starTemperatureStyle(capsule.starTemperatureKelvin)"></i>
              <blockquote>{{ capsule.text }}</blockquote>
              <footer>{{ capsule.publicStarId }}</footer>
            </article>
          </div>
          <div v-if="displayedCapsules.length === 0" class="scene-metrics">
            <div><span>匿名参与者</span><strong>{{ aggregates.activatedCount }}</strong></div>
            <div><span>累计星光</span><strong>{{ aggregates.totalStarlight }}</strong></div>
          </div>
        </section>

        <section v-else-if="runtime.stage === 3" class="star-scene" aria-labelledby="star-title">
          <div class="scene-title-row">
            <div><p class="scene-kicker">STAR ASSEMBLY</p><h2 id="star-title">{{ formationText }} 启动仪式</h2></div>
            <strong>{{ aggregates.starStartedCount }} / {{ aggregates.starCreatedCount }}</strong>
          </div>
          <p class="formation-instruction">星群正在汇入「{{ formationText }}」；点击任意星点可查看它的公开代号。</p>
          <div class="formation-field" :class="{ static: reducedMotion }" aria-label="智工2026 星群集结">
            <button
              v-for="(star, index) in visibleStars"
              :key="star.id"
              type="button"
              class="formation-star"
              :class="{ selected: selectedStarId === star.id, started: star.started }"
              :style="formationStyle(star, index)"
              :aria-label="`查看星号 ${star.id}`"
              :aria-pressed="selectedStarId === star.id"
              :tabindex="selectedStarId ? (selectedStarId === star.id ? 0 : -1) : (index === 0 ? 0 : -1)"
              @click="selectStar(star.id)"
            ></button>
          </div>
          <p v-if="selectedStar" class="star-callout" role="status">公开星号 · {{ selectedStar.id }}</p>
          <p v-if="visibleStars.length === 0" class="empty-screen-state">等待参与者启动第一颗匿名星星</p>
        </section>

        <section v-else-if="runtime.stage === 4" class="program-scene" aria-labelledby="program-title">
          <div class="program-main">
            <p class="scene-kicker">NOW SUPPORTING</p>
            <h2 id="program-title">{{ currentProgram?.title ?? '等待选择节目' }}</h2>
            <strong class="heat">热度 {{ currentProgram?.heat ?? 0 }}</strong>
            <p v-if="nextProgram">下一节目 · {{ nextProgram.title }}</p>
            <div class="gift-feed" aria-label="最近匿名礼物事件">
              <span v-for="gift in giftEvents" :key="gift.id">
                {{ gift.programTitle }} · {{ gift.giftId }} · +{{ gift.powerCost }}
              </span>
            </div>
          </div>
          <aside class="barrage-board" aria-label="公开匿名弹幕">
            <div class="board-heading"><strong>现场弹幕</strong><StatusPill v-if="runtime.barragePaused" tone="warning">暂停接收</StatusPill></div>
            <p v-if="visibleBarrages.length === 0" class="empty-screen-state">等待第一条合规弹幕</p>
            <ul v-else>
              <li v-for="barrage in visibleBarrages" :key="barrage.id">{{ barrage.text }}</li>
            </ul>
          </aside>
        </section>

        <section v-else-if="runtime.stage === 5" class="cooperation-scene" aria-labelledby="cooperation-title">
          <p class="scene-kicker">COOPERATIVE LIGHT</p>
          <h2 id="cooperation-title">全场协同点亮</h2>
          <strong class="hero-number">{{ cooperationPercent }}%</strong>
          <div class="progress" role="progressbar" aria-label="协同点亮进度" :aria-valuenow="cooperationPercent" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ width: `${cooperationPercent}%` }"></span>
          </div>
          <p>{{ aggregates.cooperativeLightCount }} / {{ aggregates.eligibleParticipantCount }} 位有效参与者已点亮</p>
        </section>

        <section v-else-if="runtime.status === 'COMPLETED'" class="finale-formation" :style="{ '--finale-intensity': finaleIntensity }" aria-labelledby="finale-title">
          <p class="scene-kicker">STARLIGHT FINALE</p>
          <h2 id="finale-title">{{ formationText }}</h2>
          <p>每一颗星都带着今晚积累的星光，正在共同闪耀。</p>
          <div class="formation-field formation-field--finale" :class="{ static: reducedMotion }" aria-label="由星光点亮的智工2026">
            <button
              v-for="(star, index) in visibleStars"
              :key="star.id"
              type="button"
              class="formation-star"
              :class="{ selected: selectedStarId === star.id, started: star.started }"
              :style="formationStyle(star, index)"
              :aria-label="`查看星号 ${star.id}`"
              :aria-pressed="selectedStarId === star.id"
              :tabindex="selectedStarId ? (selectedStarId === star.id ? 0 : -1) : (index === 0 ? 0 : -1)"
              @click="selectStar(star.id)"
            ></button>
          </div>
          <p v-if="selectedStar" class="star-callout" role="status">公开星号 · {{ selectedStar.id }}</p>
        </section>

        <section v-else class="archive-scene" aria-labelledby="archive-title">
          <p class="scene-kicker">COLLECTIVE ARCHIVE</p>
          <h2 id="archive-title">这一夜汇聚成我们的星域</h2>
          <div class="archive-metrics">
            <div><span>激活人数</span><strong>{{ aggregates.activatedCount }}</strong></div>
            <div><span>星光总量</span><strong>{{ aggregates.totalStarlight }}</strong></div>
            <div><span>互动次数</span><strong>{{ aggregates.interactionCount }}</strong></div>
            <div><span>完成点亮</span><strong>{{ aggregates.cooperativeLightCount }}</strong></div>
          </div>
          <div class="level-list" aria-label="匿名等级分布">
            <span v-for="(count, level) in aggregates.levelDistribution" :key="level"><b>{{ level }}</b>{{ count }}</span>
          </div>
          <div class="archive-star-field" :class="{ static: reducedMotion }" aria-label="匿名集体星图" data-motion="decorative">
            <i
              v-for="star in visibleStars"
              :key="star.id"
              :class="{ started: star.started }"
              :style="starTemperatureStyle(star.starTemperatureKelvin)"
            ></i>
          </div>
        </section>
      </div>

      <footer class="screen-footer">
        <span>{{ runtime.status }} · 阶段 {{ runtime.stage }} / 6</span>
        <span>R{{ runtime.stageRevision }} · E{{ runtime.resetEpoch }}</span>
        <span v-if="reducedMotion">减少动态效果</span>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.live-screen {
  width: 100%;
  min-width: 0;
  color: var(--color-on-dark);
}

.screen-heading.compact {
  margin-bottom: clamp(16px, 2vh, 28px);
}

.screen-heading.compact h1 {
  max-width: none;
  font-size: clamp(2.7rem, 5vw, 5.6rem);
}

.screen-status,
.scene-title-row,
.board-heading,
.screen-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.screen-message {
  --card-color: var(--color-on-dark);
  --card-border-color: rgba(247, 243, 234, 0.5);
  min-height: 320px;
  display: grid;
  place-content: center;
  text-align: center;
}

.screen-message h2 {
  margin: var(--space-3) 0;
  font-size: clamp(2rem, 4vw, 4rem);
}

.safe-banner {
  margin-bottom: var(--space-3);
  padding: 10px 14px;
  border-left: 7px solid var(--color-danger);
  color: var(--color-on-dark);
  background: rgba(179, 38, 50, 0.28);
  font-weight: var(--font-weight-semibold);
}

.safe-banner.ready {
  border-color: var(--color-info);
  background: rgba(23, 70, 209, 0.3);
}

.safe-banner.paused {
  border-color: var(--color-warning);
  background: rgba(140, 77, 0, 0.3);
}

.scene {
  min-height: min(60vh, 650px);
  border: 1px solid rgba(247, 243, 234, 0.5);
  overflow: hidden;
}

.scene > section {
  min-height: inherit;
  padding: clamp(24px, 4vw, 64px);
}

.scene-kicker {
  margin: 0 0 var(--space-3);
  color: var(--color-signal-orange);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  letter-spacing: 0.12em;
}

.scene h2 {
  margin: 0;
  color: var(--color-on-dark);
  font-size: clamp(2.8rem, 6vw, 7rem);
  line-height: 0.98;
  overflow-wrap: anywhere;
}

.activation-scene,
.message-scene,
.cooperation-scene,
.archive-scene {
  display: grid;
  align-content: center;
  justify-items: start;
}

.hero-number {
  margin-top: var(--space-5);
  color: var(--color-on-dark);
  font-size: clamp(6rem, 14vw, 13rem);
  line-height: 0.85;
  font-variant-numeric: tabular-nums;
}

.scene-copy {
  max-width: 44ch;
  font-size: clamp(1.2rem, 2vw, 2rem);
  line-height: 1.55;
}

.scene-metrics,
.archive-metrics {
  width: 100%;
  margin-top: var(--space-6);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: rgba(247, 243, 234, 0.35);
}

.scene-metrics div,
.archive-metrics div {
  padding: var(--space-4);
  display: grid;
  gap: var(--space-2);
  background: rgba(23, 25, 29, 0.92);
}

.scene-metrics strong,
.archive-metrics strong {
  font-size: clamp(2rem, 4vw, 4.5rem);
  font-variant-numeric: tabular-nums;
}

.star-scene {
  display: grid;
  grid-template-rows: auto auto minmax(260px, 1fr) auto;
  gap: var(--space-3);
}

.scene-title-row > strong {
  font-size: clamp(2rem, 4vw, 4rem);
}

.formation-instruction {
  margin: 0;
  color: rgba(247, 243, 234, 0.72);
  font-size: clamp(0.9rem, 1.4vw, 1.18rem);
}

.formation-field {
  position: relative;
  min-height: 270px;
  overflow: hidden;
  border: 1px solid rgba(247, 243, 234, 0.2);
  background:
    radial-gradient(ellipse at center, rgba(116, 137, 210, 0.13), transparent 58%),
    rgba(4, 8, 20, 0.5);
}

.formation-star {
  position: absolute;
  display: grid;
  width: 44px;
  height: 44px;
  left: var(--star-x);
  top: var(--star-y);
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transform: translate(-50%, -50%);
  animation: star-assemble 2.9s var(--motion-ease-emphasized) var(--star-delay) both;
}

.capsule-wall {
  width: 100%;
  margin-top: var(--space-5);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.capsule-display-card {
  min-height: 180px;
  padding: var(--space-5);
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: var(--space-3);
  border: 1px solid rgba(247, 243, 234, 0.2);
  border-radius: var(--radius-lg);
  background: rgba(23, 25, 29, 0.9);
}

.capsule-display-card i {
  width: 12px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--star-temperature-color);
  box-shadow: 0 0 18px var(--star-temperature-color);
}

.capsule-display-card blockquote {
  margin: 0;
  color: var(--color-on-dark);
  font-size: clamp(1.25rem, 2vw, 2rem);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.capsule-display-card footer {
  color: rgba(247, 243, 234, 0.68);
  font-family: var(--font-family-mono);
  letter-spacing: 0.12em;
}

.formation-star::before {
  width: var(--star-size);
  height: var(--star-size);
  border-radius: 50%;
  background: var(--star-temperature-color, var(--color-signal-orange));
  box-shadow: 0 0 10px color-mix(in srgb, var(--star-temperature-color, var(--color-signal-orange)) 88%, white), 0 0 22px color-mix(in srgb, var(--star-temperature-color, var(--color-signal-orange)) 62%, transparent);
  content: '';
}

.formation-star.selected {
  z-index: 2;
  outline: 2px solid rgba(255, 255, 255, 0.94);
  outline-offset: -7px;
}

.formation-star.selected::before {
  box-shadow: 0 0 12px white, 0 0 32px var(--star-temperature-color);
}

.formation-field.static .formation-star {
  animation: none;
}

.star-callout {
  min-height: 1.5em;
  margin: 0;
  color: var(--color-on-dark);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  letter-spacing: 0.08em;
}

.program-scene {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: clamp(24px, 4vw, 64px);
}

.program-main {
  align-self: center;
}

.heat {
  margin-top: var(--space-5);
  display: block;
  color: var(--color-signal-orange);
  font-size: clamp(2rem, 4vw, 4.5rem);
}

.gift-feed {
  min-height: 72px;
  margin-top: var(--space-5);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.gift-feed span {
  padding: 8px 10px;
  border: 1px solid var(--color-signal-orange);
  animation: content-enter var(--motion-duration-base) var(--motion-ease-standard) both;
}

.barrage-board {
  min-width: 0;
  padding: var(--space-5);
  border-left: 1px solid rgba(247, 243, 234, 0.4);
  background: rgba(247, 243, 234, 0.06);
}

.barrage-board ul {
  margin: var(--space-4) 0 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
  list-style: none;
}

.barrage-board li {
  padding: 8px 10px;
  border-left: 4px solid var(--color-registration-blue);
  background: rgba(247, 243, 234, 0.08);
  font-size: clamp(1rem, 1.4vw, 1.4rem);
  overflow-wrap: anywhere;
}

.empty-screen-state {
  color: rgba(247, 243, 234, 0.7);
}

.progress {
  width: 100%;
  height: 28px;
  margin-top: var(--space-6);
  border: 1px solid rgba(247, 243, 234, 0.6);
}

.progress span {
  height: 100%;
  display: block;
  background: var(--color-signal-orange);
  transition: width var(--motion-duration-slow) var(--motion-ease-emphasized);
}

.archive-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.level-list {
  width: 100%;
  margin-top: var(--space-4);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

.level-list span {
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid rgba(247, 243, 234, 0.35);
  display: grid;
  gap: var(--space-1);
  font-size: var(--font-size-xl);
}

.level-list b {
  color: rgba(247, 243, 234, 0.65);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  overflow-wrap: anywhere;
}

.archive-star-field {
  width: 100%;
  max-height: 130px;
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid rgba(247, 243, 234, 0.35);
  display: grid;
  grid-template-columns: repeat(30, minmax(3px, 1fr));
  gap: 4px;
  overflow: hidden;
}

.archive-star-field i {
  width: 100%;
  aspect-ratio: 1;
  border: 1px solid rgba(247, 243, 234, 0.28);
  background: rgba(247, 243, 234, 0.1);
}

.archive-star-field i.started {
  border-color: var(--star-temperature-color, var(--color-signal-orange));
  background: var(--star-temperature-color, var(--color-signal-orange));
  animation: signal-node-settle var(--motion-duration-slow) var(--motion-ease-emphasized) both;
}

.archive-star-field.static i.started {
  animation: none;
}

.finale-formation {
  display: grid;
  grid-template-rows: auto auto minmax(300px, 1fr) auto;
  align-content: center;
  gap: var(--space-3);
}

.finale-formation > p:not(.scene-kicker, .star-callout) {
  margin: 0;
  color: rgba(247, 243, 234, 0.72);
}

.formation-field--finale {
  min-height: 330px;
  border-color: color-mix(in srgb, var(--color-signal-orange) 62%, rgba(247, 243, 234, 0.24));
  box-shadow: 0 0 38px rgba(255, 193, 111, 0.22);
}

.formation-field--finale .formation-star {
  opacity: calc(0.44 + var(--finale-intensity) * 0.56);
  animation: star-assemble 2.9s var(--motion-ease-emphasized) var(--star-delay) both, finale-star-glow 1.8s ease-in-out 3.3s infinite alternate;
}

.formation-field--finale.static .formation-star {
  animation: none;
}

.final-lock-scene {
  position: relative;
  display: grid;
  place-content: center;
  justify-items: center;
  overflow: hidden;
  text-align: center;
}

.final-lock-scene__glow {
  position: absolute;
  width: min(68vw, 760px);
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 219, 155, 0.24), rgba(139, 170, 255, 0.1) 38%, transparent 70%);
  filter: blur(10px);
}

.final-lock-scene > *:not(.final-lock-scene__glow) {
  position: relative;
  z-index: 1;
}

.final-lock-scene h2 {
  max-width: 12em;
  margin: var(--space-2) 0 var(--space-4);
  text-shadow: 0 0 32px rgba(255, 218, 153, 0.4);
}

.final-lock-scene p:not(.scene-kicker) {
  margin: 0;
  color: rgba(247, 243, 234, 0.78);
  font-size: clamp(1rem, 1.8vw, 1.45rem);
}

.final-lock-scene span {
  margin-top: var(--space-6);
  color: var(--color-accent-on-dark);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  letter-spacing: 0.08em;
}

@keyframes star-assemble {
  from {
    opacity: 0;
    left: calc(var(--star-x) + var(--star-from-x));
    top: calc(var(--star-y) + var(--star-from-y));
    transform: translate(-50%, -50%) scale(0.45);
  }
  72% { opacity: 1; }
  to {
    opacity: 1;
    left: var(--star-x);
    top: var(--star-y);
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes finale-star-glow {
  from { filter: brightness(1) drop-shadow(0 0 4px var(--star-temperature-color)); }
  to { filter: brightness(1.85) drop-shadow(0 0 14px var(--star-temperature-color)); }
}

.screen-footer {
  min-height: 44px;
  color: rgba(247, 243, 234, 0.7);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
}

@media (max-width: 900px) {
  .program-scene {
    grid-template-columns: 1fr;
  }

  .barrage-board {
    border-top: 1px solid rgba(247, 243, 234, 0.4);
    border-left: 0;
  }

  .archive-metrics,
  .level-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
