import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

export function fieldAnswer(answer) {
  const value = answer?.trim().toUpperCase()
  if (['P', 'F', 'B', 'S'].includes(value)) return { result: value, note: '' }
  return { result: 'PENDING', note: answer === undefined ? '输入结束或中断，未验收' : value ? '无效输入，未验收' : '空白输入，未验收' }
}

export async function collectFieldChecklist(items, input, output, signals = process) {
  const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) })
  const iterator = rl[Symbol.asyncIterator]()
  const interrupt = () => rl.close()
  signals.once('SIGINT', interrupt)
  signals.once('SIGTERM', interrupt)
  rl.once('SIGINT', interrupt)
  const results = []
  let ended = false
  try {
    for (const [id, text] of items) {
      if (input.isTTY && !ended) output.write(`[${id}] ${text} [P/F/B/S，空白保留待验收]? `)
      const answer = ended ? { done: true } : await iterator.next()
      ended = Boolean(answer.done)
      results.push({ id, text, ...fieldAnswer(answer.done ? undefined : answer.value) })
    }
  } finally {
    rl.close()
    signals.removeListener('SIGINT', interrupt)
    signals.removeListener('SIGTERM', interrupt)
  }
  return results
}

// Fingerprint source in memory only. Ignored private/runtime directories are
// never enumerated, and neither file contents nor Git patches enter the report.
export async function captureFieldSource(root = fileURLToPath(new URL('..', import.meta.url))) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true })
  try {
    const head = git('rev-parse', 'HEAD').trim()
    const dirty = Boolean(git('status', '--porcelain=v1', '--untracked-files=all').trim())
    const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)
    const digest = createHash('sha256')
    for (const relative of [...new Set(files)].sort()) {
      digest.update(`${relative}\0`)
      try { digest.update(await readFile(path.join(root, relative))) }
      catch (error) { if (error.code === 'ENOENT') digest.update('DELETED'); else throw error }
      digest.update('\0')
    }
    return { head, dirty, fingerprint: digest.digest('hex') }
  } catch {
    return { head: 'UNAVAILABLE', dirty: null, fingerprint: 'UNAVAILABLE' }
  }
}

function cell(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ')
}

export function fieldChecklistReport({ results, metadata, startedAt, endedAt, sourceBefore, sourceAfter }) {
  const counts = { P: 0, F: 0, B: 0, S: 0, PENDING: 0 }
  for (const item of results) counts[item.result] += 1
  const metadataComplete = ['operator', 'device', 'evidence'].every((key) => Boolean(metadata[key]?.trim()))
  const sourceStable = sourceBefore.head !== 'UNAVAILABLE'
    && sourceBefore.head === sourceAfter.head
    && sourceBefore.fingerprint === sourceAfter.fingerprint
  const complete = results.length > 0 && counts.P === results.length && metadataComplete && sourceStable
  const summary = Object.entries(counts).map(([key, count]) => `${key}=${count}`).join(' ')
  return {
    counts,
    exitCode: complete ? 0 : 2,
    markdown: [
      '# D-057 现场检查记录', '',
      `> 记录状态：${complete ? '已逐项记录通过，等待负责人签核' : 'PENDING：存在未通过、未验收或缺失证据'}。`,
      '> 本文件只辅助记录，不自动关闭 docs/D037_FIELD_ACCEPTANCE.md 人工门。', '',
      `- 开始：${cell(startedAt)}；结束：${cell(endedAt)}`,
      `- 执行人：${cell(metadata.operator || 'PENDING')}`,
      `- 设备/系统/浏览器/OBS 与实际访问方式：${cell(metadata.device || 'PENDING')}`,
      `- 脱敏证据位置：${cell(metadata.evidence || 'PENDING')}`,
      `- 起始 Git HEAD：${cell(sourceBefore.head)}；结束 Git HEAD：${cell(sourceAfter.head)}`,
      `- 工作树有改动（起始/结束）：${sourceBefore.dirty} / ${sourceAfter.dirty}`,
      `- 起始源码 SHA-256：${cell(sourceBefore.fingerprint)}`,
      `- 结束源码 SHA-256：${cell(sourceAfter.fingerprint)}`,
      `- 验收期间源码一致：${sourceStable ? '是' : '否或无法核实，须重新验收'}`, '',
      '| 编号 | 检查项 | 结果 | 备注 |', '|---|---|---|---|',
      ...results.map((item) => `| ${cell(item.id)} | ${cell(item.text)} | ${item.result} | ${cell(item.note)} |`), '',
      `合计：${summary}`, '',
    ].join('\n'),
  }
}
