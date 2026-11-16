import type { UserRole } from '@/lib/api/types'

/** Landing route per role after sign-in. */
export function homeFor(role: UserRole | undefined): string {
  switch (role) {
    case 'student':
      return '/learning'
    case 'instructor':
      return '/instructor/courses'
    case 'admin':
      return '/analytics'
    default:
      return '/courses'
  }
}
