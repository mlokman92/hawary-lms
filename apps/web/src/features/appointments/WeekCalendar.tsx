import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import {
  daysFrom,
  fmtDayShort,
  fmtMinutes,
  minutesOf,
  timeToMinutes,
  today,
  weekdayOf,
  ymdOf,
  type Ymd,
} from './calendar'
import type { AppointmentRow, BookingHour } from './api'

/** Rows on the time axis. Falls back to a working day when nothing is set up. */
const FALLBACK_WINDOW = { from: 8 * 60, to: 20 * 60 }

/**
 * The week, as a time axis crossed with seven days.
 *
 * Only booked / completed / no-show land here. A cancelled session has released
 * its slot and is not something happening on Tuesday, so drawing it would say
 * the diary is fuller than it is.
 */
export function WeekCalendar({
  weekStart,
  appointments,
  hours,
  slotMinutes,
  tz,
  locale,
  onOpen,
}: {
  weekStart: Ymd
  appointments: AppointmentRow[]
  hours: BookingHour[]
  slotMinutes: number
  tz: string
  locale: string
  onOpen: (appointment: AppointmentRow) => void
}) {
  const { t } = useT()
  const days = useMemo(() => daysFrom(weekStart, 7), [weekStart])
  const live = useMemo(
    () => appointments.filter((a) => a.status !== 'cancelled'),
    [appointments],
  )

  // The axis has to cover both the configured window and anything already in
  // the diary — staff can book off-grid, and a session nobody can see is worse
  // than a tall grid.
  const window = useMemo(() => {
    const starts: number[] = []
    const ends: number[] = []
    for (const h of hours) {
      starts.push(timeToMinutes(h.start_time))
      ends.push(timeToMinutes(h.end_time))
    }
    for (const a of live) {
      starts.push(minutesOf(a.starts_at, tz))
      // An appointment ending at midnight reads as 0; treat it as the day's end.
      ends.push(minutesOf(a.ends_at, tz) || 24 * 60)
    }
    if (starts.length === 0) return FALLBACK_WINDOW
    const step = slotMinutes
    const from = Math.floor(Math.min(...starts) / step) * step
    const to = Math.ceil(Math.max(...ends) / step) * step
    return { from, to: Math.max(to, from + step) }
  }, [hours, live, slotMinutes, tz])

  const rows = useMemo(() => {
    const out: number[] = []
    for (let m = window.from; m < window.to; m += slotMinutes) out.push(m)
    // A misconfigured slot length must not hang the browser.
    return out.slice(0, 96)
  }, [window, slotMinutes])

  /** (ymd → minute-row → appointments), so each cell is one map lookup. */
  const byCell = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>()
    for (const a of live) {
      const day = ymdOf(a.starts_at, tz)
      const mins = minutesOf(a.starts_at, tz)
      // The window is built to cover every appointment start, so this only
      // misses when there are no rows at all.
      const row = rows.findLast((r) => r <= mins) ?? rows[0]
      if (row === undefined) continue
      const key = `${day}|${row}`
      const list = map.get(key)
      if (list) list.push(a)
      else map.set(key, [a])
    }
    return map
  }, [live, rows, tz])

  /** Which weekdays the academy is open, for the closed-column shading. */
  const openWeekdays = useMemo(
    () => new Set(hours.map((h) => h.weekday)),
    [hours],
  )

  const todayYmd = today(tz)

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[52rem]">
        {/* Heading row */}
        <div className="grid grid-cols-[4rem_repeat(7,minmax(0,1fr))] border-b">
          <div />
          {days.map((d) => {
            const isToday = d === todayYmd
            const closed = !openWeekdays.has(weekdayOf(d))
            return (
              <div
                key={d}
                className={cn(
                  'px-2 py-2 text-center text-xs font-medium',
                  isToday && 'text-primary',
                  closed && !isToday && 'text-muted-foreground',
                )}
              >
                {fmtDayShort(d, locale)}
              </div>
            )
          })}
        </div>

        {/* Time axis × days */}
        <div className="divide-y">
          {rows.map((minute) => (
            <div
              key={minute}
              className="grid min-h-11 grid-cols-[4rem_repeat(7,minmax(0,1fr))]"
            >
              <div className="text-muted-foreground border-r py-1.5 pr-2 text-right text-xs tabular-nums">
                {fmtMinutes(minute)}
              </div>
              {days.map((d) => {
                const cell = byCell.get(`${d}|${minute}`) ?? []
                const closed = !openWeekdays.has(weekdayOf(d))
                return (
                  <div
                    key={d}
                    className={cn(
                      'space-y-1 border-r p-1 last:border-r-0',
                      closed && 'bg-muted/40',
                    )}
                  >
                    {cell.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onOpen(a)}
                        className={cn(
                          'block w-full rounded-md border px-1.5 py-1 text-left text-xs',
                          'hover:border-foreground/30 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
                          a.status === 'no_show'
                            ? 'border-destructive/40 bg-destructive/10'
                            : a.status === 'completed'
                              ? 'bg-muted'
                              : 'bg-primary/10 border-primary/30',
                        )}
                      >
                        <span className="block truncate font-medium">
                          {a.students?.full_name ?? t('common.unnamed')}
                        </span>
                        <span className="text-muted-foreground block truncate">
                          {a.instructors?.full_name ?? t('common.unnamed')}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
