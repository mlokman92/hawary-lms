import { useState, type FormEvent } from 'react'
import { Check, MoreHorizontal } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useReviewEmploymentLetter, type UploadedPdf } from './api'

/**
 * An admin's answer to one employment letter: *Accept* while it waits, and
 * behind `⋯` *Reject…* — at any time, since some letters taken as they came
 * turned out to need sending again — or *Accept* for one rejected by mistake.
 * Rejecting asks for the note the student will read; the function tells them.
 * See docs/documents.md.
 */
export function EmploymentLetterReview({
  studentId,
  studentName,
  letter,
  onError,
}: {
  studentId: string
  studentName: string
  letter: UploadedPdf
  onError: (message: string | null) => void
}) {
  const { t } = useT()
  const review = useReviewEmploymentLetter()
  const [rejecting, setRejecting] = useState(false)
  const busy = review.isPending

  function accept() {
    onError(null)
    review.mutate(
      { studentId, accept: true },
      { onError: (e) => onError(errorMessage(e, t('common.error'))) },
    )
  }

  return (
    <>
      {letter.status === 'pending' ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={accept}>
          <Check /> {t('sdoc.review.accept')}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('common.actions')}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {letter.status === 'rejected' ? (
            <DropdownMenuItem disabled={busy} onClick={accept}>
              {t('sdoc.review.accept')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            variant="destructive"
            disabled={busy}
            onClick={() => setRejecting(true)}
          >
            {t('sdoc.review.reject')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RejectDialog
        open={rejecting}
        onOpenChange={setRejecting}
        studentName={studentName}
        // A second rejection starts from what the student was told before.
        initialNote={
          letter.status === 'rejected' ? (letter.review_note ?? '') : ''
        }
        onReject={(note) =>
          review.mutateAsync({ studentId, accept: false, note }).then(() => {
            onError(null)
          })
        }
      />
    </>
  )
}

function RejectDialog({
  open,
  onOpenChange,
  studentName,
  initialNote,
  onReject,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  studentName: string
  initialNote: string
  onReject: (note: string) => Promise<void>
}) {
  const { t } = useT()
  const [note, setNote] = useState(initialNote)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function change(next: boolean) {
    if (next) {
      setNote(initialNote)
      setErr(null)
    }
    onOpenChange(next)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!note.trim()) {
      setErr(t('sdoc.review.note_required'))
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await onReject(note.trim())
      onOpenChange(false)
    } catch (e2) {
      setErr(errorMessage(e2, t('common.error')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {t('sdoc.review.reject_title', { name: studentName })}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="employment-reject-note">
              {t('sdoc.review.note')}
            </Label>
            <Textarea
              id="employment-reject-note"
              rows={4}
              maxLength={1000}
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {err ? <p className="text-destructive text-sm">{err}</p> : null}
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={busy}>
              {t('sdoc.review.reject_confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
