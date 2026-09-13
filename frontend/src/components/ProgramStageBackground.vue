<script setup>
import { useId } from 'vue'
import StageCollegeBrand from './StageCollegeBrand.vue'

defineProps({ compact: Boolean, reduced: Boolean, paused: Boolean, branded: { type: Boolean, default: true } })
const id = useId()
const stars = [
  [7, 37, .6], [15, 68, .4], [23, 16, .4], [31, 89, .5], [69, 12, .45],
  [79, 74, .5], [87, 31, .55], [94, 57, .5], [92, 85, .7], [4, 83, .4],
]
</script>

<template>
  <div class="program-stage-background" :class="{ 'is-compact': compact, 'is-static': reduced, 'is-paused': paused }"
    aria-hidden="true" data-testid="program-stage-background" data-background-system="silver-blue-stage"
    :data-motion="reduced ? 'static' : paused ? 'paused' : 'ambient'">
    <div class="stage-light-field"></div>
    <div class="stage-upper-light"></div>
    <svg class="stage-contours" :viewBox="compact ? '0 0 600 1000' : '0 0 1920 1080'" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient :id="`${id}-ribbon`" x1="0" y1="1" x2=".9" y2="0">
          <stop stop-color="#a8c4db" stop-opacity="0"/>
          <stop offset=".22" stop-color="#58748e" stop-opacity=".08"/>
          <stop offset=".59" stop-color="#779fbf" stop-opacity=".22"/>
          <stop offset=".8" stop-color="#b8d8ec" stop-opacity=".43"/>
          <stop offset="1" stop-color="#9ebfda" stop-opacity=".02"/>
        </linearGradient>
        <linearGradient :id="`${id}-edge`" x1="0" y1="1" x2="1" y2="0">
          <stop stop-color="#9bb6ce" stop-opacity="0"/>
          <stop offset=".29" stop-color="#769bb8" stop-opacity=".16"/>
          <stop offset=".63" stop-color="#d5eafa" stop-opacity=".65"/>
          <stop offset=".81" stop-color="#bddcef" stop-opacity=".25"/>
          <stop offset="1" stop-color="#6e99ba" stop-opacity="0"/>
        </linearGradient>
        <linearGradient :id="`${id}-fold`" x1="0" y1="0" x2=".2" y2="1">
          <stop stop-color="#c5e0f4" stop-opacity=".23"/>
          <stop offset=".12" stop-color="#6f95b6" stop-opacity=".1"/>
          <stop offset=".46" stop-color="#446483" stop-opacity=".035"/>
          <stop offset="1" stop-color="#03101c" stop-opacity="0"/>
        </linearGradient>
        <linearGradient :id="`${id}-halo`" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#42647f" stop-opacity="0"/>
          <stop offset=".28" stop-color="#8cadc7" stop-opacity=".08"/>
          <stop offset=".54" stop-color="#b9dcef" stop-opacity=".29"/>
          <stop offset=".82" stop-color="#638baa" stop-opacity=".06"/>
          <stop offset="1" stop-color="#638baa" stop-opacity="0"/>
        </linearGradient>
        <radialGradient :id="`${id}-floor`">
          <stop stop-color="#b0d3ef" stop-opacity=".12"/>
          <stop offset=".38" stop-color="#7ca7cb" stop-opacity=".05"/>
          <stop offset="1" stop-color="#385875" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <g v-if="compact">
        <path class="stage-ribbon-soft" d="M 273 -159 C 838 -127 868 437 285 946 C 804 674 1013 48 486 -184 Z" :fill="`url(#${id}-halo)`" />
        <path d="M -205 1083 C 111 811 403 1057 763 556 L 861 684 C 455 1145 153 908 -205 1163 Z" :fill="`url(#${id}-ribbon)`" />
        <path d="M -205 1083 C 111 811 403 1057 763 556" :stroke="`url(#${id}-edge)`" stroke-width="1.2" fill="none" />
        <path d="M -144 1110 C 152 893 415 1063 766 659 L 810 784 C 457 1137 135 972 -144 1190 Z" :fill="`url(#${id}-fold)`" />
        <path d="M -144 1110 C 152 893 415 1063 766 659" :stroke="`url(#${id}-edge)`" stroke-width=".7" opacity=".55" fill="none" />
        <path d="M 350 -104 C 754 107 705 453 485 680" :stroke="`url(#${id}-edge)`" stroke-width=".8" opacity=".45" fill="none" />
      </g>
      <g v-else>
        <!-- Broad translucent curves carry the volume; their edges only define folds. -->
        <g class="stage-ribbon-soft">
          <path d="M 923 -334 C 1823 -306 2213 365 1570 934 C 2304 578 2140 -145 1198 -375 Z" :fill="`url(#${id}-halo)`" />
          <path d="M 1378 -224 C 2056 33 2149 447 1745 912 C 2236 545 2284 35 1613 -225 Z" :fill="`url(#${id}-halo)`" opacity=".6" />
        </g>
        <path d="M 1036 -249 C 1843 -146 2208 383 1696 929" :stroke="`url(#${id}-edge)`" stroke-width="1.25" fill="none" opacity=".55" />
        <path d="M 1069 -258 C 1878 -155 2243 374 1731 920" :stroke="`url(#${id}-edge)`" stroke-width=".65" fill="none" opacity=".22" />
        <ellipse cx="964" cy="1060" rx="1050" ry="190" :fill="`url(#${id}-floor)`" />
        <path d="M -305 1170 C 406 705 1116 1240 2140 427 L 2250 657 C 1200 1304 442 897 -305 1280 Z" :fill="`url(#${id}-ribbon)`" />
        <path d="M -305 1170 C 406 705 1116 1240 2140 427" :stroke="`url(#${id}-edge)`" stroke-width="1.45" fill="none" />
        <path d="M -223 1180 C 428 820 1170 1240 2107 596 L 2233 785 C 1229 1291 521 955 -223 1280 Z" :fill="`url(#${id}-fold)`" />
        <path d="M -223 1180 C 428 820 1170 1240 2107 596" :stroke="`url(#${id}-edge)`" stroke-width=".9" fill="none" opacity=".74" />
        <path d="M -178 1227 C 525 900 1216 1276 2185 740 L 2240 1004 C 1265 1317 521 1034 -178 1320 Z" :fill="`url(#${id}-ribbon)`" opacity=".6" />
        <path d="M -178 1227 C 525 900 1216 1276 2185 740" :stroke="`url(#${id}-edge)`" stroke-width=".65" fill="none" opacity=".45" />
        <path d="M 145 1136 Q 960 829 1775 1136" :stroke="`url(#${id}-edge)`" stroke-width=".65" fill="none" opacity=".28" />
      </g>
    </svg>
    <div class="stage-edge-glow"></div>
    <i v-for="(star, index) in stars" :key="index" class="stage-pinpoint" :style="{ left: `${star[0]}%`, top: `${star[1]}%`, opacity: star[2] * .28 }"></i>
    <div class="stage-vignette"></div>
    <StageCollegeBrand v-if="branded && !compact" />
  </div>
