// SYNCED from apps/web/src/features/payments/api.ts — do not edit here.
// Change the web file, then run `pnpm --filter mobile sync:data`.

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import type { Enums, Tables } from '@hawary/shared'
import { translate, type TKey } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { APP_ORIGIN } from '@/lib/origin'

export type Invoice = Tables<'invoices'>
export type InvoiceItem = Tables<'invoice_items'>
export type Payment = Tables<'payments'>
export type PaymentMethod = Enums<'payment_method'>
export type InvoiceStatus = Enums<'invoice_status'>

type StudentBrief = {
  full_name: string | null
  student_no: string
  email?: string | null
  /** Detail read only — the bill-to block on the invoice / receipt PDF. */
  organization?: string | null
  address?: string | null
}
type CourseBrief = { id: string; title: string }
/** Just enough of a payment to say by which route the money came. */
type PaymentRoute = Pick<Payment, 'amount_sen' | 'provider' | 'method' | 'status'>
export type InvoiceRow = Invoice & {
  student: StudentBrief | null
  course: CourseBrief | null
  /** Only on the paged list, which shows the breakdown. */
  payments?: PaymentRoute[]
}
export type InvoiceDetail = Invoice & {
  student: StudentBrief | null
  course: CourseBrief | null
  items: InvoiceItem[]
  payments: Payment[]
}
export type StudentInvoiceRow = Invoice & { course: CourseBrief | null }

/**
 * One row of the money-in ledger, flattened by `payment_log_page`.
 *
 * Flat rather than the nested PostgREST embed it used to be: the search spans
 * five tables and PostgREST cannot OR across embedded resources, so the whole
 * read is one RPC now. The generated `Returns` type marks every column
 * non-null — Supabase cannot infer nullability from a RETURNS TABLE — so this
 * hand-written mirror is what the page actually trusts.
 */
export type PaymentLogRow = {
  id: string
  amount_sen: number
  method: PaymentMethod
  provider: Enums<'payment_provider'>
  provider_ref: string | null
  status: PaymentStatus
  paid_at: string | null
  created_at: string
  /** Free text a person typed when banking the payment. Null on gateway rows. */
  note: string | null
  invoice_id: string | null
  invoice_no: string | null
  course_id: string | null
  course_title: string | null
  student_id: string | null
  student_full_name: string | null
  student_no: string | null
  /** Null on every gateway row: a callback wrote it, not a person. */
  recorded_by_name: string | null
}

/**
 * Which slice of the ledger a caller is asking about.
 *
 * Named separately from the search/status filter because it is the *report's*
 * vocabulary: `payment_report` takes exactly these arguments, so a rung of the
 * drill and the payments underneath it are asking the same question of the
 * database and cannot disagree about the answer. `/payments/log` leaves every
 * field unset and reads the whole book.
 *
 * `from`/`to` are academy-local calendar days (`YYYY-MM-DD`), both inclusive —
 * never instants. A payment at 00:30 UTC on 1 September is an 8:30 a.m.
 * Malaysian payment on the same day, and a report that filed it under August
 * would be wrong to the person reading it.
 */
export type PaymentScope = {
  from?: string | null
  to?: string | null
  courseId?: string | null
  /** Invoices with no course — a real bucket `courseId` cannot express. */
  noCourse?: boolean
  studentId?: string | null
}

/** What both log queries filter by. Held together so they cannot drift apart. */
export type PaymentLogFilters = {
  search: string
  status: PaymentStatus | null
  /** Absent on `/payments/log`, which is the whole ledger by definition. */
  scope?: PaymentScope
}

/** A scope as one cache-key segment. Undefined and all-empty must agree. */
function scopeKey(s: PaymentScope | undefined): string {
  if (!s) return ''
  return [
    s.from ?? '',
    s.to ?? '',
    s.courseId ?? '',
    s.noCourse ? '1' : '',
    s.studentId ?? '',
  ].join('|')
}

/**
 * Which date the ledger is ordered by.
 *
 * `recorded` (created_at) is the default because `RecordPaymentDialog` asks for
 * the payment date, so staff entering historical payments back-date them — a
 * payment banked today for money that arrived in May sorts into May, and "I
 * just recorded it and cannot see it" is indistinguishable from missing.
 * `paid` is the value-date order a reconciliation wants.
 *
 * Not part of `PaymentLogFilters` on purpose: a sum and a count do not care
 * about ORDER BY, so the totals query must not be re-fetched when this changes.
 */
export type PaymentLogSort = 'recorded' | 'paid'


/**
 * ToyyibPay's standard B2C FPX rate — a flat RM1.00 per transaction whatever the
 * amount. Display only: the authoritative copy is `FPX_FEE_SEN` in the
 * `create-bill` Edge Function, which is what settlement is judged against.
 */
export const TOYYIBPAY_FPX_FEE_SEN = 100
export type NewItem = {
  description: string
  quantity: number
  unitPriceSen: number
}

const listKey = (a: string | null) => ['invoices', a] as const
const oneKey = (id: string) => ['invoice', id] as const
const logKey = (
  a: string | null,
  f: PaymentLogFilters,
  sort: PaymentLogSort,
  page: number,
) =>
  ['payment-log', a, f.search, f.status, scopeKey(f.scope), sort, page] as const
