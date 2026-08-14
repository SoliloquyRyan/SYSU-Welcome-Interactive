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

export function boundedMobileStars(nextStars, onCapacityViolation) {
  const values = [...(nextStars ?? [])]
  if (values.length > 300) onCapacityViolation?.(values.length)
  return values.slice(0, 300)
}

export function mobileStarPlacement(star, width, height, timestamp = 0, reduced = false) {
  const seed = hash(star.formationSlot)
  const baseAngle = unit(seed, 0) * Math.PI * 2
  const radial = Math.sqrt(unit(seed, 8))
  const orbit = reduced ? 0 : timestamp / (92_000 + unit(seed, 12) * 38_000)
  const angle = baseAngle + orbit
  const planeX = Math.cos(angle) * width * (0.1 + radial * 0.4)
  const planeY = Math.sin(angle) * height * (0.045 + radial * 0.2)
  const tilt = -0.18
  const x = width / 2 + planeX * Math.cos(tilt) - planeY * Math.sin(tilt)
  const y = height * 0.43 + planeX * Math.sin(tilt) + planeY * Math.cos(tilt)
  return {
    x: Math.max(8, Math.min(width - 8, x)),
    y: Math.max(8, Math.min(height - 8, y)),
    radius: 0.8 + unit(seed, 16) * 1.45,
    phase: unit(seed, 4) * Math.PI * 2,
  }
}

export function mobileAmbientPlacement(index, width, height, timestamp = 0, reduced = false) {
  const seed = hash(`ambient:${index}`)
  const band = index % 4
  const radial = [0.19, 0.29, 0.39, 0.49][band] + (unit(seed, 8) - 0.5) * 0.055
  const orbit = reduced ? 0 : timestamp / (72_000 + band * 19_000 + unit(seed, 12) * 17_000)
  const angle = unit(seed, 0) * Math.PI * 2 + orbit
  const planeX = Math.cos(angle) * width * radial
  const planeY = Math.sin(angle) * height * radial * 0.39
  const tilt = -0.18
  return {
    x: width / 2 + planeX * Math.cos(tilt) - planeY * Math.sin(tilt),
    y: height * 0.43 + planeX * Math.sin(tilt) + planeY * Math.cos(tilt),
    radius: 0.32 + unit(seed, 16) * 0.62,
    alpha: 0.08 + unit(seed, 4) * 0.18,
    warm: unit(seed, 20) > 0.9,
  }
}

export function createMobileGalaxyRenderer(canvas, options = {}) {
  const context = canvas.getContext('2d', { alpha: true })
  let stars = []
  let ownStarId = null
  let scene = null
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
    let ownPosition = null
    const completed = scene === 'COMPLETED'
    const cooperative = scene === 'COOPERATIVE_LIGHT'
    const core = context.createRadialGradient(
      width / 2, height * 0.43, 0,
      width / 2, height * 0.43, width * 0.34,
    )
    core.addColorStop(0, 'rgba(76, 125, 232, 0.095)')
    core.addColorStop(0.42, 'rgba(44, 91, 188, 0.035)')
    core.addColorStop(1, 'rgba(20, 48, 122, 0)')
    context.fillStyle = core
    context.fillRect(0, 0, width, height)

    for (let index = 0; index < 112; index += 1) {
      const point = mobileAmbientPlacement(index, width, height, timestamp, reduced)
      context.beginPath()
      context.fillStyle = point.warm ? '#ffe5b3' : '#b9dcff'
      context.globalAlpha = point.alpha
      context.arc(point.x, point.y, point.radius, 0, Math.PI * 2)
      context.fill()
    }

    for (const star of stars.slice(0, 300)) {
      const point = mobileStarPlacement(star, width, height, timestamp, reduced)
      const own = star.publicStarId === ownStarId
      const pulse = reduced ? 1 : 0.96 + Math.sin(timestamp / 2600 + point.phase) * 0.04
      const radius = point.radius * pulse * (own ? 1.28 : cooperative && star.started ? 1.2 : 1)
      const strength = own ? 1 : star.started ? 0.9 : 0.5
      context.beginPath()
      context.fillStyle = star.displayColor
      context.globalAlpha = completed ? Math.min(1, strength + 0.08) : strength
      context.arc(point.x, point.y, radius, 0, Math.PI * 2)
      context.fill()
      if (own || (cooperative && star.started)) {
        context.beginPath()
        context.globalAlpha = own ? 0.12 : 0.07
        context.arc(point.x, point.y, radius * (own ? 3.8 : 3.4), 0, Math.PI * 2)
        context.fill()
      }
      if (own) ownPosition = { x: point.x, y: point.y, color: star.displayColor }
    }
    context.globalAlpha = 1
    options.onOwnPosition?.(ownPosition)
  }

  function loop(timestamp) {
    if (!running) return
    if (timestamp - lastPaint >= 1000 / 24) {
      lastPaint = timestamp
      paint(timestamp)
    }
    frame = requestAnimationFrame(loop)
  }

  function updateLoop() {
    const shouldRun = !reduced && !document.hidden && stars.length > 0
    if (shouldRun && !running) {
      running = true
      frame = requestAnimationFrame(loop)
    } else if (!shouldRun && running) {
      running = false
      cancelAnimationFrame(frame)
      paint(performance.now())
    } else if (!shouldRun) {
      paint(performance.now())
    }
  }

  const observer = new ResizeObserver(resize)
  const onVisibility = () => updateLoop()
  observer.observe(canvas)
  document.addEventListener('visibilitychange', onVisibility)
  resize()
  updateLoop()

  return {
    setSnapshot(next) {
      stars = boundedMobileStars(next?.publicStars, options.onCapacityViolation)
      ownStarId = next?.participant?.ownPublicStarId ?? null
      scene = next?.runtime?.status === 'COMPLETED'
        ? 'COMPLETED'
        : next?.runtime?.currentScene ?? null
      updateLoop()
    },
    upsertStar(star) {
      const index = stars.findIndex(({ publicStarId }) => publicStarId === star.publicStarId)
      if (index === -1 && stars.length >= 300) {
        options.onCapacityViolation?.(stars.length + 1)
      } else if (index === -1) stars.push(star)
      else stars[index] = star
      paint(performance.now())
    },
    setReduced(next) { reduced = Boolean(next); updateLoop() },
    destroy() {
      running = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
