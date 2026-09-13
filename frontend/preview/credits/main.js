import { createApp, ref, watch, onMounted, onBeforeUnmount } from 'vue/dist/vue.esm-bundler.js'
import ClosingCredits from '../../src/pages/screen/ClosingCredits.vue'
import { createCinematicGalaxyScene } from '../../src/pages/screen/cinematic-galaxy-scene.js'
import { eventProgramPreset } from '../../src/pages/admin/program-catalog.js'
import { starTemperatureColor } from '../../src/services/star-temperature.js'
import '../../src/styles/tokens.css'
import '../../src/styles/mobile-font.css'
import './preview.css'

createApp({
  components: { ClosingCredits },
  setup() {
    const canvas = ref(null), reduced = ref(false), paused = ref(false), replay = ref(0), play = ref(false)
    const programs = eventProgramPreset().items
    let scene, observer, raf, last = 0, seconds = 12
    function frame(now) {
      if (last && !document.hidden) seconds += Math.min(.1, (now - last) / 1000)
      last = now
      scene?.draw(seconds, { live: true, progress: 0 })
      if (!reduced.value && !paused.value && !document.hidden) raf = requestAnimationFrame(frame)
    }
    function sync() { cancelAnimationFrame(raf); last = 0; scene?.draw(seconds, { live: true, progress: 0 }); if (!reduced.value && !paused.value && !document.hidden) raf = requestAnimationFrame(frame) }
    function restart() { reduced.value = false; paused.value = false; play.value = true; replay.value++ }
    onMounted(() => {
      scene = createCinematicGalaxyScene(canvas.value, { stars: Array.from({ length: 80 }, (_, i) => ({ publicStarId: `preview-${i}`, formationSlot: `film-${i}`, displayColor: starTemperatureColor([2400, 12000, 5000, 9000, 3600, 6500][i % 6]) })) })
      observer = new ResizeObserver(() => { const box = canvas.value.getBoundingClientRect(); canvas.value.width = Math.round(box.width); canvas.value.height = Math.round(box.height); sync() })
      observer.observe(canvas.value)
      document.addEventListener('visibilitychange', sync)
      sync()
    })
    watch([reduced, paused], sync)
    onBeforeUnmount(() => { cancelAnimationFrame(raf); observer?.disconnect(); scene?.destroy(); document.removeEventListener('visibilitychange', sync) })
    return { canvas, reduced, paused, replay, play, programs, restart }
  },
  template: `<div class="review-controls"><span>D-088 · 片尾审片 / 合成统计</span><button @click="restart">播放完整片尾</button><button @click="paused=!paused">{{paused ? '继续' : '暂停'}}</button><label><input type="checkbox" v-model="reduced">静态模式</label><span>正式节目资料 · 无现场读写</span></div><main class="review-stage"><canvas ref="canvas"></canvas><ClosingCredits :key="replay" :programs="programs" :aggregate="{admittedCount:80,totalStarlight:1260,cooperativeLightCount:64}" :reduced="reduced" :paused="paused" :play="play" /></main>`,
}).mount('#app')
