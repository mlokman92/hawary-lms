import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ClipboardList,
  FileCheck2,
  Hourglass,
  ListTodo,
  Search,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { fmtDateTime } from '@/lib/format'
import { useT, type TFn } from '@/lib/i18n'
import { useAcademy } from '@/lib/academy'
import type { Tone } from '@/lib/tone'
import {
  useAcademyQueue,
  useMyGradableCourses,
  type QueueRow,
} from '@/features/grading/api'
import { PageHeader } from '@/components/patterns/PageHeader'
import { EmptyState } from '@/components/patterns/EmptyState'
import { FilterStatCard } from '@/components/patterns/FilterStatCard'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Filter = 'all' | 'awaiting' | 'marked'

const name = (row: QueueRow, t: TFn) =>
  row.student?.full_name?.trim() ||
  row.student?.student_no ||
  t('grading.unknown_student')

/**
 * The grading queue for one kind of work, across every course the caller may
 * mark.
 *
 * One page for both routes: an attempt and a submission differ in which detail
 * page they open and whether they carry an attempt number, and nothing else
 * worth a second file. The academy-wide scope is the point — a trainer teaching
 * four courses had to open each one's grading page in turn to find out whether
 * anything was waiting.
 *
 * `/courses/:id/grading` still exists and still works; this is the same data
 * without having to pick a course first.
 */
export function GradingQueuePage({
  kind,
}: {
  kind: 'assessment' | 'assignment'
}) {
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const isAdmin = active?.role === 'admin'
  const { data, isLoading, error } = useAcademyQueue(kind, activeAcademyId)
  const { data: gradable, isLoading: gradableLoading } = useMyGradableCourses(
    activeAcademyId,
    isAdmin,
  )

  // Course lives in the URL so the course page can deep-link into it.
  const [params, setParams] = useSearchParams()
  const course = params.get('course') ?? 'all'
  const setCourse = (id: string) =>
    setParams(id === 'all' ? {} : { course: id }, { replace: true })

  const [filter, setFilter] = useState<Filter>('awaiting')
  const [search, setSearch] = useState('')

  const rows = useMemo(() => data ?? [], [data])

  // Every course this caller may grade — not only the ones with work waiting,
  // so picking a quiet course says "nothing to mark" instead of vanishing from
  // the list.
  const courses = useMemo(
    () =>
      [...(gradable?.courses ?? [])].sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
    [gradable],
  )
  const courseTitle = useMemo(
    () => new Map(courses.map((c) => [c.id, c.title])),
    [courses],
  )

  const counts = useMemo(
    () => ({
      all: rows.length,
      awaiting: rows.filter((r) => r.status === 'submitted').length,
      marked: rows.filter((r) => r.status !== 'submitted').length,
    }),
    [rows],
  )

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (course !== 'all' && r.courseId !== course) return false
      if (filter === 'awaiting' && r.status !== 'submitted') return false
      if (filter === 'marked' && r.status === 'submitted') return false
      if (!q) return true
      return (
        (r.student?.full_name ?? '').toLowerCase().includes(q) ||
        (r.student?.student_no ?? '').toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (courseTitle.get(r.courseId) ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, course, filter, search, courseTitle])

  const isAssessment = kind === 'assessment'
  const Icon = isAssessment ? ClipboardList : FileCheck2

  const header = (
    <PageHeader
      title={t(isAssessment ? 'nav.assessments' : 'nav.assignments')}
      description={t(
        isAssessment ? 'grading.queue.subtitle.assessments' : 'grading.queue.subtitle.assignments',
      )}
    />
  )

  // A trainer with no linked instructors row grades nothing, and an empty queue
  // reads as "all caught up" rather than "you were never assigned anything".
  if (!gradableLoading && !isAdmin && !gradable?.linked) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {header}
        <EmptyState
          className="mt-6"
          size="block"
          icon={Icon}
          title={t('grading.denied.title')}
          body={t('grading.denied.no_instructor_record')}
        />
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
      key: 'awaiting',
      label: t('grading.queue.awaiting'),
      value: counts.awaiting,
      icon: Hourglass,
      tone: counts.awaiting > 0 ? 'warning' : 'muted',
    },
    {
      key: 'marked',
      label: t('grading.queue.marked'),
      value: counts.marked,
      icon: Trophy,
      tone: 'positive',
    },
    {
      key: 'all',
      label: t('common.all'),
      value: counts.all,
      icon: ListTodo,
      tone: 'info',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl">
      {header}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('grading.queue.search_placeholder')}
            className="pl-8"
          />
        </div>
        <Select value={course} onValueChange={setCourse}>
          <SelectTrigger className="w-56" aria-label={t('common.course')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all_courses')}</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={Icon}
            title={
              rows.length
                ? t('grading.queue.no_match')
                : t(
                    isAssessment
                      ? 'grading.queue.empty.assessments'
                      : 'grading.queue.empty.assignments',
                  )
            }
            body={rows.length ? undefined : t('grading.queue.empty.hint')}
          />
        ) : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {shown.map((r) => (
                <li
                  key={r.id}
                  className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                >
                  <Icon
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden
                  />
                  <Link to={r.href} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate text-sm font-medium">
                      {name(r, t)}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {[
                        r.title,
                        courseTitle.get(r.courseId),
                        r.attemptNo != null
                          ? t('grading.attempt_no', { no: r.attemptNo })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </Link>

                  {r.status === 'submitted' ? (
                    <Badge variant="secondary" className="shrink-0">
                      {t('grading.queue.awaiting')}
                    </Badge>
                  ) : (
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {r.score ?? '—'}
                      <span className="text-muted-foreground font-normal">
                        {' '}
                        / {r.outOf ?? '—'}
                      </span>
                    </span>
                  )}

                  {r.status === 'returned' ? (
                    <Badge variant="destructive" className="shrink-0">
                      {t('status.submission.returned')}
                    </Badge>
                  ) : null}

                  <span className="text-muted-foreground hidden w-36 shrink-0 text-right text-xs tabular-nums md:block">
                    {r.submittedAt ? fmtDateTime(r.submittedAt) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
