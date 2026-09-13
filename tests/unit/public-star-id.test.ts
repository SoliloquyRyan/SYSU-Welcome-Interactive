import { describe, expect, it } from 'vitest'
import { publicStarIdForIdentity, publicStarIdsForRoster } from '../../backend/src/db/public-star-id.js'

describe('D-065 surname initial and last four digits', () => {
  it.each([
    ['张同学', 'Z'], ['曾同学', 'Z'], ['单同学', 'S'], ['单于同学', 'C'],
    ['欧阳同学', 'O'], ['仇同学', 'Q'], ['区同学', 'O'], ['張同学', 'Z'], ['M Test', 'M'],
  ])('handles surname pronunciation and registered Latin names: %s', (displayName, initial) => {
    expect(publicStarIdForIdentity({ displayName, studentNumber: '26000123' })).toBe(`${initial}-0123`)
  })

  it('preserves leading zeroes and supports an explicit surname correction', () => {
    expect(publicStarIdForIdentity({ displayName: '林测试', studentNumber: '202600000001' })).toBe('L-0001')
    expect(publicStarIdForIdentity({ displayName: 'Test Person', studentNumber: '26000007', surnameInitial: 'P' })).toBe('P-0007')
    expect(() => publicStarIdForIdentity({ displayName: '张', studentNumber: '26xx1234' })).toThrow(/student number/)
    expect(() => publicStarIdForIdentity({ displayName: '', studentNumber: '26000001' })).toThrow(/initial/)
    expect(() => publicStarIdForIdentity({ displayName: '张', studentNumber: '26000001', surnameInitial: 'zh' })).toThrow(/initial/)
  })

  it('rejects true collisions without revealing names or numbers or inventing suffixes', () => {
    const records = [{ displayName: '李甲', studentNumber: '26001234' },
      { displayName: '林乙', studentNumber: '26101234' }]
    expect(() => publicStarIdsForRoster(records)).toThrow('Duplicate star identifier at roster rows 1 and 2')
    expect(publicStarIdsForRoster([{ ...records[0]! }, { ...records[1]!, displayName: '张乙' }]))
      .toEqual(['L-1234', 'Z-1234'])
  })
})
