/**
 * Latency/throughput recorder for browser-driven load. Designed for 10k+ samples without
 * re-rendering per request: samples go into a growable Float64Array, and the UI pulls a
 * snapshot on a timer.
 */

export interface Sample {
  /** ms since the run started, at completion */
  at: number
  durationMs: number
  ok: boolean
  /** HTTP status or error code bucket, e.g. "200", "429", "NETWORK_ERROR" */
  outcome: string
}

export interface SecondBucket {
  second: number
  requests: number
  errors: number
  p50: number
  p95: number
}

export interface Summary {
  total: number
  ok: number
  failed: number
  elapsedMs: number
  rps: number
  min: number
  mean: number
  p50: number
  p90: number
  p95: number
  p99: number
  max: number
  outcomes: Record<string, number>
}

/** Nearest-rank percentile over an ascending-sorted array. */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]!
}

export class LatencyRecorder {
  private durations = new Float64Array(1024)
  private count = 0
  private okCount = 0
  private readonly outcomes = new Map<string, number>()
  private readonly perSecond = new Map<number, { durations: number[]; errors: number }>()
  private lastAt = 0

  record(sample: Sample): void {
    if (this.count === this.durations.length) {
      const grown = new Float64Array(this.durations.length * 2)
      grown.set(this.durations)
      this.durations = grown
    }
    this.durations[this.count++] = sample.durationMs
    if (sample.ok) this.okCount++
    this.outcomes.set(sample.outcome, (this.outcomes.get(sample.outcome) ?? 0) + 1)
    this.lastAt = Math.max(this.lastAt, sample.at)

    const second = Math.floor(sample.at / 1000)
    const bucket = this.perSecond.get(second) ?? { durations: [], errors: 0 }
    bucket.durations.push(sample.durationMs)
    if (!sample.ok) bucket.errors++
    this.perSecond.set(second, bucket)
  }

  get size(): number {
    return this.count
  }

  summary(elapsedMs = this.lastAt): Summary {
    const sorted = this.durations.slice(0, this.count).sort()
    let sum = 0
    for (const d of sorted) sum += d
    return {
      total: this.count,
      ok: this.okCount,
      failed: this.count - this.okCount,
      elapsedMs,
      rps: elapsedMs > 0 ? (this.count / elapsedMs) * 1000 : 0,
      min: sorted[0] ?? 0,
      mean: this.count ? sum / this.count : 0,
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted[this.count - 1] ?? 0,
      outcomes: Object.fromEntries(this.outcomes),
    }
  }

  timeline(): SecondBucket[] {
    return [...this.perSecond.entries()]
      .sort(([a], [b]) => a - b)
      .map(([second, { durations, errors }]) => {
        const sorted = Float64Array.from(durations).sort()
        return { second, requests: durations.length, errors, p50: percentile(sorted, 50), p95: percentile(sorted, 95) }
      })
  }
}