const logTotalsKey = (a: string | null, f: PaymentLogFilters) =>
  ['payment-log-totals', a, f.search, f.status, scopeKey(f.scope)] as const

export function useInvoices(academyId: string | null) {
  return useQuery({
    queryKey: listKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select(
          '*, student:students(full_name, student_no), course:courses(id, title)',
        )
        .eq('academy_id', academyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as InvoiceRow[]
    },
  })
}

const DETAIL_SELECT =
  '*, student:students(full_name, student_no, email, organization, address), course:courses(id, title), items:invoice_items(*), payments(*)'

/** The same read outside React — the PDF helpers need it on click, not on render. */
export async function fetchInvoiceDetail(id: string): Promise<InvoiceDetail> {
  const { data, error } = await supabase
    .from('invoices')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .single()
  if (error) throw error
  return data as unknown as InvoiceDetail
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: oneKey(id ?? ''),
    enabled: !!id,
    queryFn: () => fetchInvoiceDetail(id!),
  })
}

/** Invoices for a single student (their billing history on the student page). */
export function useStudentInvoices(
  academyId: string | null,
  studentId: string | undefined,
) {
  return useQuery({
    queryKey: ['student-invoices', academyId, studentId] as const,
    enabled: !!academyId && !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, course:courses(id, title)')
        .eq('academy_id', academyId!)
        .eq('student_id', studentId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as StudentInvoiceRow[]
    },
  })
}

/**
 * Every cached list a money write can move.
 *
 * One helper rather than a call per mutation: there are nine keys now — the
 * dashboard's whole-invoice read, the paged invoice list and its totals, the
 * ledger page and its totals, and the report's two views — and the failure mode
 * of forgetting one is a
 * stale money figure, which is the worst kind of stale. The paged keys are
 * invalidated by prefix because every page and filter combination is its own
 * entry and any of them may be wrong after a write.
 */
function invalidateMoney(qc: QueryClient, academyId: string) {
  qc.invalidateQueries({ queryKey: listKey(academyId) })
  qc.invalidateQueries({ queryKey: ['invoice-page'] })
  qc.invalidateQueries({ queryKey: ['invoice-list'] })
  qc.invalidateQueries({ queryKey: ['invoice-totals'] })
  qc.invalidateQueries({ queryKey: ['payment-log'] })
  qc.invalidateQueries({ queryKey: ['payment-log-totals'] })
  qc.invalidateQueries({ queryKey: ['payment-report'] })
  qc.invalidateQueries({ queryKey: ['invoice-report'] })
  qc.invalidateQueries({ queryKey: ['invoice-report-page'] })
  qc.invalidateQueries({ queryKey: ['invoice-report-totals'] })
  // The course roster is read from `enrollments`, but raising an invoice is
  // exactly what moves a student out of its "never invoiced" bucket — so a
  // money write has to reach it like any other list here.
  qc.invalidateQueries({ queryKey: ['course-billing-summary'] })
  qc.invalidateQueries({ queryKey: ['course-billing-roster'] })
}

/** Rows per page, shared by both paged lists so they feel like one product. */
export const PAGE_SIZE = 50

type PaymentLogTotalsRow = {
  total_count: number
  received_sen: number
  kwsp_sen: number
}

/**
 * The filter arguments both log calls share, so they can never disagree.
 *
 * Every field is omitted rather than sent as null: an absent argument takes the
 * SQL default, which is exactly what "no filter" means on that side. The scope
 * half is the same shape `payment_report` takes, which is what lets the report
 * point all three functions at one slice of the ledger.
 */
export function scopeArgs(filters: PaymentLogFilters) {
  const s = filters.scope
  return {
    ...(filters.search.trim() ? { _search: filters.search.trim() } : {}),
    ...(filters.status ? { _status: filters.status } : {}),
    ...(s?.from ? { _from: s.from } : {}),
    ...(s?.to ? { _to: s.to } : {}),
    ...(s?.courseId ? { _course: s.courseId } : {}),
    ...(s?.noCourse ? { _no_course: true } : {}),
    ...(s?.studentId ? { _student: s.studentId } : {}),
  }
}

/**
 * One page of the ledger.
 *
 * `useInvoices` answers "what do people owe us"; this answers "what actually
 * arrived, when, and by what means". They are different books and neither can
 * be derived from the other: an invoice carries no paid-on date, a refund never
 * decrements `amount_paid_sen`, and one invoice can be settled by several
 * payments.
 *
 * `keepPreviousData` holds the current page on screen while the next loads.
 * Without it every page turn blanks the table through the empty state and
 * back, which reads as an error rather than as paging.
 */
export function usePaymentLogPage(
  academyId: string | null,
  filters: PaymentLogFilters,
  sort: PaymentLogSort,
  page: number,
  /**
   * False while the caller is showing something else. The report renders rows
   * only at the bottom of its drill, and fetching 50 of them behind every
   * aggregate rung would be a request per drill nobody reads.
   */
  enabled = true,
) {
  return useQuery({
    queryKey: logKey(academyId, filters, sort, page),
    enabled: !!academyId && enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('payment_log_page', {
        _academy: academyId!,
        ...scopeArgs(filters),
        _sort: sort,
        _limit: PAGE_SIZE,
        _offset: (page - 1) * PAGE_SIZE,
      })
      if (error) throw error
      return (data ?? []) as unknown as PaymentLogRow[]
    },
  })
}

