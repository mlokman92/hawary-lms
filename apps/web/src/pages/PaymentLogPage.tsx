import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftRight,
  Banknote,
  Download,
  MoreHorizontal,
  Search,
  Upload,
  Wallet,
  Zap,
} from 'lucide-react'
import { formatMYR } from '@hawary/shared'
import { useAcademy } from '@/lib/academy'
import { downloadCsv } from '@/lib/csv'
import { errorMessage } from '@/lib/errors'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { useT, type TFn } from '@/lib/i18n'
import { useDebounced } from '@/lib/useDebounced'
import { useCourses } from '@/features/courses/api'
import { StudentSheet } from '@/features/students/StudentSheet'
import { PageHeader } from '@/components/patterns/PageHeader'
import { BackLink } from '@/components/patterns/BackLink'
import { EmptyState } from '@/components/patterns/EmptyState'
import { Pager } from '@/components/patterns/Pager'
import { StatCard } from '@/components/patterns/StatCard'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  EditPaymentNoteDialog,
  type NoteTarget,
} from '@/features/payments/EditPaymentNoteDialog'
import {
  ALL_COURSES,
  fetchPaymentLogAll,
  NO_COURSE,
  PAGE_SIZE,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  PAYMENT_PROVIDER_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_VARIANT,
  usePaymentLogPage,
  usePaymentLogTotals,
  type PaymentLogFilters,
  type PaymentLogRow,
  type PaymentLogSort,
  type PaymentMethod,
} from '@/features/payments/api'
import { InvoiceSheet } from '@/features/payments/InvoiceSheet'
import { PaymentSheet } from '@/features/payments/PaymentSheet'
import {
  useOpenPaymentReceipt,
  usePaymentReceiptsFor,
  useReceiptPicker,
} from '@/features/payments/receipts'
import { sourceLine } from '@/features/payments/sourceLine'

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
 * `?method=` — how the money came.
 *
 * A query string is hand-editable and links outlive the code that wrote them,
 * so an unknown method reads as "all" rather than reaching the RPC, where it
 * would fail the `payment_method` cast and show the reader an error instead of
 * a ledger.
 *
 * This replaced a status filter. Every row in this ledger is `succeeded`, so
 * that picker had one useful value; what gets asked of a ledger is "show me
 * the bank transfers". A row that did fail still says so, with a badge.
 */
