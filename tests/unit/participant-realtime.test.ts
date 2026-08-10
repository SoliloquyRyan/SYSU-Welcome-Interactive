import { describe, expect, it } from 'vitest'

import { applyParticipantRealtimeEvent } from '../../frontend/src/services/participant-realtime.js'

function snapshot() {
  return {
    eventSeq: 4,
    archiveAvailable: false,
    runtime: {
      resetEpoch: 1,
      stageRevision: 0,
      mode: 'REHEARSAL',
      status: 'READY',
      stage: 1,
      barragePaused: false,
      currentProgramId: 'program-001',
      updatedAt: '2026-08-10T00:00:00.000Z',
    },
    programs: [
      { id: 'program-001', state: 'CURRENT', heat: 0 },
      { id: 'program-002', state: 'NEXT', heat: 0 },
      { id: 'program-003', state: 'UPCOMING', heat: 0 },
    ],
  }
}

function event(type: string, eventSeq: number, payload: unknown) {
  return {
    protocolVersion: '1',
    resetEpoch: 1,
    stream: 'screen',
    eventSeq,
    eventId: `event-${eventSeq}`,
    type,
    committedAt: '2026-08-10T00:01:00.000Z',
    payload,
  }
}

describe('participant realtime projection', () => {
  it('applies a committed stage event without requesting a full snapshot', () => {
    const result = applyParticipantRealtimeEvent(
      snapshot(),
      event('runtime.stage.changed', 5, {
        mode: 'REHEARSAL',
        status: 'RUNNING',
        stage: 3,
        stageRevision: 1,
        currentProgramId: 'program-001',
      }),
    )

    expect(result.eventSeq).toBe(5)
    expect(result.runtime).toMatchObject({
      status: 'RUNNING',
      stage: 3,
      stageRevision: 1,
    })
  })

  it('recomputes current and next program states from an authoritative event', () => {
    const result = applyParticipantRealtimeEvent(
      snapshot(),
      event('program.changed', 6, {
        programId: 'program-002',
        stageRevision: 2,
      }),
    )

    expect(result.runtime.currentProgramId).toBe('program-002')
    expect(result.programs.map(({ state }) => state)).toEqual([
      'CLOSED',
      'CURRENT',
      'NEXT',
    ])
  })

  it('keeps the participant command version current when barrages pause', () => {
    const result = applyParticipantRealtimeEvent(
      snapshot(),
      event('barrage.pause.changed', 7, {
        paused: true,
        stageRevision: 3,
      }),
    )

    expect(result.runtime).toMatchObject({
      barragePaused: true,
      stageRevision: 3,
    })
  })

  it('keeps the participant command version current after an emergency clear', () => {
    const result = applyParticipantRealtimeEvent(
      snapshot(),
      event('barrage.cleared', 8, {
        displayBatch: 1,
        stageRevision: 4,
      }),
    )

    expect(result.runtime.stageRevision).toBe(4)
  })

  it('unlocks the archive immediately when the committed runtime reaches stage 6', () => {
    const result = applyParticipantRealtimeEvent(
      snapshot(),
      event('runtime.stage.changed', 9, {
        mode: 'REHEARSAL',
        status: 'RUNNING',
        stage: 6,
        stageRevision: 5,
        currentProgramId: 'program-001',
      }),
    )

    expect(result.archiveAvailable).toBe(true)
  })

  it('keeps the archive unlocked when the runtime completes', () => {
    const result = applyParticipantRealtimeEvent(
      snapshot(),
      event('runtime.status.changed', 10, {
        mode: 'LIVE',
        status: 'COMPLETED',
        stage: 6,
        stageRevision: 6,
      }),
    )

    expect(result.archiveAvailable).toBe(true)
    expect(result.runtime.status).toBe('COMPLETED')
  })

  it('projects another participant gift into the current program heat', () => {
    const result = applyParticipantRealtimeEvent(
      snapshot(),
      event('gift.accepted', 11, {
        programId: 'program-001',
        programHeat: 50,
      }),
    )

    expect(result.eventSeq).toBe(11)
    expect(result.programs[0].heat).toBe(50)
  })
})
