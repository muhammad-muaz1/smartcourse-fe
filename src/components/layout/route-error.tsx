import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { ErrorState } from '@/components/ui/primitives'

/** Last line of defence: a render crash shows this instead of a white screen. */
export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unexpected error'

  return (
    <div className="grid min-h-dvh place-items-center bg-zinc-50 p-6">
      <div className="text-center">
        <ErrorState error={new Error(message)} onRetry={() => window.location.reload()} />
        <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-700">
          Back to home
        </Link>
      </div>
    </div>
  )
}
