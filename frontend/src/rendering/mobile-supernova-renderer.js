const TAU = Math.PI * 2
const clamp = value => Math.max(0, Math.min(1, value))
const easeOut = value => 1 - (1 - clamp(value)) ** 3
const smooth = (start, end, value) => {
  const t = clamp((value - start) / (end - start))
  return t * t * (3 - 2 * t)
}

// Original, deterministic effect material; none of these grains represent people.
function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function glow(document, rgb, core = false) {
  const sprite = document.createElement('canvas')
  sprite.width = sprite.height = 128
  const ctx = sprite.getContext('2d')
  if (!ctx) { sprite.width = sprite.height = 1; throw new Error('Supernova material unavailable') }
  try {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, `rgba(${rgb},${core ? 1 : .8})`)
    gradient.addColorStop(core ? .08 : .13, `rgba(${rgb},${core ? .95 : .36})`)
    gradient.addColorStop(.35, `rgba(${rgb},.09)`)
    gradient.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)
  } catch (error) { sprite.width = sprite.height = 1; throw error }
  return sprite
}

function gasMaterial(document) {
  const sprite = document.createElement('canvas')
  sprite.width = sprite.height = 384
  const ctx = sprite.getContext('2d')
  if (!ctx) { sprite.width = sprite.height = 1; throw new Error('Supernova gas unavailable') }
  const random = randomSource(986103)
  let mist = null
  try {
    mist = glow(document, '104,154,202')
    ctx.globalCompositeOperation = 'screen'
    for (let i = 0; i < 540; i += 1) {
      const angle = random() * TAU
      const radius = 70 + Math.sin(angle * 3.2) * 18 + random() * 47
      const size = 12 + random() * 35
      ctx.globalAlpha = .1 + random() * .2
      ctx.drawImage(mist, 192 + Math.cos(angle) * radius - size / 2,
        192 + Math.sin(angle) * radius * .7 - size / 2, size, size)
    }
  } catch (error) {
    sprite.width = sprite.height = 1
    throw error
  } finally { if (mist) mist.width = mist.height = 1 }
  return sprite
}

