import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Search } from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { downloadCsv } from '@/lib/csv'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { useT, type TFn } from '@/lib/i18n'
import { useDebounced } from '@/lib/useDebounced'
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
  fetchPaymentLogAll,
  PAGE_SIZE,
  PAYMENT_METHOD_LABEL,
  PAYMENT_PROVIDER_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_VARIANT,
  PAYMENT_STATUSES,
  usePaymentLogPage,
  usePaymentLogTotals,
  type PaymentLogFilters,
  type PaymentLogRow,
  type PaymentLogSort,
  type PaymentStatus,
} from '@/features/payments/api'

const ALL = '__all__'

/**
 * The filter, in the address bar rather than in `useState`.
 *
 * A ledger question is asked *of somebody else* — "are these two RM500 rows on
 * 6 May the same payment, or did she pay twice?" — so the screen showing it has
 * to survive being pasted into a message. Every control here writes its value
 * into the query string and reads it back, which is also what lets an invoice
 * link straight to its own payments.
 *
 * A value at its default is deleted rather than written, so the everyday
 * `/payments/log` keeps a clean URL and a link carries only what was narrowed.
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

/**
 * A query string is hand-editable and links outlive the code that wrote them,
 * so an unknown status reads as "all" rather than reaching the RPC, where it
 * would fail the `payment_status` cast and show the reader an error instead of
 * a ledger.
 */
function readStatus(raw: string | null): PaymentStatus | typeof ALL {
  return raw && (PAYMENT_STATUSES as readonly string[]).includes(raw)
    ? (raw as PaymentStatus)
    : ALL
}

function readPage(raw: string | null): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/** The Malaysian calendar day of an instant — the academy's zone, not the browser's. */
const MY_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Was this payment entered on a day other than the day it was paid?
 *
 * Only then is the recorded timestamp worth a line: when the two match, the
 * payment date already says when it was typed in, and repeating it under every
 * row would be noise. Compared as Malaysian calendar days rather than instants:
 * `paid_at` is a date the user picked, which `RecordPaymentDialog` stores at
 * midday, while `created_at` is a real clock reading — so the two are never
 * equal as instants even when they mean the same day.
 */
function backDated(p: PaymentLogRow): boolean {
  if (!p.paid_at) return false
  return MY_DAY.format(new Date(p.paid_at)) !== MY_DAY.format(new Date(p.created_at))
}

/**
 * Where the row came from, in one line.
 *
 * A gateway names itself and its reference; a manual entry names the person who
 * typed it, because that is the only accountability a cash payment has. Falls
 * back to "Recorded manually" when nobody is named — true of every gateway row
 * (a callback wrote it) and of any manual row banked before the column existed.
 */
function sourceLine(p: PaymentLogRow, t: TFn): string {
  const gateway = PAYMENT_PROVIDER_LABEL[p.provider]
  if (gateway) return p.provider_ref ? `${gateway} · ${p.provider_ref}` : gateway
  const who = p.recorded_by_name?.trim()
  return who
    ? t('payments.log.recorded_by', { name: who })
    : t('payments.log.recorded_manually')
}

function csvRows(rows: PaymentLogRow[], t: TFn) {
  return [
    [
      t('common.date'),
      t('common.student'),
      t('payments.log.csv.student_no'),
      t('payments.table.invoice'),
      t('common.course'),
      t('payments.log.method'),
      t('payments.log.csv.provider'),
      t('payments.log.reference'),
      t('payments.log.csv.recorded_by'),
      t('payments.log.csv.recorded_at'),
      t('common.status'),
      t('common.amount'),
    ],
    ...rows.map((p) => [
      // ISO, not the display format: a spreadsheet sorts "18 Aug 2026" as text.
      (p.paid_at ?? p.created_at).slice(0, 10),
      p.student_full_name ?? '',
      p.student_no ?? '',
      p.invoice_no ?? '',
      p.course_title ?? '',
      t(PAYMENT_METHOD_LABEL[p.method]),
      PAYMENT_PROVIDER_LABEL[p.provider] || t('payments.log.recorded_manually'),
      p.provider_ref ?? '',
      // Blank rather than "Recorded manually" — a name column wants a name or
      // nothing, and a gateway row genuinely has nobody to name.
      p.recorded_by_name ?? '',
      // Full instant, not a day: this column exists to reconstruct the order
      // work was actually entered in.
      p.created_at,
      t(PAYMENT_STATUS_LABEL[p.status]),
      // Ringgit, not sen — this file is read by a human in a spreadsheet.
      (p.amount_sen / 100).toFixed(2),
    ]),
  ]
}

/**
 * The money-in ledger for the whole academy.
 *
 * `/payments` is the invoice book — what people were asked for. This is the
 * other half: what actually arrived, when, by what means and against which
 * invoice. Staff-wide, because `payments: staff view all` is, and every row
 * links back to the invoice it settled.
 *
 * Paged server-side. Search and status go to the database with the page, and
 * the summary line comes from its own aggregate over the same filter — a page
 * of 50 cannot tell you what the academy took this year.
 */