/**
 * Row count and money received for the SAME filter the page query uses.
 *
 * A second round trip on purpose. Folding a window function into the page query
 * would make every 50-row page scan the whole ledger, and the totals change far
 * less often than the page does — so this stays cached across page turns while
 * the rows above it move.
 */
export function usePaymentLogTotals(
  academyId: string | null,
  filters: PaymentLogFilters,
) {
  return useQuery({
    queryKey: logTotalsKey(academyId, filters),
    enabled: !!academyId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('payment_log_totals', {
        _academy: academyId!,
        ...scopeArgs(filters),
      })
      if (error) throw error
      const row = (data as unknown as PaymentLogTotalsRow[] | null)?.[0]
      return {
        total: Number(row?.total_count ?? 0),
        receivedSen: Number(row?.received_sen ?? 0),
        /** The KWSP part of `receivedSen` — inside it, never beside it. */
        kwspSen: Number(row?.kwsp_sen ?? 0),
      }
    },
  })
}

/** One request's worth of rows when sweeping the whole filtered set. */
const EXPORT_CHUNK = 200

/**
 * Every row matching the filter, for the CSV — not just the page on screen.
 *
 * Exporting the visible 50 would be the wrong file: the point of the export is
 * reconciliation, and one that stops at row 50 is worse than none. Walks the
 * same RPC in chunks rather than asking for everything at once, which is why
 * `payment_log_page` clamps `_limit` at 200 — the clamp is the contract, not an
 * obstacle to route around.
 */
export async function fetchPaymentLogAll(
  academyId: string,
  filters: PaymentLogFilters,
  sort: PaymentLogSort,
  total: number,
): Promise<PaymentLogRow[]> {
  const rows: PaymentLogRow[] = []
  // Bounded by the count the totals query already reported, so a ledger that
  // grows mid-export cannot turn this into an unbounded loop.
  while (rows.length < total) {
    const { data, error } = await supabase.rpc('payment_log_page', {
      _academy: academyId,
      ...scopeArgs(filters),
      // Same order as the screen: a CSV that disagrees with the table it was
      // exported from is a support ticket waiting to happen.
      _sort: sort,
      _limit: EXPORT_CHUNK,
      _offset: rows.length,
    })
    if (error) throw error
    const chunk = (data ?? []) as unknown as PaymentLogRow[]
    if (chunk.length === 0) break
    rows.push(...chunk)
  }
  return rows
}

// --- The invoice list, paged ------------------------------------------------

/** The two non-uuid values the course filter takes, alongside a course id. */
export const ALL_COURSES = 'all'
export const NO_COURSE = '__none__'

/**
 * Which money tile is pressed, as a filter on the invoice list.
 *
 * The tiles are sums; this is the *set* each sum was taken over, so pressing
 * one shows exactly the invoices behind the figure. `invoiced` is the whole
 * set, which is why it doubles as "no filter".
 *
 * `collected` is invoices with money against them, not invoices settled in
 * full: a part-paid invoice contributed to the tile, and narrowing to
 * `status = 'paid'` would show a set that does not add up to the number above
 * it. It is also money that did **not** come by KWSP — a withdrawal from a
 * student's EPF account is its own figure and its own set, `kwsp`. An invoice
 * paid partly each way is in both, because it contributed to both tiles.
 *
 * `outstanding` is what the academy has not collected, so it includes every
 * `kwsp` invoice: to staff, money covered by KWSP is still to come.
 * `overdue` stays on the student's own balance — KWSP money is not theirs to
 * be late with.
 */
export const ALL_MONEY = 'invoiced'
export type MoneyFilter =
  | 'invoiced'
  | 'collected'
  | 'kwsp'
  | 'outstanding'
  | 'overdue'

type InvoiceTotalsRow = {
  invoiced_sen: number
  collected_sen: number
  outstanding_sen: number
  overdue_sen: number
  kwsp_sen: number
  uncollected_sen: number
  invoice_count: number
  collected_count: number
  kwsp_count: number
  uncollected_count: number
}

// --- The staff view of an invoice --------------------------------------------
//
// An invoice is read two ways. The student's: `amount_paid_sen`, `balance_sen`
// and `status` count every payment, KWSP included, and are what the learner's
// billing page and the pay link use. The staff's: money that came by KWSP has
// not been collected, so "paid" is the rest and the KWSP part is still
// outstanding. These three helpers are that second reading, and every staff
// screen goes through them so the two cannot be mixed on one page.

type CollectionFields = Pick<
  Invoice,
  'total_sen' | 'amount_paid_sen' | 'kwsp_paid_sen'
>

/** What the academy has collected: everything paid, less the KWSP part. */
export function collectedSen(inv: CollectionFields): number {
  return inv.amount_paid_sen - inv.kwsp_paid_sen
}

/**
 * What the academy has not collected, never below zero.
 *
 * The same expression as the `uncollected_sen` column, computed from the
 * columns under it rather than read: a generated column is typed nullable, and
 * a figure on a money screen should not need a fallback.
 */
