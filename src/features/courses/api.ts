import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api, downloadBlob, newIdempotencyKey, request } from '@/lib/api/client'
import type {
  Asset,
  Course,
  CourseDetail,
  CourseInput,
  CourseLevel,
  CourseModule,
  CourseStatus,
  CursorPage,
  Lesson,
  LessonInput,
  LessonSummary,
  ModuleInput,
  PublishRun,
} from '@/lib/api/types'

export interface CatalogFilters {
  q?: string
  level?: CourseLevel
  status?: CourseStatus
}

export const courseKeys = {
  all: ['courses'] as const,
  lists: () => [...courseKeys.all, 'list'] as const,
  list: (filters: CatalogFilters) => [...courseKeys.lists(), filters] as const,
  mine: (instructorId: string) => [...courseKeys.all, 'mine', instructorId] as const,
  detail: (id: string) => [...courseKeys.all, 'detail', id] as const,
  modules: (courseId: string) => [...courseKeys.all, 'modules', courseId] as const,
  lesson: (id: string) => [...courseKeys.all, 'lesson', id] as const,
  lessonAssets: (lessonId: string) => [...courseKeys.all, 'lesson', lessonId, 'assets'] as const,
  publishRuns: (courseId: string) => [...courseKeys.all, 'publish-runs', courseId] as const,
  publishRun: (courseId: string, runId: string) =>
    [...courseKeys.publishRuns(courseId), runId] as const,
}

const PAGE_SIZE = 12

export const coursesApi = {
  list: (filters: CatalogFilters, cursor?: string | null, limit = PAGE_SIZE, signal?: AbortSignal) =>
    api.get<CursorPage<Course>>('/courses', {
      query: { ...filters, cursor, limit },
      auth: false,
      signal,
    }),
  detail: (id: string, signal?: AbortSignal) =>
    api.get<CourseDetail>(`/courses/${id}`, { auth: false, signal }),
  create: (input: CourseInput) => api.post<Course>('/courses', input),
  update: (id: string, input: Partial<CourseInput>) => api.patch<Course>(`/courses/${id}`, input),
  archive: (id: string) => api.delete(`/courses/${id}`),
  unpublish: (id: string) => api.post<Course>(`/courses/${id}/unpublish`),

  modules: (courseId: string, signal?: AbortSignal) =>
    api.get<CourseModule[]>(`/courses/${courseId}/modules`, { signal }),
  addModule: (courseId: string, input: ModuleInput) =>
    api.post<CourseModule>(`/courses/${courseId}/modules`, input),
  updateModule: (moduleId: string, input: Partial<ModuleInput>) =>
    api.patch<CourseModule>(`/modules/${moduleId}`, input),
  deleteModule: (moduleId: string) => api.delete(`/modules/${moduleId}`),
  reorderModules: (courseId: string, moduleIds: string[]) =>
    api.put<CourseModule[]>(`/courses/${courseId}/modules/order`, { module_ids: moduleIds }),

  addLesson: (moduleId: string, input: LessonInput) =>
    api.post<Lesson>(`/modules/${moduleId}/lessons`, input),
  lesson: (lessonId: string, signal?: AbortSignal) => api.get<Lesson>(`/lessons/${lessonId}`, { signal }),
  updateLesson: (lessonId: string, input: Partial<LessonInput>) =>
    api.patch<Lesson>(`/lessons/${lessonId}`, input),
  deleteLesson: (lessonId: string) => api.delete(`/lessons/${lessonId}`),
  reorderLessons: (moduleId: string, lessonIds: string[]) =>
    api.put<LessonSummary[]>(`/modules/${moduleId}/lessons/order`, { lesson_ids: lessonIds }),

  // Assets (lesson attachments). Upload streams the file as the raw body; course_id,
  // filename and the optional lesson_id ride in the query string.
  lessonAssets: (lessonId: string, signal?: AbortSignal) =>
    api.get<Asset[]>(`/lessons/${lessonId}/assets`, { signal }),
  uploadAsset: (file: File, args: { courseId: string; lessonId?: string }) =>
    api.upload<Asset>('/assets', file, {
      query: { course_id: args.courseId, lesson_id: args.lessonId, filename: file.name },
    }),
  deleteAsset: (assetId: string) => api.delete(`/assets/${assetId}`),
  downloadAsset: (asset: Asset) => downloadBlob(`/assets/${asset.id}/content`),

  /** 202 + run resource. The key makes a double-click or retry return the same run. */
  publish: (courseId: string, idempotencyKey = newIdempotencyKey()) =>
    request<PublishRun>(`/courses/${courseId}/publish`, { method: 'POST', idempotencyKey }),
  publishRuns: (courseId: string, signal?: AbortSignal) =>
    api.get<PublishRun[]>(`/courses/${courseId}/publish-runs`, { signal }),
  publishRun: (courseId: string, runId: string, signal?: AbortSignal) =>
    api.get<PublishRun>(`/courses/${courseId}/publish-runs/${runId}`, { signal }),
}

