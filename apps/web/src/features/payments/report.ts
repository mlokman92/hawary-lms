import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { Enums } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import type { PaymentScope } from './api'

/**
 * The payment report's drill vocabulary.
 *
 * `/payments` is the invoice book and `/payments/log` is the ledger; both are
 * flat lists, and "where did the money come from" is a hierarchy. This module
 * holds the small amount of logic that turns a place in that hierarchy into the
 * scope arguments `payment_report`, `payment_log_page` and `payment_log_totals`
 * all take — one vocabulary, so a rung's total and the payments underneath it
 * cannot disagree.
 */

/** The three ways a scope can be broken down. Order is the drill order. */
export const REPORT_DIMS = ['month', 'course', 'student'] as const
export type ReportDim = (typeof REPORT_DIMS)[number]

/**
 * Which book the report is reading.
 *
 * Two views over one drill, because they are two different questions and a
 * cash ledger cannot answer the second one at all:
 *
 * - `received` aggregates **payments** — where the money came from. A student
 *   who has paid nothing has no row here, so their debt is invisible.
 * - `outstanding` aggregates **invoices** — billed, paid and still owing, with
 *   debtors at the top. Absence is the answer, so it has to be a read of what
 *   was billed rather than of what arrived.
 *
 * They also bucket months differently on purpose: `received` on when the money
 * arrived, `outstanding` on when it was asked for. A September payment against
 * an August invoice belongs in a different month in each, which is exactly why
 * one query could not serve both.
 */
export const REPORT_VIEWS = ['received', 'outstanding'] as const
export type ReportView = (typeof REPORT_VIEWS)[number]

export function readView(raw: string | null): ReportView {
  return raw === 'outstanding' ? 'outstanding' : 'received'
}

/**
 * The bucket for payments against an invoice with no course.
 *
 * A sentinel rather than an omission: ad-hoc fees are billed with no course
 * attached, so this is a real group somebody will want to open, and `courseId`
 * has no value that means "null". Mirrors `payment_report`'s own literal.
 */
export const NO_COURSE_KEY = '__none__'

/** One group at the current rung, as the RPC returns it. */
export type ReportRow = {
  key: string
  label: string
  sublabel: string | null
  paymentCount: number
  amountSen: number
}

/**
 * Where the reader is standing. Each step is independent and any subset is
 * legal, which is what lets the breadcrumb drop one step without rebuilding the
 * rest — and what lets a pasted URL carrying only `?c=` mean "this course, by
 * month".
 */
export type DrillPath = {
  /** 'YYYY-MM' in the academy's timezone. */
  month: string | null
  /** A course id, or `NO_COURSE_KEY`. */
  course: string | null
  student: string | null
}

/** The report-wide date window, independent of the drill. */
export type DateRange = { from: string | null; to: string | null }

/**
 * What to group by next: the first dimension the reader has not already fixed.
 *
 * Null means every dimension is fixed and there is nothing left to break down —
 * the payments themselves are all that remains, so the leaf renders itself
 * rather than waiting to be asked for.
 */
export function nextDim(path: DrillPath): ReportDim | null {
  if (!path.month) return 'month'
  if (!path.course) return 'course'
  if (!path.student) return 'student'
  return null
}

/**
 * First and last day of a 'YYYY-MM', as academy-local calendar days.
 *
 * `Date.UTC(y, m, 0)` is the zeroth day of the *next* month — the last day of
 * this one — and UTC throughout so a browser in another zone cannot shift it.
 */
export function monthRange(ym: string): DateRange {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}