export function uncollectedSen(inv: CollectionFields): number {
  return Math.max(0, inv.total_sen - collectedSen(inv))
}

/**
 * What was collected on an invoice, by the route it came: through the gateway
 * (FPX — a callback wrote the row) or typed in by staff.
 *
 * The two add up to `collectedSen`: succeeded payments only, as the trigger
 * counts them, and KWSP left out because to staff it has not been collected.
 * `provider`, not `method`, is what tells them apart — a staff member can
 * record a payment and call its method anything, but only the gateway writes
 * a row whose provider is not `manual`.
 */
export function collectedBreakdown(payments: PaymentRoute[] | undefined): {
  fpx: number
  manual: number
} {
  let fpx = 0
  let manual = 0
  for (const p of payments ?? []) {
    if (p.status !== 'succeeded' || p.method === 'kwsp') continue
    if (p.provider === 'manual') manual += p.amount_sen
    else fpx += p.amount_sen
  }
  return { fpx, manual }
}

/**
 * The status staff see, from what has been collected.
 *
 * `app.sync_invoice_paid`'s own rule, applied to the collected figure instead
 * of the paid one — so an invoice the student sees as Paid reads Partially
 * paid here while part of it is waiting on KWSP, and Issued if KWSP is all
 * there is. An invoice with no KWSP money comes back unchanged.
 */
export function collectionStatus(
  inv: CollectionFields & Pick<Invoice, 'status'>,
): InvoiceStatus {
  if (inv.status === 'void' || inv.status === 'cancelled' || inv.status === 'draft')
    return inv.status
  const collected = collectedSen(inv)
  if (collected >= inv.total_sen) return 'paid'
  if (collected > 0) return 'partially_paid'
  return inv.status === 'paid' || inv.status === 'partially_paid'
    ? 'issued'
    : inv.status
}

/**
 * One page of invoices, read.
 *
 * Still PostgREST rather than an RPC: the course filter is one `eq` and the
 * embeds are plain FKs, so SQL would buy nothing. `id` joins the sort key
 * because OFFSET paging over a non-unique order can repeat one row and skip
 * another when two invoices share a `created_at`.
 *
 * A plain function so the two hooks below — a page at a time, and a list that
 * grows — ask the database the same question and cannot drift apart.
 */
async function fetchInvoicePage(
  academyId: string,
  courseFilter: string,
  page: number,
  money: MoneyFilter,
) {
  const from = (page - 1) * PAGE_SIZE
  let q = supabase
    .from('invoices')
    .select(
      // The payments ride along for the Breakdown column: an invoice
      // records how much was paid, not by which route. A plain embed, so
      // it adds columns to each row and filters nothing.
      '*, student:students(full_name, student_no), course:courses(id, title), payments(amount_sen, provider, method, status)',
      { count: 'exact' },
    )
    .eq('academy_id', academyId)
  if (courseFilter === NO_COURSE) q = q.is('course_id', null)
  else if (courseFilter !== ALL_COURSES) q = q.eq('course_id', courseFilter)

  if (money !== ALL_MONEY) {
    // A tile sums only real receivables, so pressing one must not turn up
    // rows the tile did not count. A deny-list rather than an allow-list,
    // to match `invoice_totals` verbatim: a status added later must join
    // both or neither, or the list stops adding up to the number above it.
    q = q.neq('status', 'void').neq('status', 'cancelled').neq('status', 'draft')
    // Each of these is a column precisely so it is a filter and not a
    // column-to-column comparison, which PostgREST cannot express.
    if (money === 'collected') q = q.gt('collected_sen', 0)
    else if (money === 'kwsp') q = q.gt('kwsp_paid_sen', 0)
    else if (money === 'outstanding') q = q.gt('uncollected_sen', 0)
    else
      q = q
        .gt('balance_sen', 0)
        .not('due_at', 'is', null)
        .lt('due_at', new Date().toISOString())
  }

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  if (error) throw error
  return {
    rows: (data ?? []) as unknown as InvoiceRow[],
    total: count ?? 0,
  }
}

/** One page of invoices, for a screen with a pager. */
export function useInvoicePage(
  academyId: string | null,
  courseFilter: string,
  page: number,
  money: MoneyFilter = ALL_MONEY,
) {
  return useQuery({
    queryKey: ['invoice-page', academyId, courseFilter, money, page] as const,
    enabled: !!academyId,
    placeholderData: keepPreviousData,
    queryFn: () => fetchInvoicePage(academyId!, courseFilter, page, money),
  })
}

/**
 * The same list, growing: each "Load more" appends the next page.
 *
 * `/payments` is read top-down — newest invoice first, keep going until you
 * find it — and a pager makes that a walk through screens that each forget the
 * last. The filter is in the key and the page is not, so changing course or
 * pressing a tile starts again from the top without any reset code.
 *
 * `total` on every page is the size of the whole filtered set, so the next
 * page exists exactly while fewer rows than that have been loaded.
 */
export function useInvoiceList(
  academyId: string | null,
  courseFilter: string,
  money: MoneyFilter = ALL_MONEY,
) {
  return useInfiniteQuery({
    queryKey: ['invoice-list', academyId, courseFilter, money] as const,
    enabled: !!academyId,
    placeholderData: keepPreviousData,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchInvoicePage(academyId!, courseFilter, pageParam, money),
    getNextPageParam: (last, pages) =>
      pages.length * PAGE_SIZE < last.total ? pages.length + 1 : undefined,
  })
}

