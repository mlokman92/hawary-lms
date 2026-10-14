import { useEffect, useState, type FormEvent } from 'react'
import { Download } from 'lucide-react'
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
import { todayInMalaysia } from '@/features/kwsp-letter/letter'

/**
 * Download KWSP letters signed on a day the admin picks, rather than today.
 * Opens on today every time; the day is not stored. See docs/documents.md.
 */
export function KwspDateDialog({
  open,
  onOpenChange,
  onDownload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Draws and saves the letters; reports its own failure. */
  onDownload: (date: string) => Promise<void>
}) {
  const { t } = useT()
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setDate(todayInMalaysia())
  }, [open])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!date) return
    setBusy(true)
    try {
      await onDownload(date)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t('sdoc.kwsp.title')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="kwsp-date">{t('sdoc.kwsp.letter_date')}</Label>
            <Input
              id="kwsp-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !date}>
              <Download /> {t('common.download')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
