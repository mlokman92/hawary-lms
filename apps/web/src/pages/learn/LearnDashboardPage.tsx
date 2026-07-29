import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FileText,
  Hourglass,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type TFn } from '@/lib/i18n'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useMyCourses, useMyStudent } from '@/features/learn/api'
import {
  isDueSoon,
  isOverdue,
  useLearnDashboard,
  type LearnTask,
} from '@/features/learn/dashboard'
import { TASK_STATE_META } from '@/features/learn/status'
import { PageHeader } from '@/components/patterns/PageHeader'
import { StatTile } from '@/components/patterns/StatTile'
import { ListCard } from '@/components/patterns/ListCard'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { NoStudentRecord } from '@/components/learn/NoStudentRecord'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

// `t` already means "the task" everywhere in this file, so the translator is
// aliased to `tr` rather than renamed row variables.
function dueLabel(task: LearnTask, tr: TFn) {
  if (!task.due_at) return tr('learn.due.none')
  const diff = new Date(task.due_at).getTime() - Date.now()
  const days = Math.round(diff / 86_400_000)
  if (diff < 0) return tr('learn.due.overdue_by', { days: Math.abs(days) || 1 })
  if (days === 0) return tr('learn.due.today')
  if (days === 1) return tr('learn.due.tomorrow')
  return tr('learn.due.in_days', { days })
}

const taskHref = (t: LearnTask) =>
  t.kind === 'assignment'
    ? `/learn/assignments/${t.id}`
    : `/learn/assessments/${t.id}`

const KIND_ICON: Record<LearnTask['kind'], LucideIcon> = {
  assignment: FileCheck2,
  assessment: ClipboardList,
}

function TaskRow({ t }: { t: LearnTask }) {
  const { t: tr } = useT()
  const Icon = KIND_ICON[t.kind]
  const over = isOverdue(t)
  return (
    <li className="hover:bg-muted/50 flex items-center gap-3 px-4 py-2.5 transition-colors">
      <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <Link to={taskHref(t)} className="min-w-0 flex-1 hover:underline">
        <span className="block truncate text-sm font-medium">{t.title}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {tr(
            t.kind === 'assignment'
              ? 'learn.kind.assignment'
              : 'learn.kind.assessment',
          )}{' '}
          · {tr('learn.points', { points: t.total_points })}
        </span>
      </Link>
      {t.state === 'in_progress' ? (
        <Badge variant={TASK_STATE_META.in_progress.variant} className="shrink-0">
          {tr(TASK_STATE_META.in_progress.labelKey)}
        </Badge>
      ) : null}
      <span
        className={cn(
          'shrink-0 text-xs tabular-nums',
          over ? 'text-destructive font-medium' : 'text-muted-foreground',
        )}
      >
        {dueLabel(t, tr)}
      </span>
    </li>
  )
}

