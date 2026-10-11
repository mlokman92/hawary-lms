import { useState } from 'react'
import { useRouter } from 'expo-router'
import { fmtDays, personName } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  REPORT_PAGE_SIZE,
  REPORT_STATUS,
  useReportCounts,
  stageOf,
  useReportQueue,
  type ReportStage,
} from '@/features/reports/api'
import { useScope } from '@/shell/scope'
import {
  Badge,
  Card,
  Chips,
  Empty,
  ErrorBlock,
  Loading,
  Row,
  Screen,
  SearchInput,
} from '@/ui'
import { Pager } from '@/ui/Pager'

type Filter = ReportStage | 'all'
// No "Waiting": a report is "moderating" from the moment it is sent, and
// "pending trainer approval" once a system admin has added to it.
const ORDER: ReportStage[] = [
  'moderating',
  'pending_approval',
  'changes_requested',
  'approved',
]
// A trainer's turn comes first on their own screen.
const TRAINER_FIRST: ReportStage[] = [
  'pending_approval',
  'moderating',
  'changes_requested',
  'approved',
]

const daysSince = (iso: string): number =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

/**
 * The LPKC checking queue, longest wait first.
 *
 * No instructor filter, and that is not an omission: RLS narrows a trainer to
 * the reports assigned to them, so a picker could not change the result. "Who
 * holds it" is shown to an admin only — for a trainer the answer is always
 * "you" (docs/report-checks.md).
 */
export default function LpkcTab() {
  const { t } = useT()
  const router = useRouter()
  const { academyId, isAdmin } = useScope()
  const [picked, setPicked] = useState<Filter | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const { data: counts } = useReportCounts(academyId)
  // Until somebody picks a chip: the first stage that has anything in it.
  const status: Filter =
    picked ??
    (counts
      ? ((isAdmin ? ORDER : TRAINER_FIRST).find((s) => counts[s] > 0) ?? 'all')
      : 'all')
  const { data, isLoading, error, refetch, isRefetching } = useReportQueue(
    academyId,
    { status, search },
    page,
  )

  const total = counts ? ORDER.reduce((n, s) => n + counts[s], 0) : undefined
  const rows = data?.rows ?? []

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Chips<Filter>
        value={status}
        onChange={(v) => {
          setPicked(v)
          setPage(0)
        }}
        options={[
          ...ORDER.map((s) => ({
            value: s as Filter,
            label: t(REPORT_STATUS[s].labelKey),
            count: counts?.[s],
          })),
          { value: 'all' as Filter, label: t('common.all'), count: total },
        ]}
      />
      <SearchInput
        value={search}
        onChangeText={(v) => {
          setSearch(v)
          setPage(0)
        }}
        placeholder={t('report.queue.search')}
      />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <Empty
          icon="clipboard"
          title={
            search || status !== 'all'
              ? t('report.queue.empty_filtered')
              : t('report.queue.empty')
          }
        />
      ) : (
        <Card flush>
          {rows.map((r, i) => {
            const meta = REPORT_STATUS[stageOf(r)]
            return (
              <Row
                key={r.id}
                first={i === 0}
                title={
                  personName(r.students?.full_name, r.students?.email) ??
                  t('common.unnamed')
                }
                subtitle={[
                  r.title,
                  r.courses?.title,
                  isAdmin
                    ? (r.instructors?.full_name ?? t('report.unassigned'))
                    : null,
                  fmtDays(daysSince(r.submitted_at)),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={<Badge label={t(meta.labelKey)} tone={meta.tone} />}
                onPress={() => router.push(`/lpkc/${r.id}` as never)}
              />
            )
          })}
        </Card>
      )}
      <Pager
        page={page + 1}
        pageSize={REPORT_PAGE_SIZE}
        total={data?.total ?? 0}
        onChange={(p) => setPage(p - 1)}
      />
    </Screen>
  )
}
