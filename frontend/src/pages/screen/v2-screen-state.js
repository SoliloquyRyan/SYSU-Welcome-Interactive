export function screenSnapshotCanReplace(current, next) {
  if (!current) return true
  if (next.resetEpoch !== current.resetEpoch) return next.resetEpoch > current.resetEpoch
  return next.publicSeq >= current.publicSeq
    && next.runtime.runRevision >= current.runtime.runRevision
    && next.presentationRevision >= current.presentationRevision
    && next.aggregateRevision >= current.aggregateRevision
    && next.interaction.interactionRevision >= current.interaction.interactionRevision
}

// A barrage/aggregate event can overtake the HTTP raffle response. Its older
// global cursor must not roll back the screen, but its newer presentation
// family still contains a result that has not otherwise been delivered.
export function screenPresentationCanReplace(current, next) {
  return Boolean(current && next.resetEpoch === current.resetEpoch
    && next.presentationRevision > current.presentationRevision)
}

export function cooperativeLightProgress(aggregate) {
  const admitted = Math.max(0, aggregate?.admittedCount ?? 0)
  const count = Math.max(0, aggregate?.cooperativeLightCount ?? 0)
  return { count, admitted, ratio: admitted > 0 ? Math.min(1, count / admitted) : 0 }
}
