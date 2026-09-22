import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { useAuth } from '@/lib/auth'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { supportWhatsApp } from '@/lib/support'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  useAcceptPendingInvitation,
  useMyPendingInvitations,
  type PendingInvite,
} from './api'
import { isAuthError } from '@/lib/errors'

/**
 * Academies waiting for the signed-in person.
 *
 * This is the invitee's half of the invitation story, and the reason a student
 * no longer lands on "Create your academy" with nowhere to go: a record
 * carrying their confirmed email IS the invitation, so there is something to
 * show the moment staff typed (or imported) them, with no link to chase.
 *
 * Renders nothing when there is nothing pending, so it can sit unconditionally
 * on a page that usually has no invitations to show.
 */
export function PendingInviteList({
  onAccepted,
  className,
}: {
  /** Called after a successful claim, once memberships have been refetched. */
  onAccepted?: (academyId: string) => void
  className?: string
}) {
  const { t } = useT()
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { refresh } = useAcademy()
  const { data, isLoading } = useMyPendingInvitations()
  const accept = useAcceptPendingInvitation()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const invites = data ?? []
  if (isLoading || invites.length === 0) return null

  async function join(invite: PendingInvite) {
    setBusyId(invite.record_id)
    setFailed(false)
    try {
      await accept.mutateAsync(invite)
      // Memberships gate every route; refresh before handing control back or
      // the caller navigates into a shell that still thinks it has no academy.
      await refresh()
      onAccepted?.(invite.academy_id)
    } catch (e) {
      // A dead token cannot be retried into life, and the list on screen was
      // fetched with it — so pressing Join again is the one thing that cannot
      // work, and is exactly what someone shown an error does. Send them to
      // sign in, saying why.
      if (isAuthError(e)) {
        await signOut()
        navigate('/signin', {
          replace: true,
          state: { notice: t('auth.session_expired') },
        })
        return
      }
      // Never the server's own words. `permission denied for function
      // accept_pending_invitation` is what a student was actually shown; it
      // names an internal function, offers nothing to do, and reads as a
      // broken product. The reason belongs in the console, where somebody who
      // can act on it will look.
      console.error('accept_pending_invitation failed', e)
      setFailed(true)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t('invite.waiting.title')}</CardTitle>
        <CardDescription>{t('invite.waiting.description')}</CardDescription>
      </CardHeader>
      <ul className="divide-y border-t">
        {invites.map((invite) => (
          <li
            key={`${invite.kind}:${invite.record_id}`}
            className="flex items-center gap-3 px-6 py-3"
          >
            <Avatar className="size-9 rounded-md">
              <AvatarImage
                src={invite.academy_logo_url ?? undefined}
                alt=""
                className="object-contain"
              />
              <AvatarFallback className="rounded-md">
                <Building2 className="text-muted-foreground size-4" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {invite.academy_name}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {t('invite.waiting.added', { date: fmtDate(invite.invited_at) })}
              </p>
            </div>
            <Badge variant="secondary">
              {invite.role === 'trainer'
                ? t('invite.waiting.role_trainer')
                : t('invite.waiting.role_student')}
            </Badge>
            <Button
              size="sm"
              disabled={busyId !== null}
              onClick={() => void join(invite)}
            >
              {busyId === invite.record_id
                ? t('invite.waiting.joining')
                : t('invite.waiting.join')}
            </Button>
          </li>
        ))}
      </ul>
      {failed ? (
        <p className="text-destructive px-6 pb-1 text-sm">
          {t('invite.waiting.error')}{' '}
          <a
            href={supportWhatsApp()}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            {t('common.help_whatsapp')}
          </a>
        </p>
      ) : null}
    </Card>
  )
}