export const catalogQuery = (filters: CatalogFilters) =>
  infiniteQueryOptions({
    queryKey: courseKeys.list(filters),
    queryFn: ({ pageParam, signal }) => coursesApi.list(filters, pageParam, PAGE_SIZE, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : null),
  })

export const courseQuery = (id: string) =>
  queryOptions({
    queryKey: courseKeys.detail(id),
    queryFn: ({ signal }) => coursesApi.detail(id, signal),
  })

export const lessonQuery = (id: string) =>
  queryOptions({
    queryKey: courseKeys.lesson(id),
    queryFn: ({ signal }) => coursesApi.lesson(id, signal),
    staleTime: 5 * 60_000,
  })

export const lessonAssetsQuery = (lessonId: string) =>
  queryOptions({
    queryKey: courseKeys.lessonAssets(lessonId),
    queryFn: ({ signal }) => coursesApi.lessonAssets(lessonId, signal),
  })

export const publishRunsQuery = (courseId: string) =>
  queryOptions({
    queryKey: courseKeys.publishRuns(courseId),
    queryFn: ({ signal }) => coursesApi.publishRuns(courseId, signal),
    // Poll only while a run is in flight; settle to idle afterwards.
    refetchInterval: (query) =>
      query.state.data?.some((run) => run.status === 'pending' || run.status === 'running')
        ? 1_000
        : false,
  })

/**
 * The course service has no `?instructor_id=` filter yet, so "my courses" walks the
 * catalogue and filters client-side. Fine at current volumes; flagged as a backend gap.
 */
async function fetchInstructorCourses(instructorId: string, signal: AbortSignal): Promise<Course[]> {
  const mine: Course[] = []
  let cursor: string | null = null
  do {
    const page: CursorPage<Course> = await coursesApi.list({}, cursor, 100, signal)
    mine.push(...page.items.filter((c) => c.instructor_id === instructorId))
    cursor = page.has_more ? page.next_cursor : null
  } while (cursor)
  return mine
}

export const myCoursesQuery = (instructorId: string) =>
  queryOptions({
    queryKey: courseKeys.mine(instructorId),
    queryFn: ({ signal }) => fetchInstructorCourses(instructorId, signal),
  })

/** The curriculum on its own — what the editor refreshes after each structural change. */
export const modulesQuery = (courseId: string) =>
  queryOptions({
    queryKey: courseKeys.modules(courseId),
    queryFn: ({ signal }) => coursesApi.modules(courseId, signal),
  })

/**
 * Courses a staff member may scope analytics to: an instructor only their own (the
 * analytics service enforces ownership), an admin any course.
 */
export const courseOptionsQuery = (user: { id: string; role: string }) =>
  queryOptions({
    queryKey: [...courseKeys.all, 'options', user.role === 'admin' ? 'all' : user.id] as const,
    queryFn: async ({ signal }) =>
      user.role === 'admin'
        ? (await coursesApi.list({}, null, 100, signal)).items
        : fetchInstructorCourses(user.id, signal),
  })
