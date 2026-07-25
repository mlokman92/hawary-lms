import { useEffect, useState, type FormEvent } from 'react'
import { formatMYR, ringgitToSen, senToRinggit } from '@hawary/shared'
import { useAuth } from '@/lib/auth'
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
import { PAYMENT_METHODS, useRecordPayment, type PaymentMethod } from './api'

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
    if (amountSen <= 0) return setError('Enter an amount greater than zero.')
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
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Balance due: {formatMYR(remaining)}
          </DialogDescription>
        </DialogHeader>
        <form id="payment-form" className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount (RM)</Label>
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
              <Label htmlFor="paid">Date</Label>
              <Input
                id="paid"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
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
            Cancel
          </Button>
          <Button type="submit" form="payment-form" disabled={record.isPending}>
            {record.isPending ? 'Recording…' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
