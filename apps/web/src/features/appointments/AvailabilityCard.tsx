import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  WEEKDAY_ORDER,
  addDays,
  fmtDayLong,
  fmtMinutes,
  timeToMinutes,
  today,
  ymdOf,
  zonedDayStart,
  type Ymd,
} from './calendar'
import {
  useAddBookingHours,
  useAddTimeOff,
  useDeleteBookingHours,
  useDeleteTimeOff,
  type BookableInstructor,
  type BookingHour,
  type TimeOffRow,
} from './api'

/** Weekday name for a heading, from a date that is known to be that weekday. */
function weekdayLabel(weekday: number, locale: string): string {
  // 2026-08-10 is a Monday, so +weekday-1 lands on the day we want; Sunday (0)
  // wraps to +6.
  const base = Date.UTC(2026, 7, 10)
  const offset = weekday === 0 ? 6 : weekday - 1
  return new Date(base + offset * 86_400_000).toLocaleDateString(locale, {
    timeZone: 'UTC',
    weekday: 'long',
  })
}

/**
 * When the academy is open, and when it is shut anyway.
 *
 * Both halves are one card because they answer the same question. Adding hours
 * takes several weekdays at once — "Mon to Fri, 10:00 to 18:00" is one action,
 * not five.
 */
export function AvailabilityCard({
  academyId,
  tz,
  locale,
  hours,
  timeOff,
  instructors,
  bookingOpen,
  canEdit,
}: {
  academyId: string
  tz: string
  locale: string
  hours: BookingHour[]
  timeOff: TimeOffRow[]
  instructors: BookableInstructor[]
  /** Whether booking is switched on, for the "open but no hours" dead end. */
  bookingOpen: boolean
  canEdit: boolean
}) {
  const { t } = useT()
  const addHours = useAddBookingHours(academyId)
  const delHours = useDeleteBookingHours(academyId)
  const addOff = useAddTimeOff(academyId)
  const delOff = useDeleteTimeOff(academyId)

  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [from, setFrom] = useState('10:00')
  const [to, setTo] = useState('18:00')
  const [hoursError, setHoursError] = useState<string | null>(null)

  const [offOpen, setOffOpen] = useState(false)
  const [offWho, setOffWho] = useState('all')
  const [offFrom, setOffFrom] = useState<Ymd>(() => today(tz))
  const [offTo, setOffTo] = useState<Ymd>(() => today(tz))
  const [offReason, setOffReason] = useState('')
  const [offError, setOffError] = useState<string | null>(null)

  const byWeekday = useMemo(() => {
    const map = new Map<number, BookingHour[]>()
    for (const h of hours) {
      const list = map.get(h.weekday)
      if (list) list.push(h)
      else map.set(h.weekday, [h])
    }
    return map
  }, [hours])

  async function submitHours() {
    if (days.length === 0) return
    if (timeToMinutes(to) <= timeToMinutes(from)) {
      setHoursError(t('appt.hours.range_invalid'))
      return
    }
    setHoursError(null)
    try {
      await addHours.mutateAsync({ weekdays: days, start_time: from, end_time: to })
    } catch (err) {
      setHoursError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  async function submitTimeOff() {
    if (offTo < offFrom) {
      setOffError(t('appt.timeoff.range_invalid'))
      return
    }
    setOffError(null)
    try {
      await addOff.mutateAsync({
        instructor_id: offWho === 'all' ? null : offWho,
        // Whole days, inclusive of the last one — so the stored window runs to
        // the start of the day after.
        starts_at: zonedDayStart(offFrom, tz).toISOString(),
        ends_at: zonedDayStart(addDays(offTo, 1), tz).toISOString(),
        reason: offReason.trim() || null,
      })
      setOffOpen(false)
      setOffReason('')
    } catch (err) {
      setOffError(err instanceof Error ? err.message : t('common.error'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appt.hours.title')}</CardTitle>
        <CardDescription>{t('appt.hours.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="divide-y rounded-md border">
          {WEEKDAY_ORDER.map((weekday) => {
            const ranges = byWeekday.get(weekday) ?? []
            return (
              <li
                key={weekday}
                className="flex flex-wrap items-center gap-2 px-3 py-2"
              >
                <span className="w-28 shrink-0 text-sm font-medium">
                  {weekdayLabel(weekday, locale)}
                </span>
                {ranges.length === 0 ? (
                  <span className="text-muted-foreground text-sm">
                    {t('appt.hours.closed')}
                  </span>
                ) : (
                  ranges.map((r) => (
                    <span
                      key={r.id}
                      className="bg-muted flex items-center gap-1 rounded-md px-2 py-0.5 text-sm tabular-nums"
                    >
                      {fmtMinutes(timeToMinutes(r.start_time))}–
                      {fmtMinutes(timeToMinutes(r.end_time))}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => delHours.mutate(r.id)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={t('appt.hours.remove')}
                        >
                          <X className="size-3" />
                        </button>
                      ) : null}
                    </span>
                  ))
                )}
              </li>
            )
          })}
        </ul>

        {/* Opening booking and adding hours are two separate acts, and with the
            second one missing every day reads "Closed" while the learner is
            told nothing is free. Say which step is outstanding — not that the
            hours are empty, which the list above already shows. */}
        {bookingOpen && hours.length === 0 ? (
          <p className="text-destructive text-sm">{t('appt.hours.none_yet')}</p>
        ) : null}

        {canEdit ? (
          <div className="grid gap-3 rounded-md border p-3">
            <div className="flex flex-wrap gap-3">
              {WEEKDAY_ORDER.map((weekday) => (
                <label
                  key={weekday}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <Checkbox
                    checked={days.includes(weekday)}
                    onCheckedChange={(v) =>
                      setDays((prev) =>
                        v ? [...prev, weekday] : prev.filter((d) => d !== weekday),
                      )
                    }
                  />
                  {weekdayLabel(weekday, locale).slice(0, 3)}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="hours-from">{t('appt.hours.from')}</Label>
                <Input
                  id="hours-from"
                  type="time"
                  className="w-32"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="hours-to">{t('appt.hours.to')}</Label>
                <Input
                  id="hours-to"
                  type="time"
                  className="w-32"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={days.length === 0 || addHours.isPending}
                onClick={submitHours}
              >
                <Plus /> {t('appt.hours.add')}
              </Button>
            </div>
            {hoursError ? (
              <p className="text-destructive text-sm">{hoursError}</p>
            ) : null}
          </div>
        ) : null}

        <Separator />

        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">{t('appt.timeoff.title')}</h3>
              <p className="text-muted-foreground text-sm">
                {t('appt.timeoff.description')}
              </p>
            </div>
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOffOpen((v) => !v)}
              >
                <Plus /> {t('appt.timeoff.add')}
              </Button>
            ) : null}
          </div>

          {offOpen && canEdit ? (
            <div className="grid gap-3 rounded-md border p-3">
              <div className="grid gap-1.5">
                <Label htmlFor="off-who">{t('appt.timeoff.who')}</Label>
                <Select value={offWho} onValueChange={setOffWho}>
                  <SelectTrigger id="off-who">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t('appt.timeoff.whole_academy')}
                    </SelectItem>
                    {instructors.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.full_name ?? t('common.unnamed')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="off-from">{t('appt.timeoff.from')}</Label>
                  <Input
                    id="off-from"
                    type="date"
                    value={offFrom}
                    onChange={(e) =>
                      e.target.value && setOffFrom(e.target.value)
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="off-to">{t('appt.timeoff.to')}</Label>
                  <Input
                    id="off-to"
                    type="date"
                    value={offTo}
                    min={offFrom}
                    onChange={(e) => e.target.value && setOffTo(e.target.value)}
                  />
                </div>
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor="off-reason">{t('appt.timeoff.reason')}</Label>
                  <Input
                    id="off-reason"
                    value={offReason}
                    onChange={(e) => setOffReason(e.target.value)}
                    placeholder={t('appt.timeoff.reason_placeholder')}
                  />
                </div>
                <Button
                  type="button"
                  disabled={addOff.isPending}
                  onClick={submitTimeOff}
                >
                  {t('common.add')}
                </Button>
              </div>
              {offError ? (
                <p className="text-destructive text-sm">{offError}</p>
              ) : null}
            </div>
          ) : null}

          {timeOff.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('appt.timeoff.none')}
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {timeOff.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate">
                      {o.instructors?.full_name ??
                        t('appt.timeoff.whole_academy')}
                      {o.reason ? (
                        <span className="text-muted-foreground">
                          {' '}
                          · {o.reason}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground">
                      {fmtDayLong(ymdOf(o.starts_at, tz), locale)} –{' '}
                      {/* Stored exclusive: step back inside the window to name
                          the last day that is actually closed. */}
                      {fmtDayLong(
                        ymdOf(new Date(new Date(o.ends_at).getTime() - 1000), tz),
                        locale,
                      )}
                    </p>
                  </div>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => delOff.mutate(o.id)}
                    >
                      {t('common.delete')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
