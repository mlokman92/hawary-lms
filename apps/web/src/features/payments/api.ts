import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import type { Enums, Tables } from '@hawary/shared'
import { translate, type TKey } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'

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
export type InvoiceRow = Invoice & {
  student: StudentBrief | null
  course: CourseBrief | null
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

/** What both log queries filter by. Held together so they cannot drift apart. */
export type PaymentLogFilters = {
  search: string
  status: PaymentStatus | null
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
) => ['payment-log', a, f.search, f.status, sort, page] as const
const logTotalsKey = (a: string | null, f: PaymentLogFilters) =>
  ['payment-log-totals', a, f.search, f.status] as const

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
 * One helper rather than a call per mutation: there are five keys now — the
 * dashboard's whole-invoice read, the paged invoice list and its totals, the
 * ledger page and its totals — and the failure mode of forgetting one is a
 * stale money figure, which is the worst kind of stale. The paged keys are
 * invalidated by prefix because every page and filter combination is its own
 * entry and any of them may be wrong after a write.
 */
function invalidateMoney(qc: QueryClient, academyId: string) {
  qc.invalidateQueries({ queryKey: listKey(academyId) })
  qc.invalidateQueries({ queryKey: ['invoice-page'] })
  qc.invalidateQueries({ queryKey: ['invoice-totals'] })
  qc.invalidateQueries({ queryKey: ['payment-log'] })
  qc.invalidateQueries({ queryKey: ['payment-log-totals'] })
}

/** Rows per page, shared by both paged lists so they feel like one product. */
export const PAGE_SIZE = 50

type PaymentLogTotalsRow = { total_count: number; received_sen: number }

/** The filter arguments both log calls share, so they can never disagree. */
function searchArgs(filters: PaymentLogFilters) {
  return {
    // Omit rather than send null: an absent argument takes the SQL default,
    // which is exactly what "no filter" means on that side.
    ...(filters.search.trim() ? { _search: filters.search.trim() } : {}),
    ...(filters.status ? { _status: filters.status } : {}),
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
) {
  return useQuery({
    queryKey: logKey(academyId, filters, sort, page),
    enabled: !!academyId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('payment_log_page', {
        _academy: academyId!,
        ...searchArgs(filters),
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
        ...searchArgs(filters),
      })
      if (error) throw error
      const row = (data as unknown as PaymentLogTotalsRow[] | null)?.[0]
      return {
        total: Number(row?.total_count ?? 0),
        receivedSen: Number(row?.received_sen ?? 0),
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
      ...searchArgs(filters),
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

type InvoiceTotalsRow = {
  invoiced_sen: number
  collected_sen: number
  outstanding_sen: number
  overdue_sen: number
}

/**
 * One page of invoices.
 *
 * Still PostgREST rather than an RPC: the course filter is one `eq` and both
 * embeds are plain FKs, so SQL would buy nothing. `id` joins the sort key
 * because OFFSET paging over a non-unique order can repeat one row and skip
 * another when two invoices share a `created_at`.
 */
export function useInvoicePage(
  academyId: string | null,
  courseFilter: string,
  page: number,
) {
  return useQuery({
    queryKey: ['invoice-page', academyId, courseFilter, page] as const,
    enabled: !!academyId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE
      let q = supabase
        .from('invoices')
        .select(
          '*, student:students(full_name, student_no), course:courses(id, title)',
          { count: 'exact' },
        )
        .eq('academy_id', academyId!)
      if (courseFilter === NO_COURSE) q = q.is('course_id', null)
      else if (courseFilter !== ALL_COURSES) q = q.eq('course_id', courseFilter)

      const { data, error, count } = await q
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      return {
        rows: (data ?? []) as unknown as InvoiceRow[],
        total: count ?? 0,
      }
    },
  })
}

/**
 * The four money tiles, over the whole filtered set rather than the page.
 *
 * This is the half of the old client-side `computeStats` a page cannot answer.
 * `invoice_totals` mirrors it exactly, asymmetries included: `collected` is the
 * raw sum of `amount_paid_sen` (an overpayment shows as collected, because it
 * was) while `outstanding` and `overdue` clamp each invoice at zero first.
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
        collected: Number(row?.collected_sen ?? 0),
        outstanding: Number(row?.outstanding_sen ?? 0),
        overdue: Number(row?.overdue_sen ?? 0),
      }
    },
  })
}

/** Billed / paid / outstanding totals for a set of invoices (excludes void/draft). */
export function invoiceTotals(invoices: Invoice[]) {
  let billed = 0
  let paid = 0
  for (const inv of invoices) {
    if (inv.status === 'void' || inv.status === 'cancelled' || inv.status === 'draft')
      continue
    billed += inv.total_sen
    paid += inv.amount_paid_sen
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
      /** Let the payer settle this invoice in instalments online. */
      allowPartialPayment?: boolean
      /** Floor for one instalment, in sen. null = ToyyibPay's RM1.00 minimum. */
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
            allow_partial_payment: input.allowPartialPayment ?? false,
            // Only meaningful alongside the flag, and NULL is the "their floor"
            // representation the CHECK constraint expects.
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

export function useRecordPayment(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      invoiceId: string
      studentId: string
      amountSen: number
      method: PaymentMethod
      paidAt: string
      totalSen: number
      currentPaidSen: number
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
        created_by: input.createdBy ?? null,
      })
      if (error) throw error
      const newPaid = input.currentPaidSen + input.amountSen
      const status: InvoiceStatus =
        newPaid >= input.totalSen ? 'paid' : 'partially_paid'
      const { error: e2 } = await supabase
        .from('invoices')
        .update({ amount_paid_sen: newPaid, status })
        .eq('id', input.invoiceId)
      if (e2) throw e2
    },
    onSuccess: (_d, vars) => {
      invalidateMoney(qc, academyId)
      qc.invalidateQueries({ queryKey: oneKey(vars.invoiceId) })
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
  other: 'payments.method.other',
}

/** Method order for the picker. Labels come from `PAYMENT_METHOD_LABEL`. */
export const PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'bank_transfer',
  'fpx',
  'card',
  'ewallet',
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
        { body: { invoice_id: invoiceId, origin: window.location.origin } },
      )
      if (error) {
        const body = await readFunctionError(error)
        throw new Error(
          body ??
            (error instanceof Error
              ? error.message
              : translate('payments.error.email_failed')),
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
            origin: window.location.origin,
            ...(amountSen === undefined ? {} : { amount_sen: amountSen }),
          },
        },
      )
      if (error) {
        const body = await readFunctionError(error)
        throw new Error(
          body ??
            (error instanceof Error
              ? error.message
              : translate('payments.error.start_payment')),
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
