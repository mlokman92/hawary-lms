import { useEffect, useState, type FormEvent } from 'react'
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
import { useT } from '@/lib/i18n'
import { useLinkInstructorAccount, useLinkStudentAccount } from './api'

/**
 * Link an existing Hawary account to this record, admin-only.
 *
 * The repair path for the invitation flow: accepting an invite is otherwise the
 * only way a students/instructors row ever gets a user_id, so a wrong link, a
 * bounced email, or an unconfigured mailer would each need database access.
 */
export function LinkAccountDialog({
  academyId,
  recordId,
  kind,
  defaultEmail,
  open,
  onOpenChange,
}: {
  academyId: string | null
  recordId: string
  kind: 'student' | 'instructor'
  defaultEmail?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const linkStudent = useLinkStudentAccount(academyId)
  const linkInstructor = useLinkInstructorAccount(academyId)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setEmail(defaultEmail ?? '')
    setError(null)
  }, [open, defaultEmail])

  const busy = linkStudent.isPending || linkInstructor.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return setError(t('invite.link.error.email_required'))
    setError(null)
    try {
      if (kind === 'student') {
        await linkStudent.mutateAsync({ studentId: recordId, email: value })
      } else {
        await linkInstructor.mutateAsync({ instructorId: recordId, email: value })
      }
      onOpenChange(false)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('invite.link.error.failed'),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('invite.link.title')}</DialogTitle>
          <DialogDescription>
            {kind === 'student'
              ? t('invite.link.description.student')
              : t('invite.link.description.instructor')}
          </DialogDescription>
        </DialogHeader>

        <form id="link-account" className="grid gap-2" onSubmit={onSubmit}>
          <Label htmlFor="link-email">{t('invite.link.email_label')}</Label>
          <Input
            id="link-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('invite.link.email_placeholder')}
          />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="link-account" disabled={busy}>
            {busy ? t('invite.link.linking') : t('invite.link.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
