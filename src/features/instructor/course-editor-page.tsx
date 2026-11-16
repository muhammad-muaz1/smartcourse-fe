import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArrowLeft, ExternalLink, EyeOff, Rocket, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState, ErrorState, PageSpinner, ProgressBar, Skeleton, StatTile } from '@/components/ui/primitives'
import { CourseStatusBadge, EnrollmentStatusBadge } from '@/components/ui/status'
import { courseDashboardQuery } from '@/features/analytics/api'
import { coursesApi, courseKeys, courseQuery, publishRunsQuery } from '@/features/courses/api'
import { PublishRunTimeline } from '@/features/courses/publish-run-timeline'
import { rosterQuery } from '@/features/learning/api'
import type { CourseDetail } from '@/lib/api/types'
import { useDocumentTitle } from '@/lib/hooks'
import { useIdempotentMutation } from '@/lib/use-idempotent-mutation'
import { cn, fmt, timeAgo } from '@/lib/utils'
import { CourseForm } from './course-form'
import { CurriculumEditor } from './curriculum-editor'

const TABS = ['Curriculum', 'Settings', 'Publishing', 'Students', 'Insights'] as const
type Tab = (typeof TABS)[number]

function PublishingTab({ courseId }: { courseId: string }) {
  const runs = useQuery(publishRunsQuery(courseId))
  if (runs.isPending) return <Skeleton className="h-40 rounded-xl" />
  if (runs.isError) return <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
  if (runs.data.length === 0) {
    return <Card><EmptyState icon={<Rocket className="size-5" />} title="Never published" description="Each publish runs as a durable Temporal workflow; its steps will appear here." /></Card>
  }
  return <div className="space-y-4">{runs.data.map((run) => <PublishRunTimeline key={run.id} run={run} />)}</div>
}

