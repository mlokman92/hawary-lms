import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { getLang, useT } from '@/lib/i18n'
import { localeFor } from '@/lib/format'
import { SlotPicker } from '@/features/appointments/SlotPicker'
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
  fmtRange,
  fmtWhen,
  today,
} from '@/features/appointments/calendar'
import {
  APPOINTMENT_STATUS,
  DEFAULT_TZ,
  useAcademyTimezone,
  useBookAppointment,
  useBookingOptions,
  useCancelAppointment,
  useMyAppointments,
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
  const { t } = useT()
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

  const [startsAt, setStartsAt] = useState('')
  const [instructorId, setInstructorId] = useState('')
  const [note, setNote] = useState('')
  const [bookError, setBookError] = useState<string | null>(null)

  const openSlots = options?.slots ?? []
  const slot = openSlots.find((s) => s.starts_at === startsAt) ?? null
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
            ) : openSlots.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t('appt.learn.nothing_free')}
              </p>
            ) : (
              <>
                <SlotPicker
                  slots={openSlots}
                  tz={tz}
                  locale={locale}
                  value={startsAt}
                  onChange={(v) => {
                    setStartsAt(v)
                    setInstructorId('')
                  }}
                  emptyLabel={t('appt.learn.nothing_free')}
                />

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
