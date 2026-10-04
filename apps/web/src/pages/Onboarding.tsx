import { Navigate, useNavigate } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useAcademy } from '@/lib/academy'
import { useT } from '@/lib/i18n'
import { useLandingTarget } from '@/lib/landing'
import { SUPPORT_WHATSAPP_URL } from '@/lib/support'
import {
  ErrorBlock,
  FullPageLoading,
} from '@/components/patterns/QueryState'
import { PendingInviteList } from '@/features/invitations/PendingInviteList'
import { useMyPendingInvitations } from '@/features/invitations/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/**
 * Where a signed-in account with no membership lands: their pending
 * invitations, if any, and otherwise *we have no record of you at this
 * address* — with the address shown, since an invited student who signed up
 * with a different email from the one the academy typed is almost always who
 * reaches this page. `my_pending_invitations` matches on the confirmed auth
 * email. Branches are opened by the owner; nothing is founded here.
 */
export function Onboarding() {
  const { t } = useT()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { staffMemberships, studentMemberships, loading } = useAcademy()
  const {
    data: invites,
    isLoading: invitesLoading,
    error: invitesError,
  } = useMyPendingInvitations()
  const landing = useLandingTarget()

  // Wait for the answer rather than flashing "no record of you" at someone who
  // is about to be told they have been invited — or who already belongs
  // somewhere and is about to be sent back to it.
  if (loading || invitesLoading) return <FullPageLoading />

  if (staffMemberships.length > 0 || studentMemberships.length > 0) {
    return <Navigate to={landing} replace />
  }

  const hasInvites = (invites ?? []).length > 0

  return (
    <div className="bg-muted flex min-h-svh items-center justify-center p-6">
      <div className="grid w-full max-w-lg gap-4">
        <PendingInviteList
          onAccepted={() => navigate('/', { replace: true })}
        />

        {/* A failed lookup is not an answer: saying "no record of you" here
            would be false. */}
        {invitesError ? (
          <ErrorBlock error={invitesError} className="bg-card" />
        ) : !hasInvites ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                {t('auth.onboarding.none.title')}
              </CardTitle>
              <CardDescription>
                {t('auth.onboarding.none.body_before')}{' '}
                <strong className="text-foreground font-medium">
                  {user?.email}
                </strong>
                {t('auth.onboarding.none.body_after')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* The same escape hatch AcceptInvitePage offers, for the same
                  reason: signed in as the wrong person is a state you have to
                  be able to leave. */}
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  await signOut()
                  navigate('/signin', { replace: true })
                }}
              >
                {t('auth.onboarding.none.other_email')}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 text-sm underline underline-offset-4"
        >
          <MessageCircle className="size-4" />
          {t('common.help_whatsapp')}
        </a>
      </div>
    </div>
  )
}
