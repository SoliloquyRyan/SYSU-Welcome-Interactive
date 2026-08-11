const FORMATION_GLYPHS = {
  智: [
    '1111111',
    '0010000',
    '0111110',
    '0100010',
    '0111110',
    '0001000',
    '1111111',
  ],
  工: [
    '1111111',
    '0001000',
    '0001000',
    '0001000',
    '0001000',
    '0001000',
    '1111111',
  ],
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  6: ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
}

const FORMATION_TEXT = '智工2026'

function unitFromSeed(seed, offset) {
  const source = `${seed}${offset.toString(16)}`
  let value = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    value ^= source.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return ((value >>> 0) % 10_000) / 10_000
}

function getDotMap() {
  const dots = []
  let cursor = 0
  for (const character of FORMATION_TEXT) {
    const glyph = FORMATION_GLYPHS[character]
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === '1') dots.push({ x: cursor + column, y: row })
      }
    }
    cursor += glyph[0].length + (character === '工' ? 2 : 1)
  }
  return { dots, width: cursor - 1, height: 7 }
}

const dotMap = getDotMap()

/**
 * Keeps each participant's star placement deterministic while arranging all
 * visible stars into the public "智工2026" formation. Repeated dots become
 * small clusters when the active population exceeds the bitmap dot count.
 */
export function starFormationStyle(star, index) {
  const dot = dotMap.dots[index % dotMap.dots.length]
  const layer = Math.floor(index / dotMap.dots.length)
  const seed = star.visualSeed
  const clusterX = (unitFromSeed(seed, layer + 11) - 0.5) * 1.05
  const clusterY = (unitFromSeed(seed, layer + 17) - 0.5) * 1.1
  const targetX = 7 + (dot.x / Math.max(1, dotMap.width - 1)) * 86 + clusterX
  const targetY = 13 + (dot.y / Math.max(1, dotMap.height - 1)) * 74 + clusterY

  const side = Math.floor(unitFromSeed(seed, 3) * 4)
  const edgeOffset = 5 + unitFromSeed(seed, 5) * 90
  const sourceX = side === 0 ? -8 : side === 1 ? 108 : edgeOffset
  const sourceY = side === 2 ? -10 : side === 3 ? 110 : edgeOffset

  return {
    '--star-x': `${targetX.toFixed(2)}%`,
    '--star-y': `${targetY.toFixed(2)}%`,
    '--star-from-x': `${(sourceX - targetX).toFixed(2)}%`,
    '--star-from-y': `${(sourceY - targetY).toFixed(2)}%`,
    '--star-delay': `${Math.round(unitFromSeed(seed, 7) * 700)}ms`,
    '--star-size': `${(3.2 + unitFromSeed(seed, 9) * 3.4).toFixed(2)}px`,
  }
}

export const formationText = FORMATION_TEXT
