import { createShotRenderer, CUE_AT, END_AT, DURATION, TRANSITION_SECONDS } from './scene.js'

const $ = id => document.getElementById(id)
const canvas = $('galaxy'), frame = $('frame'), timeline = $('timeline'), play = $('play')
timeline.max = String(DURATION)
const motion = matchMedia('(prefers-reduced-motion: reduce)')
const params = new URLSearchParams(location.search)
if (params.has('cinema')) document.body.classList.add('cinema')
let seconds = motion.matches ? DURATION : 0, running = false, raf = 0, base = 0, drawCount = 0, disposed = false, lastPaint = 0, nextPaint = 0
let renderer, error = '', intervals = [], drawTimes = []
const title = document.querySelector('.film-title')
const setStatus = message => { $('status').textContent = message }
function fail(reason) {
  error = reason; stop(); seconds = DURATION
  setStatus('当前设备无法运行样片，已显示静态终态；可查看本地录制版本。')
  if (renderer) paint()
  else title.style.opacity = '0'
  play.disabled = true; $('replay').disabled = true; $('cue').disabled = true; timeline.disabled = true
}
const initialCount = [0, 40, 220, 300].includes(Number(params.get('count'))) && params.has('count') ? Number(params.get('count')) : 220
$('count').value = String(initialCount)
renderer = createShotRenderer(canvas, { count: initialCount, onFailure: fail })
function paint() {
  const start = performance.now()
  renderer.draw(seconds)
  drawCount++
  drawTimes.push(performance.now() - start)
  if (drawTimes.length > 1800) drawTimes.shift()
  title.style.opacity = String(Math.max(0, Math.min(1, 1 - (seconds - CUE_AT) / 1.2)))
  timeline.value = String(seconds)
  $('time').value = `${seconds.toFixed(2).padStart(5, '0')} / ${DURATION.toFixed(2)} s`
}
function resize() {
  const rect = frame.getBoundingClientRect()
  const ratio = Math.min(1, 1920 / Math.max(1, rect.width))
  canvas.width = Math.max(2, Math.round(rect.width * ratio))
  canvas.height = Math.max(2, Math.round(rect.height * ratio))
  paint()
}
function stop() { running = false; cancelAnimationFrame(raf); raf = 0; lastPaint = 0; nextPaint = 0; play.textContent = '播放样片' }
function tick(now) {
  if (!running || disposed) return
  seconds = Math.min(DURATION, (now - base) / 1000)
  const target = seconds < CUE_AT ? 1000 / 30 : 1000 / 60
  if (!nextPaint) nextPaint = now
  // Preserve the fractional frame deadline on high-refresh displays. Measuring
  // each interval from the last actual paint accumulates vsync rounding loss.
  if (now + 1.5 >= nextPaint || seconds >= DURATION) {
    if (lastPaint) { intervals.push({ at: seconds, ms: now - lastPaint }); if (intervals.length > 1800) intervals.shift() }
    lastPaint = now; paint()
    do nextPaint += target; while (nextPaint <= now)
  }
  if (seconds >= DURATION) { stop(); setStatus('镜头结束 · 银河层已完全透明，节目底图来自独立示意层。'); return }
  raf = requestAnimationFrame(tick)
}
function start(at = seconds) {
  if (motion.matches || error || disposed || document.hidden) return
  stop(); seconds = at >= DURATION ? 0 : at; base = performance.now() - seconds * 1000
  running = true; play.textContent = '暂停'; setStatus(`正在播放 · 前 ${CUE_AT} 秒观察星流，随后进入约 ${TRANSITION_SECONDS} 秒的连续转场。`)
  raf = requestAnimationFrame(tick)
}
function seek(at) { stop(); seconds = motion.matches || error || disposed ? DURATION : Math.max(0, Math.min(DURATION, Number(at))); paint() }
function reduced() {
  stop(); seconds = DURATION; paint()
  play.disabled = motion.matches || Boolean(error); $('replay').disabled = play.disabled; $('cue').disabled = play.disabled; timeline.disabled = play.disabled
  setStatus(motion.matches ? '系统已启用减少动态：直接显示静态终态，不播放镜头。' : '已停在静态终态；可主动重播。')
}
function hidden() {
  if (document.hidden) { stop(); seconds = DURATION; paint(); setStatus('页面曾进入后台，镜头已结束；可主动从头重播。') }
}
play.addEventListener('click', () => running ? (stop(), setStatus('已暂停 · 可拖动时间轴检查当前画面。')) : start())
$('replay').addEventListener('click', () => start(0))
$('cue').addEventListener('click', () => start(CUE_AT - 1))
timeline.addEventListener('input', () => seek(timeline.value))
$('count').addEventListener('change', () => { renderer.setCount(Number($('count').value)); paint() })
$('underlay').addEventListener('click', () => {
  const hidden = frame.classList.toggle('no-underlay')
  $('underlay').textContent = `节目底图：${hidden ? '关' : '开'}`; $('underlay').setAttribute('aria-pressed', String(!hidden))
})
$('fullscreen').addEventListener('click', async () => {
  try { await frame.requestFullscreen() } catch { setStatus('当前浏览器未提供全屏；可直接放大窗口观看。') }
})
motion.addEventListener('change', reduced)
document.addEventListener('visibilitychange', hidden)
const observer = new ResizeObserver(resize)
observer.observe(frame)
function destroy() {
  if (disposed) return
  disposed = true; stop(); seconds = DURATION; title.style.opacity = '0'
  observer.disconnect(); motion.removeEventListener('change', reduced)
  document.removeEventListener('visibilitychange', hidden); renderer.destroy()
}
addEventListener('pagehide', destroy, { once: true })
// Returning from the back-forward cache must not replay an interrupted shot.
addEventListener('pageshow', event => {
  if (!event.persisted) return
  setStatus('页面已恢复为静态终态；刷新页面后可主动重播。')
  title.style.opacity = '0'; play.disabled = true; $('replay').disabled = true; $('cue').disabled = true
  timeline.disabled = true
})
resize()
if (motion.matches) reduced()
else if (!error) setStatus('点击播放，完整观看 19 秒。也可以暂停、拖动时间轴，或关闭节目底图。')

// Preview-only diagnostics: no backend, participants, cookies, or business API.
window.galaxyShot = {
  seek, play: start, pause: stop, destroy,
  get state() { return { seconds, running, reduced: motion.matches, drawCount, error, disposed } },
  diagnostics: () => ({ ...renderer.diagnostics(seconds), intervals, drawTimes }),
  loseContext: () => renderer.loseContext(),
  get endpoint() { return END_AT },
}
