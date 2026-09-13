import { EventEmitter } from 'node:events'
import { PassThrough, Readable, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { collectFieldChecklist, fieldAnswer, fieldChecklistReport } from '../../scripts/field-checklist.mjs'

const items = [['F01', '合成检查一'], ['F02', '合成检查二'], ['F03', '合成检查三']]
const output = () => new Writable({ write(_chunk, _encoding, done) { done() } })
const source = { head: 'a'.repeat(40), dirty: false, fingerprint: 'b'.repeat(64) }
const metadata = { operator: '合成测试执行人', device: '合成设备', evidence: '合成证据位置' }
const report = (results: Awaited<ReturnType<typeof collectFieldChecklist>>, overrides = {}) => fieldChecklistReport({
  results, metadata, startedAt: '2026-09-06T00:00:00Z', endedAt: '2026-09-06T00:01:00Z',
  sourceBefore: source, sourceAfter: source, ...overrides,
})

describe('field records require explicit evidence', () => {
  it.each(['', ' ', 'PASS', 'yes', 'unknown', undefined])('keeps missing or invalid %s pending', (answer) => {
    expect(fieldAnswer(answer).result).toBe('PENDING')
  })

  it('does not turn pipe EOF or a short answer stream into remaining passes', async () => {
    const rows = await collectFieldChecklist(items, Readable.from(['P\r\n']), output())
    expect(rows.map((row) => row.result)).toEqual(['P', 'PENDING', 'PENDING'])
    expect(report(rows).exitCode).toBe(2)
    expect(report(rows).markdown).toContain('P=1 F=0 B=0 S=0 PENDING=2')
  })

  it('records blank and invalid lines without retaining their raw content', async () => {
    const rows = await collectFieldChecklist(items, Readable.from(['\nsynthetic-private-marker\np\n']), output())
    expect(rows.map((row) => row.result)).toEqual(['PENDING', 'PENDING', 'P'])
    expect(report(rows).markdown).not.toContain('synthetic-private-marker')
  })

  it('preserves partial results when interrupted and removes signal listeners', async () => {
    const input = new PassThrough()
    const signals = new EventEmitter()
    const collecting = collectFieldChecklist(items, input, output(), signals)
    input.write('P\n')
    await new Promise((resolve) => setImmediate(resolve))
    signals.emit('SIGINT')
    const rows = await collecting
    input.destroy()
    expect(rows.map((row) => row.result)).toEqual(['P', 'PENDING', 'PENDING'])
    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(report(rows).exitCode).toBe(2)
  })

  it('keeps failures, blocks and skips distinct, and never calls them complete', async () => {
    const rows = await collectFieldChecklist(items, Readable.from(['F\nB\nS\n']), output())
    expect(report(rows).counts).toEqual({ P: 0, F: 1, B: 1, S: 1, PENDING: 0 })
    expect(report(rows).exitCode).toBe(2)
  })

  it('binds explicit passes to operator, device, evidence and stable source, still awaiting signoff', async () => {
    const rows = await collectFieldChecklist(items, Readable.from(['p\nP\n P \n']), output())
    const complete = report(rows)
    expect(complete.exitCode).toBe(0)
    expect(complete.markdown).toContain('等待负责人签核')
    expect(complete.markdown).toContain(source.head)
    expect(complete.markdown).toContain(source.fingerprint)
    for (const key of ['operator', 'device', 'evidence']) {
      expect(report(rows, { metadata: { ...metadata, [key]: '' } }).exitCode).toBe(2)
    }
    expect(report(rows, { sourceAfter: { ...source, fingerprint: 'changed' } }).exitCode).toBe(2)
    expect(report(rows, { sourceBefore: { ...source, head: 'UNAVAILABLE' } }).exitCode).toBe(2)
    expect(report([]).exitCode).toBe(2)
  })
})
