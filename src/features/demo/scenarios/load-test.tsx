import { Play, Square, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisProps, chart, tooltipStyle } from '@/components/charts/theme'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { API_PREFIX } from '@/lib/api/client'
import { fmt } from '@/lib/utils'
import { Metric, ScenarioSection, Verdict } from '../components'
import { runPool } from '../lib/pool'
import { LatencyRecorder, type SecondBucket, type Summary } from '../lib/stats'

const TARGETS = {
  catalogue: { label: 'GET /courses (catalogue page)', path: `${API_PREFIX}/courses?status=published&limit=20` },
  search: { label: 'GET /courses?q= (catalogue search)', path: `${API_PREFIX}/courses?status=published&q=a&limit=20` },
  health: { label: 'GET /health (gateway + every service)', path: '/health' },
} as const
type Target = keyof typeof TARGETS

const P95_SLO_MS = 500

/**
 * Time on the wire for one request: requestStart → responseEnd from Resource Timing.
 * This excludes the time the request sat in the browser's own queue waiting for one of
 * its few per-host connections — which is client-side, and would otherwise dominate.
 * Each request gets a unique URL so its entry can be found unambiguously.
 */
function wireTime(url: string): number | null {
  const entry = performance.getEntriesByName(new URL(url, location.origin).href).at(-1) as PerformanceResourceTiming | undefined
  if (!entry || entry.requestStart === 0) return null
  return entry.responseEnd - entry.requestStart
}
const SUCCESS_SLO = 0.999

interface K6Summary {
  requests: number
  rps: number
  failedRate: number
  p95: number
  p90: number
  med: number
  max: number
  vus: number | null
}

/** Parse `k6 run --summary-export=summary.json` output. */
function parseK6(json: unknown): K6Summary {
  const m = (json as { metrics?: Record<string, Record<string, number>> }).metrics
  const reqs = m?.http_reqs
  const dur = m?.http_req_duration
  if (!reqs || !dur) throw new Error('Not a k6 --summary-export file (missing http_reqs / http_req_duration)')
  return {
    requests: reqs.count ?? 0,
    rps: reqs.rate ?? 0,
    failedRate: m.http_req_failed?.value ?? m.http_req_failed?.rate ?? 0,
    p95: dur['p(95)'] ?? 0,
    p90: dur['p(90)'] ?? 0,
    med: dur.med ?? 0,
    max: dur.max ?? 0,
    vus: m.vus_max?.value ?? m.vus_max?.max ?? null,
  }
}

function LatencyChart({ timeline }: { timeline: SecondBucket[] }) {
  const rows = timeline.map((b) => ({ t: `${b.second}s`, p50: Math.round(b.p50), p95: Math.round(b.p95), rps: b.requests }))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <figure className="rounded-xl border border-zinc-200 p-4">
        <figcaption className="mb-2 text-xs font-medium text-zinc-600">Completed requests per second</figcaption>
        <div className="h-52">
          <ResponsiveContainer>
            <LineChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="t" {...axisProps} minTickGap={20} />
              <YAxis {...axisProps} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="rps" name="req/s" stroke={chart.series1} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <figure className="rounded-xl border border-zinc-200 p-4">
        <figcaption className="mb-2 text-xs font-medium text-zinc-600">Wire latency per second (ms)</figcaption>
        <div className="h-52">
          <ResponsiveContainer>
            <LineChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="t" {...axisProps} minTickGap={20} />
              <YAxis {...axisProps} />
              <Tooltip {...tooltipStyle} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, color: chart.textSecondary }} />
              <Line type="monotone" dataKey="p50" name="p50" stroke={chart.series1} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="p95" name="p95" stroke={chart.series2} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  )
}

