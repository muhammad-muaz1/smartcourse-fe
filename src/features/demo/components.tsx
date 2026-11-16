import { CheckCircle2, Circle, CircleSlash, Loader2, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/primitives'
import { cn, fmt } from '@/lib/utils'
import type { Step } from './lib/use-steps'

export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s) => {
        const took = s.startedAt != null && s.finishedAt != null ? s.finishedAt - s.startedAt : null
        return (
          <li key={s.id} className="flex items-start gap-3">
            <span className="mt-0.5">
              {s.state === 'done' ? <CheckCircle2 className="size-4 text-emerald-500" />
                : s.state === 'failed' ? <XCircle className="size-4 text-rose-500" />
                : s.state === 'running' ? <Loader2 className="size-4 animate-spin text-sky-500" />
                : s.state === 'skipped' ? <CircleSlash className="size-4 text-zinc-300" />
                : <Circle className="size-4 text-zinc-300" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn('text-sm', s.state === 'idle' || s.state === 'skipped' ? 'text-zinc-400' : 'text-zinc-800')}>{s.label}</span>
                {took != null && <span className="text-xs tabular-nums text-zinc-400">{fmt.ms(took)}</span>}
              </div>
              {s.detail && <p className={cn('mt-0.5 text-xs', s.state === 'failed' ? 'text-rose-600' : 'text-zinc-500')}>{s.detail}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** A single pass/fail assertion — icon + words, never colour alone. */
export function Verdict({ pass, children, pending = false }: { pass: boolean; children: ReactNode; pending?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {pending ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-zinc-400" />
        : pass ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
        : <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />}
      <span className={cn(pending ? 'text-zinc-500' : 'text-zinc-800')}>
        <span className="sr-only">{pending ? 'Pending: ' : pass ? 'Pass: ' : 'Fail: '}</span>
        {children}
      </span>
    </li>
  )
}

export function Metric({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
      <div className="text-[11px] font-medium text-zinc-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">{value}</div>
      {sub && <div className="text-[11px] text-zinc-500">{sub}</div>}
    </div>
  )
}

export function ScenarioSection({
  id,
  number,
  problem,
  title,
  mechanism,
  children,
}: {
  id: string
  number: number
  problem: string
  title: string
  /** How the backend addresses the problem — the claim this scenario proves. */
  mechanism: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card className="overflow-hidden">
        <div className="border-b border-zinc-100 bg-gradient-to-r from-zinc-50 to-white px-6 py-5">
          <div className="flex items-center gap-2 text-xs font-medium text-rose-600">
            <span className="grid size-5 place-items-center rounded-full bg-rose-100 text-[10px] font-bold">{number}</span>
            Problem: {problem}
          </div>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-zinc-900">{title}</h2>
          <div className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{mechanism}</div>
        </div>
        <div className="p-6">{children}</div>
      </Card>
    </section>
  )
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p>
}
