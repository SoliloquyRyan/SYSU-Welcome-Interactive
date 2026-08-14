<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useV2ScreenRealtime } from '../../composables/useV2ScreenRealtime'
import { v2ScreenApi } from '../../services/api'
import { createGalaxyRenderer } from './galaxy-renderer'

const sceneCopy = {
  ASSEMBLY: { title: '星海集结', subtitle: '每一颗抵达的星，正在汇入同一片星河' },
  PROGRAM_SUPPORT: { title: '节目共振', subtitle: '此刻的欢呼，正在现场发生' },
  COOPERATIVE_LIGHT: { title: '协同点亮', subtitle: '让彼此的光，在这一刻连成星海' },
}

const snapshot = ref(null)
const root = ref(null)
const canvas = ref(null)
const sceneLayer = ref(null)
const giftLayer = ref(null)
const finaleLayer = ref(null)
const initialBarrages = ref([])
const liveBarrages = ref([])
const gifts = ref([])
const errorMessage = ref('')
const reducedMotion = ref(false)
const finalePlayed = ref(false)
let renderer = null
let gsap = null
let gsapContext = null
let barrageSerial = 0
let giftSerial = 0
const giftTimers = new Map()
const barrageTimers = new Set()
const activeAnimations = new Set()

const runtime = computed(() => snapshot.value?.runtime)
const presentation = computed(() => snapshot.value?.presentation ?? { type: 'NONE' })
const currentScene = computed(() => runtime.value?.currentScene ?? 'ASSEMBLY')
const completed = computed(() => runtime.value?.status === 'COMPLETED')
const previewingFinale = computed(() => presentation.value.type === 'FINALE_PREVIEW')
const capsuleInsert = computed(() => presentation.value.type === 'CAPSULE_INSERT')
const interactionVisible = computed(() =>
  runtime.value?.status === 'RUNNING'
  && currentScene.value === 'PROGRAM_SUPPORT'
  && presentation.value.type === 'NONE',
)
const currentProgramTitle = computed(() => snapshot.value?.currentProgram?.title ?? '现场节目')
const scene = computed(() => sceneCopy[currentScene.value] ?? sceneCopy.ASSEMBLY)
const staticBarrages = computed(() => reducedMotion.value
  ? snapshot.value?.publishedBarrages?.slice(-8) ?? []
  : initialBarrages.value)
const connectionLabel = computed(() => {
  if (realtime.state.value === 'online') return ''
  if (realtime.lastError.value) return realtime.lastError.value
  return realtime.state.value === 'reconnecting' ? '现场信号恢复中' : '正在连接权威现场状态'
})

function putSnapshot(next, { reconnect = false } = {}) {
  const hadSnapshot = snapshot.value !== null
  const wasCompleted = snapshot.value?.runtime.status === 'COMPLETED'
  snapshot.value = next
  initialBarrages.value = next.publishedBarrages.slice(-8)
  if (reconnect) {
    liveBarrages.value = []
    gifts.value = []
  }
  renderer?.setStars(next.publicStars)
  renderer?.setMode(next.runtime.currentScene)
  if (hadSnapshot && !wasCompleted && next.runtime.status === 'COMPLETED') {
    void playFinale()
  }
}

async function refresh(options = {}) {
  const next = await v2ScreenApi.snapshot()
  putSnapshot(next, options)
  return next
}