export function LoadTestScenario() {
  const [target, setTarget] = useState<Target>('catalogue')
  const [total, setTotal] = useState(10_000)
  const [concurrency, setConcurrency] = useState(200)
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [queueP95, setQueueP95] = useState<number | null>(null)
  const [timeline, setTimeline] = useState<SecondBucket[]>([])
  const [k6, setK6] = useState<K6Summary | null>(null)
  const [k6Error, setK6Error] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  async function start() {
    const ctrl = new AbortController()
    controller.current = ctrl
    const recorder = new LatencyRecorder()
    const clientSide = new LatencyRecorder() // end-to-end as seen by JS, incl. browser queueing
    const base = TARGETS[target].path
    const separator = base.includes('?') ? '&' : '?'
    performance.clearResourceTimings()
    performance.setResourceTimingBufferSize(total + 500)
    const t0 = performance.now()
    setRunning(true)
    setSummary(null)
    setQueueP95(null)
    setTimeline([])

    // Pull snapshots on a timer: 10k setState calls would cost more than the requests.
    const tick = setInterval(() => {
      setSummary(recorder.summary(performance.now() - t0))
      setTimeline(recorder.timeline())
    }, 400)

    try {
      await runPool(total, concurrency, async (i, signal) => {
        const url = `${base}${separator}_r=${i}`
        const started = performance.now()
        let outcome: string
        let ok = false
        try {
          const response = await fetch(url, { signal, cache: 'no-store', headers: { Accept: 'application/json' } })
          await response.arrayBuffer() // measure the full response, not just headers
          outcome = String(response.status)
          ok = response.ok
        } catch (error) {
          if (signal.aborted) return
          outcome = error instanceof TypeError ? 'NETWORK_ERROR' : 'ERROR'
        }
        const finished = performance.now()
        const observed = finished - started
        recorder.record({ at: finished - t0, durationMs: wireTime(url) ?? observed, ok, outcome })
        clientSide.record({ at: finished - t0, durationMs: observed, ok, outcome })
      }, ctrl.signal)
    } finally {
      clearInterval(tick)
      performance.clearResourceTimings()
      setQueueP95(clientSide.summary().p95)
      setSummary(recorder.summary(performance.now() - t0))
      setTimeline(recorder.timeline())
      setRunning(false)
    }
  }

  async function importK6(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setK6(parseK6(JSON.parse(await file.text())))
      setK6Error(null)
    } catch (error) {
      setK6Error(error instanceof Error ? error.message : 'Could not read file')
    }
  }

  const done = summary && !running && summary.total > 0
  const successRate = summary && summary.total ? summary.ok / summary.total : 0

  return (
    <ScenarioSection
      id="load"
      number={3}
      problem="High latency under heavy traffic"
      title="10,000-request traffic burst"
      mechanism={
        <>
          Catalogue reads are served by the <strong>course</strong> service alone, behind a stateless gateway — no cross-service call on the request
          path, indexed Postgres queries, and Redis for hot reads. Fire a burst and watch throughput, tail latency and error rate live.
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <Field label="Endpoint">
          {(a) => (
            <Select {...a} value={target} onChange={(e) => setTarget(e.target.value as Target)} disabled={running}>
              {Object.entries(TARGETS).map(([key, t]) => <option key={key} value={key}>{t.label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Total requests">
          {(a) => <Input {...a} type="number" min={1} max={100_000} value={total} disabled={running} onChange={(e) => setTotal(Math.max(1, Math.min(100_000, Number(e.target.value) || 1)))} />}
        </Field>
        <Field label="Concurrency">
          {(a) => <Input {...a} type="number" min={1} max={2_000} value={concurrency} disabled={running} onChange={(e) => setConcurrency(Math.max(1, Math.min(2_000, Number(e.target.value) || 1)))} />}
        </Field>
        {running ? (
          <Button variant="danger" icon={<Square className="size-4" />} onClick={() => controller.current?.abort()}>Stop</Button>
        ) : (
          <Button icon={<Play className="size-4" />} onClick={() => void start()}>Run burst</Button>
        )}
      </div>

      <p className="mt-3 text-xs leading-5 text-zinc-500">
        Browser-driven: requests are dispatched {concurrency}-wide, but a browser sends them over a handful of connections per host. Latency is
        therefore measured <em>on the wire</em> (Resource Timing, request sent → response received: network, proxy, gateway and service) and
        excludes time queued inside the browser, which is reported separately. This measures sustained throughput, not 10k simultaneous sockets. For true 10k-concurrent load, run{' '}
        <code className="rounded bg-zinc-100 px-1">k6 run --summary-export=summary.json load-tests/catalogue-burst.js</code> and import the result below.
      </p>

      {summary && (
        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <Metric label="Completed" value={fmt.int(summary.total)} sub={`of ${fmt.int(total)}`} />
            <Metric label="Success" value={fmt.pct(successRate, 2)} sub={`${fmt.int(summary.failed)} failed`} />
            <Metric label="Throughput" value={`${summary.rps.toFixed(0)}/s`} />
            <Metric label="p50 (wire)" value={fmt.ms(summary.p50)} />
            <Metric label="p95 (wire)" value={fmt.ms(summary.p95)} />
            <Metric label="p99 (wire)" value={fmt.ms(summary.p99)} />
            <Metric label="Max" value={fmt.ms(summary.max)} />
            <Metric label="Elapsed" value={fmt.ms(summary.elapsedMs)} sub={queueP95 != null ? `p95 incl. browser queue ${fmt.ms(queueP95)}` : undefined} />
          </div>
          <LatencyChart timeline={timeline} />
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(summary.outcomes).map(([outcome, count]) => (
              <span key={outcome} className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-zinc-700">{outcome}: {fmt.int(count)}</span>
            ))}
          </div>
          {done && (
            <ul className="space-y-1.5">
              <Verdict pass={summary.total === total}>All {fmt.int(total)} requests completed ({fmt.int(summary.total)})</Verdict>
              <Verdict pass={successRate >= SUCCESS_SLO}>Success rate ≥ {fmt.pct(SUCCESS_SLO, 1)} (got {fmt.pct(successRate, 2)})</Verdict>
              <Verdict pass={summary.p95 <= P95_SLO_MS}>p95 wire latency ≤ {P95_SLO_MS} ms under sustained burst (got {fmt.ms(summary.p95)})</Verdict>
            </ul>
          )}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-dashed border-zinc-300 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-800">k6 server-side run</p>
            <p className="text-xs text-zinc-500">Import a <code>--summary-export</code> JSON from the scripts in <code>load-tests/</code>.</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50">
            <Upload className="size-4" /> Import summary
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void importK6(e)} />
          </label>
        </div>
        {k6Error && <p className="mt-3 text-sm text-rose-600">{k6Error}</p>}
        {k6 && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Metric label="Peak VUs" value={k6.vus != null ? fmt.int(k6.vus) : '—'} />
              <Metric label="Requests" value={fmt.int(k6.requests)} />
              <Metric label="Throughput" value={`${k6.rps.toFixed(0)}/s`} />
              <Metric label="Failed" value={fmt.pct(k6.failedRate, 2)} />
              <Metric label="median" value={fmt.ms(k6.med)} />
              <Metric label="p95" value={fmt.ms(k6.p95)} />
              <Metric label="Max" value={fmt.ms(k6.max)} />
            </div>
            <ul className="mt-4 space-y-1.5">
              <Verdict pass={k6.failedRate <= 1 - SUCCESS_SLO}>Error rate ≤ {fmt.pct(1 - SUCCESS_SLO, 1)}</Verdict>
              <Verdict pass={k6.p95 <= P95_SLO_MS}>p95 ≤ {P95_SLO_MS} ms at {k6.vus != null ? fmt.int(k6.vus) : '?'} concurrent users</Verdict>
            </ul>
          </>
        )}
      </div>
    </ScenarioSection>
  )
}
