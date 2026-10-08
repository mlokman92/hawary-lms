// HARNESS-ONLY VARIANT of apps/web/src/pages/ReportsPage.tsx.
//
// Substituted by tools/capture/web/variants/plugin.mjs for the showreel; never
// written into apps/web. It is the product's page, line for line, with exactly
// one addition (search "AI"): each queue row carries one more cell, the AI
// check's result for the latest upload — "3 points to fix", "12 of 12 met" or
// "Checking…" — as the app's own outline Badge with the lucide Sparkles icon.
// The value is read from the row (`ai_state`, `ai_points`), which the teaching
// partition derives from the report's own timeline; nothing is hard-coded here.
//
// The data-* attributes are invisible hooks for the screenshot tool.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileWarning,
  Inbox,
  MoreHorizontal,
  Sparkles,
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
  type ReportRow,
  type ReportStatus,
} from '@/features/reports/api'

const TILES: {
  status: ReportStatus
  icon: typeof Inbox
}[] = [
  { status: 'submitted', icon: Inbox },
  { status: 'in_review', icon: Eye },
  { status: 'changes_requested', icon: FileWarning },
  { status: 'approved', icon: CheckCircle2 },
]

// AI: what the check said about the latest upload, in the reader's language.
type AiRow = ReportRow & {
  ai_state?: 'checking' | 'fix' | 'pass' | null
  ai_points?: number | null
}

function aiLabel(r: AiRow, ms: boolean): string | null {
  if (r.ai_state === 'checking') return ms ? 'Menyemak…' : 'Checking…'
  if (r.ai_state === 'pass') return ms ? '12 daripada 12 dipenuhi' : '12 of 12 met'
  if (r.ai_state === 'fix') {
    const n = r.ai_points ?? 0
    if (ms) return `${n} perkara perlu dibetulkan`
    return `${n} point${n === 1 ? '' : 's'} to fix`
  }
  return null
}

export function ReportsPage() {
  const { t, lang } = useT()
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

  const rows = (queue.data?.rows ?? []) as AiRow[]
  const total = queue.data?.total ?? 0

  /** A tile both filters and un-filters: pressing the pressed one clears. */
  function toggle(next: ReportStatus) {
    setStatus((cur) => (cur === next ? 'all' : next))
    setPage(0)
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={t('report.title')}
        description={t('report.queue.desc')}
      >
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

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4" data-tiles="">
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
                const ai = aiLabel(r, lang === 'ms')
                return (
                  <li key={r.id} data-report-row="">
                    <Link
                      to={`/lpkc/${r.id}`}
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

                      {isAdmin ? (
                        <span className="text-muted-foreground hidden shrink-0 text-xs sm:block">
                          {personName(r.instructors?.full_name) ??
                            t('report.unassigned')}
                        </span>
                      ) : null}

                      <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums md:block">
                        {fmtDateTime(r.submitted_at)}
                      </span>

                      {/* AI */}
                      {ai ? (
                        <Badge
                          variant="outline"
                          className="shrink-0"
                          data-ai-check={r.ai_state ?? ''}
                          title={lang === 'ms' ? 'Semakan AI' : 'AI check'}
                        >
                          <Sparkles />
                          {ai}
                        </Badge>
                      ) : null}

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