/**
 * The money tiles, over the whole filtered set rather than the page.
 *
 * This is the half of the old client-side `computeStats` a page cannot answer.
 * The figures are the **staff** reading of the book, because every caller is a
 * staff screen: `collected` is what arrived by any route but KWSP, `kwsp` is
 * what KWSP covers, and `outstanding` is what the academy has not collected —
 * so it includes `kwsp`, and `total = collected + outstanding` (overpayments
 * aside: `collected` is a raw sum, `outstanding` clamps each invoice at zero).
 *
 * `overdue` is the exception. It is the student's own balance past its due
 * date; money KWSP is covering is not theirs to be late with.
 */
export function useInvoiceStats(academyId: string | null, courseFilter: string) {
  return useQuery({
    queryKey: ['invoice-totals', academyId, courseFilter] as const,
    enabled: !!academyId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('invoice_totals', {
        _academy: academyId!,
        ...(courseFilter === ALL_COURSES || courseFilter === NO_COURSE
          ? {}
          : { _course: courseFilter }),
        ...(courseFilter === NO_COURSE ? { _no_course: true } : {}),
      })
      if (error) throw error
      const row = (data as unknown as InvoiceTotalsRow[] | null)?.[0]
      return {
        total: Number(row?.invoiced_sen ?? 0),
        // `collected_sen` is everything paid; the KWSP part is taken out here.
        collected:
          Number(row?.collected_sen ?? 0) - Number(row?.kwsp_sen ?? 0),
        kwsp: Number(row?.kwsp_sen ?? 0),
        outstanding: Number(row?.uncollected_sen ?? 0),
        overdue: Number(row?.overdue_sen ?? 0),
        // How many invoices each figure was summed over — counted with the
        // predicate `useInvoicePage` filters by, so a tile's count is the
        // number of rows the list shows when that tile is pressed. An invoice
        // paid partly by KWSP is in three of them; they are not a partition.
        counts: {
          total: Number(row?.invoice_count ?? 0),
          collected: Number(row?.collected_count ?? 0),
          kwsp: Number(row?.kwsp_count ?? 0),
          outstanding: Number(row?.uncollected_count ?? 0),
        },
      }
    },
  })
}

/**
 * Billed / paid / outstanding totals for a set of invoices (excludes
 * void/draft), as staff read them: paid is what was collected, so money
 * covered by KWSP is still outstanding.
 */
export function invoiceTotals(invoices: Invoice[]) {
  let billed = 0
  let paid = 0
  for (const inv of invoices) {
    if (inv.status === 'void' || inv.status === 'cancelled' || inv.status === 'draft')
      continue
    billed += inv.total_sen
    paid += collectedSen(inv)
  }
  return { billed, paid, outstanding: Math.max(0, billed - paid) }
}

export function useCreateInvoice(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      studentId: string
      dueDate: string
      taxSen: number
      notes: string
      items: NewItem[]
      createdBy?: string | null
    }) => {
      const subtotal = input.items.reduce(
        (s, it) => s + it.quantity * it.unitPriceSen,
        0,
      )
      const total = subtotal + input.taxSen
      const { data: inv, error } = await supabase
        .from('invoices')
        .insert({
          academy_id: academyId,
          student_id: input.studentId,
          invoice_no: '',
          status: 'issued',
          subtotal_sen: subtotal,
          tax_sen: input.taxSen,
          total_sen: total,
          issued_at: new Date().toISOString(),
          due_at: input.dueDate
            ? new Date(`${input.dueDate}T23:59:59`).toISOString()
            : null,
          notes: input.notes || null,
          created_by: input.createdBy ?? null,
        })
        .select()
        .single()
      if (error) throw error
      if (input.items.length) {
        const rows = input.items.map((it) => ({
          academy_id: academyId,
          invoice_id: inv.id,
          description: it.description,
          quantity: it.quantity,
          unit_price_sen: it.unitPriceSen,
          amount_sen: it.quantity * it.unitPriceSen,
        }))
        const { error: e2 } = await supabase.from('invoice_items').insert(rows)
        if (e2) throw e2
      }
      return inv
    },
    onSuccess: () => invalidateMoney(qc, academyId),
  })
}

