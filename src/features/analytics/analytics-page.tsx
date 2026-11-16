import { useQuery } from '@tanstack/react-query'
import { AlertOctagon, BookCheck, GraduationCap, Presentation, Timer, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisProps, chart, tooltipStyle } from '@/components/charts/theme'
import { Select } from '@/components/ui/form'
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatTile } from '@/components/ui/primitives'
import { courseOptionsQuery } from '@/features/courses/api'
import { errorMessage } from '@/lib/api/client'
import { useSession } from '@/lib/api/session'
import type { Granularity, Period } from '@/lib/api/types'
import { useDocumentTitle } from '@/lib/hooks'
import { fmt, timeAgo } from '@/lib/utils'
import {
  completionQuery,
  courseLoadQuery,
  enrollmentSeriesQuery,
  failuresQuery,
  overviewQuery,
  popularQuery,
  timeToCompleteQuery,
} from './api'

function AsOf({ value }: { value: string | null | undefined }) {
  return <span className="text-[11px] text-zinc-400" title={value ?? undefined}>as of {value ? timeAgo(value) : '—'}</span>
}

const RANGE_DAYS: Record<Granularity, number> = { day: 30, week: 7 * 16, month: 365 }

function EnrollmentsChart({ courseId, enabled }: { courseId?: string; enabled: boolean }) {
  const [granularity, setGranularity] = useState<Granularity>('day')
  const series = useQuery({ ...enrollmentSeriesQuery(granularity, RANGE_DAYS[granularity], courseId), enabled, placeholderData: (prev) => prev })
  const rows = useMemo(
    () => series.data?.data.buckets.map((b) => ({ label: fmt.shortDate(b.period_start), enrollments: b.enrollments })) ?? [],
    [series.data],
  )
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="New enrollments over time"
        description={<AsOf value={series.data?.asOf} />}
        action={
          <Select value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)} className="h-8 w-28 text-xs" aria-label="Granularity">
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </Select>
        }
      />
      <div className="h-72 p-4">
        {!enabled ? <EmptyState title="Create and publish a course to see its enrollments" /> : series.isPending ? <Skeleton className="size-full" /> : series.isError ? <ErrorState error={series.error} /> : rows.length === 0 ? (
          <EmptyState title="No enrollments in this range" />
        ) : (
          <ResponsiveContainer>
            <AreaChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="enrollFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chart.series1} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={chart.series1} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} minTickGap={24} />
              <YAxis {...axisProps} allowDecimals={false} />
              <Tooltip {...tooltipStyle} cursor={{ stroke: chart.axis, strokeDasharray: '3 3' }} />
              <Area type="monotone" dataKey="enrollments" name="Enrollments" stroke={chart.series1} strokeWidth={2} fill="url(#enrollFill)" activeDot={{ r: 4, strokeWidth: 2, stroke: chart.surface }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

function PopularCourses() {
  const [period, setPeriod] = useState<Period>('30d')
  const popular = useQuery(popularQuery(period))
  const rows = popular.data?.data.items ?? []
  return (
    <Card>
      <CardHeader
        title="Most popular courses"
        description={<AsOf value={popular.data?.asOf} />}
        action={
          <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="h-8 w-28 text-xs" aria-label="Period">
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
            <option value="all">All time</option>
          </Select>
        }
      />
      <div className="h-72 p-4">
        {popular.isPending ? <Skeleton className="size-full" /> : popular.isError ? <ErrorState error={popular.error} /> : rows.length === 0 ? (
          <EmptyState title="No enrollments yet" />
        ) : (
          <ResponsiveContainer>
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="title" width={120} {...axisProps} tickFormatter={(t: string) => (t.length > 18 ? `${t.slice(0, 17)}…` : t)} />
              <Tooltip {...tooltipStyle} cursor={{ fill: '#f4f4f5' }} />
              <Bar dataKey="enrollments" name="Enrollments" fill={chart.series1} radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fill: chart.textSecondary, fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

function FailuresPanel() {
  const failures = useQuery(failuresQuery())
  return (
    <Card>
      <CardHeader title="Failed events & workflow issues" description={<AsOf value={failures.data?.asOf} />} action={failures.data && <Badge tone={failures.data.data.total ? 'danger' : 'success'}>{failures.data.data.total} total</Badge>} />
      {failures.isPending ? <Skeleton className="m-4 h-32" /> : failures.isError ? <ErrorState error={failures.error} /> : failures.data.data.recent.length === 0 ? (
        <EmptyState icon={<AlertOctagon className="size-5" />} title="No failures recorded" description="Dead letters and failed workflows from every service land here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr className="border-b border-zinc-100">
                <th className="px-5 py-2 font-medium">When</th><th className="px-5 py-2 font-medium">Source</th><th className="px-5 py-2 font-medium">Service</th><th className="px-5 py-2 font-medium">Subject / step</th><th className="px-5 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {failures.data.data.recent.map((f) => (
                <tr key={f.id} className="align-top">
                  <td className="px-5 py-2.5 whitespace-nowrap text-zinc-500">{timeAgo(f.occurred_at)}</td>
                  <td className="px-5 py-2.5"><Badge tone={f.source === 'workflow' ? 'warning' : 'danger'}>{f.source}</Badge></td>
                  <td className="px-5 py-2.5 text-zinc-700">{f.service}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-zinc-600">{f.subject}{f.step && ` · ${f.step}`}</td>
                  <td className="max-w-md px-5 py-2.5 text-zinc-600">{f.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export default function AnalyticsPage() {
  useDocumentTitle('Analytics')
  const user = useSession((s) => s.user!)
  const isAdmin = user.role === 'admin'
  const [selected, setSelected] = useState<string>('')
  const courses = useQuery(courseOptionsQuery(user))
  // Platform-wide figures are admin-only; an instructor always views one of their own
  // courses, defaulting to the first.
  const courseId = selected || (isAdmin ? undefined : courses.data?.[0]?.id)
  const scoped = isAdmin || !!courseId
  const overview = useQuery(overviewQuery())
  const completion = useQuery({ ...completionQuery(courseId), enabled: scoped, placeholderData: (prev) => prev })
  const ttc = useQuery({ ...timeToCompleteQuery(courseId), enabled: scoped, placeholderData: (prev) => prev })
  const load = useQuery({ ...courseLoadQuery(), enabled: isAdmin })
  const o = overview.data?.data

  return (
    <>
      <PageHeader
        title="Platform analytics"
        description="Projections built from the event log. Each panel shows how fresh it is — numbers trail live state by seconds, visibly rather than silently."
        actions={
          <Select value={courseId ?? ''} onChange={(e) => setSelected(e.target.value)} className="w-72" aria-label="Scope metrics to a course" disabled={!isAdmin && !courses.data?.length}>
            {isAdmin ? <option value="">All courses</option> : !courses.data?.length && <option value="">No courses yet</option>}
            {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
        }
      />

      {overview.isError ? <ErrorState error={overview.error} onRetry={() => void overview.refetch()} /> : (
        <div className="mb-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Students" icon={<GraduationCap className="size-4" />} value={o ? fmt.int(o.total_students) : <Skeleton className="h-8 w-16" />} />
          <StatTile label="Instructors" icon={<Presentation className="size-4" />} value={o ? fmt.int(o.total_instructors) : <Skeleton className="h-8 w-16" />} />
          <StatTile label="Courses published" icon={<BookCheck className="size-4" />} value={o ? fmt.int(o.total_courses_published) : <Skeleton className="h-8 w-16" />} />
          <StatTile label="Enrollments" icon={<Users className="size-4" />} value={o ? fmt.int(o.total_enrollments) : <Skeleton className="h-8 w-16" />} hint={<AsOf value={overview.data?.asOf} />} />
        </div>
      )}

      <div className="mb-6 grid gap-5 lg:grid-cols-3">
        <EnrollmentsChart courseId={courseId} enabled={scoped} />
        <div className="grid gap-5">
          <StatTile label={courseId ? 'Completion rate · this course' : 'Course completion rate'} tone="brand"
            value={completion.data ? fmt.pct(completion.data.data.completion_rate) : '—'}
            hint={completion.isError ? errorMessage(completion.error) : completion.data && `${fmt.int(completion.data.data.completed)} of ${fmt.int(completion.data.data.enrollments)} enrollments`} />
          <StatTile label="Avg. time to complete" icon={<Timer className="size-4" />}
            value={ttc.data?.data.average_days != null ? `${ttc.data.data.average_days.toFixed(1)} days` : '—'}
            hint={ttc.isError ? errorMessage(ttc.error) : ttc.data && (ttc.data.data.completed ? `across ${fmt.int(ttc.data.data.completed)} completions` : 'no completions yet')} />
          {isAdmin && (
            <StatTile label="Avg. courses per student" value={load.data ? load.data.data.average_per_enrolled_student.toFixed(2) : '—'}
              hint={load.data && `${load.data.data.average_per_registered_student.toFixed(2)} across all registered students`} />
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <PopularCourses />
        {isAdmin ? <FailuresPanel /> : (
          <Card className="flex items-center"><EmptyState icon={<AlertOctagon className="size-5" />} title="Failure diagnostics are admin-only" description="Failed events and workflow issues are visible to platform admins." /></Card>
        )}
      </div>
    </>
  )
}
