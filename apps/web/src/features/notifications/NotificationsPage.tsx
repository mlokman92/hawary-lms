import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/patterns/PageHeader'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Pager } from '@/components/patterns/Pager'
import {
  NOTIFICATION_PAGE_SIZE,
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotificationPage,
  useUnreadCount,
  type Notification,
} from './api'
import { NotificationRow } from './NotificationRow'
import { linkOf } from './link'

/**
 * Every notification, paged, newest first — what the bell's twenty-row panel
 * leads to with "View all". Mounted at `/notifications` and
 * `/learn/notifications`; the academy is a prop for the same reason it is on
 * the bell (see docs/notifications.md → "Which academy it is scoped to").
 */
export function NotificationsPage({ academyId }: { academyId: string | null }) {
  const { t } = useT()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useNotificationPage(academyId, page)
  const { data: unread = 0 } = useUnreadCount(academyId)
  const markRead = useMarkNotificationsRead(academyId)
  const markAll = useMarkAllNotificationsRead(academyId)

  function openRow(row: Notification) {
    if (!row.read_at) markRead.mutate([row.id])
    const to = linkOf(row)
    if (to) navigate(to)
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={t('notif.title')}>
        {unread > 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            {t('notif.mark_all')}
          </Button>
        ) : null}
      </PageHeader>

      <div className="mt-6">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : !data || data.total === 0 ? (
          <EmptyState size="block" icon={Bell} title={t('notif.empty')} />
        ) : (
          <>
            <ul className="divide-y overflow-hidden rounded-xl border">
              {data.rows.map((row) => (
                <li key={row.id}>
                  <NotificationRow row={row} onOpen={openRow} full />
                </li>
              ))}
            </ul>
            <Pager
              page={page}
              total={data.total}
              pageSize={NOTIFICATION_PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  )
}