function removeLiveBarrage(id) {
  liveBarrages.value = liveBarrages.value.filter((item) => item.barrageId !== id)
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

async function animateBarrage(barrage) {
  if (!interactionVisible.value || reducedMotion.value) return
  const item = { ...barrage, visualId: ++barrageSerial, lane: barrageSerial % 6 }
  liveBarrages.value = [...liveBarrages.value.slice(-7), item]
  await nextTick()
  const element = root.value?.querySelector(`[data-barrage-visual="${item.visualId}"]`)
  if (!element) return
  if (!gsap) {
    const timer = window.setTimeout(() => {
      barrageTimers.delete(timer)
      removeLiveBarrage(item.barrageId)
    }, 6200)
    barrageTimers.add(timer)
    return
  }
  let tween
  tween = trackAnimation(gsap.fromTo(element, { x: '112vw', opacity: 0 }, {
    x: '-125vw', opacity: 1, duration: 6.1, ease: 'none',
    onComplete: () => {
      activeAnimations.delete(tween)
      removeLiveBarrage(item.barrageId)
    },
  }))
}

function giftKind(gift) {
  const value = `${gift.giftId} ${gift.giftName}`.toLowerCase()
  if (/starship|ship|星舰|飞船/.test(value)) return 'starship'
  if (/rocket|火箭/.test(value)) return 'rocket'
  return 'spark'
}

async function animateGift(gift) {
  if (!interactionVisible.value) return
  const now = Date.now()
  const existing = gifts.value.find((item) =>
    item.giftId === gift.giftId && now - item.lastAt <= 1500,
  )
  if (existing) {
    existing.count += 1
    existing.lastAt = now
    gifts.value = [...gifts.value]
    const oldTimer = giftTimers.get(existing.visualId)
    if (oldTimer) clearTimeout(oldTimer)
    giftTimers.set(existing.visualId, setTimeout(() => removeGift(existing.visualId), 2600))
    return
  }
  const item = { ...gift, visualId: ++giftSerial, count: 1, lastAt: now, kind: giftKind(gift) }
  gifts.value = [...gifts.value.slice(-1), item]
  await nextTick()
  const element = root.value?.querySelector(`[data-gift-visual="${item.visualId}"]`)
  if (gsap && element && !reducedMotion.value) {
    let tween
    tween = trackAnimation(gsap.fromTo(element, { scale: 0.72, y: 28, opacity: 0 }, {
      scale: 1, y: 0, opacity: 1, duration: 0.62, ease: 'back.out(1.7)',
      onComplete: () => activeAnimations.delete(tween),
    }))
  }
  giftTimers.set(item.visualId, setTimeout(() => removeGift(item.visualId), item.kind === 'starship' ? 3600 : 2600))
}

function removeGift(visualId) {
  gifts.value = gifts.value.filter((item) => item.visualId !== visualId)
  const timer = giftTimers.get(visualId)
  if (timer) clearTimeout(timer)
  giftTimers.delete(visualId)
}

async function playSceneTransition() {
  if (!sceneLayer.value || !gsap || reducedMotion.value || completed.value) return
  let tween
  tween = trackAnimation(gsap.fromTo(sceneLayer.value, { opacity: 0, y: 16 }, {
    opacity: 1, y: 0, duration: 0.72, ease: 'power2.out', overwrite: true,
    onComplete: () => activeAnimations.delete(tween),
  }))
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
    snapshot.value.runtime = payload.runtime
    renderer?.setMode(payload.runtime.currentScene)
    liveBarrages.value = []
    gifts.value = []
    await playSceneTransition()
    if (payload.runtime.status === 'COMPLETED') await playFinale()
  } else if (frame.name === 'presentation.changed') {
    snapshot.value.presentation = payload.presentation
    snapshot.value.presentationRevision = payload.presentationRevision
    if (payload.presentation.type !== 'NONE') {
      stopTrackedAnimations()
      liveBarrages.value = []
      gifts.value = []
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
    liveBarrages.value = liveBarrages.value.filter((item) => !payload.barrageIds.includes(item.barrageId))
  } else if (frame.name === 'barrage.cleared') {
    snapshot.value.interaction = { ...snapshot.value.interaction, interactionRevision: payload.interactionRevision, displayBatch: payload.displayBatch }
    snapshot.value.publishedBarrages = []
    initialBarrages.value = []
    liveBarrages.value = []
  } else if (frame.name === 'barrage.pause.changed') {
    snapshot.value.interaction = { ...snapshot.value.interaction, interactionRevision: payload.interactionRevision, barragePaused: payload.paused }
  } else if (frame.name === 'gift.sent') {
    snapshot.value.interaction.interactionRevision = payload.interactionRevision
    await animateGift(payload.gift)
  } else if (frame.name === 'program.changed') {
    await refresh()
  }
}

const realtime = useV2ScreenRealtime({ snapshot, refresh, onLiveEvent })

watch(currentScene, (next) => {
  renderer?.setMode(next)
  document.documentElement.classList.toggle('v2-program-overlay', next === 'PROGRAM_SUPPORT' && !completed.value)
})
watch(completed, (next) => {
  document.documentElement.classList.toggle('v2-program-overlay', currentScene.value === 'PROGRAM_SUPPORT' && !next)
})

onMounted(async () => {
  document.documentElement.classList.add('v2-screen-active')
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.value = media.matches
  if (canvas.value) renderer = createGalaxyRenderer(canvas.value, { reduced: reducedMotion.value })
  if (!reducedMotion.value) {
    try {
      const module = await import('gsap')
      gsap = module.gsap
      gsapContext = gsap.context(() => {}, root.value)
    } catch { /* CSS/static fallback remains complete */ }
  }
  try { await realtime.connect() } catch (error) { errorMessage.value = error?.message ?? '大屏启动失败' }
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('v2-screen-active', 'v2-program-overlay')
  renderer?.destroy()
  stopTrackedAnimations()
  gsapContext?.revert()
  for (const timer of barrageTimers) clearTimeout(timer)
  barrageTimers.clear()
  for (const timer of giftTimers.values()) clearTimeout(timer)
  giftTimers.clear()
})
</script>

<template>
  <section ref="root" class="v2-screen" :class="[`scene-${currentScene.toLowerCase()}`, { 'is-completed': completed }]">
    <canvas ref="canvas" class="v2-galaxy" aria-hidden="true"></canvas>

    <p v-if="connectionLabel || errorMessage" class="v2-signal" role="status">
      {{ errorMessage || connectionLabel }}
    </p>

    <template v-if="snapshot">
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
          <ul v-if="snapshot.finalRecap.length" class="v2-finale__capsules" aria-label="终章回顾">
            <li v-for="capsule in snapshot.finalRecap" :key="capsule.capsuleId">{{ capsule.text }}</li>
          </ul>
        </div>
      </div>

      <div v-else-if="capsuleInsert" class="v2-capsule-insert">
        <p class="v2-kicker">此刻 · 星语</p>
        <ul>
          <li v-for="capsule in presentation.capsules" :key="capsule.capsuleId" :style="{ '--capsule-color': capsule.displayColor }">
            <span aria-hidden="true"></span><p>{{ capsule.text }}</p>
          </li>
        </ul>
      </div>

      <div v-else ref="sceneLayer" class="v2-scene-copy">
        <p v-if="runtime.mode === 'REHEARSAL'" class="v2-rehearsal">排练模式</p>
        <p class="v2-kicker">SYSU · WELCOME NIGHT</p>
        <h1>{{ currentScene === 'PROGRAM_SUPPORT' ? currentProgramTitle : scene.title }}</h1>
        <p>{{ scene.subtitle }}</p>
        <div v-if="currentScene !== 'PROGRAM_SUPPORT'" class="v2-count">
          <strong>{{ snapshot.aggregate.publicStarCount }}</strong><span>/ 300 颗真实星点</span>
        </div>
      </div>

      <div v-if="interactionVisible" class="v2-live-layer" aria-live="off">
        <ul class="v2-static-barrages" aria-hidden="true">
          <li v-for="item in staticBarrages" :key="item.barrageId">{{ item.text }}</li>
        </ul>
        <p
          v-for="item in liveBarrages"
          :key="item.visualId"
          class="v2-live-barrage"
          :data-barrage-visual="item.visualId"
          :style="{ '--lane': item.lane }"
        >{{ item.text }}</p>
        <div ref="giftLayer" class="v2-gifts">
          <article v-for="item in gifts" :key="item.visualId" :data-gift-visual="item.visualId" :class="`gift-${item.kind}`">
            <span aria-hidden="true">{{ item.kind === 'starship' ? '✦' : item.kind === 'rocket' ? '◆' : '·' }}</span>
            <div><p>{{ item.giftName }}</p><strong v-if="item.count > 1">× {{ item.count }}</strong></div>
          </article>
        </div>
      </div>
    </template>
  </section>
</template>

<style>
html.v2-screen-active,html.v2-screen-active body{overflow:hidden;background:#02050c}
html.v2-screen-active .app-shell.route-screen{width:100%;height:100vh;min-height:0;padding:0;background:#02050c}
html.v2-screen-active .route-screen .page-content{width:100%;height:100%;min-height:0;padding:0;align-items:stretch}
html.v2-screen-active .route-screen .page-content>*{animation:none}
html.v2-screen-active .ambient-field--screen{display:none}
html.v2-program-overlay,html.v2-program-overlay body,html.v2-program-overlay .app-shell.route-screen{background:transparent!important}
</style>

<style scoped>
.v2-screen{position:relative;width:100%;height:100vh;overflow:hidden;color:#f5f8ff;background:radial-gradient(circle at 50% 46%,#0a1730 0,#040915 45%,#02050c 100%);isolation:isolate}
.v2-screen.scene-program_support{background:transparent}.v2-galaxy{position:absolute;inset:0;width:100%;height:100%;z-index:0}
.v2-signal{position:absolute;z-index:9;top:24px;right:28px;margin:0;padding:8px 12px;border:1px solid rgba(255,200,102,.45);color:#ffdca0;background:rgba(7,12,25,.86);font-size:14px}
.v2-scene-copy{position:absolute;z-index:2;inset:0;display:grid;place-content:center;text-align:center;pointer-events:none}.scene-program_support .v2-scene-copy{place-content:start center;padding-top:5vh;text-shadow:0 2px 18px #000}
.v2-kicker,.v2-rehearsal{margin:0 0 16px;font-size:clamp(12px,1vw,18px);letter-spacing:.24em;color:#9ab4dc}.v2-rehearsal{color:#ffc66b;letter-spacing:.12em}
.v2-scene-copy h1,.v2-finale h1{margin:0;font-size:clamp(56px,7vw,128px);line-height:1.02;font-weight:650;letter-spacing:.04em}.scene-program_support .v2-scene-copy h1{font-size:clamp(34px,4vw,70px)}
.v2-scene-copy>p:last-of-type,.v2-finale__copy>p{font-size:clamp(18px,1.45vw,28px);color:#b7c7df}.v2-count{display:flex;align-items:baseline;justify-content:center;gap:14px;margin-top:42px}.v2-count strong{font-size:clamp(48px,6vw,96px)}.v2-count span{color:#9caec8;font-size:20px}
.v2-live-layer{position:absolute;z-index:4;inset:0;overflow:hidden;pointer-events:none}.v2-live-barrage{position:absolute;top:calc(10vh + var(--lane)*10vh);left:0;margin:0;padding:10px 18px;max-width:56vw;border-radius:999px;color:#fff;background:rgba(4,9,20,.72);font-size:clamp(20px,1.7vw,34px);font-weight:600;white-space:nowrap;text-shadow:0 2px 6px #000;will-change:transform,opacity}
.v2-static-barrages{position:absolute;top:14vh;right:3vw;width:min(34vw,620px);margin:0;padding:0;display:grid;gap:12px;list-style:none;opacity:.64}.v2-static-barrages li{padding:9px 14px;border-right:3px solid rgba(151,192,255,.72);background:linear-gradient(90deg,transparent,rgba(3,8,18,.72));font-size:clamp(18px,1.25vw,26px);text-align:right;text-shadow:0 2px 8px #000}
.v2-gifts{position:absolute;left:4vw;bottom:12vh;display:flex;align-items:flex-end;gap:16px}.v2-gifts article{display:flex;align-items:center;gap:14px;min-width:260px;padding:16px 22px;border:1px solid rgba(150,197,255,.5);border-radius:18px;background:linear-gradient(135deg,rgba(9,22,49,.92),rgba(23,52,88,.74));box-shadow:0 12px 50px rgba(14,61,131,.34);will-change:transform,opacity}.v2-gifts article>span{font-size:46px;color:#ffd57a}.v2-gifts p{margin:0;font-size:22px}.v2-gifts strong{display:block;margin-top:4px;font-size:28px;color:#ffd57a}.v2-gifts .gift-starship{min-width:340px;border-color:rgba(255,211,113,.75);box-shadow:0 0 64px rgba(255,195,66,.35)}
.v2-capsule-insert{position:absolute;z-index:7;inset:0;display:grid;place-content:center;padding:8vh 10vw;background:radial-gradient(circle at 50% 44%,rgba(26,50,88,.96),rgba(2,6,14,.98) 70%);text-align:center}.v2-capsule-insert ul{list-style:none;margin:20px 0 0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;max-width:1500px}.v2-capsule-insert li{display:flex;align-items:flex-start;gap:16px;padding:26px 30px;border:1px solid rgba(169,196,235,.32);background:rgba(5,12,26,.62);text-align:left}.v2-capsule-insert li span{width:12px;height:12px;margin-top:9px;flex:none;border-radius:50%;background:var(--capsule-color);box-shadow:0 0 18px var(--capsule-color)}.v2-capsule-insert li p{margin:0;font-size:clamp(22px,1.65vw,34px);line-height:1.55}
.v2-finale{position:absolute;z-index:8;inset:0;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% 48%,rgba(22,51,101,.72),rgba(2,5,12,.97) 68%)}.v2-finale__halo{position:absolute;width:min(70vw,1100px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,rgba(146,192,255,.26),rgba(88,131,216,.08) 38%,transparent 68%)}.v2-finale__copy{position:relative;z-index:1;width:min(1500px,88vw);text-align:center}.v2-finale__preview{color:#ffc86c!important;font-weight:700}.v2-finale__metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin:44px 0 0}.v2-finale__metrics div{padding:18px;border-top:1px solid rgba(170,202,246,.34)}.v2-finale__metrics dt{color:#9fb5d4;font-size:16px}.v2-finale__metrics dd{margin:5px 0 0;font-size:clamp(28px,3vw,52px);font-weight:700}.v2-finale__capsules{list-style:none;margin:28px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.v2-finale__capsules li{padding:14px 18px;background:rgba(8,19,39,.64);font-size:18px}
@media(prefers-reduced-motion:reduce){.v2-live-barrage{display:none}.v2-screen *{animation:none!important;transition:none!important}}
</style>
