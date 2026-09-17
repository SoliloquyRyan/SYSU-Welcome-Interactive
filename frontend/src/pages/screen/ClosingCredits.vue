<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { barragePaint } from '../../services/barrage-colors'
import ProgramStageBackground from '../../components/ProgramStageBackground.vue'

const props = defineProps({ programs: { type: Array, default: () => [] }, aggregate: { type: Object, default: () => ({}) },
  recap: { type: Object, default: () => ({ barrages: [], giftTotals: [] }) }, backgroundVisual: Object, reduced: Boolean, paused: Boolean, play: Boolean, preview: Boolean })
const phase = ref('poster'), page = ref(0), viewport = ref(null), roll = ref(null), distance = ref(0)
const performances = computed(() => props.programs.filter(item => item.kind === 'PERFORMANCE').slice().sort((a,b) => a.order-b.order))
const pages = computed(() => Math.max(1, Math.ceil(performances.value.length / 4)))
const pageItems = computed(() => performances.value.slice(page.value * 4, page.value * 4 + 4))
const barrages = computed(() => (props.recap?.barrages ?? []).filter(item => item.status === 'PUBLISHED'))
const credits = program => (program.performers || '').split(' / ')
let timer = null, observer = null, disposed = false, elapsed = 0, lastTick = 0
const chapters = [[6000, 'intro'], [141000, 'credits'], [159000, 'outro'], [165000, 'settle']]
function stop() { if (timer !== null) clearTimeout(timer); timer = null }
function settle() { stop(); phase.value = 'poster' }
function tick() {
  if (disposed) return
  const now = performance.now()
  if (!props.paused) elapsed += now - lastTick
  lastTick = now
  phase.value = chapters.find(([end]) => elapsed < end)?.[1] ?? 'poster'
  if (phase.value !== 'poster') timer = setTimeout(tick, 100)
}
function start() {
  stop(); elapsed = 0
  if (!props.play || props.reduced || document.hidden) { phase.value = 'poster'; return }
  phase.value = 'intro'; lastTick = performance.now(); timer = setTimeout(tick, 100)
}
function measure() { if (viewport.value && roll.value) distance.value = viewport.value.clientHeight + roll.value.scrollHeight }
function visibility() { if (document.hidden) settle() }
function showList() { stop(); page.value = 0; phase.value = 'list' }
function showCommunity() { stop(); phase.value = 'community' }
watch([() => props.play, () => props.reduced], start, { immediate: true })
watch(phase, async () => { await nextTick(); observer?.disconnect(); if (roll.value) observer?.observe(roll.value); measure() })
watch(pages, count => { page.value = Math.min(page.value, count - 1) })
onMounted(() => { observer = new ResizeObserver(measure); measure(); document.addEventListener('visibilitychange', visibility) })
onBeforeUnmount(() => { disposed = true; stop(); observer?.disconnect(); document.removeEventListener('visibilitychange', visibility) })
</script>

