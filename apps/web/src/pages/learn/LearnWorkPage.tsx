import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ClipboardList,
  FileCheck2,
  Hourglass,
  ListTodo,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import type { Tone } from '@/lib/tone'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useMyCourses, useMyStudent } from '@/features/learn/api'
import {
  isOverdue,
  useLearnDashboard,
  type LearnTask,
} from '@/features/learn/dashboard'
import { TASK_STATE_META } from '@/features/learn/status'
import { PageHeader } from '@/components/patterns/PageHeader'
import { FilterStatCard } from '@/components/patterns/FilterStatCard'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { NoStudentRecord } from '@/components/learn/NoStudentRecord'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

const KIND_ICON: Record<LearnTask['kind'], LucideIcon> = {
  assignment: FileCheck2,
  assessment: ClipboardList,
}

const taskHref = (t: LearnTask) =>
  t.kind === 'assignment'
    ? `/learn/assignments/${t.id}`
    : `/learn/assessments/${t.id}`

type Filter = 'all' | 'overdue' | 'todo' | 'awaiting' | 'marked'

// Whitelist for the ?state= param — anything else falls back to 'todo'. The
// dashboard tiles deep-link into these, so the names are part of the contract.
const FILTERS: Filter[] = ['all', 'overdue', 'todo', 'awaiting', 'marked']

const outstanding = (t: LearnTask) =>
  t.state === 'todo' || t.state === 'in_progress'

function pickTasks(tasks: LearnTask[], filter: Filter): LearnTask[] {
  switch (filter) {
    case 'overdue':
      return tasks.filter((t) => isOverdue(t))
    case 'todo':
      return tasks.filter(outstanding)
    case 'awaiting':
      return tasks.filter((t) => t.state === 'awaiting')
    case 'marked':
      return tasks.filter((t) => t.state === 'marked')
    default:
      return tasks
  }
}

export function LearnWorkPage() {
  // `t` is the task in every row callback below, so the translator is `tr`.
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

  // The filter lives in the URL so the dashboard tiles can deep-link into it.
  const [params, setParams] = useSearchParams()
  const requested = params.get('state')
  const filter: Filter =
    requested && FILTERS.includes(requested as Filter)
      ? (requested as Filter)
      : 'todo'
  const setFilter = (f: Filter) =>
    setParams(f === 'todo' ? {} : { state: f }, { replace: true })

  const courseName = useMemo(
    () => new Map((courses ?? []).map((c) => [c.id, c.title])),
    [courses],
  )

  const tasks = useMemo(() => data?.tasks ?? [], [data])

  const counts = useMemo(
    () => ({
      all: tasks.length,
      overdue: tasks.filter((t) => isOverdue(t)).length,
      todo: tasks.filter(outstanding).length,
      awaiting: tasks.filter((t) => t.state === 'awaiting').length,
      marked: tasks.filter((t) => t.state === 'marked').length,
    }),
    [tasks],
  )

  const rows = useMemo(() => {
    // Overdue first, then by deadline; undated work sinks to the bottom rather
    // than sorting as if it were due at the epoch.
    return [...pickTasks(tasks, filter)].sort((a, b) => {
      const ao = isOverdue(a) ? 0 : 1
      const bo = isOverdue(b) ? 0 : 1
      if (ao !== bo) return ao - bo
      if (!a.due_at && !b.due_at) return a.title.localeCompare(b.title)
      if (!a.due_at) return 1
      if (!b.due_at) return -1
      return a.due_at.localeCompare(b.due_at)
    })
  }, [tasks, filter])

  // Rendered in every branch so the h1 never pops in — same as the back-office.
  const header = (
    <PageHeader
      title={tr('nav.learn.work')}
      description={tr('learn.work.subtitle')}
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
  // unlinked student falls straight through to "Nothing here" — the same trap
  // the dashboard and course list already avoid.
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

  const cards: {
    key: Filter
    label: string
    value: number
    icon: LucideIcon
    tone: Tone
  }[] = [
    {
      key: 'all',
      label: tr('common.all'),
      value: counts.all,
      icon: ListTodo,
      tone: 'info',
    },
    {
      key: 'overdue',
      label: tr('common.overdue'),
      value: counts.overdue,
      icon: AlertTriangle,
      tone: counts.overdue > 0 ? 'danger' : 'muted',
    },
    {
      key: 'todo',
      label: tr('status.task.todo'),
      value: counts.todo,
      icon: ClipboardList,
      tone: 'warning',
    },
    {
      key: 'awaiting',
      label: tr('learn.stat.awaiting'),
      value: counts.awaiting,
      icon: Hourglass,
      tone: 'accent',
    },
    {
      key: 'marked',
      label: tr('status.task.marked'),
      value: counts.marked,
      icon: Trophy,
      tone: 'positive',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl">
      {header}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <FilterStatCard
            key={c.key}
            label={c.label}
            value={c.value}
            icon={c.icon}
            tone={c.tone}
            active={filter === c.key}
            onClick={() => setFilter(c.key)}
          />
        ))}
      </div>

      <div className="mt-8">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              tasks.length > 0
                ? tr('learn.empty.no_match')
                : tr('learn.empty.no_work')
            }
          />
        ) : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {rows.map((t) => {
                const Icon = KIND_ICON[t.kind]
                const over = isOverdue(t)
                const meta = TASK_STATE_META[t.state]
                return (
                  <li
                    key={`${t.kind}-${t.id}`}
                    className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                  >
                    <Icon
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden
                    />
                    <Link
                      to={taskHref(t)}
                      className="min-w-0 flex-1 hover:underline"
                    >
                      <span className="block truncate text-sm font-medium">
                        {t.title}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {courseName.get(t.course_id) ?? tr('common.course')} ·{' '}
                        {tr(
                          t.kind === 'assignment'
                            ? 'learn.kind.assignment'
                            : 'learn.kind.assessment',
                        )}
                      </span>
                    </Link>

                    {t.state === 'marked' ? (
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {t.score ?? '—'}
                        <span className="text-muted-foreground font-normal">
                          {' '}
                          / {t.outOf ?? '—'}
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
                      {t.due_at ? fmtDate(t.due_at) : tr('learn.due.none')}
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
