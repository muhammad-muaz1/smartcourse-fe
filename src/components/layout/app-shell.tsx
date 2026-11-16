import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  Bell,
  BookOpen,
  FlaskConical,
  GraduationCap,
  LayoutGrid,
  LogOut,
  Menu,
  PenSquare,
  X,
} from 'lucide-react'
import { Suspense, useState, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { PageSpinner } from '@/components/ui/primitives'
import { signOut } from '@/features/auth/api'
import { inboxQuery } from '@/features/notifications/api'
import { healthQuery } from '@/features/system/api'
import { useSession } from '@/lib/api/session'
import type { UserRole } from '@/lib/api/types'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** Undefined = visible to everyone, including anonymous visitors. */
  roles?: UserRole[]
}

const NAV: NavItem[] = [
  { to: '/courses', label: 'Catalogue', icon: LayoutGrid },
  { to: '/learning', label: 'My learning', icon: GraduationCap, roles: ['student'] },
  { to: '/instructor/courses', label: 'My courses', icon: PenSquare, roles: ['instructor', 'admin'] },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['instructor', 'admin'] },
  { to: '/notifications', label: 'Notifications', icon: Bell, roles: ['student', 'instructor', 'admin'] },
  { to: '/demo', label: 'Platform demo', icon: FlaskConical },
]

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2">
      <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white shadow-sm">
        <BookOpen className="size-4" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">SmartCourse</span>
    </Link>
  )
}

function HealthDot() {
  // A heartbeat indicator only; the demo page has the detailed, faster view.
  const { data, isError } = useQuery(healthQuery(60_000))
  const healthy = data?.report.status === 'ok'
  const label = isError ? 'Gateway unreachable' : healthy ? 'All systems operational' : data ? 'Degraded' : 'Checking…'
  return (
    <Link
      to="/demo#observability"
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100"
      title={label}
    >
      <span
        className={cn(
          'size-2 rounded-full',
          isError ? 'bg-rose-500' : healthy ? 'bg-emerald-500' : data ? 'bg-amber-500' : 'bg-zinc-300',
        )}
      />
      {label}
    </Link>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const role = useSession((s) => s.user?.role)
  const items = NAV.filter((item) => !item.roles || (role && item.roles.includes(role)))
  return (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Main">
      <div className="mb-5 pt-1">
        <Brand />
      </div>
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-brand-50 text-brand-700' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
            )
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
      <div className="mt-auto">
        <HealthDot />
      </div>
    </nav>
  )
}

function NotificationBell() {
  const { data } = useQuery({ ...inboxQuery(true), select: (page) => page.items.length })
  const unread = data ?? 0
  return (
    <Link
      to="/notifications"
      className="relative grid size-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
      aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
    >
      <Bell className="size-4" />
      {unread > 0 && (
        <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  )
}

function UserMenu() {
  const user = useSession((s) => s.user)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
          Sign in
        </Button>
        <Button size="sm" onClick={() => navigate('/register')}>
          Get started
        </Button>
      </div>
    )
  }

  const initials = user.full_name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  async function handleSignOut() {
    await signOut()
    // Another user's cached data must never render for the next session.
    queryClient.clear()
    navigate('/login')
  }

  return (
    <div className="flex items-center gap-2">
      <NotificationBell />
      <div className="ml-1 flex items-center gap-3 border-l border-zinc-200 pl-3">
        <span className="grid size-8 place-items-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
          {initials}
        </span>
        <div className="hidden leading-tight sm:block">
          <div className="text-sm font-medium text-zinc-900">{user.full_name}</div>
          <div className="text-xs capitalize text-zinc-500">{user.role}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </Button>
      </div>
    </div>
  )
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-zinc-200 bg-white lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-zinc-900/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 animate-fade-in bg-white shadow-xl">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/80 px-4 backdrop-blur sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>
        <div className="flex-1" />
        <UserMenu />
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Keyed so a lazy route's fallback never flashes stale content from the last page. */}
        <Suspense key={location.pathname} fallback={<PageSpinner />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
