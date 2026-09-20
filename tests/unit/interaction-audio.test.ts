import { describe, expect, it } from 'vitest'

import {
  interactionTrackForSettings,
  uniqueInteractionInputs,
} from '../../scripts/obs/interaction-audio.mjs'
import { autoStartMediaAction } from '../../scripts/obs/audio-playback.mjs'
import { OBS_HOST_SCENE, resolveObsScene, sceneCueKey } from '../../scripts/obs/scene-sync.mjs'

describe('D-110 OBS interaction audio mapping', () => {
  it('resolves HOST to the fixed opening scene and fails closed for invalid cues', () => {
    expect(resolveObsScene([], { stageMode: 'HOST', programId: null })).toBe(OBS_HOST_SCENE)
    expect(resolveObsScene([{ programId: 'p1', scene: '节目一' }], { stageMode: 'PROGRAM', programId: 'p1' })).toBe('节目一')
    expect(resolveObsScene([{ programId: 'p1', scene: '奖项一' }], { stageMode: 'AWARD', programId: 'p1' })).toBe('奖项一')
    expect(resolveObsScene([{ programId: 'p1', scene: 'a' }, { programId: 'p1', scene: 'b' }], { stageMode: 'PROGRAM', programId: 'p1' })).toBeNull()
    expect(resolveObsScene([], { stageMode: 'PROGRAM', programId: 'missing' })).toBeNull()
    expect(resolveObsScene([], { stageMode: 'UNKNOWN', programId: 'p1' })).toBeNull()
  })
  it('accepts only the three mix tracks and excludes hint/answer files', () => {
    expect(interactionTrackForSettings({ is_local_file: true, local_file: 'D:/现场/B2_陈奕迅_mix.mp3' })).toBe('b2-eason')
    expect(interactionTrackForSettings({ is_local_file: true, local_file: 'D:/现场/R2_林俊杰_mix.mp3' })).toBe('r2-jj')
    expect(interactionTrackForSettings({ is_local_file: true, local_file: 'D:/现场/R3_邓紫棋_mix.mp3' })).toBe('r3-gem')
    for (const file of ['B2_陈奕迅_hint.mp3', 'R2_林俊杰_answer.mp3', 'R5_薛之谦_mix.mp3', 'R3_邓紫棋_mix.wav', 'B20_其他_mix.mp3']) {
      expect(interactionTrackForSettings({ is_local_file: true, local_file: file })).toBeNull()
    }
    expect(interactionTrackForSettings({ is_local_file: false, local_file: 'B2_陈奕迅_mix.mp3' })).toBeNull()
  })

  it('marks duplicate track mappings unavailable instead of choosing one silently', () => {
    expect(uniqueInteractionInputs([
      { inputName: 'B2 mix', inputUuid: 'uuid-b2', settings: { is_local_file: true, local_file: 'B2_陈奕迅_mix.mp3' }, available: true },
      { inputName: 'B2 duplicate', inputUuid: 'uuid-b2-2', settings: { is_local_file: true, local_file: 'B2_陈奕迅_mix.mp3' }, available: false },
      { inputName: 'R2 mix', inputUuid: 'uuid-r2', settings: { is_local_file: true, local_file: 'R2_林俊杰_mix.mp3' }, available: false },
    ])).toEqual([
      { trackId: 'b2-eason', inputUuid: 'uuid-b2', inputName: 'B2 mix', available: false, conflict: true },
      { trackId: 'r2-jj', inputUuid: 'uuid-r2', inputName: 'R2 mix', available: false },
    ])
  })

  it('starts a newly armed mix from the beginning in every valid media state', () => {
    expect(autoStartMediaAction('OBS_MEDIA_STATE_NONE')).toBe('OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART')
    expect(autoStartMediaAction('OBS_MEDIA_STATE_ENDED')).toBe('OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART')
    expect(autoStartMediaAction('OBS_MEDIA_STATE_STOPPED')).toBe('OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART')
    expect(autoStartMediaAction('OBS_MEDIA_STATE_PAUSED')).toBe('OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART')
    expect(autoStartMediaAction('OBS_MEDIA_STATE_PLAYING')).toBe('OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART')
    expect(() => autoStartMediaAction('unknown')).toThrow('OBS_MEDIA_STATE_INVALID')
  })

  it('resolves an OBS scene only from one exact programme mapping', () => {
    const mapping = [
      { programId: 'event2026-01', scene: '01 lovesik girls' },
      { programId: 'event2026-07', scene: '互动环节一 · 歌名 decoder' },
    ]
    expect(resolveObsScene(mapping, { stageMode: 'PROGRAM', programId: 'event2026-01' })).toBe('01 lovesik girls')
    expect(resolveObsScene(mapping, { stageMode: 'PROGRAM', programId: 'missing' })).toBeNull()
    expect(resolveObsScene([...mapping, { programId: 'event2026-01', scene: 'duplicate' }], { stageMode: 'PROGRAM', programId: 'event2026-01' })).toBeNull()
    expect(sceneCueKey({ cueId: '2:1:7:event2026-01' })).toBe('2:1:7:event2026-01')
    expect(sceneCueKey({ cueId: '' })).toBeNull()
  })
})
