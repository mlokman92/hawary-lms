import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Download } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { downloadCsv } from '@/lib/csv'
import { fmtDate, fmtYearMonth, personName } from '@/lib/format'
import { useT, type TFn } from '@/lib/i18n'
import { useCourse } from '@/features/courses/api'
import { useStudent } from '@/features/students/api'
import { PageHeader } from '@/components/patterns/PageHeader'
import { BackLink } from '@/components/patterns/BackLink'
import { EmptyState } from '@/components/patterns/EmptyState'
import { Pager } from '@/components/patterns/Pager'
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
import {
  PAGE_SIZE,
  PAYMENT_METHOD_LABEL,
  fetchPaymentLogAll,
  usePaymentLogPage,
  usePaymentLogTotals,
  type PaymentLogFilters,
  type PaymentLogRow,
} from '@/features/payments/api'
import {
  NO_COURSE_KEY,
  REPORT_PAGE_SIZE,
  fetchInvoiceReportAll,
  nextDim,
  readView,
  scopeOf,
  useInvoiceReport,
  useInvoiceReportPage,
  usePaymentReport,
  useReceivableTotals,
  type DateRange,
  type DrillPath,
  type ReceivableInvoiceRow,
  type ReceivableRow,
  type ReportDim,
  type ReportRow,
} from '@/features/payments/report'

/**
 * Only what was narrowed goes in the address bar.
 *
 * The whole state of this page is in the URL, because a report is read *to*
 * somebody: "August, Prasekolah Siri 2, RM77,000" is a sentence you paste into
 * a message, and a screen whose drill lived in `useState` could not be pasted.
 */
function withParams(
  prev: URLSearchParams,
  next: Record<string, string | null>,
): URLSearchParams {
  const out = new URLSearchParams(prev)
  for (const [key, value] of Object.entries(next)) {
    if (value) out.set(key, value)
    else out.delete(key)
  }
  return out
}

