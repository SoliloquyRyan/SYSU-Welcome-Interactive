<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'

const props = defineProps({
  color: { type: String, default: '#b8dfff' },
  seed: { type: String, default: '' },
  reduced: { type: Boolean, default: false },
})
const emit = defineEmits(['finish'])

let timer
const offset = computed(() => {
  let hash = 2166136261
  for (const char of props.seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  hash ^= hash >>> 16
  return { x: ((hash >>> 0) % 34) - 17, y: ((hash >>> 8) % 26) - 13 }
})

onMounted(() => { timer = window.setTimeout(() => emit('finish'), 1500) })
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div
    v-if="!reduced"
    class="screen-arrival-meteor"
    :style="{
      '--meteor-color': color,
      '--meteor-offset-x': `${offset.x}vw`,
      '--meteor-offset-y': `${offset.y}vh`,
    }"
    aria-hidden="true"
    data-testid="screen-arrival-meteor"
  >
    <i class="screen-arrival-meteor__trail"></i>
    <i class="screen-arrival-meteor__core"></i>
  </div>
</template>

<style scoped>
.screen-arrival-meteor{position:absolute;z-index:6;inset:0;overflow:hidden;pointer-events:none}
.screen-arrival-meteor__trail{position:absolute;left:50%;top:50%;width:clamp(150px,16vw,300px);height:3px;transform-origin:right center;background:linear-gradient(90deg,transparent,var(--meteor-color));filter:drop-shadow(0 0 8px var(--meteor-color));animation:screen-arrival-meteor-shoot 1.5s cubic-bezier(.18,.7,.2,1) both}
.screen-arrival-meteor__trail::after{content:"";position:absolute;right:-3px;top:-3px;width:9px;height:9px;border-radius:50%;background:#fff;box-shadow:0 0 22px 6px var(--meteor-color)}
.screen-arrival-meteor__core{position:absolute;left:50%;top:50%;width:72px;height:72px;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle,#fff 0 4%,var(--meteor-color) 9%,transparent 68%);filter:drop-shadow(0 0 22px var(--meteor-color));animation:screen-arrival-meteor-glow 1.5s ease-out both}
@keyframes screen-arrival-meteor-shoot{0%{opacity:0;transform:translate(calc(-52vw + var(--meteor-offset-x)),-38vh) rotate(32deg)}12%{opacity:.98}58%{opacity:.98;transform:translate(var(--meteor-offset-x),var(--meteor-offset-y)) rotate(32deg)}100%{opacity:0;transform:translate(var(--meteor-offset-x),var(--meteor-offset-y)) rotate(32deg)}}
@keyframes screen-arrival-meteor-glow{0%,50%{opacity:0;transform:translate(-50%,-50%) scale(.35)}70%{opacity:.9;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.35)}}
</style>