/** ISO days sort lexicographically, so the tighter bound is just the larger. */
function later(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

function earlier(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

/**
 * The drill and the date window, as one slice of the ledger.
 *
 * The month step and the window are intersected rather than one overriding the
 * other: the months on offer were already inside the window, so clipping is a
 * no-op in the ordinary case and the right answer in the odd one where a
 * pasted URL carries a month outside its own range.
 */
export function scopeOf(path: DrillPath, range: DateRange): PaymentScope {
  const month = path.month ? monthRange(path.month) : null
  return {
    from: later(range.from, month?.from ?? null),
    to: earlier(range.to, month?.to ?? null),
    courseId: path.course && path.course !== NO_COURSE_KEY ? path.course : null,
    noCourse: path.course === NO_COURSE_KEY,
    studentId: path.student,
  }
}

type ReportRpcRow = {
  key: string
  label: string
  sublabel: string | null
  payment_count: number
  amount_sen: number
  group_count: number
}

/**
 * One rung of the drill: the scope, grouped one way.
 *
 * Groups come back whole rather than paged — at academy scale a month holds
 * tens of courses and hundreds of students, and a report you have to page
 * through is a list. `groupCount` is the true number of groups, so a report
 * clipped by the RPC's backstop can say so rather than quietly under-reporting.
 *
 * `keepPreviousData` holds the current rung on screen while the next loads:
 * without it every drill blanks the table through the empty state and back,
 * which reads as "there is nothing here" at the exact moment there is.
 */
export function usePaymentReport(
  academyId: string | null,
  dim: ReportDim | null,
  scope: PaymentScope,
) {
  return useQuery({
    queryKey: [
      'payment-report',
      academyId,
      dim,
      scope.from ?? '',
      scope.to ?? '',
      scope.courseId ?? '',
      scope.noCourse ? '1' : '',
      scope.studentId ?? '',
    ] as const,
    enabled: !!academyId && !!dim,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('payment_report', {
        _academy: academyId!,
        _dim: dim!,
        ...(scope.from ? { _from: scope.from } : {}),
        ...(scope.to ? { _to: scope.to } : {}),
        ...(scope.courseId ? { _course: scope.courseId } : {}),
        ...(scope.noCourse ? { _no_course: true } : {}),
        ...(scope.studentId ? { _student: scope.studentId } : {}),
      })
      if (error) throw error
      const raw = (data ?? []) as unknown as ReportRpcRow[]
      return {
        rows: raw.map((r): ReportRow => ({
          key: r.key,
          label: r.label,
          sublabel: r.sublabel,
          paymentCount: Number(r.payment_count),
          amountSen: Number(r.amount_sen),
        })),
        groupCount: Number(raw[0]?.group_count ?? 0),
      }
    },
  })
}

// --- The receivables view ---------------------------------------------------

/** One group at the current rung, read from invoices rather than payments. */
export type ReceivableRow = {
  key: string
  label: string
  sublabel: string | null
  invoiceCount: number
  billedSen: number
  paidSen: number
  outstandingSen: number
}

/** The scope arguments all three receivables functions take, built once. */
function rpcScope(scope: PaymentScope) {
  return {
    ...(scope.from ? { _from: scope.from } : {}),
    ...(scope.to ? { _to: scope.to } : {}),
    ...(scope.courseId ? { _course: scope.courseId } : {}),
    ...(scope.noCourse ? { _no_course: true } : {}),
    ...(scope.studentId ? { _student: scope.studentId } : {}),
  }
}

/** A scope as cache-key segments, so two equal scopes hit one entry. */
function scopeParts(scope: PaymentScope) {
  return [
    scope.from ?? '',
    scope.to ?? '',
    scope.courseId ?? '',
    scope.noCourse ? '1' : '',
    scope.studentId ?? '',
  ] as const
}

type ReceivableRpcRow = {
  key: string
  label: string
  sublabel: string | null
  invoice_count: number
  billed_sen: number
  paid_sen: number
  outstanding_sen: number
  group_count: number
}

/**
 * One rung of the receivables drill: billed · paid · still owing.
 *
 * The rows arrive **debtors first** — that ordering is the whole point of the
 * view and belongs in SQL, not in a client sort that a later page of results
 * could contradict.
 */
export function useInvoiceReport(
  academyId: string | null,
  dim: ReportDim | null,
  scope: PaymentScope,
) {
  return useQuery({
    queryKey: ['invoice-report', academyId, dim, ...scopeParts(scope)] as const,
    enabled: !!academyId && !!dim,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('invoice_report', {
        _academy: academyId!,
        _dim: dim!,
        ...rpcScope(scope),
      })
      if (error) throw error
      const raw = (data ?? []) as unknown as ReceivableRpcRow[]
      return {
        rows: raw.map((r): ReceivableRow => ({
          key: r.key,
          label: r.label,
          sublabel: r.sublabel,
          invoiceCount: Number(r.invoice_count),
          billedSen: Number(r.billed_sen),
          paidSen: Number(r.paid_sen),
          outstandingSen: Number(r.outstanding_sen),
        })),
        groupCount: Number(raw[0]?.group_count ?? 0),
      }
    },
  })
}

