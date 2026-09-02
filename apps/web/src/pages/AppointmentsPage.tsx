import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Settings } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { getLang, useT } from '@/lib/i18n'
import { localeFor } from '@/lib/format'
import { PageHeader } from '@/components/patterns/PageHeader'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  addDays,
  fmtWeekRange,
  startOfWeek,
  today,
  type Ymd,
} from '@/features/appointments/calendar'
import { WeekCalendar } from '@/features/appointments/WeekCalendar'
import { AppointmentDialog } from '@/features/appointments/AppointmentDialog'
import { BookForStudentDialog } from '@/features/appointments/BookForStudentDialog'
import {
  DEFAULT_TZ,
  useAcademyAppointments,
  useAcademyTimezone,
  useBookingHours,
  useBookingPool,
  useBookingSettings,
  type AppointmentRow,
} from '@/features/appointments/api'

/**
 * One-to-one sessions: the diary, and nothing else.
 *
 * The three things that decide what goes in it — the policy, the hours, and
 * who is in the pool — live on /appointments/settings. They are set up once and
 * revisited rarely, so they are a destination rather than three cards under the
 * screen staff open every day.
 */
export function AppointmentsPage() {
  const { t } = useT()
  const locale = localeFor(getLang())
  const { activeAcademyId, active } = useAcademy()
  const isAdmin = active?.role === 'admin'

  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(activeAcademyId)
  const { data: settings } = useBookingSettings(activeAcademyId)
  const { data: hours } = useBookingHours(activeAcademyId)
  const { data: pool } = useBookingPool(activeAcademyId)

  const [week, setWeek] = useState<Ymd>(() => startOfWeek(today(tz)))
  // 'all' for both roles, and for a trainer it already means hers: the query
  // returns only her own sessions now that `appointments: admin all, own
  // instructor, own student` decides the read. Her record used to be *seeded*
  // into this filter on her behalf, which looked the same on screen but was a
  // default rather than a boundary — she could set it back to "everyone" and
  // read the whole academy's week.
  const [instructor, setInstructor] = useState('all')

  const [open, setOpen] = useState<AppointmentRow | null>(null)
  const [bookOpen, setBookOpen] = useState(false)

  const {
    data: appointments,
    isLoading,
    error,
  } = useAcademyAppointments(activeAcademyId, tz, week, addDays(week, 7))

  const rows = useMemo(
    () =>
      (appointments ?? []).filter(
        (a) => instructor === 'all' || a.instructor_id === instructor,
      ),
    [appointments, instructor],
  )

  const bookableCount = (pool ?? []).filter(
    (i) => i.is_bookable && i.status === 'active',
  ).length

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={t('appt.title')}
        description={t('appt.subtitle')}
      >
        <Button
          onClick={() => setBookOpen(true)}
          disabled={
            !settings?.is_open ||
            bookableCount === 0 ||
            (hours ?? []).length === 0
          }
        >
          <Plus /> {t('appt.book_for.action')}
        </Button>
        {/* Setup is where booking is switched on at all, so the way in has to
            be on the page that is empty until it is. No longer admin-only: the
            page it leads to now carries an instructor's own blocked dates, and
            a trainer had no way to reach them. What each role finds there is
            decided card by card, on the page itself.

            Labelled, not a bare gear. It was icon-only with an sr-only name,
            which is fine for a control people already know is there — and this
            one they do not: trainers only just got a reason to open it, and
            reported they could not find it. */}
        <Button asChild variant="outline">
          <Link to="/appointments/settings">
            <Settings /> {t('appt.setup.title')}
          </Link>
        </Button>
      </PageHeader>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('appt.calendar.title')}</CardTitle>
          <CardDescription>{fmtWeekRange(week, locale)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label={t('appt.calendar.prev')}
              onClick={() => setWeek(addDays(week, -7))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              onClick={() => setWeek(startOfWeek(today(tz)))}
            >
              {t('appt.calendar.this_week')}
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t('appt.calendar.next')}
              onClick={() => setWeek(addDays(week, 7))}
            >
              <ChevronRight />
            </Button>
            {/* Admin-only for the same reason as the register's: RLS sends a
                trainer her own sessions and nobody else's, so picking another
                name would only empty the grid. */}
            {isAdmin ? (
              <Select value={instructor} onValueChange={setInstructor}>
                <SelectTrigger className="ml-auto w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('appt.calendar.all_instructors')}
                  </SelectItem>
                  {(pool ?? []).map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.full_name ?? t('common.unnamed')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {isLoading ? (
            <LoadingBlock />
          ) : error ? (
            <ErrorBlock error={error} />
          ) : (
            <WeekCalendar
              weekStart={week}
              appointments={rows}
              hours={hours ?? []}
              slotMinutes={settings?.slot_minutes ?? 60}
              tz={tz}
              locale={locale}
              onOpen={setOpen}
            />
          )}
        </CardContent>
      </Card>

      <AppointmentDialog
        academyId={activeAcademyId}
        appointment={open}
        tz={tz}
        locale={locale}
        onOpenChange={(v) => !v && setOpen(null)}
      />
      {settings?.is_open ? (
        <BookForStudentDialog
          academyId={activeAcademyId ?? ''}
          tz={tz}
          mode={settings.assignment_mode}
          open={bookOpen}
          onOpenChange={setBookOpen}
        />
      ) : null}
    </div>
  )
}
