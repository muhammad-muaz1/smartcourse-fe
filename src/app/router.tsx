import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/components/layout/app-shell'
import { RouteError } from '@/components/layout/route-error'
import { PageSpinner } from '@/components/ui/primitives'
import { HomeRedirect, RedirectIfAuthenticated, RequireAuth } from '@/features/auth/guards'

/**
 * Every page is a lazy route: the catalogue visitor never downloads the instructor
 * editor, and charts (the heaviest dependency) load only on analytics and demo pages.
 */
const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({
  Component: (await load()).default,
})

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    // Shown while the first lazy route module loads on a cold start.
    hydrateFallbackElement: <PageSpinner />,
    children: [
      {
        element: <RedirectIfAuthenticated />,
        children: [
          { path: '/login', lazy: page(() => import('@/features/auth/login-page')) },
          { path: '/register', lazy: page(() => import('@/features/auth/register-page')) },
          { path: '/forgot-password', lazy: page(() => import('@/features/auth/forgot-password-page')) },
          { path: '/reset-password', lazy: page(() => import('@/features/auth/reset-password-page')) },
        ],
      },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomeRedirect /> },
          { path: 'courses', lazy: page(() => import('@/features/courses/catalog-page')) },
          { path: 'courses/:courseId', lazy: page(() => import('@/features/courses/course-detail-page')) },
          { path: 'demo', lazy: page(() => import('@/features/demo/demo-page')) },
          {
            element: <RequireAuth />,
            children: [
              { path: 'notifications', lazy: page(() => import('@/features/notifications/notifications-page')) },
            ],
          },
          {
            element: <RequireAuth roles={['student']} />,
            children: [
              { path: 'learning', lazy: page(() => import('@/features/learning/my-learning-page')) },
              { path: 'learning/:enrollmentId', lazy: page(() => import('@/features/learning/course-player-page')) },
            ],
          },
          {
            element: <RequireAuth roles={['instructor', 'admin']} />,
            children: [
              { path: 'instructor/courses', lazy: page(() => import('@/features/instructor/my-courses-page')) },
              { path: 'instructor/courses/:courseId', lazy: page(() => import('@/features/instructor/course-editor-page')) },
              { path: 'analytics', lazy: page(() => import('@/features/analytics/analytics-page')) },
            ],
          },
          { path: '*', lazy: page(() => import('@/components/layout/not-found-page')) },
        ],
      },
    ],
  },
])
