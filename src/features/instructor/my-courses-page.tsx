import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Plus, PenSquare } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives'
import { CourseStatusBadge, LevelBadge } from '@/components/ui/status'
import { coursesApi, courseKeys, myCoursesQuery } from '@/features/courses/api'
import { useSession } from '@/lib/api/session'
import type { CourseStatus } from '@/lib/api/types'
import { useDocumentTitle } from '@/lib/hooks'
import { timeAgo } from '@/lib/utils'
import { CourseForm } from './course-form'

const ORDER: CourseStatus[] = ['publishing', 'failed', 'draft', 'published', 'archived']

export default function MyCoursesPage() {
  useDocumentTitle('My courses')
  const userId = useSession((s) => s.user!.id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const courses = useQuery(myCoursesQuery(userId))

  const create = useMutation({
    mutationFn: coursesApi.create,
    onSuccess: (course) => {
      void queryClient.invalidateQueries({ queryKey: courseKeys.all })
      navigate(`/instructor/courses/${course.id}`)
    },
    meta: { successMessage: 'Draft created' },
  })

  const sorted = useMemo(
    () => [...(courses.data ?? [])].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)),
    [courses.data],
  )

  return (
    <>
      <PageHeader
        title="My courses"
        description="Draft, structure and publish your courses."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New course</Button>}
      />

      {courses.isPending ? (
        <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : courses.isError ? (
        <Card><ErrorState error={courses.error} onRetry={() => void courses.refetch()} /></Card>
      ) : sorted.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PenSquare className="size-5" />}
            title="No courses yet"
            description="Create a draft, add modules and lessons, then publish it to the catalogue."
            action={<Button onClick={() => setCreating(true)}>Create your first course</Button>}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {sorted.map((course) => (
            <li key={course.id}>
              <Link
                to={`/instructor/courses/${course.id}`}
                className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:-translate-y-px hover:shadow-md"
              >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-zinc-900">{course.title}</p>
                      <CourseStatusBadge status={course.status} />
                    </div>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                      <LevelBadge level={course.level} />
                      Updated {timeAgo(course.updated_at)}
                      {course.max_enrollments && ` · ${course.max_enrollments} seats`}
                    </p>
                  </div>
                <ChevronRight className="size-4 text-zinc-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New course" description="Starts as a draft — nothing is visible to students until you publish.">
        <CourseForm submitLabel="Create draft" onSubmit={(input) => create.mutateAsync(input)} />
      </Modal>
    </>
  )
}
