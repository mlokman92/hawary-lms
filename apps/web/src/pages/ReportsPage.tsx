import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileWarning,
  Inbox,
  MoreHorizontal,
  Users,
} from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { useT } from '@/lib/i18n'
import { fmtDateTime, personName } from '@/lib/format'
import { useDebounced } from '@/lib/useDebounced'
import { cn } from '@/lib/utils'
import { TONE_CLASS } from '@/lib/tone'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/patterns/PageHeader'
import { Pager } from '@/components/patterns/Pager'
import { FilterStatCard } from '@/components/patterns/FilterStatCard'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { ReportPoolDialog } from '@/features/reports/ReportPoolDialog'
import {
  REPORT_PAGE_SIZE,
  REPORT_STATUS,
  useReportCounts,
  useReportQueue,
  type ReportFilters,
  type ReportStatus,
} from '@/features/reports/api'

/**
 * The checking queue.
 *
 * Academy-wide for an admin, and exactly one desk for a trainer — not because
 * this page filters, but because RLS does: `reports: admin all, own instructor,
 * own student` means a trainer's own JWT reads only the reports assigned to
 * them. So there is no instructor picker here, the same conclusion
 * `/appointments/list` reached: a control that cannot change the result is
 * worse than no control.
 *
 * Oldest first, which is the only order a queue has. The four tiles are a sum
 * over a set, so pressing one shows that set — the `/payments` rule.
 */

const TILES: {
  status: ReportStatus
  icon: typeof Inbox
}[] = [
  { status: 'submitted', icon: Inbox },
  { status: 'in_review', icon: Eye },
  { status: 'changes_requested', icon: FileWarning },
  { status: 'approved', icon: CheckCircle2 },
]

export function ReportsPage() {
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const isAdmin = active?.role === 'admin'

  const [status, setStatus] = useState<ReportStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [poolOpen, setPoolOpen] = useState(false)

  const debounced = useDebounced(search)
  const filters = useMemo<ReportFilters>(
    () => ({ status, search: debounced }),
    [status, debounced],
  )

  const queue = useReportQueue(activeAcademyId, filters, page)
  const { data: counts } = useReportCounts(activeAcademyId)

  const rows = queue.data?.rows ?? []
  const total = queue.data?.total ?? 0

  /** A tile both filters and un-filters: pressing the pressed one clears. */
  function toggle(next: ReportStatus) {
    setStatus((cur) => (cur === next ? 'all' : next))
    setPage(0)
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={t('nav.reports')}
        description={t('report.queue.desc')}
      >
        {/* Setting up the rota is an occasional act, so it is behind the menu.
            Admin-only: a trainer changing who checks reports would be changing
            their colleagues' workload. */}
        {isAdmin ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal />
                <span className="sr-only">{t('common.actions')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setPoolOpen(true)}>
                <Users />
                {t('report.pool.title')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </PageHeader>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {TILES.map(({ status: s, icon }) => (
          <FilterStatCard
            key={s}
            label={t(REPORT_STATUS[s].labelKey)}
            value={counts?.[s] ?? 0}
            icon={icon}
            tone={REPORT_STATUS[s].tone}
            active={status === s}
            onClick={() => toggle(s)}
          />
        ))}
      </div>

      <div className="mt-6">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          placeholder={t('report.queue.search')}
          className="max-w-sm"
        />
      </div>

      <div className="mt-4">
        {queue.isLoading ? (
          <LoadingBlock />
        ) : queue.error ? (
          <ErrorBlock error={queue.error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={
              status === 'all' && !debounced
                ? t('report.queue.empty')
                : t('report.queue.empty_filtered')
            }
            // The hint names the ⋯ menu, which only an admin is drawn. Telling
            // a trainer to go and set the rota would point at a control that is
            // not on their screen and is not theirs to change.
            body={
              isAdmin && status === 'all' && !debounced
                ? t('report.queue.empty_hint')
                : undefined
            }
          />
        ) : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {rows.map((r) => {
                const meta = REPORT_STATUS[r.status]
                return (
                  <li key={r.id}>
                    <Link
                      to={`/reports/${r.id}`}
                      className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {personName(r.students?.full_name) ??
                            t('common.unnamed')}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {r.title}
                          {r.courses?.title ? ` · ${r.courses.title}` : ''}
                          {r.version > 1
                            ? ` · ${t('report.version', { version: r.version })}`
                            : ''}
                        </span>
                      </span>

                      {/* Who holds it. Shown to an admin only: for a trainer
                          the answer is always "you", and a column of your own
                          name is not information. */}
                      {isAdmin ? (
                        <span className="text-muted-foreground hidden shrink-0 text-xs sm:block">
                          {personName(r.instructors?.full_name) ??
                            t('report.unassigned')}
                        </span>
                      ) : null}

                      <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums md:block">
                        {fmtDateTime(r.submitted_at)}
                      </span>

                      <Badge
                        variant="outline"
                        className={cn('shrink-0', TONE_CLASS[meta.tone])}
                      >
                        {t(meta.labelKey)}
                      </Badge>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        <Pager
          page={page + 1}
          total={total}
          pageSize={REPORT_PAGE_SIZE}
          onPageChange={(p) => setPage(p - 1)}
        />
      </div>

      {activeAcademyId ? (
        <ReportPoolDialog
          academyId={activeAcademyId}
          open={poolOpen}
          onOpenChange={setPoolOpen}
        />
      ) : null}
    </div>
  )
}
