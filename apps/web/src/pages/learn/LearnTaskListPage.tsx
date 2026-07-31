import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, FileCheck2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useMyCourses, useMyStudent } from '@/features/learn/api'
import {
  isOverdue,
  useLearnDashboard,
  type TaskKind,
} from '@/features/learn/dashboard'
import { TASK_STATE_META } from '@/features/learn/status'
import { PageHeader } from '@/components/patterns/PageHeader'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { NoStudentRecord } from '@/components/learn/NoStudentRecord'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Every assessment (or assignment) the student can see, done or not.
 *
 * Not a duplicate of My work: that page is the deadline queue, defaults to
 * what is outstanding and mixes both kinds. This one is the complete inventory
 * of a single kind, which is what "show me my quizzes" actually means.
 *
 * Reuses useLearnDashboard rather than querying again — it already joins the
 * published content to this student's attempts and submissions, and sharing the
 * cache key means arriving here from the dashboard costs nothing.
 */
export function LearnTaskListPage({ kind }: { kind: TaskKind }) {
  const { t: tr } = useT()
  const { academyId } = useStudentAcademy()
  const {
    data: student,
    isLoading: studentLoading,
    error: studentError,
  } = useMyStudent(academyId)
  const { data: courses } = useMyCourses(academyId, student?.id ?? null)
  const { data, isLoading, error } = useLearnDashboard(
    academyId,
    student?.id ?? null,
  )
  const [course, setCourse] = useState('all')

  const courseName = useMemo(
    () => new Map((courses ?? []).map((c) => [c.id, c.title])),
    [courses],
  )

  const rows = useMemo(() => {
    const all = (data?.tasks ?? []).filter((x) => x.kind === kind)
    return all
      .filter((x) => course === 'all' || x.course_id === course)
      .sort((a, b) => {
        // Outstanding work first — a list that opens on last term's marked
        // quizzes buries the one that is due.
        const ao = a.state === 'todo' || a.state === 'in_progress' ? 0 : 1
        const bo = b.state === 'todo' || b.state === 'in_progress' ? 0 : 1
        if (ao !== bo) return ao - bo
        if (!a.due_at && !b.due_at) return a.title.localeCompare(b.title)
        if (!a.due_at) return 1
        if (!b.due_at) return -1
        return a.due_at.localeCompare(b.due_at)
      })
  }, [data, kind, course])

  const isAssessment = kind === 'assessment'
  const Icon = isAssessment ? ClipboardList : FileCheck2
  const href = (id: string) =>
    isAssessment ? `/learn/assessments/${id}` : `/learn/assignments/${id}`

  const header = (
    <PageHeader
      title={tr(isAssessment ? 'nav.assessments' : 'nav.assignments')}
      description={tr(
        isAssessment
          ? 'library.learn.assessments.subtitle'
          : 'library.learn.assignments.subtitle',
      )}
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
  // A disabled TanStack query reports isLoading:false, so without this guard an
  // unlinked student falls straight through to "Nothing here".
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

      {(courses ?? []).length > 1 ? (
        <div className="mt-6">
          <Select value={course} onValueChange={setCourse}>
            <SelectTrigger className="w-64" aria-label={tr('common.course')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr('common.all_courses')}</SelectItem>
              {(courses ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="mt-6">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Icon}
            title={tr(
              isAssessment
                ? 'library.learn.empty.assessments'
                : 'library.learn.empty.assignments',
            )}
          />
        ) : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {rows.map((x) => {
                const over = isOverdue(x)
                const meta = TASK_STATE_META[x.state]
                return (
                  <li
                    key={x.id}
                    className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                  >
                    <Icon
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden
                    />
                    <Link
                      to={href(x.id)}
                      className="min-w-0 flex-1 hover:underline"
                    >
                      <span className="block truncate text-sm font-medium">
                        {x.title}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {courseName.get(x.course_id) ?? tr('common.course')}
                      </span>
                    </Link>

                    {x.state === 'marked' ? (
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {x.score ?? '—'}
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          / {x.outOf ?? '—'}
                        </span>
                      </span>
                    ) : (
                      <Badge variant={meta.variant} className="shrink-0">
                        {tr(meta.labelKey)}
                      </Badge>
                    )}

                    <span
                      className={cn(
                        'hidden w-28 shrink-0 text-right text-xs tabular-nums sm:block',
                        over
                          ? 'text-destructive font-medium'
                          : 'text-muted-foreground',
                      )}
                    >
                      {x.due_at
                        ? fmtDate(x.due_at)
                        : tr(
                            isAssessment
                              ? 'library.always_open'
                              : 'learn.due.none',
                          )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
