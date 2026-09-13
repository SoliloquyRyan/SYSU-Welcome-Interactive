export const RAFFLE_ROLL_MS = 1800
export const RAFFLE_HOLD_MS = 1400

// This queue owns presentation only. Winners and their newest-first order
// always come from the server; an animation never issues a draw command.
export function createRaffleReveal({ onChange }) {
  let winners = []
  let revealed = new Set()
  let queue = []
  let active = null
  let timer = null
  let phase = 'waiting'
  let code = '星海正在等待'
  let animateReveal = false

  function publish() {
    onChange({
      phase, code, animateReveal,
      winner: phase === 'revealed' ? active ?? winners[0] ?? null : null,
      history: winners.filter((item) => revealed.has(item.raffleDrawId)),
    })
  }

  function cancel() {
    clearTimeout(timer)
    timer = null
    active = null
    queue = []
  }

  function rollingCode() {
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26))
    const candidate = `${letter}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
    return winners.some((item) => item.publicStarId === candidate) ? '······' : candidate
  }

  function playNext() {
    timer = null
    active = queue.shift() ?? null
    if (!active) return
    phase = 'rolling'
    animateReveal = false
    code = rollingCode()
    publish()
    const startedAt = performance.now()
    function tick() {
      if (performance.now() - startedAt < RAFFLE_ROLL_MS) {
        code = rollingCode()
        publish()
        timer = setTimeout(tick, 70)
        return
      }
      phase = 'revealed'
      animateReveal = true
      code = active.publicStarId
      revealed.add(active.raffleDrawId)
      publish()
      timer = setTimeout(playNext, RAFFLE_HOLD_MS)
    }
    timer = setTimeout(tick, 70)
  }

  return {
    sync(next, { animate = false } = {}) {
      const nextIds = new Set(next.map((item) => item.raffleDrawId))
      const reset = winners.some((item) => !nextIds.has(item.raffleDrawId))
      winners = [...next]
      if (!animate || reset) {
        cancel()
        revealed = nextIds
        phase = winners.length ? 'revealed' : 'waiting'
        animateReveal = false
        code = winners[0]?.publicStarId ?? '星海正在等待'
        publish()
        return
      }
      const known = new Set([
        ...revealed, ...queue.map((item) => item.raffleDrawId), active?.raffleDrawId,
      ])
      queue.push(...winners.filter((item) => !known.has(item.raffleDrawId)).reverse())
      // Keep the current reveal and its readable hold even if a newer HTTP
      // snapshot contains several subsequent draws or repeats the same result.
      if (!active && queue.length) playNext()
      else publish()
    },
    destroy: cancel,
  }
}
