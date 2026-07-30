import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  '*, student:students(full_name, student_no, email), course:courses(id, title), items:invoice_items(*), payments(*)'

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
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey(academyId) }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey(academyId) }),
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
      qc.invalidateQueries({ queryKey: listKey(academyId) })
      qc.invalidateQueries({ queryKey: oneKey(vars.invoiceId) })
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
      qc.invalidateQueries({ queryKey: listKey(academyId) })
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
}

/** Create a ToyyibPay bill for the invoice and get the hosted FPX payment URL. */
export function useCreateBill() {
  return useMutation({
    mutationFn: async (payToken: string) => {
      const { data, error } = await supabase.functions.invoke<CreateBillResult>(
        'create-bill',
        { body: { pay_token: payToken, origin: window.location.origin } },
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
      qc.invalidateQueries({ queryKey: oneKey(invoiceId) })
      qc.invalidateQueries({ queryKey: listKey(academyId) })
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
