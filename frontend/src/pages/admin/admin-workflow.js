// Sequential UI convenience over existing commands. A failed/uncertain request
// is never replayed automatically and is never treated as an atomic rollback.
export function createAdminWorkflow() {
  let running = false
  return {
    async run({ steps, read, execute, isCurrent = () => true, onProgress = () => {} }) {
      if (running) return { ok: false, reason: 'BUSY', completed: [] }
      running = true
      const epoch = read()?.resetEpoch
      const completed = []
      const stop = (step, reason) => {
        const result = { ok: false, reason, completed: [...completed], pending: steps.slice(completed.length).map(item => item.label), current: step?.label }
        onProgress(result)
        return result
      }
      try {
        for (const step of steps) {
          const before = read()
          if (!isCurrent() || before?.resetEpoch !== epoch) return stop(step, 'SESSION_CHANGED')
          if (!step.canRun(before)) return stop(step, 'STATE_CHANGED')
          onProgress({ ok: null, completed: [...completed], current: step.label, pending: steps.slice(completed.length).map(item => item.label) })
          const outcome = await execute(step.build(before), step.label)
          if (!isCurrent() || read()?.resetEpoch !== epoch) return stop(step, 'SESSION_CHANGED')
          if (!outcome?.ok) return stop(step, 'COMMAND_UNCONFIRMED')
          if (!step.matches(read())) return stop(step, 'STATE_CHANGED')
          completed.push(step.label)
        }
        const result = { ok: true, completed, pending: [], current: null }
        onProgress(result)
        return result
      } catch {
        return stop(steps[completed.length], 'COMMAND_UNCONFIRMED')
      } finally { running = false }
    },
  }
}
