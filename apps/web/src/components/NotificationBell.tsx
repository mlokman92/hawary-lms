import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { getLang, useT } from '@/lib/i18n'
import { localeFor } from '@/lib/format'
import { cn } from '@/lib/utils'
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
import {
  apptData,
  detailOf,
  isReportKind,
  moneyData,
  reportData,
  titleOf,
  workData,
} from '@/features/notifications/render'

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
export function NotificationBell({ academyId }: { academyId: string | null }) {
  const { t } = useT()
  const locale = localeFor(getLang())
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
                <button
                  type="button"
                  onClick={() => openRow(row)}
                  className={cn(
                    'hover:bg-muted/60 flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors',
                    !row.read_at && 'bg-muted/30',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1.5 size-1.5 shrink-0 rounded-full',
                      row.read_at ? 'bg-transparent' : 'bg-destructive',
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {titleOf(row, t)}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {detailOf(row, locale)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Where the row leads. The words are in `features/notifications/render.ts`,
 * shared with the mobile apps; the route is this surface's own.
 *
 * `role` decides, not the shell the reader happens to be standing in: the
 * notification was addressed to them as a student or as an instructor, and
 * that is the surface where the session lives.
 *
 * An instructor lands on the **register**, not the diary. The diary is one
 * week: a session booked for next month is not on it, so following a
 * notification about one would show a grid with nothing in it and no clue
 * where the session went. The register opens on her own upcoming sessions,
 * soonest first, which is where the row she just read actually is.
 */
function linkOf(row: Notification): string | null {
  if (isReportKind(row)) {
    // Straight to the thread, on the side the reader was addressed as. Unlike
    // the appointment case there is no windowing problem to route around: a
    // report has an id and a page of its own, whatever its status.
    const d = reportData(row)
    if (!d) return null
    return d.role === 'instructor'
      ? `/lpkc/${d.report_id}`
      : `/learn/reports/${d.report_id}`
  }
  if (row.kind === 'work_marked' || row.kind === 'work_due') {
    const d = workData(row)
    if (!d) return null
    return d.work === 'assessment'
      ? `/learn/assessments/${d.work_id}`
      : `/learn/assignments/${d.work_id}`
  }
  if (row.kind === 'invoice_issued' || row.kind === 'payment_received') {
    const d = moneyData(row)
    return d ? `/learn/billing/${d.invoice_id}` : null
  }
  // Announcements are read in the mobile apps; the web has no page for them,
  // so the row carries the message's first lines and leads nowhere.
  if (row.kind === 'announcement') return null
  const d = apptData(row)
  if (!d) return null
  return d.role === 'instructor' ? '/appointments/list' : '/learn/appointments'
}

