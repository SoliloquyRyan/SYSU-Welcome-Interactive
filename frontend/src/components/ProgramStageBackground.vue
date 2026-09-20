<script setup>
import { computed } from 'vue'
import StageCollegeBrand from './StageCollegeBrand.vue'
import StarCityAtmosphere from './StarCityAtmosphere.vue'
import worthItObsUrl from '../assets/star-city/worth-it-obs.jpg'
import { STAR_CITY_THEMES, starCityStyle } from '../rendering/star-city-theme'
import { DEFAULT_PROGRAM_VISUAL, programVisualStyle } from '../rendering/program-visuals'
const props = defineProps({ compact: Boolean, mobileUnified: Boolean, reduced: Boolean, paused: Boolean, overlay: Boolean, audio: Boolean,
  stars: { type: Array, default: () => [] }, effects: { type: Array, default: () => [] }, ownStarId: String, visual: Object,
  theme: { type: String, default: 'program' }, variant: { type: String, default: 'theme' }, branded: { type: Boolean, default: true } })
defineEmits(['audio-status', 'sky-points'])
const themeStyle = computed(() => ({ ...starCityStyle(STAR_CITY_THEMES[props.theme] ?? STAR_CITY_THEMES.program), ...programVisualStyle(props.visual) }))
const assets = import.meta.glob('../assets/star-city/d105/*.webp', { eager: true, query: '?url', import: 'default' })
const effectiveVisual = computed(() => props.visual ?? DEFAULT_PROGRAM_VISUAL)
const customArtwork = computed(() => !props.mobileUnified && effectiveVisual.value.art === 'worth-it' ? worthItObsUrl : undefined)
const artwork = computed(() => {
  if (props.mobileUnified) return undefined
  if (customArtwork.value) return customArtwork.value
  const name = props.mobileUnified && props.compact
    ? 'night-flight'
    : (!effectiveVisual.value.art || effectiveVisual.value.art === 'theme' ? 'night-flight' : effectiveVisual.value.art)
  return assets['../assets/star-city/d105/' + name + (props.compact ? '-mobile.webp' : '-screen.webp')]
})
</script>
<template>
  <div class="program-stage-background" :class="{ 'is-compact': compact, 'is-mobile-unified': mobileUnified, 'is-static': reduced, 'is-paused': paused, 'is-overlay': overlay }"
    :style="themeStyle" aria-hidden="true" data-testid="program-stage-background" data-background-system="mist-star-city"
    :data-theme="theme" :data-program-art="effectiveVisual.art" :data-background-variant="variant" :data-motion="reduced ? 'static' : paused ? 'paused' : 'ambient'">
    <template v-if="!overlay">
      <Transition name="program-art"><div :key="artwork || variant" class="city-panorama" :class="{ 'has-artwork': artwork }" :style="artwork ? { backgroundImage: 'url(' + artwork + ')' } : undefined"></div></Transition>
      <div class="city-color-wash"></div><div class="city-mist"></div>
      <div v-if="artwork" class="city-rim-glow"></div>
      <svg v-else-if="!mobileUnified" class="city-contours" viewBox="0 0 1920 1080" :preserveAspectRatio="compact ? 'none' : 'xMidYMid slice'">
        <g class="city-silhouettes">
          <path d="M22 780V450h54V342h6v108h39v330 M1780 890V590h48V510h8v80h47v300 M145 490V285h7v205 M159 320h28m-21-12v25" />
          <path d="M0 630h76v25h89v90h58v184 M1920 400h-50v145h-48v260" />
        </g>
        <g class="city-neon">
          <path d="M143 177v360 M159 274v86 M1746 293v312 M1830 567v149 M0 914Q420 1040 742 1038 M1190 1039Q1600 1018 1920 894" />
          <path class="city-neon-pink" d="M276 540v105 M1850 239v95 M172 542v16m0 10v34 M1782 737h43v42 M-20 930Q195 1018 418 1037" />
          <path class="city-hanging-light" d="M55 0v180h80 M1810 0v161h88 M1830 0v112h44" />
        </g>
        <g v-if="variant === 'rhythm'" class="city-railway">
          <path d="M-80 790Q145 795 350 915T780 1065 M-80 821Q130 825 340 940T760 1090 M2000 753Q1740 780 1530 920T1110 1080 M2000 795Q1755 821 1554 950T1155 1100" />
          <path class="city-neon-pink" d="M60 822v204 M180 852v210 M1810 818v186 M1680 864v175" />
        </g>
        <g v-if="variant === 'instrumental'" class="city-arcade">
          <path d="M-80 1100V300Q40 130 172 300v800 M-65 1100V312Q43 158 157 312v788 M1740 1100V392q80-148 168 0v708 M1760 1100V400q61-105 126 0v700" />
          <path d="M24 1070V419q46-77 94 0v651 M1794 1100V512q38-72 82 0v588" />
        </g>
        <g v-if="variant === 'lyric'" class="city-bay">
          <path d="M300 953q650-35 1270 0 M366 968q555-29 1180 0 M530 1004q412-27 802-2 M698 1026h227m70 8h140" />
        </g>
      </svg>
      <div class="city-readability"></div>
    </template>
    <StarCityAtmosphere :stars="stars" :effects="effects" :own-star-id="ownStarId" :visual="effectiveVisual" :compact="compact" :reduced="reduced" :paused="paused" :overlay="overlay" :audio="audio" @sky-points="$emit('sky-points', $event)" @audio-status="$emit('audio-status', $event)" />
    <StageCollegeBrand v-if="branded && !compact && !overlay" />
  </div>
