import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  CircleDashed,
  Clock,
  Download,
  FileWarning,
  Plus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { downloadCsv } from '@/lib/csv'
import { fmtDate, personName } from '@/lib/format'
import { useDebounced } from '@/lib/useDebounced'
import { useT, type TFn, type TKey } from '@/lib/i18n'
import type { Tone } from '@/lib/tone'
import { useCourse } from '@/features/courses/api'
import { BackLink } from '@/components/patterns/BackLink'
import { EmptyState } from '@/components/patterns/EmptyState'
import { FilterStatCard } from '@/components/patterns/FilterStatCard'
import { PageHeader } from '@/components/patterns/PageHeader'
import { Pager } from '@/components/patterns/Pager'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  PAY_STATUS_LABEL,
  ROSTER_PAGE_SIZE,
  fetchCourseRosterAll,
  readPayStatus,
  useCourseBillingRoster,
  useCourseBillingSummary,
  type CourseBillingRow,
  type CourseBillingSummary,
  type PayStatus,
} from '@/features/payments/courseBilling'

/**
 * One course's money, from the roster rather than from the invoice book.
 *
 * `/payments` and `/payments/log` answer what people were asked for and what
 * arrived; `/payments/report` answers where it came from and who still owes.
 * None of them can answer the question this page exists for — **who has never
 * been billed** — because all four read `invoices`, and a student nobody has
 * invoiced has no row in that book at all. They are not missing from a list,
 * they are absent from the source of it.
 *
 * `enrollments` is the only table that knows somebody is on a course before
 * any money is asked for, so `course_billing_roster` starts there. On this
 * database that turns up 112 unbilled enrolments across three intakes,
 * including one whole cohort of 94 that has never been invoiced.
 *
 * It lives under the course rather than under Payments because the question is
 * asked about a course — but as its own admin-only route rather than a panel
 * on `/courses/:id`, which is where trainers build the course and where
 * `docs/money-is-admin-only.md` means RLS would hand them a page of zeroes.
 *
 * No date window, unlike the rest of the report section. "Not yet billed" is a
 * state and not a period, and any window would hide exactly the rows being
 * looked for.
 */