export function createMobileSupernovaRenderer(canvas, { durationMs, onComplete }) {
  const ctx = canvas?.getContext('2d', { alpha: true })
  if (!ctx) return null
  const owner = canvas.ownerDocument
  const view = owner.defaultView
  const random = randomSource(971209)
  const textures = []
  let blue, warm, white, gas
  try {
    blue = glow(owner, '126,185,238'); textures.push(blue)
    warm = glow(owner, '255,232,195', true); textures.push(warm)
    white = glow(owner, '244,250,255', true); textures.push(white)
    gas = gasMaterial(owner); textures.push(gas)
  } catch {
    for (const sprite of textures) sprite.width = sprite.height = 1
    canvas.width = canvas.height = 1
    return null
  }
  const grains = Array.from({ length: 300 }, (_, index) => ({
    angle: random() * TAU, radius: .12 + random() ** .58 * 1.2,
    delay: random() * .12, bend: (random() - .5) * .45,
    alpha: .2 + random() * .7, size: .4 + random() * 1.1, hot: index % 13 === 0,
  }))
  const filaments = Array.from({ length: 42 }, (_, index) => ({
    angle: random() * TAU, radius: .54 + random() * .55,
    phase: random() * TAU, bend: (random() - .5) * .48,
    alpha: .055 + random() * .16, warm: index % 9 === 0,
  }))
  const startedAt = view.performance.now()
  let frame = null
  let observer = null
  let disposed = false
  let width = 1
  let height = 1
  let density = 1
  let phase = ''

  function resize() {
    if (disposed) return
    const rect = canvas.getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    // A short mobile shot has a fixed raster budget, even on very high-DPR phones.
    density = Math.min(view.devicePixelRatio || 1, 2, Math.sqrt(1_600_000 / (width * height)))
    canvas.width = Math.max(1, Math.round(width * density))
    canvas.height = Math.max(1, Math.round(height * density))
  }

  function bloom(sprite, x, y, size, alpha, stretch = 1) {
    if (alpha <= 0 || size <= 0) return
    ctx.globalAlpha = alpha
    ctx.drawImage(sprite, x - size / 2, y - size * stretch / 2, size, size * stretch)
  }

  function render(progress) {
    ctx.setTransform(density, 0, 0, density, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const nextPhase = progress < .24 ? 'accretion' : progress < .43 ? 'ignition' : 'afterglow'
    if (phase !== nextPhase) { phase = nextPhase; canvas.dataset.phase = phase }
    const size = Math.min(width, height) * .43
    const cx = width * .5
    const cy = height * .43
    const release = clamp((progress - .24) / .7)
    const expansion = easeOut(release)
    const tail = 1 - smooth(.58, 1, progress)
    const ignition = smooth(.225, .285, progress) * (1 - smooth(.29, .56, progress))
    const coalescence = 1 - smooth(.18, .27, progress)
    ctx.globalCompositeOperation = 'screen'

    // Hairline accretion curves contract before the single ignition peak.
    if (coalescence > 0) {
      const pull = 1 - smooth(0, .25, progress) * .92
      filaments.forEach((filament, index) => {
        if (index % 2) return
        const radius = size * (.45 + filament.radius * .42) * pull
        const angle = filament.angle + progress * 2.2
        ctx.beginPath()
        for (let step = 0; step < 13; step += 1) {
          const t = step / 12
          const r = radius * (1 - t * .7)
          const a = angle + t * 1.45
          const x = cx + Math.cos(a) * r
          const y = cy + Math.sin(a) * r * .62
          if (!step) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.lineWidth = .45
        ctx.strokeStyle = '#9cb8d3'
        ctx.globalAlpha = coalescence * filament.alpha
        ctx.stroke()
      })
      bloom(blue, cx, cy, size * (.85 - progress * 2), coalescence * .58, .8)
      bloom(white, cx, cy, 17 - smooth(0, .23, progress) * 11, coalescence * .85)
    }

    if (release > 0) {
      // Broken shells are textured volumes with open, irregular filaments.
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(-.38 + expansion * .12)
      bloom(gas, 0, 0, size * (1 + expansion * 3.3), smooth(.24, .4, progress) * tail * .9, .88)
      ctx.restore()
      filaments.forEach(filament => {
        const radius = size * expansion * filament.radius * 1.35
        const angle = filament.angle - .33
        ctx.beginPath()
        for (let step = 0; step < 12; step += 1) {
          const t = step / 11
          const r = radius * (.62 + t * .42)
          const a = angle + filament.bend * (1 - t) + Math.sin(t * 5 + filament.phase) * .04
          const x = cx + Math.cos(a) * r * 1.34
          const y = cy + Math.sin(a) * r * (.64 + Math.sin(angle * 3) * .08)
          if (!step) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.lineWidth = .35 + filament.alpha
        ctx.strokeStyle = filament.warm ? '#e8d4b5' : '#94badb'
        ctx.globalAlpha = filament.alpha * tail * smooth(.24, .33, progress)
        ctx.stroke()
      })
      grains.forEach(grain => {
        const travel = easeOut((release - grain.delay) / (1 - grain.delay))
        const radius = size * grain.radius * travel
        const angle = grain.angle + grain.bend * travel - .33
        const x = cx + Math.cos(angle) * radius * 1.55
        const y = cy + Math.sin(angle) * radius * .85
        const alpha = grain.alpha * tail * smooth(.24 + grain.delay * .3, .35 + grain.delay * .3, progress)
        ctx.globalAlpha = alpha * .65
        ctx.fillStyle = grain.hot ? '#f0dfc3' : '#a7c8e6'
        ctx.fillRect(x, y, grain.size, grain.size * .65)
        if (grain.hot) bloom(white, x, y, grain.size * 9, alpha * .28)
      })
      // Two unequal jet lobes merge into the ejecta, rather than five spokes.
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(-.39)
      const jet = smooth(.25, .33, progress) * (1 - smooth(.39, .79, progress))
      bloom(blue, size * expansion * .62, 0, size * (1.4 + expansion * 1.6), jet * .58, .085)
      bloom(blue, -size * expansion * .35, 0, size * (1 + expansion), jet * .38, .14)
      bloom(white, 0, 0, size * (1.3 + expansion), ignition * .62, .025)
      ctx.restore()
    }
    bloom(blue, cx, cy, size * (1.25 + expansion * .8), ignition * .58)
    bloom(warm, cx, cy, 8 + ignition * size * .5, ignition * .9)
    bloom(white, cx, cy, 5 + ignition * size * .15, ignition)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  function destroy() {
    if (disposed) return
    disposed = true
    if (frame !== null) view.cancelAnimationFrame(frame)
    observer?.disconnect()
    canvas.removeEventListener('contextlost', complete)
    canvas.width = canvas.height = 1
    for (const sprite of textures) sprite.width = sprite.height = 1
  }
  function complete() { if (disposed) return; destroy(); onComplete?.() }
  function tick(timestamp) {
    if (disposed) return
    const progress = clamp((timestamp - startedAt) / durationMs)
    if (owner.hidden || progress >= 1) { complete(); return }
    try { render(progress) } catch { complete(); return }
    frame = view.requestAnimationFrame(tick)
  }
  try {
    resize()
    observer = new view.ResizeObserver(resize)
    observer.observe(canvas)
    canvas.addEventListener('contextlost', complete)
    frame = view.requestAnimationFrame(tick)
  } catch { destroy(); return null }
  return { destroy }
}
