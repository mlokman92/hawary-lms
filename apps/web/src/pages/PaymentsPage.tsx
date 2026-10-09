import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock, Landmark, Plus, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { fmtDate } from '@/lib/format'
import { useT, type TKey } from '@/lib/i18n'
import type { Tone } from '@/lib/tone'
import { useCourses } from '@/features/courses/api'
import { PageHeader } from '@/components/patterns/PageHeader'
import { FilterStatCard } from '@/components/patterns/FilterStatCard'
import { EmptyState } from '@/components/patterns/EmptyState'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { InvoiceFormDialog } from '@/features/payments/InvoiceFormDialog'
import {
  ALL_COURSES,
  ALL_MONEY,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
  NO_COURSE,
  collectedBreakdown,
  collectedSen,
  collectionStatus,
  useInvoiceList,
  useInvoiceStats,
  type InvoiceRow,
  type MoneyFilter,
} from '@/features/payments/api'

/**
 * A tile's figure, or a dash while the aggregate is still in flight.
 *
 * The tiles now resolve separately from the rows, and printing a confident
 * RM 0.00 for the half-second in between reads as "this academy has billed
 * nothing" — a claim, not a placeholder.
 */
function money(sen: number | undefined): string {
  return sen === undefined ? '—' : formatMYR(sen)
}

/**
 * The four tiles, in one table because each is now three things at once — a
 * label, a figure and a filter — and keeping them as four hand-written blocks
 * meant three chances for those to drift apart.
 *
 * `stat` names the field on the totals, `key` the filter it applies; they are
 * deliberately the same idea under two names so a tile cannot show one sum and
 * open another set.
 *
 * The three money tiles are separate slices of the first:
 * Total invoiced = Collected + KWSP + Outstanding. **Collected** is what
 * arrived by every route but KWSP, **KWSP** is what a withdrawal covers, and
 * **Outstanding** is what students themselves still owe — so an invoice whose
 * remainder KWSP is covering is not in Outstanding.
 */
const MONEY_TILES: {
  key: MoneyFilter
  stat: 'total' | 'collected' | 'kwsp' | 'outstanding'
  labelKey: TKey
  icon: LucideIcon
  tone: Tone
}[] = [
  {
    key: 'invoiced',
    stat: 'total',
    labelKey: 'payments.stat.invoiced',
    icon: Wallet,
    tone: 'muted',
  },
  {
    key: 'collected',
    stat: 'collected',
    labelKey: 'payments.stat.collected',
    icon: CheckCircle2,
    tone: 'positive',
  },
  {
    key: 'kwsp',
    stat: 'kwsp',
    labelKey: 'payments.method.kwsp',
    icon: Landmark,
    tone: 'info',
  },
  {
    key: 'outstanding',
    stat: 'outstanding',
    labelKey: 'payments.stat.outstanding',
    icon: Clock,
    tone: 'warning',
  },
]

/**
 * How the Paid figure beside it arrived: through the gateway (FPX) or typed in
 * by staff. The two lines add up to Paid, so KWSP is in neither — to staff it
 * has not been collected. A route with nothing against it is left out rather
 * than printed as RM 0.00, and an invoice with nothing collected is a dash.
 */
