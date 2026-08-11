import { describe, expect, it } from 'vitest'

import {
  STAR_TEMPERATURE_DEFAULT,
  clampStarTemperature,
  starTemperatureColor,
  starTemperatureStyle,
} from '../../frontend/src/services/star-temperature.js'

describe('stellar temperature presentation', () => {
  it('clamps and snaps all previews to the persisted 50 K contract', () => {
    expect(clampStarTemperature(Number.NaN)).toBe(STAR_TEMPERATURE_DEFAULT)
    expect(clampStarTemperature(1000)).toBe(2400)
    expect(clampStarTemperature(7374)).toBe(7350)
    expect(clampStarTemperature(7375)).toBe(7400)
    expect(clampStarTemperature(15000)).toBe(12000)
  })

  it('interpolates the approved warm-to-blue-white stellar spectrum', () => {
    expect(starTemperatureColor(2400)).toBe('#ff7656')
    expect(starTemperatureColor(5000)).toBe('#ffd98b')
    expect(starTemperatureColor(6500)).toBe('#fff4dc')
    expect(starTemperatureColor(12000)).toBe('#a9ccff')
    expect(starTemperatureStyle(7350)).toEqual({
      '--star-temperature-color': starTemperatureColor(7350),
    })
  })
})
