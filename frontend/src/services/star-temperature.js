export const STAR_TEMPERATURE_MIN = 2400
export const STAR_TEMPERATURE_MAX = 12000
export const STAR_TEMPERATURE_DEFAULT = 5800
export const STAR_TEMPERATURE_STEP = 50

const SPECTRAL_STOPS = [
  [2400, [255, 118, 86]],
  [3600, [255, 171, 98]],
  [5000, [255, 217, 139]],
  [6500, [255, 244, 220]],
  [9000, [220, 234, 255]],
  [12000, [169, 204, 255]],
]

export function clampStarTemperature(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return STAR_TEMPERATURE_DEFAULT
  const stepped = Math.round(numeric / STAR_TEMPERATURE_STEP) * STAR_TEMPERATURE_STEP
  return Math.min(STAR_TEMPERATURE_MAX, Math.max(STAR_TEMPERATURE_MIN, stepped))
}

function channelToHex(value) {
  return Math.round(value).toString(16).padStart(2, '0')
}

export function starTemperatureColor(value) {
  const kelvin = clampStarTemperature(value)
  const upperIndex = SPECTRAL_STOPS.findIndex(([stop]) => stop >= kelvin)
  if (upperIndex <= 0) {
    return `#${SPECTRAL_STOPS[0][1].map(channelToHex).join('')}`
  }
  const [upperKelvin, upperColor] = SPECTRAL_STOPS[upperIndex]
  const [lowerKelvin, lowerColor] = SPECTRAL_STOPS[upperIndex - 1]
  const ratio = (kelvin - lowerKelvin) / (upperKelvin - lowerKelvin)
  const color = lowerColor.map(
    (channel, index) => channel + (upperColor[index] - channel) * ratio,
  )
  return `#${color.map(channelToHex).join('')}`
}

export function starTemperatureStyle(value) {
  return {
    '--star-temperature-color': starTemperatureColor(
      value ?? STAR_TEMPERATURE_DEFAULT,
    ),
  }
}
