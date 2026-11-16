import { describe, expect, it } from 'vitest'
import { runPool } from './pool'
import { LatencyRecorder, percentile } from './stats'

describe('percentile', () => {
  it('uses nearest-rank on sorted input', () => {
    const sorted = Float64Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentile(sorted, 50)).toBe(50)
    expect(percentile(sorted, 95)).toBe(95)
    expect(percentile(sorted, 99)).toBe(99)
    expect(percentile(sorted, 100)).toBe(100)
  })

  it('returns 0 for no samples', () => {
    expect(percentile([], 95)).toBe(0)
  })
})

describe('LatencyRecorder', () => {
  it('summarises beyond its initial buffer capacity', () => {
    const recorder = new LatencyRecorder()
    for (let i = 0; i < 5000; i++) {
      recorder.record({ at: i, durationMs: i % 100, ok: i % 10 !== 0, outcome: i % 10 ? '200' : '503' })
    }
    const summary = recorder.summary(5000)
    expect(summary.total).toBe(5000)
    expect(summary.failed).toBe(500)
    expect(summary.outcomes).toEqual({ '200': 4500, '503': 500 })
    expect(summary.rps).toBe(1000)
    expect(summary.max).toBe(99)
  })

  it('buckets samples per second in order', () => {
    const recorder = new LatencyRecorder()
    recorder.record({ at: 1500, durationMs: 10, ok: true, outcome: '200' })
    recorder.record({ at: 200, durationMs: 20, ok: false, outcome: '500' })
    expect(recorder.timeline().map((b) => [b.second, b.requests, b.errors])).toEqual([
      [0, 1, 1],
      [1, 1, 0],
    ])
  })
})

describe('runPool', () => {
  it('runs every task once and never exceeds the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0
    const seen: number[] = []
    await runPool(
      50,
      7,
      async (i) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 1))
        seen.push(i)
        inFlight--
      },
      new AbortController().signal,
    )
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i))
    expect(peak).toBe(7)
  })

  it('stops starting tasks once aborted', async () => {
    const controller = new AbortController()
    let started = 0
    await runPool(
      100,
      2,
      async () => {
        if (++started === 4) controller.abort()
        await Promise.resolve()
      },
      controller.signal,
    )
    expect(started).toBeLessThan(10)
  })
})