export function LearnDashboardPage() {
  const { t: tr, tn } = useT()
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

  const groups = useMemo(() => {
    const tasks = data?.tasks ?? []
    const outstanding = tasks.filter(
      (t) => t.state === 'todo' || t.state === 'in_progress',
    )
    return {
      overdue: outstanding.filter((t) => isOverdue(t)),
      soon: outstanding
        .filter((t) => !isOverdue(t) && isDueSoon(t))
        .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? '')),
      rest: outstanding.filter((t) => !isOverdue(t) && !isDueSoon(t)),
      awaiting: tasks.filter((t) => t.state === 'awaiting'),
      marked: tasks
        .filter((t) => t.state === 'marked')
        .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '')),
    }
  }, [data])

  // Kept above the guards and rendered in every branch: the back-office does
  // the same, so the h1 is present from the first paint instead of popping in
  // and shifting the layout once the queries resolve.
  const header = (
    <PageHeader
      title={tr('nav.learn.dashboard')}
      description={tr('learn.dashboard.subtitle')}
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

  const outstanding =
    groups.overdue.length + groups.soon.length + groups.rest.length
  const marked = groups.marked
  const earned = marked.reduce((s, t) => s + (t.score ?? 0), 0)
  const possible = marked.reduce((s, t) => s + (t.outOf ?? 0), 0)

  return (
    <div className="mx-auto w-full max-w-6xl">
      {header}

      {/* Each tile deep-links into the matching filter on My work. */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label={tr('common.overdue')}
          value={String(groups.overdue.length)}
          hint={
            groups.overdue.length === 0
              ? tr('learn.stat.overdue.hint_zero')
              : tr('learn.stat.overdue.hint')
          }
          icon={AlertTriangle}
          tone={groups.overdue.length > 0 ? 'danger' : 'muted'}
          to="/learn/work?state=overdue"
        />
        <StatTile
          label={tr('learn.stat.due_week')}
          value={String(groups.soon.length)}
          hint={tn('learn.stat.outstanding', outstanding)}
          icon={CalendarClock}
          tone={groups.soon.length > 0 ? 'warning' : 'muted'}
          to="/learn/work?state=todo"
        />
        <StatTile
          label={tr('learn.stat.awaiting')}
          value={String(groups.awaiting.length)}
          hint={tr('learn.stat.awaiting.hint')}
          icon={Hourglass}
          tone="accent"
          to="/learn/work?state=awaiting"
        />
        <StatTile
          label={tr('status.task.marked')}
          value={
            possible > 0
              ? `${Math.round((earned / possible) * 100)}%`
              : String(marked.length)
          }
          hint={
            possible > 0
              ? tn('learn.stat.marked.hint', marked.length, {
                  earned,
                  possible,
                })
              : tr('learn.stat.marked.hint_zero')
          }
          icon={Trophy}
          tone="positive"
          to="/learn/work?state=marked"
        />
      </div>

      {isLoading ? (
        <LoadingBlock className="mt-8" />
      ) : error ? (
        <ErrorBlock error={error} className="mt-8" />
      ) : (
        <>
          <div className="mt-8">
            <ListCard
              title={tr('learn.up_next')}
              action={{
                to: '/learn/work',
                label: (
                  <>
                    {tr('learn.all_work')} <ChevronRight />
                  </>
                ),
              }}
            >
              {outstanding === 0 ? (
                <p className="text-muted-foreground px-4 py-8 text-center text-sm">
                  {tr('learn.empty.outstanding')}
                </p>
              ) : (
                <ul className="divide-y">
                  {[...groups.overdue, ...groups.soon, ...groups.rest]
                    .slice(0, 6)
                    .map((t) => (
                      <TaskRow key={`${t.kind}-${t.id}`} t={t} />
                    ))}
                </ul>
              )}
            </ListCard>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <ListCard
              title={tr('learn.recent_marks')}
              action={{
                to: '/learn/work?state=marked',
                label: tr('learn.view_all'),
              }}
            >
              {marked.length === 0 ? (
                <p className="text-muted-foreground px-4 py-8 text-center text-sm">
                  {tr('learn.empty.marked')}
                </p>
              ) : (
                <ul className="divide-y">
                  {marked.slice(0, 5).map((t) => {
                    const Icon = KIND_ICON[t.kind]
                    return (
                      <li
                        key={`${t.kind}-${t.id}`}
                        className="hover:bg-muted/50 flex items-center gap-3 px-4 py-2.5 transition-colors"
                      >
                        <Icon
                          className="text-muted-foreground size-4 shrink-0"
                          aria-hidden
                        />
                        <Link
                          to={taskHref(t)}
                          className="min-w-0 flex-1 truncate text-sm hover:underline"
                        >
                          {t.title}
                        </Link>
                        <span className="shrink-0 text-sm font-medium tabular-nums">
                          {t.score ?? '—'}
                          <span className="text-muted-foreground font-normal">
                            {' '}
                            / {t.outOf ?? '—'}
                          </span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </ListCard>

            <ListCard
              title={tr('nav.learn.courses')}
              action={{
                to: '/learn/courses',
                label: (
                  <>
                    {tr('learn.all_courses')} <ChevronRight />
                  </>
                ),
              }}
            >
              {!courses || courses.length === 0 ? (
                <p className="text-muted-foreground px-4 py-8 text-center text-sm">
                  {tr('learn.empty.courses_short')}
                </p>
              ) : (
                <ul className="divide-y">
                  {courses.slice(0, 5).map((c) => {
                    const s = data?.byCourse.get(c.id)
                    const total = s?.total ?? 0
                    const pct =
                      total === 0 ? 0 : Math.round(((s?.done ?? 0) / total) * 100)
                    return (
                      <li
                        key={c.id}
                        className="hover:bg-muted/50 px-4 py-3 transition-colors"
                      >
                        <Link to={`/learn/courses/${c.id}`} className="block">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium hover:underline">
                              {c.title}
                            </span>
                            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                              {total === 0 ? '—' : `${pct}%`}
                            </span>
                          </div>
                          <Progress value={pct} className="mt-2 h-1.5" />
                          <p className="text-muted-foreground mt-1.5 flex items-center gap-2 text-xs">
                            <FileText className="size-3.5" aria-hidden />
                            {tn('learn.count.notes', s?.notes ?? 0)} ·{' '}
                            {tr('learn.progress.tasks_done', {
                              done: s?.done ?? 0,
                              total,
                            })}
                          </p>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </ListCard>
          </div>
        </>
      )}
    </div>
  )
}
