import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api, newIdempotencyKey, request } from '@/lib/api/client'
import type { CursorPage, Enrollment, EnrollmentStatus, Progress } from '@/lib/api/types'

export const learningKeys = {
  all: ['learning'] as const,
  mineAll: () => [...learningKeys.all, 'mine'] as const,
  mine: (status?: EnrollmentStatus) => [...learningKeys.mineAll(), status ?? 'any'] as const,
  enrollment: (id: string) => [...learningKeys.all, 'enrollment', id] as const,
  progress: (id: string) => [...learningKeys.all, 'progress', id] as const,
  roster: (courseId: string) => [...learningKeys.all, 'roster', courseId] as const,
  history: (userId: string) => [...learningKeys.all, 'history', userId] as const,
}

export const learningApi = {
  /** ★ idempotent: a retried click must not become a second enrollment attempt. */
  enroll: (courseId: string, options: { idempotencyKey?: string; token?: string; signal?: AbortSignal } = {}) =>
    request<Enrollment>(`/courses/${courseId}/enrollments`, {
      method: 'POST',
      idempotencyKey: options.idempotencyKey ?? newIdempotencyKey(),
      token: options.token,
      signal: options.signal,
    }),
  mine: (status?: EnrollmentStatus, cursor?: string | null, signal?: AbortSignal) =>
    api.get<CursorPage<Enrollment>>('/enrollments/me', { query: { status, cursor, limit: 50 }, signal }),
  enrollment: (id: string, signal?: AbortSignal) => api.get<Enrollment>(`/enrollments/${id}`, { signal }),
  withdraw: (id: string) => api.delete(`/enrollments/${id}`),
  /** Every enrollment the user ever had, withdrawals included. */
  history: (userId: string, cursor?: string | null, signal?: AbortSignal) =>
    api.get<CursorPage<Enrollment>>(`/users/${userId}/enrollment-history`, { query: { cursor, limit: 50 }, signal }),
  progress: (id: string, signal?: AbortSignal) =>
    api.get<Progress>(`/enrollments/${id}/progress`, { signal }),
  completeLesson: (enrollmentId: string, lessonId: string) =>
    api.post<Progress>(`/enrollments/${enrollmentId}/lessons/${lessonId}/complete`, undefined, {
      idempotencyKey: `complete:${enrollmentId}:${lessonId}`,
    }),
  roster: (
    courseId: string,
    options: { cursor?: string | null; limit?: number; token?: string; signal?: AbortSignal } = {},
  ) =>
    request<CursorPage<Enrollment>>(`/courses/${courseId}/enrollments`, {
      query: { cursor: options.cursor, limit: options.limit ?? 50 },
      token: options.token,
      signal: options.signal,
    }),
}

export const myEnrollmentsQuery = (status?: EnrollmentStatus) =>
  infiniteQueryOptions({
    queryKey: learningKeys.mine(status),
    queryFn: ({ pageParam, signal }) => learningApi.mine(status, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : null),
  })

export const enrollmentQuery = (id: string) =>
  queryOptions({
    queryKey: learningKeys.enrollment(id),
    queryFn: ({ signal }) => learningApi.enrollment(id, signal),
  })

export const progressQuery = (id: string) =>
  queryOptions({
    queryKey: learningKeys.progress(id),
    queryFn: ({ signal }) => learningApi.progress(id, signal),
  })

export const rosterQuery = (courseId: string) =>
  infiniteQueryOptions({
    queryKey: learningKeys.roster(courseId),
    queryFn: async ({ pageParam, signal }) =>
      (await learningApi.roster(courseId, { cursor: pageParam, signal })).data,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : null),
  })

export const enrollmentHistoryQuery = (userId: string) =>
  infiniteQueryOptions({
    queryKey: learningKeys.history(userId),
    queryFn: ({ pageParam, signal }) => learningApi.history(userId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : null),
  })