export function PaymentLogPage() {
  const { t, tn } = useT()
  const { activeAcademyId } = useAcademy()
  const [params, setParams] = useSearchParams()
  const [exporting, setExporting] = useState(false)

  const search = params.get('q')?.trim() ?? ''
  const status = readStatus(params.get('status'))
  const sort: PaymentLogSort = params.get('sort') === 'paid' ? 'paid' : 'recorded'
  const page = readPage(params.get('page'))

  // `replace`, not push: a filter is not a place you navigate back through, and
  // a history entry per settled keystroke would bury the page you arrived from.
  const commit = useCallback(
    (next: Record<string, string | null>) =>
      setParams((prev) => withParams(prev, next), { replace: true }),
    [setParams],
  )

  // The box keeps its own text so typing stays instant; the URL — and so the
  // server — only hears about it once typing settles.
  const [query, setQuery] = useState(search)
  const debounced = useDebounced(query)
  const committed = useRef(search)

  useEffect(() => {
    const needle = debounced.trim()
    if (needle === search) return
    committed.current = needle
    // A new needle renumbers every page under it, so page 7 of the old search
    // is not page 7 of the new one.
    commit({ q: needle || null, page: null })
  }, [debounced, search, commit])

  // A pasted or restored URL wins over the box; our own write does not. Without
  // that guard a character typed while the write lands would be rubbed out.
  useEffect(() => {
    if (search === committed.current) return
    committed.current = search
    setQuery(search)
  }, [search])

  const filters: PaymentLogFilters = useMemo(
    () => ({ search, status: status === ALL ? null : status }),
    [search, status],
  )

  const rows = usePaymentLogPage(activeAcademyId, filters, sort, page)
  const totals = usePaymentLogTotals(activeAcademyId, filters)

  const total = totals.data?.total ?? 0
  const received = totals.data?.receivedSen ?? 0
  const list = rows.data ?? []
  const filtering = search.trim() !== '' || status !== ALL

  async function exportCsv() {
    if (!activeAcademyId) return
    setExporting(true)
    try {
      // The whole filtered set, not the 50 rows on screen.
      const all = await fetchPaymentLogAll(activeAcademyId, filters, sort, total)
      downloadCsv('payment-log.csv', csvRows(all, t))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <BackLink to="/payments">{t('payments.title')}</BackLink>
      <PageHeader
        title={t('payments.log.title')}
        description={t('payments.log.subtitle')}
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
        <div className="relative min-w-56 flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('payments.log.search_placeholder')}
            aria-label={t('payments.log.search_placeholder')}
            className="pl-8"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => commit({ status: v === ALL ? null : v, page: null })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('payments.log.all_statuses')}</SelectItem>
            {PAYMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(PAYMENT_STATUS_LABEL[s])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(v) => commit({ sort: v === 'paid' ? 'paid' : null, page: null })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recorded">
              {t('payments.log.sort.recorded')}
            </SelectItem>
            <SelectItem value="paid">{t('payments.log.sort.paid')}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground ml-auto text-sm tabular-nums">
          {totals.data === undefined
            ? '—'
            : tn('payments.log.summary', total, {
                amount: formatMYR(received),
              })}
        </p>
      </div>

      <div className="mt-4">
        {rows.isLoading ? (
          <LoadingBlock />
        ) : rows.error ? (
          <ErrorBlock error={rows.error} />
        ) : list.length === 0 ? (
          // Two different nothings: an academy that has taken no money at all,
          // and a filter that matched none of the money it has taken.
          <EmptyState
            size={filtering ? undefined : 'block'}
            title={t(filtering ? 'payments.log.no_match' : 'payments.log.empty')}
          />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('common.student')}</TableHead>
                  <TableHead>{t('payments.table.invoice')}</TableHead>
                  <TableHead>{t('payments.log.method')}</TableHead>
                  <TableHead className="text-right">
                    {t('common.amount')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">
                      {fmtDate(p.paid_at ?? p.created_at)}
                      {backDated(p) ? (
                        <div className="text-muted-foreground text-xs">
                          {t('payments.log.recorded_at', {
                            when: fmtDateTime(p.created_at),
                          })}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {p.student_id ? (
                        <Link
                          to={`/students/${p.student_id}`}
                          className="hover:underline"
                        >
                          {p.student_full_name ?? t('common.unnamed')}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {p.course_title ? (
                        <div className="text-muted-foreground text-xs">
                          {p.course_title}
                        </div>
                      ) : null}
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
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{t(PAYMENT_METHOD_LABEL[p.method])}</span>
                        {/* Only worth a badge when it is not the normal case. */}
                        {p.status !== 'succeeded' ? (
                          <Badge variant={PAYMENT_STATUS_VARIANT[p.status]}>
                            {t(PAYMENT_STATUS_LABEL[p.status])}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {sourceLine(p, t)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMYR(p.amount_sen)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Pager
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={(n) => commit({ page: n > 1 ? String(n) : null })}
        />
      </div>
    </div>
  )
}
