import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { recoveryLink } from '@/lib/recoveryLink'
import { useT } from '@/lib/i18n'

/**
 * Landing route for email confirmation links. The Supabase client
 * (detectSessionInUrl) parses the tokens from the URL on load; once the auth
 * state resolves we bounce the user to `next` (default "/") — preserving an
 * invite target (e.g. /accept-invite?token=…) across the confirmation hop.
 *
 * Reset emails now point straight at /reset-password, but links from before
 * that change (and any recovery link aimed here) still land on this route, so
 * send those on to the page that lets them set a new password.
 */
export function AuthCallback() {
  const { t } = useT()
  const { loading, session } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (recoveryLink.isRecovery) {
      navigate('/reset-password', { replace: true })
      return
    }
    navigate(
      session ? next : `/signin?next=${encodeURIComponent(next)}`,
      { replace: true },
    )
  }, [loading, session, next, navigate])

  return (
    <div className="text-muted-foreground grid min-h-svh place-items-center text-sm">
      {t('auth.callback.working')}
    </div>
  )
}
