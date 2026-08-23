import { useEffect, useState, type FormEvent } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  useRecordPayment,
  type PaymentMethod,
} from './api'
import { errorMessage } from '@/lib/errors'

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
  const remaining = Math.max(0, totalSen - paidSen)

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [paidDate, setPaidDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAmount(senToRinggit(remaining))
    setMethod('cash')
    setPaidDate(new Date().toISOString().slice(0, 10))
    setError(null)
  }, [open, remaining])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const amountSen = ringgitToSen(amount)
    if (amountSen <= 0) return setError(t('payments.record.error_amount'))
    setError(null)
    try {
      await record.mutateAsync({
        invoiceId,
        studentId,
        amountSen,
        method,
        paidAt: new Date(`${paidDate}T12:00:00`).toISOString(),
        totalSen,
        currentPaidSen: paidSen,
        createdBy: user?.id ?? null,
      })
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
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
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="paid">{t('common.date')}</Label>
              <Input
                id="paid"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{t('payments.record.method')}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(PAYMENT_METHOD_LABEL[m])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={record.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="payment-form" disabled={record.isPending}>
            {record.isPending
              ? t('payments.record.submitting')
              : t('payments.record.title')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
