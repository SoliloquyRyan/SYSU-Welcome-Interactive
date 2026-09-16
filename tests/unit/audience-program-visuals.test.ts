import { describe, expect, it } from 'vitest'
import { audienceSkyPoints, giftStarAnchor, giftStarHighlights, projectSkyRegions, inSkyRectangle, MOBILE_SKY_UI_AREAS } from '../../frontend/src/rendering/audience-sky.js'
import { PROGRAM_VISUALS, programVisual, persistentProgramCredits } from '../../frontend/src/rendering/program-visuals.js'
import { makePublicStars } from '../../frontend/src/pages/screen/cinematic-galaxy-scene.js'
import { resolveProgramMedia, validateAudioMapping, meterEnvelope } from '../../scripts/obs/audio-sources.mjs'

const stars = Array.from({ length: 300 }, (_, i) => ({ publicStarId: 'synthetic-' + i, formationSlot: 'slot-' + String(i + 1).padStart(3, '0'), displayColor: '#aabbcc' }))
describe('D105 admitted stars and program presentation', () => {
  it('has exactly one point per admitted star, including 0, 1, typical and maximum populations', () => {
    for (const count of [0, 1, 220, 300]) {
      const input = stars.slice(0, count)
      expect(audienceSkyPoints([...input, ...input], {}).length).toBe(count)
      expect(makePublicStars(input, { audienceOnly: true }).length).toBe(count)
    }
    expect(giftStarAnchor([], 'receipt')).toBeNull()
  })
  it('keeps existing slots and colors unchanged as people arrive or snapshots reorder', () => {
    const initial = audienceSkyPoints(stars.slice(0, 220), {})
    expect(audienceSkyPoints([...stars].reverse(), {}).slice(0, 220)).toEqual(initial)
    expect(initial.every(p => p.color === '#aabbcc')).toBe(true)
    expect(giftStarAnchor(initial, 'same-event')).toEqual(giftStarAnchor(initial, 'same-event'))
  })
  it('keeps all 300 stars inside each artwork whitespace after cover cropping and away from UI', () => {
    for (const visual of Object.values(PROGRAM_VISUALS)) {
      for (const [aspect, compact] of [[1920/1080,false],[1600/1200,false],[2560/1080,false],[390/844,true],[320/568,true],[844/390,true]] as const) {
        const points = audienceSkyPoints(stars, { ...visual, aspect, compact })
        expect(points).toHaveLength(300)
        const polygons = projectSkyRegions(visual.skyRegions, aspect)
        for (const p of points) {
          expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(1)
          expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(1)
          // Convex polygon containment, independent of the placement sampler.
          expect(polygons.some(poly => poly.every((a, i) => {
            const b = poly[(i+1)%poly.length]!
            return (b[0]-a[0])*(p.y-a[1])-(b[1]-a[1])*(p.x-a[0]) >= -1e-9
          }))).toBe(true)
          if (compact) expect(MOBILE_SKY_UI_AREAS.some(r => inSkyRectangle(p,r))).toBe(false)
          else expect(visual.backgroundUIAreas.some(r => inSkyRectangle(p,r))).toBe(false)
        }
      }
    }
  })
  it('distributes faint video stars across the frame but chooses only safe stars for bright gifts', () => {
    for (const visual of Object.values(PROGRAM_VISUALS).filter(v => !v.art)) {
      const points = audienceSkyPoints(stars, { ...visual, overlay:true })
      expect(points).toHaveLength(300)
      expect(points.filter(p => p.x > .20 && p.x < .80).length).toBeGreaterThan(130)
      for (const [x,y] of [[0,0],[0,.5],[.5,0],[.5,.5]]) expect(points.filter(p => p.x >= x! && p.x < x!+.5 && p.y >= y! && p.y < y!+.5).length).toBeGreaterThan(30)
      for (let i = 0; i < 100; i++) {
        const anchor = giftStarAnchor(points, String(i))
        expect(anchor).not.toBeNull()
        expect(visual.protectedAreas.some(r => inSkyRectangle(anchor!,r,.024))).toBe(false)
      }
      const highlights = giftStarHighlights(points, [{ id:'confirmed', static:false }])
      expect(highlights).toHaveLength(1)
      expect(highlights[0]!.stars.size).toBeGreaterThan(0)
      expect(highlights[0]!.stars.size).toBeLessThanOrEqual(4)
      for (const id of highlights[0]!.stars.keys()) expect(points.find(p => p.id === id)?.giftSafe).toBe(true)
      expect(giftStarHighlights(points, [{ id:'reduced', static:true }])).toEqual([])
    }
    expect(giftStarAnchor([{ giftSafe:false }], 'empty-safe-area')).toBeNull()
    expect(audienceSkyPoints(stars, {skyRegions:[]})).toEqual([])
    expect(audienceSkyPoints(stars, {protectedAreas:[{x:0,y:0,w:1,h:1}]})).toEqual([])
  })
  it('maps exactly ten unique full backgrounds and nine overlays without copying server credits', () => {
    const entries = Object.values(PROGRAM_VISUALS)
    expect(new Set(entries.filter(p => p.art).map(p => p.art)).size).toBe(10)
    expect(entries.filter(p => p.mode === 'overlay')).toHaveLength(9)
    expect(entries.some(p => 'title' in p || 'performers' in p)).toBe(false)
    expect(programVisual({ id: 'unknown' }, {}).id).toBe('theme')
    expect(programVisual({ id: 'event2026-03' }, { mode: 'HOST' }).id).toBe('theme')
    expect(persistentProgramCredits({ id: 'event2026-03', kind: 'PERFORMANCE' }, { mode: 'PROGRAM' })).toBe(true)
    expect(persistentProgramCredits({ id: 'event2026-03', kind: 'PERFORMANCE' }, { mode: 'HOST' })).toBe(false)
    expect(persistentProgramCredits({ id: 'event2026-01', kind: 'PERFORMANCE' }, { mode: 'PROGRAM' })).toBe(false)
  })
})

