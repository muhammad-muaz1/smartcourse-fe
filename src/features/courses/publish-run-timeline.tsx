import { CheckCircle2, Circle, ExternalLink, Loader2, XCircle } from 'lucide-react'
import type { PublishRun, PublishStep } from '@/lib/api/types'
import { cn, durationBetween, fmt } from '@/lib/utils'
import { RunStatusBadge } from '@/components/ui/status'

const TEMPORAL_UI = (import.meta.env.VITE_TEMPORAL_UI_URL as string | undefined) ?? 'http://localhost:8233'

function temporalWorkflowUrl(workflowId: string): string {
  return `${TEMPORAL_UI}/namespaces/default/workflows/${encodeURIComponent(workflowId)}`
}

const STEP_LABELS: Record<string, string> = {
  validate: 'Validate content tree',
  mark_published: 'Mark ready + emit course.published',
}

function StepIcon({ step }: { step: PublishStep }) {
  switch (step.status) {
    case 'succeeded':
      return <CheckCircle2 className="size-5 text-emerald-500" />
    case 'failed':
      return <XCircle className="size-5 text-rose-500" />
    case 'running':
      return <Loader2 className="size-5 animate-spin text-sky-500" />
    default:
      return <Circle className="size-5 text-zinc-300" />
  }
}

/** One publish saga run: per-step status from the run row, plus a deep link into Temporal. */
export function PublishRunTimeline({ run, compact = false }: { run: PublishRun; compact?: boolean }) {
  const total = durationBetween(run.started_at ?? run.created_at, run.finished_at)
  return (
    <div className={cn('rounded-xl border border-zinc-200 bg-white', compact ? 'p-4' : 'p-5')}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RunStatusBadge status={run.status} />
          <span className="text-xs text-zinc-500">
            {fmt.dateTime(run.created_at)}
            {total != null && ` · ${fmt.ms(total)} end-to-end`}
          </span>
        </div>
        <a
          href={temporalWorkflowUrl(run.workflow_id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400 hover:text-brand-600"
          title="Open workflow history in Temporal UI"
        >
          {run.workflow_id.slice(0, 28)}… <ExternalLink className="size-3" />
        </a>
      </div>
      <ol className="space-y-3">
        {run.steps.map((step) => {
          const took = durationBetween(step.started_at, step.finished_at)
          return (
            <li key={step.name} className="flex items-center gap-3">
              <StepIcon step={step} />
              <span className="flex-1 text-sm text-zinc-800">{STEP_LABELS[step.name] ?? step.name}</span>
              <span className="text-xs tabular-nums text-zinc-400">{took != null ? fmt.ms(took) : step.status}</span>
            </li>
          )
        })}
      </ol>
      {run.status === 'failed' && (
        <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <span className="font-medium">Failed at “{run.failed_step}”.</span> {run.error}
          <p className="mt-1 text-xs text-rose-600">
            Compensated: the course was rolled back to <code>failed</code> and nothing reached the catalogue. Fix and republish.
          </p>
        </div>
      )}
    </div>
  )
}
