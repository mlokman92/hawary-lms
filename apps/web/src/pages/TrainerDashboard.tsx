import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, UserX } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { useT, type TFn } from '@/lib/i18n'
import { fmtDays, localeFor, personName } from '@/lib/format'
import { PageHeader } from '@/components/patterns/PageHeader'
import { ListCard } from '@/components/patterns/ListCard'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { useMyInstructorRecord } from '@/features/profile/api'
import { useAcademyQueue, useMyGradableCourses, type QueueRow } from '@/features/grading/api'
import { AppointmentDialog } from '@/features/appointments/AppointmentDialog'
import {
  DEFAULT_TZ,
  useAcademyTimezone,
  useMyUnclosedSessions,
  useMyUpcomingSessions,
  type AppointmentRow,
} from '@/features/appointments/api'
import { fmtDayLong, fmtRange, today, ymdOf } from '@/features/appointments/calendar'

/**
 * The trainer's dashboard.
 *
 * The admin's dashboard answers "how is the academy doing" — money, growth,
 * setup. A trainer cannot act on any of that and, since the money policies
 * became `app.is_admin`, cannot read it either. Their question is the other
 * one: *what is in front of me* — sessions I am teaching, work waiting for a
 * mark.
 *
 * This file must import NOTHING from `@/features/payments`,
 * `@/features/settings/api` or `@/features/dashboard/api`, and must never
 * import `formatMYR`. That grep is the regression test, and it is why this is a
 * separate component rather than a branch inside `Dashboard.tsx`: hooks cannot
 * be skipped conditionally, so an `isAdmin &&` in there would still fire
 * `useInvoices` for a trainer even with every card hidden.
 *
 * No stat-tile row and no chart. A tile whose value is the length of the list
 * directly beneath it is the decoration this repo forbids; there are three
 * questions here and three lists that answer them.
 */

/** How far ahead "your week" looks. A week is the unit a teaching diary uses. */
const SESSION_DAYS = 7

/** Rows per list. Enough to cover a busy day without becoming the real page. */
const SESSION_LIMIT = 10
const MARKING_LIMIT = 5

const daysSince = (iso: string | null) =>
  iso === null ? null : Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)

/** Sessions in start order, split into the days they fall on. */
function byDay(rows: AppointmentRow[], tz: string) {
  const days: { ymd: string; rows: AppointmentRow[] }[] = []
  for (const row of rows) {
    const ymd = ymdOf(row.starts_at, tz)
    const last = days[days.length - 1]
    if (last?.ymd === ymd) last.rows.push(row)
    else days.push({ ymd, rows: [row] })
  }
  return days
}

function SessionRow({
  appointment,
  tz,
  onOpen,
}: {
  appointment: AppointmentRow
  tz: string
  onOpen: () => void
}) {
  const { t } = useT()
  const name =
    personName(appointment.students?.full_name) ?? t('common.unnamed')
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
      >
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {fmtRange(appointment.starts_at, appointment.ends_at, tz)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          {appointment.note ? (
            <span className="text-muted-foreground block truncate text-xs">
              {appointment.note}
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">
          {appointment.students?.student_no}
        </span>
      </button>
    </li>
  )
}

/**
 * One waiting mark. The right-hand figure is how long it has waited, not when
 * it arrived: "32 days" is a deadline, "28 Jul 2026, 17:04" is arithmetic
 * homework.
 */
function MarkingRow({ row, course }: { row: QueueRow; course?: string }) {
  const { t } = useT()
  const waited = daysSince(row.submittedAt)
  return (
    <li>
      <Link
        to={row.href}
        className="hover:bg-muted/50 flex items-center gap-3 px-4 py-2.5 transition-colors"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {personName(row.student?.full_name) ?? t('common.unnamed')}
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            {[row.title, course].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span
          className={
            waited !== null && waited >= 7
              ? 'text-destructive shrink-0 text-xs font-medium tabular-nums'
              : 'text-muted-foreground shrink-0 text-xs tabular-nums'
          }
        >
          {fmtDays(waited)}
        </span>
      </Link>
    </li>
  )
}

/** The shared body of the two marking cards. */
function MarkingList({
  rows,
  courses,
  hasCourses,
  t,
}: {
  rows: QueueRow[]
  courses: Map<string, string>
  hasCourses: boolean
  t: TFn
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-8 text-center text-sm">
        {/* Two different facts, and telling them apart is the whole point:
            `course_instructors` is sparsely filled, so most trainers have
            nothing to mark because nobody assigned them a course — not because
            the students are all up to date. */}
        {hasCourses
          ? t('grading.queue.awaiting_empty')
          : t('dash.trainer.no_courses')}
      </p>
    )
  }
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <MarkingRow key={r.id} row={r} course={courses.get(r.courseId)} />
      ))}
    </ul>
  )
}

