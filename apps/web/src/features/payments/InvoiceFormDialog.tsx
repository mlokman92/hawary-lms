import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { formatMYR, ringgitToSen } from '@hawary/shared'
import { useAuth } from '@/lib/auth'
import { useStudents } from '@/features/students/api'
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
import { useCreateInvoice } from './api'

type ItemRow = {
  key: string
  description: string
  quantity: number
  unitPrice: string
}

const blankItem = (): ItemRow => ({
  key: crypto.randomUUID(),
  description: '',
  quantity: 1,
  unitPrice: '',
})

export function InvoiceFormDialog({
  academyId,
  open,
  onOpenChange,
  onCreated,
}: {
  academyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: string) => void
}) {
  const { user } = useAuth()
  const { data: students } = useStudents(academyId || null)
  const createInvoice = useCreateInvoice(academyId)

  const [studentId, setStudentId] = useState('')
  const [items, setItems] = useState<ItemRow[]>([blankItem()])
  const [tax, setTax] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStudentId('')
    setItems([blankItem()])
    setTax('')
    setDueDate('')
    setNotes('')
    setError(null)
  }, [open])

  const subtotalSen = useMemo(
    () =>
      items.reduce(
        (s, it) => s + it.quantity * ringgitToSen(it.unitPrice),
        0,
      ),
    [items],
  )
  const taxSen = ringgitToSen(tax)
  const totalSen = subtotalSen + taxSen

  const changeItem = (key: string, patch: Partial<ItemRow>) =>
    setItems((its) => its.map((it) => (it.key === key ? { ...it, ...patch } : it)))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!studentId) return setError('Select a student.')
    if (totalSen <= 0) return setError('Add at least one line item with an amount.')
    setError(null)
    try {
      const inv = await createInvoice.mutateAsync({
        studentId,
        dueDate,
        taxSen,
        notes,
        createdBy: user?.id ?? null,
        items: items
          .filter((it) => it.description.trim() || ringgitToSen(it.unitPrice) > 0)
          .map((it) => ({
            description: it.description.trim() || 'Item',
            quantity: it.quantity,
            unitPriceSen: ringgitToSen(it.unitPrice),
          })),
      })
      onOpenChange(false)
      onCreated(inv.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            Bill a student. The invoice number is generated automatically.
          </DialogDescription>
        </DialogHeader>

        <form id="invoice-form" className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label>Student</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a student" />
              </SelectTrigger>
              <SelectContent>
                {(students ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name || s.email || 'Unnamed'} · {s.student_no}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Line items</Label>
            <div className="grid gap-2">
              {items.map((it) => (
                <div key={it.key} className="flex items-center gap-2">
                  <Input
                    value={it.description}
                    onChange={(e) =>
                      changeItem(it.key, { description: e.target.value })
                    }
                    placeholder="Description"
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min="1"
                    value={it.quantity}
                    onChange={(e) =>
                      changeItem(it.key, {
                        quantity: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="w-16"
                    aria-label="Quantity"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={it.unitPrice}
                    onChange={(e) =>
                      changeItem(it.key, { unitPrice: e.target.value })
                    }
                    placeholder="Unit (RM)"
                    className="w-28"
                    aria-label="Unit price"
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() =>
                      setItems((its) =>
                        its.length > 1
                          ? its.filter((x) => x.key !== it.key)
                          : its,
                      )
                    }
                    aria-label="Remove item"
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="justify-self-start"
              onClick={() => setItems((its) => [...its, blankItem()])}
            >
              <Plus /> Add item
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="due">Due date (optional)</Label>
              <Input
                id="due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tax">Tax / SST (RM, optional)</Label>
              <Input
                id="tax"
                type="number"
                min="0"
                step="0.01"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="bg-muted flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Subtotal {formatMYR(subtotalSen)} · Tax {formatMYR(taxSen)}
            </span>
            <span className="font-semibold">Total {formatMYR(totalSen)}</span>
          </div>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createInvoice.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" form="invoice-form" disabled={createInvoice.isPending}>
            {createInvoice.isPending ? 'Creating…' : 'Create invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
