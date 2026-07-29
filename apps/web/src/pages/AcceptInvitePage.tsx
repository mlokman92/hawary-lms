import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useAcademy } from '@/lib/academy'
import { acceptInvitation } from '@/features/students/api'
import {
  clearPendingInvite,
  getPendingInvite,
  isTerminalInviteError,
  setPendingInvite,
} from '@/lib/invite'
import { useNoReferrer } from '@/lib/useNoReferrer'
import { useLandingTarget } from '@/lib/landing'
import { translate, useT } from '@/lib/i18n'
import { AuthCard } from '@/components/AuthCard'
import { Button } from '@/components/ui/button'

export function AcceptInvitePage() {
  const { t } = useT()
  const [params] = useSearchParams()
  // Fall back to the persisted token if the URL lost it across the auth hop.
  const token = params.get('token') ?? getPendingInvite() ?? ''
  const { session, loading, signOut } = useAuth()
  const { refresh } = useAcademy()
  const landing = useLandingTarget()
  const navigate = useNavigate()
  const ran = useRef(false)
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>(
    'idle',
  )
  const [message, setMessage] = useState('')
  const [retryable, setRetryable] = useState(false)

  // The token in the URL is a bearer credential that grants academy membership
  // (trainer-level for an instructor invite). Keep it out of the Referer header.
  useNoReferrer()

  // ...and out of the address bar / history once it is safely in state.
  useEffect(() => {
    if (!params.get('token')) return
    setPendingInvite(token)
    window.history.replaceState(null, '', '/accept-invite')
  }, [params, token])

  useEffect(() => {
    if (loading || !session || !token || ran.current) return
    ran.current = true
    setStatus('working')
    acceptInvitation(token)
      .then(async () => {
        clearPendingInvite()
        await refresh()
        setStatus('done')
      })
      .catch((e: unknown) => {
        // `translate`, not `t`: this runs from a promise callback, and adding
        // `t` to the effect deps could re-fire acceptance on a language change.
        const msg =
          e instanceof Error ? e.message : translate('auth.invite.error.generic')
        // Clear the stashed token ONLY when the invite is genuinely dead. A
        // network blip must stay retryable, or the bridge is destroyed for good.
        const terminal = isTerminalInviteError(msg)
        if (terminal) clearPendingInvite()
        else ran.current = false
        setRetryable(!terminal)
        setMessage(msg)
        setStatus('error')
      })
  }, [loading, session, token, refresh])

  const next = `/accept-invite?token=${encodeURIComponent(token)}`

  if (!token) {
    return (
      <AuthCard
        title={t('auth.invite.invalid.title')}
        subtitle={t('auth.invite.subtitle')}
      >
        <p className="text-muted-foreground text-sm">
          {t('auth.invite.missing_token')}
        </p>
      </AuthCard>
    )
  }
  if (loading) {
    return (
      <div className="text-muted-foreground grid min-h-svh place-items-center text-sm">
        {t('common.loading')}
      </div>
    )
  }
  if (!session) {
    return (
      <AuthCard
        title={t('auth.invite.title')}
        subtitle={t('auth.invite.join_subtitle')}
      >
        <div className="grid gap-2">
          <Button asChild className="w-full">
            <Link
              to={`/signup?next=${encodeURIComponent(next)}`}
              onClick={() => setPendingInvite(token)}
            >
              {t('auth.signup.submit')}
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link
              to={`/signin?next=${encodeURIComponent(next)}`}
              onClick={() => setPendingInvite(token)}
            >
              {t('auth.invite.have_account')}
            </Link>
          </Button>
          <p className="text-muted-foreground mt-1 text-xs">
            {t('auth.invite.hint')}
          </p>
        </div>
      </AuthCard>
    )
  }
  if (status === 'idle' || status === 'working') {
    return (
      <div className="text-muted-foreground grid min-h-svh place-items-center text-sm">
        {t('auth.invite.joining')}
      </div>
    )
  }
  if (status === 'error') {
    return (
      <AuthCard
        title={t('auth.invite.error.title')}
        subtitle={t('auth.invite.error.subtitle')}
      >
        <p className="text-destructive text-sm">{message}</p>
        <p className="text-muted-foreground mt-2 text-xs">
          {retryable
            ? t('auth.invite.error.retryable')
            : t('auth.invite.error.terminal')}
        </p>
        {retryable ? (
          <Button
            className="mt-4 w-full"
            onClick={() => {
              setStatus('idle')
              setMessage('')
            }}
          >
            {t('common.retry')}
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="mt-2 w-full"
          onClick={async () => {
            await signOut()
            navigate(`/signin?next=${encodeURIComponent(next)}`, {
              replace: true,
            })
          }}
        >
          {t('auth.invite.other_email')}
        </Button>
      </AuthCard>
    )
  }
  return (
    <AuthCard
      title={t('auth.invite.done.title')}
      subtitle={t('auth.invite.done.subtitle')}
    >
      <p className="text-muted-foreground text-sm">
        {t('auth.invite.done.body')}
      </p>
      <Button
        className="mt-4 w-full"
        onClick={() => navigate(landing, { replace: true })}
      >
        {t('common.continue')}
      </Button>
    </AuthCard>
  )
}
