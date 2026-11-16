import { queryOptions } from '@tanstack/react-query'
import { request } from '@/lib/api/client'
import type {
  CompletionStats,
  CourseDashboard,
  CourseLoad,
  EnrollmentSeries,
  FailureSummary,
  Granularity,
  Overview,
  Period,
  PopularCourses,
  TimeToComplete,
} from '@/lib/api/types'

/**
 * Every analytics read is a projection: eventually consistent and stamped with
 * `meta.as_of`. Queries return `{ data, asOf }` so the UI can always show the lag
 * instead of implying real-time.
 */
export interface Projection<T> {
  data: T
  asOf: string | null
}

async function projection<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
  options: { signal?: AbortSignal; token?: string } = {},
): Promise<Projection<T>> {
  const result = await request<T>(path, { query, ...options })
  return { data: result.data, asOf: result.meta?.as_of ?? null }
}

export const analyticsKeys = {
  all: ['analytics'] as const,
  overview: () => [...analyticsKeys.all, 'overview'] as const,
  enrollments: (granularity: Granularity, days: number, courseId?: string) =>
    [...analyticsKeys.all, 'enrollments', granularity, days, courseId] as const,
  completion: (courseId?: string) => [...analyticsKeys.all, 'completion', courseId] as const,
  timeToComplete: (courseId?: string) => [...analyticsKeys.all, 'ttc', courseId] as const,
  popular: (period: Period) => [...analyticsKeys.all, 'popular', period] as const,
  courseLoad: () => [...analyticsKeys.all, 'course-load'] as const,
  course: (id: string) => [...analyticsKeys.all, 'course', id] as const,
  failures: () => [...analyticsKeys.all, 'failures'] as const,
}

export const analyticsApi = {
  overview: (signal?: AbortSignal) => projection<Overview>('/analytics/overview', undefined, { signal }),
  enrollments: (granularity: Granularity, from?: string, courseId?: string, signal?: AbortSignal) =>
    projection<EnrollmentSeries>('/analytics/enrollments', { granularity, from, course_id: courseId }, { signal }),
  completion: (courseId?: string, signal?: AbortSignal) =>
    projection<CompletionStats>('/analytics/completion', { course_id: courseId }, { signal }),
  timeToComplete: (courseId?: string, signal?: AbortSignal) =>
    projection<TimeToComplete>('/analytics/time-to-complete', { course_id: courseId }, { signal }),
  popular: (period: Period, signal?: AbortSignal) =>
    projection<PopularCourses>('/analytics/courses/popular', { period, limit: 8 }, { signal }),
  courseLoad: (signal?: AbortSignal) =>
    projection<CourseLoad>('/analytics/students/course-load', undefined, { signal }),
  course: (id: string, options: { signal?: AbortSignal; token?: string } = {}) =>
    projection<CourseDashboard>(`/analytics/courses/${id}`, undefined, options),
  failures: (signal?: AbortSignal) =>
    projection<FailureSummary>('/analytics/failures', { recent: 20 }, { signal }),
}

const STALE = 30_000

export const overviewQuery = () =>
  queryOptions({ queryKey: analyticsKeys.overview(), queryFn: ({ signal }) => analyticsApi.overview(signal), staleTime: STALE })

/** Trailing window of `days`, resolved at fetch time so the key stays stable across renders. */
export const enrollmentSeriesQuery = (granularity: Granularity, days: number, courseId?: string) =>
  queryOptions({
    queryKey: analyticsKeys.enrollments(granularity, days, courseId),
    queryFn: ({ signal }) =>
      analyticsApi.enrollments(granularity, new Date(Date.now() - days * 86_400_000).toISOString(), courseId, signal),
    staleTime: STALE,
  })

export const completionQuery = (courseId?: string) =>
  queryOptions({
    queryKey: analyticsKeys.completion(courseId),
    queryFn: ({ signal }) => analyticsApi.completion(courseId, signal),
    staleTime: STALE,
  })

export const timeToCompleteQuery = (courseId?: string) =>
  queryOptions({
    queryKey: analyticsKeys.timeToComplete(courseId),
    queryFn: ({ signal }) => analyticsApi.timeToComplete(courseId, signal),
    staleTime: STALE,
  })

export const popularQuery = (period: Period) =>
  queryOptions({
    queryKey: analyticsKeys.popular(period),
    queryFn: ({ signal }) => analyticsApi.popular(period, signal),
    staleTime: STALE,
  })

export const courseLoadQuery = () =>
  queryOptions({ queryKey: analyticsKeys.courseLoad(), queryFn: ({ signal }) => analyticsApi.courseLoad(signal), staleTime: STALE })

export const courseDashboardQuery = (id: string) =>
  queryOptions({ queryKey: analyticsKeys.course(id), queryFn: ({ signal }) => analyticsApi.course(id, { signal }), staleTime: STALE })

export const failuresQuery = () =>
  queryOptions({ queryKey: analyticsKeys.failures(), queryFn: ({ signal }) => analyticsApi.failures(signal), staleTime: 10_000 })
