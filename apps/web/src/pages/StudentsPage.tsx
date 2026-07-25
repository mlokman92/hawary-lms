import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, UserPlus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAcademy } from '@/lib/academy'
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
import { STATUS_META } from '@/features/students/status'
import {
  studentStats,
  useStudents,
  type StudentRow,
  type StudentStatus,
} from '@/features/students/api'

type Sort = 'name_asc' | 'name_desc' | 'joined_desc' | 'joined_asc'
type Filter = 'all' | StudentStatus

function StatCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'hover:bg-accent rounded-xl border p-4 text-left transition-colors',
        active && 'border-primary ring-primary/40 ring-1',
      )}
    >
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </button>
  )
}

function joinedLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-MY', {
    month: 'short',
    year: 'numeric',
  })
}

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
  const { activeAcademyId, active } = useAcademy()
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'
  const { data: students, isLoading, error } = useStudents(activeAcademyId)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('joined_desc')
  const [addOpen, setAddOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  const stats = studentStats(students ?? [])

  const rows = useMemo(() => {
    let list = students ?? []
    if (filter !== 'all') list = list.filter((s) => s.status === filter)
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

  const cards: { label: string; value: number; key: Filter }[] = [
    { label: 'Total', value: stats.total, key: 'all' },
    { label: 'Active', value: stats.active, key: 'active' },
    { label: 'Trial', value: stats.trial, key: 'trial' },
    { label: 'Inactive', value: stats.inactive, key: 'inactive' },
    { label: 'Withdrawn', value: stats.withdrawn, key: 'withdrawn' },
    { label: 'Unenrolled', value: stats.unenrolled, key: 'unenrolled' },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your academy’s students and enrollment.
          </p>
        </div>
        {isStaff ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(true)}>
              <UserPlus /> Invite Student
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus /> Add Student
            </Button>
          </div>
        ) : null}
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <StatCard
            key={c.key}
            label={c.label}
            value={c.value}
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
              placeholder="Search name, email, phone, IC…"
              className="pl-8"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_META) as StudentStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name_asc">Name A–Z</SelectItem>
              <SelectItem value="name_desc">Name Z–A</SelectItem>
              <SelectItem value="joined_desc">Join date: newest</SelectItem>
              <SelectItem value="joined_asc">Join date: oldest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground rounded-xl border p-8 text-center text-sm">
            Loading students…
          </div>
        ) : error ? (
          <div className="text-destructive rounded-xl border p-8 text-center text-sm">
            {error.message}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
            {students && students.length > 0
              ? 'No students match your filters.'
              : 'No students yet. Add your first student to get started.'}
          </div>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Contact</TableHead>
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
                              Unnamed
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          Joined {joinedLabel(s.created_at)} · {s.student_no}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_META[s.status].variant}>
                          {STATUS_META[s.status].label}
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
        </>
      ) : null}
    </div>
  )
}
