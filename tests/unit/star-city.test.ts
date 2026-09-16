import { describe, expect, it } from 'vitest'
import { createAudioEnvelope } from '../../frontend/src/rendering/audio-envelope.js'
import { starCityTheme } from '../../frontend/src/rendering/star-city-theme.js'
import { createAdminWorkflow } from '../../frontend/src/pages/admin/admin-workflow.js'
import { mediaKey, meterEnvelope, resolveProgramMedia } from '../../scripts/obs/audio-sources.mjs'
import { connectObs } from '../../scripts/obs/obs-client.mjs'

describe('star city presentation contracts', () => {
  it('chooses one shared theme with live presentation priority', () => {
    expect(starCityTheme().id).toBe('program')
    expect(starCityTheme({ program: { kind: 'SPEECH' } }).id).toBe('host')
    expect(starCityTheme({ stage: { mode: 'AWARD' } }).id).toBe('award')
    expect(starCityTheme({ stage: { mode: 'AWARD' }, presentation: { type: 'RAFFLE' } }).id).toBe('interaction')
  })
  it('smooths valid volume and fades stale input within 800ms after the 500ms timeout', () => {
    const envelope = createAudioEnvelope()
    expect(envelope.sample(0)).toEqual({ level: 0, available: false })
    for (let time = 0; time <= 1000; time += 50) {
      envelope.receive({ version: 1, level: 1, available: true }, time)
      envelope.sample(time)
    }
    const level = envelope.sample(1100).level
    expect(level).toBeGreaterThan(.9)
    expect(envelope.sample(1500).available).toBe(true)
    expect(envelope.sample(1900).level).toBeCloseTo(level / 2, 2)
    expect(envelope.sample(2300)).toEqual({ level: 0, available: false })
  })
  it('ignores malformed payloads and reset discards old sound on resume', () => {
    const envelope = createAudioEnvelope()
    for (const value of [null, {}, { version: 2, level: 1, available: true }, { version: 1, level: NaN, available: true }, { version: 1, level: 1.1, available: true }]) expect(envelope.receive(value, 0)).toBe(false)
    envelope.receive({ version: 1, level: 1, available: true }, 0)
    expect(envelope.sample(20).level).toBeGreaterThan(0)
    envelope.reset()
    expect(envelope.sample(30)).toEqual({ level: 0, available: false })
  })
})

describe('sequential console actions', () => {
  function setup() {
    let state = { resetEpoch: 3, revision: 0 }
    const calls: number[] = []
    const steps = [0, 1, 2].map(index => ({ label: 'step ' + index,
      canRun: (s: typeof state) => s.revision === index,
      build: (s: typeof state) => ({ expectedRevision: s.revision }),
      matches: (s: typeof state) => s.revision === index + 1,
    }))
    return { steps, calls, read: () => state, set: (next: typeof state) => { state = next },
      execute: async (body: { expectedRevision: number }) => { calls.push(body.expectedRevision); state = { ...state, revision: state.revision + 1 }; return { ok: true } } }
  }
  it('builds every step from the newly observed state', async () => {
    const fixture = setup()
    const result = await createAdminWorkflow().run(fixture)
    expect(result.ok).toBe(true); expect(fixture.calls).toEqual([0, 1, 2])
  })
  it('stops after an uncertain second response and retains the completed receipt', async () => {
    const fixture = setup()
    const execute = fixture.execute
    fixture.execute = async body => body.expectedRevision === 1 ? { ok: false } : execute(body)
    const result = await createAdminWorkflow().run(fixture)
    expect(result.ok).toBe(false); expect(result.completed).toEqual(['step 0'])
    expect(result.pending).toEqual(['step 1', 'step 2']); expect(fixture.calls).toEqual([0])
  })
  it('stops when the session, epoch or observed state changes', async () => {
    for (const mode of ['session', 'epoch', 'state']) {
      const fixture = setup(); let current = true
      const execute = fixture.execute
      const result = await createAdminWorkflow().run({ ...fixture, isCurrent: () => current, execute: async body => {
        const result = await execute(body)
        if (mode === 'session') current = false
        else fixture.set({ resetEpoch: mode === 'epoch' ? 4 : 3, revision: 9 })
        return result
      } })
      expect(result.ok).toBe(false); expect(fixture.calls).toEqual([0])
    }
  })
  it('rejects a duplicate invocation while a request is in flight', async () => {
    const fixture = setup(), workflow = createAdminWorkflow()
    let release!: (value: { ok: boolean }) => void
    const first = workflow.run({ ...fixture, execute: () => new Promise(resolve => { release = resolve }) })
    expect((await workflow.run(fixture)).reason).toBe('BUSY')
    release({ ok: false }); await first
    expect((await workflow.run(fixture)).ok).toBe(true)
  })
})

