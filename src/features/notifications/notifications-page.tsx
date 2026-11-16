import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, Bell, BookOpenCheck, CheckCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives'
import type { Notification, NotificationKind } from '@/lib/api/types'
import { useDocumentTitle } from '@/lib/hooks'
import { cn, timeAgo } from '@/lib/utils'
import { inboxQuery, notificationKeys, notificationsApi } from './api'

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  account_welcome: Sparkles,
  course_welcome: BookOpenCheck,
  course_completed: Award,
}

function NotificationRow({ item, onRead }: { item: Notification; onRead: (id: string) => void }) {
  const Icon = KIND_ICON[item.kind] ?? Bell
  const unread = !item.read_at
  return (
    <li
      className={cn(
        'flex gap-4 rounded-xl border bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
        unread ? 'border-brand-200 bg-brand-50/40' : 'border-zinc-200',
      )}
    >
      <div className={cn('grid size-9 shrink-0 place-items-center rounded-full', unread ? 'bg-brand-100 text-brand-700' : 'bg-zinc-100 text-zinc-400')}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('text-sm', unread ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-700')}>{item.subject}</p>
          {item.status === 'failed' && <Badge tone="danger">delivery failed</Badge>}
          {item.status === 'pending' && <Badge tone="warning">delivering</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-zinc-600">{item.body}</p>
        <p className="mt-1 text-xs text-zinc-400">{timeAgo(item.created_at)}</p>
      </div>
      {unread && (
        <Button variant="ghost" size="sm" onClick={() => onRead(item.id)}>
          Mark read
        </Button>
      )}
    </li>
  )
}

export default function NotificationsPage() {
  useDocumentTitle('Notifications')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const queryClient = useQueryClient()
  const inbox = useQuery(inboxQuery(unreadOnly))

  const invalidate = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all })
  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: invalidate })
  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: invalidate,
    meta: { successMessage: 'All caught up' },
  })

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Written by background consumers when platform events happen — never sent directly by the API."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setUnreadOnly((v) => !v)}>
              {unreadOnly ? 'Show all' : 'Unread only'}
            </Button>
            <Button size="sm" icon={<CheckCheck className="size-4" />} loading={markAll.isPending} onClick={() => markAll.mutate()}>
              Mark all read
            </Button>
          </>
        }
      />
      {inbox.isPending ? (
        <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : inbox.isError ? (
        <Card><ErrorState error={inbox.error} onRetry={() => void inbox.refetch()} /></Card>
      ) : inbox.data.items.length === 0 ? (
        <Card><EmptyState icon={<Bell className="size-5" />} title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} /></Card>
      ) : (
        <ul className="space-y-3">
          {inbox.data.items.map((item) => (
            <NotificationRow key={item.id} item={item} onRead={(id) => markRead.mutate(id)} />
          ))}
        </ul>
      )}
    </>
  )
}
