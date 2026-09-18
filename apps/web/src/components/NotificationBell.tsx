import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { getLang, useT, type TFn } from '@/lib/i18n'
import { localeFor } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { DEFAULT_TZ } from '@/features/appointments/api'
import { fmtWhen } from '@/features/appointments/calendar'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
  useUnreadCount,
  type AppointmentBookedData,
  type Notification,
  type ReportEventData,
} from '@/features/notifications/api'
import { REPORT_STATUS } from '@/features/reports/api'

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
 */
export function NotificationBell() {
  const { t } = useT()
  const locale = localeFor(getLang())
  const navigate = useNavigate()
  const { activeAcademyId } = useAcademy()

  const [open, setOpen] = useState(false)
  const { data: unread = 0 } = useUnreadCount(activeAcademyId)
  // The rows are only worth fetching once somebody asks for them; the badge is
  // what polls.
  const { data: rows = [] } = useNotifications(open ? activeAcademyId : null)
  const markRead = useMarkNotificationsRead(activeAcademyId)
  const markAll = useMarkAllNotificationsRead(activeAcademyId)

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

// ---------------------------------------------------------------------------
// Seven event kinds in two families. Each new kind adds a case to these three
// functions — that is the whole cost of a new notification, and none of it is a
// schema change.
//
// Within a family the payload is shared, so only `titleOf` branches: for an
// appointment, where the row leads and when the session is are the same
// question whatever became of it; for a report, the thread is the thread.
// The two families are told apart by `kind`, not by sniffing `data`.
// ---------------------------------------------------------------------------

const REPORT_KINDS = [
  'report_submitted',
  'report_comment',
  'report_status',
  'report_assigned',
] as const

const isReport = (row: Notification): boolean =>
  (REPORT_KINDS as readonly string[]).includes(row.kind)

function reportData(row: Notification): ReportEventData | null {
  const d = row.data as Partial<ReportEventData> | null
  return d && typeof d === 'object' && typeof d.report_id === 'string'
    ? (d as ReportEventData)
    : null
}

function reportTitle(row: Notification, t: TFn): string {
  const d = reportData(row)
  const name = d?.with_name?.trim() || t('notif.someone')
  const asInstructor = d?.role === 'instructor'
  // The status is rendered through the same map the queue's badges use, so a
  // notification and the thread it opens never disagree about what to call it.
  const status = d?.status ? t(REPORT_STATUS[d.status].labelKey) : ''
  switch (row.kind) {
    case 'report_comment':
      return asInstructor
        ? t('notif.report_comment.instructor', { name })
        : t('notif.report_comment.student', { name })
    case 'report_status':
      return asInstructor
        ? t('notif.report_status.instructor', { name, status })
        : t('notif.report_status.student', { name, status })
    case 'report_assigned':
      return asInstructor
        ? t('notif.report_assigned.instructor', { name })
        : t('notif.report_assigned.student', { name })
    default:
      return asInstructor
        ? t('notif.report_submitted.instructor', { name })
        : t('notif.report_submitted.student')
  }
}

function apptData(row: Notification): AppointmentBookedData | null {
  const d = row.data as Partial<AppointmentBookedData> | null
  return d && typeof d === 'object' && typeof d.starts_at === 'string'
    ? (d as AppointmentBookedData)
    : null
}

function titleOf(row: Notification, t: TFn): string {
  if (isReport(row)) return reportTitle(row, t)
  const d = apptData(row)
  const name = d?.with_name?.trim() || t('notif.someone')
  const asInstructor = d?.role === 'instructor'
  if (row.kind === 'appointment_reassigned') {
    return asInstructor
      ? t('notif.appt_moved.instructor', { name })
      : t('notif.appt_moved.student', { name })
  }
  if (row.kind === 'appointment_cancelled') {
    return asInstructor
      ? t('notif.appt_cancelled.instructor', { name })
      : t('notif.appt_cancelled.student', { name })
  }
  return asInstructor
    ? t('notif.appt_booked.instructor', { name })
    : t('notif.appt_booked.student', { name })
}

/**
 * The second line. For a session that is when it is, in the academy's zone and
 * snapshotted on the row; for a report it is which batch, on which course —
 * "LPKC, slide dan portfolio · DKM1" is what tells two threads apart when a
 * student has one per course.
 */
function detailOf(row: Notification, locale: string): string {
  if (isReport(row)) {
    const d = reportData(row)
    return d ? [d.title, d.course].filter(Boolean).join(' · ') : ''
  }
  const d = apptData(row)
  return d ? fmtWhen(d.starts_at, d.tz || DEFAULT_TZ, locale) : ''
}

/**
 * Where the row leads. `role` decides, not the shell the reader happens to be
 * standing in: the notification was addressed to them as a student or as an
 * instructor, and that is the surface where the session lives.
 *
 * An instructor lands on the **register**, not the diary. The diary is one
 * week: a session booked for next month is not on it, so following a
 * notification about one would show a grid with nothing in it and no clue
 * where the session went. The register opens on her own upcoming sessions,
 * soonest first, which is where the row she just read actually is.
 */
function linkOf(row: Notification): string | null {
  if (isReport(row)) {
    // Straight to the thread, on the side the reader was addressed as. Unlike
    // the appointment case there is no windowing problem to route around: a
    // report has an id and a page of its own, whatever its status.
    const d = reportData(row)
    if (!d) return null
    return d.role === 'instructor'
      ? `/reports/${d.report_id}`
      : `/learn/reports/${d.report_id}`
  }
  const d = apptData(row)
  if (!d) return null
  return d.role === 'instructor' ? '/appointments/list' : '/learn/appointments'
}
