<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { programCredits } from '../services/program-credits'
import { programVisualStyle } from '../rendering/program-visuals'
const props = defineProps({ program: { type: Object, required: true }, visual: { type: Object, required: true }, transient: Boolean, reduced: Boolean })

const page = ref(0)
const split = (text, count) => Array.from(text).reduce((chunks, character, index) => { if (index % count === 0) chunks.push(''); chunks[chunks.length-1] += character; return chunks }, [])
const titlePages = computed(() => split(props.program.title, props.transient ? 18 : 24))
const creditPages = computed(() => {
  const credits = programCredits(props.program)
  return split(credits, props.transient ? 50 : credits.length > 120 ? 56 : 120)
})
const pageCount = computed(() => Math.max(1, titlePages.value.length, creditPages.value.length))
const titleText = computed(() => titlePages.value[Math.min(page.value, titlePages.value.length-1)])
const creditText = computed(() => creditPages.value[Math.min(page.value, creditPages.value.length-1)] ?? '')
const creditGroups = computed(() => creditText.value.split(' / '))
let timer
watch(() => props.program.id, () => { page.value = 0 })
onMounted(() => { timer = setInterval(() => { if (!props.reduced && !document.hidden && pageCount.value > 1) page.value = (page.value+1) % pageCount.value }, 8500) })
onBeforeUnmount(() => clearInterval(timer))
</script>
<template>
  <section class="program-stage-title" :class="['layout-' + visual.layout, 'font-' + visual.font, { 'is-transient': transient, 'is-static': reduced }]"
    :style="programVisualStyle(visual)" :data-long-title="program.title.length > 24" :data-long-credits="programCredits(program).length > 80" :data-program-id="program.id" :data-title-persistent="!transient" :data-font-state="visual.font === 'cut' ? 'fangxian-local' : 'ready'" aria-label="当前节目与表演者">
    <div class="program-title-meta"><span class="program-title-index">{{ String(program.displayCode ?? '').padStart(2, '0') }}</span><i></i><span>{{ visual.genre || '现场节目' }}</span></div>
    <h2 :aria-label="program.title">{{ titleText }}</h2>
    <div class="program-title-rule" aria-hidden="true"><i></i><b></b><i></i></div>
    <p v-if="programCredits(program)" class="program-title-performers"><template v-for="(group, index) in creditGroups" :key="index"><span v-if="index"> / </span><span :class="{ 'credit-group': creditGroups.length > 1 && group.length <= 20 }">{{ group }}</span></template></p>
    <p v-if="pageCount > 1" class="program-title-page">{{ page + 1 }} / {{ pageCount }}</p>
  </section>
