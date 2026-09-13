import fs from 'node:fs'

import type { SqliteDatabase } from './open-database.js'
import {
  credentialDigest,
  invitationTokenDigest,
  readProtectedRuntimeSecret,
} from './seed.js'

const EXPECTED_HEADERS = ['序号', '姓名', '学号', '星号', 'NFC网址'] as const
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

interface ProtectedDirectoryRow {
  id: string
  seedIndex: number
  displayName: string
  studentNumberDigest: string
  publicStarId: string
  tokenDigest: string
}

export interface VerifyProtectedNfcMapOptions {
  runtimeSecretPath: string
  nfcMapPath: string
  expectedOrigin?: string
}

export function parseProtectedNfcCsv(value: string): string[][] {
  const source = value.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cell += character
      }
      continue
    }

    if (character === '"') {
      if (cell.length !== 0) throw new Error('Protected NFC map CSV quoting is invalid')
      quoted = true
    } else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }

  if (quoted) throw new Error('Protected NFC map CSV has an unterminated field')
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((candidate) => candidate.some((entry) => entry.length > 0))
}

function normalizedExpectedOrigin(value?: string): string | null {
  if (!value) return null
  const origin = new URL(value)
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('Protected NFC expected origin must be a pathless HTTPS origin')
  }
  return origin.origin
}

function invitationToken(value: string, expectedOrigin: string | null): string {
  const isRelative = value.startsWith('/')
  if (expectedOrigin && isRelative) {
    throw new Error('Protected NFC map is not finalized for the formal HTTPS origin')
  }
  let url: URL
  if (isRelative) {
    url = new URL(value, 'https://relative.invalid')
  } else {
    try {
      url = new URL(value)
    } catch {
      throw new Error('Protected NFC map contains a non-absolute invitation URL')
    }
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (expectedOrigin && url.origin !== expectedOrigin) ||
    (expectedOrigin ? url.pathname !== '/welcome' : !url.pathname.endsWith('/welcome'))
  ) {
    throw new Error('Protected NFC map contains an invalid formal invitation URL')
  }
  const keys = [...url.searchParams.keys()]
  const token = url.searchParams.get('token') ?? ''
  if (
    keys.length !== 1 ||
    keys[0] !== 'token' ||
    url.searchParams.getAll('token').length !== 1 ||
    !INVITATION_TOKEN_PATTERN.test(token)
  ) {
    throw new Error('Protected NFC map contains an invalid invitation token')
  }
  return token
}

function undoSpreadsheetFormulaEscape(value: string): string {
  return /^'[=+@-]/.test(value) ? value.slice(1) : value
}

export function verifyProtectedNfcMap(
  database: SqliteDatabase,
  options: VerifyProtectedNfcMapOptions,
): { participantCount: number } {
  const secret = readProtectedRuntimeSecret(options.runtimeSecretPath)
  const stat = fs.statSync(options.nfcMapPath)
  if (!stat.isFile() || stat.size === 0 || stat.size > 4 * 1024 * 1024) {
    throw new Error('Protected NFC map is missing, empty or unexpectedly large')
  }
  const rows = parseProtectedNfcCsv(fs.readFileSync(options.nfcMapPath, 'utf8'))
  if (
    rows.length < 2 ||
    rows[0]?.length !== EXPECTED_HEADERS.length ||
    rows[0].some((value, index) => value !== EXPECTED_HEADERS[index])
  ) {
    throw new Error('Protected NFC map header does not match the current format')
  }
  const dataRows = rows.slice(1)
  if (dataRows.length !== secret.participantCount) {
    throw new Error('Protected NFC map participant count does not match the runtime')
  }

  const directoryRows = database
    .prepare(
      `SELECT identities.id,
              identities.seed_index AS seedIndex,
              identities.display_name AS displayName,
              identities.student_number_digest AS studentNumberDigest,
              identities.public_star_id AS publicStarId,
              invitations.token_digest AS tokenDigest
       FROM synthetic_identities AS identities
       JOIN invitation_tokens AS invitations
         ON invitations.identity_id = identities.id
        AND invitations.status = 'ACTIVE'
       WHERE identities.enabled = 1
       ORDER BY identities.seed_index`,
    )
    .all() as ProtectedDirectoryRow[]
  if (directoryRows.length !== secret.participantCount) {
    throw new Error('Protected NFC map cannot be matched to the active directory')
  }

  const expectedOrigin = normalizedExpectedOrigin(options.expectedOrigin)
  const studentNumbers = new Set<string>()
  const publicStarIds = new Set<string>()
  const tokenDigests = new Set<string>()

  for (let index = 0; index < dataRows.length; index += 1) {
    const fields = dataRows[index]!
    const directory = directoryRows[index]!
    if (fields.length !== EXPECTED_HEADERS.length) {
      throw new Error('Protected NFC map contains an invalid row shape')
    }
    const [seedIndexText, escapedName, studentNumber, publicStarId, url] = fields
    const seedIndex = Number(seedIndexText)
    const displayName = undoSpreadsheetFormulaEscape(escapedName!)
    const tokenDigest = invitationTokenDigest(invitationToken(url!, expectedOrigin))
    if (
      !Number.isInteger(seedIndex) ||
      seedIndex !== directory.seedIndex ||
      displayName !== directory.displayName ||
      publicStarId !== directory.publicStarId ||
      !/^\d{8}$/.test(studentNumber!) ||
      credentialDigest(
        secret.credentialPepper,
        'student-number',
        directory.id,
        studentNumber!,
      ) !== directory.studentNumberDigest ||
      tokenDigest !== directory.tokenDigest
    ) {
      throw new Error('Protected NFC map does not match the protected directory')
    }
    if (
      studentNumbers.has(studentNumber!) ||
      publicStarIds.has(publicStarId!) ||
      tokenDigests.has(tokenDigest)
    ) {
      throw new Error('Protected NFC map contains duplicate identity material')
    }
    studentNumbers.add(studentNumber!)
    publicStarIds.add(publicStarId!)
    tokenDigests.add(tokenDigest)
  }

  return { participantCount: dataRows.length }
}
