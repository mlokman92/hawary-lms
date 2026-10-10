import { useMemo, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { fmtDay, personName } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
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

/**
 * The roster both Documents pages are: every student, narrowed by search and
 * by course, with one cell at the end that is the page's own business — the
 * letter's download, or the IC copy.
 *
 * The course options come from the students in hand rather than from the
 * course list, so a course nobody is on is not offered as a way to see nothing.
 */
export function DocumentStudentList({
  lastHead,
  lastCell,
}: {
  /** Header of the trailing column. */
  lastHead: ReactNode
  lastCell: (student: DocumentStudent) => ReactNode
}) {
  const { t } = useT()
  const { activeAcademyId } = useAcademy()
  const {
    data: students,
    isLoading,
    error,
  } = useDocumentStudents(activeAcademyId)
  const [search, setSearch] = useState('')
  const [course, setCourse] = useState('all')

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
    return (students ?? []).filter(
      (s) =>
        (course === 'all' || s.course?.id === course) &&
        (!q ||
          [s.full_name, s.student_no, s.ic_number, s.email].some((v) =>
            v?.toLowerCase().includes(q),
          )),
    )
  }, [students, search, course])

  return (
    <div className="mt-6">
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
              : t('sdoc.empty.none')
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.student')}</TableHead>
                <TableHead>{t('sdoc.col.ic')}</TableHead>
                <TableHead>{t('common.course')}</TableHead>
                <TableHead>{t('sdoc.col.start_date')}</TableHead>
                <TableHead className="text-right">{lastHead}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
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
                  <TableCell className="text-right">{lastCell(s)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
