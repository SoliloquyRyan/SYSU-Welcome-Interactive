<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { giftStarAnchor } from '../rendering/audience-sky'
const props = defineProps({ effects: { type: Array, default: () => [] }, points: { type: Array, default: () => [] }, protectedAreas: { type: Array, default: () => [] }, aggregate: Object, compact: Boolean, reduced: Boolean })
// Let moving gifts pass behind protected text and video subjects. The path and
// timing stay continuous; the mask does not change gift state or the queue.
const skyMask = computed(() => {
  if (!props.protectedAreas.length) return undefined
  const cuts = props.protectedAreas.map(r => `<rect x="${r.x*100}%" y="${r.y*100}%" width="${r.w*100}%" height="${r.h*100}%" fill="black"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><mask id="safe"><rect width="100%" height="100%" fill="white"/>${cuts}</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#safe)"/></svg>`
  return { maskImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, maskSize: '100% 100%' }
})
const root = ref(null), bounds = ref({ width: 1920, height: 1080 }), anchors = new Map()
let observer
function anchorFor(effect) {
  if (!anchors.has(effect.id)) anchors.set(effect.id, giftStarAnchor(props.points, effect.id, effect.publicStarId))
  return anchors.get(effect.id)
}
function effectStyle(effect) {
  const star = anchorFor(effect) ?? { x: .94, y: .18 }
  const fromX = props.compact ? .03 : .32 + effect.anchor * .025
  const fromY = .045 + (effect.anchor % 3) * .012
  const toX = 1.07, toY = props.compact ? .185 : .29
  const angle = Math.atan2((toY - fromY) * bounds.value.height, (toX - fromX) * bounds.value.width) * 180 / Math.PI
  return { '--gift-color': effect.color, '--gift-x': `${star.x * 100}%`, '--gift-y': `${star.y * 100}%`, '--gift-duration': `${effect.duration}ms`, '--flight-y': `${14 + effect.anchor * 2.6}%`,
    '--meteor-from-x': `${fromX * bounds.value.width}px`, '--meteor-from-y': `${fromY * bounds.value.height}px`, '--meteor-to-x': `${toX * bounds.value.width}px`, '--meteor-to-y': `${toY * bounds.value.height}px`, '--meteor-angle': `${angle}deg` }
}
watch(() => props.effects, effects => { const ids = new Set(effects.map(e => e.id)); for (const id of anchors.keys()) if (!ids.has(id)) anchors.delete(id) })
watch(() => props.points, () => anchors.clear())
onMounted(() => { observer = new ResizeObserver(() => { const r = root.value?.getBoundingClientRect(); if (r) bounds.value = { width: r.width, height: r.height } }); observer.observe(root.value) })
onBeforeUnmount(() => { observer?.disconnect(); anchors.clear() })
</script>
<template>
  <div ref="root" class="gift-sky" :style="skyMask" :class="{ 'is-compact': compact, 'is-static': reduced }" aria-hidden="true" data-testid="gift-sky">
    <div v-for="effect in effects" :key="effect.id" class="gift-sky-effect" :class="[effect.giftId, { 'is-static': effect.static }]"
      :style="effectStyle(effect)" :data-gift-visual="effect.giftId.slice(5)" :data-gift-quantity="effect.quantity" :data-gift-batches="effect.batches">
      <template v-if="effect.static || reduced || (!anchorFor(effect) && ['gift-glimmer','gift-beacon'].includes(effect.giftId))"><span v-if="anchorFor(effect)" class="gift-static-star">✦</span><span class="gift-static-count">×{{ effect.quantity }}</span></template>
      <template v-else-if="effect.giftId === 'gift-glimmer' || effect.giftId === 'gift-beacon'">
        <span class="gift-star-core"></span>
        <template v-if="effect.giftId === 'gift-beacon'"><i class="gift-wave"></i><i class="gift-wave gift-wave-second"></i></template>
      </template>
      <div v-else-if="effect.giftId === 'gift-orbit'" class="gift-meteor-traveller"><div class="gift-meteor-direction"><span class="gift-meteor-tail"></span><span class="gift-meteor-core"></span></div></div>
      <div v-else class="gift-traveller">
        <span class="gift-trail"></span>
        <svg v-if="effect.giftId === 'gift-starship'" class="gift-small-ship" viewBox="0 0 80 32" fill="none">
          <path d="M77 15 32 3l8 9-23-2-11 6 13 7 22-3-10 10 46-13Z" fill="#29334a" stroke="currentColor" stroke-width="1.2" />
          <path d="m76 16-37-1-20 2m21-4 10-2m-8 10 9-2" stroke="#e2eafa" stroke-width="1" opacity=".8" />
          <path d="m18 14-9 2 9 3" stroke="currentColor" stroke-width="2" />
        </svg>
        <span v-else class="gift-meteor-core"></span>
      </div>
    </div>
    <span v-if="aggregate" class="gift-sky-aggregate">✦ <small>×{{ aggregate.quantity }}</small></span>
  </div>
</template>
<style scoped>
.gift-sky{position:absolute;inset:0;z-index:4;overflow:hidden;pointer-events:none;contain:layout paint;--ship-size:72px;--trail-size:150px;--wave-size:68px}
.gift-sky-effect{position:absolute;inset:0;color:var(--gift-color);pointer-events:none}
.gift-star-core,.gift-wave,.gift-static-star{position:absolute;left:var(--gift-x);top:var(--gift-y)}
.gift-star-core{width:5px;height:5px;margin:-2.5px;border-radius:50%;background:#f9f3ff;box-shadow:0 0 9px 2px var(--gift-color);animation:gift-star-flash var(--gift-duration) ease-out both}
.gift-star-core::before,.gift-star-core::after{content:'';position:absolute;left:50%;top:50%;width:20px;height:1px;background:var(--gift-color);transform:translate(-50%,-50%)}
.gift-star-core::after{transform:translate(-50%,-50%) rotate(90deg)}
.gift-wave{width:var(--wave-size);height:var(--wave-size);margin:calc(var(--wave-size)/-2);border:1px solid currentColor;border-radius:50%;animation:gift-star-wave 1.1s ease-out both}
.gift-wave-second{animation-delay:.26s}
.gift-traveller{position:absolute;left:0;top:var(--flight-y);width:100%;height:32px;animation:gift-sky-pass var(--gift-duration) linear both}
.gift-trail{position:absolute;left:calc(var(--ship-size)*.12 - var(--trail-size));top:49%;width:var(--trail-size);height:2px;background:linear-gradient(90deg,transparent,currentColor);transform-origin:right center;opacity:.72}
.gift-small-ship{position:relative;width:var(--ship-size);height:auto;display:block}
.gift-orbit .gift-traveller{height:6px;--ship-size:6px;--trail-size:110px}
.gift-orbit .gift-trail{height:1.5px}
.gift-meteor-core{display:block;width:5px;height:5px;background:#f6edff;border-radius:50%;box-shadow:0 0 7px currentColor}
.gift-meteor-traveller{position:absolute;left:0;top:0;width:0;height:0;animation:gift-meteor-pass var(--gift-duration) linear both}
.gift-meteor-direction{position:absolute;transform:rotate(var(--meteor-angle));transform-origin:0 0}
.gift-meteor-tail{position:absolute;right:0;top:-1px;width:190px;height:3px;background:linear-gradient(90deg,transparent 0%,currentColor 82%,#faf6ff);clip-path:polygon(0 45%,100% 0,100% 100%,0 55%);opacity:.7}
.gift-meteor-direction .gift-meteor-core{position:absolute;left:-2px;top:-2px;width:4px;height:4px}
.gift-static-star{font-size:14px;line-height:1;transform:translate(-50%,-50%)}
.gift-static-count{position:absolute;left:calc(var(--gift-x) + 12px);top:calc(var(--gift-y) - 7px);font:500 12px/1.2 var(--font-family-ui,sans-serif);opacity:.7}
.gift-sky-aggregate{position:absolute;right:3%;top:16%;color:#dce7f3;font-size:15px;opacity:.68}.gift-sky-aggregate small{font:500 11px var(--font-family-ui,sans-serif)}
.is-compact{--ship-size:24px;--trail-size:48px;--wave-size:34px}
.is-compact .gift-traveller{height:12px}.is-compact .gift-orbit .gift-traveller{--trail-size:42px}
.is-compact .gift-star-core{width:3px;height:3px;margin:-1.5px}.is-compact .gift-star-core::before,.is-compact .gift-star-core::after{width:12px}
.is-compact .gift-static-star{font-size:10px}.is-compact .gift-static-count{font-size:10px}.is-compact .gift-sky-aggregate{top:24%;font-size:11px}
.is-compact .gift-meteor-tail{width:60px;height:2px}.is-compact .gift-meteor-direction .gift-meteor-core{width:3px;height:3px}
@keyframes gift-star-flash{0%{opacity:0;transform:scale(.5)}25%{opacity:.95;transform:scale(1.2)}100%{opacity:0;transform:scale(.75)}}
@keyframes gift-star-wave{0%{opacity:.65;transform:scale(.08)}100%{opacity:0;transform:scale(1)}}
@keyframes gift-sky-pass{0%{transform:translate3d(-15%,16px,0);opacity:0}10%{opacity:.9}90%{opacity:.9}100%{transform:translate3d(115%,-40px,0);opacity:0}}
@keyframes gift-meteor-pass{0%{transform:translate3d(var(--meteor-from-x),var(--meteor-from-y),0);opacity:0}12%{opacity:.9}78%{opacity:.75}100%{transform:translate3d(var(--meteor-to-x),var(--meteor-to-y),0);opacity:0}}
.is-static .gift-traveller,.is-static .gift-meteor-traveller,.is-static .gift-star-core,.is-static .gift-wave{animation:none}
</style>