describe('D105 explicit live audio inputs', () => {
  it('accepts legacy mappings but rejects malformed or ambiguous live mappings', () => {
    expect(validateAudioMapping([{ scene: 'a', media: [] }])).toHaveLength(1)
    for (const value of [null, [{ scene: 'a', media: [], liveInputs: 'mic' }], [{ scene: 'a', media: [], liveInputs: [''] }], [{ scene: 'a', media: [] }, { scene: 'a', media: [] }]]) expect(() => validateAudioMapping(value)).toThrow('OBS_MAPPING_INVALID')
  })
  it('selects explicit audio-only/global sources, excludes preview/hidden/muted/wrong-track sources, and caps mixing', async () => {
    const names = ['mixer', 'global-mixer', 'host-mic', 'desktop', 'hidden', 'preview', 'muted', 'wrong-track', 'monitor']
    const calls: string[] = []
    const request = async (type: string, data: Record<string, string> = {}) => {
      calls.push(type)
      if (type === 'GetCurrentProgramScene') return { currentProgramSceneName: 'live' }
      if (type === 'GetInputList') return { inputs: names.map(inputName => ({ inputName, inputUuid: inputName, inputKind: 'wasapi_input_capture' })) }
      if (type === 'GetSpecialInputs') return { desktop1: 'desktop', mic1: 'global-mixer', mic2: 'host-mic' }
      if (type === 'GetSceneItemList') return { sceneItems: names.filter(n => !['global-mixer','preview'].includes(n)).map(sourceName => ({ sourceName, sceneItemEnabled: sourceName !== 'hidden' })) }
      if (type === 'GetInputMute') return { inputMuted: data.inputName === 'muted' }
      if (type === 'GetInputAudioTracks') return { inputAudioTracks: { 1: data.inputName !== 'wrong-track' } }
      if (type === 'GetInputAudioMonitorType') return { monitorType: data.inputName === 'monitor' ? 'OBS_MONITORING_TYPE_MONITOR_ONLY' : 'OBS_MONITORING_TYPE_NONE' }
      if (type === 'GetSourceActive') return { videoActive: false }
      throw new Error(type)
    }
    const mapping = [{ scene: 'live', media: [], liveInputs: names.filter(n => !['host-mic','desktop'].includes(n)).concat('unplugged') }]
    const result = await resolveProgramMedia({ request }, mapping, 1, { inspectAll: true })
    expect([...result.inputs]).toEqual(['mixer', 'global-mixer'])
    expect(result.details.find(r => r.name === 'unplugged')?.reason).toBe('missing-input')
    expect(calls.every(c => c.startsWith('Get'))).toBe(true)
    expect(meterEnvelope({ inputs: [{ inputName: 'mixer', inputLevelsMul: [[.5,.5,.5]] }, { inputName: 'global-mixer', inputLevelsMul: [[.5,.5,.5]] }] }, result.inputs).level).toBe(1)
    expect((await resolveProgramMedia({ request }, [{ scene: 'live', media: [] }])).inputs.size).toBe(0)
  })
})
