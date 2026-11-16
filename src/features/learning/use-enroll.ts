import { useQueryClient } from '@tanstack/react-query'
import { useIdempotentMutation } from '@/lib/use-idempotent-mutation'
import { learningApi, learningKeys } from './api'

export function useEnroll(courseId: string) {
  const queryClient = useQueryClient()
  return useIdempotentMutation(
    async (_: void, idempotencyKey) => (await learningApi.enroll(courseId, { idempotencyKey })).data,
    {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: learningKeys.all }),
      // Business-rule errors (COURSE_FULL, ALREADY_ENROLLED) get friendly copy at the call site.
      meta: { silent: true },
    },
  )
}
