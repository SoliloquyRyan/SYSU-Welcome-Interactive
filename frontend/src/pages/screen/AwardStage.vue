<script setup>
import { computed } from 'vue'
import ProgramStageBackground from '../../components/ProgramStageBackground.vue'
import StageCollegeBrand from '../../components/StageCollegeBrand.vue'
const props = defineProps({ stage: { type: Object, required: true }, title: String, reduced: Boolean, paused: Boolean })
const programRows = computed(() => props.stage.award?.group === 'PROGRAM'
  && props.stage.award.entries.some(entry => entry.name.length > 24 || entry.detail.length > 100))
</script>

<template>
  <section class="ceremony-stage" :class="{ 'is-static': reduced, 'is-paused': paused }" :data-stage-mode="stage.mode" aria-label="颁奖与主持舞台">
    <ProgramStageBackground :reduced="reduced" :paused="paused" :branded="false" />
    <StageCollegeBrand />
    <Transition name="award-crossfade" mode="out-in">
      <div :key="`${stage.mode}-${stage.award?.id ?? title}-${stage.revealed}-${stage.page}`" class="ceremony-content" :class="{ 'has-program-rows': stage.revealed && programRows }">
        <template v-if="stage.mode === 'AWARD' && stage.award">
          <p class="ceremony-kicker">{{ stage.award.group === 'CAMPUS' ? '校园图鉴 · 荣誉时刻' : '节目颁奖 · 荣誉时刻' }}</p>
          <h1 :class="{ 'with-winners': stage.revealed }">{{ stage.award.title }}</h1>
          <p v-if="stage.award.description && stage.award.group === 'CAMPUS'" class="ceremony-description">{{ stage.award.description }}</p>
          <ol v-if="stage.revealed" class="award-winners" :class="{ 'is-few': stage.award.entries.length <= 2, 'is-podium': stage.award.group === 'PROGRAM' && stage.award.entries.length === 3 && !programRows, 'is-program-rows': programRows }" aria-label="本页获奖名单">
            <li v-for="(entry, i) in stage.award.entries" :key="`${stage.page}-${i}`" :class="{ 'long-entry': entry.name.length > 24 || entry.detail.length > 70 }">
              <span class="award-rank">{{ entry.rank ? String(entry.rank).padStart(2, '0') : '✦' }}</span>
              <div><strong>{{ entry.name }}</strong><p v-if="entry.detail">{{ entry.detail }}</p></div>
            </li>
          </ol>
          <div v-else class="award-emblem" aria-hidden="true"><span>✦</span><i></i></div>
          <p v-if="stage.revealed && stage.totalPages > 1" class="award-page">{{ String(stage.page + 1).padStart(2, '0') }}<span> / {{ String(stage.totalPages).padStart(2, '0') }}</span></p>
        </template>
        <template v-else>
          <p class="ceremony-kicker">中山大学 · 迎新晚会</p>
          <h1 class="host-title">{{ title || '此刻，共赴新程' }}</h1>
          <div class="host-mark" aria-hidden="true"><i></i><span>✦</span><i></i></div>
          <p class="host-subtitle">WELCOME TO OUR NEW CHAPTER</p>
        </template>
      </div>
    </Transition>
    <footer class="ceremony-footer"><span>迎新之夜</span><span>二〇二六</span></footer>
  </section>
</template>

