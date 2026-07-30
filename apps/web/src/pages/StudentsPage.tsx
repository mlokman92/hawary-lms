import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BookX,
  FileUp,
  Hourglass,
  Plus,
  Search,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { fmtMonthYear } from '@/lib/format'
import { useT } from '@/lib/i18n'
import type { Tone } from '@/lib/tone'
import { PageHeader } from '@/components/patterns/PageHeader'
import { FilterStatCard } from '@/components/patterns/FilterStatCard'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { StudentFormDialog } from '@/features/students/StudentFormDialog'
import { InviteStudentDialog } from '@/features/students/InviteStudentDialog'
import { ImportDialog } from '@/features/import/ImportDialog'
import { studentImportSpec } from '@/features/students/importSpec'
import { PendingInvitations } from '@/features/invitations/PendingInvitations'
import { MANUAL_STATUSES, STATUS_META } from '@/features/students/status'
import {
  STUDENT_STATUSES,
  studentStats,
  useImportStudents,
  useStudents,
  type StudentRow,
  type StudentStatus,
} from '@/features/students/api'

type Sort = 'name_asc' | 'name_desc' | 'joined_desc' | 'joined_asc'
type Filter = 'all' | StudentStatus

// Whitelist for the ?status= param — anything else falls back to 'all'.
const FILTERS: Filter[] = ['all', ...STUDENT_STATUSES]

function courseLabel(s: StudentRow) {
  const titles = s.enrollments
    .map((e) => e.courses?.title)
    .filter((t): t is string => !!t)
  if (titles.length === 0) return null
  if (titles.length === 1) return titles[0]
  return `${titles[0]} +${titles.length - 1}`
}

export function StudentsPage() {
  const navigate = useNavigate()
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'
  const { data: students, isLoading, error } = useStudents(activeAcademyId)

  const [search, setSearch] = useState('')
  // The status filter lives in the URL so other pages can deep-link into it
  // (the dashboard's "No course yet" tile points at ?status=unenrolled).
  const [params, setParams] = useSearchParams()
  const requested = params.get('status')
  const filter: Filter =
    requested && FILTERS.includes(requested as Filter)
      ? (requested as Filter)
      : 'all'
  const setFilter = (f: Filter) =>
    setParams(f === 'all' ? {} : { status: f }, { replace: true })
  const [sort, setSort] = useState<Sort>('joined_desc')
  const [addOpen, setAddOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const importStudents = useImportStudents(activeAcademyId ?? '')

  const stats = studentStats(students ?? [])

  const rows = useMemo(() => {
    let list = students ?? []
    if (filter === 'unenrolled') {
      list = list.filter((s) => s.enrollments.length === 0)
    } else if (filter !== 'all') {
      list = list.filter((s) => s.status === filter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((s) =>
        [s.full_name, s.email, s.phone, s.ic_number].some((v) =>
          v?.toLowerCase().includes(q),
        ),
      )
    }
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'name_asc':
          return (a.full_name ?? '').localeCompare(b.full_name ?? '')
        case 'name_desc':
          return (b.full_name ?? '').localeCompare(a.full_name ?? '')
        case 'joined_asc':
          return a.created_at.localeCompare(b.created_at)
        default:
          return b.created_at.localeCompare(a.created_at)
      }
    })
  }, [students, filter, search, sort])

  const cards: {
    label: string
    value: number
    key: Filter
    icon: LucideIcon
    tone: Tone
  }[] = [
    {
      label: t('common.total'),
      value: stats.total,
      key: 'all',
      icon: Users,
      tone: 'info',
    },
    {
      label: t('status.student.active'),
      value: stats.active,
      key: 'active',
      icon: UserCheck,
      tone: 'positive',
    },
    {
      label: t('status.student.trial'),
      value: stats.trial,
      key: 'trial',
      icon: Hourglass,
      tone: 'warning',
    },
    {
      label: t('status.student.inactive'),
      value: stats.inactive,
      key: 'inactive',
      icon: UserMinus,
      tone: 'muted',
    },
    {
      label: t('status.student.withdrawn'),
      value: stats.withdrawn,
      key: 'withdrawn',
      icon: UserX,
      tone: 'danger',
    },
    {
      label: t('status.student.unenrolled'),
      value: stats.unenrolled,
      key: 'unenrolled',
      icon: BookX,
      tone: 'accent',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={t('common.students')}
        description={t('students.page.description')}
      >
        {isStaff ? (
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp /> {t('import.students')}
            </Button>
            <Button variant="outline" onClick={() => setInviteOpen(true)}>
              <UserPlus /> {t('students.action.invite')}
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus /> {t('students.action.add')}
            </Button>
          </>
        ) : null}
      </PageHeader>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
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

      {/* Records */}
      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('students.search_placeholder')}
              className="pl-8"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('common.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t('students.filter.all_statuses')}
              </SelectItem>
              {MANUAL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(STATUS_META[s].labelKey)}
                </SelectItem>
              ))}
              <SelectItem value="unenrolled">
                {t('status.student.unenrolled')}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t('common.sort')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name_asc">
                {t('students.sort.name_asc')}
              </SelectItem>
              <SelectItem value="name_desc">
                {t('students.sort.name_desc')}
              </SelectItem>
              <SelectItem value="joined_desc">
                {t('students.sort.joined_desc')}
              </SelectItem>
              <SelectItem value="joined_asc">
                {t('students.sort.joined_asc')}
              </SelectItem>
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
                ? t('students.empty.no_match')
                : t('students.empty.none')
            }
          />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.student')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.course')}</TableHead>
                  <TableHead>{t('students.table.contact')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const course = courseLabel(s)
                  return (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/students/${s.id}`)}
                    >
                      <TableCell>
                        <div className="font-medium">
                          {s.full_name ?? (
                            <span className="text-muted-foreground italic">
                              {t('common.unnamed')}
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {t('students.row.joined', {
                            date: fmtMonthYear(s.created_at),
                            no: s.student_no,
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_META[s.status].variant}>
                          {t(STATUS_META[s.status].labelKey)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {course ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {s.email ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                        {s.phone ? (
                          <div className="text-muted-foreground text-xs">
                            {s.phone}
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <PendingInvitations academyId={activeAcademyId} kind="student" />

      {activeAcademyId ? (
        <>
          <StudentFormDialog
            academyId={activeAcademyId}
            open={addOpen}
            onOpenChange={setAddOpen}
          />
          <InviteStudentDialog
            academyId={activeAcademyId}
            open={inviteOpen}
            onOpenChange={setInviteOpen}
          />
          {/* `existing` is the loaded roster, so duplicate detection costs no
              extra round trip — it compares against what the page already has. */}
          <ImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            spec={studentImportSpec}
            existing={students ?? []}
            onImport={(payload) => importStudents.mutateAsync(payload)}
            titleKey="import.students.title"
            descriptionKey="import.students.description"
          />
        </>
      ) : null}
    </div>
  )
}
