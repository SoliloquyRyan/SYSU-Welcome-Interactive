function hash(value) {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

function unit(seed, shift) {
  return ((seed >>> shift) & 0xffff) / 0xffff
}

export function starPlacement(star, width, height) {
  const seed = hash(star.formationSlot)
  const angle = unit(seed, 0) * Math.PI * 2
  const radial = Math.sqrt(unit(seed, 8))
  const ellipseX = width * (0.12 + radial * 0.36)
  const ellipseY = height * (0.10 + radial * 0.34)
  return {
    x: width / 2 + Math.cos(angle) * ellipseX,
    y: height / 2 + Math.sin(angle) * ellipseY,
    radius: 1.25 + unit(seed, 16) * 2.25,
    phase: unit(seed, 4) * Math.PI * 2,
  }
}

export function createGalaxyRenderer(canvas, options = {}) {
  const context = canvas.getContext('2d', { alpha: true })
  let stars = []
  let mode = 'ASSEMBLY'
  let reduced = Boolean(options.reduced)
  let running = false
  let frame = 0
  let lastPaint = 0
  let width = 1
  let height = 1
  let dpr = 1

  function resize() {
    const rect = canvas.getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    paint(performance.now())
  }

  function paint(timestamp) {
    context.clearRect(0, 0, width, height)
    const edgeOnly = mode === 'PROGRAM_SUPPORT'
    const cooperative = mode === 'COOPERATIVE_LIGHT'
    for (const star of stars.slice(0, 300)) {
      const point = starPlacement(star, width, height)
      if (edgeOnly && point.x > width * 0.19 && point.x < width * 0.81) continue
      const pulse = reduced ? 1 : 0.94 + Math.sin(timestamp / 2400 + point.phase) * 0.06
      const strength = (star.started ? 1 : 0.58) * (edgeOnly ? 0.18 : 1)
      const radius = point.radius * pulse * (cooperative && star.started ? 1.32 : 1)
      context.beginPath()
      context.fillStyle = star.displayColor
      context.globalAlpha = strength
      context.arc(point.x, point.y, radius, 0, Math.PI * 2)
      context.fill()
      if (cooperative && star.started) {
        context.beginPath()
        context.globalAlpha = 0.13
        context.arc(point.x, point.y, radius * 3.6, 0, Math.PI * 2)
        context.fill()
      }
    }
    context.globalAlpha = 1
  }

  function loop(timestamp) {
    if (!running) return
    if (timestamp - lastPaint >= 1000 / 30) {
      lastPaint = timestamp
      paint(timestamp)
    }
    frame = requestAnimationFrame(loop)
  }

  function updateLoop() {
    const shouldRun = !reduced && !document.hidden && mode !== 'PROGRAM_SUPPORT'
    if (shouldRun && !running) {
      running = true
      frame = requestAnimationFrame(loop)
    } else if (!shouldRun && running) {
      running = false
      cancelAnimationFrame(frame)
      paint(performance.now())
    } else if (!shouldRun) paint(performance.now())
  }

  function onVisibility() { updateLoop() }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  document.addEventListener('visibilitychange', onVisibility)
  resize()
  updateLoop()

  return {
    setStars(next) { stars = [...next].slice(0, 300); paint(performance.now()) },
    upsertStar(star) {
      const index = stars.findIndex((item) => item.publicStarId === star.publicStarId)
      if (index === -1) stars.push(star)
      else stars[index] = star
      stars = stars.slice(0, 300)
      paint(performance.now())
    },
    setMode(next) { mode = next ?? 'ASSEMBLY'; updateLoop() },
    setReduced(next) { reduced = Boolean(next); updateLoop() },
    destroy() {
      running = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
