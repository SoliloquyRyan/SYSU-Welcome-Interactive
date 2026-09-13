<script>
import starshipTexture from '../assets/gifts/starship-nocturne.svg'

// Warm the shared texture when the route loads, before the first live gift.
// Image loading never changes the gift lifetime or ledger.
if (typeof Image !== 'undefined') {
  const texture = new Image()
  texture.decoding = 'async'
  texture.src = starshipTexture
  texture.decode?.().catch(() => {})
}
</script>

<script setup>
import { computed, ref } from 'vue'
import { CINEMA_TIMING } from '../rendering/cinema-timing'

const props = defineProps({
  surface: { type: String, default: 'phone' },
  reduced: { type: Boolean, default: false },
  quantity: { type: Number, default: 1 },
})
const textureFailed = ref(false)
const duration = computed(() => props.surface === 'screen' ? CINEMA_TIMING.starshipScreenMs : CINEMA_TIMING.starshipPhoneMs)
</script>

<template>
  <div class="gift-starship-flight" :class="[`is-${surface}`, { 'is-reduced': reduced, 'is-texture-failed': textureFailed }]"
    :style="{ '--flight-duration': `${duration}ms`, '--starship-texture': `url(${starshipTexture})` }"
    aria-hidden="true" data-gift-visual="starship">
    <div class="gift-starship-flight__exposure"></div>
    <div class="gift-starship-flight__portal"><i></i><i></i><i></i><span></span></div>
    <div class="gift-starship-flight__shock"><i></i><i></i></div>
    <div class="gift-starship-flight__particles">
      <i v-for="n in 22" :key="n" :style="{ '--particle': n, '--x': (n * 37) % 100, '--y': 20 + ((n * 53) % 65), '--size': 1 + (n % 3) }"></i>
    </div>
    <div v-if="!textureFailed" class="gift-starship-flight__craft">
      <div class="gift-starship-flight__bank">
        <i class="gift-starship-flight__trail is-far"></i>
        <i class="gift-starship-flight__trail is-near"></i>
        <i class="gift-starship-flight__wake"></i>
        <img class="gift-starship-flight__hull" :src="starshipTexture" width="2172" height="724"
          alt="" decoding="async" draggable="false" @error="textureFailed = true" />
        <div class="gift-starship-flight__reflection"><i></i></div>
        <i class="gift-starship-flight__engine is-far"></i>
        <i class="gift-starship-flight__engine is-near"></i>
        <i class="gift-starship-flight__beacon"></i>
      </div>
    </div>
    <div class="gift-starship-flight__warp"></div>
    <div class="gift-starship-flight__caption">
      <p>星舰<em>×{{ quantity }}</em></p>
      <span class="gift-starship-flight__rule"></span>
    </div>
  </div>
</template>