/** A hand-edited URL must not reach the RPC with something it cannot cast. */
function readDay(raw: string | null): string | null {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

function readMonth(raw: string | null): string | null {
  return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * An id, or nothing.
 *
 * Links outlive the code that wrote them and a query string is hand-editable,
 * so a malformed id has to read as "not narrowed" here rather than reaching the
 * RPC, where it would fail the uuid cast and show the reader an error instead
 * of a report. `withNone` admits the no-course sentinel, which is a real bucket
 * and not an id.
 */
function readId(raw: string | null, withNone = false): string | null {
  if (!raw) return null
  if (withNone && raw === NO_COURSE_KEY) return raw
  return UUID.test(raw) ? raw : null
}

function readPage(raw: string | null): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/** One rung of the trail. `params` is null for the rung being looked at. */
type Crumb = { label: string; params: Record<string, string | null> | null }

function dimHeader(dim: ReportDim, t: TFn): string {
  if (dim === 'month') return t('payments.report.month')
  if (dim === 'course') return t('common.course')
  return t('common.student')
}

/**
 * The report: two views over one drill — month → course → student → the rows.
 *
 * **Received** aggregates payments: where the money came from. **Outstanding**
 * aggregates invoices: billed, paid and still owing, debtors first — the
 * question a cash ledger cannot answer at all, because a student who has paid
 * nothing has no payment row and their debt is invisible in it.
 *
 * The rungs are not a fixed path but three independent narrowings, and the
 * table groups by whichever is still open — so `?c=` alone reads "this course,
 * by month" and needs no separate screen. When all three are fixed there is
 * nothing left to group by, and the rows themselves are what is left.
 *
 * Every figure comes from a totals function over the same scope the rows were
 * grouped from, so the summary and the column can never disagree.
 */
export function PaymentReportPage() {
  const { t, tn } = useT()
  const { activeAcademyId } = useAcademy()
  const [params, setParams] = useSearchParams()
  const [exporting, setExporting] = useState(false)

  // Read as primitives first: `scope` is memoised, and an object rebuilt every
  // render would make the memo — and so the query key under it — churn.
  const view = readView(params.get('view'))
  const from = readDay(params.get('from'))
  const to = readDay(params.get('to'))
  const month = readMonth(params.get('m'))
  const courseKey = readId(params.get('c'), true)
  const studentKey = readId(params.get('s'))
  const page = readPage(params.get('page'))

  const range: DateRange = { from, to }
  const path: DrillPath = { month, course: courseKey, student: studentKey }

  // `replace`: narrowing a report is not somewhere you navigate back through
  // one keystroke at a time, and a history entry per date edit would bury the
  // page the reader arrived from.
  const commit = useCallback(
    (next: Record<string, string | null>) =>
      setParams((prev) => withParams(prev, next), { replace: true }),
    [setParams],
  )

  const dim = nextDim(path)
  const scope = useMemo(
    () =>
      scopeOf({ month, course: courseKey, student: studentKey }, { from, to }),
    [month, courseKey, studentKey, from, to],
  )

  const cash = view === 'received'

  // --- Received: the payments book -----------------------------------------
  // The leaf reads the ledger itself rather than a second row-level function
  // that could drift from the aggregate above it. `succeeded` because this view
  // is money received: a bounced attempt belongs in the log, not in a total of
  // takings, and the two calls must count the same rows.
  const paymentFilters: PaymentLogFilters = useMemo(
    () => ({ search: '', status: 'succeeded', scope }),
    [scope],
  )
  const paymentRungs = usePaymentReport(
    activeAcademyId,
    cash ? dim : null,
    scope,
  )
  // Rows only at the bottom of the drill: 50 rows fetched behind every
  // aggregate rung would be a request nobody reads.
  const paymentLeaf = usePaymentLogPage(
    activeAcademyId,
    paymentFilters,
    'paid',
    page,
    cash && !dim,
  )
  const paymentTotals = usePaymentLogTotals(
    cash ? activeAcademyId : null,
    paymentFilters,
  )

  // --- Outstanding: the invoice book ---------------------------------------
  const invoiceRungs = useInvoiceReport(
    activeAcademyId,
    cash ? null : dim,
    scope,
  )
  const invoiceLeaf = useInvoiceReportPage(
    activeAcademyId,
    scope,
    page,
    !cash && !dim,
  )
  const invoiceTotals = useReceivableTotals(
    cash ? null : activeAcademyId,
    scope,
  )

  const total = cash
    ? (paymentTotals.data?.total ?? 0)
    : (invoiceTotals.data?.count ?? 0)
  const summaryReady = cash
    ? paymentTotals.data !== undefined
    : invoiceTotals.data !== undefined

  // Breadcrumb labels for a course and a student are not in the URL — only
  // their ids are — so they come from the record. Cached reads the section
  // already makes; a report is opened from somewhere else inside it.
  const course = useCourse(
    path.course && path.course !== NO_COURSE_KEY ? path.course : undefined,
  )
  const student = useStudent(path.student ?? undefined)

  // A crumb clears the rungs chosen *inside* it and keeps its own, so pressing
  // "August 2026" from a student goes back to August's courses rather than all
  // the way out. The date window and the view survive every crumb: "all of it"
  // means all of the period being reported on, in the book being read.
  const crumbs: Crumb[] = [
    {
      // The anchor names the book being read, so the trail reads as one
      // sentence in either view rather than saying "payments" over invoices.
      label: t(cash ? 'payments.report.all' : 'payments.report.all_invoices'),
      params: { m: null, c: null, s: null, page: null },
    },
  ]
  if (path.month)
    crumbs.push({
      label: fmtYearMonth(path.month),
      params: { c: null, s: null, page: null },
    })
  if (path.course)
    crumbs.push({
      label:
        path.course === NO_COURSE_KEY
          ? t('payments.report.no_course')
          : (course.data?.title ?? t('common.loading')),
      params: { s: null, page: null },
    })
  if (path.student)
    crumbs.push({
      label:
        personName(student.data?.full_name, student.data?.email) ??
        t('common.unnamed'),
      params: { page: null },
    })
  // The last rung is where you already are, so it is a label and not a link.
  crumbs[crumbs.length - 1] = { ...crumbs[crumbs.length - 1], params: null }

  function drill(key: string) {
    if (dim === 'month') commit({ m: key, page: null })
    else if (dim === 'course') commit({ c: key, page: null })
    else if (dim === 'student') commit({ s: key, page: null })
  }

  /** A group's own name, once the database's blanks are given words. */
  function rowLabel(key: string, label: string): string {
    if (dim === 'month') return fmtYearMonth(key)
    if (key === NO_COURSE_KEY) return t('payments.report.no_course')
    return label.trim() || t('common.unnamed')
  }

  const paymentGroups = paymentRungs.data?.rows ?? []
  const invoiceGroups = invoiceRungs.data?.rows ?? []
  const groups = cash ? paymentGroups : invoiceGroups
  const groupCount = cash
    ? (paymentRungs.data?.groupCount ?? 0)
    : (invoiceRungs.data?.groupCount ?? 0)
  const clipped = groupCount - groups.length

  const rungQuery = cash ? paymentRungs : invoiceRungs
  const leafQuery = cash ? paymentLeaf : invoiceLeaf
  const loading = dim ? rungQuery.isLoading : leafQuery.isLoading
  const error = dim ? rungQuery.error : leafQuery.error
  const rowCount = dim
    ? groups.length
    : cash
      ? (paymentLeaf.data?.length ?? 0)
      : (invoiceLeaf.data?.length ?? 0)

  async function exportCsv() {
    if (!activeAcademyId) return
    setExporting(true)
    try {
      const header = dim ? dimHeader(dim, t) : ''
      let rows: (string | null | undefined)[][]
      if (dim && cash)
        rows = receivedGroupCsv(paymentGroups, rowLabel, header, t)
      else if (dim)
        rows = outstandingGroupCsv(invoiceGroups, rowLabel, header, t)
      else if (cash)
        rows = receivedLeafCsv(
          // The whole filtered set, not the page on screen: a report that
          // stops at row 50 is worse than none.
          await fetchPaymentLogAll(
            activeAcademyId,
            paymentFilters,
            'paid',
            total,
          ),
          t,
        )
      else
        rows = outstandingLeafCsv(
          await fetchInvoiceReportAll(activeAcademyId, scope, total),
          t,
        )
      downloadCsv(cash ? 'payment-report.csv' : 'outstanding-report.csv', rows)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <BackLink to="/payments">{t('payments.title')}</BackLink>
      <PageHeader
        title={t('payments.report.title')}
        description={t(
          cash
            ? 'payments.report.subtitle'
            : 'payments.report.subtitle_outstanding',
        )}
      >
        <Button
          variant="outline"
          disabled={total === 0 || exporting}
          onClick={exportCsv}
        >
          <Download />
          {exporting ? t('payments.log.exporting') : t('payments.log.export')}
        </Button>
      </PageHeader>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {/* Which book. Switching keeps the drill: "August, this course" is a
            fair question to ask of both, and losing your place to ask it would
            make the second view a different screen rather than another view. */}
        <Select
          value={view}
          onValueChange={(v) =>
            commit({ view: v === 'outstanding' ? v : null, page: null })
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="received">
              {t('payments.report.view.received')}
            </SelectItem>
            <SelectItem value="outstanding">
              {t('payments.report.view.outstanding')}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="w-40"
          value={range.from ?? ''}
          onChange={(e) => commit({ from: e.target.value || null, page: null })}
          aria-label={t('payments.report.from')}
        />
        <span className="text-muted-foreground text-sm">
          {t('payments.report.to')}
        </span>
        <Input
          type="date"
          className="w-40"
          value={range.to ?? ''}
          onChange={(e) => commit({ to: e.target.value || null, page: null })}
          aria-label={t('payments.report.to')}
        />
        {range.from || range.to ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => commit({ from: null, to: null, page: null })}
          >
            {t('common.clear')}
          </Button>
        ) : null}
        <p className="text-muted-foreground ml-auto text-sm tabular-nums">
          {!summaryReady
            ? '—'
            : cash
              ? tn('payments.log.summary', total, {
                  amount: formatMYR(paymentTotals.data?.receivedSen ?? 0),
                })
              : tn('payments.report.summary_outstanding', total, {
                  billed: formatMYR(invoiceTotals.data?.billed ?? 0),
                  outstanding: formatMYR(invoiceTotals.data?.outstanding ?? 0),
                })}
        </p>
      </div>

      {/* Where the reader is, and every way back out of it. */}
      <nav
        aria-label={t('payments.report.trail')}
        className="mt-4 flex flex-wrap items-center gap-1 text-sm"
      >
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 ? (
              <ChevronRight
                className="text-muted-foreground size-3.5"
                aria-hidden
              />
            ) : null}
            {c.params ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                onClick={() => commit(c.params!)}
              >
                {c.label}
              </button>
            ) : (
              <span className="font-medium">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="mt-4">
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} />
        ) : rowCount === 0 ? (
          <EmptyState
            size="block"
            title={t(
              cash ? 'payments.report.empty' : 'payments.report.empty_invoices',
            )}
          />
        ) : (
          <div className="rounded-xl border">
            {dim && cash ? (
              <ReceivedRungs
                rows={paymentGroups}
                header={dimHeader(dim, t)}
                label={rowLabel}
                onOpen={drill}
                t={t}
              />
            ) : dim ? (
              <OutstandingRungs
                rows={invoiceGroups}
                header={dimHeader(dim, t)}
                label={rowLabel}
                onOpen={drill}
                t={t}
              />
            ) : cash ? (
              <ReceivedLeaf rows={paymentLeaf.data ?? []} t={t} />
            ) : (
              <OutstandingLeaf rows={invoiceLeaf.data ?? []} t={t} />
            )}
          </div>
        )}

        {/* Silence about a clipped report would be a lie about the total. */}
        {dim && clipped > 0 ? (
          <p className="text-muted-foreground mt-2 text-xs">
            {t('payments.report.clipped', { count: clipped })}
          </p>
        ) : null}

        {!dim ? (
          <Pager
            page={page}
            total={total}
            pageSize={cash ? PAGE_SIZE : REPORT_PAGE_SIZE}
            onPageChange={(n) => commit({ page: n > 1 ? String(n) : null })}
          />
        ) : null}
      </div>
    </div>
  )
}

