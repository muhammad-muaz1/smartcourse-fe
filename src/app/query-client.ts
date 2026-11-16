import { MutationCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError, errorMessage } from '@/lib/api/client'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Handle errors locally (e.g. bind to form fields) instead of the global toast. */
      silent?: boolean
      successMessage?: string
    }
  }
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  // 4xx are answers, not transient failures: retrying a 404 or 403 just adds latency.
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
  return failureCount < 2
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Course content changes rarely and every mutation invalidates what it touches,
      // so cached data is served without re-requesting on remount.
      staleTime: 2 * 60_000,
      gcTime: 10 * 60_000,
      retry: shouldRetry,
      // Opt-in per query (notifications only). Refetching everything each time the tab
      // regains visibility is network noise for data our own mutations already keep fresh.
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
  mutationCache: new MutationCache({
    onSuccess: (_data, _vars, _ctx, mutation) => {
      if (mutation.meta?.successMessage) toast.success(mutation.meta.successMessage)
    },
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return
      toast.error(errorMessage(error), {
        description: error instanceof ApiError && error.requestId ? `request_id ${error.requestId}` : undefined,
      })
    },
  }),
})
