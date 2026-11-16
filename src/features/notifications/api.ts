import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { CursorPage, Notification } from '@/lib/api/types'

export const notificationKeys = {
  all: ['notifications'] as const,
  inbox: (unreadOnly: boolean) => [...notificationKeys.all, 'inbox', unreadOnly] as const,
}

export const notificationsApi = {
  inbox: (
    options: { unread?: boolean; limit?: number; token?: string; signal?: AbortSignal } = {},
  ) =>
    api.get<CursorPage<Notification>>('/notifications/me', {
      query: { unread: options.unread || undefined, limit: options.limit ?? 30 },
      token: options.token,
      signal: options.signal,
    }),
  markRead: (id: string) => api.post<Notification>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ marked_read: number }>('/notifications/read-all'),
}

export const inboxQuery = (unreadOnly = false) =>
  queryOptions({
    queryKey: notificationKeys.inbox(unreadOnly),
    queryFn: ({ signal }) => notificationsApi.inbox({ unread: unreadOnly, signal }),
    // Written by event consumers and there's no push channel yet: poll gently (paused
    // while the tab is hidden) and catch up when the user returns to the tab.
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
