import { useEffect, useState, type FormEvent } from 'react'
import { formatMYR } from '@hawary/shared'
import { errorMessage } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useUpdatePaymentNote } from './api'

/** The ledger row being annotated — whatever identifies it to the reader. */
export type NoteTarget = {
  id: string
  invoiceId: string | null
  invoiceNo: string | null
  amountSen: number
  /** Payment date, falling back to the recorded one as the table does. */
  date: string
  note: string | null
}

/**
 * Edit the note on one payment.
 *
 * A dialog rather than an editable cell: a note is a sentence — a cheque
 * number, who handed the money over, why the amount is short — and a sentence
 * typed into a table cell either wraps the row open or gets clipped to a width
 * nobody can write in. The row the dialog was opened from is named in the
 * description, because the overlay covers it.
 *
 * Reuses `payments.record.note_placeholder`: this is the same field as the one
 * on `RecordPaymentDialog`, and the two must not suggest different vocabulary
 * for the same column.
 */
export function EditPaymentNoteDialog({
  academyId,
  target,
  onOpenChange,
}: {
  academyId: string
  /** Null closes it. Holding the row here is what keeps the dialog stateless. */
  target: NoteTarget | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const save = useUpdatePaymentNote(academyId)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Keyed on the row, not on `open`: clicking a second note while the first is
  // still on screen must load the second row's text, not keep the first's.
  useEffect(() => {
    if (!target) return
    setNote(target.note ?? '')
    setError(null)
  }, [target])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!target) return
    setError(null)
    try {
      await save.mutateAsync({
        id: target.id,
        invoiceId: target.invoiceId,
        note,
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
          <DialogTitle>{t('payments.log.note_edit')}</DialogTitle>
          <DialogDescription>
            {target
              ? [formatMYR(target.amountSen), target.invoiceNo, fmtDate(target.date)]
                  // Codes, money and a date — data, not copy, so joining them
                  // is not the sentence-fragment concatenation i18n forbids.
                  .filter(Boolean)
                  .join(' · ')
              : null}
          </DialogDescription>
        </DialogHeader>
        <form id="payment-note-form" className="grid gap-2" onSubmit={onSubmit}>
          <Label htmlFor="payment-note-edit" className="sr-only">
            {t('payments.log.note')}
          </Label>
          <Textarea
            id="payment-note-edit"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('payments.record.note_placeholder')}
          />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
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
            form="payment-note-form"
            disabled={save.isPending || (target?.note ?? '') === note.trim()}
          >
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