function StudentsTab({ courseId }: { courseId: string }) {
  const roster = useInfiniteQuery(rosterQuery(courseId))
  const rows = useMemo(() => roster.data?.pages.flatMap((p) => p.items) ?? [], [roster.data])
  if (roster.isPending) return <Skeleton className="h-40 rounded-xl" />
  if (roster.isError) {
    return <ErrorState error={roster.error} onRetry={() => void roster.refetch()} />
  }
  return (
    <Card>
      <CardHeader title="Roster" description="Served by the learning service; names are snapshots taken at enrollment." />
      {rows.length === 0 ? (
        <EmptyState icon={<Users className="size-5" />} title="No students yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr className="border-b border-zinc-100">
                <th className="px-5 py-2.5 font-medium">Student</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Progress</th>
                <th className="px-5 py-2.5 font-medium">Enrolled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-3 font-medium text-zinc-900">{e.student_name ?? e.student_id.slice(0, 8)}</td>
                  <td className="px-5 py-3"><EnrollmentStatusBadge status={e.status} /></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2"><ProgressBar value={e.progress_percent} className="w-24" /><span className="text-xs tabular-nums text-zinc-500">{Math.round(e.progress_percent)}%</span></div>
                  </td>
                  <td className="px-5 py-3 text-zinc-500">{timeAgo(e.enrolled_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {roster.hasNextPage && (
            <div className="flex justify-center p-4"><Button variant="secondary" size="sm" loading={roster.isFetchingNextPage} onClick={() => void roster.fetchNextPage()}>Load more</Button></div>
          )}
        </div>
      )}
    </Card>
  )
}

function InsightsTab({ courseId }: { courseId: string }) {
  const dash = useQuery(courseDashboardQuery(courseId))
  if (dash.isPending) return <div className="grid gap-4 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
  if (dash.isError) return <ErrorState error={dash.error} onRetry={() => void dash.refetch()} />
  const d = dash.data.data
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Enrollments" value={fmt.int(d.enrollments)} hint={`${d.active} active · ${d.withdrawn} withdrawn`} />
        <StatTile label="Completed" value={fmt.int(d.completed)} tone="success" />
        <StatTile label="Completion rate" value={fmt.pct(d.completion_rate)} tone="brand" />
        <StatTile label="Avg. time to complete" value={d.average_hours_to_complete != null ? `${d.average_hours_to_complete.toFixed(1)} h` : '—'} />
      </div>
      <p className="mt-3 text-xs text-zinc-400">Projection as of {fmt.dateTime(dash.data.asOf)} — eventually consistent with the roster.</p>
    </>
  )
}

function Actions({ course }: { course: CourseDetail }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const refresh = () => queryClient.invalidateQueries({ queryKey: courseKeys.all })

  const publish = useIdempotentMutation((_: void, key) => coursesApi.publish(course.id, key), {
    onSuccess: () => {
      void refresh()
      void queryClient.invalidateQueries({ queryKey: courseKeys.publishRuns(course.id) })
    },
    meta: { successMessage: 'Publish workflow started' },
  })
  const unpublish = useMutation({ mutationFn: () => coursesApi.unpublish(course.id), onSuccess: refresh, meta: { successMessage: 'Withdrawn from catalogue' } })
  const archive = useMutation({
    mutationFn: () => coursesApi.archive(course.id),
    onSuccess: () => { void refresh(); navigate('/instructor/courses') },
    meta: { successMessage: 'Course archived' },
  })

  return (
    <div className="flex flex-wrap items-center gap-2">
      {course.status === 'published' && (
        <Link to={`/courses/${course.id}`} target="_blank"><Button variant="ghost" size="sm" icon={<ExternalLink className="size-4" />}>View live</Button></Link>
      )}
      {course.status !== 'archived' && (
        <Button variant="ghost" size="sm" icon={<Archive className="size-4" />} loading={archive.isPending}
          onClick={() => confirm('Archive this course? It will leave the catalogue permanently.') && archive.mutate()}>Archive</Button>
      )}
      {course.status === 'published' && (
        <Button variant="secondary" icon={<EyeOff className="size-4" />} loading={unpublish.isPending} onClick={() => unpublish.mutate()}>Unpublish</Button>
      )}
      {(course.status === 'draft' || course.status === 'failed' || course.status === 'publishing') && (
        <Button icon={<Rocket className="size-4" />} loading={publish.isPending || course.status === 'publishing'} onClick={() => publish.mutate()}>
          {course.status === 'publishing' ? 'Publishing…' : course.status === 'failed' ? 'Retry publish' : 'Publish'}
        </Button>
      )}
    </div>
  )
}

export default function CourseEditorPage() {
  const { courseId = '' } = useParams()
  const [tab, setTab] = useState<Tab>('Curriculum')
  const queryClient = useQueryClient()
  // While a publish is in flight, poll the course so the status flips without a reload.
  const course = useQuery({ ...courseQuery(courseId), refetchInterval: (q) => (q.state.data?.status === 'publishing' ? 1_500 : false) })
  useDocumentTitle(course.data?.title)

  const update = useMutation({
    mutationFn: (input: Parameters<typeof coursesApi.update>[1]) => coursesApi.update(courseId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: courseKeys.all }),
    meta: { successMessage: 'Course updated' },
  })

  if (course.isPending) return <PageSpinner />
  if (course.isError) return <ErrorState error={course.error} onRetry={() => void course.refetch()} />
  const c = course.data
  const contentEditable = c.status === 'draft' || c.status === 'failed'

  return (
    <div className="animate-fade-in">
      <Link to="/instructor/courses" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800">
        <ArrowLeft className="size-4" /> My courses
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">{c.title}</h1><CourseStatusBadge status={c.status} /></div>
          <p className="mt-1 text-sm text-zinc-500">Updated {timeAgo(c.updated_at)}{c.published_at && ` · Published ${timeAgo(c.published_at)}`}</p>
        </div>
        <Actions course={c} />
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-zinc-200" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn('-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition', tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-zinc-500 hover:text-zinc-800')}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Curriculum' && (
        <>
          {!contentEditable && (
            <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Content is read-only while the course is <strong>{c.status}</strong>.
              {c.status === 'published' && ' Unpublish it to make changes, then publish again.'}
            </div>
          )}
          <CurriculumEditor courseId={c.id} editable={contentEditable} />
        </>
      )}
      {tab === 'Settings' && (
        <Card className="max-w-2xl p-6">
          <CourseForm
            key={c.updated_at}
            initial={c}
            submitLabel="Save changes"
            disabled={c.status === 'publishing' || c.status === 'archived'}
            onSubmit={(input) => update.mutateAsync(input)}
          />
        </Card>
      )}
      {tab === 'Publishing' && <PublishingTab courseId={c.id} />}
      {tab === 'Students' && (c.status === 'draft' && !c.published_at ? <Card><EmptyState title="Publish the course to open enrollment" /></Card> : <StudentsTab courseId={c.id} />)}
      {tab === 'Insights' && <InsightsTab courseId={c.id} />}
    </div>
  )
}
