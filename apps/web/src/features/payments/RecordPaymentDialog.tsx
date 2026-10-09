import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatMYR, ringgitToSen, senToRinggit } from '@hawary/shared'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  PAYMENT_METHOD_LABEL,
  RECORDABLE_METHODS,
  useRecordPayment,
  type PaymentMethod,
} from './api'
import { RECEIPT_ACCEPT, useUploadPaymentReceipt } from './receipts'
import { errorMessage } from '@/lib/errors'

/** The bucket's own cap. Checked here so the refusal comes before the upload. */
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024

/**
 * Record a payment that arrived outside the gateway.
 *
 * A **bank transfer cannot be recorded without its receipt.** It is the one
 * method the system takes on a staff member's word, so the proof is asked for
 * at the moment the claim is made rather than chased afterwards from the
 * receipts queue.
 *
 * The receipt can only be attached to a payment that exists, so saving is two
 * steps: the payment, then the file. If the second fails the first has still
 * happened — and must not happen twice. So once the payment is in, the form
 * locks and the button becomes "upload the receipt" only; pressing it again
 * retries the upload and never records another payment. Closing instead leaves
 * the payment in the ledger, pending in the receipts queue like any other
 * transfer without one.
 */
export function RecordPaymentDialog({
  academyId,
  invoiceId,
  studentId,
  totalSen,
  paidSen,
  open,
  onOpenChange,
}: {
  academyId: string
  invoiceId: string
  studentId: string
  totalSen: number
  paidSen: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()
  const { t } = useT()
  const record = useRecordPayment(academyId)
  const upload = useUploadPaymentReceipt()
  const remaining = Math.max(0, totalSen - paidSen)

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [paidDate, setPaidDate] = useState('')
  const [note, setNote] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  // The payment this dialog has already recorded, when its receipt is still
  // to be uploaded. While set, the form is the receipt and nothing else.
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset only on the way from closed to open. `remaining` is read here but
  // must not be a reason to reset: it drops the moment the payment is
  // recorded, and resetting then would wipe `savedId` and let the same payment
  // be recorded again — the one thing this dialog must not do.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setAmount(senToRinggit(remaining))
      setMethod('cash')
      setPaidDate(new Date().toISOString().slice(0, 10))
      setNote('')
      setReceipt(null)
      setSavedId(null)
      setError(null)
    }
    wasOpen.current = open
  }, [open, remaining])

  const needsReceipt = method === 'bank_transfer'
  const busy = record.isPending || upload.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (needsReceipt) {
      if (!receipt) return setError(t('payments.record.error_receipt'))
      if (receipt.size > RECEIPT_MAX_BYTES)
        return setError(t('payments.record.error_receipt_size'))
    }

    let paymentId = savedId
    if (!paymentId) {
      const amountSen = ringgitToSen(amount)
      if (amountSen <= 0) return setError(t('payments.record.error_amount'))
      try {
        paymentId = await record.mutateAsync({
          invoiceId,
          studentId,
          amountSen,
          method,
          paidAt: new Date(`${paidDate}T12:00:00`).toISOString(),
          note,
          createdBy: user?.id ?? null,
        })
      } catch (err) {
        return setError(errorMessage(err, t('common.error')))
      }
      if (!needsReceipt) return onOpenChange(false)
      // From here the payment exists. Remember it before trying the upload,
      // so a failure cannot lead to a second one.
      setSavedId(paymentId)
    }

    try {
      await upload.mutateAsync({ paymentId, file: receipt! })
      onOpenChange(false)
    } catch (err) {
      setError(
        t('payments.record.receipt_failed', {
          reason: errorMessage(err, t('upload.failed')),
        }),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payments.record.title')}</DialogTitle>
          <DialogDescription>
            {t('payments.record.balance_due', { amount: formatMYR(remaining) })}
          </DialogDescription>
        </DialogHeader>
        <form id="payment-form" className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="amount">{t('payments.record.amount')}</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                disabled={!!savedId}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="paid">{t('common.date')}</Label>
              <Input
                id="paid"
                type="date"
                value={paidDate}
                disabled={!!savedId}
                onChange={(e) => setPaidDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{t('payments.record.method')}</Label>
            <Select
              value={method}
              disabled={!!savedId}
              onValueChange={(v) => setMethod(v as PaymentMethod)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECORDABLE_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(PAYMENT_METHOD_LABEL[m])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsReceipt ? (
            <div className="grid gap-2">
              <Label htmlFor="payment-receipt">
                {t('payments.receipts.receipt')}
              </Label>
              <Input
                id="payment-receipt"
                type="file"
                accept={RECEIPT_ACCEPT}
                onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
              />
              <p className="text-muted-foreground text-xs">
                {t('payments.record.receipt_hint')}
              </p>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="payment-note">{t('payments.record.note')}</Label>
            <Textarea
              id="payment-note"
              rows={2}
              value={note}
              disabled={!!savedId}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('payments.record.note_placeholder')}
            />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t(savedId ? 'common.close' : 'common.cancel')}
          </Button>
          <Button type="submit" form="payment-form" disabled={busy}>
            {busy
              ? t(
                  upload.isPending
                    ? 'common.uploading'
                    : 'payments.record.submitting',
                )
              : t(savedId ? 'payments.record.retry_receipt' : 'payments.record.title')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
