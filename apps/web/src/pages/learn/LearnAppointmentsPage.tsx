import { useEffect, useMemo, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { getLang, useT } from '@/lib/i18n'
import { localeFor } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TONE_CLASS } from '@/lib/tone'
import { PageHeader } from '@/components/patterns/PageHeader'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  addDays,
  fmtDayShort,
  fmtRange,
  fmtTime,
  fmtWhen,
  today,
  ymdOf,
  type Ymd,
} from '@/features/appointments/calendar'
import {
  APPOINTMENT_STATUS,
  DEFAULT_TZ,
  useAcademyTimezone,
  useBookAppointment,
  useBookingOptions,
  useCancelAppointment,
  useMyAppointments,
  type OpenSlot,
} from '@/features/appointments/api'
import { errorMessage } from '@/lib/errors'

/** How far ahead one call reaches. The server clamps to the academy horizon. */
const WINDOW_DAYS = 62

/**
 * Book a one-to-one session, and see the ones already booked.
 *
 * Under round robin the server does not tell the client who is free, so there
 * is nothing to render and no teacher picker — which is the point of the mode.
 * The instructor's name appears the moment the booking exists, because by then
 * the student needs to know who they are meeting.
 */
export function LearnAppointmentsPage() {
  const { t, tn } = useT()
  const locale = localeFor(getLang())
  const { academyId } = useStudentAcademy()

  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(academyId)
  const from = today(tz)
  const {
    data: options,
    isLoading,
    error,
  } = useBookingOptions(academyId, from, addDays(from, WINDOW_DAYS))
  const { data: mine } = useMyAppointments(academyId)
  const book = useBookAppointment(academyId)
  const cancel = useCancelAppointment(academyId)

  const [day, setDay] = useState<Ymd | null>(null)
  const [startsAt, setStartsAt] = useState('')
  const [instructorId, setInstructorId] = useState('')
  const [note, setNote] = useState('')
  const [bookError, setBookError] = useState<string | null>(null)

  /** starts_at → the slot, grouped by the day it falls on locally. */
  const byDay = useMemo(() => {
    const map = new Map<Ymd, OpenSlot[]>()
    for (const s of options?.slots ?? []) {
      const d = ymdOf(s.starts_at, tz)
      const list = map.get(d)
      if (list) list.push(s)
      else map.set(d, [s])
    }
    return map
  }, [options, tz])

  /** Every day with something free, in order. The strip scrolls through these
   *  rather than paging a calendar: a day with no slots is not a destination. */
  const openDays = useMemo(() => [...byDay.keys()].sort(), [byDay])

  // Land on the first day that has something, and go back to it if the chosen
  // day empties out — booking its last slot is the ordinary way that happens.
  useEffect(() => {
    if (day !== null && byDay.has(day)) return
    setDay([...byDay.keys()].sort()[0] ?? null)
  }, [byDay, day])

  const slots = day ? (byDay.get(day) ?? []) : []
  const slot = slots.find((s) => s.starts_at === startsAt) ?? null
  const choose = options?.assignment_mode === 'student_choice'

  const upcoming = (mine ?? []).filter(
    (a) => a.status === 'booked' && new Date(a.starts_at) > new Date(),
  )
  const past = (mine ?? []).filter((a) => !upcoming.includes(a))

  const atCap =
    options?.max_open_per_student != null &&
    (options.open_count ?? 0) >= options.max_open_per_student

  async function submit() {
    if (!startsAt) return
    setBookError(null)
    try {
      await book.mutateAsync({
        startsAt,
        instructorId: choose ? instructorId || null : null,
        note: note.trim() || null,
      })
      setStartsAt('')
      setInstructorId('')
      setNote('')
    } catch (err) {
      setBookError(errorMessage(err, t('common.error')))
    }
  }

  if (isLoading) return <LoadingBlock className="mt-6" />
  if (error) return <ErrorBlock error={error} className="mt-6" />

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={t('appt.title')} description={t('appt.learn.subtitle')} />

      {!options?.is_open ? (
        <EmptyState
          className="mt-6"
          size="block"
          icon={CalendarClock}
          title={t('appt.learn.closed')}
          body={t('appt.learn.closed_hint')}
        />
      ) : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('appt.learn.book_title')}</CardTitle>
            <CardDescription>
              {t('appt.learn.book_description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {atCap ? (
              <p className="text-muted-foreground text-sm">
                {t('appt.learn.at_cap')}
              </p>
            ) : byDay.size === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t('appt.learn.nothing_free')}
              </p>
            ) : (
              <>
                {/* Days — only the ones with something free, so every chip
                    is actionable. That is also why this scrolls instead of
                    paging: seven fixed columns left about 34px per day on a
                    phone, and somebody who wants next Tuesday should swipe to
                    it rather than work out which week it falls in. */}
                <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
                  {openDays.map((d) => {
                    const count = byDay.get(d)?.length ?? 0
                    const chosen = day === d
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          setDay(d)
                          setStartsAt('')
                        }}
                        aria-pressed={chosen}
                        className={cn(
                          'flex min-w-20 shrink-0 snap-start flex-col items-center gap-0.5',
                          'rounded-lg border px-3 py-2',
                          'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
                          chosen
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'hover:border-foreground/30',
                        )}
                      >
                        <span className="text-sm font-medium whitespace-nowrap">
                          {fmtDayShort(d, locale)}
                        </span>
                        <span
                          className={cn(
                            'text-xs tabular-nums',
                            chosen
                              ? 'text-primary-foreground/80'
                              : 'text-muted-foreground',
                          )}
                        >
                          {tn('appt.learn.day_slots', count)}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Times. A grid rather than wrapped flex so the columns line
                    up, and 44px tall because this is the control people press
                    with a thumb. */}
                {slots.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t('appt.learn.pick_day')}
                  </p>
                ) : (
                  <div className="grid gap-2">
                    <p className="text-muted-foreground text-xs">
                      {tn('appt.learn.times_available', slots.length)}
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.map((s) => (
                        <button
                          key={s.starts_at}
                          type="button"
                          onClick={() => {
                            setStartsAt(s.starts_at)
                            setInstructorId('')
                          }}
                          className={cn(
                            'flex min-h-11 items-center justify-center rounded-md border px-2 text-sm tabular-nums',
                            'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
                            startsAt === s.starts_at
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'hover:border-foreground/30',
                          )}
                        >
                          {fmtTime(s.starts_at, tz)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Instructor, only when the academy lets the student choose */}
                {slot && choose ? (
                  <div className="grid gap-2">
                    <Label htmlFor="learn-instructor">
                      {t('appt.learn.instructor')}
                    </Label>
                    <Select
                      value={instructorId}
                      onValueChange={setInstructorId}
                    >
                      <SelectTrigger id="learn-instructor">
                        <SelectValue
                          placeholder={t('appt.learn.instructor_placeholder')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(slot.instructors ?? []).map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.full_name ?? t('common.unnamed')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {slot ? (
                  <div className="grid gap-2">
                    <Label htmlFor="learn-note">{t('appt.learn.note')}</Label>
                    <Input
                      id="learn-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t('appt.learn.note_placeholder')}
                    />
                  </div>
                ) : null}

                {bookError ? (
                  <p className="text-destructive text-sm">{bookError}</p>
                ) : null}

                <div>
                  <Button
                    type="button"
                    disabled={
                      !startsAt ||
                      (choose && !instructorId) ||
                      book.isPending
                    }
                    onClick={submit}
                  >
                    {book.isPending ? t('appt.booking') : t('appt.book')}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mine */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('appt.learn.mine')}</CardTitle>
        </CardHeader>
        <CardContent>
          {(mine ?? []).length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title={t('appt.learn.none')}
              body={t('appt.learn.none_hint')}
            />
          ) : (
            <ul className="divide-y rounded-md border">
              {[...upcoming, ...past].map((a) => {
                const meta = APPOINTMENT_STATUS[a.status]
                const isUpcoming = upcoming.includes(a)
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {fmtWhen(a.starts_at, tz, locale)} ·{' '}
                        {fmtRange(a.starts_at, a.ends_at, tz)}
                      </p>
                      <p className="text-muted-foreground truncate text-sm">
                        {a.instructor.full_name ?? t('common.unnamed')}
                      </p>
                      <p className={cn('text-xs', TONE_CLASS[meta.tone])}>
                        {t(meta.labelKey)}
                      </p>
                    </div>
                    {isUpcoming ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate({ id: a.id })}
                      >
                        {t('appt.action.cancel')}
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
          {cancel.error ? (
            <p className="text-destructive mt-3 text-sm">
              {cancel.error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
