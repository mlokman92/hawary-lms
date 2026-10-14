import { Children, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Landmark,
  Receipt,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getLang, useT } from '@/lib/i18n'
import { localeFor } from '@/lib/format'
import { TONE_CLASS, type Tone } from '@/lib/tone'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useMyCourses, useMyStudent } from '@/features/learn/api'
import {
  DEFAULT_TZ,
  useAcademyTimezone,
  useMyAppointments,
} from '@/features/appointments/api'
import { fmtWhen } from '@/features/appointments/calendar'
import {
  LPKC_STAGE_LABEL,
  REPORT_STATUS,
  reportTargets,
  useMyReports,
} from '@/features/reports/api'
import {
  KWSP_APPLICATION_STATUS,
  kwspState,
  useStudentDocuments,
  type UploadedPdf,
} from '@/features/documents/api'
import { PageHeader } from '@/components/patterns/PageHeader'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { NoStudentRecord } from '@/components/learn/NoStudentRecord'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

/** Where a row stands, and how that should read at a glance. */
type Status = { label: string; tone: Tone }

// Under the title, never beside it: the Malay labels are long ("Surat
// Pengesahan Tempoh Bekerja", "Ditandatangani dan dipersetujui") and a phone
// has room for one of the two on a line.
function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge
      variant="outline"
      className={cn('mt-1.5 flex', TONE_CLASS[status.tone])}
    >
      {status.label}
    </Badge>
  )
}

/**
 * One of the places a student goes, as a card. The heading is the way in; a
 * place with parts — the LPKC, the documents — lists them under it, each its
 * own way in.
 */
function Section({
  icon: Icon,
  title,
  to,
  detail,
  status,
  children,
}: {
  icon: LucideIcon
  title: string
  /** Where the heading leads. Left out, it is only a heading over its rows. */
  to?: string
  detail?: string | null
  status?: Status
  children?: ReactNode
}) {
  const heading = (
    <>
      <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-medium">{title}</h2>
        {detail ? (
          <p className="text-muted-foreground truncate">{detail}</p>
        ) : null}
        {status ? <StatusBadge status={status} /> : null}
      </div>
      {to ? (
        <ChevronRight
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden
        />
      ) : null}
    </>
  )
  const frame = 'flex items-center gap-3 px-5 py-4'
  return (
    <Card className="gap-0 py-0">
      {to ? (
        <Link
          to={to}
          className={cn(frame, 'hover:bg-muted/50 transition-colors')}
        >
          {heading}
        </Link>
      ) : (
        <div className={frame}>{heading}</div>
      )}
      {Children.count(children) > 0 ? (
        <ul className="divide-y border-t">{children}</ul>
      ) : null}
    </Card>
  )
}

/** A part of a section. Indented to sit under the heading's title. */
function Item({
  to,
  title,
  status,
}: {
  to: string
  title: string
  status?: Status
}) {
  return (
    <li>
      <Link
        to={to}
        className="hover:bg-muted/50 flex items-center gap-3 py-3 pr-5 pl-13 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          {status ? <StatusBadge status={status} /> : null}
        </div>
        <ChevronRight
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden
        />
      </Link>
    </li>
  )
}

/**
 * The student's way in to everything, in the order they need it: the course,
 * sessions, the LPKC, documents, billing, the KWSP application, the profile.
 *
 * A launcher, not a report. It is read on a phone more than anywhere else, so
 * every row is a full-width link, and it says only what saves a trip: which
 * course, when the next session is, where each part of the LPKC and each
 * document stands. Coursework deadlines are My work's, one tap from the rail.
 */
