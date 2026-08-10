export function createConnectGate() {
  let active = false
  let pending = false

  function enter() {
    if (active) {
      pending = true
      return false
    }
    active = true
    pending = false
    return true
  }

  function leave() {
    active = false
    const shouldRetry = pending
    pending = false
    return shouldRetry
  }

  function cancelPending() {
    pending = false
  }

  return { enter, leave, cancelPending }
}
