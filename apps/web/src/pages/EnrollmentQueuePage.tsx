import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Hourglass, ListTodo, Search, UserCheck, UserPlus } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import type { Tone } from '@/lib/tone'
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
import { ReviewApplicationDialog } from '@/features/enrollment/ReviewApplicationDialog'
import {
  APPLICATION_STATUS_LABEL,
  useApplicationQueue,
  type QueueApplication,
} from '@/features/enrollment/api'

type Filter = 'all' | 'pending' | 'reviewed'

/**
 * Every enrollment application the caller may act on, across courses.
 *
 * Academy-wide like the grading queue, and for the same reason: the SELECT
 * policy is `app.can_grade_course(course_id)`, so an admin sees the academy and
 * a trainer sees only the courses they are assigned to — no client-side
 * narrowing, and nothing to keep in step with the server.
 */
export function EnrollmentQueuePage() {
  const { t } = useT()
  const { activeAcademyId } = useAcademy()
  const { data, isLoading, error } = useApplicationQueue(activeAcademyId)

  // Course lives in the URL so the course page can deep-link into it.
  const [params, setParams] = useSearchParams()
  const course = params.get('course') ?? 'all'
  const setCourse = (id: string) =>
    setParams(id === 'all' ? {} : { course: id }, { replace: true })

  const [filter, setFilter] = useState<Filter>('pending')
  const [search, setSearch] = useState('')
  const [reviewing, setReviewing] = useState<QueueApplication | null>(null)

  const rows = useMemo(() => data ?? [], [data])

  // Built from the applications themselves: a course with no application has
  // nothing to filter to, and the caller's gradable-course list is a second
  // query for no gain here.
  const courses = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) if (r.courses) map.set(r.courses.id, r.courses.title)
    return [...map].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const counts = useMemo(
    () => ({
      all: rows.length,
      pending: rows.filter((r) => r.status === 'pending').length,
      reviewed: rows.filter((r) => r.status !== 'pending').length,
    }),
    [rows],
  )

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (course !== 'all' && r.course_id !== course) return false
      if (filter === 'pending' && r.status !== 'pending') return false
      if (filter === 'reviewed' && r.status === 'pending') return false
      if (!q) return true
      return [r.full_name, r.email, r.phone, r.courses?.title].some((v) =>
        v?.toLowerCase().includes(q),
      )
    })
  }, [rows, course, filter, search])

  const cards: {
    key: Filter
    label: string
    value: number
    icon: typeof Hourglass
    tone: Tone
  }[] = [
    {
      key: 'pending',
      label: t('enroll.queue.pending'),
      value: counts.pending,
      icon: Hourglass,
      tone: counts.pending > 0 ? 'warning' : 'muted',
    },
    {
      key: 'reviewed',
      label: t('enroll.queue.reviewed'),
      value: counts.reviewed,
      icon: UserCheck,
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
      <PageHeader
        title={t('nav.enrollments')}
        description={t('enroll.queue.subtitle')}
      />

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
            placeholder={t('enroll.queue.search_placeholder')}
            className="pl-8"
          />
        </div>
        <Select value={course} onValueChange={setCourse}>
          <SelectTrigger className="w-56" aria-label={t('common.course')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all_courses')}</SelectItem>
            {courses.map(([id, title]) => (
              <SelectItem key={id} value={id}>
                {title}
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
            icon={UserPlus}
            title={
              rows.length ? t('enroll.queue.no_match') : t('enroll.queue.empty')
            }
            body={rows.length ? undefined : t('enroll.queue.empty_hint')}
          />
        ) : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {shown.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setReviewing(r)}
                    className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                  >
                    <UserPlus
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.full_name}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {[r.courses?.title, r.email, r.phone]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <Badge
                      variant={r.status === 'pending' ? 'secondary' : 'outline'}
                      className="shrink-0"
                    >
                      {t(APPLICATION_STATUS_LABEL[r.status])}
                    </Badge>
                    <span className="text-muted-foreground hidden w-28 shrink-0 text-right text-xs tabular-nums md:block">
                      {fmtDate(r.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <ReviewApplicationDialog
        academyId={activeAcademyId}
        application={reviewing}
        open={!!reviewing}
        onOpenChange={(o) => {
          if (!o) setReviewing(null)
        }}
      />
    </div>
  )
}