<template>
  <section class="closing-credits" :class="{ 'is-paused': paused, 'is-static': reduced || ['poster', 'list', 'community'].includes(phase) }" :data-phase="phase" data-duration-seconds="165" aria-label="迎新晚会电影片尾">
    <ProgramStageBackground v-if="phase === 'intro'" class="closing-credits__city" :visual="backgroundVisual" reduced :branded="false" />
    <div class="closing-credits__haze" aria-hidden="true"></div>
    <header class="closing-credits__masthead"><span>SYSU · WELCOME NIGHT 2026</span><span>{{ preview ? '排练预览' : '2026迎新晚会' }}</span></header>
    <div v-if="phase === 'intro'" class="closing-credits__intro">
      <p class="closing-credits__eyebrow">献给今夜相遇的每一个你</p><h1>今夜，因你们而闪耀</h1><span class="closing-credits__line"></span>
    </div>
    <div v-else-if="phase === 'credits'" ref="viewport" class="closing-credits__viewport">
      <div ref="roll" class="closing-credits__roll" :style="{ '--travel': `${distance}px` }">
        <p class="closing-credits__eyebrow">感谢今晚的 {{ performances.length }} 个节目</p><h2>每一次登场，都值得铭记</h2>
        <article v-for="program in performances" :key="program.id" class="closing-credits__entry" :data-program-id="program.id">
          <small>PROGRAM {{ program.displayCode }}</small><strong>{{ program.title }}</strong>
          <div class="closing-credits__performers"><span v-for="(line, i) in credits(program)" :key="i">{{ line }}</span></div>
        </article>
        <p class="closing-credits__roll-end">感谢每一位幕后工作者<br>也感谢此刻在场的你</p>
      </div>
    </div>
    <div v-else-if="phase === 'outro'" class="closing-credits__outro">
      <p>感谢每一位站上舞台的人，<br>也感谢每一束来自台下的光。</p>
      <p>愿你带着今晚的热爱，<br>走向属于自己的辽阔。</p>
    </div>
    <div v-else-if="phase === 'settle' || phase === 'poster'" class="closing-credits__poster" :class="{ 'is-settling': phase === 'settle' }">
      <span class="closing-credits__star" aria-hidden="true">✦</span><p class="closing-credits__eyebrow">2026迎新晚会</p>
      <h1>以星光作序，<br>与未来相逢</h1><span class="closing-credits__line"></span><p>今夜的热爱，与你奔赴下一程。</p>
      <div v-if="phase === 'poster'" class="closing-credits__poster-actions"><button @click="showList">节目致谢</button><button @click="showCommunity">互动纪念</button></div>
    </div>
    <div v-else-if="phase === 'list'" class="closing-credits__directory">
      <div class="closing-credits__directory-heading"><h2>今夜节目致谢</h2><button @click="settle">回到终章</button></div>
      <div class="closing-credits__grid"><article v-for="program in pageItems" :key="program.id" :data-program-id="program.id"><small>{{ program.displayCode }}</small><div><h3>{{ program.title }}</h3><p v-for="(line, i) in credits(program)" :key="i">{{ line }}</p></div></article></div>
      <nav aria-label="节目致谢分页"><button :disabled="page === 0" @click="page--">上一页</button><span>{{ page + 1 }} / {{ pages }}</span><button :disabled="page + 1 >= pages" @click="page++">下一页</button></nav>
    </div>
    <div v-else class="closing-credits__community">
      <div class="closing-credits__directory-heading"><h2>来自台下的光</h2><button @click="settle">回到终章</button></div>
      <div class="closing-credits__gift-ledger"><article v-for="gift in recap.giftTotals" :key="gift.giftId"><span>{{ gift.giftName }}</span><strong>× {{ gift.quantity }}</strong></article></div>
      <details><summary>节目动力回顾</summary><ol><li v-for="program in performances" :key="program.id">{{ program.title }}<strong>{{ program.heat }}</strong></li></ol></details>
      <div class="closing-credits__messages"><p v-for="item in barrages" :key="item.barrageId" :style="barragePaint(item.colorStyle, item.customColor)">{{ item.text }}</p></div>
    </div>
    <footer>以星光作序 · 与未来相逢</footer>
  </section>
</template>