</template>
<style scoped>
.program-stage-title{position:absolute;z-index:5;left:20%;top:34%;width:60%;text-align:center;box-sizing:border-box;color:#f1edf2;pointer-events:none;animation:program-title-enter .5s ease both;text-shadow:0 2px 16px #2421314d}
.program-title-meta{display:flex;align-items:center;justify-content:center;gap:18px;font:400 15px/1.4 var(--font-family-ui);letter-spacing:.22em;color:#e1d9e2}
.program-title-meta i{width:44px;height:1px;background:var(--program-accent);opacity:.6}.program-title-index{font:500 17px/1.2 var(--font-family-signal)}
.program-stage-title h2{margin:25px 0 27px;font-family:var(--font-family-display);font-size:clamp(44px,5.6vw,112px);line-height:1.24;font-weight:400;letter-spacing:.14em;overflow-wrap:anywhere;text-wrap:balance}
.program-stage-title.font-tech h2{font-family:'Orbitron','Welcome Sans SC',sans-serif;font-weight:600;letter-spacing:.065em}
.program-stage-title.font-retro h2{font-family:'Welcome Stage Serif','Welcome Sans SC',serif;font-weight:600;letter-spacing:.16em}
.program-title-rule{display:flex;align-items:center;justify-content:center;gap:12px;margin:0 0 23px}.program-title-rule i{width:64px;height:1px;background:linear-gradient(90deg,transparent,var(--program-accent));opacity:.55}.program-title-rule i:last-child{transform:rotate(180deg)}.program-title-rule b{width:5px;height:5px;border:1px solid var(--program-secondary);transform:rotate(45deg);opacity:.65}
.program-title-performers{margin:0;font:400 clamp(21px,1.6vw,31px)/1.8 var(--font-family-ui);letter-spacing:.18em;color:#e9e3eb;white-space:pre-wrap;overflow-wrap:anywhere}
.credit-group{display:inline-block;white-space:nowrap}
.layout-left{left:15%;width:60%;text-align:left}.layout-right{left:25%;width:60%;text-align:right}
.layout-left :is(.program-title-meta,.program-title-rule){justify-content:flex-start}.layout-right :is(.program-title-meta,.program-title-rule){justify-content:flex-end}
.is-transient{left:6%;top:auto;bottom:17%;width:min(64%,1180px);text-align:left;padding:18px 28px;border-left:1px solid var(--program-accent);background:linear-gradient(90deg,#34303cc9,#34303c12);clip-path:polygon(0 0,calc(100% - 18px) 0,100% 18px,100% 100%,0 100%);animation:program-title-cue 8.5s ease both}
.is-transient .program-title-meta{justify-content:flex-start}.is-transient h2{font-size:clamp(36px,3.6vw,72px);margin:10px 0;letter-spacing:.075em}.is-transient .program-title-rule{display:none}.is-transient .program-title-performers{font-size:clamp(20px,1.3vw,28px);letter-spacing:.09em}
.is-transient{left:var(--cue-x,6%);top:var(--cue-y,4%);bottom:var(--cue-bottom,auto);width:var(--cue-width,40%);padding:12px 20px;background:linear-gradient(90deg,#282630a6,#28263018)}
.is-transient .program-title-meta{font-size:12px;gap:12px}.is-transient .program-title-index{font-size:13px}.is-transient h2{font-size:clamp(26px,2vw,40px);margin:8px 0}.is-transient .program-title-performers{font-size:clamp(18px,1.1vw,24px)}
.is-static{animation:none}
.program-stage-title[data-long-title="true"] h2{font-size:clamp(28px,2.2vw,44px);letter-spacing:.045em}
.program-stage-title[data-long-credits="true"] .program-title-performers{font-size:clamp(16px,1vw,20px);letter-spacing:.04em;line-height:1.55}
.is-transient[data-long-title="true"] h2{font-size:clamp(20px,1.2vw,26px);margin:6px 0}
.is-transient[data-long-credits="true"] .program-title-performers{font-size:clamp(14px,.85vw,18px);line-height:1.35}
/* D-106: stage-distance readability; long catalog entries retain bounded sizing above. */
.program-stage-title:not([data-long-title="true"]) h2{font-size:clamp(64px,7.2vw,148px);line-height:1.18}
.program-stage-title.font-cut:not([data-long-title="true"]) h2{font-size:clamp(70px,8.1vw,164px);letter-spacing:.10em}
.program-stage-title.font-tech:not([data-long-title="true"]) h2{font-size:clamp(60px,6.8vw,140px)}
.program-stage-title:not(.is-transient) .program-title-meta{font-size:clamp(17px,1.05vw,22px)}
.program-stage-title:not(.is-transient) .program-title-index{font-size:clamp(19px,1.2vw,25px)}
.program-stage-title:not([data-long-credits="true"]) .program-title-performers{font-size:clamp(26px,2.15vw,42px);line-height:1.6;letter-spacing:.12em}
.program-stage-title.is-transient:not([data-long-title="true"]) h2{font-size:clamp(34px,2.85vw,58px);line-height:1.16;letter-spacing:.065em}
.program-stage-title.is-transient:not([data-long-credits="true"]) .program-title-performers{font-size:clamp(22px,1.5vw,31px);line-height:1.4;letter-spacing:.05em}
@keyframes program-title-enter{from{opacity:0}to{opacity:1}}
@keyframes program-title-cue{0%{opacity:0}8%,86%{opacity:1}100%{opacity:0}}

.program-stage-title h2,.program-stage-title.font-retro h2{font-family:var(--font-family-display);font-weight:700;-webkit-text-stroke:1px currentColor}
.program-stage-title[data-long-title="true"]:not(.is-transient) h2{font-size:clamp(60px,4.65vw,96px);line-height:1.24;letter-spacing:.045em}
.program-stage-title:not(.is-transient)[data-long-credits="true"] .program-title-performers{font-size:clamp(25px,2.1vw,42px);line-height:1.5;letter-spacing:.025em}
.program-stage-title.is-transient h2{font-size:clamp(38px,4.6vw,94px);font-weight:700;line-height:1.2}
.program-stage-title.is-transient[data-long-title="true"] h2{font-size:clamp(36px,4.6vw,90px);letter-spacing:.025em}
.program-stage-title[data-long-title="true"]{top:34%;left:13%;width:74%}.program-title-page{font:600 20px var(--font-family-ui);opacity:.7;margin:14px 0 0}
</style>
