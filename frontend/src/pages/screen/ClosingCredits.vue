<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { barragePaint } from '../../services/barrage-colors'

const props = defineProps({
  programs: { type: Array, default: () => [] },
  aggregate: { type: Object, default: () => ({}) },
  recap: { type: Object, default: () => ({ barrages: [], giftTotals: [], barrageCount: 0, totalGiftQuantity: 0, totalGiftPower: 0 }) },
  reduced: Boolean,
  paused: Boolean,
  play: Boolean,
  preview: Boolean,
})

const phase = ref('poster')
const page = ref(0)
const viewport = ref(null)
const roll = ref(null)
const distance = ref(0)
const duration = ref(90)
const barrageWindow = ref(null)
const barrageTrack = ref(null)
const barrageDistance = ref(0)
const barrageStart = ref(0)
const barrageSeconds = ref(24)
const reviewCommunity = ref(false)
let observer = null

const performances = computed(() => props.programs
  .filter(item => item.kind === 'PERFORMANCE')
  .slice()
  .sort((a, b) => a.order - b.order))
const pages = computed(() => Math.max(1, Math.ceil(performances.value.length / 6)))
const pageItems = computed(() => performances.value.slice(page.value * 6, page.value * 6 + 6))
const barrages = computed(() => (props.recap?.barrages ?? []).filter(item => item.status === 'PUBLISHED').slice().sort((a, b) =>
  new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()))
const giftTotals = computed(() => props.recap?.giftTotals ?? [])
const staticCommunity = computed(() => props.reduced || reviewCommunity.value)
const communityStyle = computed(() => ({
  '--barrage-duration': `${barrageSeconds.value}s`,
  '--barrage-start': `${barrageStart.value}px`,
  '--barrage-travel': `${barrageDistance.value}px`,
  '--community-hold': `${barrages.value.length ? barrageSeconds.value + 3 : 23.3}s`,
}))
const metrics = computed(() => [
  [performances.value.length, '个正式节目'],
  [props.recap?.totalGiftPower ?? 0, '点礼物值'],
  [props.recap?.barrageCount ?? 0, '条全场弹幕'],
])

function measure() {
  if (viewport.value && roll.value) {
    distance.value = viewport.value.clientHeight + roll.value.scrollHeight
    duration.value = Math.max(60, distance.value / Math.max(25, viewport.value.clientHeight * 0.055))
  }
  if (barrageWindow.value && barrageTrack.value && !staticCommunity.value) {
    barrageStart.value = barrageWindow.value.clientWidth
    barrageDistance.value = barrageTrack.value.scrollWidth
    barrageSeconds.value = Math.max(18, (barrageStart.value + barrageDistance.value) / 120)
  }
}

function finishPhase(event) {
  if (event.target !== event.currentTarget) return
  if (phase.value === 'intro') phase.value = performances.value.length ? 'credits' : 'community'
  else if (phase.value === 'credits') phase.value = 'community'
  else if (phase.value === 'community' && event.animationName.startsWith('community-finish') && !staticCommunity.value) phase.value = 'poster'
}

function showList() { page.value = 0; phase.value = 'list' }
function showCommunity() { reviewCommunity.value = true; phase.value = 'community' }

