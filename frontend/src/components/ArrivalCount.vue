<script setup>
defineProps({
  count: { type: Number, required: true },
  reduced: { type: Boolean, default: false },
})
</script>

<template>
  <aside class="screen-arrival-count" :class="{ 'is-static': reduced }" aria-label="已入场人数">
    <span>已入场</span>
    <div><strong :key="count">{{ count }}</strong><small>人</small></div>
  </aside>
</template>

<style scoped>
.screen-arrival-count{position:absolute;z-index:3;top:7vh;right:6.5vw;min-width:176px;padding-top:18px;border-top:1px solid #c1dbef55;color:#e9f3fa;pointer-events:none;text-align:right;text-shadow:0 2px 16px #000}
.screen-arrival-count>span{display:block;font-size:clamp(16px,1.15vw,24px);letter-spacing:.14em;color:#b4c8d8}
.screen-arrival-count>div{display:flex;align-items:baseline;justify-content:flex-end;gap:14px;margin-top:6px}
.screen-arrival-count strong{font:500 clamp(48px,4.2vw,84px)/1.12 var(--font-family-signal);font-variant-numeric:tabular-nums;animation:arrival-count-enter .48s ease-out both}
.screen-arrival-count small{font-size:clamp(18px,1.25vw,26px);color:#adc2d5}
.is-static strong{animation:none}
@keyframes arrival-count-enter{from{opacity:.55;transform:translateY(6px)}to{opacity:1;transform:none}}
</style>
