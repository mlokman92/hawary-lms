import { useEffect, useRef, useState, type FormEvent } from 'react'
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
import { InviteLink } from '@/features/students/InviteLink'
import {
  useSendInvitation,
  type SendInvitationResult,
} from '@/features/students/api'
import { useCreateInstructor, useCreateInstructorInvitation } from './api'
import { errorMessage } from '@/lib/errors'

export function InviteInstructorDialog({
  academyId,
  open,
  onOpenChange,
}: {
  academyId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useT()
  const createInstructor = useCreateInstructor(academyId)
  const createInvitation = useCreateInstructorInvitation()
  const sendInvitation = useSendInvitation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [send, setSend] = useState<SendInvitationResult | null>(null)
  // Survives a failed invitation step so a retry reuses the record.
  const instructorIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setEmail('')
      setError(null)
      setLink(null)
      setSend(null)
      instructorIdRef.current = null
    }
  }, [open])

  const creating = createInstructor.isPending || createInvitation.isPending
  const sending = sendInvitation.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    // Double-submit guard: without it a failed create_instructor_invitation
    // leaves an orphaned instructors row behind on every retry, and the second
    // submit creates a duplicate record. instructorIdRef lets a retry reuse the
    // record that was already created.
    if (creating || link) return
    const value = email.trim()
    if (!value) return setError(t('instructors.invite_dialog.email_required'))
    setError(null)
    try {
      const instructorId =
        instructorIdRef.current ??
        (
          await createInstructor.mutateAsync({
            full_name: name.trim() || null,
            email: value,
          })
        ).id
      instructorIdRef.current = instructorId
      const inv = await createInvitation.mutateAsync(instructorId)
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
            errorMessage(err, t('instructors.invite_dialog.send_failed')),
        })
      }
    } catch (err) {
      setError(errorMessage(err, t('common.error')))
    }
  }

  const sent = send?.ok === true
  const note = sent
    ? t('instructors.invite_dialog.note_sent')
    : t('instructors.invite_dialog.note_unsent')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('instructors.invite')}</DialogTitle>
          <DialogDescription>
            {link
              ? t('instructors.invite_dialog.created')
              : t('instructors.invite_dialog.description')}
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="grid gap-3">
            {sending ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Mail className="size-4" />{' '}
                {t('instructors.invite_dialog.sending')}
              </p>
            ) : sent ? (
              <p className="text-sm flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                {send?.to
                  ? t('instructors.invite_dialog.sent_to', { email: send.to })
                  : t('instructors.invite_dialog.sent')}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                {send?.message ?? t('instructors.invite_dialog.send_error')}
              </p>
            )}
            <InviteLink url={link} note={note} />
          </div>
        ) : (
          <form id="invite-instructor-form" className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="invite-name">
                {t('instructors.invite_dialog.name_label')}
              </Label>
              <Input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('common.full_name')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-email">
                {t('instructors.invite_dialog.email_label')}
              </Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="instructor@example.com"
              />
            </div>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </form>
        )}

        <DialogFooter>
          {link ? (
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={sending}
            >
              {t('common.done')}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={creating}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                form="invite-instructor-form"
                disabled={creating}
              >
                {creating
                  ? t('common.creating')
                  : t('instructors.invite_dialog.submit')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
