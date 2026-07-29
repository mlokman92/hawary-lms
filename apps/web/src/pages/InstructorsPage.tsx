import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookX,
  CalendarOff,
  Plus,
  Search,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { fmtMonthYear } from '@/lib/format'
import { useT, type TKey } from '@/lib/i18n'
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
import { InstructorFormDialog } from '@/features/instructors/InstructorFormDialog'
import { InviteInstructorDialog } from '@/features/instructors/InviteInstructorDialog'
import { PendingInvitations } from '@/features/invitations/PendingInvitations'
import { MANUAL_STATUSES, STATUS_META } from '@/features/instructors/status'
import {
  instructorStats,
  useInstructors,
  type InstructorRow,
  type InstructorStatus,
} from '@/features/instructors/api'

type Sort = 'name_asc' | 'name_desc' | 'joined_desc' | 'joined_asc'
type Filter = 'all' | InstructorStatus | 'unassigned'

function courseLabel(i: InstructorRow) {
  const titles = i.course_instructors
    .map((c) => c.courses?.title)
    .filter((t): t is string => !!t)
  if (titles.length === 0) return null
  if (titles.length === 1) return titles[0]
  return `${titles[0]} +${titles.length - 1}`
}

export function InstructorsPage() {
  const navigate = useNavigate()
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const isStaff = active?.role === 'admin' || active?.role === 'trainer'
  const { data: instructors, isLoading, error } = useInstructors(activeAcademyId)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('joined_desc')
  const [addOpen, setAddOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  const stats = instructorStats(instructors ?? [])

  const rows = useMemo(() => {
    let list = instructors ?? []
    if (filter === 'unassigned') {
      list = list.filter((i) => i.course_instructors.length === 0)
    } else if (filter !== 'all') {
      list = list.filter((i) => i.status === filter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((i) =>
        [i.full_name, i.email, i.phone, i.ic_number, i.specialization].some(
          (v) => v?.toLowerCase().includes(q),
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
  }, [instructors, filter, search, sort])

  const cards: {
    labelKey: TKey
    value: number
    key: Filter
    icon: LucideIcon
    tone: Tone
  }[] = [
    {
      labelKey: 'common.total',
      value: stats.total,
      key: 'all',
      icon: Users,
      tone: 'info',
    },
    {
      labelKey: 'status.instructor.active',
      value: stats.active,
      key: 'active',
      icon: UserCheck,
      tone: 'positive',
    },
    {
      labelKey: 'status.instructor.on_leave',
      value: stats.on_leave,
      key: 'on_leave',
      icon: CalendarOff,
      tone: 'warning',
    },
    {
      labelKey: 'status.instructor.inactive',
      value: stats.inactive,
      key: 'inactive',
      icon: UserMinus,
      tone: 'muted',
    },
    {
      labelKey: 'status.instructor.unassigned',
      value: stats.unassigned,
      key: 'unassigned',
      icon: BookX,
      tone: 'accent',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={t('common.instructors')}
        description={t('instructors.description')}
      >
        {isStaff ? (
          <>
            <Button variant="outline" onClick={() => setInviteOpen(true)}>
              <UserPlus /> {t('instructors.invite')}
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus /> {t('instructors.add')}
            </Button>
          </>
        ) : null}
      </PageHeader>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <FilterStatCard
            key={c.key}
            label={t(c.labelKey)}
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
              placeholder={t('instructors.search_placeholder')}
              className="pl-8"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('common.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t('instructors.filter.all_statuses')}
              </SelectItem>
              {MANUAL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(STATUS_META[s].labelKey)}
                </SelectItem>
              ))}
              <SelectItem value="unassigned">
                {t('status.instructor.unassigned')}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t('common.sort')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name_asc">
                {t('instructors.sort.name_asc')}
              </SelectItem>
              <SelectItem value="name_desc">
                {t('instructors.sort.name_desc')}
              </SelectItem>
              <SelectItem value="joined_desc">
                {t('instructors.sort.joined_desc')}
              </SelectItem>
              <SelectItem value="joined_asc">
                {t('instructors.sort.joined_asc')}
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
              instructors && instructors.length > 0
                ? t('instructors.empty.no_match')
                : t('instructors.empty.none')
            }
          />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.instructor')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.courses')}</TableHead>
                  <TableHead>{t('instructors.col.contact')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((i) => {
                  const course = courseLabel(i)
                  return (
                    <TableRow
                      key={i.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/instructors/${i.id}`)}
                    >
                      <TableCell>
                        <div className="font-medium">
                          {i.full_name ?? (
                            <span className="text-muted-foreground italic">
                              {t('common.unnamed')}
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {i.specialization
                            ? t('instructors.row.meta_subject', {
                                date: fmtMonthYear(i.created_at),
                                no: i.instructor_no,
                                subject: i.specialization,
                              })
                            : t('instructors.row.meta', {
                                date: fmtMonthYear(i.created_at),
                                no: i.instructor_no,
                              })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_META[i.status].variant}>
                          {t(STATUS_META[i.status].labelKey)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {course ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {i.email ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                        {i.phone ? (
                          <div className="text-muted-foreground text-xs">
                            {i.phone}
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

      <PendingInvitations academyId={activeAcademyId} kind="instructor" />

      {activeAcademyId ? (
        <>
          <InstructorFormDialog
            academyId={activeAcademyId}
            open={addOpen}
            onOpenChange={setAddOpen}
          />
          <InviteInstructorDialog
            academyId={activeAcademyId}
            open={inviteOpen}
            onOpenChange={setInviteOpen}
          />
        </>
      ) : null}
    </div>
  )
}
