export function createRefreshCoalescer(refresh, options = {}) {
  if (typeof refresh !== 'function') {
    throw new TypeError('refresh must be a function')
  }

  const delayMs = Math.max(0, Number(options.delayMs ?? 50))
  const setTimer = options.setTimer ?? ((callback, delay) => window.setTimeout(callback, delay))
  const clearTimer = options.clearTimer ?? ((timer) => window.clearTimeout(timer))

  let timer = null
  let inFlight = null
  let requested = false
  let stopped = false

  async function run() {
    if (stopped || inFlight || !requested) return
    requested = false
    const current = Promise.resolve().then(refresh)
    inFlight = current
    try {
      await current
    } catch (error) {
      options.onError?.(error)
    } finally {
      if (inFlight === current) inFlight = null
      if (requested && !stopped) schedule()
    }
  }

  function schedule() {
    if (stopped) return
    requested = true
    if (timer !== null || inFlight) return
    timer = setTimer(() => {
      timer = null
      void run()
    }, delayMs)
  }

  async function flush() {
    if (stopped) return
    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }
    if (inFlight) {
      await inFlight
      if (timer !== null) {
        clearTimer(timer)
        timer = null
      }
      if (!requested || stopped) return
    }
    await run()
  }

  function cancel() {
    stopped = true
    requested = false
    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }
  }

  return { schedule, flush, cancel }
}

export function shouldCommitSnapshot(current, next) {
  if (!next) return false
  if (!current) return true
  const currentEpoch = Number(current.runtime?.resetEpoch ?? 0)
  const nextEpoch = Number(next.runtime?.resetEpoch ?? 0)
  if (nextEpoch !== currentEpoch) return nextEpoch > currentEpoch
  return Number(next.eventSeq ?? 0) >= Number(current.eventSeq ?? 0)
}