<style scoped>
.award-winners .long-entry strong{font-size:1.6vw}.award-winners .long-entry p{font-size:1vw}
.ceremony-stage{position:absolute;inset:0;z-index:4;overflow:hidden;color:#e8f0f8;background:#03060c;font-family:var(--font-family-display,serif)}
.ceremony-content{position:absolute;left:9vw;right:9vw;top:19vh;bottom:12vh;display:flex;flex-direction:column;align-items:center;text-align:center}
.ceremony-kicker{margin:0 0 2.2vh;font:500 1.3vw/1.6 sans-serif;letter-spacing:.38em;color:#8eafca}
h1{margin:0;font-size:5vw;line-height:1.35;font-weight:500;letter-spacing:.12em;text-wrap:balance;max-width:100%;overflow-wrap:anywhere;text-shadow:0 2px 25px #b3d8f51a}
h1.with-winners{font-size:3.3vw;letter-spacing:.1em}.ceremony-description{margin:1.5vh 0 0;color:#a5b8cb;font:400 1.35vw/1.6 sans-serif;letter-spacing:.13em}
.award-emblem{margin:auto;position:relative;display:grid;place-items:center;width:17vh;height:17vh}.award-emblem span{font-size:10vh;line-height:1;color:#d6e9f8;text-shadow:0 0 55px #a8d2f23d}.award-emblem i{position:absolute;inset:0;border:1px solid #b5d7ef45;transform:rotate(45deg);border-radius:20%}
.award-winners{list-style:none;width:100%;padding:0;margin:auto 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.5vh 5vw;text-align:left}
.award-winners li{display:flex;align-items:center;gap:1.2vw;padding:1.4vh .7vw;border-bottom:1px solid #adcee92b;min-width:0}
.award-winners li>div{min-width:0}.award-winners strong{display:block;font-weight:500;font-size:2vw;line-height:1.35;overflow-wrap:anywhere}.award-winners p{margin:.5vh 0 0;font:400 1.1vw/1.5 sans-serif;color:#a2b9ce;overflow-wrap:anywhere}.award-rank{font:400 1.7vw/1.3 var(--font-family-data);color:#a7c8e2;min-width:2.5vw}.award-winners.is-few{grid-template-columns:minmax(0,1fr);max-width:62vw}.is-few li{justify-content:center;padding:2vh 0;border:0}.is-few strong{font-size:3.2vw}.is-few p{font-size:1.5vw}.award-page{font:500 1vw/1.3 sans-serif;letter-spacing:.18em;color:#c6dff2;margin:2vh 0 0}.award-page span{color:#778ca1}
.award-winners.is-podium{grid-template-columns:repeat(3,minmax(0,1fr));gap:3vw;align-items:start;max-width:81vw;margin:auto 0}
.is-podium li{flex-direction:column;text-align:center;gap:2vh;padding:3vh 1vw;border-bottom:0;border-top:1px solid #a9cfea36;background:linear-gradient(180deg,#a3c9e709,transparent 80%)}
.is-podium li:first-child{grid-column:2;grid-row:1;margin-top:0;border-top-color:#c8e4fba3}.is-podium li:nth-child(2){grid-column:1;grid-row:1;margin-top:6vh}.is-podium li:nth-child(3){grid-column:3;grid-row:1;margin-top:9vh}
.is-podium .award-rank{font-size:3vw;font-weight:300;letter-spacing:.06em}.is-podium li:first-child .award-rank{color:#edf7ff;font-size:4vw;text-shadow:0 0 32px #a7d0f049}
.is-podium strong{font-size:2vw;line-height:1.55;text-wrap:balance}.is-podium p{font-size:1.25vw;margin-top:2vh;color:#b9d7ed}
.is-podium li>div{position:relative;isolation:isolate}
.is-podium li>div::before{content:"";position:absolute;inset:-2.8vh -3vw;z-index:-1;pointer-events:none;background:radial-gradient(ellipse closest-side,#03060cf2 34%,#03060ca8 62%,#03060c00 100%)}
.ceremony-content.has-program-rows{top:16vh;bottom:10vh}
.has-program-rows .ceremony-kicker{margin-bottom:1.4vh}.has-program-rows h1.with-winners{font-size:2.8vw}
.award-winners.is-program-rows{grid-template-columns:minmax(0,1fr);gap:1.2vh;max-width:82vw;margin:auto 0}
.award-winners.is-program-rows li{display:grid;grid-template-columns:4vw minmax(0,1fr);align-items:start;gap:1.8vw;padding:1.05vh 0;border-bottom:1px solid #adcee92b;text-align:left}
.is-program-rows .award-rank{font-size:2.25vw;line-height:1.25;padding-top:.15vh;color:#b8d9f1}
.award-winners.is-program-rows strong{font-size:1.15vw;line-height:1.4;letter-spacing:.025em;overflow-wrap:anywhere}
.award-winners.is-program-rows p{font-size:.85vw;line-height:1.45;margin:.55vh 0 0;letter-spacing:0;color:#a8c2d8;overflow-wrap:anywhere}
.host-title{margin-top:8vh;font-size:5.2vw;letter-spacing:.18em}.host-mark{display:flex;gap:2vw;align-items:center;color:#adcadf;margin:4vh 0 2vh;font-size:1.7vw}.host-mark i{width:8vw;height:1px;background:linear-gradient(90deg,transparent,#9cc3e1)}.host-mark i:last-child{transform:rotate(180deg)}.host-subtitle{font:400 1vw/1.8 sans-serif;letter-spacing:.38em;color:#819db6}.ceremony-footer{position:absolute;bottom:5vh;left:5vw;right:5vw;display:flex;justify-content:space-between;color:#8299ae;font:400 .95vw/1.4 sans-serif;letter-spacing:.3em}
.award-crossfade-enter-active,.award-crossfade-leave-active{transition:opacity .32s ease}.award-crossfade-enter-from,.award-crossfade-leave-to{opacity:0}
.is-static .award-crossfade-enter-active,.is-static .award-crossfade-leave-active{transition:none}
@media(prefers-reduced-motion:reduce){.award-crossfade-enter-active,.award-crossfade-leave-active{transition:none}}
</style>
