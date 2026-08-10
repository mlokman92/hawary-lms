import { useMemo, useState } from 'react'
import { CalendarClock, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { getLang, useT } from '@/lib/i18n'
import { localeFor } from '@/lib/format'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  addDays,
  fmtWeekRange,
  startOfWeek,
  today,
  type Ymd,
} from '@/features/appointments/calendar'
import { WeekCalendar } from '@/features/appointments/WeekCalendar'
import { AppointmentDialog } from '@/features/appointments/AppointmentDialog'
import { AvailabilityCard } from '@/features/appointments/AvailabilityCard'
import { BookingSettingsCard } from '@/features/appointments/BookingSettingsCard'
import { BookForStudentDialog } from '@/features/appointments/BookForStudentDialog'
import {
  DEFAULT_TZ,
  useAcademyAppointments,
  useAcademyTimezone,
  useBookingHours,
  useBookingPool,
  useBookingSettings,
  useSetInstructorBookable,
  useTimeOff,
  type AppointmentRow,
} from '@/features/appointments/api'

/**
 * One-to-one sessions: the diary first, then the three things that decide what
 * goes in it — the policy, the hours, and who is in the pool.
 *
 * The calendar is what staff open this page for on any ordinary day, so it is
 * on top; the setup cards below it are admin-only and are visited once.
 */
export function AppointmentsPage() {
  const { t } = useT()
  const locale = localeFor(getLang())
  const { activeAcademyId, active } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isAdmin = active?.role === 'admin'

  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(activeAcademyId)
  const { data: settings } = useBookingSettings(activeAcademyId)
  const { data: hours } = useBookingHours(activeAcademyId)
  const { data: timeOff } = useTimeOff(activeAcademyId)
  const { data: pool } = useBookingPool(activeAcademyId)
  const setBookable = useSetInstructorBookable(academyId)

  const [week, setWeek] = useState<Ymd>(() => startOfWeek(today(tz)))
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
      </PageHeader>

      {/* 1 — the diary */}
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

      {isAdmin ? (
        <div className="mt-6 grid gap-6">
          {/* 2 — the policy */}
          <BookingSettingsCard
            academyId={academyId}
            settings={settings ?? null}
            canEdit={isAdmin}
          />

          {/* 3 — when */}
          <AvailabilityCard
            academyId={academyId}
            tz={tz}
            locale={locale}
            hours={hours ?? []}
            timeOff={timeOff ?? []}
            instructors={pool ?? []}
            bookingOpen={!!settings?.is_open}
            canEdit={isAdmin}
          />

          {/* 4 — who */}
          <Card>
            <CardHeader>
              <CardTitle>{t('appt.pool.title')}</CardTitle>
              <CardDescription>{t('appt.pool.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {(pool ?? []).length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title={t('appt.pool.none')}
                  body={t('appt.pool.none_hint')}
                />
              ) : (
                <ul className="divide-y rounded-md border">
                  {(pool ?? []).map((i) => (
                    <li
                      key={i.id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {i.full_name ?? t('common.unnamed')}
                        </p>
                        {i.status !== 'active' ? (
                          <p className="text-muted-foreground text-xs">
                            {t('appt.pool.not_active')}
                          </p>
                        ) : null}
                      </div>
                      <Switch
                        checked={i.is_bookable}
                        // An on_leave instructor is left out by the generator
                        // whatever this says, so the switch would be a lie.
                        disabled={i.status !== 'active'}
                        onCheckedChange={(v) =>
                          setBookable.mutate({ id: i.id, is_bookable: v })
                        }
                        aria-label={t('appt.pool.toggle_aria', {
                          name: i.full_name ?? t('common.unnamed'),
                        })}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <AppointmentDialog
        academyId={activeAcademyId}
        appointment={open}
        tz={tz}
        locale={locale}
        onOpenChange={(v) => !v && setOpen(null)}
      />
      {settings?.is_open ? (
        <BookForStudentDialog
          academyId={academyId}
          tz={tz}
          mode={settings.assignment_mode}
          open={bookOpen}
          onOpenChange={setBookOpen}
        />
      ) : null}
    </div>
  )
}
