import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, FileCheck2, Search } from 'lucide-react'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useAcademy } from '@/lib/academy'
import { useTogglePublished, type ItemKind } from '@/features/modules/api'
import { useLibrary } from '@/features/library/api'
import { PageHeader } from '@/components/patterns/PageHeader'
import { EmptyState } from '@/components/patterns/EmptyState'
import { PublishSwitch } from '@/components/patterns/PublishSwitch'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * One page, two routes. Assessments and assignments differ only in which meta
 * column they carry (questions + duration vs due date), and a second copy of
 * this file would drift the moment one of them grew a filter.
 */
export function LibraryPage({ kind }: { kind: Extract<ItemKind, 'assessment' | 'assignment'> }) {
  const { t, tn } = useT()
  const { activeAcademyId } = useAcademy()
  const { data, isLoading, error } = useLibrary(kind, activeAcademyId)
  const togglePublished = useTogglePublished(activeAcademyId)
  const [search, setSearch] = useState('')
  const [course, setCourse] = useState('all')

  // Stable identity: a bare `data ?? []` is a new array every render, which
  // would re-run both memos below on every keystroke.
  const rows = useMemo(() => data ?? [], [data])

  const courses = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) if (r.course_id) m.set(r.course_id, r.course_title)
    return [...m].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (course === 'all' || r.course_id === course) &&
        (!q ||
          r.title.toLowerCase().includes(q) ||
          r.course_title.toLowerCase().includes(q) ||
          r.module_title.toLowerCase().includes(q)),
    )
  }, [rows, search, course])

  const isAssessment = kind === 'assessment'
  const Icon = isAssessment ? ClipboardList : FileCheck2

  const header = (
    <PageHeader
      title={t(isAssessment ? 'nav.assessments' : 'nav.assignments')}
      description={t(
        isAssessment ? 'library.assessments.subtitle' : 'library.assignments.subtitle',
      )}
    />
  )

  return (
    <div className="mx-auto w-full max-w-6xl">
      {header}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('library.search_placeholder')}
            className="pl-8"
          />
        </div>
        <Select value={course} onValueChange={setCourse}>
          <SelectTrigger className="w-56" aria-label={t('common.course')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('library.all_courses')}</SelectItem>
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
            icon={Icon}
            title={
              rows.length
                ? t('library.empty.no_match')
                : t(
                    isAssessment
                      ? 'library.empty.assessments'
                      : 'library.empty.assignments',
                  )
            }
            body={rows.length ? undefined : t('library.empty.hint')}
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
                      {r.title || t('common.untitled')}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {[r.course_title, r.module_title]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </Link>

                  <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:block">
                    {isAssessment
                      ? [
                          tn('library.questions', r.question_count ?? 0),
                          tn('assess.points.count', r.total_points),
                        ].join(' · ')
                      : tn('assess.points.count', r.total_points)}
                  </span>

                  <span className="text-muted-foreground hidden w-28 shrink-0 text-right text-xs tabular-nums md:block">
                    {r.deadline
                      ? fmtDate(r.deadline)
                      : t(
                          isAssessment
                            ? 'library.always_open'
                            : 'learn.due.none',
                        )}
                  </span>

                  <PublishSwitch
                    checked={r.is_published}
                    title={r.title}
                    onChange={(next) =>
                      togglePublished.mutate({ kind, id: r.id, next })
                    }
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
