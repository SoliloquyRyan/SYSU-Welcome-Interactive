<script setup>
import { computed } from 'vue'

defineEmits(['open-archive'])

const props = defineProps({
  participant: { type: Object, required: true },
  starCode: { type: String, required: true },
  color: { type: String, required: true },
})

// Only the signed-in participant's confirmed facts become memories.
// Missing actions are omitted; the presentation never awards participation.
const memories = computed(() => [
  [props.participant.onboardingState === 'ADMITTED', '抵达星河'],
  [props.participant.started, '启动恒星'],
  [props.participant.firstGiftRewardedAt, '送出应援'],
  [props.participant.firstBarrageRewardedAt, '留下欢呼'],
  [props.participant.cooperativeLightAt, '一起点亮'],
].filter(([confirmed]) => Boolean(confirmed)).map(([, label]) => label))
</script>

<template>
  <section class="personal-memento" aria-label="今夜的个人纪念" :style="{ '--memento-color': color }">
    <p class="personal-memento__eyebrow">今夜纪念 · 迎新之夜</p>
    <div class="personal-memento__identity">
      <span class="personal-memento__signature" aria-hidden="true"></span>
      <div><small>这一束光，属于</small><strong>{{ participant.displayName }}</strong></div>
      <span class="personal-memento__code">{{ starCode }}<small>{{ participant.colorTemperatureKelvin ? `${participant.colorTemperatureKelvin.toLocaleString('zh-CN')} K` : '星色尚未确认' }}</small></span>
    </div>
    <ol v-if="memories.length" class="personal-memento__memories" aria-label="你在今夜留下的片段">
      <li v-for="memory in memories" :key="memory">{{ memory }}</li>
    </ol>
    <p v-else class="personal-memento__empty">你尚未完成入场，档案仍可查看。</p>
    <p class="personal-memento__farewell">把今夜的光，带向更远的地方。</p>
    <div class="personal-memento__footer"><span><span>本场活动已结束</span> · 记录已保存</span><button type="button" @click="$emit('open-archive')">查看个人档案 <span aria-hidden="true">↗</span></button></div>
  </section>
</template>

<style scoped>
.personal-memento { text-align: left; }
.personal-memento__identity { display: flex; align-items: center; gap: 12px; }
.personal-memento__signature { width: 2px; height: 44px; flex: 0 0 auto; background: var(--memento-color); box-shadow: 0 0 16px color-mix(in srgb, var(--memento-color) 22%, transparent); }
.personal-memento__identity > div { min-width: 0; flex: 1; }
.personal-memento small { display: block; color: var(--color-orbit-text-secondary); font-size: var(--font-size-xs); line-height: 1.6; }
.personal-memento__identity strong { display: block; margin-top: 3px; color: var(--color-orbit-text-primary); font-size: 1rem; font-weight: 500; overflow-wrap: anywhere; }
.personal-memento__code { flex: 0 0 auto; color: var(--memento-color); font: 500 1rem var(--font-data, var(--font-family-data)); font-variant-numeric: tabular-nums; text-align: right; }
.personal-memento__code small { margin-top: 6px; font-size: var(--font-size-xs); }
.personal-memento__memories { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 22px 0 0; padding: 0; list-style: none; }
.personal-memento__memories li { display: flex; align-items: center; gap: 6px; color: var(--color-orbit-text-secondary); font-size: var(--font-size-xs); }
.personal-memento__memories li::before { width: 3px; height: 3px; flex: 0 0 auto; background: var(--memento-color); content: ""; }
.personal-memento__empty { color: var(--color-orbit-text-secondary); font-size: var(--font-size-xs); }
.personal-memento__farewell { margin: 24px 0 16px; color: var(--color-orbit-text-primary); font-size: 0.875rem; font-weight: 400; line-height: 1.8; }
.personal-memento__footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; column-gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-orbit-border-subtle); }
.personal-memento__footer > span { color: var(--color-orbit-text-secondary); font-size: var(--font-size-xs); }
.personal-memento__footer button { min-height: 44px; padding: 0 2px; border: 0; color: var(--color-orbit-text-primary); background: transparent; font: 500 0.875rem var(--font-ui, var(--font-family-cjk)); cursor: pointer; }
.personal-memento__footer button > span { margin-left: 6px; color: var(--memento-color); }
.personal-memento__footer button:focus-visible { outline: 2px solid var(--color-orbit-focus); outline-offset: 3px; }
.personal-memento__footer button:active { opacity: 0.75; }
@media (max-height: 620px) {
  .personal-memento__memories { margin-top: 12px; }
  .personal-memento__farewell { margin-block: 12px 8px; }
}

.personal-memento__eyebrow { color:#a6bdd8;font-size:11px;letter-spacing:.14em;margin:0 0 22px; }
.personal-memento__identity { padding-bottom:20px;border-bottom:1px solid #abc6e41c; }
.personal-memento__identity strong { font-size:18px; }
.personal-memento__signature { height:52px;width:3px;border-radius:3px; }
.personal-memento__memories { gap:12px 20px; }
.personal-memento__memories li { color:#c0d0e5; }
.personal-memento__farewell { font-size:16px;font-weight:400;line-height:1.8;margin-block:28px 24px; }
@media(max-height:620px) { .personal-memento__eyebrow { margin-bottom:12px; } .personal-memento__identity { padding-bottom:12px; } .personal-memento__farewell { margin-block:16px;font-size:14px; } }
.personal-memento__footer{gap:10px;padding-top:14px}
.personal-memento__footer button{padding:0 12px;border:1px solid rgba(173,205,233,.2);border-radius:12px;background:rgba(39,65,87,.2)}
.personal-memento__identity strong{line-height:1.5}
</style>
