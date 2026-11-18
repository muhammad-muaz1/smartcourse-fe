/**
 * Wire contracts, mirrored from the backend's Pydantic schemas (each service's schemas.py).
 * Field names stay snake_case on purpose: renaming at the boundary buys nothing and makes
 * every contract change a two-place edit.
 */

export type Uuid = string
export type IsoDateTime = string

// ---- platform-core envelope -------------------------------------------------------

export interface Meta {
  request_id: string | null
  timestamp: IsoDateTime
  /** Set on projection reads — the moment the data reflects. */
  as_of: IsoDateTime | null
}

export interface Envelope<T> {
  data: T
  meta: Meta
}

export interface CursorPage<T> {
  items: T[]
  next_cursor: string | null
  has_more: boolean
}

export interface FieldError {
  field: string
  message: string
}

export interface ErrorBody {
  code: string
  message: string
  details: FieldError[] | null
  request_id: string | null
}

// ---- identity ----------------------------------------------------------------------

export type UserRole = 'student' | 'instructor' | 'admin'

export interface User {
  id: Uuid
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  created_at: IsoDateTime
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  /** Seconds until the access token expires. */
  expires_in: number
}

export interface RegisterInput {
  email: string
  password: string
  full_name: string
  role: Exclude<UserRole, 'admin'>
}

// ---- course ------------------------------------------------------------------------

export type CourseLevel = 'beginner' | 'intermediate' | 'advanced'
export type CourseStatus = 'draft' | 'publishing' | 'published' | 'failed' | 'archived'
export type LessonType = 'text' | 'video'
export type PublishRunStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface Course {
  id: Uuid
  title: string
  description: string
  level: CourseLevel
  status: CourseStatus
  instructor_id: Uuid
  max_enrollments: number | null
  published_at: IsoDateTime | null
  created_at: IsoDateTime
  updated_at: IsoDateTime
}

export interface CourseInput {
  title: string
  description: string
  level: CourseLevel
  max_enrollments: number | null
}

export interface LessonSummary {
  id: Uuid
  title: string
  lesson_type: LessonType
  duration_minutes: number | null
  position: number
}

export type LessonBody =
  | { content: string }
  | { video_url: string; transcript?: string }

export interface Lesson extends LessonSummary {
  module_id: Uuid
  course_id: Uuid
  body: LessonBody
  created_at: IsoDateTime
  updated_at: IsoDateTime
}

export interface LessonInput {
  title: string
  lesson_type: LessonType
  body: LessonBody
  duration_minutes: number | null
}

export interface Asset {
  id: Uuid
  course_id: Uuid
  lesson_id: Uuid | null
  filename: string
  content_type: string
  size_bytes: number
  checksum_sha256: string
  created_at: IsoDateTime
}

export interface CourseModule {
  id: Uuid
  course_id: Uuid
  title: string
  description: string | null
  position: number
  lessons: LessonSummary[]
}

export interface ModuleInput {
  title: string
  description: string | null
}

export interface CourseDetail extends Course {
  modules: CourseModule[]
}

export interface PublishStep {
  name: string
  status: string
  started_at: IsoDateTime | null
  finished_at: IsoDateTime | null
}

export interface PublishRun {
  id: Uuid
  course_id: Uuid
  requested_by: Uuid
  status: PublishRunStatus
  workflow_id: string
  steps: PublishStep[]
  failed_step: string | null
  error: string | null
  started_at: IsoDateTime | null
  finished_at: IsoDateTime | null
  created_at: IsoDateTime
}

// ---- learning ----------------------------------------------------------------------

export type EnrollmentStatus = 'active' | 'withdrawn' | 'completed'

export interface Enrollment {
  id: Uuid
  course_id: Uuid
  course_title: string
  student_id: Uuid
  student_name: string | null
  status: EnrollmentStatus
  enrolled_at: IsoDateTime
  withdrawn_at: IsoDateTime | null
  completed_at: IsoDateTime | null
  lessons_completed: number
  lessons_total: number
  progress_percent: number
}

export interface Progress {
  enrollment_id: Uuid
  course_id: Uuid
  status: EnrollmentStatus
  lessons_total: number
  lessons_completed: number
  progress_percent: number
  completed_lesson_ids: Uuid[]
  completed_at: IsoDateTime | null
}

// ---- notification ------------------------------------------------------------------

export type NotificationKind = 'account_welcome' | 'course_welcome' | 'course_completed'
export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export interface Notification {
  id: Uuid
  kind: NotificationKind
  subject: string
  body: string
  status: DeliveryStatus
  created_at: IsoDateTime
  sent_at: IsoDateTime | null
  read_at: IsoDateTime | null
}

// ---- analytics ---------------------------------------------------------------------

export type Granularity = 'day' | 'week' | 'month'
export type Period = '7d' | '30d' | '90d' | 'all'

export interface Overview {
  total_students: number
  total_instructors: number
  total_courses_published: number
  total_enrollments: number
}

export interface EnrollmentSeries {
  granularity: Granularity
  start: IsoDateTime
  end: IsoDateTime
  course_id: Uuid | null
  buckets: { period_start: IsoDateTime; enrollments: number }[]
}

export interface CompletionStats {
  course_id: Uuid | null
  enrollments: number
  withdrawn: number
  completed: number
  completion_rate: number
}

export interface TimeToComplete {
  course_id: Uuid | null
  completed: number
  average_hours: number | null
  average_days: number | null
}

export interface PopularCourses {
  period: Period
  items: { course_id: Uuid; title: string; enrollments: number }[]
}

export interface CourseLoad {
  students_with_enrollments: number
  registered_students: number
  current_enrollments: number
  average_per_enrolled_student: number
  average_per_registered_student: number
}

export interface CourseDashboard {
  course_id: Uuid
  title: string
  status: string
  enrollments: number
  active: number
  withdrawn: number
  completed: number
  completion_rate: number
  average_hours_to_complete: number | null
}

export interface FailureItem {
  id: Uuid
  source: string
  service: string
  subject: string
  reference_id: string | null
  step: string | null
  error: string
  occurred_at: IsoDateTime
}

export interface FailureSummary {
  total: number
  groups: { source: string; service: string; subject: string; count: number; last_seen: IsoDateTime }[]
  recent: FailureItem[]
}

// ---- infrastructure (outside /api/v1) ----------------------------------------------

export interface DependencyStatus {
  status: string
  latency_ms: number | null
  detail: string | null
}

export interface HealthReport {
  status: string
  service: string
  version: string
  services: Record<string, DependencyStatus>
}
