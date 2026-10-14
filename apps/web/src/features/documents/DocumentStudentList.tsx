import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { fmtDay, personName } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDocumentStudents, type DocumentStudent } from './api'

/** Rows shown at first, and added by each "Load more". */
const ROSTER_STEP = 50

/**
 * The roster every Documents page is: every student, narrowed by search and
 * by course, with one cell at the end that is the page's own business — the
 * letter's download, or the IC copy.
 *
 * The course options come from the students in hand rather than from the
 * course list, so a course nobody is on is not offered as a way to see nothing.
 */
export function DocumentStudentList({
  lastHead,
  lastCell,
  statusFilter,
  latestFirst,
  first,
  selection,
  actions,
  only,
  emptyLabel,
  className,
  tableClassName,
}: {
  /** Header of the trailing column. Left out, the roster has none. */
  lastHead?: ReactNode
  lastCell?: (student: DocumentStudent) => ReactNode
  /**
   * A third narrowing, for a page whose document has a state worth filtering
   * on. `allLabel` is the option that filters nothing; `matches` is asked only
   * about the others. `defaultValue` is what the page opens on — one of the
   * options, else everyone.
   */
  statusFilter?: {
    label: string
    allLabel: string
    defaultValue?: string
    options: { value: string; label: string }[]
    matches: (student: DocumentStudent, value: string) => boolean
  }
  /**
   * Order by this date, latest first, instead of by name — the course's start,
   * or when the letter was signed. A student without one goes last. Pass a
   * stable function: it is a dependency of the rows.
   */
  latestFirst?: (student: DocumentStudent) => string | null | undefined
  /**
   * Students to list ahead of everybody else — the applications still waiting,
   * on the KWSP page. Each half keeps its own order. Pass a stable function:
   * it is a dependency of the rows.
   */
  first?: (student: DocumentStudent) => boolean
  /**
   * A checkbox on every row, for a page that acts on many students at once.
   * The selection never holds a student who is not in view: narrowing the
   * roster drops whoever it hides, so nothing is acted on out of sight.
   */
  selection?: {
    selected: ReadonlySet<string>
    onChange: (next: Set<string>) => void
  }
  /** The page's own buttons, at the end of the filter row. */
  actions?: ReactNode
  /**
   * Who the roster is about at all, before any filter — the students who have
   * a KWSP letter, say. The others are not offered, counted or searched. Pass
   * a stable function: it is a dependency of the rows.
   */
  only?: (student: DocumentStudent) => boolean
  /** What to say when `only` leaves nobody. */
  emptyLabel?: string
  className?: string
  /** On the table's frame — a height and a scroll, inside a dialog. */
  tableClassName?: string
}) {
  const { t } = useT()
  const { activeAcademyId } = useAcademy()
  const { data, isLoading, error } = useDocumentStudents(activeAcademyId)
  const students = useMemo(
    () => (only ? data?.filter(only) : data),
    [data, only],
  )
  const [search, setSearch] = useState('')
  const [course, setCourse] = useState('all')
  const [status, setStatus] = useState(statusFilter?.defaultValue ?? 'all')

  const courses = useMemo(() => {
    const byId = new Map<string, string>()
    for (const s of students ?? []) {
      if (s.course) byId.set(s.course.id, s.course.title)
    }
    return [...byId]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [students])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matching = (students ?? []).filter(
      (s) =>
        (course === 'all' || s.course?.id === course) &&
        (status === 'all' || !statusFilter || statusFilter.matches(s, status)) &&
        (!q ||
          [s.full_name, s.student_no, s.ic_number, s.email].some((v) =>
            v?.toLowerCase().includes(q),
          )),
    )
    // The read is ordered by name and sort is stable, so students with one
    // date — and in each half of `first` — stay alphabetical.
    if (latestFirst) {
      matching.sort((a, b) => {
        const x = latestFirst(a) ?? ''
        const y = latestFirst(b) ?? ''
        return x === y ? 0 : x === '' ? 1 : y === '' ? -1 : x < y ? 1 : -1
      })
    }
    if (first) matching.sort((a, b) => Number(first(b)) - Number(first(a)))
    return matching
  }, [students, search, course, status, statusFilter, latestFirst, first])

  // A roster you tick boxes on shows everyone: "select all" has to reach the
  // whole of what the filters left, and nothing is acted on out of sight.
  // Narrowing starts the count again from the top.
  const [limit, setLimit] = useState(ROSTER_STEP)
  useEffect(() => setLimit(ROSTER_STEP), [search, course, status])
  const shown = selection ? rows : rows.slice(0, limit)

  const selected = selection?.selected
  const onSelect = selection?.onChange
  useEffect(() => {
    if (!selected || !onSelect) return
    const inView = new Set(rows.map((s) => s.id))
    const kept = [...selected].filter((id) => inView.has(id))
    if (kept.length !== selected.size) onSelect(new Set(kept))
  }, [rows, selected, onSelect])
  const allSelected =
    !!selected && rows.length > 0 && rows.every((s) => selected.has(s.id))

  return (
    <div className={cn('mt-6', className)}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('sdoc.offer.search')}
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
        {statusFilter ? (
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-56" aria-label={statusFilter.label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{statusFilter.allLabel}</SelectItem>
              {statusFilter.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {actions}
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            students && students.length > 0
              ? t('sdoc.empty.no_match')
              : (emptyLabel ?? t('sdoc.empty.none'))
          }
        />
      ) : (
        <div className={cn('rounded-xl border', tableClassName)}>
          <Table>
            <TableHeader>
              <TableRow>
                {selected && onSelect ? (
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() =>
                        onSelect(
                          new Set(allSelected ? [] : rows.map((s) => s.id)),
                        )
                      }
                      aria-label={t('sdoc.select_all')}
                    />
                  </TableHead>
                ) : null}
                <TableHead>{t('common.student')}</TableHead>
                <TableHead>{t('sdoc.col.ic')}</TableHead>
                <TableHead>{t('common.course')}</TableHead>
                <TableHead>{t('sdoc.col.start_date')}</TableHead>
                {lastCell ? (
                  <TableHead className="text-right">{lastHead}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((s) => (
                <TableRow key={s.id}>
                  {selected && onSelect ? (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(s.id)}
                        onCheckedChange={(on) => {
                          const next = new Set(selected)
                          if (on === true) next.add(s.id)
                          else next.delete(s.id)
                          onSelect(next)
                        }}
                        aria-label={
                          personName(s.full_name, s.email) ?? s.student_no
                        }
                      />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <div className="font-medium">
                      {personName(s.full_name, s.email) ?? t('common.unnamed')}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {s.student_no}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {s.ic_number ?? '—'}
                  </TableCell>
                  <TableCell>{s.course?.title ?? '—'}</TableCell>
                  <TableCell>{fmtDay(s.course?.start_date)}</TableCell>
                  {lastCell ? (
                    <TableCell className="text-right">{lastCell(s)}</TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {shown.length < rows.length ? (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLimit((n) => n + ROSTER_STEP)}
          >
            {t('common.load_more')}
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums">
            {t('common.shown_of', { shown: shown.length, total: rows.length })}
          </span>
        </div>
      ) : null}
    </div>
  )
}
