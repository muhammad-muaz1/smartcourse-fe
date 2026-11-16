import { Navigate, Outlet, useLocation } from 'react-router'
import { PageSpinner } from '@/components/ui/primitives'
import { useSession } from '@/lib/api/session'
import type { UserRole } from '@/lib/api/types'
import { homeFor } from './home'

/** Gate a subtree on authentication and, optionally, on role. */
export function RequireAuth({ roles }: { roles?: UserRole[] }) {
  const status = useSession((s) => s.status)
  const user = useSession((s) => s.user)
  const location = useLocation()

  if (status === 'booting') return <PageSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

/** Signed-in users have no business on /login or /register. */
export function RedirectIfAuthenticated() {
  const status = useSession((s) => s.status)
  const user = useSession((s) => s.user)
  if (status === 'booting') return <PageSpinner />
  if (user) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

export function HomeRedirect() {
  const status = useSession((s) => s.status)
  const role = useSession((s) => s.user?.role)
  if (status === 'booting') return <PageSpinner />
  return <Navigate to={homeFor(role)} replace />
}
