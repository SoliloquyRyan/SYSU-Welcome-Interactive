export const MOBILE_PROGRAM_OPENING_MS = 2400

// This is an expendable visual cue. Recovery snapshots never call this gate.
export function createMobileProgramOpeningGate() {
  let consumedEpoch = null
  return {
    consume({ previous, next, resetEpoch, online, admitted, reduced, hidden, cinematic, presentation }) {
      if (previous?.currentScene !== 'ASSEMBLY' || next?.currentScene !== 'PROGRAM_SUPPORT'
        || next?.status !== 'RUNNING' || consumedEpoch === resetEpoch) return false
      consumedEpoch = resetEpoch
      return Boolean(online && admitted && !reduced && !hidden && !cinematic && presentation === 'NONE')
    },
  }
}
