import { pinyin } from 'pinyin-pro'

export interface StarIdentityInput {
  displayName: string
  studentNumber: string
  surnameInitial?: string | undefined
}

/** D-065: a display identifier; invitation authentication remains independent. */
export function publicStarIdForIdentity(record: StarIdentityInput): string {
  if (!/^(?:\d{8}|\d{12})$/.test(record.studentNumber)) {
    throw new Error('Star identifier requires an 8-digit roster or 12-digit synthetic student number')
  }
  const name = record.displayName.trim().normalize('NFC')
  // pinyin-pro 3.29.3 treats 单于 as the mono-character surname 单 in head mode.
  const compoundInitial = /^(单于|單于)./.test(name) ? 'C' : undefined
  const derived = compoundInitial ?? (/^[A-Za-z]/.test(name)
    ? name[0]!.toUpperCase()
    : pinyin(name, { surname: 'head', type: 'array', toneType: 'none' })[0]?.[0]?.toUpperCase())
  const initial = record.surnameInitial ?? derived
  if (!initial || !/^[A-Z]$/.test(initial)) {
    throw new Error('Cannot derive surname initial; specify a single uppercase surnameInitial')
  }
  return `${initial}-${record.studentNumber.slice(-4)}`
}

export function publicStarIdsForRoster(records: readonly StarIdentityInput[]): string[] {
  const firstRowById = new Map<string, number>()
  return records.map((record, index) => {
    const id = publicStarIdForIdentity(record)
    const firstRow = firstRowById.get(id)
    if (firstRow !== undefined) {
      // Row numbers let the operator resolve ambiguity without logging identity material.
      throw new Error(`Duplicate star identifier at roster rows ${firstRow + 1} and ${index + 1}`)
    }
    firstRowById.set(id, index)
    return id
  })
}
