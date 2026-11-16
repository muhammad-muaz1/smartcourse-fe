import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, FileText, PlayCircle, Trophy } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, EmptyState, ErrorState, PageSpinner, ProgressBar, Skeleton } from '@/components/ui/primitives'
import { courseQuery, lessonQuery } from '@/features/courses/api'
import type { LessonSummary } from '@/lib/api/types'
import { useDocumentTitle } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { enrollmentQuery, learningApi, learningKeys, progressQuery } from './api'
import { LessonBody } from './lesson-body'

function LessonView({ lessonId }: { lessonId: string }) {
  const { data: lesson, isPending, isError, error, refetch } = useQuery(lessonQuery(lessonId))
  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    )
  }
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  return (
    <article className="animate-fade-in">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{lesson.title}</h1>
      <LessonBody lesson={lesson} />
    </article>
  )
}

export default function CoursePlayerPage() {
  const { enrollmentId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const enrollment = useQuery(enrollmentQuery(enrollmentId))
  const progress = useQuery(progressQuery(enrollmentId))
  const course = useQuery({ ...courseQuery(enrollment.data?.course_id ?? ''), enabled: !!enrollment.data })
  useDocumentTitle(enrollment.data?.course_title)

  const lessons = useMemo<LessonSummary[]>(
    () => course.data?.modules.flatMap((m) => m.lessons) ?? [],
    [course.data],
  )
  const completed = useMemo(() => new Set(progress.data?.completed_lesson_ids ?? []), [progress.data])
  // Default to the first unfinished lesson, so returning learners resume in place.
  const currentId =
    params.get('lesson') ?? lessons.find((l) => !completed.has(l.id))?.id ?? lessons[0]?.id
  const currentIndex = lessons.findIndex((l) => l.id === currentId)
  const next = lessons[currentIndex + 1]
  const prev = lessons[currentIndex - 1]

  const complete = useMutation({
    mutationFn: (lessonId: string) => learningApi.completeLesson(enrollmentId, lessonId),
    onSuccess: (updated) => {
      // The response *is* the new progress view — write it straight into the cache.
      queryClient.setQueryData(learningKeys.progress(enrollmentId), updated)
      void queryClient.invalidateQueries({ queryKey: learningKeys.enrollment(enrollmentId) })
      void queryClient.invalidateQueries({ queryKey: learningKeys.mineAll() })
      if (updated.status === 'completed') toast.success('Course completed — congratulations!')
      else if (next) goTo(next.id)
    },
  })

  const withdraw = useMutation({
    mutationFn: () => learningApi.withdraw(enrollmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: learningKeys.all })
      navigate('/learning')
    },
    meta: { successMessage: 'You have withdrawn from the course' },
  })

  function goTo(lessonId: string) {
    setParams({ lesson: lessonId }, { replace: false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (enrollment.isPending || progress.isPending) return <PageSpinner />
  if (enrollment.isError) return <ErrorState error={enrollment.error} onRetry={() => void enrollment.refetch()} />
  if (progress.isError) return <ErrorState error={progress.error} onRetry={() => void progress.refetch()} />

  const isActive = enrollment.data.status === 'active'
  const isDone = progress.data.status === 'completed'

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Link to="/learning" className="mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800">
          <ArrowLeft className="size-4" /> My learning
        </Link>
        <Card className="overflow-hidden">
          <div className="border-b border-zinc-100 p-4">
            <p className="line-clamp-2 font-semibold">{enrollment.data.course_title}</p>
            <div className="mt-3 flex items-center gap-3">
              <ProgressBar value={progress.data.progress_percent} />
              <span className="text-xs font-medium tabular-nums">{Math.round(progress.data.progress_percent)}%</span>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              {progress.data.lessons_completed} of {progress.data.lessons_total} lessons complete
            </p>
          </div>
          <nav className="max-h-[60vh] overflow-y-auto py-2" aria-label="Lessons">
            {course.isPending ? (
              <div className="space-y-2 p-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-7" />)}</div>
            ) : (
              course.data?.modules.map((module) => (
                <div key={module.id} className="mb-1">
                  <p className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">{module.title}</p>
                  {module.lessons.map((lesson) => {
                    const done = completed.has(lesson.id)
                    return (
                      <button
                        key={lesson.id}
                        onClick={() => goTo(lesson.id)}
                        aria-current={lesson.id === currentId ? 'page' : undefined}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition',
                          lesson.id === currentId ? 'bg-brand-50 font-medium text-brand-800' : 'text-zinc-600 hover:bg-zinc-50',
                        )}
                      >
                        {done ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> : <Circle className="size-4 shrink-0 text-zinc-300" />}
                        <span className="flex-1 truncate">{lesson.title}</span>
                        {lesson.lesson_type === 'video' ? <PlayCircle className="size-3.5 text-zinc-300" /> : <FileText className="size-3.5 text-zinc-300" />}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </nav>
          {isActive && (
            <div className="border-t border-zinc-100 p-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                loading={withdraw.isPending}
                onClick={() => {
                  if (confirm('Withdraw from this course? Your progress will be kept in your history.')) withdraw.mutate()
                }}
              >
                Withdraw from course
              </Button>
            </div>
          )}
        </Card>
      </aside>

      <section>
        {isDone && (
          <Card className="mb-6 flex items-center gap-4 border-emerald-200 bg-emerald-50 p-4">
            <Trophy className="size-6 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-900">Course complete</p>
              <p className="text-sm text-emerald-700">You finished every lesson. Well done.</p>
            </div>
          </Card>
        )}
        <Card className="p-6 sm:p-10">
          {currentId ? (
            <LessonView key={currentId} lessonId={currentId} />
          ) : (
            <EmptyState title="This course has no lessons yet" />
          )}
        </Card>

        {currentId && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={!prev} onClick={() => prev && goTo(prev.id)} icon={<ArrowLeft className="size-4" />}>
              Previous
            </Button>
            {isActive && !completed.has(currentId) ? (
              <Button variant="success" loading={complete.isPending} onClick={() => complete.mutate(currentId)} icon={<CheckCircle2 className="size-4" />}>
                Mark complete{next ? ' & continue' : ''}
              </Button>
            ) : (
              <Button variant="secondary" disabled={!next} onClick={() => next && goTo(next.id)}>
                Next <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
