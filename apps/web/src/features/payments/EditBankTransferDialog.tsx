import { useEffect, useState, type FormEvent } from 'react'
import { ringgitToSen, senToRinggit } from '@hawary/shared'
import { errorMessage } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUpdateBankTransfer } from './receipts'

/** The transfer being corrected. */
export type TransferTarget = {
  id: string
  amountSen: number
  /** Payment date, falling back to the recorded one as the panels do. */
  paidAt: string
}

/** The Malaysian calendar day of an instant — the academy's zone, not the browser's. */
const MY_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Correct the amount and the date of one bank transfer.
 *
 * Only for a transfer nobody has checked: the panels do not offer it otherwise,
 * and `app.guard_payment_amount_date` refuses. A date is stored at Malaysian
 * midday, as `RecordPaymentDialog` stores it, and only when it was changed.
 */
export function EditBankTransferDialog({
  academyId,
  target,
  onOpenChange,
}: {
  academyId: string | null
  /** Null closes it. */
  target: TransferTarget | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const save = useUpdateBankTransfer(academyId)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const day = target ? MY_DAY.format(new Date(target.paidAt)) : ''

  useEffect(() => {
    if (!target) return
    setAmount(senToRinggit(target.amountSen))
    setDate(MY_DAY.format(new Date(target.paidAt)))
    setError(null)
  }, [target])

  const amountSen = ringgitToSen(amount)
  const unchanged = amountSen === target?.amountSen && date === day

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!target) return
    setError(null)
    if (amountSen <= 0) return setError(t('payments.record.error_amount'))
    try {
      await save.mutateAsync({
        paymentId: target.id,
        ...(amountSen === target.amountSen ? {} : { amountSen }),
        ...(date === day
          ? {}
          : { paidAt: new Date(`${date}T12:00:00+08:00`).toISOString() }),
      })
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payments.transfer.edit')}</DialogTitle>
        </DialogHeader>
        <form
          id="bank-transfer-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={onSubmit}
        >
          <div className="grid gap-2">
            <Label htmlFor="transfer-amount">
              {t('payments.record.amount')}
            </Label>
            <Input
              id="transfer-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="transfer-date">{t('common.date')}</Label>
            <Input
              id="transfer-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-destructive text-sm sm:col-span-2">{error}</p>
          ) : null}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="bank-transfer-form"
            disabled={save.isPending || unchanged || !date}
          >
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
