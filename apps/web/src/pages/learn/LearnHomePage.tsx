import { Link } from 'react-router-dom'
import { BookOpen, ClipboardList, FileText } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useStudentAcademy } from '@/lib/studentAcademy'
import {
  useMyCourses,
  useMyPendingCourses,
  useMyStudent,
} from '@/features/learn/api'
import { useLearnDashboard } from '@/features/learn/dashboard'
import { PageHeader } from '@/components/patterns/PageHeader'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { NoStudentRecord } from '@/components/learn/NoStudentRecord'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof FileText
  value: number | string
  label: string
}) {
  return (
    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="text-foreground font-medium tabular-nums">{value}</span>
      <span>{label}</span>
    </div>
  )
}

export function LearnHomePage() {
  const { t } = useT()
  const { academyId } = useStudentAcademy()
  const {
    data: student,
    isLoading: studentLoading,
    error: studentError,
  } = useMyStudent(academyId)
  const {
    data: courses,
    isLoading,
    error,
  } = useMyCourses(academyId, student?.id ?? null)
  const { data: dash } = useLearnDashboard(academyId, student?.id ?? null)
  const { data: pending } = useMyPendingCourses(academyId, student?.id ?? null)

  // Rendered in every branch so the h1 never pops in — same as the back-office.
  const header = (
    <PageHeader
      title={t('nav.learn.courses')}
      description={t('learn.courses.subtitle')}
    />
  )

  if (studentLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <LoadingBlock className="mt-6" />
      </div>
    )
  }

  if (studentError) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <ErrorBlock error={studentError} className="mt-6" />
      </div>
    )
  }

  // Accepting an invitation creates the membership but never an enrolment, and
  // enrolments are staff-created — so this state is reachable by the very first
  // student who ever joins. Name the missing step instead of showing a blank.
  if (!student) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <div className="mt-6">
          <NoStudentRecord />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      {header}

      {/* Requested, not yet opened. Without this a student who has just joined
          sees "no courses" and has no idea their request landed. */}
      {(pending ?? []).length > 0 ? (
        <ul className="mt-6 divide-y rounded-xl border">
          {(pending ?? []).map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <span className="min-w-0 truncate text-sm font-medium">
                {p.title}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {t('enroll.learn.pending')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : !courses || courses.length === 0 ? (
          <EmptyState
            size="block"
            icon={BookOpen}
            title={t('learn.empty.courses.title')}
            body={t('learn.empty.courses.body')}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => {
              const s = dash?.byCourse.get(c.id)
              const total = s?.total ?? 0
              const done = s?.done ?? 0
              const pct = total === 0 ? 0 : Math.round((done / total) * 100)
              return (
                <Card
                  key={c.id}
                  className="hover:border-foreground/20 relative gap-0 transition-colors"
                >
                  <CardHeader className="gap-0">
                    <div className="min-w-0">
                      {/* Stretched link: the whole card is the hit target. */}
                      <Link
                        to={`/learn/courses/${c.id}`}
                        className="after:absolute after:inset-0 focus-visible:outline-none"
                      >
                        <h2 className="truncate font-medium">{c.title}</h2>
                      </Link>
                      {c.code ? (
                        <p className="text-muted-foreground mt-0.5 truncate text-xs">
                          {c.code}
                        </p>
                      ) : null}
                      {c.description ? (
                        <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                          {c.description}
                        </p>
                      ) : null}
                    </div>
                  </CardHeader>

                  {/* mt-auto: cards in a row stretch to the tallest, so pin the
                      stats to the bottom rather than letting a long description
                      push them out of line with the neighbouring cards. */}
                  <CardContent className="mt-auto space-y-3 pt-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      <Stat
                        icon={FileText}
                        value={s?.notes ?? 0}
                        label={t('learn.stat.notes')}
                      />
                      <Stat
                        icon={ClipboardList}
                        value={`${done}/${total}`}
                        label={t('learn.stat.tasks_done')}
                      />
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    {/* No enrolment badge: useMyCourses filters to
                        status='active', so it could only ever read "Active". */}
                    <div className="flex items-center justify-end gap-2 border-t pt-3">
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {total === 0
                          ? t('learn.no_tasks_yet')
                          : t('learn.percent_complete', { pct })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
