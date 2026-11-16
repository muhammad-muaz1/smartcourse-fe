import { useMutation, type UseMutationOptions } from '@tanstack/react-query'
import { useRef } from 'react'
import { ApiError, newIdempotencyKey } from '@/lib/api/client'

/**
 * A mutation for the backend's ★ endpoints, with a retry-stable Idempotency-Key.
 *
 * The key represents one user *intent*. It survives network failures and 5xx, so a retry
 * replays the original request and the server returns the stored response instead of
 * acting twice. It is rotated only after a definitive answer — success or a 4xx such as
 * COURSE_FULL — so the next, deliberately new attempt gets a fresh key.
 */
export function useIdempotentMutation<TData, TVariables = void>(
  mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<TData>,
  options: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'> = {},
) {
  const keyRef = useRef<string | null>(null)
  return useMutation<TData, Error, TVariables>({
    ...options,
    mutationFn: (variables) => {
      keyRef.current ??= newIdempotencyKey()
      return mutationFn(variables, keyRef.current)
    },
    onSettled: (data, error, variables, context, mutationContext) => {
      const definitive = !error || (error instanceof ApiError && error.status >= 400 && error.status < 500)
      if (definitive) keyRef.current = null
      return options.onSettled?.(data, error, variables, context, mutationContext)
    },
  })
}
