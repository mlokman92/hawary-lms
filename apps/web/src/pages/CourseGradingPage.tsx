import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, FileCheck2 } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { fmtDateTime } from '@/lib/format'
import { useT, type TFn } from '@/lib/i18n'
import { useCourse } from '@/features/courses/api'
import { useGradingQueue, useMyGradableCourses } from '@/features/grading/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const NAME = (
  s: { full_name: string | null; student_no: string } | null,
  t: TFn,
) => s?.full_name?.trim() || s?.student_no || t('grading.unknown_student')

export function CourseGradingPage() {
  const { id: courseId = '' } = useParams<{ id: string }>()
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const isAdmin = active?.role === 'admin'
  const { data: course } = useCourse(courseId)
  const { data: gradable, isLoading: gradableLoading } = useMyGradableCourses(
    activeAcademyId,
    isAdmin,
  )
  const { data, isLoading } = useGradingQueue(activeAcademyId, courseId)

  const mayGrade =
    isAdmin || !!gradable?.courses.some((c) => c.id === courseId)

  if (gradableLoading) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('common.loading')}
      </p>
    )
  }

  // A trainer with no linked instructors row resolves to zero courses. Say so;
  // an empty queue and "not your course" are very different problems.
  if (!mayGrade) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-sm font-medium">{t('grading.denied.title')}</p>
        <p className="text-muted-foreground mt-2 text-sm">
          {gradable?.linked
            ? t('grading.denied.not_assigned')
            : t('grading.denied.no_instructor_record')}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/courses">{t('grading.back_to_courses')}</Link>
        </Button>
      </div>
    )
  }

  const pendingAttempts = data?.attempts.filter((a) => a.status === 'submitted') ?? []
  const pendingSubs = data?.submissions.filter((s) => s.status === 'submitted') ?? []
  const doneAttempts = data?.attempts.filter((a) => a.status === 'graded') ?? []
  const doneSubs =
    data?.submissions.filter((s) => s.status !== 'submitted') ?? []

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/courses/${courseId}`}>
          <ArrowLeft /> {course?.title ?? t('common.course')}
        </Link>
      </Button>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {t('grading.title')}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">{t('grading.subtitle')}</p>

      {isLoading ? (
        <p className="text-muted-foreground mt-6 rounded-xl border p-8 text-center text-sm">
          {t('common.loading')}
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          <Section
            title={t('grading.queue.awaiting')}
            empty={t('grading.queue.awaiting_empty')}
            rows={[
              ...pendingSubs.map((s) => ({
                key: s.id,
                to: `/grading/submissions/${s.id}`,
                icon: FileCheck2 as typeof FileCheck2,
                who: NAME(s.students, t),
                what: s.assignments?.title ?? t('grading.item.assignment'),
                when: fmtDateTime(s.submitted_at),
                badge: null as string | null,
              })),
              ...pendingAttempts.map((a) => ({
                key: a.id,
                to: `/grading/attempts/${a.id}`,
                icon: ClipboardList as typeof FileCheck2,
                who: NAME(a.students, t),
                what: a.assessments?.title ?? t('grading.item.assessment'),
                when: fmtDateTime(a.submitted_at),
                badge: t('grading.attempt_no', { no: a.attempt_no }),
              })),
            ]}
          />

          <Section
            title={t('grading.queue.marked')}
            empty={t('grading.queue.marked_empty')}
            rows={[
              ...doneSubs.map((s) => ({
                key: s.id,
                to: `/grading/submissions/${s.id}`,
                icon: FileCheck2 as typeof FileCheck2,
                who: NAME(s.students, t),
                what: s.assignments?.title ?? t('grading.item.assignment'),
                when: `${s.grade ?? '—'} / ${s.assignments?.total_points ?? '—'}`,
                badge:
                  s.status === 'returned'
                    ? t('status.submission.returned')
                    : t('status.submission.graded'),
              })),
              ...doneAttempts.map((a) => ({
                key: a.id,
                to: `/grading/attempts/${a.id}`,
                icon: ClipboardList as typeof FileCheck2,
                who: NAME(a.students, t),
                what: a.assessments?.title ?? t('grading.item.assessment'),
                when: `${a.score ?? '—'} / ${a.max_score ?? '—'}`,
                badge: t('status.attempt.graded'),
              })),
            ]}
          />
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  empty,
  rows,
}: {
  title: string
  empty: string
  rows: {
    key: string
    to: string
    icon: typeof FileCheck2
    who: string
    what: string
    when: string
    badge: string | null
  }[]
}) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">
          {title}{' '}
          <span className="text-muted-foreground font-normal tabular-nums">
            ({rows.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {rows.map((r) => (
              <li
                key={r.key}
                className="hover:bg-muted/50 flex items-center gap-2 px-3 py-2 transition-colors"
              >
                <r.icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <Link to={r.to} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate text-sm font-medium">{r.who}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {r.what}
                  </span>
                </Link>
                {r.badge ? (
                  <Badge variant="secondary" className="shrink-0">
                    {r.badge}
                  </Badge>
                ) : null}
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {r.when}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
