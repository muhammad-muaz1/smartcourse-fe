import { Users } from 'lucide-react'
import { memo } from 'react'
import { Link } from 'react-router'
import { LevelBadge } from '@/components/ui/status'
import type { Course } from '@/lib/api/types'
import { timeAgo } from '@/lib/utils'
import { coverGradient } from './cover'

export const CourseCard = memo(function CourseCard({ course }: { course: Course }) {
  return (
    <Link
      to={`/courses/${course.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className={`relative h-28 bg-gradient-to-br ${coverGradient(course.id)}`}>
        <span className="absolute bottom-3 left-4 text-3xl font-bold text-white/90">
          {course.title.slice(0, 1).toUpperCase()}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-center gap-2">
          <LevelBadge level={course.level} />
          {course.max_enrollments && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Users className="size-3" /> {course.max_enrollments} seats
            </span>
          )}
        </div>
        <h3 className="line-clamp-2 font-semibold text-zinc-900 group-hover:text-brand-700">{course.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{course.description}</p>
        <p className="mt-auto pt-3 text-xs text-zinc-400">Published {timeAgo(course.published_at)}</p>
      </div>
    </Link>
  )
})
