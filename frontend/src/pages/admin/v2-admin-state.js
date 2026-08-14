const ADMIN_SNAPSHOT_COUNTERS = Object.freeze([
  (snapshot) => snapshot.publicSeq,
  (snapshot) => snapshot.adminSeq,
  (snapshot) => snapshot.runtime?.runRevision,
  (snapshot) => snapshot.presentationRevision,
  (snapshot) => snapshot.aggregateRevision,
  (snapshot) => snapshot.interaction?.interactionRevision,
])

function validCounter(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function generatedAtMillis(snapshot) {
  const value = Date.parse(snapshot?.generatedAt)
  return Number.isFinite(value) ? value : null
}

function validSnapshotClock(snapshot) {
  return Boolean(
    snapshot
      && snapshot.protocolVersion === '2'
      && Number.isSafeInteger(snapshot.resetEpoch)
      && snapshot.resetEpoch > 0
      && generatedAtMillis(snapshot) !== null
      && ADMIN_SNAPSHOT_COUNTERS.every((read) => validCounter(read(snapshot))),
  )
}

/**
 * Prevents an older concurrent HTTP response from replacing a newer admin view.
 * A reset starts a new generation whose counters intentionally return to zero.
 */
export function adminSnapshotCanReplace(current, next) {
  if (!validSnapshotClock(next)) return false
  if (!current) return true
  if (!validSnapshotClock(current)) return false
  if (next.resetEpoch !== current.resetEpoch) {
    return next.resetEpoch > current.resetEpoch
  }
  const comparisons = ADMIN_SNAPSHOT_COUNTERS.map(
    (read) => read(next) - read(current),
  )
  if (comparisons.some((comparison) => comparison < 0)) return false
  if (comparisons.some((comparison) => comparison > 0)) return true
  return generatedAtMillis(next) > generatedAtMillis(current)
}

export function createAdminSessionGeneration() {
  let current = 0
  return Object.freeze({
    capture() {
      return current
    },
    advance() {
      current += 1
      return current
    },
    isCurrent(candidate) {
      return candidate === current
    },
  })
}
