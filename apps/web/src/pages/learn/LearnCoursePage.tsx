import { Link, useParams } from 'react-router-dom'
import {
  ClipboardList,
  FileCheck2,
  FileText,
  Layers,
  Paperclip,
  type LucideIcon,
} from 'lucide-react'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useStudentAcademy } from '@/lib/studentAcademy'
import {
  useLearnCourseContent,
  useMyCourses,
  useMyStudent,
} from '@/features/learn/api'
import { useLearnDashboard } from '@/features/learn/dashboard'
import { formatBytes, useOpenMaterial } from '@/features/materials/api'
import { BackLink } from '@/components/patterns/BackLink'
import { EmptyState } from '@/components/patterns/EmptyState'
import {
  ErrorBlock,
  LoadingBlock,
  NotFoundBlock,
  RouteLoading,
} from '@/components/patterns/QueryState'
import { NoStudentRecord } from '@/components/learn/NoStudentRecord'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

/**
 * One item in a module. `to` routes; `onClick` is for a material, which has no
 * page of its own — it resolves to a short-lived signed URL and opens the file.
 */
function Row({
  to,
  onClick,
  icon: Icon,
  title,
  meta,
}: {
  to?: string
  onClick?: () => void
  icon: LucideIcon
  title: string
  meta?: string | null
}) {
  return (
    <li className="hover:bg-muted/50 flex items-center gap-2 px-3 py-2 transition-colors">
      <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      {to ? (
        <Link to={to} className="min-w-0 flex-1 truncate text-sm hover:underline">
          {title}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
        >
          {title}
        </button>
      )}
      {meta ? (
        <span className="text-muted-foreground shrink-0 text-xs">{meta}</span>
      ) : null}
    </li>
  )
}

export function LearnCoursePage() {
  const { id: courseId = '' } = useParams<{ id: string }>()
  const { t, tn } = useT()
  const { academyId } = useStudentAcademy()
  const openMaterial = useOpenMaterial()
  const {
    data: student,
    isLoading: studentLoading,
    error: studentError,
  } = useMyStudent(academyId)
  // isPending, not isLoading: by the time the not-enrolled guard below runs,
  // `student` exists so this query is enabled and isPending is guaranteed to
  // clear. isLoading can read false for a frame before the fetch starts, which
  // would flash "You're not enrolled" at a student who is.
  const { data: courses, isPending: coursesPending } = useMyCourses(
    academyId,
    student?.id ?? null,
  )
  const { data, isLoading, error } = useLearnCourseContent(academyId, courseId)
  const { data: dash } = useLearnDashboard(academyId, student?.id ?? null)

  const course = courses?.find((c) => c.id === courseId)
  const progress = dash?.byCourse.get(courseId)
  const total = progress?.total ?? 0
  const done = progress?.done ?? 0
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)

  const meta = [
    data ? tn('learn.count.modules', data.modules.length) : null,
    data ? tn('learn.count.notes', data.notes.length) : null,
    total > 0 ? t('learn.progress.tasks_done', { done, total }) : null,
    course?.code,
  ]
    .filter(Boolean)
    .join(' · ')

  if (studentLoading) return <RouteLoading />

  if (studentError) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <ErrorBlock error={studentError} />
      </div>
    )
  }

  // Without this, an unlinked student sees a page titled "Course" telling them
  // the academy published nothing — RLS returns zero rows for a non-enrolled
  // caller, which is a linking problem, not an empty course.
  if (!student) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <NoStudentRecord />
      </div>
    )
  }

  if (!coursesPending && !course) {
    return (
      <NotFoundBlock
        message={t('learn.not_enrolled')}
        backTo="/learn/courses"
        backLabel={t('learn.back_to_courses')}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <BackLink to="/learn/courses">{t('nav.learn.courses')}</BackLink>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {course?.title ?? t('common.course')}
          </h1>
          {meta ? (
            <p className="text-muted-foreground mt-1 text-sm">{meta}</p>
          ) : null}
        </div>
        {total > 0 ? (
          <div className="w-40 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                {t('learn.progress')}
              </span>
              <span className="text-xs font-medium tabular-nums">{pct}%</span>
            </div>
            <Progress value={pct} className="mt-1.5 h-1.5" />
          </div>
        ) : null}
      </div>

      {course?.description ? (
        <p className="mt-3 max-w-2xl text-sm whitespace-pre-line">
          {course.description}
        </p>
      ) : null}

      <div className="mt-6 space-y-4">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          // RLS usually filters rather than raises, so this catches transport
          // and PostgREST failures; the not-enrolled case is handled by the
          // guard above, before we get here.
          <ErrorBlock error={error} />
        ) : !data || data.modules.length === 0 ? (
          <EmptyState
            icon={Layers}
            size="block"
            title={t('learn.empty.published.title')}
            body={t('learn.empty.published.body')}
          />
        ) : (
          data.modules.map((m) => {
            const notes = data.notes.filter((n) => n.module_id === m.id)
            const materials = data.materials.filter(
              (x) => x.module_id === m.id,
            )
            const assessments = data.assessments.filter(
              (a) => a.module_id === m.id,
            )
            const assignments = data.assignments.filter(
              (a) => a.module_id === m.id,
            )
            const empty =
              notes.length +
                materials.length +
                assessments.length +
                assignments.length ===
              0
            return (
              <Card key={m.id} className="gap-4">
                <CardHeader className="gap-1">
                  <div className="flex items-center gap-2">
                    <Layers
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden
                    />
                    <h2 className="font-semibold">{m.title}</h2>
                  </div>
                  {m.description ? (
                    <p className="text-muted-foreground text-sm">
                      {m.description}
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {empty ? (
                    <p className="text-muted-foreground text-sm">
                      {t('learn.empty.module')}
                    </p>
                  ) : (
                    <ul className="divide-y rounded-lg border">
                      {notes.map((n) => (
                        <Row
                          key={n.id}
                          to={`/learn/notes/${n.id}`}
                          icon={FileText}
                          title={n.title || t('common.untitled')}
                        />
                      ))}
                      {materials.map((x) => (
                        <Row
                          key={x.id}
                          onClick={() => openMaterial.mutate({ id: x.id })}
                          icon={Paperclip}
                          title={x.title || x.file_name}
                          meta={formatBytes(x.size_bytes) || null}
                        />
                      ))}
                      {assessments.map((a) => (
                        <Row
                          key={a.id}
                          to={`/learn/assessments/${a.id}`}
                          icon={ClipboardList}
                          title={a.title || t('common.untitled')}
                          meta={
                            a.duration_minutes
                              ? t('learn.meta.minutes', {
                                  minutes: a.duration_minutes,
                                })
                              : t('learn.points', { points: a.total_points })
                          }
                        />
                      ))}
                      {assignments.map((a) => (
                        <Row
                          key={a.id}
                          to={`/learn/assignments/${a.id}`}
                          icon={FileCheck2}
                          title={a.title || t('common.untitled')}
                          meta={
                            a.due_at
                              ? t('learn.meta.due', {
                                  date: fmtDate(a.due_at),
                                })
                              : t('learn.points', { points: a.total_points })
                          }
                        />
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
