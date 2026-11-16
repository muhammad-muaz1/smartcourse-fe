import { useMutation, useQuery } from '@tanstack/react-query'
import { Activity, ExternalLink, Fingerprint, Gauge, Network, Rabbit, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Skeleton } from '@/components/ui/primitives'
import { failuresQuery } from '@/features/analytics/api'
import { healthQuery, versionQuery } from '@/features/system/api'
import { errorMessage, request } from '@/lib/api/client'
import { useSession } from '@/lib/api/session'
import { useInView } from '@/lib/hooks'
import { cn, fmt, timeAgo } from '@/lib/utils'
import { ScenarioSection, Verdict } from '../components'

const env = import.meta.env
const CONSOLES = [
  { name: 'Jaeger', what: 'Distributed traces — one publish is one span tree, browser to worker', url: env.VITE_JAEGER_URL ?? 'http://localhost:16686', icon: Network },
  { name: 'Grafana', what: 'Dashboards over Prometheus metrics', url: env.VITE_GRAFANA_URL ?? 'http://localhost:3001', icon: Gauge },
  { name: 'Prometheus', what: 'Raw metrics scraped from every /metrics', url: env.VITE_PROMETHEUS_URL ?? 'http://localhost:9090', icon: Activity },
  { name: 'Temporal UI', what: 'Workflow histories, retries and failures', url: env.VITE_TEMPORAL_UI_URL ?? 'http://localhost:8233', icon: Workflow },
  { name: 'RabbitMQ', what: 'Celery queues and consumers', url: env.VITE_RABBITMQ_URL ?? 'http://localhost:15672', icon: Rabbit },
] as const

function HealthGrid({ live }: { live: boolean }) {
  // Poll only while the panel is on screen; off-screen it would be invisible traffic.
  const health = useQuery(healthQuery(live ? 5_000 : false))
  const version = useQuery(versionQuery())
  if (health.isPending) return <Skeleton className="h-40 rounded-xl" />
  if (health.isError) {
    return <ul><Verdict pass={false}>Gateway unreachable: {errorMessage(health.error)}</Verdict></ul>
  }
  const { report, latencyMs } = health.data
  const entries = Object.entries(report.services)
  const healthy = report.status === 'ok'
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Badge tone={healthy ? 'success' : 'danger'} dot>{report.status}</Badge>
        <span className="text-xs text-zinc-500">
          gateway {version.data?.version ?? report.version}
          {version.data?.build_time && version.data.build_time !== 'unknown' && ` · built ${fmt.dateTime(version.data.build_time)}`} · answered in {fmt.ms(latencyMs)} ·{' '}
          {live ? 'refreshing every 5 s' : 'paused while off-screen'}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([name, dep]) => {
          const ok = dep.status === 'ok'
          return (
            <div key={name} className={cn('rounded-lg border px-3 py-2.5', ok ? 'border-zinc-200' : 'border-rose-200 bg-rose-50')}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-800">{name}</span>
                <Badge tone={ok ? 'success' : 'danger'}>{dep.status}</Badge>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {dep.latency_ms != null ? `${dep.latency_ms.toFixed(1)} ms` : '—'}
                {dep.detail && <span className="ml-1 text-rose-600">· {dep.detail}</span>}
              </div>
            </div>
          )
        })}
      </div>
      <ul className="mt-3">
        <Verdict pass={healthy}>
          {healthy ? `All ${entries.length} services and their dependencies report healthy` : `${entries.filter(([, d]) => d.status !== 'ok').length} dependency check(s) failing — visible here, not discovered by users`}
        </Verdict>
      </ul>
    </div>
  )
}

function FailureDiagnostics() {
  const isAdmin = useSession((s) => s.user?.role === 'admin')
  const failures = useQuery({ ...failuresQuery(), enabled: isAdmin })
  if (!isAdmin) {
    return (
      <p className="text-sm text-zinc-500">
        Sign in as an <strong>admin</strong> to see the failure ledger — every dead-lettered event and failed workflow, grouped by service and
        step. The injected publish failure from scenario 1 shows up there.
      </p>
    )
  }
  if (failures.isPending) return <Skeleton className="h-24" />
  if (failures.isError) return <p className="text-sm text-rose-600">{errorMessage(failures.error)}</p>
  const { total, groups } = failures.data.data
  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">{total} recorded · as of {timeAgo(failures.data.asOf)}</p>
      {groups.length === 0 ? <p className="text-sm text-zinc-500">No failures recorded.</p> : (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {groups.slice(0, 6).map((g) => (
            <li key={`${g.source}-${g.service}-${g.subject}`} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Badge tone={g.source === 'workflow' ? 'warning' : 'danger'}>{g.source}</Badge>
              <span className="text-zinc-700">{g.service}</span>
              <span className="flex-1 truncate font-mono text-xs text-zinc-500">{g.subject}</span>
              <span className="tabular-nums text-zinc-800">{g.count}×</span>
              <span className="text-xs text-zinc-400">{timeAgo(g.last_seen)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RequestTracer() {
  const tracer = useMutation({
    mutationFn: async () => {
      const res = await request('/courses', { query: { limit: 1 }, auth: false })
      return { requestId: res.requestId, ms: res.durationMs, status: res.status }
    },
  })
  const trace = tracer.data
  return (
    <div>
      <Button variant="secondary" size="sm" icon={<Fingerprint className="size-4" />} loading={tracer.isPending} onClick={() => tracer.mutate()}>
        Send a traced request
      </Button>
      {trace && (
        <div className="mt-3 rounded-lg bg-zinc-950 px-4 py-3 font-mono text-xs leading-6 text-zinc-300">
          <div>GET /api/v1/courses → <span className="text-emerald-400">{trace.status}</span> in {fmt.ms(trace.ms)}</div>
          <div>X-Request-ID: <span className="text-sky-300">{trace.requestId ?? '(not exposed)'}</span></div>
          <div className="text-zinc-500"># minted by the gateway, propagated to the service, stamped on every log line with trace_id</div>
        </div>
      )}
    </div>
  )
}

export function ObservabilityScenario() {
  const [healthRef, healthInView] = useInView<HTMLDivElement>()
  return (
    <ScenarioSection
      id="observability"
      number={5}
      problem="Weak observability and failure recovery"
      title="See every service, every failure, every request"
      mechanism={
        <>
          Every service exposes <code>/health</code> with a per-dependency breakdown, Prometheus metrics and OpenTelemetry traces propagated
          through Kafka headers and Temporal interceptors. Failures are first-class data: dead letters and failed workflows feed a queryable
          ledger, and idempotent retries make recovery safe to automate.
        </>
      }
    >
      <div className="space-y-8">
        <div ref={healthRef}>
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">Live platform health</h3>
          <HealthGrid live={healthInView} />
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-zinc-900">Failure ledger</h3>
            <FailureDiagnostics />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-zinc-900">Request correlation</h3>
            <RequestTracer />
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">Operations consoles</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {CONSOLES.map(({ name, what, url, icon: Icon }) => (
              <a key={name} href={url} target="_blank" rel="noreferrer" className="group rounded-xl border border-zinc-200 p-3 transition hover:border-brand-300 hover:shadow-sm">
                <div className="flex items-center justify-between">
                  <Icon className="size-4 text-brand-600" />
                  <ExternalLink className="size-3.5 text-zinc-300 group-hover:text-brand-500" />
                </div>
                <p className="mt-2 text-sm font-medium text-zinc-900">{name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{what}</p>
              </a>
            ))}
          </div>
        </div>
      </div>
    </ScenarioSection>
  )
}
