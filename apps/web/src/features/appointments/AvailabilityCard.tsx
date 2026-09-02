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
  WEEKDAY_ORDER,
  fmtMinutes,
  timeToMinutes,
} from './calendar'
import {
  useAddBookingHours,
  useDeleteBookingHours,
  type BookingHour,
} from './api'
import { errorMessage } from '@/lib/errors'

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
 * When the academy is open.
 *
 * Adding hours takes several weekdays at once — "Mon to Fri, 10:00 to 18:00" is
 * one action, not five.
 *
 * Closed dates used to be the lower half of this card, on the argument that
 * when the academy is open and when it is shut anyway are the same question.
 * They now live in `BlockedDatesCard`, because the two halves turned out to
 * have different audiences: opening hours are academy policy and an admin's to
 * set, while blocking days off is something an instructor does for themselves.
 */
export function AvailabilityCard({
  academyId,
  locale,
  hours,
  bookingOpen,
  canEdit,
}: {
  academyId: string
  locale: string
  hours: BookingHour[]
  /** Whether booking is switched on, for the "open but no hours" dead end. */
  bookingOpen: boolean
  canEdit: boolean
}) {
  const { t } = useT()
  const addHours = useAddBookingHours(academyId)
  const delHours = useDeleteBookingHours(academyId)

  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [from, setFrom] = useState('10:00')
  const [to, setTo] = useState('18:00')
  const [hoursError, setHoursError] = useState<string | null>(null)

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
      setHoursError(errorMessage(err, t('common.error')))
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

      </CardContent>
    </Card>
  )
}
