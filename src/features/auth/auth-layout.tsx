import { BookOpen, CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

const POINTS = [
  'Publish courses through a recoverable, step-tracked workflow',
  'Enrollment that holds under launch-day traffic',
  'Analytics that tell you exactly how fresh they are',
]

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/courses" className="mb-10 flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-brand-600 text-white">
              <BookOpen className="size-4" />
            </span>
            <span className="text-base font-semibold">SmartCourse</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-zinc-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-zinc-950 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,var(--color-brand-600),transparent_55%)] opacity-60" />
        <div className="relative flex h-full flex-col justify-end p-14 text-white">
          <p className="max-w-md text-3xl leading-tight font-semibold tracking-tight">
            Course delivery built for consistency, throughput and recovery.
          </p>
          <ul className="mt-8 space-y-3">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-zinc-300">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-300" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
