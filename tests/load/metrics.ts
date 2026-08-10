export const LOAD_THRESHOLD_MS = 2_000

export interface OperationSummary {
  attempted: number
  succeeded: number
  failed: number
  successRate: number
  p50Ms: number | null
  p95Ms: number | null
  maxMs: number | null
  thresholdMs: number
  thresholdPassed: boolean
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function percentile(sorted: readonly number[], quantile: number): number | null {
  if (sorted.length === 0) return null
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1)
  return sorted[index] ?? null
}

export class OperationRecorder {
  readonly #durations: number[] = []
  #attempted = 0
  #failed = 0

  success(durationMs: number): void {
    this.#attempted += 1
    this.#durations.push(durationMs)
  }

  failure(): void {
    this.#attempted += 1
    this.#failed += 1
  }

  summary(thresholdMs = LOAD_THRESHOLD_MS): OperationSummary {
    const sorted = [...this.#durations].sort((left, right) => left - right)
    const succeeded = sorted.length
    const p50 = percentile(sorted, 0.5)
    const p95 = percentile(sorted, 0.95)
    const max = sorted.at(-1) ?? null
    return {
      attempted: this.#attempted,
      succeeded,
      failed: this.#failed,
      successRate:
        this.#attempted === 0 ? 0 : round(succeeded / this.#attempted),
      p50Ms: p50 === null ? null : round(p50),
      p95Ms: p95 === null ? null : round(p95),
      maxMs: max === null ? null : round(max),
      thresholdMs,
      thresholdPassed:
        this.#attempted > 0 && this.#failed === 0 && p95 !== null && p95 <= thresholdMs,
    }
  }
}

export async function mapLimit<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error('Concurrency must be a positive integer')
  }
  const results = new Array<R>(values.length)
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (true) {
        const index = cursor
        cursor += 1
        if (index >= values.length) return
        const value = values[index]
        if (value === undefined) throw new Error('Load work item is unavailable')
        results[index] = await operation(value, index)
      }
    },
  )
  await Promise.all(workers)
  return results
}

export function assertCondition(
  condition: unknown,
  sanitizedMessage: string,
): asserts condition {
  if (!condition) throw new Error(sanitizedMessage)
}
