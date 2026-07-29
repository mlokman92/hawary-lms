import { useState } from 'react'
import { Mail, MoreHorizontal } from 'lucide-react'
import { acceptInvitePath } from '@/lib/invite'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useSendInvitation } from '@/features/students/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InviteLink } from '@/features/students/InviteLink'
import {
  useInvitations,
  useResendInvitation,
  useRevokeInvitation,
} from './api'

/**
 * Pending invitations for one subject kind. Without this the only way to fix a
 * bounced or mistaken invite was a SQL console — create_invitation rotates the
 * token, so re-inviting silently breaks a link already sitting in an inbox.
 */
export function PendingInvitations({
  academyId,
  kind,
}: {
  academyId: string | null
  kind: 'student' | 'instructor'
}) {
  const { t } = useT()
  const { data, isLoading } = useInvitations(academyId)
  const revoke = useRevokeInvitation(academyId)
  const resend = useResendInvitation(academyId)
  const sendEmail = useSendInvitation()
  const [link, setLink] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const rows = (data ?? []).filter((i) =>
    kind === 'student' ? i.student_id !== null : i.instructor_id !== null,
  )

  if (isLoading || rows.length === 0) return null

  async function onResend(id: string) {
    setErr(null)
    setLink(null)
    try {
      const { token } = await resend.mutateAsync(id)
      // Email is best-effort: without a provider key the link is still usable.
      try {
        await sendEmail.mutateAsync(token)
      } catch {
        /* fall through to the copyable link */
      }
      setLink(`${window.location.origin}${acceptInvitePath(token)}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('invite.error.resend'))
    }
  }

  return (
    <Card className="mt-6 gap-3">
      <CardHeader>
        <CardTitle className="text-base">
          {t('invite.pending.title')}{' '}
          <span className="text-muted-foreground font-normal tabular-nums">
            ({rows.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y rounded-lg border">
          {rows.map((i) => {
            const expired =
              i.status === 'expired' || new Date(i.expires_at) < new Date()
            const who =
              i.students?.full_name ?? i.instructors?.full_name ?? i.email
            return (
              <li key={i.id} className="flex items-center gap-2 px-3 py-2">
                <Mail className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{who}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {expired
                      ? t('invite.row.expired', { email: i.email })
                      : t('invite.row.expires', {
                          email: i.email,
                          date: fmtDate(i.expires_at),
                        })}
                  </p>
                </div>
                <Badge variant={expired ? 'outline' : 'secondary'}>
                  {expired ? t('invite.status.expired') : t('invite.status.pending')}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="shrink-0">
                      <MoreHorizontal />
                      <span className="sr-only">{t('invite.actions')}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={resend.isPending}
                      onClick={() => void onResend(i.id)}
                    >
                      {t('invite.action.resend')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={i.status !== 'pending' || revoke.isPending}
                      onClick={() => revoke.mutate(i.id)}
                    >
                      {t('invite.action.revoke')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )
          })}
        </ul>
        {err ? <p className="text-destructive text-sm">{err}</p> : null}
        {link ? <InviteLink url={link} /> : null}
      </CardContent>
    </Card>
  )
}