</template>
<style scoped>
.program-stage-background{--city-audio:0;position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#272438;isolation:isolate}
.city-panorama{position:absolute;inset:0;background:url('../assets/star-city/mist-city-d103.webp') center/cover no-repeat;opacity:.88}
.city-panorama.has-artwork{opacity:1}
.city-panorama.has-artwork~.city-color-wash{opacity:0}
.city-rim-glow{position:absolute;inset:0;background:radial-gradient(ellipse at 5% 70%,var(--program-accent),transparent 28%),radial-gradient(ellipse at 97% 64%,var(--program-secondary),transparent 26%);opacity:calc(.035 + var(--city-audio)*.13);mix-blend-mode:screen}
.program-art-enter-active,.program-art-leave-active{transition:opacity .5s ease}.program-art-enter-from,.program-art-leave-to{opacity:0}
.is-static .program-art-enter-active,.is-static .program-art-leave-active{transition:none}
.city-color-wash{position:absolute;inset:0;background:linear-gradient(125deg,color-mix(in srgb,var(--city-haze) 25%,transparent),transparent 62%),linear-gradient(0deg,#1d203736,transparent);mix-blend-mode:color}
.city-mist{position:absolute;inset:-3%;background:radial-gradient(ellipse at 18% 83%,#b8a3cc25,transparent 37%),radial-gradient(ellipse at 74% 61%,#bcd3e320,transparent 41%);opacity:calc(.55 + var(--city-audio)*.2);animation:city-mist-drift 32s ease-in-out infinite alternate}
.city-contours{position:absolute;inset:0;width:100%;height:100%;fill:none;stroke:var(--city-accent);stroke-width:1.1;opacity:calc(.22 + var(--city-audio)*.16)}
.city-contours-soft{stroke-width:12;opacity:.055}
.city-readability{position:absolute;inset:0;background:linear-gradient(180deg,#14132196 0%,#18182930 32%,transparent 58%,#1716217a 100%),linear-gradient(90deg,#18152659,transparent 48%)}
.city-panorama.has-artwork~.city-readability{background:linear-gradient(180deg,#24232f40,transparent 24%,transparent 50%,#21202b35),radial-gradient(ellipse at 50% 43%,#22212d30,transparent 57%)}
.is-compact .city-panorama{background-image:url('../assets/star-city/mist-city-mobile-d103.webp');opacity:.75}
.is-compact .city-panorama.has-artwork{opacity:.65}
.is-compact .city-readability{background:linear-gradient(180deg,#201c3275,transparent 32%,#17172566 65%,#171725b3)}
.is-compact .city-contours{opacity:.15}.is-compact .city-mist{animation-duration:42s;opacity:.4}
.is-overlay{background:transparent}.is-paused .city-mist{animation-play-state:paused}.is-static .city-mist{animation:none;transform:none}
.city-contours{opacity:1;stroke-linecap:round;stroke-linejoin:round}
.city-silhouettes{fill:#191d30;stroke:#485269;stroke-width:2;opacity:.55}
.city-panorama.has-artwork~.city-contours .city-silhouettes{opacity:.12}
.city-panorama.has-artwork~.city-contours{opacity:.45}
.city-neon{stroke:#8ac5e0;stroke-width:2;opacity:calc(.3 + var(--city-audio)*.16);animation:city-neon-breathe 14s ease-in-out infinite alternate}
.city-neon-pink{stroke:#d6a2cf}.city-hanging-light{stroke-width:1.3;opacity:.55}
.city-railway{stroke:#92c4dc;stroke-width:2;opacity:.35}.city-railway path:first-child{stroke-width:3}
.city-arcade{stroke:#a2c5d8;stroke-width:1.6;opacity:.36}.city-arcade path+path{opacity:.5}
.city-bay{stroke:#ddb8d4;stroke-width:1;opacity:.22}
[data-background-variant="lyric"] .city-color-wash{background:linear-gradient(0deg,#d293b431,transparent 49%),linear-gradient(130deg,#9a7fac18,transparent)}
[data-background-variant="rhythm"] .city-color-wash{background:linear-gradient(105deg,#4593a721,transparent 36%,transparent 64%,#9c69ab20)}
[data-background-variant="rhythm"] .city-neon{opacity:calc(.42 + var(--city-audio)*.18)}
[data-background-variant="instrumental"] .city-color-wash{background:linear-gradient(130deg,#739cc431,#93a3bf0d)}
.is-compact .city-contours{opacity:.65}.is-compact .city-neon{animation:none}
.is-mobile-unified{background:linear-gradient(180deg,#171525 0%,#24233b 48%,#101321 100%)}
.is-mobile-unified .city-panorama{background-image:url('../assets/star-city/phone-unified-d114.png');background-position:center;background-size:cover;opacity:.86}
.is-mobile-unified .city-panorama{filter:saturate(.85) contrast(.96);opacity:.86}
.is-mobile-unified .city-color-wash{opacity:.78;background:linear-gradient(165deg,rgba(117,103,151,.22),transparent 46%,rgba(58,95,125,.2)),linear-gradient(180deg,rgba(19,18,39,.42),rgba(14,16,29,.6))}
.is-mobile-unified .city-mist{opacity:.62;background:radial-gradient(ellipse at 16% 40%,rgba(222,156,203,.18),transparent 42%),radial-gradient(ellipse at 82% 60%,rgba(105,172,201,.16),transparent 44%)}
.is-mobile-unified .city-readability{background:linear-gradient(180deg,rgba(13,14,27,.42),transparent 36%,rgba(11,13,24,.78))}
.is-mobile-unified .city-rim-glow{opacity:.08}
.is-paused .city-neon{animation-play-state:paused}.is-static .city-neon{animation:none}
@keyframes city-neon-breathe{from{opacity:calc(.27 + var(--city-audio)*.16)}to{opacity:calc(.43 + var(--city-audio)*.16)}}
@keyframes city-mist-drift{from{transform:translate3d(-.6%,.4%,0)}to{transform:translate3d(.6%,-.4%,0)}}
</style>