watch([() => props.play, () => props.reduced], ([play, reduced]) => {
  phase.value = play && !reduced ? 'intro' : 'poster'
  reviewCommunity.value = false
}, { immediate: true })
watch([phase, barrages, staticCommunity], async () => {
  await nextTick()
  observer?.disconnect()
  if (roll.value) observer?.observe(roll.value)
  if (barrageWindow.value) observer?.observe(barrageWindow.value)
  if (barrageTrack.value) observer?.observe(barrageTrack.value)
  measure()
})
watch(pages, count => { page.value = Math.min(page.value, count - 1) })
onMounted(() => {
  observer = new ResizeObserver(measure)
  if (roll.value) observer.observe(roll.value)
  measure()
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <section class="closing-credits" :class="{ 'is-paused': paused, 'is-static': reduced }" :data-phase="phase" aria-label="今夜演出与互动回顾">
    <header class="closing-credits__masthead">
      <span>SYSU · WELCOME NIGHT</span>
      <span>{{ preview ? '排练预览 · 不代表活动已结束' : '今夜的星河，已经成形' }}</span>
    </header>

    <div v-if="phase === 'intro'" class="closing-credits__intro" @animationend="finishPhase">
      <p class="closing-credits__eyebrow">每一束光，都曾在这里相遇</p>
      <h1>把今夜，写进星河</h1>
      <span class="closing-credits__line" aria-hidden="true"></span>
      <p>献给台上的你，也献给星海中的每一个你</p>
    </div>

    <div v-else-if="phase === 'credits'" ref="viewport" class="closing-credits__viewport">
      <div ref="roll" class="closing-credits__roll" :style="{ '--travel': `${distance}px`, '--duration': `${duration}s` }" @animationend="finishPhase">
        <p class="closing-credits__eyebrow">今晚演出 · {{ performances.length }} 个正式节目</p>
        <h2>每一次登场，都有星海回应</h2>
        <article v-for="program in performances" :key="program.id" class="closing-credits__entry" :data-program-id="program.id">
          <small>PROGRAM {{ program.displayCode }}</small>
          <strong>{{ program.title }}</strong>
          <span v-if="program.performers">{{ program.performers }}</span>
          <em>{{ program.heat ?? 0 }} <i>动力值</i></em>
        </article>
        <div class="closing-credits__thanks">
          <span class="closing-credits__line" aria-hidden="true"></span>
          <h2>谢谢，让这一夜发光的你</h2>
          <p>所有表演者、幕后伙伴，以及来到这里的每一个人</p>
        </div>
      </div>
    </div>

    <div v-else-if="phase === 'community'" class="closing-credits__community" :class="{ 'is-review': staticCommunity }" :style="communityStyle" @animationend="finishPhase">
      <p class="closing-credits__eyebrow">TONIGHT'S LIVE ECHO</p>
      <h2>这一晚，我们一起回应过</h2>
      <div class="closing-credits__gift-ledger">
        <article v-for="gift in giftTotals" :key="gift.giftId">
          <span>{{ gift.giftName }}</span><strong>×{{ gift.quantity }}</strong><small>{{ gift.totalPower }} 礼物值</small>
        </article>
      </div>
      <div v-if="barrages.length" ref="barrageWindow" class="closing-credits__barrage-window" :tabindex="staticCommunity ? 0 : undefined" aria-label="今夜公开弹幕回顾">
        <div ref="barrageTrack" class="closing-credits__barrage-track">
          <span v-for="item in barrages" :key="item.barrageId" :style="barragePaint(item.colorStyle, item.customColor)">
            <i>{{ item.publicStarId }}</i>{{ item.text }}
          </span>
        </div>
      </div>
      <p v-else class="closing-credits__empty">{{ recap.barrageCount ? '暂无可展示的公开弹幕' : '今夜的弹幕仍在等待第一束回响' }}</p>
      <div class="closing-credits__community-total"><strong>{{ recap.barrageCount ?? 0 }}</strong><span>条弹幕</span><b>·</b><strong>{{ recap.totalGiftQuantity ?? 0 }}</strong><span>份礼物</span><b>·</b><strong>{{ recap.totalGiftPower ?? 0 }}</strong><span>礼物值</span></div>
    </div>

    <div v-else-if="phase === 'list'" class="closing-credits__directory">
      <div class="closing-credits__directory-heading"><h2>今夜演出</h2><span>{{ performances.length }} 个正式节目 · {{ page + 1 }} / {{ pages }}</span></div>
      <div class="closing-credits__grid" tabindex="0" aria-label="本页节目与动力值">
        <article v-for="program in pageItems" :key="program.id" :data-program-id="program.id">
          <small>{{ program.displayCode }}</small>
          <div><h3>{{ program.title }}</h3><p v-if="program.performers">{{ program.performers }}</p></div>
          <strong>{{ program.heat ?? 0 }}<span>动力值</span></strong>
        </article>
        <p v-if="!performances.length">本场暂无表演节目资料</p>
      </div>
      <nav aria-label="节目回顾分页">
        <button :disabled="page === 0" @click="page--">上一页</button><span>{{ page + 1 }} / {{ pages }}</span><button :disabled="page >= pages - 1" @click="page++">下一页</button><button @click="phase = 'poster'">返回终章</button>
      </nav>
    </div>

    <div v-else class="closing-credits__poster v2-finale__copy">
      <p class="closing-credits__eyebrow">故事从今夜开始</p>
      <h1>愿我们在更远的星海重逢</h1>
      <span class="closing-credits__line" aria-hidden="true"></span>
      <p>{{ preview ? '这一幕，留给正式相聚的终点。' : '本场活动已结束，感谢每一颗星的抵达。' }}</p>
      <dl class="closing-credits__metrics"><div v-for="[value, label] in metrics" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl>
      <div class="closing-credits__poster-actions"><button @click="showList">节目与动力值 <span aria-hidden="true">↗</span></button><button @click="showCommunity">弹幕与礼物回顾 <span aria-hidden="true">↗</span></button></div>
    </div>

    <footer class="closing-credits__footer">
      <span>以星光作序 · 与未来相逢</span>
      <button v-if="['intro', 'credits', 'community'].includes(phase)" @click="phase = 'poster'">{{ staticCommunity && phase === 'community' ? '返回' : '跳过片尾' }}</button>
      <span v-else>THE BEGINNING</span>
    </footer>
  </section>
</template>

<style scoped>
.closing-credits{position:absolute;inset:0;color:#f0ece3;background:linear-gradient(180deg,rgba(3,5,8,.22),transparent 26%,rgba(3,5,8,.12) 72%,rgba(3,5,8,.34));font-family:var(--font-family-display);text-shadow:0 2px 22px #020305b3}
.closing-credits__masthead,.closing-credits__footer{position:absolute;left:6vw;right:6vw;z-index:3;display:flex;justify-content:space-between;align-items:center;gap:20px;font-size:clamp(12px,1vw,18px);letter-spacing:.15em;color:#b1b2b5}.closing-credits__masthead{top:5vh;padding-bottom:18px;border-bottom:1px solid #c7b99529}.closing-credits__footer{bottom:4vh;min-height:44px}
.closing-credits__intro,.closing-credits__poster{position:absolute;inset:18vh 8vw 17vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.closing-credits h1{font-family:inherit;font-size:clamp(32px,4vw,78px);font-weight:450;line-height:1.55;letter-spacing:.12em;margin:20px 0;overflow-wrap:anywhere}.closing-credits h2{font-size:clamp(24px,2.5vw,46px);font-weight:450;letter-spacing:.1em;line-height:1.6;margin:12px 0 45px}.closing-credits__eyebrow{font-size:clamp(14px,1.3vw,24px);letter-spacing:.24em;color:#bcb5a5;margin:0}.closing-credits__intro>p:last-child,.closing-credits__poster>p:not(.closing-credits__eyebrow),.closing-credits__thanks p{font-size:clamp(16px,1.4vw,26px);line-height:1.8;letter-spacing:.1em;color:#c4c5c9}.closing-credits__line{display:block;width:90px;height:1px;margin:22px auto;background:linear-gradient(90deg,transparent,#c8b58a,transparent)}
.closing-credits__intro{animation:credits-prologue 8s both}.closing-credits__viewport{position:absolute;inset:14vh 10vw 14vh;overflow:hidden;mask-image:linear-gradient(transparent,#000 14%,#000 82%,transparent)}.closing-credits__roll{position:absolute;top:100%;left:0;right:0;text-align:center;animation:credits-travel var(--duration,90s) linear both}.closing-credits__entry{position:relative;max-width:900px;margin:0 auto;padding:clamp(24px,4vh,52px) 120px;display:grid;gap:12px;overflow-wrap:anywhere}.closing-credits__entry>small{color:#90b8e9;font-family:var(--font-family-data);font-size:clamp(12px,1vw,18px);letter-spacing:.2em}.closing-credits__entry>strong{font-size:clamp(25px,2.6vw,48px);font-weight:450;letter-spacing:.08em;line-height:1.5}.closing-credits__entry>span{font-size:clamp(18px,1.7vw,32px);line-height:1.8;color:#c3c3c8;letter-spacing:.06em}.closing-credits__entry>em{position:absolute;top:50%;right:0;color:#edcf91;font-family:var(--font-family-data);font-size:clamp(20px,2vw,34px);font-style:normal;transform:translateY(-50%)}.closing-credits__entry>em i{display:block;color:#988d78;font:normal clamp(10px,.7vw,14px) var(--font-family-display);letter-spacing:.12em}.closing-credits__thanks{padding:10vh 0 3vh}.closing-credits__thanks h2{margin-bottom:20px}
.closing-credits__community{position:absolute;inset:15vh 5vw 14vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;animation:community-chapter .7s ease-out both,community-finish .7s var(--community-hold,23.3s) ease-in forwards}.closing-credits__community h2{margin:8px 0 3vh}.closing-credits__gift-ledger{width:min(1200px,90vw);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.closing-credits__gift-ledger article{padding:18px;border:1px solid #b7cbe137;border-radius:16px;background:linear-gradient(145deg,#1720328a,#080c1480);display:grid;grid-template-columns:1fr auto;gap:8px;text-align:left}.closing-credits__gift-ledger span{color:#c5c8cf;font-size:clamp(14px,1.1vw,20px)}.closing-credits__gift-ledger strong{color:#f3d99e;font:500 clamp(22px,2vw,36px) var(--font-family-data)}.closing-credits__gift-ledger small{grid-column:1/-1;color:#8e98aa;font-family:var(--font-family-data)}.closing-credits__barrage-window{width:100%;margin:5vh 0 3vh;overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}.closing-credits__barrage-track{display:flex;width:max-content;gap:46px;animation:barrage-recap var(--barrage-duration,28s) 2s linear both}.closing-credits__barrage-track span{display:flex;align-items:center;gap:10px;white-space:nowrap;color:var(--barrage-color,#edf6ff);font-size:clamp(20px,1.8vw,34px);text-shadow:0 0 20px var(--barrage-glow,rgba(102,164,255,.35))}.closing-credits__barrage-track i{color:#788aa5;font:normal clamp(12px,.9vw,16px) var(--font-family-data)}.closing-credits__community-total{display:flex;align-items:baseline;justify-content:center;gap:12px;color:#a9afba}.closing-credits__community-total strong{color:#f0dfb9;font:500 clamp(26px,2.5vw,48px) var(--font-family-data)}.closing-credits__community-total b{color:#545b68}.closing-credits__empty{margin:5vh 0;color:#9299a6}
.closing-credits__metrics{display:flex;justify-content:center;gap:6vw;margin:4vh 0 2vh;text-shadow:0 2px 14px #0008}.closing-credits__metrics div{display:flex;align-items:baseline;flex-direction:row-reverse;gap:10px}.closing-credits__metrics dt{font-size:clamp(13px,1vw,19px);color:#b0b0b5}.closing-credits__metrics dd{margin:0;font-family:var(--font-family-data);font-size:clamp(22px,2vw,36px);font-weight:400;color:#e5dfd2}.closing-credits button{min-width:88px;min-height:44px;padding:8px 14px;border:1px solid #c7b99540;border-radius:12px;background:#05080d45;color:#cbc5b7;font:inherit;font-size:clamp(14px,1vw,18px);cursor:pointer;letter-spacing:.08em}.closing-credits button:hover{background:#c7b9951c;color:#fff4db}.closing-credits button:focus-visible{outline:2px solid #edd5a6;outline-offset:4px}.closing-credits button:disabled{opacity:.35;cursor:default}.closing-credits__poster-actions{display:flex;gap:14px;margin-top:1.5vh}
.closing-credits__directory{position:absolute;inset:16vh 9vw 15vh;display:flex;flex-direction:column;gap:18px}.closing-credits__directory-heading{display:flex;align-items:baseline;justify-content:space-between;gap:16px}.closing-credits__directory-heading h2{margin:0}.closing-credits__directory-heading>span{color:#bcb5a5;font-size:clamp(14px,1.2vw,20px)}.closing-credits__grid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:minmax(min-content,1fr);gap:0 6vw;align-content:start}.closing-credits__grid article{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:16px;align-items:start;border-top:1px solid #c7b99533;padding:20px 0;overflow-wrap:anywhere;min-width:0}.closing-credits__grid article>div{min-width:0}.closing-credits__grid>article>small{color:#a69a82;padding-top:6px;font-family:var(--font-family-data)}.closing-credits__grid h3{font-size:clamp(20px,1.8vw,34px);font-weight:450;line-height:1.4;margin:0 0 8px}.closing-credits__grid p{font-size:clamp(16px,1.25vw,24px);line-height:1.65;color:#c1c1c6;margin:0}.closing-credits__grid article>strong{color:#e0c990;font-family:var(--font-family-data);font-size:clamp(18px,1.4vw,26px);text-align:right}.closing-credits__grid article>strong span{display:block;margin-top:4px;color:#8e897f;font:400 11px var(--font-family-display);letter-spacing:.1em}.closing-credits__directory nav{display:flex;justify-content:center;align-items:center;gap:18px}
.is-paused *{animation-play-state:paused!important}.is-static *{animation:none!important}.closing-credits__community.is-review{animation:none}.is-review .closing-credits__barrage-window{min-height:0;max-height:28vh;overflow:auto;mask-image:none;scrollbar-color:#788da766 transparent}.is-review .closing-credits__barrage-track{width:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 30px;animation:none}.is-review .closing-credits__barrage-track span{white-space:normal;overflow-wrap:anywhere;text-align:left;align-items:baseline;padding:12px 16px;border-radius:12px;background:#08121e6b;border:1px solid #9eb5ce1f}.is-review .closing-credits__barrage-track i{flex-shrink:0}.closing-credits__barrage-window:focus-visible{outline:2px solid #b5d2e8;outline-offset:4px}
@keyframes credits-prologue{0%{opacity:0;transform:translateY(14px)}18%,76%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-8px)}}@keyframes credits-travel{from{transform:translateY(0)}to{transform:translateY(calc(-1 * var(--travel)))}}@keyframes community-chapter{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}@keyframes community-finish{from{opacity:1}to{opacity:0;transform:translateY(-10px)}}@keyframes barrage-recap{from{transform:translateX(var(--barrage-start,100vw))}to{transform:translateX(calc(-1 * var(--barrage-travel,100%)))}}
@media(max-width:900px){.closing-credits__metrics{gap:20px;flex-wrap:wrap}.closing-credits__metrics div{flex-direction:column-reverse;gap:4px;align-items:center}.closing-credits__gift-ledger{grid-template-columns:repeat(2,minmax(0,1fr))}.closing-credits__grid{grid-template-columns:1fr;gap:0 24px}.closing-credits__grid article{padding:14px 0;gap:10px}.closing-credits__masthead{letter-spacing:.05em}.closing-credits h1{letter-spacing:.06em}.closing-credits__poster-actions{flex-wrap:wrap;justify-content:center}}
</style>
