import { useCallback, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, Mail } from 'lucide-react'
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
import { InviteLink } from './InviteLink'
import {
  useCreateInvitation,
  useCreateStudent,
  useSendInvitation,
  type SendInvitationResult,
} from './api'
import { errorMessage } from '@/lib/errors'

export function InviteStudentDialog({
  academyId,
  open,
  onOpenChange,
}: {
  academyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const createStudent = useCreateStudent(academyId)
  const createInvitation = useCreateInvitation()
  const sendInvitation = useSendInvitation()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [send, setSend] = useState<SendInvitationResult | null>(null)
  // Reuse the student created in this submission if a later step fails and the
  // staff member retries — avoids orphaned duplicate student rows.
  const studentIdRef = useRef<string | null>(null)

  const creating = createStudent.isPending || createInvitation.isPending
  const sending = sendInvitation.isPending

  // Reset transient state when the dialog closes, so reopening never flashes the
  // previous invitee's email/link before an effect can clear it.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setEmail('')
        setError(null)
        setLink(null)
        setSend(null)
        studentIdRef.current = null
      }
      onOpenChange(next)
    },
    [onOpenChange],
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (creating || link) return // guard against double-submit
    const value = email.trim()
    if (!value) return setError(t('students.invite.email_required'))
    setError(null)
    try {
      // Reuse an already-created student on retry instead of inserting a duplicate.
      if (!studentIdRef.current) {
        const student = await createStudent.mutateAsync({ email: value })
        studentIdRef.current = student.id
      }
      const inv = await createInvitation.mutateAsync(studentIdRef.current)
      // Show the link immediately; email delivery is best-effort and must never
      // block the staff member from getting a shareable link.
      setLink(`${window.location.origin}/accept-invite?token=${inv.token}`)
      try {
        setSend(await sendInvitation.mutateAsync(inv.token))
      } catch (err) {
        setSend({
          ok: false,
          code: 'send_failed',
          message:
            errorMessage(err, t('students.invite.send_failed')),
        })
      }
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  const sent = send?.ok === true
  const note = sending
    ? t('students.invite.note_sending')
    : sent
      ? t('students.invite.note_sent')
      : t('students.invite.note_failed')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('students.invite.title')}</DialogTitle>
          <DialogDescription>
            {link
              ? t('students.invite.description_done')
              : t('students.invite.description')}
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="grid gap-3">
            <div role="status" aria-live="polite">
              {sending ? (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Mail className="size-4" /> {t('students.invite.sending')}
                </p>
              ) : sent ? (
                <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  {send?.to
                    ? t('students.invite.sent_to', { email: send.to })
                    : t('students.invite.sent')}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {send?.message ?? t('students.invite.created_not_sent')}
                </p>
              )}
            </div>
            <InviteLink url={link} note={note} />
          </div>
        ) : (
          <form id="invite-form" className="grid gap-2" onSubmit={onSubmit}>
            <Label htmlFor="invite-email">
              {t('students.invite.email_label')}
            </Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
              aria-invalid={!!error}
              aria-describedby={error ? 'invite-email-error' : undefined}
            />
            {error ? (
              <p id="invite-email-error" role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
          </form>
        )}

        <DialogFooter>
          {link ? (
            <Button type="button" onClick={() => handleOpenChange(false)}>
              {t('common.done')}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={creating}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" form="invite-form" disabled={creating}>
                {creating ? t('common.creating') : t('students.invite.submit')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