/** Create the same invoice for many students at once (one invoice each). */
export function useCreateInvoices(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      studentIds: string[]
      dueDate: string
      taxSen: number
      notes: string
      items: NewItem[]
      courseId?: string | null
      createdBy?: string | null
      /** null = follow the academy's ToyyibPay default at pay time. */
      chargeToPayor?: boolean | null
      /**
       * Let the payer settle this invoice in instalments online.
       * null = follow the academy's default at pay time.
       */
      allowPartialPayment?: boolean | null
      /** Floor for one instalment, in sen. null = follow the academy default. */
      minPartialSen?: number | null
    }) => {
      const subtotal = input.items.reduce(
        (s, it) => s + it.quantity * it.unitPriceSen,
        0,
      )
      const total = subtotal + input.taxSen
      const issuedAt = new Date().toISOString()
      const dueAt = input.dueDate
        ? new Date(`${input.dueDate}T23:59:59`).toISOString()
        : null

      // Insert invoices sequentially so the per-academy invoice_no trigger sees
      // prior rows (avoids in-batch number collisions), then batch the items.
      const created: Invoice[] = []
      for (const studentId of input.studentIds) {
        const { data: inv, error } = await supabase
          .from('invoices')
          .insert({
            academy_id: academyId,
            student_id: studentId,
            course_id: input.courseId ?? null,
            invoice_no: '',
            status: 'issued',
            subtotal_sen: subtotal,
            tax_sen: input.taxSen,
            total_sen: total,
            issued_at: issuedAt,
            due_at: dueAt,
            notes: input.notes || null,
            created_by: input.createdBy ?? null,
            charge_to_payor: input.chargeToPayor ?? null,
            // NULL, not false: "off" and "unset" are different answers now, and
            // only the latter defers to `academy_payment_settings`.
            allow_partial_payment: input.allowPartialPayment ?? null,
            // Only meaningful alongside the flag, and NULL is the "follow the
            // default, then their floor" representation the CHECK expects.
            min_partial_sen: input.allowPartialPayment
              ? (input.minPartialSen ?? null)
              : null,
          })
          .select()
          .single()
        if (error) throw error
        created.push(inv as Invoice)
      }

      if (input.items.length) {
        const rows = created.flatMap((inv) =>
          input.items.map((it) => ({
            academy_id: academyId,
            invoice_id: inv.id,
            description: it.description,
            quantity: it.quantity,
            unit_price_sen: it.unitPriceSen,
            amount_sen: it.quantity * it.unitPriceSen,
          })),
        )
        const { error: e2 } = await supabase.from('invoice_items').insert(rows)
        if (e2) throw e2
      }
      return created
    },
    onSuccess: () => invalidateMoney(qc, academyId),
  })
}

/**
 * Record a payment that arrived outside the gateway.
 *
 * The insert is the whole write. `invoices.amount_paid_sen` and the invoice
 * status are recomputed from `sum(payments where succeeded)` by
 * `app.sync_invoice_paid`, the same rule `record_gateway_payment` always used:
 * this used to add `amountSen` to the figure the *page* was showing, so two
 * payments recorded from one screen both added to the same stale number and the
 * second one's money stayed in the ledger but left the invoice. A client cannot
 * hold the invoice row still between reading it and writing it back; the
 * database can.
 */
export function useRecordPayment(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      invoiceId: string
      studentId: string
      amountSen: number
      method: PaymentMethod
      paidAt: string
      note?: string | null
      createdBy?: string | null
    }) => {
      const { error } = await supabase.from('payments').insert({
        academy_id: academyId,
        invoice_id: input.invoiceId,
        student_id: input.studentId,
        amount_sen: input.amountSen,
        method: input.method,
        provider: 'manual',
        status: 'succeeded',
        paid_at: input.paidAt,
        // Blank is stored as NULL, so "no note" has one representation and the
        // ledger never has to tell an empty string from an absent one.
        note: input.note?.trim() || null,
        created_by: input.createdBy ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      invalidateMoney(qc, academyId)
      qc.invalidateQueries({ queryKey: oneKey(vars.invoiceId) })
    },
  })
}

/**
 * Change the note on a payment already in the ledger.
 *
 * A note is the one thing on a payment row that is routinely wrong at the time
 * it is typed — the cheque number is on a slip somebody is still holding, the
 * reason an amount is short arrives on the next phone call — and until now the
 * only way to fix one was to delete the payment and re-enter it, which moves
 * `created_at` and loses the record of when the money was actually banked.
 *
 * A plain PostgREST update rather than an RPC: `payments: admin update` is
 * `app.is_admin(academy_id)` in both `using` and `with check`, so the database
 * already refuses everyone `/payments/log` is closed to, and a note drags no
 * derived column behind it. `app.sync_invoice_paid` does fire on the UPDATE and
 * recompute `amount_paid_sen` from the same succeeded rows it already summed --
 * idempotent, so the invoice does not move.
 *
 * `.select('id').single()` is the point of the write, not decoration: an UPDATE
 * that RLS refuses, or one whose id belongs to another academy, returns **200
 * with zero rows**, not an error. Without the round trip back the dialog would
 * close on "saved" having saved nothing, which on a money screen is the one
 * outcome worse than an error message.
 */
export function useUpdatePaymentNote(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      /** Only for the cache — the invoice page prints this same note. */
      invoiceId?: string | null
      note: string
    }) => {
      const { data, error } = await supabase
        .from('payments')
        // Blank clears back to NULL, the single representation of "no note"
        // that `useRecordPayment` writes. An empty string would otherwise start
        // matching the ledger's own note search.
        .update({ note: input.note.trim() || null })
        .eq('id', input.id)
        // Belt and braces over RLS, which already scopes the caller: an admin
        // of two academies holds a valid JWT for both, so the tenant the screen
        // is showing has to be part of the predicate.
        .eq('academy_id', academyId)
        .select('id')
        .single()
      if (error) throw error
      if (!data) throw new Error(translate('payments.error.note_failed'))
    },
    onSuccess: (_d, vars) => {
      invalidateMoney(qc, academyId)
      if (vars.invoiceId) {
        qc.invalidateQueries({ queryKey: oneKey(vars.invoiceId) })
      }
    },
  })
}