<style scoped>
.gift-starship-flight {
  position:absolute; z-index:16; inset:0; overflow:hidden; pointer-events:none;
  isolation:isolate; container-type:size;
}
.gift-starship-flight__exposure {
  position:absolute; inset:0; opacity:0;
  background:radial-gradient(ellipse at 52% 47%, #07101b12 8%, #02040780 83%);
  animation:starship-exposure var(--flight-duration) linear both;
}
.gift-starship-flight__craft {
  position:absolute; left:0; top:40%; width:90cqw; max-width:460px;
  opacity:0; transform-origin:52% 50%; will-change:transform,opacity;
  animation:starship-phone var(--flight-duration) linear both;
}
.gift-starship-flight__bank {
  position:relative; width:100%; aspect-ratio:3;
  animation:starship-bank var(--flight-duration) ease-in-out both;
}
.gift-starship-flight__hull {
  position:relative; z-index:2; display:block; width:100%; height:auto;
  filter:drop-shadow(0 5px 6px #0008); user-select:none;
}
.gift-starship-flight__reflection {
  position:absolute; z-index:3; inset:0; overflow:hidden;
  mask:var(--starship-texture) center / contain no-repeat;
  -webkit-mask:var(--starship-texture) center / contain no-repeat;
}
.gift-starship-flight__reflection i {
  position:absolute; inset:-35%; opacity:0; transform:translateX(-60%);
  background:linear-gradient(110deg, transparent 35%, #c9eaf818 43%, #fff1cf75 48%, #ffffffb0 50%, transparent 58%);
  animation:starship-reflection var(--flight-duration) linear both;
}
.gift-starship-flight__trail {
  position:absolute; z-index:1; width:75%; height:4.5%; right:93.8%; top:39.7%;
  transform-origin:right center; opacity:0;
  background:linear-gradient(90deg, transparent, #507bac08 18%, #668ed126 45%, #89ceef9c 88%, #f0fcff);
  border-radius:50%; filter:blur(1.4px);
  animation:starship-engine-burn var(--flight-duration) linear both;
}
.gift-starship-flight__trail.is-near { top:63.7%; right:90.6%; width:96%; height:6%; }
.gift-starship-flight__trail::after {
  position:absolute; inset:40% 0; border-radius:50%; content:'';
  background:linear-gradient(90deg, transparent 5%, #a6dfff66 66%, #fff 100%);
}
.gift-starship-flight__wake {
  position:absolute; z-index:0; top:26%; right:84%; width:118%; height:52%;
  opacity:0; transform-origin:right center;
  background:radial-gradient(ellipse at 100% 50%, #7ca3ff28, #5364ba0b 45%, transparent 70%);
  animation:starship-engine-burn var(--flight-duration) linear both;
}
.gift-starship-flight__engine {
  position:absolute; z-index:4; left:6.2%; top:42%; width:8%; height:20%; opacity:0;
  background:radial-gradient(ellipse, #f5ffffe0 0%, #9fe8ff80 12%, #79c4ff24 36%, transparent 66%);
  transform:translate(-50%,-50%);
  animation:starship-engine-light var(--flight-duration) linear both;
}
.gift-starship-flight__engine.is-near { left:9.4%; top:66.7%; width:10%; height:25%; }
.gift-starship-flight__beacon {
  position:absolute; z-index:4; left:88%; top:28%; width:3px; height:3px;
  border-radius:50%; background:#fff4d0; box-shadow:0 0 9px #e7cb8e;
  animation:starship-beacon var(--flight-duration) linear both;
}
.gift-starship-flight__portal {
  position:absolute; left:89%; top:29%; width:23cqw; aspect-ratio:1;
  border-radius:50%; opacity:0; transform:translate(-50%,-50%) rotate(-16deg) scaleX(.38);
  animation:starship-portal var(--flight-duration) linear both;
}
.gift-starship-flight__portal i {
  position:absolute; inset:0; border-radius:50%;
  border:1px solid #c7e9f276; box-shadow:0 0 12px #74c7f02e,inset 0 0 14px #8ebce226;
}
.gift-starship-flight__portal i:nth-child(2) { inset:7%; border-color:#f4dbab9c; }
.gift-starship-flight__portal i:nth-child(3) { inset:-9%; border-color:#7fbded28; border-style:dashed; }
.gift-starship-flight__portal span {
  position:absolute; inset:-16%; border-radius:50%;
  background:radial-gradient(ellipse, transparent 48%, #9dd2ed18 51%, transparent 57%);
}
.gift-starship-flight__shock {
  position:absolute; left:89%; top:29%; width:23cqw; aspect-ratio:1;
  transform:translate(-50%,-50%) rotate(-16deg) scaleX(.38);
}
.gift-starship-flight__shock i {
  position:absolute; inset:0; border:1px solid #b2deec5c; border-radius:50%; opacity:0;
  animation:starship-shock var(--flight-duration) ease-out both;
}
.gift-starship-flight__shock i:nth-child(2) { inset:12%; }
.gift-starship-flight__particles { position:absolute; inset:0; }
.gift-starship-flight__particles i {
  position:absolute; left:calc(var(--x) * 1%); top:calc(var(--y) * 1%);
  width:calc(var(--size) * 1px); height:1px; border-radius:50%; opacity:0;
  background:#d8e5eb; box-shadow:0 0 4px #c8e7f554; transform-origin:right center;
  animation:starship-particle var(--flight-duration) linear both;
}
.gift-starship-flight__warp {
  position:absolute; z-index:5; left:-10%; top:42%; width:125%; height:2px; opacity:0;
  background:linear-gradient(90deg, transparent, #94d8fc6b 25%, #ecf9ff 73%, transparent);
  box-shadow:0 0 16px #a1d6f347; transform:rotate(-7deg) scaleX(.1); transform-origin:80% center;
  animation:starship-warp var(--flight-duration) ease-out both;
}
.gift-starship-flight__caption {
  position:absolute; z-index:6; left:8%; top:56%; margin:0; opacity:0;
  color:#f0ece2; text-shadow:0 2px 15px #030508;
  animation:starship-caption var(--flight-duration) linear both;
}
.gift-starship-flight__eyebrow { display:flex; align-items:center; gap:9px; color:#cfbf9d; font-size:9px; letter-spacing:.22em; }
.gift-starship-flight__eyebrow i { width:4px; height:4px; background:#e9d6b1; transform:rotate(45deg); }
.gift-starship-flight__caption p { display:flex; align-items:center; gap:18px; margin:10px 0 7px; font-size:24px; font-weight:450; letter-spacing:.13em; }
.gift-starship-flight__caption em { color:#f0d8a9; font:350 24px var(--font-family-data,sans-serif); letter-spacing:-.04em; }
.gift-starship-flight__caption strong { display:block; font-size:10px; font-weight:400; letter-spacing:.2em; color:#b6bdc5; }
.gift-starship-flight__rule { display:block; width:95px; height:1px; margin-top:16px; background:linear-gradient(90deg,#d8c39880,transparent); }
.is-screen .gift-starship-flight__craft { top:24.5%; width:64cqw; max-width:1440px; animation-name:starship-screen; }
.is-screen .gift-starship-flight__caption { left:17%; top:68%; }
.is-screen .gift-starship-flight__eyebrow { font-size:clamp(11px,1cqw,18px); gap:15px; }
.is-screen .gift-starship-flight__eyebrow i { width:6px; height:6px; }
.is-screen .gift-starship-flight__caption p { margin:19px 0 14px; font-size:clamp(32px,3.1cqw,64px); gap:32px; }
.is-screen .gift-starship-flight__caption em { font-size:clamp(32px,3.3cqw,68px); }
.is-screen .gift-starship-flight__caption strong { font-size:clamp(12px,1cqw,20px); }
.is-screen .gift-starship-flight__rule { width:210px; margin-top:26px; }
.is-phone .gift-starship-flight__portal,.is-phone .gift-starship-flight__shock { left:96%; top:38%; width:45cqw; }
.is-phone .gift-starship-flight__warp { top:46%; }

/* The choreography fits the existing event lifetime without a new timer or queue. */
@keyframes starship-screen {
  0% { opacity:0; transform:translate3d(-65cqw,10cqh,0) rotate(-8deg) scale(.32); }
  12% { opacity:.8; transform:translate3d(-38cqw,7cqh,0) rotate(-6deg) scale(.46); }
  30% { opacity:1; transform:translate3d(3cqw,2cqh,0) rotate(-4deg) scale(.82); animation-timing-function:cubic-bezier(.16,.8,.28,1); }
  43% { opacity:1; transform:translate3d(15cqw,0,0) rotate(-3deg) scale(.97); }
  63% { opacity:1; transform:translate3d(19cqw,-1.5cqh,0) rotate(-3deg) scale(1.03); animation-timing-function:cubic-bezier(.6,0,.9,.45); }
  77% { opacity:1; transform:translate3d(42cqw,-6cqh,0) rotate(-5deg) scale(1.03); }
  91%,100% { opacity:0; transform:translate3d(133cqw,-24cqh,0) rotate(-8deg) scale(.8); }
}
@keyframes starship-phone {
  0% { opacity:0; transform:translate3d(-95cqw,8cqh,0) rotate(-8deg) scale(.5); }
  15% { opacity:.8; transform:translate3d(-59cqw,4cqh,0) rotate(-6deg) scale(.7); }
  36% { opacity:1; transform:translate3d(-1cqw,0,0) rotate(-5deg) scale(.92); animation-timing-function:ease-out; }
  61% { opacity:1; transform:translate3d(8cqw,-1cqh,0) rotate(-4deg) scale(.96); animation-timing-function:cubic-bezier(.6,0,.9,.45); }
  77% { opacity:1; transform:translate3d(53cqw,-6cqh,0) rotate(-6deg) scale(1); }
  93%,100% { opacity:0; transform:translate3d(150cqw,-16cqh,0) rotate(-8deg) scale(.84); }
}
@keyframes starship-bank {
  0%,18% { transform:perspective(1400px) rotateY(-12deg) rotateX(10deg); }
  43% { transform:perspective(1400px) rotateY(-2deg) rotateX(0); }
  63% { transform:perspective(1400px) rotateY(2deg) rotateX(-3deg); }
  85%,100% { transform:perspective(1400px) rotateY(16deg) rotateX(-8deg); }
}
@keyframes starship-reflection {
  0%,28% { opacity:0; transform:translateX(-60%); }
  35% { opacity:.12; } 58% { opacity:.35; }
  70%,100% { opacity:0; transform:translateX(60%); }
}
@keyframes starship-engine-burn {
  0% { opacity:0; transform:scaleX(.3); }
  16%,29% { opacity:.72; transform:scaleX(.9); }
  43%,61% { opacity:.45; transform:scaleX(.44); }
  71% { opacity:.9; transform:scaleX(1.2); }
  85%,100% { opacity:1; transform:scaleX(2.1); }
}
@keyframes starship-engine-light {
  0% { opacity:.2; } 20%,32% { opacity:.9; } 44%,61% { opacity:.4; } 71%,100% { opacity:1; }
}
@keyframes starship-beacon {
  0%,34%,41%,54%,61%,100% { opacity:.25; } 37%,57% { opacity:1; }
}
@keyframes starship-exposure {
  0%,100% { opacity:0; } 20%,72% { opacity:1; } 94% { opacity:0; }
}
@keyframes starship-portal {
  0%,60% { opacity:0; transform:translate(-50%,-50%) rotate(-16deg) scale(.05,.2); }
  72% { opacity:.7; transform:translate(-50%,-50%) rotate(-16deg) scale(.38,1); }
  81% { opacity:.8; transform:translate(-50%,-50%) rotate(-16deg) scale(.41,1.08); }
  93%,100% { opacity:0; transform:translate(-50%,-50%) rotate(-16deg) scale(.5,1.3); }
}
@keyframes starship-shock {
  0%,78% { opacity:0; transform:scale(.95); } 82% { opacity:.5; }
  99%,100% { opacity:0; transform:scale(1.8); }
}
@keyframes starship-particle {
  0%,9% { opacity:0; transform:translateX(12cqw) rotate(-8deg) scaleX(1); }
  27% { opacity:.4; transform:translateX(0) rotate(-8deg) scaleX(9); }
  43%,60% { opacity:.16; transform:translateX(-7cqw) rotate(-8deg) scaleX(1); }
  79% { opacity:.65; transform:translateX(-27cqw) rotate(-8deg) scaleX(55); }
  98%,100% { opacity:0; transform:translateX(-70cqw) rotate(-8deg) scaleX(90); }
}
@keyframes starship-warp {
  0%,79% { opacity:0; transform:rotate(-7deg) scaleX(.1); }
  83% { opacity:.72; transform:rotate(-7deg) scaleX(.85); }
  92%,100% { opacity:0; transform:rotate(-7deg) scaleX(1); }
}
@keyframes starship-caption {
  0%,32% { opacity:0; transform:translateY(12px); }
  43%,75% { opacity:1; transform:translateY(0); }
  93%,100% { opacity:0; transform:translateY(-5px); }
}

/* Static result also covers texture failure. No decorative motion survives. */
.is-reduced *,.is-reduced *::before,.is-reduced *::after,
.is-texture-failed *,.is-texture-failed *::before,.is-texture-failed *::after { animation:none!important; will-change:auto; }
.is-reduced .gift-starship-flight__craft { left:50%; top:38%; width:80cqw; max-width:430px; opacity:1; transform:translateX(-50%); }
.is-screen.is-reduced .gift-starship-flight__craft { top:31%; width:60cqw; max-width:1200px; }
.is-reduced .gift-starship-flight__bank { transform:none; }
.is-reduced .gift-starship-flight__caption,.is-texture-failed .gift-starship-flight__caption { opacity:1; transform:none; }
.is-reduced .gift-starship-flight__trail,.is-reduced .gift-starship-flight__wake,
.is-reduced .gift-starship-flight__engine,.is-reduced .gift-starship-flight__beacon,
.is-reduced .gift-starship-flight__reflection,.is-reduced .gift-starship-flight__portal,
.is-reduced .gift-starship-flight__shock,.is-reduced .gift-starship-flight__particles,
.is-reduced .gift-starship-flight__warp,.is-texture-failed .gift-starship-flight__portal,
.is-texture-failed .gift-starship-flight__shock,.is-texture-failed .gift-starship-flight__particles,
.is-texture-failed .gift-starship-flight__warp { display:none; }
.is-reduced .gift-starship-flight__exposure,.is-texture-failed .gift-starship-flight__exposure { opacity:.6; }


/* D-092: nocturne planes and restrained cold seams, no chrome sweep. */
.gift-starship-flight__reflection,.gift-starship-flight__beacon{display:none}
.gift-starship-flight__hull{filter:drop-shadow(0 8px 10px #0009)}
.gift-starship-flight__engine{left:16.8%;top:55.2%;width:5%;height:15%}
.gift-starship-flight__engine.is-near{left:20.6%;top:70.8%;width:5%;height:15%}
.gift-starship-flight__trail{right:83.2%;top:54%;height:2%;width:65%;filter:none;background:linear-gradient(90deg,transparent,#9bcada55 83%,#cfecf1bb)}
.gift-starship-flight__trail.is-near{right:79.4%;top:69.5%;height:2%;width:80%}
.gift-starship-flight__wake{opacity:.2}
.gift-starship-flight__portal i:nth-child(2){border-color:#adc6d64d}
.gift-starship-flight__caption p{font-weight:400;letter-spacing:.16em;font-size:25px}
.gift-starship-flight__caption em{color:#c4dce8;font-size:.8em}
.is-screen .gift-starship-flight__caption p{font-size:48px}
.is-phone .gift-starship-flight__craft{top:33%}
.is-phone .gift-starship-flight__caption{left:9%;top:53%;padding:10px 14px;background:#040c16b8;border-left:1px solid #a1c8d759;border-radius:2px}
.gift-starship-flight__caption .gift-starship-flight__rule{display:none}

</style>
