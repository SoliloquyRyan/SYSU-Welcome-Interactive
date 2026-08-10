export function applyParticipantRealtimeEvent(snapshot, event) {
  if (!snapshot || !event || event.stream !== 'screen') return snapshot
  const payload = event.payload ?? {}
  const eventSeq = Math.max(snapshot.eventSeq ?? 0, Number(event.eventSeq) || 0)

  if (event.type === 'runtime.stage.changed') {
    const archiveAvailable =
      payload.stage === 6 || payload.status === 'COMPLETED'
    return {
      ...snapshot,
      eventSeq,
      archiveAvailable,
      runtime: {
        ...snapshot.runtime,
        mode: payload.mode,
        status: payload.status,
        stage: payload.stage,
        stageRevision: payload.stageRevision,
        currentProgramId: payload.currentProgramId,
        updatedAt: event.committedAt,
      },
    }
  }

  if (event.type === 'runtime.status.changed') {
    const archiveAvailable =
      payload.stage === 6 || payload.status === 'COMPLETED'
    return {
      ...snapshot,
      eventSeq,
      archiveAvailable,
      runtime: {
        ...snapshot.runtime,
        mode: payload.mode,
        status: payload.status,
        stage: payload.stage,
        stageRevision: payload.stageRevision,
        updatedAt: event.committedAt,
      },
    }
  }

  if (event.type === 'program.changed') {
    const currentIndex = snapshot.programs.findIndex(
      (program) => program.id === payload.programId,
    )
    return {
      ...snapshot,
      eventSeq,
      runtime: {
        ...snapshot.runtime,
        currentProgramId: payload.programId,
        stageRevision: payload.stageRevision,
        updatedAt: event.committedAt,
      },
      programs: snapshot.programs.map((program, index) => ({
        ...program,
        state:
          index === currentIndex
            ? 'CURRENT'
            : currentIndex >= 0 && index === currentIndex + 1
              ? 'NEXT'
              : currentIndex >= 0 && index < currentIndex
                ? 'CLOSED'
                : 'UPCOMING',
      })),
    }
  }

  if (event.type === 'barrage.pause.changed') {
    return {
      ...snapshot,
      eventSeq,
      runtime: {
        ...snapshot.runtime,
        barragePaused: payload.paused,
        stageRevision: payload.stageRevision,
        updatedAt: event.committedAt,
      },
    }
  }

  if (event.type === 'barrage.cleared') {
    return {
      ...snapshot,
      eventSeq,
      runtime: {
        ...snapshot.runtime,
        stageRevision: payload.stageRevision,
        updatedAt: event.committedAt,
      },
    }
  }

  if (event.type === 'gift.accepted') {
    return {
      ...snapshot,
      eventSeq,
      programs: snapshot.programs.map((program) =>
        program.id === payload.programId
          ? { ...program, heat: payload.programHeat }
          : program,
      ),
    }
  }

  return snapshot
}