/**
 * The online payment terms, editable after the invoice is issued.
 *
 * Turning instalments on for an invoice the student already has is the ordinary
 * case — "can I pay this in two?" is a phone call, not something anticipated at
 * creation — so this lives on the invoice rather than only in the new-invoice
 * form. Authority is unchanged: `invoices: admin update` is `app.is_admin`, so a
 * trainer's write is refused by the database, not merely by a hidden card, and
 * `create-bill` re-reads both columns before it bills anything.
 */
export function useUpdatePaymentTerms(academyId: string, invoiceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      allowPartial: boolean
      minPartialSen: number | null
    }) => {
      const { error } = await supabase
        .from('invoices')
        .update({
          allow_partial_payment: input.allowPartial,
          // NULL is how "no floor of our own, use ToyyibPay's RM1.00" is
          // stored, and the CHECK constraint rejects anything under 100 sen.
          min_partial_sen: input.allowPartial ? input.minPartialSen : null,
        })
        .eq('id', invoiceId)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateMoney(qc, academyId)
      qc.invalidateQueries({ queryKey: oneKey(invoiceId) })
    },
  })
}

export function useVoidInvoice(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'void' })
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: (id) => {
      invalidateMoney(qc, academyId)
      qc.invalidateQueries({ queryKey: oneKey(id) })
    },
  })
}

export const INVOICE_STATUS_VARIANT: Record<
  InvoiceStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  issued: 'outline',
  partially_paid: 'outline',
  paid: 'default',
  overdue: 'destructive',
  void: 'secondary',
  cancelled: 'secondary',
}

/** Badge copy for the same enum — `draft` and `overdue` reuse `common.*`. */
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, TKey> = {
  draft: 'common.draft',
  issued: 'payments.status.issued',
  partially_paid: 'payments.status.partially_paid',
  paid: 'payments.status.paid',
  overdue: 'common.overdue',
  void: 'payments.status.void',
  cancelled: 'payments.status.cancelled',
}

/** Never render the raw enum — 'bank_transfer' is not a label. */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, TKey> = {
  cash: 'payments.method.cash',
  bank_transfer: 'payments.method.bank_transfer',
  fpx: 'payments.method.fpx',
  card: 'payments.method.card',
  ewallet: 'payments.method.ewallet',
  kwsp: 'payments.method.kwsp',
  other: 'payments.method.other',
}

/** Method order for the picker. Labels come from `PAYMENT_METHOD_LABEL`. */
export const PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'bank_transfer',
  'fpx',
  'card',
  'ewallet',
  'kwsp',
  'other',
]

export type PaymentStatus = Enums<'payment_status'>

/**
 * Payment status — the row's own outcome, not the invoice's.
 *
 * `succeeded` is deliberately drawn as a muted `outline`: it is the normal case
 * and every row in the log would otherwise carry the same loud badge. What is
 * worth interrupting for is a payment that failed or came back.
 */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, TKey> = {
  pending: 'payments.pstatus.pending',
  succeeded: 'payments.pstatus.succeeded',
  failed: 'payments.pstatus.failed',
  refunded: 'payments.pstatus.refunded',
}

export const PAYMENT_STATUS_VARIANT: Record<
  PaymentStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  pending: 'secondary',
  succeeded: 'outline',
  failed: 'destructive',
  refunded: 'destructive',
}

/** Filter order for the log. `all` is the caller's own sentinel, not an enum. */
export const PAYMENT_STATUSES: PaymentStatus[] = [
  'succeeded',
  'pending',
  'failed',
  'refunded',
]

/**
 * Who took the money. The gateways are proper nouns and stay untranslated;
 * only `manual` — "somebody typed this in" — is copy.
 */
export const PAYMENT_PROVIDER_LABEL: Record<Enums<'payment_provider'>, string> =
  {
    manual: '',
    toyyibpay: 'ToyyibPay',
    billplz: 'Billplz',
    stripe: 'Stripe',
  }

// ---------------------------------------------------------------------------
// Online payments (ToyyibPay). See docs/toyyibpay-payments.md.
// ---------------------------------------------------------------------------

/** Mint (or fetch) the invoice's public pay token. Admin-only (RLS-guarded RPC). */
export function useEnsurePayToken() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.rpc('ensure_pay_token', {
        _invoice: invoiceId,
      })
      if (error) throw error
      return data as unknown as string
    },
  })
}

export type SendPayLinkResult = {
  ok: boolean
  id?: string | null
  to?: string
  code?: 'no_email' | 'email_not_configured' | 'send_failed'
  message?: string
}

/** Email the pay link to the student (reuses the send-invitation Resend setup). */
export function useSendPayLink() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.functions.invoke<SendPayLinkResult>(
        'send-pay-link',
        { body: { invoice_id: invoiceId, origin: APP_ORIGIN } },
      )
      if (error) {
        const body = await readFunctionError(error)
        throw new Error(
          body ?? errorMessage(error, translate('payments.error.email_failed')),
        )
      }
      return (data ??
        {
          ok: false,
          message: translate('payments.error.no_response'),
        }) as SendPayLinkResult
    },
  })
}

// --- Public (login-less) pay page --------------------------------------------

