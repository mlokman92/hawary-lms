import { lazy, Suspense, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Users } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { fmtDateTime, fmtYearMonth, personName } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { PageHeader } from '@/components/patterns/PageHeader'
import { StatCard } from '@/components/patterns/StatCard'
import { EmptyState } from '@/components/patterns/EmptyState'
import { Pager } from '@/components/patterns/Pager'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Card } from '@/components/ui/card'
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
import { useLoginAnalytics, useUserLogins } from '@/features/analytics/api'

// Recharts stays out of the main bundle, as it does on the dashboard.
const LoginChart = lazy(() =>
  import('@/features/analytics/LoginChart').then((m) => ({
    default: m.LoginChart,
  })),
)

const PAGE_SIZE = 50

/** A hand-edited URL must not reach the RPC with something it will refuse. */
function readMonth(raw: string | null): string | null {
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : null
}

/**
 * Whether students are using the LMS: their logins per day, how many different
 * students that was across the month, and when each one was last seen. Staff
 * are left out by the database, not filtered here.
 *
 * The bars are a total and the tile is a head count, on purpose — somebody who
 * logs in on ten days is ten logins and one active student.
 *
 * Gated on the route (`AnalyticsRoute`) and again in both RPCs. The month is in
 * the URL, like the payment report's: a figure gets quoted to somebody, and
 * "September" has to survive being pasted.
 */
export function AnalyticsPage() {
  const { t, tn } = useT()
  const navigate = useNavigate()
  const { activeAcademyId } = useAcademy()
  const [params, setParams] = useSearchParams()
  const month = readMonth(params.get('m'))

  const stats = useLoginAnalytics(activeAcademyId, month)
  const users = useUserLogins(activeAcademyId)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // The database's own list, plus the month in the URL if it lies outside it —
  // otherwise the selector would sit blank over a chart that is showing one.
  const months = useMemo(() => {
    const data = stats.data
    if (!data) return []
    return data.months.includes(data.month)
      ? data.months
      : [data.month, ...data.months]
  }, [stats.data])

  const rows = useMemo(() => {
    const list = users.data ?? []
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((u) =>
      [u.full_name, u.email].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [users.data, search])
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={t('analytics.title')}
        description={t('analytics.subtitle')}
      >
        <Select
          value={stats.data?.month ?? ''}
          disabled={!stats.data}
          onValueChange={(m) =>
            // The current month is the default, so it is not written down: a
            // bookmarked page should roll over with the calendar.
            setParams(m === stats.data?.months[0] ? {} : { m }, {
              replace: true,
            })
          }
        >
          <SelectTrigger className="w-44" aria-label={t('analytics.month')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {fmtYearMonth(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="mt-6">
        {stats.isLoading ? (
          <LoadingBlock />
        ) : stats.error ? (
          <ErrorBlock error={stats.error} />
        ) : stats.data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label={t('analytics.active_users')}
                value={String(stats.data.active_users)}
                icon={Users}
                tone="info"
              />
            </div>

            <Card className="mt-4 gap-4 p-4">
              <div>
                <p className="text-muted-foreground text-xs">
                  {t('analytics.logins_per_day')}
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {tn('analytics.logins_total', stats.data.logins)}
                </p>
              </div>
              {stats.data.logins === 0 ? (
                <div className="text-muted-foreground flex h-56 items-center justify-center text-sm">
                  {t('analytics.no_logins')}
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div className="text-muted-foreground flex h-56 items-center justify-center text-sm">
                      {t('common.loading')}
                    </div>
                  }
                >
                  <LoginChart days={stats.data.days} />
                </Suspense>
              )}
            </Card>
          </>
        ) : null}
      </div>

      <div className="mt-8">
        <div className="relative mb-3 max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              // A narrower list has fewer pages; do not strand the reader on
              // one that no longer exists.
              setPage(1)
            }}
            placeholder={t('analytics.users.search_placeholder')}
            aria-label={t('analytics.users.search_placeholder')}
            className="pl-8"
          />
        </div>

        {users.isLoading ? (
          <LoadingBlock />
        ) : users.error ? (
          <ErrorBlock error={users.error} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              users.data && users.data.length > 0
                ? t('analytics.users.no_match')
                : t('common.empty')
            }
          />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.student')}</TableHead>
                  <TableHead>{t('analytics.users.col.last_login')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((u) => {
                  // The row opens the student's record — "who is this, and
                  // can I reach them" is the next question after "they have
                  // not been in for a month".
                  const recordPath = u.student_id
                    ? `/students/${u.student_id}`
                    : null
                  return (
                    <TableRow
                      key={u.user_id}
                      className={recordPath ? 'cursor-pointer' : undefined}
                      onClick={
                        recordPath ? () => navigate(recordPath) : undefined
                      }
                    >
                      <TableCell>
                        <div className="font-medium">
                          {personName(u.full_name, u.email) ??
                            t('common.unnamed')}
                        </div>
                        {u.full_name?.trim() && u.email ? (
                          <div className="text-muted-foreground text-xs">
                            {u.email}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {u.last_login_at ? (
                          fmtDateTime(u.last_login_at)
                        ) : (
                          <span className="text-muted-foreground">
                            {t('analytics.users.never')}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <Pager
          page={page}
          total={rows.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
