import { describe, expect, it } from 'vitest'

import { TRANSITION_SECONDS, cameraAt, makePublicStars, projectPublicStar } from '../../frontend/src/pages/screen/cinematic-galaxy-scene.js'
import { arrivalMeteorPlacement, starSpectralPalette } from '../../frontend/src/pages/screen/galaxy-renderer.js'
import { flowCamera, flowPoint, stellarFormation, projectFlowPoint, flowAngle, spiralAngle, personalStarFormation, projectFlowStar } from '../../frontend/src/rendering/stellar-flow.js'
import { cloudState } from '../../frontend/src/rendering/stellar-cloud.js'

const first = { publicStarId: 'opaque-test-a', formationSlot: 'stable-slot-a', displayColor: '#f4b89b' }
const second = { publicStarId: 'opaque-test-b', formationSlot: 'stable-slot-b', displayColor: '#afc8ff' }

describe('approved cinematic galaxy in a live event', () => {
  it('disperses and reforms local cloud patches without synchronous full-disk pulsing', () => {
    const patches = [[.8, .2], [-1.1, .6], [.2, -1.7]]
    const samples = patches.map(([x,y]) => Array.from({length:81}, (_,t) => cloudState(x,y,t).density))
    for(const sequence of samples) {
      expect(Math.min(...sequence)).toBeLessThan(.5)
      expect(Math.max(...sequence)).toBeGreaterThan(1.1)
      const firstThin = sequence.findIndex(density => density < .5)
      expect(sequence.slice(firstThin + 1).some(density => density > 1.1)).toBe(true)
    }
    expect(samples[0].some((value,t) => Math.abs(value-samples[1][t])>.5)).toBe(true)
  })

  it('keeps cloud evolution bounded and continuous over long-running sampling', () => {
    for(let seconds=0;seconds<=28800;seconds+=41) for(const [x,y] of [[0,0],[-2,1],[2,-2]]) {
      const a=cloudState(x,y,seconds),b=cloudState(x,y,seconds+1/60)
      expect(a.density).toBeGreaterThanOrEqual(.4)
      expect(a.density).toBeLessThanOrEqual(1.201)
      expect(Math.abs(a.x)).toBeLessThan(.059)
      expect(Math.abs(a.y)).toBeLessThan(.055)
      expect(Math.abs(b.density-a.density)).toBeLessThan(.008)
      expect(Math.hypot(b.x-a.x,b.y-a.y)).toBeLessThan(.002)
    }
  })
  it('keeps public-star and nebula world projection identical across eight hours and aspect ratios', () => {
    for (const [width,height] of [[320,568],[390,844],[844,390],[1920,1080],[3840,1080]]) {
      for(let seconds=0;seconds<=28800;seconds+=43) {
        const point=flowPoint(stellarFormation(first.formationSlot),seconds)
        const expected=projectFlowPoint(point,flowCamera(seconds),width,height)
        const actual=projectPublicStar(first,seconds,width,height)
        expect(actual).toEqual(expected)
        expect([actual.x,actual.y,actual.depth].every(Number.isFinite)).toBe(true)
      }
    }
  })
  it('advects a star on an arm without sliding away from the material path',()=>{
    for(const radius of [.15,.4,.8])for(const seconds of [0,10,260,3600,28800]) {
      const point=flowPoint({radius,angle:spiralAngle(radius),z:0},seconds)
      const angle=Math.atan2(point[1],point[0])-flowAngle(radius,seconds)-spiralAngle(radius)
      expect(Math.sin(angle)).toBeCloseTo(0,8)
      expect(Math.cos(angle)).toBeCloseTo(1,8)
      expect(Math.hypot(point[0],point[1])).toBeCloseTo(radius*2.65,8)
    }
  })
  it('keeps the personal star and label inside the phone scene throughout its orbit',()=>{
    for(const [width,height] of [[320,568],[390,844],[844,390]])for(let seconds=0;seconds<1040;seconds+=11) {
      const point=projectFlowStar(personalStarFormation(null),seconds,width,height,true)
      expect(point.x).toBeGreaterThan(24)
      expect(point.x).toBeLessThan(width-24)
      expect(point.y).toBeGreaterThan(height*.20)
      expect(point.y).toBeLessThan(height*.75)
    }
  })
  it('keeps a finite camera outside the disk during eight hours of assembly and at any show cue', () => {
    for (let seconds = 0; seconds <= 8 * 3600; seconds += 37) {
      for (const progress of [0, .1, .5, .8, 1]) {
        const camera = cameraAt(seconds, progress, true)
        expect(camera.position.every(Number.isFinite)).toBe(true)
        expect(Math.hypot(...camera.position)).toBeGreaterThan(1.5)
        expect(Math.hypot(...camera.position)).toBeLessThan(6)
        expect(Math.hypot(...camera.forward)).toBeCloseTo(1, 10)
      }
    }
  })

  it('does not jump back to the preview camera when a late live cue starts', () => {
    for (const seconds of [0, 9, 155, 7200]) {
      const before = cameraAt(seconds, 0, true)
      const after = cameraAt(seconds + .001, .001 / TRANSITION_SECONDS, true)
      expect(Math.hypot(...before.position.map((value: number, i: number) => value - after.position[i]))).toBeLessThan(.001)
    }
  })

  it('preserves public slots and locked colors across arrivals and snapshot reordering', () => {
    const one = makePublicStars([first]).filter((star: { decorative: boolean }) => !star.decorative)[0]
    const two = makePublicStars([second, first]).filter((star: { decorative: boolean }) => !star.decorative)[1]
    expect(two).toEqual(one)
    expect(one.palette).toEqual(starSpectralPalette(first.displayColor))
    expect(one.publicStarId).toBe(first.publicStarId)
    expect(Object.keys(one)).not.toContain('studentNumber')
  })

  it('creates no participant stars for an empty snapshot and caps real stars at 300', () => {
    const empty = makePublicStars([])
    expect(empty).toHaveLength(420)
    expect(empty.every((star: { decorative: boolean; publicStarId?: string }) => star.decorative && star.publicStarId === undefined)).toBe(true)
    const full = makePublicStars(Array.from({ length: 330 }, (_, i) => ({ ...first, publicStarId: `test-${i}`, formationSlot: i })))
    expect(full.filter((star: { decorative: boolean }) => !star.decorative)).toHaveLength(300)
  })

  it('lands a new arrival on the same projected star after its 1550 ms flight', () => {
    for (const arrivalAt of [0, 5000, 600000]) {
      const placement = (star: typeof first, w: number, h: number, timestamp: number) => projectPublicStar(star, timestamp / 1000, w, h)
      const meteor = arrivalMeteorPlacement(first, 1920, 1080, 1, arrivalAt, placement)
      const target = placement(first, 1920, 1080, arrivalAt + 1550)
      expect(target).not.toBeNull()
      expect(meteor.head.x).toBeCloseTo(target.x, 6)
      expect(meteor.head.y).toBeCloseTo(target.y, 6)
      expect(meteor.headAlpha).toBe(0)
    }
  })
})