export type PublicInvoice = {
  invoice_no: string
  academy_name: string
  academy_logo_url: string | null
  currency: string
  total_sen: number
  amount_paid_sen: number
  due_sen: number
  status: InvoiceStatus
  gateway_enabled: boolean
  /** Resolved server-side: the invoice's own flag, else the academy default. */
  charge_to_payor: boolean
  /** The payer may bill less than `due_sen`. Per invoice; off by default. */
  allow_partial: boolean
  /**
   * The smallest amount this invoice accepts, already clamped to `due_sen` by
   * `get_public_invoice` — so a balance under the academy's minimum instalment
   * is simply payable in full. `create-bill` re-derives the same figure; this
   * copy exists to validate the input before a round trip, never instead of it.
   */
  min_pay_sen: number
}

/** Read-only invoice by public pay token (anon RPC; minimal fields, no PII). */
export function usePublicInvoice(token: string | undefined) {
  return useQuery({
    queryKey: ['public-invoice', token] as const,
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_invoice', {
        _token: token!,
      })
      if (error) throw error
      return ((data as unknown as PublicInvoice[] | null)?.[0] ?? null)
    },
  })
}

export type PayStatus = { invoice_status: string; intent_status: string | null }

/** Poll the DB (source of truth) for the payment outcome on the result page. */
export function usePayStatus(token: string | undefined, poll: boolean) {
  return useQuery({
    queryKey: ['pay-status', token] as const,
    enabled: !!token,
    refetchInterval: poll ? 3000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_pay_status', {
        _token: token!,
      })
      if (error) throw error
      return ((data as unknown as PayStatus[] | null)?.[0] ?? null)
    },
  })
}

export type CreateBillResult = {
  ok: boolean
  url?: string
  reused?: boolean
  code?: string
  message?: string
  /** What the bill was actually raised for — the server's clamp, not ours. */
  amount_sen?: number
  min_sen?: number
}

/**
 * Create a ToyyibPay bill for the invoice and get the hosted FPX payment URL.
 *
 * `amountSen` is omitted for a payment in full and sent only when the payer
 * chose a smaller figure. It is a request: the function re-reads the invoice's
 * balance, its `allow_partial_payment` flag and its minimum under the service
 * role, so nothing here is load-bearing for correctness.
 */
export function useCreateBill() {
  return useMutation({
    mutationFn: async (input: string | { token: string; amountSen?: number }) => {
      const { token, amountSen } =
        typeof input === 'string' ? { token: input, amountSen: undefined } : input
      const { data, error } = await supabase.functions.invoke<CreateBillResult>(
        'create-bill',
        {
          body: {
            pay_token: token,
            origin: APP_ORIGIN,
            ...(amountSen === undefined ? {} : { amount_sen: amountSen }),
          },
        },
      )
      if (error) {
        const body = await readFunctionError(error)
        throw new Error(
          body ??
            errorMessage(error, translate('payments.error.start_payment')),
        )
      }
      return (data ??
        {
          ok: false,
          message: translate('payments.error.no_response'),
        }) as CreateBillResult
    },
  })
}

export type VerifyResult = {
  ok: boolean
  invoice_status?: string
  intent_status?: string | null
  code?: string
}

function isSettled(d: VerifyResult | undefined) {
  return (
    d?.invoice_status === 'paid' ||
    d?.intent_status === 'succeeded' ||
    d?.intent_status === 'failed'
  )
}

/**
 * Poll the verify-payment function: it actively re-queries ToyyibPay and settles
 * the invoice server-side, so the result page confirms even if the gateway
 * callback never arrives. Idempotent, short-circuits once paid, self-stops when
 * settled, and caps at ~2 min so an unpaid page doesn't poll forever.
 */
export function useVerifyPayment(token: string | undefined) {
  return useQuery({
    queryKey: ['verify-payment', token] as const,
    enabled: !!token,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const d = query.state.data as VerifyResult | undefined
      if (isSettled(d)) return false
      if (query.state.dataUpdateCount >= 30) return false // ~2 min cap
      return 4000
    },
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<VerifyResult>(
        'verify-payment',
        { body: { pay_token: token! } },
      )
      // Treat a transient function/network error as "still confirming".
      if (error) return { ok: false } as VerifyResult
      return (data ?? { ok: false }) as VerifyResult
    },
  })
}

/** Staff-triggered reconcile for one invoice (re-checks ToyyibPay + refreshes). */
export function useCheckPayment(academyId: string, invoiceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.functions.invoke<VerifyResult>(
        'verify-payment',
        { body: { pay_token: token } },
      )
      if (error) {
        const body = await readFunctionError(error)
        throw new Error(body ?? translate('payments.error.check_status'))
      }
      return (data ?? { ok: false }) as VerifyResult
    },
    onSuccess: () => {
      // A reconcile can bank a gateway payment, so the ledger moves too.
      invalidateMoney(qc, academyId)
      qc.invalidateQueries({ queryKey: oneKey(invoiceId) })
    },
  })
}

async function readFunctionError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown })?.context
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const parsed = (await (ctx as Response).json()) as {
        error?: string
        message?: string
      }
      return parsed.error ?? parsed.message ?? null
    } catch {
      return null
    }
  }
  return null
}
