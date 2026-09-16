<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AUDIO_ENVELOPE_EVENT, createAudioEnvelope } from '../rendering/audio-envelope'
import { audienceSkyPoints, audienceStars, giftStarHighlights, skyHash } from '../rendering/audience-sky'
const props = defineProps({ reduced: Boolean, paused: Boolean, compact: Boolean, overlay: Boolean, audio: Boolean,
  stars: { type: Array, default: () => [] }, effects: { type: Array, default: () => [] }, ownStarId: String, visual: Object })
const emit = defineEmits(['audio-status', 'sky-points'])
const canvas = ref(null), envelope = createAudioEnvelope()
const aspect = ref(props.compact ? 390 / 844 : 1672 / 941)
const starGlows = new Map()
function starGlow(color) {
  if (!starGlows.has(color)) {
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 48
    const c = sprite.getContext('2d'), g = c.createRadialGradient(24,24,0,24,24,24)
    g.addColorStop(0,color+'80'); g.addColorStop(.28,color+'28'); g.addColorStop(1,color+'00')
    c.fillStyle = g; c.fillRect(0,0,48,48); starGlows.set(color,sprite)
  }
  return starGlows.get(color)
}
const points = computed(() => audienceSkyPoints(props.stars, { ...props.visual, compact: props.compact, overlay: props.overlay, aspect: aspect.value }))
const highlights = computed(() => props.overlay || props.compact ? giftStarHighlights(points.value, props.effects) : [])
const admittedCount = computed(() => audienceStars(props.stars).length)
let context, observer, dustSprite, frame = 0, previous = 0, time = 0, width = 0, height = 0
let hidden = document.hidden, disconnected = navigator.onLine === false, disposed = false, reported = false
const active = () => !disposed && !props.reduced && !props.paused && !hidden
function receive(event) { if (props.audio && !disconnected && window.obsstudio && active()) envelope.receive(event.detail, performance.now()) }
function report(value) { if (reported !== value) { reported = value; emit('audio-status', value) } }
function paint(now, animated = false) {
  if (!context || !width || !height) return
  const dt = previous ? Math.min(50, now - previous) : 0; previous = now
  const sample = animated && props.audio ? envelope.sample(now) : { level: 0, available: false }
  report(sample.available)
  const level = sample.level * (props.visual?.strength ?? .5)
  if (animated) time += dt * (1 + level * .6)
  canvas.value?.parentElement?.style.setProperty('--city-audio', level.toFixed(3))
  context.clearRect(0, 0, width, height)
  // Diffuse, low-opacity grains have no star core or participant/count meaning.
  for (let i = 0; i < (props.compact ? 18 : 60); i++) {
    const x = ((skyHash('dust-x:' + i) % 10000) / 10000 + Math.sin(time / 47000 + i * 1.2) * .018) * width
    const y = (.13 + (skyHash('dust-y:' + i) % 10000) / 10000 * .77 + Math.sin(time / 59000 + i) * .014) * height
    if (props.overlay && x > width * .14 && x < width * .86) continue
    if (props.overlay && props.visual?.protectedAreas?.some(r => x / width > r.x && x / width < r.x + r.w && y / height > r.y && y / height < r.y + r.h)) continue
    const r = (props.compact ? 1.8 : 3.5) + i % 5
    context.globalAlpha = .10 + (i % 3) * .025 + level * .08
    if (dustSprite) context.drawImage(dustSprite, x - r * 2, y - r, r * 4, r * 2)
  }
  const giftLight = new Map(), wallNow = Date.now()
  if (animated && !disconnected) for (const { effect, stars } of highlights.value) {
    const progress = (wallNow - effect.startedAt) / effect.duration
    if (progress < 0 || progress >= 1) continue
    const pulse = Math.sin(Math.PI * .5 * Math.min(1, progress / .20))
    const fade = progress < .20 ? pulse : (1 - (progress - .20) / .80) ** 2
    for (const [id, amount] of stars) giftLight.set(id, Math.max(giftLight.get(id) ?? 0, amount * fade))
  }
  for (const star of points.value) {
    const personal = star.id === props.ownStarId
    const x = star.x * width, y = star.y * height, r = star.radius * (personal ? 1.6 : 1)
    const shimmer = animated ? Math.sin(time / (props.compact ? 6800 : 4800) + star.phase) * (props.compact ? .025 : .065) : 0
    const depth = props.compact ? .36 + (star.slot % 100) / 100 * .30 : .56
    const light = props.overlay ? Math.min(.9, .025 + level * .012 + (giftLight.get(star.id) ?? 0))
      : Math.min(.98, (personal ? .82 : depth) + shimmer + level * .18 + (giftLight.get(star.id) ?? 0))
    context.globalAlpha = light; context.fillStyle = star.color || '#dce4ec'
    context.drawImage(starGlow(star.color || '#dce4ec'),x-r*3.2,y-r*3.2,r*6.4,r*6.4)
    context.globalAlpha = light
    context.beginPath(); context.arc(x, y, r, 0, Math.PI * 2); context.fill()
    context.globalAlpha = light * .8; context.fillStyle = '#f4f2f6'
    context.beginPath(); context.arc(x, y, r * .37, 0, Math.PI * 2); context.fill()
    if (!props.overlay && star.slot % (props.compact ? 19 : 13) === 0) {
      context.globalAlpha = light * .34; context.fillStyle = star.color || '#dce4ec'
      context.fillRect(x - r * 3, y - .4, r * 6, .8); context.fillRect(x - .4, y - r * 3, .8, r * 6)
    }
  }
  if (props.overlay) {
    context.lineWidth = props.compact ? .7 : 1.2
    context.strokeStyle = props.visual?.accent ?? '#b7c4d0'; context.globalAlpha = .12 + level * .2
    for (const side of [1, -1]) {
      const x = side === 1 ? width * .024 : width * .976
      context.beginPath(); context.moveTo(x, height * .2); context.lineTo(x, height * .63)
      context.lineTo(x + side * width * .025, height * .69); context.stroke()
    }
  }
  context.globalAlpha = 1
}
function tick(now) { frame = 0; if (!active()) return; paint(now, true); frame = requestAnimationFrame(tick) }
function sync() {
  cancelAnimationFrame(frame); frame = 0; previous = 0; envelope.reset(); report(false)
  paint(performance.now(), false)
  if (active() && context) frame = requestAnimationFrame(tick)
}
function resize() {
  if (!canvas.value) return
  const bounds = canvas.value.getBoundingClientRect(); width = bounds.width; height = bounds.height
  if (width > 0 && height > 0) aspect.value = width / height
  const dpr = Math.min(window.devicePixelRatio || 1, props.compact ? 1 : 1.5)
  canvas.value.width = Math.round(width * dpr); canvas.value.height = Math.round(height * dpr)
  context?.setTransform(dpr, 0, 0, dpr, 0, 0); paint(performance.now(), active())
}
function visibility() { hidden = document.hidden; sync() }
function connectivity() { disconnected = navigator.onLine === false; sync() }
watch([() => props.reduced, () => props.paused, () => props.audio, () => props.overlay, () => props.visual?.id], sync)
watch(points, value => { emit('sky-points', value); paint(performance.now(), active()) }, { immediate: true })
onMounted(() => {
  dustSprite = document.createElement('canvas'); dustSprite.width = dustSprite.height = 32
  const dc = dustSprite.getContext('2d'), gradient = dc.createRadialGradient(16,16,0,16,16,16)
  gradient.addColorStop(0,'#c6c2ce70'); gradient.addColorStop(.3,'#c6c2ce24'); gradient.addColorStop(1,'#c6c2ce00')
  dc.fillStyle = gradient; dc.fillRect(0,0,32,32)
  context = canvas.value.getContext('2d'); observer = new ResizeObserver(resize); observer.observe(canvas.value)
  document.addEventListener('visibilitychange', visibility); window.addEventListener(AUDIO_ENVELOPE_EVENT, receive)
  window.addEventListener('offline', connectivity); window.addEventListener('online', connectivity)
  resize(); sync()
})
onBeforeUnmount(() => {
  disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); envelope.reset(); starGlows.clear()
  document.removeEventListener('visibilitychange', visibility); window.removeEventListener(AUDIO_ENVELOPE_EVENT, receive)
  window.removeEventListener('offline', connectivity); window.removeEventListener('online', connectivity)
})
</script>
<template><canvas ref="canvas" class="star-city-atmosphere" aria-hidden="true" :data-audience-star-count="admittedCount" :data-projected-star-count="points.length" :data-star-placement="overlay ? 'video-faint' : 'art-whitespace'" :data-star-rest-opacity="overlay ? .025 : .56" data-decorative-star-count="0" :data-motion="reduced ? 'static' : paused ? 'paused' : 'ambient'"></canvas></template>
<style scoped>.star-city-atmosphere{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3}</style>
