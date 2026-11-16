import { api, isApiError, newIdempotencyKey, request } from '@/lib/api/client'
import type { Course, CourseModule, Lesson, PublishRun } from '@/lib/api/types'
import { sleep } from '@/lib/utils'

export class TimeoutError extends Error {}

/** Poll `probe` until it returns a non-undefined value or the deadline passes. */
export async function pollUntil<T>(
  probe: () => Promise<T | undefined>,
  { intervalMs, timeoutMs, signal, what }: { intervalMs: number; timeoutMs: number; signal: AbortSignal; what: string },
): Promise<T> {
  const deadline = performance.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (value !== undefined) return value
    if (performance.now() > deadline) throw new TimeoutError(`Timed out after ${timeoutMs / 1000}s waiting for ${what}`)
    await sleep(intervalMs, signal)
  }
}

/**
 * Create a draft course as `token`. `withEmptyModule` adds a module with no lessons, which
 * the publish workflow's validate step rejects — the deterministic fault for the saga demo.
 */
export async function createDemoCourse(
  token: string,
  { title, seats, withEmptyModule = false }: { title: string; seats: number | null; withEmptyModule?: boolean },
): Promise<Course> {
  const course = await api.post<Course>(
    '/courses',
    { title, description: 'Created by the SmartCourse platform demo.', level: 'beginner', max_enrollments: seats },
    { token },
  )
  const module = await api.post<CourseModule>(`/courses/${course.id}/modules`, { title: 'Getting started', description: null }, { token })
  await api.post<Lesson>(
    `/modules/${module.id}/lessons`,
    { title: 'Welcome', lesson_type: 'text', body: { content: 'Welcome to the demo course.' }, duration_minutes: 2 },
    { token },
  )
  if (withEmptyModule) {
    await api.post<CourseModule>(`/courses/${course.id}/modules`, { title: 'Unfinished module', description: null }, { token })
  }
  return course
}

export async function startPublish(courseId: string, token: string, idempotencyKey = newIdempotencyKey()) {
  return request<PublishRun>(`/courses/${courseId}/publish`, { method: 'POST', token, idempotencyKey })
}

export function waitForRun(
  courseId: string,
  runId: string,
  token: string,
  signal: AbortSignal,
  onUpdate?: (run: PublishRun) => void,
): Promise<PublishRun> {
  return pollUntil(
    async () => {
      const run = await api.get<PublishRun>(`/courses/${courseId}/publish-runs/${runId}`, { token, signal })
      onUpdate?.(run)
      return run.status === 'succeeded' || run.status === 'failed' ? run : undefined
    },
    { intervalMs: 250, timeoutMs: 90_000, signal, what: 'the publish workflow' },
  )
}

/**
 * learning accepts enrollments only once `course.published.v1` has flowed outbox → Kafka
 * → its `course_cache`. The cache row appears earlier (on `course.created`, as a draft),
 * so its mere existence proves nothing — the only reliable readiness signal is an
 * enrollment that succeeds. A dedicated probe student enrolls as soon as learning
 * allows it, then withdraws, which atomically releases the seat again.
 */
export async function waitUntilEnrollable(courseId: string, probeToken: string, signal: AbortSignal): Promise<void> {
  const enrollmentId = await pollUntil(
    async () => {
      try {
        const res = await request<{ id: string }>(`/courses/${courseId}/enrollments`, {
          method: 'POST',
          token: probeToken,
          idempotencyKey: newIdempotencyKey(),
          signal,
        })
        return res.data.id
      } catch (error) {
        if (isApiError(error, 'COURSE_NOT_FOUND') || isApiError(error, 'COURSE_NOT_ENROLLABLE')) return undefined
        throw error
      }
    },
    { intervalMs: 150, timeoutMs: 60_000, signal, what: 'learning to receive course.published' },
  )
  await api.delete(`/enrollments/${enrollmentId}`, { token: probeToken, signal })
}
