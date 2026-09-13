import { createApp, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue/dist/vue.esm-bundler.js'
import ArrivalCount from '../../src/components/ArrivalCount.vue'
import GiftStarshipFlight from '../../src/components/GiftStarshipFlight.vue'
import { CINEMA_TIMING } from '../../src/rendering/cinema-timing.js'
import PersonalJourneyStage from '../../src/pages/student/PersonalJourneyStage.vue'
import MobileBarrage from '../../src/pages/student/MobileBarrage.vue'
import { createCinematicGalaxyScene, TRANSITION_SECONDS } from '../../src/pages/screen/cinematic-galaxy-scene.js'
import { starTemperatureColor } from '../../src/services/star-temperature.js'
import '../../src/styles/tokens.css'
import '../../src/styles/mobile-font.css'
import './preview.css'

const params = new URLSearchParams(location.search)
createApp({
  components: { ArrivalCount, GiftStarshipFlight, PersonalJourneyStage, MobileBarrage },
  setup() {
    const phone = ref(params.get('surface') === 'phone'), canvas = ref(null), flight = ref(0), flightVisible = ref(false), phase = ref('orbit')
    const staticMode = ref(matchMedia('(prefers-reduced-motion: reduce)').matches), flightProgress = ref(54)
    const motion = ref(!staticMode.value), cue = ref(false), time = ref(0), error = ref(''), count = ref(220), layer = ref('full')
    const items = ref([{ barrageId: 'preview-a', publicStarId: 'L-0001', text: '今夜，一起成为星海。' }, { barrageId: 'preview-b', publicStarId: 'Z-0018', text: '这个舞台，属于闪耀的你们。' }])
    const ownStar = { id: 'L-0001', label: 'L-0001', color: '#ffdfa9' }
    let scene, raf, last = 0, epoch = 0, resizeObserver, flightTimer, drawnKey = '', sampleEnd = null
    const drawTimes = [], frameTimes = []
    const stars = () => Array.from({ length: count.value }, (_, i) => ({ publicStarId: `X-${String(i).padStart(4, '0')}`, formationSlot: `film-${i}`, displayColor: starTemperatureColor([2400,12000,5000,9000,3600,6500][i % 6]) }))
    function draw(now) {
      if (motion.value && last && !document.hidden) time.value += Math.min((now - last) / 1000, .25)
      if (sampleEnd !== null && time.value >= sampleEnd) { time.value=sampleEnd;motion.value=false;sampleEnd=null }
      if (last) { frameTimes.push(now-last); if(frameTimes.length>600) frameTimes.shift() }
      last = now
      const key = [time.value,cue.value,epoch,count.value,layer.value,canvas.value?.width,canvas.value?.height].join(':')
      if (scene && !document.hidden && key !== drawnKey) { const start = performance.now(); scene.draw(time.value, { live: true, layer: layer.value, programBackdrop: true, progress: cue.value ? Math.min(1, (time.value - epoch) / TRANSITION_SECONDS) : 0 }); drawTimes.push(performance.now()-start); if(drawTimes.length>600)drawTimes.shift(); drawnKey=key }
      raf = requestAnimationFrame(draw)
    }
    async function init() {
      scene?.destroy(); scene = null; drawnKey=''; resizeObserver?.disconnect()
      await nextTick()
      if (!canvas.value) return
      scene = createCinematicGalaxyScene(canvas.value, { stars: stars(), onFailure: value => { error.value = value } })
      resizeObserver = new ResizeObserver(() => { const r = canvas.value.getBoundingClientRect(); canvas.value.width = Math.round(r.width); canvas.value.height = Math.round(r.height) })
      resizeObserver.observe(canvas.value)
    }
    function starship() { flightVisible.value = true; clearTimeout(flightTimer); flightTimer = setTimeout(() => { flightVisible.value = false }, (phone.value ? CINEMA_TIMING.starshipPhoneMs : CINEMA_TIMING.starshipScreenMs) + 200); flight.value++ }
    async function inspectFlight() {
      clearTimeout(flightTimer); flightVisible.value = true; await nextTick()
      const elapsed = Number(flightProgress.value) / 100 * (phone.value ? CINEMA_TIMING.starshipPhoneMs : CINEMA_TIMING.starshipScreenMs)
      document.querySelector('.gift-starship-flight')?.getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime = elapsed })
    }
    function transition() { epoch = time.value; cue.value = true }
    function sample() { cue.value=false;time.value=0;motion.value=true;staticMode.value=false;sampleEnd=30 }
    function reset() { cue.value = false; time.value = 0; phase.value = 'orbit'; flight.value = 0; flightVisible.value = false; clearTimeout(flightTimer) }
    onMounted(() => {
      init(); raf = requestAnimationFrame(draw)
      if (params.get('shot') === 'starship') inspectFlight()
      // Isolated visual review only; this entry is not part of the production app.
      window.cinemaReview = {
        keyframe(seconds = 0) { motion.value = false; cue.value = false; time.value = seconds },
        seek(progress) { motion.value = false; cue.value = true; epoch = time.value - progress * TRANSITION_SECONDS },
        metrics() { return { drawTimes: [...drawTimes], frameTimes: [...frameTimes], devicePixelRatio, scene: scene?.diagnostics(time.value) } },
      }
    })
    watch(phone, init)
    watch(staticMode, value => { if(value) motion.value=false })
    watch(count, () => scene?.setStars(stars()))
    onBeforeUnmount(() => { scene?.destroy(); resizeObserver?.disconnect(); cancelAnimationFrame(raf); clearTimeout(flightTimer) })
    return { phone, canvas, flight, flightVisible, flightProgress, phase, motion, staticMode, layer, cue, time, error, count, items, ownStar, starship, inspectFlight, transition, reset, sample }
  },
  template: `<div class="review" :class="{ 'is-phone':phone }">
    <div class="controls"><span>星舰材质与飞行 / D-090</span><button @click="phone=!phone">{{ phone ? '查看公屏' : '查看手机' }}</button><button @click="sample">30 秒流动样片</button><button @click="starship">播放星舰</button><button @click="inspectFlight">定格材质</button><label class="flight-scrubber">镜头 <input aria-label="星舰镜头进度" type="range" min="0" max="100" v-model="flightProgress" @input="inspectFlight"></label><button v-if="!phone" @click="transition">12 秒开场交接</button><button @click="motion=!motion; if(motion) staticMode=false">{{ motion ? '暂停银河' : '继续银河' }}</button><button v-if="!phone" @click="reset">重置镜头</button><label v-if="!phone">图层 <select v-model="layer"><option value="full">完整画面</option><option value="nebula">背景与星云</option><option value="sky">背景</option></select></label><label><input type="checkbox" v-model="staticMode">静态回退</label><label v-if="!phone">星数 <select v-model="count"><option :value="0">0</option><option :value="40">40</option><option :value="220">220</option><option :value="300">300</option></select></label><output>{{time.toFixed(1)}} s</output></div>
    <main class="frame"><template v-if="phone"><PersonalJourneyStage :phase="phase" :reduced="staticMode" :paused="!motion" :own-star="ownStar" /><div class="phone-copy"><small>正在演出</small><h1>星海序章</h1><p>表演者 · 迎新艺术团</p></div><div class="phone-chat"><MobileBarrage :items="items"/><div class="input">把此刻的欢呼，送给舞台… <button>发送</button></div><nav>星程<span>节目单</span><span>档案</span></nav></div></template>
    <template v-else><div class="program-reveal">星河序章<small>今夜的故事，正式开始</small></div><canvas ref="canvas"></canvas><ArrivalCount v-if="!cue" :count="count" :reduced="!motion"/><div v-if="!cue && !flightVisible" class="screen-copy"><small>中山大学 · 智能工程学院</small><h1>星海集结</h1><p>每一颗抵达的星，正在汇入同一片星河</p></div></template>
    <GiftStarshipFlight v-if="flightVisible" :key="flight" :surface="phone?'phone':'screen'" :reduced="staticMode" :quantity="2"/><p v-if="error" class="error">{{error}}</p></main>
    <footer>使用正式银河与星舰组件 · 合成视觉样例 · 业务与现场状态不受影响</footer></div>`
}).mount('#app')