/** One invoice at the bottom of the receivables drill. */
export type ReceivableInvoiceRow = {
  id: string
  invoice_no: string
  status: Enums<'invoice_status'>
  issued_at: string | null
  due_at: string | null
  total_sen: number
  amount_paid_sen: number
  balance_sen: number
  student_id: string | null
  student_full_name: string | null
  student_no: string | null
  course_id: string | null
  course_title: string | null
}

/** Rows per page, matching the payments side so both leaves feel like one. */
export const REPORT_PAGE_SIZE = 50

/**
 * The invoices themselves, unpaid first.
 *
 * `enabled` is false while an aggregate rung is on screen: fetching 50 invoices
 * behind every drill would be a request nobody reads.
 */
export function useInvoiceReportPage(
  academyId: string | null,
  scope: PaymentScope,
  page: number,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      'invoice-report-page',
      academyId,
      ...scopeParts(scope),
      page,
    ] as const,
    enabled: !!academyId && enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('invoice_report_page', {
        _academy: academyId!,
        ...rpcScope(scope),
        _limit: REPORT_PAGE_SIZE,
        _offset: (page - 1) * REPORT_PAGE_SIZE,
      })
      if (error) throw error
      return (data ?? []) as unknown as ReceivableInvoiceRow[]
    },
  })
}

/**
 * Billed · collected · outstanding · overdue for the whole scope.
 *
 * `invoice_totals` again — the same function the /payments tiles read, now
 * carrying the drill's window and student. One source for the number, so a
 * rung's rows and the summary above them cannot disagree, and the count on
 * screen is a count of invoices rather than of visible rows.
 */
export function useReceivableTotals(
  academyId: string | null,
  scope: PaymentScope,
) {
  return useQuery({
    queryKey: [
      'invoice-report-totals',
      academyId,
      ...scopeParts(scope),
    ] as const,
    enabled: !!academyId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('invoice_totals', {
        _academy: academyId!,
        ...rpcScope(scope),
      })
      if (error) throw error
      const row = (data as unknown as InvoiceTotalsRow[] | null)?.[0]
      return {
        count: Number(row?.invoice_count ?? 0),
        billed: Number(row?.invoiced_sen ?? 0),
        paid: Number(row?.collected_sen ?? 0),
        outstanding: Number(row?.outstanding_sen ?? 0),
        overdue: Number(row?.overdue_sen ?? 0),
      }
    },
  })
}

type InvoiceTotalsRow = {
  invoice_count: number
  invoiced_sen: number
  collected_sen: number
  outstanding_sen: number
  overdue_sen: number
}

/** One request's worth of rows when sweeping the whole scope for the CSV. */
const EXPORT_CHUNK = 200

/**
 * Every invoice in the scope, for the export — not the 50 on screen.
 *
 * The same contract `fetchPaymentLogAll` follows, for the same reason: this
 * file is a chase list, and one that stops at row 50 leaves debts uncollected.
 * Bounded by the count the totals query already reported, so a book that grows
 * mid-export cannot turn this into an unbounded loop.
 */
export async function fetchInvoiceReportAll(
  academyId: string,
  scope: PaymentScope,
  total: number,
): Promise<ReceivableInvoiceRow[]> {
  const rows: ReceivableInvoiceRow[] = []
  while (rows.length < total) {
    const { data, error } = await supabase.rpc('invoice_report_page', {
      _academy: academyId,
      ...rpcScope(scope),
      _limit: EXPORT_CHUNK,
      _offset: rows.length,
    })
    if (error) throw error
    const chunk = (data ?? []) as unknown as ReceivableInvoiceRow[]
    if (chunk.length === 0) break
    rows.push(...chunk)
  }
  return rows
}
