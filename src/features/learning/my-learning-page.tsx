import { useInfiniteQuery } from '@tanstack/react-query'
import { GraduationCap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton } from '@/components/ui/primitives'
import { EnrollmentStatusBadge } from '@/components/ui/status'
import { coverGradient } from '@/features/courses/cover'
import { useSession } from '@/lib/api/session'
import { useDocumentTitle } from '@/lib/hooks'
import { cn, timeAgo } from '@/lib/utils'
import { enrollmentHistoryQuery, myEnrollmentsQuery } from './api'

type Tab = 'active' | 'completed' | 'history'
const TABS: { value: Tab; label: string }[] = [
  { value: 'active', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'history', label: 'History' },
]

export default function MyLearningPage() {
  useDocumentTitle('My learning')
  const userId = useSession((s) => s.user!.id)
  const [status, setStatus] = useState<Tab>('active')
  // History comes from its own endpoint: it is the only list that includes withdrawals.
  const current = useInfiniteQuery({ ...myEnrollmentsQuery(status === 'history' ? undefined : status), enabled: status !== 'history' })
  const history = useInfiniteQuery({ ...enrollmentHistoryQuery(userId), enabled: status === 'history' })
  const query = status === 'history' ? history : current
  const enrollments = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data])

  return (
    <>
      <PageHeader title="My learning" description="Pick up where you left off." />

      <div className="mb-5 inline-flex rounded-lg bg-zinc-100 p-1" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            role="tab"
            aria-selected={status === tab.value}
            onClick={() => setStatus(tab.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              status === tab.value ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : enrollments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GraduationCap className="size-5" />}
            title="Nothing here yet"
            description="Find a course in the catalogue and enroll to get started."
            action={<Link to="/courses"><Button>Browse catalogue</Button></Link>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {enrollments.map((e) => (
            <Link key={e.id} to={e.status === 'withdrawn' ? `/courses/${e.course_id}` : `/learning/${e.id}`} className="block">
              <Card className="flex items-center gap-5 p-4 transition hover:shadow-md">
                <div className={`hidden size-16 shrink-0 rounded-lg bg-gradient-to-br sm:block ${coverGradient(e.course_id)}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium text-zinc-900">{e.course_title}</h3>
                    <EnrollmentStatusBadge status={e.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Enrolled {timeAgo(e.enrolled_at)} · {e.lessons_completed}/{e.lessons_total} lessons
                    {e.withdrawn_at && ` · withdrew ${timeAgo(e.withdrawn_at)}`}
                    {e.completed_at && ` · completed ${timeAgo(e.completed_at)}`}
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <ProgressBar value={e.progress_percent} className="max-w-md" />
                    <span className="text-xs font-medium tabular-nums text-zinc-600">{Math.round(e.progress_percent)}%</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          {query.hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
