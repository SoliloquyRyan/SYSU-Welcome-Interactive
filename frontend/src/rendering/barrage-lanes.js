// A fixed pixel speed prevents a short message from catching a longer one.
// Full lanes drop visual work; the server's moderated history remains intact.
export function createBarrageLanes(count = 4) {
  const readyAt = Array(count).fill(0)
  return {
    reserve(width, viewportWidth, now) {
      const lane = readyAt.findIndex(time => time <= now)
      if (lane < 0) return null
      const speed = Math.max(80, viewportWidth * .12)
      readyAt[lane] = now + (width + 90) / speed * 1000
      return { lane, durationMs: (viewportWidth + width + 84) / speed * 1000 }
    },
    clear() { readyAt.fill(0) },
  }
}
