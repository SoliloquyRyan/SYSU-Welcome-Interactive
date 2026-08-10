import { describe, expect, it } from 'vitest'

import {
  ApiErrorResponseSchema,
  HealthResponseSchema,
  ReadyResponseSchema,
  RealtimeEventEnvelopeSchema,
  RuntimeSnapshotSchema,
  ScreenSnapshotSchema,
} from '../../packages/contracts/src/index.js'

const NOW = '2026-08-10T12:00:00.000+08:00'

function runtimeSnapshot() {
  return {
    resetEpoch: 1,
    stageRevision: 0,
    mode: 'REHEARSAL',
    status: 'READY',
    stage: 1,
    barragePaused: false,
    updatedAt: NOW,
  }
}

describe('shared protocol contracts', () => {
  it('accepts the baseline runtime and rejects impossible stages', () => {
    expect(RuntimeSnapshotSchema.parse(runtimeSnapshot())).toEqual(
      runtimeSnapshot(),
    )

    expect(() =>
      RuntimeSnapshotSchema.parse({ ...runtimeSnapshot(), stage: 0 }),
    ).toThrow()
    expect(() =>
      RuntimeSnapshotSchema.parse({ ...runtimeSnapshot(), stage: 7 }),
    ).toThrow()
    expect(() =>
      RuntimeSnapshotSchema.parse({ ...runtimeSnapshot(), resetEpoch: 0 }),
    ).toThrow()
    expect(() =>
      RuntimeSnapshotSchema.parse({
        ...runtimeSnapshot(),
        unexpectedClientFlag: true,
      }),
    ).toThrow()
  })

  it('keeps the public screen snapshot aggregate-only', () => {
    const snapshot = {
      protocolVersion: '1',
      generatedAt: NOW,
      eventSeq: 0,
      runtime: { ...runtimeSnapshot(), currentProgramId: null },
      displayBatch: 0,
      programs: [
        {
          id: 'program-001',
          title: '虚构节目一',
          order: 1,
          heat: 0,
        },
      ],
      aggregates: {
        activatedCount: 0,
        starCreatedCount: 0,
        starStartedCount: 0,
        totalStarlight: 0,
        interactionCount: 0,
        cooperativeLightCount: 0,
        eligibleParticipantCount: 300,
        levelDistribution: {
          activated: 0,
          connected: 0,
          resonant: 0,
          completed: 0,
        },
      },
      starNodes: [],
      publishedBarrages: [
        {
          id: 'barrage-001',
          text: '一起抵达',
          displaySeq: 1,
          publishedAt: NOW,
        },
      ],
    }

    expect(ScreenSnapshotSchema.parse(snapshot)).toEqual(snapshot)

    for (const privateField of [
      'displayName',
      'demoCode',
      'inviteToken',
      'privateFutureMessage',
    ]) {
      expect(() =>
        ScreenSnapshotSchema.parse({
          ...snapshot,
          [privateField]: '不得进入公共快照',
        }),
      ).toThrow()
    }
  })

  it('requires versioned, ordered realtime envelopes', () => {
    const event = {
      protocolVersion: '1',
      resetEpoch: 1,
      stream: 'screen',
      eventSeq: 1,
      eventId: 'event-001',
      type: 'runtime.snapshot.changed',
      committedAt: NOW,
      payload: { stage: 2 },
    }

    expect(RealtimeEventEnvelopeSchema.parse(event)).toEqual(event)
    expect(() =>
      RealtimeEventEnvelopeSchema.parse({ ...event, protocolVersion: '2' }),
    ).toThrow()
    expect(() =>
      RealtimeEventEnvelopeSchema.parse({ ...event, eventSeq: -1 }),
    ).toThrow()
    expect(() =>
      RealtimeEventEnvelopeSchema.parse({ ...event, stream: 'private-admin' }),
    ).toThrow()
  })

  it('validates health and readiness without accepting private additions', () => {
    const health = {
      status: 'ok',
      service: 'sysu-welcome-backend',
      protocolVersion: '1',
      now: NOW,
    }
    const ready = {
      status: 'ready',
      service: 'sysu-welcome-backend',
      protocolVersion: '1',
      now: NOW,
      checks: {
        database: 'ready',
        migrations: 'ready',
        seed: 'ready',
        realtime: 'ready',
      },
      schemaVersion: 4,
      seedVersion: 'demo-v1',
      seedParticipantCount: 300,
      resetEpoch: 1,
      stageRevision: 0,
    }

    expect(HealthResponseSchema.parse(health)).toEqual(health)
    expect(ReadyResponseSchema.parse(ready)).toEqual(ready)
    expect(() =>
      ReadyResponseSchema.parse({ ...ready, databasePath: 'demo.sqlite' }),
    ).toThrow()
    expect(() =>
      HealthResponseSchema.parse({ ...health, adminPassword: 'secret' }),
    ).toThrow()
  })

  it('uses the frozen machine-readable error vocabulary', () => {
    const response = {
      status: 'error',
      error: {
        code: 'STALE_STAGE',
        message: '现场阶段已经变化，请同步后重试。',
        requestId: 'request-001',
      },
      resetEpoch: 1,
      stageRevision: 2,
    }

    expect(ApiErrorResponseSchema.parse(response)).toEqual(response)
    expect(() =>
      ApiErrorResponseSchema.parse({
        ...response,
        error: { ...response.error, code: 'UNKNOWN_ERROR' },
      }),
    ).toThrow()
  })
})