export function TrainerDashboard() {
  const { t, tn, lang } = useT()
  const { activeAcademyId } = useAcademy()
  const locale = localeFor(lang)
  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(activeAcademyId)

  // Identity. A trainer's sessions and their gradable courses both hang off
  // the instructors record, so one missing record explains both empty lists.
  const instructor = useMyInstructorRecord(activeAcademyId)
  const instructorId = instructor.data?.id ?? null

  const unclosed = useMyUnclosedSessions(activeAcademyId, instructorId)
  const upcoming = useMyUpcomingSessions(
    activeAcademyId,
    instructorId,
    SESSION_DAYS,
  )
  // RLS (`app.can_grade_assessment` → `app.can_grade_course`) already narrows
  // these to the courses this trainer teaches, so there is no course filter
  // here — a client-side one would be a second, weaker copy of the rule.
  const attempts = useAcademyQueue('assessment', activeAcademyId)
  const submissions = useAcademyQueue('assignment', activeAcademyId)
  const gradable = useMyGradableCourses(activeAcademyId, false)

  const [openAppointment, setOpenAppointment] = useState<AppointmentRow | null>(
    null,
  )

  const days = useMemo(
    () => byDay((upcoming.data ?? []).slice(0, SESSION_LIMIT), tz),
    [upcoming.data, tz],
  )
  const courseTitles = useMemo(
    () => new Map((gradable.data?.courses ?? []).map((c) => [c.id, c.title])),
    [gradable.data],
  )
  // `submitted` is exactly "handed in, not yet marked" on both tables. The
  // queries already order oldest-first, so the slice is the longest waiting.
  const awaitingAttempts = useMemo(
    () =>
      (attempts.data ?? [])
        .filter((r) => r.status === 'submitted')
        .slice(0, MARKING_LIMIT),
    [attempts.data],
  )
  const awaitingSubmissions = useMemo(
    () =>
      (submissions.data ?? [])
        .filter((r) => r.status === 'submitted')
        .slice(0, MARKING_LIMIT),
    [submissions.data],
  )

  // "No assigned course" is a claim about the trainer, so only make it once the
  // query has actually said so. `?? 0` would let the alarming message paint
  // first and then correct itself: useMyGradableCourses is three sequential
  // round trips (getUser → instructors → course_instructors) while
  // useAcademyQueue is one, so the queue routinely settles first.
  const hasCourses = gradable.isSuccess
    ? gradable.data.courses.length > 0
    : true

  const todayYmd = today(tz)
  const dayLabel = (ymd: string) =>
    ymd === todayYmd ? t('dash.week.today') : fmtDayLong(ymd, locale)

  // The header says when the next teaching day is, NOT how many sessions are
  // on today. Bookings cluster on the two or three days an academy runs, so a
  // today-keyed line reads "No sessions today" most mornings and stops being
  // worth reading.
  const next = days[0]
  const status = next
    ? tn('dash.trainer.next_day', next.rows.length, {
        day: dayLabel(next.ymd),
      })
    : t('dash.trainer.none_ahead')

  const todayLabel = new Date().toLocaleDateString(locale, {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const header = (
    <PageHeader
      title={t('nav.dashboard')}
      description={t('dash.header.desc', {
        // Both queries, not just the sessions one: `upcoming` stays disabled
        // until the instructor record resolves, so keying on it alone prints a
        // confident "nothing booked ahead" before anything has been read. It
        // cannot key on isPending either — with no instructor record that query
        // is disabled forever and the header would stick on "checking" beside
        // the empty state that already explains why.
        date: todayLabel,
        status:
          instructor.isLoading || upcoming.isLoading
            ? t('dash.header.checking')
            : status,
      })}
    />
  )

  if (instructor.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <LoadingBlock className="mt-6" />
      </div>
    )
  }

  if (instructor.error) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <ErrorBlock error={instructor.error} className="mt-6" />
      </div>
    )
  }

  // Said once, at page level: with no instructor record there are no sessions
  // AND no gradable courses, for the same single reason.
  if (!instructor.data) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <div className="mt-6">
          <EmptyState
            size="block"
            icon={UserX}
            title={t('grading.denied.title')}
            body={t('grading.denied.no_instructor_record')}
          />
        </div>
      </div>
    )
  }

  const stale = unclosed.data ?? []

  return (
    <div className="mx-auto w-full max-w-6xl">
      {header}

      {/* Sessions that already happened and were never closed off. Self-hiding,
          and the only place they can surface: /appointments is a week grid, so
          one of these drops out of sight the moment the week turns over while
          staying open forever. */}
      {stale.length > 0 ? (
        <div className="mt-6">
          <ListCard title={t('dash.trainer.unclosed.title')}>
            <ul className="divide-y">
              {stale.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setOpenAppointment(a)}
                    className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {personName(a.students?.full_name) ??
                          t('common.unnamed')}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {fmtDayLong(ymdOf(a.starts_at, tz), locale)} ·{' '}
                        {fmtRange(a.starts_at, a.ends_at, tz)}
                      </span>
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {fmtDays(daysSince(a.starts_at))}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          </ListCard>
        </div>
      ) : null}

      <div className="mt-6">
        <ListCard
          title={t('dash.week.title')}
          action={{
            to: '/appointments',
            label: (
              <>
                {t('dash.view_all')} <ChevronRight />
              </>
            ),
          }}
        >
          {upcoming.isLoading ? (
            <LoadingBlock className="py-8" />
          ) : upcoming.error ? (
            <ErrorBlock error={upcoming.error} className="m-4" />
          ) : days.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              {t('dash.week.empty')}
            </p>
          ) : (
            <ul className="divide-y">
              {/* Grouped by day rather than a flat list. Sessions bunch onto
                  the days an academy actually runs, so a flat ten rows can be
                  one Tuesday — and then Thursday never appears at all. */}
              {days.map((day) => (
                <li key={day.ymd}>
                  <p className="text-muted-foreground bg-muted/40 px-4 py-1.5 text-xs font-medium">
                    {dayLabel(day.ymd)}
                  </p>
                  <ul className="divide-y">
                    {day.rows.map((a) => (
                      <SessionRow
                        key={a.id}
                        appointment={a}
                        tz={tz}
                        onOpen={() => setOpenAppointment(a)}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </ListCard>
      </div>

      {/* Two cards, not one merged queue: the two are separate destinations in
          the nav, and a merged card could only ever link to one of them. */}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <ListCard
          title={t('dash.trainer.marking.assessments')}
          action={{ to: '/assessments', label: t('dash.view_all') }}
        >
          {attempts.isLoading ? (
            <LoadingBlock className="py-8" />
          ) : attempts.error ? (
            <ErrorBlock error={attempts.error} className="m-4" />
          ) : (
            <MarkingList
              rows={awaitingAttempts}
              courses={courseTitles}
              hasCourses={hasCourses}
              t={t}
            />
          )}
        </ListCard>

        <ListCard
          title={t('dash.trainer.marking.assignments')}
          action={{ to: '/assignments', label: t('dash.view_all') }}
        >
          {submissions.isLoading ? (
            <LoadingBlock className="py-8" />
          ) : submissions.error ? (
            <ErrorBlock error={submissions.error} className="m-4" />
          ) : (
            <MarkingList
              rows={awaitingSubmissions}
              courses={courseTitles}
              hasCourses={hasCourses}
              t={t}
            />
          )}
        </ListCard>
      </div>

      <AppointmentDialog
        academyId={activeAcademyId}
        appointment={openAppointment}
        tz={tz}
        locale={locale}
        onOpenChange={(open) => !open && setOpenAppointment(null)}
      />
    </div>
  )
}