export function CourseBillingPage() {
  const { t, tn } = useT()
  const { id } = useParams<{ id: string }>()
  const { activeAcademyId } = useAcademy()
  const [params, setParams] = useSearchParams()
  const [invoicing, setInvoicing] = useState<string[] | null>(null)
  const [exporting, setExporting] = useState(false)

  const status = readPayStatus(params.get('status'))
  const searchRaw = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  // One request when typing settles, not one per keystroke per page.
  const search = useDebounced(searchRaw)

  // `replace`: narrowing a report is not somewhere anyone walks back through
  // one keystroke at a time.
  function commit(next: Record<string, string | null>) {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(next)) {
          if (v) out.set(k, v)
          else out.delete(k)
        }
        return out
      },
      { replace: true },
    )
  }

  const course = useCourse(id)
  const summary = useCourseBillingSummary(activeAcademyId, id)
  const roster = useCourseBillingRoster(
    activeAcademyId,
    id,
    status,
    search,
    page,
  )

  const rows = roster.data?.rows ?? []
  const total = roster.data?.total ?? 0
  const sum = summary.data ?? null

  /**
   * Bill everybody the report found unbilled.
   *
   * The whole set, fetched fresh — not the 50 rows on screen and not whatever
   * the current filter happens to be. Finding 94 unbilled students and then
   * invoicing them a page at a time would leave the report having identified
   * the work without removing any of it.
   */
  async function invoiceUnbilled() {
    if (!activeAcademyId || !id || !sum?.uninvoicedCount) return
    const all = await fetchCourseRosterAll(
      activeAcademyId,
      id,
      'uninvoiced',
      '',
      sum.uninvoicedCount,
    )
    setInvoicing(all.map((r) => r.student_id))
  }

  async function exportCsv() {
    if (!activeAcademyId || !id) return
    setExporting(true)
    try {
      // The whole filtered set: a chase list that stops at row 50 leaves debts
      // uncollected.
      const all = await fetchCourseRosterAll(
        activeAcademyId,
        id,
        status,
        search,
        total,
      )
      downloadCsv(`course-billing-${course.data?.code ?? id}.csv`, rosterCsv(all, t))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <BackLink to={`/courses/${id}`}>
        {course.data?.title ?? t('common.courses')}
      </BackLink>
      <PageHeader
        title={t('courses.billing.title')}
        description={course.data?.title}
      >
        {sum && sum.uninvoicedCount > 0 ? (
          <Button onClick={invoiceUnbilled}>
            <Plus />
            {tn('courses.billing.invoice_unbilled', sum.uninvoicedCount)}
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={total === 0 || exporting}
          onClick={exportCsv}
        >
          <Download />
          {exporting ? t('payments.log.exporting') : t('payments.log.export')}
        </Button>
      </PageHeader>

      {/* Four sums over four sets of students, so pressing one shows that set —
          the same bargain the /payments tiles make. "Never invoiced" is the
          one that exists on no other screen, so it leads. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((tile) => (
          <FilterStatCard
            key={tile.status}
            label={t(tile.labelKey)}
            value={sum ? tile.count(sum) : '—'}
            icon={tile.icon}
            tone={tile.tone}
            active={status === tile.status}
            // Pressing the pressed tile clears, so the tiles are also the way
            // back out of the filter they applied.
            onClick={() =>
              commit({
                status: status === tile.status ? null : tile.status,
                page: null,
              })
            }
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder={t('courses.billing.search')}
          value={searchRaw}
          onChange={(e) => commit({ q: e.target.value || null, page: null })}
        />
        {status || searchRaw ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => commit({ status: null, q: null, page: null })}
          >
            {t('common.clear')}
          </Button>
        ) : null}
        <p className="text-muted-foreground ml-auto text-sm tabular-nums">
          {sum
            ? t('courses.billing.summary', {
                students: sum.studentCount,
                billed: formatMYR(sum.billedSen),
                outstanding: formatMYR(sum.outstandingSen),
              })
            : '—'}
        </p>
      </div>

      <div className="mt-4">
        {roster.isLoading || summary.isLoading ? (
          <LoadingBlock />
        ) : roster.error || summary.error ? (
          <ErrorBlock error={roster.error ?? summary.error} />
        ) : rows.length === 0 ? (
          <EmptyState
            size="block"
            title={t(
              // Nobody on the course at all is a different fact from nobody
              // matching the filter, and only one of them is worth clearing a
              // filter over.
              sum === null
                ? 'courses.billing.empty_course'
                : 'courses.billing.empty_filter',
            )}
          />
        ) : (
          <div className="rounded-xl border">
            <RosterTable rows={rows} t={t} />
          </div>
        )}

        <Pager
          page={page}
          total={total}
          pageSize={ROSTER_PAGE_SIZE}
          onPageChange={(n) => commit({ page: n > 1 ? String(n) : null })}
        />
      </div>

      {activeAcademyId && invoicing ? (
        <InvoiceFormDialog
          academyId={activeAcademyId}
          open
          onOpenChange={(open) => {
            if (!open) setInvoicing(null)
          }}
          // Closing is all this needs to do. `useCreateInvoices` invalidates
          // both of this page's queries through `invalidateMoney`, and it does
          // so for a batch as well — where `onCreated` is not called at all,
          // since there is no single invoice to open.
          onCreated={() => setInvoicing(null)}
          initialStudentIds={invoicing}
          initialCourseId={id}
        />
      ) : null}
    </div>
  )
}

/** A tile: a label, a count, and the set of students it opens. */
const TILES: {
  status: PayStatus
  labelKey: TKey
  icon: LucideIcon
  tone: Tone
  count: (s: CourseBillingSummary) => number
}[] = [
  {
    status: 'uninvoiced',
    labelKey: 'courses.billing.status.uninvoiced',
    icon: FileWarning,
    tone: 'danger',
    count: (s) => s.uninvoicedCount,
  },
  {
    status: 'unpaid',
    labelKey: 'courses.billing.status.unpaid',
    icon: CircleDashed,
    tone: 'warning',
    count: (s) => s.unpaidCount,
  },
  {
    status: 'partial',
    labelKey: 'courses.billing.status.partial',
    icon: Clock,
    tone: 'info',
    count: (s) => s.partialCount,
  },
  {
    status: 'paid',
    labelKey: 'courses.billing.status.paid',
    icon: CheckCircle2,
    tone: 'positive',
    count: (s) => s.paidCount,
  },
]

const STATUS_VARIANT: Record<
  PayStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  uninvoiced: 'destructive',
  unpaid: 'destructive',
  partial: 'outline',
  paid: 'secondary',
}

function RosterTable({ rows, t }: { rows: CourseBillingRow[]; t: TFn }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('common.student')}</TableHead>
          <TableHead>{t('payments.table.invoice')}</TableHead>
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
        {rows.map((r) => (
          <TableRow key={r.student_id}>
            <TableCell>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/students/${r.student_id}`}
                  className="font-medium hover:underline"
                >
                  {personName(r.full_name, r.email) ?? t('common.unnamed')}
                </Link>
                <Badge variant={STATUS_VARIANT[r.pay_status]}>
                  {t(PAY_STATUS_LABEL[r.pay_status])}
                </Badge>
              </div>
              <div className="text-muted-foreground text-xs">
                {r.student_no}
              </div>
            </TableCell>
            <TableCell>
              {r.last_invoice_id ? (
                <>
                  <Link
                    to={`/payments/${r.last_invoice_id}`}
                    className="hover:underline"
                  >
                    {r.last_invoice_no}
                  </Link>
                  {/* Only when there is more than one, and then it is the
                      reason the figures beside it are bigger than the invoice
                      being named. */}
                  {r.invoice_count > 1 ? (
                    <div className="text-muted-foreground text-xs">
                      {t('courses.billing.of_invoices', {
                        count: r.invoice_count,
                      })}
                    </div>
                  ) : r.due_at ? (
                    <div className="text-muted-foreground text-xs">
                      {t('common.due')} {fmtDate(r.due_at)}
                    </div>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMYR(r.billed_sen)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMYR(r.paid_sen)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatMYR(r.outstanding_sen)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * The roster as a spreadsheet.
 *
 * Carries the phone and email because the file is worked from — the row that
 * matters most is a student nobody has billed, and the next thing anybody does
 * with that row is contact them.
 */
function rosterCsv(rows: CourseBillingRow[], t: TFn) {
  return [
    [
      t('common.student'),
      t('payments.log.csv.student_no'),
      t('common.email'),
      t('common.phone'),
      t('common.status'),
      t('payments.table.invoice'),
      t('common.due'),
      t('payments.report.billed'),
      t('payments.amount.paid'),
      t('payments.stat.outstanding'),
    ],
    ...rows.map((r) => [
      r.full_name ?? '',
      r.student_no,
      r.email ?? '',
      r.phone ?? '',
      t(PAY_STATUS_LABEL[r.pay_status]),
      r.last_invoice_no ?? '',
      // ISO, not the display format: a spreadsheet sorts "18 Aug 2026" as text.
      r.due_at?.slice(0, 10) ?? '',
      // Ringgit, not sen — this file is read by a human.
      (r.billed_sen / 100).toFixed(2),
      (r.paid_sen / 100).toFixed(2),
      (r.outstanding_sen / 100).toFixed(2),
    ]),
  ]
}
