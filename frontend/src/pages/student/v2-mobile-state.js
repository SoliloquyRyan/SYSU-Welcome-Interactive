export const V2_MOBILE_TABS = Object.freeze([
  { id: 'scene', label: '星程' },
  { id: 'programs', label: '节目单' },
  { id: 'archive', label: '档案' },
])

export const DISCOVERY_CINEMATIC_DURATION_MS = 5400
export const DISCOVERY_VISIBLE_STABLE_MS = 220
export const DISCOVERY_VISIBLE_WAIT_MAX_MS = 4000
export const COLOR_CONFIRM_CINEMATIC_DURATION_MS = 1000
export const ORBIT_HANDOFF_CINEMATIC_DURATION_MS = 4200

const SCENE_COPY = Object.freeze({
  ASSEMBLY: { title: '星海集结', subtitle: '让你的星，在此刻正式启程' },
  PROGRAM_SUPPORT: { title: '节目共振', subtitle: '把此刻的欢呼，送进现场' },
  COOPERATIVE_LIGHT: { title: '协同点亮', subtitle: '让彼此的光连成一片星海' },
})

export function mobileSceneCopy(snapshot) {
  const runtime = snapshot?.runtime
  if (!runtime) return { title: '正在确认星河', subtitle: '请稍候' }
  if (runtime.status === 'COMPLETED') {
    return { title: '今夜的星河，已经成形', subtitle: '感谢你成为其中的一颗星' }
  }
  if (runtime.status === 'PAUSED') {
    return { title: '现场暂时停驻', subtitle: '你的进度已保留，恢复后可继续' }
  }
  if (runtime.status === 'READY') {
    return { title: '已抵达星河', subtitle: '等待全场启程，你的光已在这里。' }
  }
  if (runtime.currentScene === 'PROGRAM_SUPPORT' && ['AWARD', 'SPEECH'].includes(snapshot.currentProgram?.kind)) return { title: snapshot.currentProgram.title, subtitle: '' }
  if (runtime.currentScene === 'PROGRAM_SUPPORT' && snapshot.stage?.mode === 'HOST') return { title: '迎新之夜', subtitle: '' }
  if (runtime.currentScene === 'PROGRAM_SUPPORT' && snapshot.currentProgram && snapshot.currentProgram.kind !== 'PERFORMANCE') {
    return { title: '现场互动', subtitle: '听从主持人的邀请，一起参与此刻' }
  }
  return SCENE_COPY[runtime.currentScene] ?? SCENE_COPY.ASSEMBLY
}

export function actionAllowed(snapshot, action) {
  return snapshot?.participant?.allowedActions?.includes(action) === true
}

export function shouldPlayDiscovery({ activationCreated, onboardingState, reducedMotion }) {
  return Boolean(
    activationCreated && onboardingState === 'NEEDS_COLOR' && !reducedMotion,
  )
}

export function shouldFinishCinematicOnHidden(cinematic) {
  return ['discovering', 'color-confirm', 'orbit-handoff'].includes(cinematic)
}

export function shouldPlayPullback({ previousState, nextSnapshot, reducedMotion }) {
  if (reducedMotion || previousState !== 'NEEDS_COLOR') return false
  const participant = nextSnapshot?.participant
  return Boolean(
    participant?.onboardingState === 'ADMITTED' &&
      participant.ownPublicStarId &&
      nextSnapshot.publicStars?.some(
        ({ publicStarId }) => publicStarId === participant.ownPublicStarId,
      ),
  )
}

export function shouldPlayOrbitHandoff({ previousState, nextSnapshot, reducedMotion }) {
  if (reducedMotion || previousState !== 'NEEDS_COLOR') return false
  const participant = nextSnapshot?.participant
  return Boolean(
    participant?.onboardingState === 'ADMITTED' &&
      participant.ownPublicStarId &&
      nextSnapshot.publicStars?.some(
        ({ publicStarId }) => publicStarId === participant.ownPublicStarId,
      ),
  )
}

export function participantCommand(snapshot, command, idempotencyKey, fields = {}) {
  return {
    protocolVersion: '2',
    resetEpoch: snapshot.resetEpoch,
    idempotencyKey,
    expectedParticipantRevision: snapshot.participant.participantRevision,
    command,
    ...fields,
  }
}

export function participantCommandAttempt(
  snapshot,
  command,
  fields,
  previousAttempt,
  createKey,
) {
  const fingerprint = JSON.stringify({
    resetEpoch: snapshot.resetEpoch,
    command,
    fields,
  })
  if (previousAttempt?.fingerprint === fingerprint) return previousAttempt

  const key = createKey()
  return {
    key,
    fingerprint,
    request: participantCommand(snapshot, command, key, fields),
  }
}

function nonRegressing(current, next) {
  return !Number.isInteger(current) || (Number.isInteger(next) && next >= current)
}

export function participantSnapshotCanReplace(current, next) {
  if (!next) return false
  if (!current) return true
  if (
    next.resetEpoch !== current.resetEpoch
    || next.participantStreamId !== current.participantStreamId
  ) return false
  return [
    [current.publicSeq, next.publicSeq],
    [current.participantSeq, next.participantSeq],
    [current.runtime?.runRevision, next.runtime?.runRevision],
    [current.presentationRevision, next.presentationRevision],
    [current.aggregateRevision, next.aggregateRevision],
    [current.interaction?.interactionRevision, next.interaction?.interactionRevision],
    [current.participant?.participantRevision, next.participant?.participantRevision],
  ].every(([before, after]) => nonRegressing(before, after))
}

export function upsertPublicStar(stars, nextStar) {
  const index = stars.findIndex(({ publicStarId }) => publicStarId === nextStar.publicStarId)
  if (index === -1) {
    stars.push(nextStar)
    return true
  }
  if (nextStar.starRevision <= stars[index].starRevision) return false
  stars[index] = nextStar
  return true
}

export function visibleCharacterCount(value) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(segmenter.segment(value.trim())).length
}