<style scoped>
.closing-credits{position:absolute;inset:0;overflow:hidden;color:#eee9f1;background:linear-gradient(180deg,#11111cd9,#151420e8 55%,#0c101cea);font-family:var(--font-family-ui);isolation:isolate}
.closing-credits__haze{position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse at 18% 74%,#95789721,transparent 52%),radial-gradient(ellipse at 84% 66%,#8297b320,transparent 45%);animation:film-haze 6s both}
.closing-credits__masthead{position:absolute;top:7vh;left:7vw;right:7vw;display:flex;justify-content:space-between;font:500 18px var(--font-family-ui);letter-spacing:.18em;color:#aaa2b6}
.closing-credits__intro,.closing-credits__poster,.closing-credits__outro{position:absolute;inset:16vh 8vw 15vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.closing-credits h1{font:700 clamp(64px,6.7vw,140px)/1.45 var(--font-family-display);letter-spacing:.08em;margin:25px 0;text-wrap:balance;-webkit-text-stroke:1px currentColor}
.closing-credits h2{font:700 clamp(42px,4.7vw,96px)/1.4 var(--font-family-display);letter-spacing:.08em;margin:20px 0 65px;-webkit-text-stroke:.8px currentColor}
.closing-credits__eyebrow{font-size:28px;letter-spacing:.22em;color:#b8adbf}.closing-credits__line{width:140px;height:1px;margin:25px 0;background:linear-gradient(90deg,transparent,#c5b6c9,transparent)}
.closing-credits__intro{animation:film-intro 6s both}.closing-credits__viewport{position:absolute;inset:16vh 9vw 13vh;overflow:hidden;mask-image:linear-gradient(transparent,#000 12%,#000 87%,transparent)}
.closing-credits__roll{position:absolute;top:100%;left:0;right:0;text-align:center;animation:film-roll 135s linear both}
.closing-credits__entry{padding:62px 7vw;display:grid;gap:22px;max-width:1400px;margin:auto;overflow-wrap:anywhere}
.closing-credits__entry small{font:600 22px var(--font-family-data);color:#b6adc4;letter-spacing:.16em}.closing-credits__entry>strong{font:700 76px/1.45 var(--font-family-display);letter-spacing:.06em;-webkit-text-stroke:.65px currentColor}
.closing-credits__performers{display:grid;gap:8px;font:500 40px/1.7 var(--font-family-ui);letter-spacing:.04em;color:#d2cbd7}
.closing-credits__roll-end{padding:12vh 0 8vh;font:500 42px/2 var(--font-family-ui)}.closing-credits__outro p{position:absolute;margin:0;font:500 clamp(36px,3.6vw,72px)/1.9 var(--font-family-ui);letter-spacing:.06em;opacity:0;animation:film-passage 9s both}.closing-credits__outro p:last-child{animation-delay:9s}
.closing-credits__star{font-size:36px;color:#d7c2df;text-shadow:0 0 30px #dabaff50}.closing-credits__poster>p:last-of-type{font-size:28px;letter-spacing:.1em;color:#c0b6c7}.is-settling{animation:film-poster 6s both}
.closing-credits button{min-height:44px;min-width:105px;padding:10px 20px;border:1px solid #c0add545;border-radius:8px;background:#362e4738;color:#dfd3e9;font:500 20px var(--font-family-ui);cursor:pointer}.closing-credits button:focus-visible{outline:2px solid #c4ade0;outline-offset:3px}.closing-credits button:disabled{opacity:.35;cursor:default}
.closing-credits__poster-actions{display:flex;gap:18px;margin-top:24px;opacity:.72}.closing-credits__directory,.closing-credits__community{position:absolute;inset:16vh 9vw 14vh;display:flex;flex-direction:column;gap:26px}.closing-credits__directory-heading{display:flex;align-items:center;justify-content:space-between}.closing-credits__directory-heading h2{font-size:64px;margin:0}.closing-credits__grid{flex:1;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:24px 50px}.closing-credits__grid article{display:flex;align-items:baseline;gap:24px;padding-top:22px;border-top:1px solid #c9b3df30}.closing-credits__grid small{font:600 22px var(--font-family-data);color:#b7a8c1}.closing-credits__grid h3{font:700 38px/1.5 var(--font-family-display);margin:0 0 14px}.closing-credits__grid p{font:500 28px/1.6 var(--font-family-ui);margin:0;color:#cdc2d6;overflow-wrap:anywhere}.closing-credits nav{display:flex;gap:24px;align-items:center;justify-content:center}
.closing-credits__gift-ledger{display:flex;gap:24px}.closing-credits__gift-ledger article{flex:1;display:flex;justify-content:space-between;border-bottom:1px solid #c9b3df30;padding:20px 0;font-size:30px}.closing-credits__community{overflow:auto}.closing-credits__community li{display:flex;justify-content:space-between;font-size:24px;margin:12px 0}.closing-credits__messages{display:grid;grid-template-columns:1fr 1fr;gap:18px;font-size:28px}.closing-credits footer{position:absolute;bottom:6vh;left:0;right:0;text-align:center;font:500 18px var(--font-family-ui);letter-spacing:.28em;color:#9b8da8}
.is-paused *{animation-play-state:paused!important}.is-static *{animation:none!important}
.closing-credits__city{z-index:-1;animation:film-city 6s ease both}
@keyframes film-city{0%{opacity:.85}100%{opacity:0}}
@keyframes film-haze{from{opacity:0}to{opacity:1}}@keyframes film-intro{0%{opacity:0}28%,78%{opacity:1}100%{opacity:0}}@keyframes film-roll{to{transform:translateY(calc(-1 * var(--travel)))}}@keyframes film-passage{0%,100%{opacity:0}20%,82%{opacity:1}}@keyframes film-poster{from{opacity:0}to{opacity:1}}
</style>
