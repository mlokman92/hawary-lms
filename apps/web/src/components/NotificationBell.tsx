import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
  useUnreadCount,
  type Notification,
} from '@/features/notifications/api'
import { NotificationRow } from '@/features/notifications/NotificationRow'
import { linkOf } from '@/features/notifications/link'

/**
 * The notification centre: one bell, top right of the header, in both shells.
 *
 * It lives in `SidebarShell` rather than in each layout because it is the one
 * header control both surfaces need — a student waiting to hear that their
 * session is confirmed and a trainer waiting to hear that one was booked are
 * the same person as far as this is concerned.
 *
 * A row arrives as an event (`kind` + `data`), never as a sentence, so the
 * wording is assembled here and follows the reader's language.
 *
 * `academyId` is a PROP, not something this component reads for itself. It used
 * to call `useAcademy()`, which is the back-office's staff-scoped context and
 * is null for ever for a student-only account — so the learner's bell was
 * permanently empty. `SidebarShell` now hands each shell's own academy down.
 */
export function NotificationBell({
  academyId,
  allHref,
}: {
  academyId: string | null
  /** The shell's full notifications page. */
  allHref: string
}) {
  const { t } = useT()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const { data: unread = 0 } = useUnreadCount(academyId)
  // The rows are only worth fetching once somebody asks for them; the badge is
  // what polls.
  const { data: rows = [] } = useNotifications(open ? academyId : null)
  const markRead = useMarkNotificationsRead(academyId)
  const markAll = useMarkAllNotificationsRead(academyId)

  function openRow(row: Notification) {
    if (!row.read_at) markRead.mutate([row.id])
    setOpen(false)
    const to = linkOf(row)
    if (to) navigate(to)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative ml-auto"
          aria-label={
            unread > 0
              ? `${t('notif.open')} — ${t('notif.unread_aria', { count: unread })}`
              : t('notif.open')
          }
        >
          <Bell />
          {/* Drawn only above zero: a badge showing "0" is decoration, and its
              absence already says the same thing. Same rule as the sidebar. */}
          {unread > 0 ? (
            <span className="bg-destructive text-background absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <p className="text-sm font-medium">{t('notif.title')}</p>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              {t('notif.mark_all')}
            </Button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <p className="text-muted-foreground border-t px-3 py-6 text-center text-sm">
            {t('notif.empty')}
          </p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto border-t">
            {rows.map((row) => (
              <li key={row.id}>
                <NotificationRow row={row} onOpen={openRow} />
              </li>
            ))}
          </ul>
        )}

        <Link
          to={allHref}
          onClick={() => setOpen(false)}
          className="hover:bg-muted/60 block border-t px-3 py-2 text-center text-sm font-medium transition-colors"
        >
          {t('notif.view_all')}
        </Link>
      </PopoverContent>
    </Popover>
  )
}
