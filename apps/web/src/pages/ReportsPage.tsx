import { useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  ClipboardCheck,
  FileText,
  Layers,
  MoreHorizontal,
  NotebookText,
  Presentation,
  Users,
  type LucideIcon,
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
  LPKC_STAGES,
  LPKC_STAGE_LABEL,
  REPORT_PAGE_SIZE,
  REPORT_STATUS,
  stageOf,
  useReportPartCounts,
  useReportQueue,
  type LpkcStage,
  type ReportFilters,
  type ReportPartCounts,
  type ReportStage,
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
 * The cards are the page's one filter: All, then one per part of the LPKC. A
 * checker works through one kind at a time — the summaries, then the reports —
 * so the kind is what they pick. It opens on All; pressing the pressed kind
 * goes back to it.
 *
 * There is no filter by status. The list is sorted by it instead — moderating,
 * pending trainer approval, changes needed, approved — so what needs somebody
 * is at the top and what is finished sinks, and within a status the report
 * that has gone longest without anything happening comes first.
 *
 * A trainer is not shown a report that is still being moderated: it has not
 * reached them yet, and the three statuses they act on are the ones they see.
 * That is this page's choice of what to list, not a boundary — the report is
 * theirs under RLS from the moment it is sent.
 */

const PART_ICON: Record<LpkcStage, LucideIcon> = {
  summary: NotebookText,
  report: FileText,
  slide: Presentation,
}

/**
 * One colour per part, for the badge on each row. Filled, where the status
 * badge beside it is an outline, and in colours no status uses (those are
 * blue, amber, red and green) — so the two badges cannot be read for each
 * other. Both halves of every pair are spelled out for Tailwind's scanner.
 */
const PART_BADGE: Record<LpkcStage, string> = {
  summary:
    'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300',
  report:
    'border-transparent bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300',
  slide:
    'border-transparent bg-pink-100 text-pink-800 dark:bg-pink-500/20 dark:text-pink-300',
}

type Part = LpkcStage | 'all'

/** `?type=` — absent means every kind, which is what the page opens on. */
function partOf(raw: string | null): Part {
  return LPKC_STAGES.includes(raw as LpkcStage) ? (raw as LpkcStage) : 'all'
}

/** Reports of one part that this reader is shown. */
function countOf(
  counts: ReportPartCounts | undefined,
  part: LpkcStage,
  hideModerating: boolean,
): number {
  if (!counts) return 0
  let n = 0
  for (const s of Object.keys(counts[part]) as ReportStage[]) {
    if (hideModerating && s === 'moderating') continue
    n += counts[part][s]
  }
  return n
}

export function ReportsPage() {
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const location = useLocation()
  const isAdmin = active?.role === 'admin'
  const hideModerating = active?.role === 'trainer'

  // In the address, not in state: opening the page from the menu lands on
  // every kind, while Back from a report returns to the kind being worked
  // through (the row passes this page's query string along as `state.back`).
  const [params, setParams] = useSearchParams()
  const part = partOf(params.get('type'))

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [poolOpen, setPoolOpen] = useState(false)

  const debounced = useDebounced(search)
  const filters = useMemo<ReportFilters>(
    () => ({
      status: 'all',
      part,
      search: debounced,
      hideModerating,
      order: 'stage',
    }),
    [part, debounced, hideModerating],
  )

  const queue = useReportQueue(activeAcademyId, filters, page)
  const { data: counts } = useReportPartCounts(activeAcademyId)

  const rows = queue.data?.rows ?? []
  const total = queue.data?.total ?? 0
  const everyKind = LPKC_STAGES.reduce(
    (n, p) => n + countOf(counts, p, hideModerating),
    0,
  )

  /** A kind both filters and un-filters: pressing the pressed one is All. */
  function toggle(next: LpkcStage) {
    setParams(part === next ? {} : { type: next }, { replace: true })
    setPage(0)
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={t('report.title')}
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

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FilterStatCard
          label={t('common.all')}
          value={everyKind}
          icon={Layers}
          tone="info"
          active={part === 'all'}
          onClick={() => {
            setParams({}, { replace: true })
            setPage(0)
          }}
        />
        {LPKC_STAGES.map((p) => (
          <FilterStatCard
            key={p}
            label={t(LPKC_STAGE_LABEL[p])}
            value={countOf(counts, p, hideModerating)}
            icon={PART_ICON[p]}
            tone="info"
            active={part === p}
            onClick={() => toggle(p)}
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
            // A kind with nothing in it is "nothing waiting", not a search
            // that found nothing.
            title={
              debounced
                ? t('report.queue.empty_filtered')
                : t('report.queue.empty')
            }
            // Only when there is nothing of any kind — and the hint names the ⋯
            // menu, which only an admin is drawn. Telling a trainer to go and
            // set the rota would point at a control that is not on their screen
            // and is not theirs to change.
            body={
              isAdmin && everyKind === 0 && !debounced
                ? t('report.queue.empty_hint')
                : undefined
            }
          />
        ) : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {rows.map((r) => {
                const meta = REPORT_STATUS[stageOf(r)]
                return (
                  <li key={r.id}>
                    <Link
                      to={`/lpkc/${r.id}`}
                      state={{ back: location.search }}
                      className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                    >
                      <span className="min-w-0 flex-1">
                        {/* Which part it is, beside the name and on every row:
                            a student has a row here for each part they send,
                            and the colour is what tells them apart at a
                            glance. */}
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {personName(r.students?.full_name) ??
                              t('common.unnamed')}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn('shrink-0', PART_BADGE[r.lpkc_stage])}
                          >
                            {t(LPKC_STAGE_LABEL[r.lpkc_stage])}
                          </Badge>
                        </span>
                        {/* No title: it is the student's own wording, long
                            and different on every row, and the thread is where
                            it is read. */}
                        <span className="text-muted-foreground block truncate text-xs">
                          {[
                            r.courses?.title,
                            r.version > 1
                              ? t('report.version', { version: r.version })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
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

                      {/* When it last changed — the date the list is ordered
                          by within a status. */}
                      <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums md:block">
                        {fmtDateTime(r.updated_at)}
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
