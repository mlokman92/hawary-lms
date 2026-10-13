import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileWarning,
  MoreHorizontal,
  UserCheck,
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
  LPKC_STAGES,
  LPKC_STAGE_LABEL,
  REPORT_PAGE_SIZE,
  REPORT_STATUS,
  deskStage,
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
 * Oldest first, which is the only order a queue has. The four tiles are a sum
 * over a set, so pressing one shows that set — the `/payments` rule. There is
 * no "Waiting" tile: a report is "moderating" from the moment it is sent, and
 * "pending trainer approval" once a system admin has added to it.
 *
 * It opens on the reader's own stage — "moderating" for an admin, "pending
 * trainer approval" for a trainer — because that is the pile they came to work
 * through. Pressing the pressed tile still clears it to everything.
 *
 * Above the tiles, one button per part of the LPKC. A checker works through one
 * kind at a time — the summaries, then the reports — so the part is a single
 * press, always on screen, and not a menu to open. The two filters count
 * within each other: a tile is of the part that is picked, a part is of the
 * tile that is pressed.
 */

const TILES: {
  status: ReportStage
  icon: typeof Eye
}[] = [
  { status: 'moderating', icon: Eye },
  { status: 'pending_approval', icon: UserCheck },
  { status: 'changes_requested', icon: FileWarning },
  { status: 'approved', icon: CheckCircle2 },
]

type Part = LpkcStage | 'all'
const PARTS: Part[] = ['all', ...LPKC_STAGES]

/**
 * The part somebody is working through outlives the trip into a report and
 * back — picking it again after every one would undo the point of the button.
 * The session only: it is where a person was, not a setting.
 */
const PART_KEY = 'hawary.lpkc.part'

function readPart(): Part {
  try {
    const raw = sessionStorage.getItem(PART_KEY)
    if (PARTS.includes(raw as Part)) return raw as Part
  } catch {
    // Private mode. The buttons still work for this visit.
  }
  return 'all'
}

/** Reports at `stage` ('all': any) within `part` ('all': any). */
function countOf(
  counts: ReportPartCounts | undefined,
  part: Part,
  stage: ReportStage | 'all',
): number {
  if (!counts) return 0
  let n = 0
  for (const p of LPKC_STAGES) {
    if (part !== 'all' && part !== p) continue
    for (const s of Object.keys(counts[p]) as ReportStage[]) {
      if (stage === 'all' || stage === s) n += counts[p][s]
    }
  }
  return n
}

export function ReportsPage() {
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const isAdmin = active?.role === 'admin'

  // Null until a tile is pressed: the opening filter follows the role, and the
  // role can arrive a render after this page does.
  const [picked, setPicked] = useState<ReportStage | 'all' | null>(null)
  const status = picked ?? deskStage(active?.role)
  const [part, setPartState] = useState<Part>(readPart)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [poolOpen, setPoolOpen] = useState(false)

  const debounced = useDebounced(search)
  const filters = useMemo<ReportFilters>(
    () => ({ status, part, search: debounced }),
    [status, part, debounced],
  )

  const queue = useReportQueue(activeAcademyId, filters, page)
  const { data: counts } = useReportPartCounts(activeAcademyId)

  const rows = queue.data?.rows ?? []
  const total = queue.data?.total ?? 0

  /** A tile both filters and un-filters: pressing the pressed one clears. */
  function toggle(next: ReportStage) {
    setPicked(status === next ? 'all' : next)
    setPage(0)
  }

  function setPart(next: Part) {
    setPartState(next)
    setPage(0)
    try {
      sessionStorage.setItem(PART_KEY, next)
    } catch {
      // Private mode / quota. The choice still holds for this visit.
    }
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

      <div className="mt-6 flex flex-wrap gap-2">
        {PARTS.map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={part === p ? 'default' : 'outline'}
            aria-pressed={part === p}
            onClick={() => setPart(p)}
          >
            {p === 'all' ? t('report.queue.all_parts') : t(LPKC_STAGE_LABEL[p])}
            <span className="tabular-nums opacity-70">
              {countOf(counts, p, status)}
            </span>
          </Button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map(({ status: s, icon }) => (
          <FilterStatCard
            key={s}
            label={t(REPORT_STATUS[s].labelKey)}
            value={countOf(counts, part, s)}
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
            // The page opens filtered, so an empty opening pile is "nothing
            // waiting", not a search that found nothing.
            title={
              (status === 'all' || picked === null) &&
              part === 'all' &&
              !debounced
                ? t('report.queue.empty')
                : t('report.queue.empty_filtered')
            }
            // The hint names the ⋯ menu, which only an admin is drawn. Telling
            // a trainer to go and set the rota would point at a control that is
            // not on their screen and is not theirs to change.
            body={
              isAdmin && status === 'all' && part === 'all' && !debounced
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
                      className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {personName(r.students?.full_name) ??
                            t('common.unnamed')}
                        </span>
                        {/* The part first: a student now has a row here for
                            each one, and it is what tells them apart. */}
                        <span className="text-muted-foreground block truncate text-xs">
                          {t(LPKC_STAGE_LABEL[r.lpkc_stage])}
                          {` · ${r.title}`}
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
