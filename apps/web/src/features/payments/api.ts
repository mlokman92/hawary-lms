import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Enums, Tables } from '@hawary/shared'
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
export type InvoiceRow = Invoice & { student: StudentBrief | null }
export type InvoiceDetail = Invoice & {
  student: StudentBrief | null
  items: InvoiceItem[]
  payments: Payment[]
}
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
        .select('*, student:students(full_name, student_no)')
        .eq('academy_id', academyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as InvoiceRow[]
    },
  })
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: oneKey(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select(
          '*, student:students(full_name, student_no, email), items:invoice_items(*), payments(*)',
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as unknown as InvoiceDetail
    },
  })
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

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'fpx', label: 'FPX' },
  { value: 'card', label: 'Card' },
  { value: 'ewallet', label: 'E-wallet' },
  { value: 'other', label: 'Other' },
]
