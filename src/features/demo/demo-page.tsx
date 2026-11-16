import { ArrowRight, ShieldAlert } from 'lucide-react'
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { Card, PageHeader } from '@/components/ui/primitives'
import { useDocumentTitle } from '@/lib/hooks'
import { EnrollmentRaceScenario } from './scenarios/enrollment-race'
import { LoadTestScenario } from './scenarios/load-test'
import { ObservabilityScenario } from './scenarios/observability'
import { PublishingScenario } from './scenarios/publishing'

const PROBLEMS = [
  { n: 1, problem: 'Slow and manual content publishing workflows', proof: 'One-click Temporal saga with step tracking; fault injection shows compensation and recovery.', anchor: 'publishing' },
  { n: 2, problem: 'Data inconsistency across course, enrollment and analytics', proof: 'Same-second rush: seat count, learning roster and analytics projection must agree.', anchor: 'race' },
  { n: 3, problem: 'High latency under heavy traffic', proof: '10,000-request burst with live p50/p95/p99 and error rate; k6 import for server-side concurrency.', anchor: 'load' },
  { n: 4, problem: 'Lack of reliable background processing', proof: 'Every enrollment fans out to notification and analytics consumers — counted, timed and verified.', anchor: 'race' },
  { n: 5, problem: 'Weak observability and failure recovery', proof: 'Live per-dependency health, failure ledger, request correlation and links to every console.', anchor: 'observability' },
]

export default function DemoPage() {
  useDocumentTitle('Platform demo')
  const { hash } = useLocation()

  // Deep links such as /demo#observability land on the section once it has rendered.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }, [hash])

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Backend proof"
        title="SmartCourse platform demo"
        description="Each scenario drives the real backend through the gateway and asserts the outcome — no mocks, no canned numbers."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {PROBLEMS.map((p) => (
          <Card key={p.n} className="transition hover:-translate-y-px hover:shadow-md">
            <a href={`#${p.anchor}`} className="group flex h-full flex-col p-5">
              <span className="text-[11px] font-semibold text-rose-600">Problem {p.n}</span>
              <span className="mt-1 text-sm font-medium text-zinc-900">{p.problem}</span>
              <span className="mt-2 flex-1 text-xs leading-5 text-zinc-500">{p.proof}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 group-hover:gap-1.5">
                See the proof <ArrowRight className="size-3" />
              </span>
            </a>
          </Card>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          Scenarios create real accounts (<code>@example.com</code>), courses and enrollments, and the burst test generates heavy load. Run them
          against a <strong>local or dev</strong> environment only — never production or a client environment.
        </p>
      </div>

      <PublishingScenario />
      <EnrollmentRaceScenario />
      <LoadTestScenario />
      <ObservabilityScenario />
    </div>
  )
}