export function LearnDashboardPage() {
  const { t } = useT()
  const { academyId } = useStudentAcademy()
  const {
    data: student,
    isLoading: studentLoading,
    error: studentError,
  } = useMyStudent(academyId)
  const courses = useMyCourses(academyId, student?.id ?? null)
  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(academyId)
  const sessions = useMyAppointments(academyId)
  const reports = useMyReports(academyId)
  // The student's own row of the documents roster: one read for the three
  // documents and the KWSP application.
  const docs = useStudentDocuments(student?.id)

  let body: ReactNode
  if (studentLoading) {
    body = <LoadingBlock className="mt-6" />
  } else if (studentError) {
    body = <ErrorBlock error={studentError} className="mt-6" />
  } else if (!student) {
    // Accepting an invitation creates the membership but never the record, so
    // this is reachable by the very first student who ever joins.
    body = (
      <div className="mt-6">
        <NoStudentRecord />
      </div>
    )
  } else if (
    courses.isLoading ||
    sessions.isLoading ||
    reports.isLoading ||
    docs.isLoading
  ) {
    // Held until every status is in: the rows are tap targets, and one that
    // grows a line as its status arrives moves the row under a thumb.
    body = <LoadingBlock className="mt-6" />
  } else {
    // One student, one course: with exactly one there is no list to pick from.
    const course = courses.data?.length === 1 ? courses.data[0] : null

    // Still going ahead, and not yet over. Cut on `ends_at`, the rule the
    // register uses: a session being taught right now is still today's.
    const next = (sessions.data ?? [])
      .filter(
        (a) => a.status === 'booked' && Date.parse(a.ends_at) >= Date.now(),
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]

    // Only the parts the student's course is taking, or that they have already
    // sent — `my_reports` decides. A course taking none has no LPKC card.
    const parts = reports.data?.is_open
      ? reportTargets(reports.data.courses)
      : []

    const uploaded = (file: UploadedPdf | null): Status =>
      file
        ? { label: t('sdoc.file.uploaded'), tone: 'positive' }
        : { label: t('sdoc.file.not_uploaded'), tone: 'muted' }
    const kwsp = docs.data
      ? KWSP_APPLICATION_STATUS[kwspState(docs.data)]
      : null

    body = (
      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        <Section
          icon={BookOpen}
          title={t('nav.learn.courses')}
          to={course ? `/learn/courses/${course.id}` : '/learn/courses'}
          detail={course?.title}
        />

        <Section
          icon={CalendarClock}
          title={t('nav.learn.appointments')}
          to="/learn/appointments"
          detail={
            next
              ? [
                  fmtWhen(next.starts_at, tz, localeFor(getLang())),
                  next.instructor.full_name,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : null
          }
        />

        {parts.length > 0 || reports.isError ? (
          <Section
            icon={ClipboardCheck}
            title={t('nav.learn.reports')}
            to="/learn/reports"
          >
            {parts.map((p) => {
              const meta = p.report ? REPORT_STATUS[p.report.status] : null
              return (
                <Item
                  key={`${p.courseId}:${p.stage}`}
                  title={t(LPKC_STAGE_LABEL[p.stage])}
                  // A part with nothing sent leads to the list, where its
                  // Send button is.
                  to={
                    p.report ? `/learn/reports/${p.report.id}` : '/learn/reports'
                  }
                  status={
                    meta
                      ? { label: t(meta.labelKey), tone: meta.tone }
                      : { label: t('report.learn.nothing_sent'), tone: 'muted' }
                  }
                />
              )
            })}
          </Section>
        ) : null}

        {/* No page of its own, as in the rail: a heading over the three. */}
        <Section icon={FileText} title={t('nav.documents')}>
          <Item
            title={t('nav.offer_letter')}
            to="/learn/documents/offer-letter"
            status={
              docs.data
                ? docs.data.offerAcceptedAt
                  ? { label: t('sdoc.offer.signed'), tone: 'positive' }
                  : { label: t('sdoc.offer.not_signed'), tone: 'muted' }
                : undefined
            }
          />
          <Item
            title={t('nav.ic_copy')}
            to="/learn/documents/ic-copy"
            status={docs.data ? uploaded(docs.data.icCopy) : undefined}
          />
          <Item
            title={t('nav.employment_letter')}
            to="/learn/documents/employment-letter"
            status={
              docs.data ? uploaded(docs.data.employmentLetter) : undefined
            }
          />
        </Section>

        <Section
          icon={Receipt}
          title={t('nav.learn.billing')}
          to="/learn/billing"
        />

        <Section
          icon={Landmark}
          title={t('nav.learn.kwsp')}
          to="/learn/kwsp"
          status={kwsp ? { label: t(kwsp.labelKey), tone: kwsp.tone } : undefined}
        />

        <Section
          icon={UserRound}
          title={t('nav.learn.profile')}
          to="/learn/profile"
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={t('nav.learn.dashboard')} />
      {body}
    </div>
  )
}
