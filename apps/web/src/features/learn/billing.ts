import type { TKey } from '@/lib/i18n'
import {
  invoiceTotals,
  useInvoice,
  useStudentInvoices,
  type InvoiceStatus,
  type PaymentMethod,
  type StudentInvoiceRow,
} from '@/features/payments/api'

/**
 * The learner's own bills.
 *
 * No new queries and no new grants: `invoices`, `invoice_items` and `payments`
 * all carry `SELECT … app.is_staff(academy_id) OR app.owns_student(student_id)`,
 * and useStudentInvoices already filters by student_id, so scoping never rests
 * on RLS alone.
 *
 * Drafts are filtered out here rather than in the page: an unissued invoice is
 * visible to owns_student, but it is not a bill and showing one would invite a
 * student to pay something the academy hasn't sent yet.
 */
export function useMyInvoices(
  academyId: string | null,
  studentId: string | undefined,
) {
  const q = useStudentInvoices(academyId, studentId)
  const rows: StudentInvoiceRow[] = (q.data ?? []).filter(
    (i) => i.status !== 'draft',
  )
  return { ...q, rows, totals: invoiceTotals(rows) }
}

export { useInvoice as useMyInvoice }

/**
 * Enum → translation key. Module constants are built before a language is
 * known, so the two learner billing screens resolve these with their own `t`.
 * `draft` and `overdue` already have a word in `common`.
 */
export const INVOICE_STATUS_KEY: Record<InvoiceStatus, TKey> = {
  draft: 'common.draft',
  issued: 'lacct.invoice_status.issued',
  partially_paid: 'lacct.invoice_status.partially_paid',
  paid: 'lacct.invoice_status.paid',
  overdue: 'common.overdue',
  void: 'lacct.invoice_status.void',
  cancelled: 'lacct.invoice_status.cancelled',
}

export const PAYMENT_METHOD_KEY: Record<PaymentMethod, TKey> = {
  cash: 'lacct.method.cash',
  bank_transfer: 'lacct.method.bank_transfer',
  fpx: 'lacct.method.fpx',
  card: 'lacct.method.card',
  ewallet: 'lacct.method.ewallet',
  other: 'lacct.method.other',
}