function Breakdown({ invoice }: { invoice: InvoiceRow }) {
  const { t } = useT()
  const { fpx, manual } = collectedBreakdown(invoice.payments)
  if (fpx === 0 && manual === 0)
    return <span className="text-muted-foreground">—</span>
  return (
    <div className="text-xs whitespace-nowrap tabular-nums">
      {fpx > 0 ? (
        <div>
          <span className="text-muted-foreground">
            {t('payments.method.fpx')}
          </span>{' '}
          {formatMYR(fpx)}
        </div>
      ) : null}
      {manual > 0 ? (
        <div>
          <span className="text-muted-foreground">
            {t('payments.breakdown.manual')}
          </span>{' '}
          {formatMYR(manual)}
        </div>
      ) : null}
    </div>
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `?c=` — a course id, or the no-course bucket. The same name
 * `/payments/report` uses, so the two screens speak one query string.
 *
 * Links outlive the code that wrote them and a query string is hand-editable,
 * so anything that is not an id reads as "all courses" here rather than
 * reaching PostgREST, where it would fail the uuid cast and show an error
 * instead of a list.
 */
function readCourse(raw: string | null): string {
  if (raw === NO_COURSE) return NO_COURSE
  return raw && UUID.test(raw) ? raw : ALL_COURSES
}

/**
 * `?money=` — which tile is pressed. Only a value a tile on this page can
 * apply: a filter with no pressed tile to show for it could not be seen, or
 * cleared.
 */
function readMoney(raw: string | null): MoneyFilter {
  return MONEY_TILES.find((tile) => tile.key === raw)?.key ?? ALL_MONEY
}

export function PaymentsPage() {
  const navigate = useNavigate()
  const { t } = useT()
  const { activeAcademyId, active } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isAdmin = active?.role === 'admin'
  const { data: courses } = useCourses(activeAcademyId)
  const [open, setOpen] = useState(false)
  const [showAllCourses, setShowAllCourses] = useState(false)

  // Both filters live in the address bar, not in component state. "Siri 2,
  // outstanding" is a list you send to somebody, and the one you want back
  // when you return from an invoice you opened out of it — and state that
  // dies with the component can do neither. Only what was narrowed is written:
  // the bare /payments is still "everything".
  const [params, setParams] = useSearchParams()
  const courseFilter = readCourse(params.get('c'))
  const moneyFilter = readMoney(params.get('money'))
  // `replace`: narrowing a list is not somewhere you navigate back through one
  // click at a time, and Back from an invoice should land on the list as it
  // was left, not on an earlier filter.
  const setFilter = useCallback(
    (key: 'c' | 'money', value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value) next.set(key, value)
          else next.delete(key)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  // The rows are however many pages have been loaded; the tiles are the whole
  // course-filtered set. Two queries because the loaded rows cannot answer
  // "how much is outstanding" — and the tiles deliberately ignore
  // `moneyFilter`, since a tile that emptied itself when pressed could not be
  // un-pressed by reading it. Changing either filter starts the list again
  // from the top: the filters are in the query's key and the page is not.
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInvoiceList(activeAcademyId, courseFilter, moneyFilter)
  const { data: stats } = useInvoiceStats(activeAcademyId, courseFilter)

  const allCourses = courses ?? []
  const published = allCourses.filter((c) => c.status === 'published')
  const unpublishedCount = allCourses.length - published.length
  // The course in the URL is always on offer, published or not: a link to an
  // archived course's invoices must not open with a blank picker.
  const courseOptions = showAllCourses
    ? allCourses
    : allCourses.filter(
        (c) => c.status === 'published' || c.id === courseFilter,
      )

  // Pages are cut by OFFSET, so an invoice raised between two loads pushes
  // every row down one and the next page starts with a row already on screen.
  // Keeping the first sighting of each id is what stops it appearing twice.
  const rows = useMemo(() => {
    const seen = new Set<string>()
    const out: InvoiceRow[] = []
    for (const page of data?.pages ?? [])
      for (const inv of page.rows)
        if (!seen.has(inv.id)) {
          seen.add(inv.id)
          out.push(inv)
        }
    return out
  }, [data])
  const total = data?.pages[0]?.total ?? 0
  // Either narrowing means an empty list is "nothing matched", not "nothing
  // exists" — and the difference decides whether the reader is offered a
  // Create button or told to widen.
  const filtering = courseFilter !== ALL_COURSES || moneyFilter !== ALL_MONEY

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('payments.title')} description={t('payments.subtitle')}>
        {isAdmin ? (
          <Button onClick={() => setOpen(true)}>
            <Plus /> {t('payments.new_invoice')}
          </Button>
        ) : null}
      </PageHeader>

      {/* Course filter — drives the stats and the records below. */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">{t('common.course')}</span>
        <Select
          value={courseFilter}
          onValueChange={(v) => setFilter('c', v === ALL_COURSES ? null : v)}
        >
          <SelectTrigger size="sm" className="w-56">
            <SelectValue placeholder={t('payments.filter.all_courses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_COURSES}>{t('payments.filter.all_courses')}</SelectItem>
            <SelectItem value={NO_COURSE}>
              {t('payments.filter.no_course')}
            </SelectItem>
            {courseOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
                {c.status !== 'published'
                  ? ` · ${t(
                      c.status === 'draft'
                        ? 'common.draft'
                        : 'payments.course_status.archived',
                    )}`
                  : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {unpublishedCount > 0 ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs underline"
            onClick={() => setShowAllCourses((v) => !v)}
          >
            {showAllCourses
              ? t('payments.filter.published_only')
              : t('payments.filter.show_all', { count: unpublishedCount })}
          </button>
        ) : null}
      </div>

      {/* Stats — and the list's filter. A tile is a sum over a set of
          invoices, so pressing it shows that set: "who still owes me" was
          otherwise a figure you could read but not open. The tiles keep
          showing the whole picture while one is pressed, so the next question
          is one click away rather than a click back and a click in. */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {MONEY_TILES.map((tile) => (
          <FilterStatCard
            key={tile.key}
            label={t(tile.labelKey)}
            value={money(stats?.[tile.stat])}
            // The number of invoices behind the figure — the same set the
            // tile opens. Absent, not zero, until the totals have arrived.
            count={stats?.counts[tile.stat]}
            icon={tile.icon}
            tone={tile.tone}
            active={moneyFilter === tile.key}
            // Pressing the pressed one clears, so the tiles are also the way
            // back out of the filter they applied.
            onClick={() =>
              setFilter(
                'money',
                moneyFilter === tile.key || tile.key === ALL_MONEY
                  ? null
                  : tile.key,
              )
            }
          />
        ))}
      </div>

      {/* Records */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium">
          {t('payments.records.heading')}
        </h2>
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : rows.length === 0 && filtering ? (
          <EmptyState title={t('payments.empty.no_match')} />
        ) : rows.length === 0 ? (
          <EmptyState size="block" title={t('payments.empty.none')}>
            {isAdmin ? (
              <Button variant="outline" onClick={() => setOpen(true)}>
                <Plus /> {t('payments.empty.create_first')}
              </Button>
            ) : null}
          </EmptyState>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('payments.table.invoice')}</TableHead>
                  <TableHead>{t('common.student')}</TableHead>
                  <TableHead>{t('common.course')}</TableHead>
                  <TableHead className="text-right">{t('common.total')}</TableHead>
                  <TableHead className="text-right">
                    {t('payments.amount.paid')}
                  </TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('payments.table.breakdown')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/payments/${inv.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium">{inv.invoice_no}</div>
                      <div className="text-muted-foreground text-xs">
                        {fmtDate(inv.issued_at ?? inv.created_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{inv.student?.full_name ?? '—'}</div>
                      {inv.student ? (
                        <div className="text-muted-foreground text-xs">
                          {inv.student.student_no}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {inv.course ? (
                        <span className="text-sm">{inv.course.title}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMYR(inv.total_sen)}
                    </TableCell>
                    {/* Paid and status as staff read them: money covered by
                        KWSP has not been collected. */}
                    <TableCell className="text-right tabular-nums">
                      {formatMYR(collectedSen(inv))}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={INVOICE_STATUS_VARIANT[collectionStatus(inv)]}
                      >
                        {t(INVOICE_STATUS_LABEL[collectionStatus(inv)])}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Breakdown invoice={inv} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* How far down the list you are, and the way further. Nothing at
            all once every row is on screen — the absence says so. */}
        {hasNextPage ? (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? t('common.loading') : t('common.load_more')}
            </Button>
            <span className="text-muted-foreground text-sm tabular-nums">
              {t('common.shown_of', { shown: rows.length, total })}
            </span>
          </div>
        ) : null}
      </div>

      {activeAcademyId ? (
        <InvoiceFormDialog
          academyId={academyId}
          open={open}
          onOpenChange={setOpen}
          onCreated={(id) => navigate(`/payments/${id}`)}
        />
      ) : null}
    </div>
  )
}
