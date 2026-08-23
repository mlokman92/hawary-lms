import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { useAcademy } from '@/lib/academy'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
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
import { errorMessage } from '@/lib/errors'

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
  const { refresh } = useAcademy()
  const { data, isLoading } = useMyPendingInvitations()
  const accept = useAcceptPendingInvitation()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const invites = data ?? []
  if (isLoading || invites.length === 0) return null

  async function join(invite: PendingInvite) {
    setBusyId(invite.record_id)
    setError(null)
    try {
      await accept.mutateAsync(invite)
      // Memberships gate every route; refresh before handing control back or
      // the caller navigates into a shell that still thinks it has no academy.
      await refresh()
      onAccepted?.(invite.academy_id)
    } catch (e) {
      setError(errorMessage(e, t('invite.waiting.error')))
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
      {error ? (
        <p className="text-destructive px-6 pb-1 text-sm">{error}</p>
      ) : null}
    </Card>
  )
}