</template>

<style scoped>
.program-stage-background{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#03060c;isolation:isolate}
.stage-light-field{position:absolute;inset:-8%;background:radial-gradient(ellipse 44% 62% at 106% 41%,#38618445,transparent 78%),radial-gradient(ellipse 60% 20% at 38% 112%,#365b7838,transparent 80%),linear-gradient(122deg,#080e17,#03060b 51%,#09121e);animation:stage-atmosphere 28s ease-in-out infinite alternate}
.stage-upper-light{position:absolute;inset:0;background:conic-gradient(from 161deg at 79% -17%,transparent 0deg,#9bc7e40a 8deg,#c6e6fc12 10deg,#7ca2c408 14deg,transparent 22deg),conic-gradient(from 134deg at 101% 0%,transparent 0deg,#a9d5f10c 14deg,transparent 33deg);mask-image:linear-gradient(180deg,#000,transparent 92%);opacity:.72}
.stage-contours{position:absolute;inset:0;width:100%;height:100%;opacity:.96}
.stage-ribbon-soft{opacity:.87}
.stage-edge-glow{position:absolute;inset:-2%;background:radial-gradient(ellipse 17% 26% at 101% 49%,#a1c9e822,transparent 75%),radial-gradient(ellipse 43% 4% at 72% 96%,#a5ccea1a,transparent 79%),radial-gradient(ellipse 25% 3% at 31% 97%,#aecfed0c,transparent 78%);animation:stage-edge-drift 34s ease-in-out infinite alternate}
.stage-pinpoint{position:absolute;width:2px;height:2px;background:#cfdfef;border-radius:50%;box-shadow:0 0 5px #9ac4e933}
.stage-vignette{position:absolute;inset:0;background:radial-gradient(ellipse 47% 42% at 45% 40%,#01030940,transparent 86%),linear-gradient(90deg,#01030a24,transparent 19%,transparent 88%,#01030a0a),linear-gradient(180deg,#01030a10,transparent 24%,transparent 82%,#01030a22)}
.is-compact .stage-light-field{background:radial-gradient(ellipse at 114% 44%,#47769829,transparent 49%),radial-gradient(ellipse at -15% 106%,#345d7d29,transparent 39%),linear-gradient(145deg,#080e18,#03060c 60%,#09131f)}
.is-compact .stage-contours{opacity:.58}.is-compact .stage-upper-light{opacity:.32}.is-compact .stage-edge-glow{opacity:.42}.is-compact .stage-pinpoint{width:1px;height:1px}
.is-paused .stage-light-field,.is-paused .stage-edge-glow{animation-play-state:paused}
.is-static .stage-light-field,.is-static .stage-edge-glow{animation:none;transform:none}
@keyframes stage-atmosphere{from{opacity:.8;transform:translate3d(-.35%,.2%,0)}to{opacity:1;transform:translate3d(.35%,-.2%,0)}}
@keyframes stage-edge-drift{from{opacity:.63;transform:translate3d(-.7%,.4%,0)}to{opacity:1;transform:translate3d(.7%,-.4%,0)}}
@media(prefers-reduced-motion:reduce){.stage-light-field,.stage-edge-glow{animation:none;transform:none}}
</style>
