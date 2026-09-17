<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
defineProps({ color: {type: String, default: '#b8dfff'} })
const emit = defineEmits(['finish'])
let timer
const finish = () => emit('finish')
function visibility() { if (document.hidden) finish() }
onMounted(() => { timer = window.setTimeout(finish, 1600); document.addEventListener('visibilitychange', visibility) })
onBeforeUnmount(() => { clearTimeout(timer); document.removeEventListener('visibilitychange', visibility) })
</script>
<template>
  <div class="entry-meteor" :style="{'--meteor-color': color}" data-testid="personal-entry-meteor">
    <i aria-hidden="true"></i><button type="button" @click="finish">跳过流星</button>
  </div>
</template>
<style scoped>
.entry-meteor{position:fixed;inset:0;z-index:30;pointer-events:none;overflow:hidden}
.entry-meteor i{position:absolute;left:15%;top:18%;width:140px;height:2px;transform-origin:right center;background:linear-gradient(90deg,transparent,var(--meteor-color));filter:drop-shadow(0 0 5px var(--meteor-color));animation:entry-shoot 1.6s ease-out both}
.entry-meteor i:after{content:'';position:absolute;right:0;top:-2px;width:6px;height:6px;background:#fff;border-radius:50%;box-shadow:0 0 12px 3px var(--meteor-color)}
.entry-meteor button{pointer-events:auto;position:absolute;right:16px;top:max(58px,env(safe-area-inset-top));min-height:44px;padding:8px 14px;border:1px solid #c8bde23b;border-radius:24px;background:#202033ad;color:#f1eaf8;font:inherit;font-size:12px}
@keyframes entry-shoot{0%{transform:translate(-160px,-60px) rotate(25deg);opacity:0}12%{opacity:1}80%{opacity:1}100%{transform:translate(100vw,35vh) rotate(25deg);opacity:0}}
@media(prefers-reduced-motion:reduce){.entry-meteor{display:none}}
</style>
