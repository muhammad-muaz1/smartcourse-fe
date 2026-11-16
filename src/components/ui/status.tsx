import type { CourseStatus, EnrollmentStatus, PublishRunStatus } from '@/lib/api/types'
import { Badge, type BadgeTone } from './primitives'

const courseTone: Record<CourseStatus, BadgeTone> = {
  draft: 'neutral',
  publishing: 'info',
  published: 'success',
  failed: 'danger',
  archived: 'warning',
}

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  return (
    <Badge tone={courseTone[status]} dot>
      {status}
    </Badge>
  )
}

const runTone: Record<PublishRunStatus, BadgeTone> = {
  pending: 'neutral',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
}

export function RunStatusBadge({ status }: { status: PublishRunStatus }) {
  return (
    <Badge tone={runTone[status]} dot>
      {status}
    </Badge>
  )
}

const enrollmentTone: Record<EnrollmentStatus, BadgeTone> = {
  active: 'brand',
  completed: 'success',
  withdrawn: 'neutral',
}

export function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  return <Badge tone={enrollmentTone[status]}>{status}</Badge>
}

export function LevelBadge({ level }: { level: string }) {
  return <Badge tone="neutral" className="capitalize">{level}</Badge>
}