function readMethod(raw: string | null): PaymentMethod | typeof ALL {
  return raw && (PAYMENT_METHODS as readonly string[]).includes(raw)
    ? (raw as PaymentMethod)
    : ALL
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `?c=` — a course id, or `__none__` for payments against an invoice with no
 * course. The name and the values are `/payments`' own, so a course carries
 * from the invoice book to the ledger by its link. Anything else reads as "all
 * courses" rather than reaching the RPC as a failed uuid cast.
 */
function readCourse(raw: string | null): string {
  if (raw === NO_COURSE) return NO_COURSE
  return raw && UUID.test(raw) ? raw : ALL_COURSES
}

/** Anything that is not an id reads as "nothing open", not a failed cast. */
function readId(raw: string | null): string | null {
  return raw && UUID.test(raw) ? raw : null
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
      t('payments.log.note'),
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
      p.note ?? '',
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
  // The payment whose note is being edited, or null. The note is edited from
  // the payment's panel only; the dialog is the page's, so it outlives a
  // refetch of the panel underneath it.
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null)

  const search = params.get('q')?.trim() ?? ''
  const method = readMethod(params.get('method'))
  const course = readCourse(params.get('c'))
  const { data: courses } = useCourses(activeAcademyId)
  const sort: PaymentLogSort = params.get('sort') === 'paid' ? 'paid' : 'recorded'
  const page = readPage(params.get('page'))
  const paymentId = readId(params.get('payment'))
  const studentId = readId(params.get('student'))
  const invoiceId = readId(params.get('invoice'))

  // `replace`, not push: a filter is not a place you navigate back through, and
  // a history entry per settled keystroke would bury the page you arrived from.
  const commit = useCallback(
    (next: Record<string, string | null>) =>
      setParams((prev) => withParams(prev, next), { replace: true }),
    [setParams],
  )

  // A name or an invoice number opens that record in a panel here, not its
  // page: the question is asked from the middle of this list. Still a real
  // link, so a modified click opens the page itself in another tab. One panel
  // at a time — opening one closes whichever was open.
  const openIn =
    (key: 'student' | 'invoice', id: string) => (e: MouseEvent) => {
      e.stopPropagation()
      if (e.metaKey || e.ctrlKey || e.shiftKey) return
      e.preventDefault()
      commit({ payment: null, student: null, invoice: null, [key]: id })
    }

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
    () => ({
      search,
      status: null,
      method: method === ALL ? null : method,
      // Absent, not an empty scope, when every course is on offer: the two
      // functions take no argument for "all".
      ...(course === ALL_COURSES
        ? {}
        : {
            scope:
              course === NO_COURSE ? { noCourse: true } : { courseId: course },
          }),
    }),
    [search, method, course],
  )

  const rows = usePaymentLogPage(activeAcademyId, filters, sort, page)
  const totals = usePaymentLogTotals(activeAcademyId, filters)

  const total = totals.data?.total ?? 0
  const list = rows.data ?? []

  // Filtered to KWSP, every succeeded row takes its Resit Pengeluaran KWSP —
  // uploaded and opened the way a bank transfer's receipt is, on the same
  // table, and like it admin-only. Paperwork only: nothing that counts money
  // reads a KWSP payment's receipt.
  const kwsp = method === 'kwsp'
  const takesReceipt = (p: PaymentLogRow) =>
    kwsp && p.method === 'kwsp' && p.status === 'succeeded'
  // The query key hashes the ids by value, so a fresh array is not a refetch.
  const receipts = usePaymentReceiptsFor(
    activeAcademyId,
    list.filter(takesReceipt).map((p) => p.id),
  )
  const picker = useReceiptPicker()
  const openReceipt = useOpenPaymentReceipt()
  const receiptFailure = picker.error ?? openReceipt.error ?? receipts.error

  // A dash, not RM 0.00, while the totals are in flight: a confident zero
  // reads as "nothing was collected", which is a claim and not a placeholder.
  const money = (sen: number | undefined) =>
    sen === undefined ? '—' : formatMYR(sen)
  const paymentCount = (n: number | undefined) =>
    n === undefined ? undefined : tn('payments.log.card.count', n)
  const filtering =
    search.trim() !== '' || method !== ALL || course !== ALL_COURSES

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

      {/* What the ledger below adds up to, and the three routes it came by:
          the total, then its parts, which add up to it. KWSP is in none of
          them — to staff it has not been collected. They follow the search
          and the method filter: the cards are about the rows on offer, not
          always the whole book — pick FPX and Total collections is the FPX
          total.

          One per row on a phone, two on a tablet, four across on a desktop. */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('payments.log.card.total')}
          value={money(totals.data?.collectedSen)}
          sub={paymentCount(totals.data?.collectedCount)}
          icon={Wallet}
          tone="positive"
        />
        <StatCard
          label={t('payments.method.bank_transfer')}
          value={money(totals.data?.bankTransferSen)}
          sub={paymentCount(totals.data?.bankTransferCount)}
          icon={ArrowLeftRight}
        />
        <StatCard
          label={t('payments.method.fpx')}
          value={money(totals.data?.fpxSen)}
          sub={paymentCount(totals.data?.fpxCount)}
          icon={Zap}
        />
        <StatCard
          label={t('payments.method.cash')}
          value={money(totals.data?.cashSen)}
          sub={paymentCount(totals.data?.cashCount)}
          icon={Banknote}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
          value={course}
          onValueChange={(v) =>
            commit({ c: v === ALL_COURSES ? null : v, page: null })
          }
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder={t('payments.filter.all_courses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_COURSES}>
              {t('payments.filter.all_courses')}
            </SelectItem>
            <SelectItem value={NO_COURSE}>
              {t('payments.filter.no_course')}
            </SelectItem>
            {(courses ?? []).map((c) => (
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
        <Select
          value={method}
          onValueChange={(v) => commit({ method: v === ALL ? null : v, page: null })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('payments.log.all_methods')}</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {t(PAYMENT_METHOD_LABEL[m])}
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
                  <TableHead>{t('payments.log.note')}</TableHead>
                  <TableHead className="text-right">
                    {t('common.amount')}
                  </TableHead>
                  {kwsp ? (
                    <TableHead className="text-right">
                      {t('payments.receipts.kwsp')}
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => (
                  // The row opens this payment in a panel and puts its id in
                  // the address — the one link that means this row, not the
                  // invoice it shares with four others.
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() =>
                      commit({ payment: p.id, student: null, invoice: null })
                    }
                  >
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
                          onClick={openIn('student', p.student_id)}
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
                          onClick={openIn('invoice', p.invoice_id)}
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
                    {/* The sentence a person typed when banking it — the one
                        thing in this row no other column can reconstruct.
                        Read here; edited in the payment's panel, which the
                        row opens. */}
                    <TableCell className="text-muted-foreground max-w-[18rem] text-xs break-words whitespace-pre-wrap">
                      {p.note ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMYR(p.amount_sen)}
                    </TableCell>
                    {kwsp ? (
                      // Its buttons are its own; the rest of the row opens
                      // the payment.
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!takesReceipt(p) || !receipts.data ? null : picker.uploadingId ===
                          p.id ? (
                          <Button variant="outline" size="sm" disabled>
                            {t('common.uploading')}
                          </Button>
                        ) : receipts.data.has(p.id) ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={openReceipt.isPending}
                              title={receipts.data.get(p.id)}
                              onClick={() => openReceipt.mutate(p.id)}
                            >
                              {t('payments.receipts.view')}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm">
                                  <MoreHorizontal />
                                  <span className="sr-only">
                                    {t('common.actions')}
                                  </span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => picker.pick(p.id)}
                                >
                                  <Upload /> {t('payments.receipts.replace')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={picker.busy}
                            onClick={() => picker.pick(p.id)}
                          >
                            <Upload /> {t('common.upload')}
                          </Button>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {receiptFailure ? (
          <p className="text-destructive mt-3 text-sm">
            {errorMessage(receiptFailure, t('upload.failed'))}
          </p>
        ) : null}
        <input {...picker.inputProps} />

        <Pager
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={(n) => commit({ page: n > 1 ? String(n) : null })}
        />
      </div>

      <PaymentSheet
        academyId={activeAcademyId}
        paymentId={paymentId}
        hint={list.find((row) => row.id === paymentId)}
        onEditNote={setNoteTarget}
        onClose={() => commit({ payment: null })}
      />

      <StudentSheet
        studentId={studentId}
        onClose={() => commit({ student: null })}
      />
      <InvoiceSheet
        invoiceId={invoiceId}
        onClose={() => commit({ invoice: null })}
      />

      {activeAcademyId ? (
        <EditPaymentNoteDialog
          academyId={activeAcademyId}
          target={noteTarget}
          onOpenChange={(open) => {
            if (!open) setNoteTarget(null)
          }}
        />
      ) : null}
    </div>
  )
}
