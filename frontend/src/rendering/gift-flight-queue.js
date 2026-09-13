// Presentation-only queue: gift accounting remains immediate and server-owned.
export function createGiftFlightQueue({ duration, gap, onChange }) {
  const pending = []
  let timer = null
  let busy = false
  function next() {
    const flight = pending.shift()
    if (!flight) { busy = false; timer = null; return }
    busy = true
    onChange(flight)
    timer = setTimeout(() => {
      onChange(null)
      timer = setTimeout(next, gap)
    }, duration())
  }
  return {
    enqueue(flight) { pending.push(flight); if (!busy) next() },
    clear() { clearTimeout(timer); timer = null; pending.length = 0; busy = false; onChange(null) },
  }
}
