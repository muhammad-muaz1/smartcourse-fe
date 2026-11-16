import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Clock, FileText, Layers, PlayCircle, Users } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, ErrorState, PageSpinner } from '@/components/ui/primitives'
import { CourseStatusBadge, LevelBadge } from '@/components/ui/status'
import { myEnrollmentsQuery } from '@/features/learning/api'
import { useEnroll } from '@/features/learning/use-enroll'
import { errorMessage, isApiError } from '@/lib/api/client'
import { useSession } from '@/lib/api/session'
import type { CourseDetail } from '@/lib/api/types'
import { useDocumentTitle } from '@/lib/hooks'
import { plural } from '@/lib/utils'
import { courseQuery } from './api'
import { coverGradient } from './cover'

const ENROLL_ERRORS: Record<string, string> = {
  COURSE_FULL: 'This course is full — every seat has been taken.',
  ALREADY_ENROLLED: "You're already enrolled in this course.",
  COURSE_NOT_ENROLLABLE: 'This course is not open for enrollment.',
  // learning's course_cache is fed by events; right after publish it may lag a moment.
  COURSE_NOT_FOUND: 'Enrollment is opening — please try again in a few seconds.',
}

function useMyEnrollment(courseId: string) {
  const isStudent = useSession((s) => s.user?.role === 'student')
  const query = useInfiniteQuery({ ...myEnrollmentsQuery(), enabled: isStudent })
  return useMemo(
    () =>
      query.data?.pages
        .flatMap((p) => p.items)
        .find((e) => e.course_id === courseId && e.status !== 'withdrawn'),
    [query.data, courseId],
  )
}

function EnrollPanel({ course }: { course: CourseDetail }) {
  const user = useSession((s) => s.user)
  const navigate = useNavigate()
  const enrollment = useMyEnrollment(course.id)
  const enroll = useEnroll(course.id)

  if (!user) {
    return (
      <Button size="lg" className="w-full" onClick={() => navigate('/login', { state: { from: `/courses/${course.id}` } })}>
        Sign in to enroll
      </Button>
    )
  }
  if (user.role !== 'student') {
    return <p className="text-center text-xs text-zinc-500">Only students can enroll.</p>
  }
  if (enrollment) {
    return (
      <Button size="lg" className="w-full" icon={<PlayCircle className="size-4" />} onClick={() => navigate(`/learning/${enrollment.id}`)}>
        {enrollment.status === 'completed' ? 'Review course' : 'Continue learning'}
      </Button>
    )
  }
  return (
    <Button
      size="lg"
      className="w-full"
      loading={enroll.isPending}
      disabled={course.status !== 'published'}
      onClick={() =>
        enroll.mutate(undefined, {
          onSuccess: (created) => {
            toast.success(`Enrolled in ${course.title}`)
            navigate(`/learning/${created.id}`)
          },
          onError: (error) =>
            toast.error(isApiError(error) ? (ENROLL_ERRORS[error.code] ?? error.message) : errorMessage(error)),
        })
      }
    >
      Enroll now
    </Button>
  )
}

export default function CourseDetailPage() {
  const { courseId = '' } = useParams()
  const { data: course, isPending, isError, error, refetch } = useQuery(courseQuery(courseId))
  useDocumentTitle(course?.title)

  if (isPending) return <PageSpinner />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  const lessonCount = course.modules.reduce((n, m) => n + m.lessons.length, 0)
  const minutes = course.modules.reduce(
    (n, m) => n + m.lessons.reduce((s, l) => s + (l.duration_minutes ?? 0), 0),
    0,
  )

  return (
    <div className="animate-fade-in">
      <Link to="/courses" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800">
        <ArrowLeft className="size-4" /> Catalogue
      </Link>

      <div className={`mb-8 rounded-2xl bg-gradient-to-br p-8 text-white ${coverGradient(course.id)}`}>
        <div className="mb-3 flex gap-2">
          <LevelBadge level={course.level} />
          {course.status !== 'published' && <CourseStatusBadge status={course.status} />}
        </div>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight">{course.title}</h1>
        <div className="mt-4 flex flex-wrap gap-5 text-sm text-white/85">
          <span className="inline-flex items-center gap-1.5"><Layers className="size-4" /> {plural(course.modules.length, 'module')}</span>
          <span className="inline-flex items-center gap-1.5"><FileText className="size-4" /> {plural(lessonCount, 'lesson')}</span>
          {minutes > 0 && <span className="inline-flex items-center gap-1.5"><Clock className="size-4" /> {minutes} min</span>}
          {course.max_enrollments && <span className="inline-flex items-center gap-1.5"><Users className="size-4" /> {course.max_enrollments} seats</span>}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">About this course</h2>
            <p className="text-sm leading-6 whitespace-pre-line text-zinc-600">{course.description}</p>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">Curriculum</h2>
            <div className="space-y-4">
              {course.modules.map((module, index) => (
                <Card key={module.id}>
                  <div className="border-b border-zinc-100 px-5 py-3">
                    <p className="text-xs font-medium text-zinc-400">Module {index + 1}</p>
                    <p className="font-medium text-zinc-900">{module.title}</p>
                  </div>
                  <ul className="divide-y divide-zinc-100">
                    {module.lessons.map((lesson) => (
                      <li key={lesson.id} className="flex items-center gap-3 px-5 py-2.5 text-sm text-zinc-700">
                        {lesson.lesson_type === 'video' ? (
                          <PlayCircle className="size-4 text-zinc-400" />
                        ) : (
                          <FileText className="size-4 text-zinc-400" />
                        )}
                        <span className="flex-1">{lesson.title}</span>
                        {lesson.duration_minutes != null && (
                          <span className="text-xs text-zinc-400">{lesson.duration_minutes} min</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>
        </div>

        <aside>
          <Card className="sticky top-20 p-5">
            <ul className="mb-5 space-y-2.5 text-sm text-zinc-600">
              {['Self-paced learning', 'Lesson-by-lesson progress tracking', 'Notified on enrollment and completion'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" /> {t}
                </li>
              ))}
            </ul>
            <EnrollPanel course={course} />
          </Card>
        </aside>
      </div>
    </div>
  )
}