describe('OBS program audio selection', () => {
  it('uses post-fader RMS and ignores input peak, microphones and unmatched sources', () => {
    const inputs = [
      { inputUuid: 'song', inputLevelsMul: [[0, 0, .99], [0, 0, .9]] },
      { inputUuid: 'mic', inputLevelsMul: [[1, 1, 1]] },
    ]
    expect(meterEnvelope({ inputs }, new Set(['song']))).toEqual({ version: 1, level: 0, available: true })
    expect(meterEnvelope({ inputs }, new Set(['missing']))).toEqual({ version: 1, level: 0, available: false })
    inputs[0]!.inputLevelsMul = [[.1, .2, 1]]
    expect(meterEnvelope({ inputs }, new Set(['song'])).level).toBeCloseTo(34 / 46)
  })
  it('resolves enabled nested program sources with exact media, mute and output track checks', async () => {
    const request = async (type: string, data: Record<string, string> = {}) => {
      if (type === 'GetCurrentProgramScene') return { currentProgramSceneName: 'stage' }
      if (type === 'GetInputList') return { inputs: ['song', 'muted', 'monitor', 'unrouted', 'other', 'mic', 'hidden'].map(name => ({ inputName: name, inputUuid: name, inputKind: name === 'mic' ? 'wasapi_input_capture' : 'ffmpeg_source' })) }
      if (type === 'GetSceneItemList') return { sceneItems: [
        { sourceName: 'group', sceneItemEnabled: true, isGroup: true },
        { sourceName: 'hidden', sceneItemEnabled: false },
      ] }
      if (type === 'GetGroupSceneItemList') return { sceneItems: ['song', 'muted', 'monitor', 'unrouted', 'other', 'mic'].map(sourceName => ({ sourceName, sceneItemEnabled: true })) }
      if (type === 'GetInputSettings') return { inputSettings: { local_file: data.inputName === 'other' ? 'D:/other.mp3' : 'D:/SHOW/song.mp3', is_local_file: true } }
      if (type === 'GetInputMute') return { inputMuted: data.inputName === 'muted' }
      if (type === 'GetInputAudioTracks') return { inputAudioTracks: { 1: data.inputName !== 'unrouted' } }
      if (type === 'GetInputAudioMonitorType') return { monitorType: data.inputName === 'monitor' ? 'OBS_MONITORING_TYPE_MONITOR_ONLY' : 'OBS_MONITORING_TYPE_NONE' }
      if (type === 'GetSourceActive') return { videoActive: true }
      throw new Error('unexpected request')
    }
    const result = await resolveProgramMedia({ request }, [{ scene: 'stage', media: ['d:\\show\\song.mp3'] }])
    expect([...result.inputs]).toEqual(['song'])
    expect((await resolveProgramMedia({ request }, [])).inputs.size).toBe(0)
    expect(mediaKey('D:\\SHOW\\song.mp3')).toBe('d:/show/song.mp3')
  })
  it('rejects nonlocal OBS endpoints before attempting a connection', () => {
    expect(() => connectObs({ url: 'ws://example.com:4455' })).toThrow('OBS_LOOPBACK_REQUIRED')
    expect(() => connectObs({ url: 'ws://name:secret@localhost:4455' })).toThrow('OBS_LOOPBACK_REQUIRED')
  })
})