/** Settled in full, or still owing — the one thing this report exists to say. */
function SettledBadge({ owed, t }: { owed: number; t: TFn }) {
  return owed > 0 ? (
    <Badge variant="destructive">{t('payments.report.owing')}</Badge>
  ) : (
    <Badge variant="secondary">{t('payments.status.paid')}</Badge>
  )
}

type RungProps<T> = {
  rows: T[]
  header: string
  label: (key: string, label: string) => string
  onOpen: (key: string) => void
  t: TFn
}

function ReceivedRungs({
  rows,
  header,
  label,
  onOpen,
  t,
}: RungProps<ReportRow>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{header}</TableHead>
          <TableHead className="text-right">
            {t('payments.report.payments')}
          </TableHead>
          <TableHead className="text-right">
            {t('payments.report.received')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.key}
            className="cursor-pointer"
            onClick={() => onOpen(row.key)}
          >
            <TableCell>
              <div className="font-medium">{label(row.key, row.label)}</div>
              {row.sublabel ? (
                <div className="text-muted-foreground text-xs">
                  {row.sublabel}
                </div>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.paymentCount}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMYR(row.amountSen)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * Billed · paid · outstanding, debtors first.
 *
 * The badge is the answer to "who has paid": at the student rung it says so
 * for one person, and higher up it says a whole month or course is settled.
 * It is worth a badge rather than leaving the reader to notice a zero, because
 * scanning a column of amounts for the ones that are RM 0.00 is precisely the
 * work this report exists to do for you.
 */
function OutstandingRungs({
  rows,
  header,
  label,
  onOpen,
  t,
}: RungProps<ReceivableRow>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{header}</TableHead>
          <TableHead className="text-right">
            {t('payments.report.invoices')}
          </TableHead>
          <TableHead className="text-right">
            {t('payments.report.billed')}
          </TableHead>
          <TableHead className="text-right">
            {t('payments.amount.paid')}
          </TableHead>
          <TableHead className="text-right">
            {t('payments.stat.outstanding')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.key}
            className="cursor-pointer"
            onClick={() => onOpen(row.key)}
          >
            <TableCell>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{label(row.key, row.label)}</span>
                <SettledBadge owed={row.outstandingSen} t={t} />
              </div>
              {row.sublabel ? (
                <div className="text-muted-foreground text-xs">
                  {row.sublabel}
                </div>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.invoiceCount}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMYR(row.billedSen)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMYR(row.paidSen)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatMYR(row.outstandingSen)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ReceivedLeaf({ rows, t }: { rows: PaymentLogRow[]; t: TFn }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('common.date')}</TableHead>
          <TableHead>{t('payments.table.invoice')}</TableHead>
          <TableHead>{t('payments.log.method')}</TableHead>
          <TableHead className="text-right">{t('common.amount')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="whitespace-nowrap">
              {fmtDate(p.paid_at ?? p.created_at)}
            </TableCell>
            <TableCell>
              {p.invoice_id ? (
                <Link
                  to={`/payments/${p.invoice_id}`}
                  className="font-medium hover:underline"
                >
                  {p.invoice_no}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>{t(PAYMENT_METHOD_LABEL[p.method])}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMYR(p.amount_sen)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** The invoices themselves — unpaid first, longest overdue first. */
function OutstandingLeaf({
  rows,
  t,
}: {
  rows: ReceivableInvoiceRow[]
  t: TFn
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('payments.table.invoice')}</TableHead>
          <TableHead>{t('common.student')}</TableHead>
          <TableHead>{t('common.due')}</TableHead>
          <TableHead className="text-right">
            {t('payments.report.billed')}
          </TableHead>
          <TableHead className="text-right">
            {t('payments.amount.paid')}
          </TableHead>
          <TableHead className="text-right">
            {t('payments.stat.outstanding')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((inv) => (
          <TableRow key={inv.id}>
            <TableCell>
              <Link
                to={`/payments/${inv.id}`}
                className="font-medium hover:underline"
              >
                {inv.invoice_no}
              </Link>
              <div className="text-muted-foreground text-xs">
                {fmtDate(inv.issued_at)}
              </div>
            </TableCell>
            <TableCell>
              {inv.student_id ? (
                <Link
                  to={`/students/${inv.student_id}`}
                  className="hover:underline"
                >
                  {inv.student_full_name ?? t('common.unnamed')}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
              {inv.course_title ? (
                <div className="text-muted-foreground text-xs">
                  {inv.course_title}
                </div>
              ) : null}
            </TableCell>
            <TableCell className="text-muted-foreground whitespace-nowrap">
              {fmtDate(inv.due_at)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMYR(inv.total_sen)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMYR(inv.amount_paid_sen)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <div className="flex items-center justify-end gap-2">
                <SettledBadge owed={inv.balance_sen} t={t} />
                <span className="font-medium">
                  {formatMYR(inv.balance_sen)}
                </span>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * The rung on screen, as a spreadsheet.
 *
 * The sublabel column exists only where there is one to put in it — a student
 * number — because an always-blank column in a reconciliation file is a column
 * somebody has to explain.
 */
function receivedGroupCsv(
  rows: ReportRow[],
  label: (key: string, label: string) => string,
  header: string,
  t: TFn,
) {
  const withSub = rows.some((r) => r.sublabel)
  return [
    [
      header,
      ...(withSub ? [t('payments.log.csv.student_no')] : []),
      t('payments.report.payments'),
      t('payments.report.received'),
    ],
    ...rows.map((r) => [
      label(r.key, r.label),
      ...(withSub ? [r.sublabel ?? ''] : []),
      String(r.paymentCount),
      // Ringgit, not sen — this file is read by a human in a spreadsheet.
      (r.amountSen / 100).toFixed(2),
    ]),
  ]
}

function outstandingGroupCsv(
  rows: ReceivableRow[],
  label: (key: string, label: string) => string,
  header: string,
  t: TFn,
) {
  const withSub = rows.some((r) => r.sublabel)
  return [
    [
      header,
      ...(withSub ? [t('payments.log.csv.student_no')] : []),
      t('payments.report.invoices'),
      t('payments.report.billed'),
      t('payments.amount.paid'),
      t('payments.stat.outstanding'),
    ],
    ...rows.map((r) => [
      label(r.key, r.label),
      ...(withSub ? [r.sublabel ?? ''] : []),
      String(r.invoiceCount),
      (r.billedSen / 100).toFixed(2),
      (r.paidSen / 100).toFixed(2),
      (r.outstandingSen / 100).toFixed(2),
    ]),
  ]
}

function receivedLeafCsv(rows: PaymentLogRow[], t: TFn) {
  return [
    [
      t('common.date'),
      t('common.student'),
      t('payments.table.invoice'),
      t('common.course'),
      t('payments.log.method'),
      t('common.amount'),
    ],
    ...rows.map((p) => [
      // ISO, not the display format: a spreadsheet sorts "18 Aug 2026" as text.
      (p.paid_at ?? p.created_at).slice(0, 10),
      p.student_full_name ?? '',
      p.invoice_no ?? '',
      p.course_title ?? '',
      t(PAYMENT_METHOD_LABEL[p.method]),
      (p.amount_sen / 100).toFixed(2),
    ]),
  ]
}

function outstandingLeafCsv(rows: ReceivableInvoiceRow[], t: TFn) {
  return [
    [
      t('payments.table.invoice'),
      t('common.student'),
      t('payments.log.csv.student_no'),
      t('common.course'),
      t('common.due'),
      t('payments.report.billed'),
      t('payments.amount.paid'),
      t('payments.stat.outstanding'),
    ],
    ...rows.map((inv) => [
      inv.invoice_no,
      inv.student_full_name ?? '',
      inv.student_no ?? '',
      inv.course_title ?? '',
      inv.due_at?.slice(0, 10) ?? '',
      (inv.total_sen / 100).toFixed(2),
      (inv.amount_paid_sen / 100).toFixed(2),
      (inv.balance_sen / 100).toFixed(2),
    ]),
  ]
}
