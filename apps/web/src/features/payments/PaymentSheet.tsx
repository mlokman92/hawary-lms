import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { formatMYR } from '@hawary/shared'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { ErrorBlock, LoadingBlock } from '@/components/patterns/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_VARIANT,
  type PaymentLogRow,
} from './api'
import {
  EditBankTransferDialog,
  type TransferTarget,
} from './EditBankTransferDialog'
import type { NoteTarget } from './EditPaymentNoteDialog'
import { sourceLine } from './sourceLine'

/** What the read below returns before it is flattened to a `PaymentLogRow`. */
type PaymentEmbed = Omit<
  PaymentLogRow,
  | 'invoice_no'
  | 'course_id'
  | 'course_title'
  | 'student_full_name'
  | 'student_no'
  | 'recorded_by_name'
> & {
  invoice: {
    invoice_no: string
    course: { id: string; title: string } | null
  } | null
  student: { full_name: string | null; student_no: string | null } | null
  recorder: { full_name: string | null } | null
  receipt: { confirmed_at: string | null } | null
}

/**
 * The payment as its own read returns it: the ledger's row, and whether a
 * Director has checked its receipt — which is what closes a bank transfer's
 * amount and date to correction. Always null for anything but a transfer.
 */
type PaymentOne = PaymentLogRow & { receipt_confirmed_at: string | null }

/**
 * One payment by its id — what `/payments/log?payment=<id>` opens.
 *
 * Its own read rather than a lookup in the page: the address is something a
 * colleague is sent, and the row it names may be on another page of the
 * ledger or outside the filter. One row needs no search function, so this is a
 * plain PostgREST read under the table's own policies. Keyed under
 * `payment-log`, so every money write that refreshes the ledger refreshes it.
 */
function usePayment(academyId: string | null, paymentId: string | null) {
  return useQuery({
    queryKey: ['payment-log', 'one', academyId, paymentId] as const,
    enabled: !!academyId && !!paymentId,
    queryFn: async (): Promise<PaymentOne | null> => {
      const { data, error } = await supabase
        .from('payments')
        .select(
          'id, amount_sen, method, provider, provider_ref, status, paid_at, created_at, note, invoice_id, student_id, invoice:invoices(invoice_no, course:courses(id, title)), student:students(full_name, student_no), recorder:profiles(full_name), receipt:payment_receipts(confirmed_at)',
        )
        .eq('academy_id', academyId!)
        .eq('id', paymentId!)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const { invoice, student, recorder, receipt, ...p } =
        data as unknown as PaymentEmbed
      return {
        ...p,
        invoice_no: invoice?.invoice_no ?? null,
        course_id: invoice?.course?.id ?? null,
        course_title: invoice?.course?.title ?? null,
        student_full_name: student?.full_name ?? null,
        student_no: student?.student_no ?? null,
        recorded_by_name: recorder?.full_name ?? null,
        receipt_confirmed_at: receipt?.confirmed_at ?? null,
      }
    },
  })
}

/**
 * One payment, beside the ledger it was opened from.
 *
 * Open exactly while the address names a payment, so the address is the
 * record: "are these two RM500 rows the same payment?" is asked of somebody
 * else, and this is the link that means one row and not the invoice's five.
 *
 * `hint` is the row that was clicked, shown until the payment's own read
 * answers; a pasted address has none and waits for it.
 */
export function PaymentSheet({
  academyId,
  paymentId,
  hint,
  onEditNote,
  onClose,
}: {
  academyId: string | null
  paymentId: string | null
  hint: PaymentLogRow | undefined
  /** Opens the page's one note dialog on this payment. */
  onEditNote: (target: NoteTarget) => void
  onClose: () => void
}) {
  const { t } = useT()
  const one = usePayment(academyId, paymentId)
  const p = one.data ?? (one.data === undefined ? hint : undefined)
  const [editing, setEditing] = useState<TransferTarget | null>(null)
  // A bank transfer's amount and date can be corrected until a Director has
  // checked them against the receipt. Only the payment's own read knows that,
  // so the clicked row alone never offers it.
  const editable =
    one.data?.method === 'bank_transfer' &&
    one.data.status === 'succeeded' &&
    !one.data.receipt_confirmed_at

  return (
    <Sheet open={!!paymentId} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="pr-14">
          <SheetTitle>
            {p
              ? (p.student_full_name ?? t('common.unnamed'))
              : t('payments.log.title')}
          </SheetTitle>
          <SheetDescription>
            {p
              ? [p.student_no, p.course_title].filter(Boolean).join(' · ')
              : null}
          </SheetDescription>
        </SheetHeader>

        {!p ? (
          <div className="px-6">
            {one.error ? (
              <ErrorBlock error={one.error} />
            ) : one.isLoading ? (
              <LoadingBlock />
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('payments.log.no_match')}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-6 pb-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1">
                  <div className="text-lg font-semibold tabular-nums">
                    {formatMYR(p.amount_sen)}
                  </div>
                  {editable ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        setEditing({
                          id: p.id,
                          amountSen: p.amount_sen,
                          paidAt: p.paid_at ?? p.created_at,
                        })
                      }
                    >
                      <Pencil />
                      <span className="sr-only">
                        {t('payments.transfer.edit')}
                      </span>
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>{t(PAYMENT_METHOD_LABEL[p.method])}</span>
                  {p.status !== 'succeeded' ? (
                    <Badge variant={PAYMENT_STATUS_VARIANT[p.status]}>
                      {t(PAYMENT_STATUS_LABEL[p.status])}
                    </Badge>
                  ) : null}
                </div>
              </div>
              {p.invoice_id ? (
                <Link
                  to={`/payments/${p.invoice_id}`}
                  className="font-medium whitespace-nowrap hover:underline"
                >
                  {p.invoice_no}
                </Link>
              ) : null}
            </div>

            <div className="text-muted-foreground text-xs">
              <div>
                {t('payments.receipts.paid_on', {
                  date: fmtDate(p.paid_at ?? p.created_at),
                })}
              </div>
              <div>
                {t('payments.log.recorded_at', {
                  when: fmtDateTime(p.created_at),
                })}
              </div>
              <div>{sourceLine(p, t)}</div>
            </div>

            <button
              type="button"
              onClick={() =>
                onEditNote({
                  id: p.id,
                  invoiceId: p.invoice_id,
                  invoiceNo: p.invoice_no,
                  amountSen: p.amount_sen,
                  date: p.paid_at ?? p.created_at,
                  note: p.note,
                })
              }
              aria-label={t('payments.log.note_edit')}
              className="hover:bg-accent focus-visible:ring-ring flex items-start justify-between gap-2 rounded-md border p-3 text-left focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="break-words whitespace-pre-wrap">
                {p.note ?? '—'}
              </span>
              <Pencil
                className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
                aria-hidden
              />
            </button>

            <div className="flex flex-wrap gap-2">
              {p.student_id ? (
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/students/${p.student_id}`}>
                    {t('common.student')}
                  </Link>
                </Button>
              ) : null}
              {/* The proof behind a transfer lives on the receipts queue,
                  which opens on this same payment. */}
              {p.method === 'bank_transfer' && p.status === 'succeeded' ? (
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/payments/receipts?payment=${p.id}`}>
                    {t('payments.receipts.receipt')}
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </SheetContent>
      <EditBankTransferDialog
        academyId={academyId}
        target={editing}
        onOpenChange={(next) => !next && setEditing(null)}
      />
    </Sheet>
  )
}
