import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useAcademy } from '@/lib/academy'
import { acceptInvitation } from '@/features/students/api'
import {
  clearPendingInvite,
  getPendingInvite,
  isRetryableInviteError,
  setPendingInvite,
} from '@/lib/invite'
import { errorMessage } from '@/lib/errors'
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
  /**
   * One acceptance per (account, token, attempt). A ref rather than an effect
   * dependency because supabase-js re-emits the auth state on every tab focus,
   * so `session` is a fresh object identity even when nothing changed — and a
   * plain `hasRun` boolean is what made "Try again" a dead end: nothing it set
   * was in the dependency array, so the effect never fired again and the page
   * sat on "Joining…" for good.
   */
  const ranFor = useRef<string | null>(null)
  const [attempt, setAttempt] = useState(0)
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

  const userId = session?.user.id ?? null

  useEffect(() => {
    if (loading || !userId || !token) return
    const key = `${userId}:${token}:${attempt}`
    if (ranFor.current === key) return
    ranFor.current = key
    setStatus('working')
    acceptInvitation(token)
      .then(async () => {
        clearPendingInvite()
        // Awaited so the Continue button below knows where they now belong.
        // The membership row is already written by this point, so a refetch
        // that fails must not turn a completed join into an error screen and
        // send them round again.
        await refresh().catch(() => {})
        setStatus('done')
      })
      .catch((e: unknown) => {
        // Keep the token only while the server has not answered. Anything it
        // rejected has to go: a stashed token outranks every landing route
        // (PendingInviteRedirect), so one that cannot die locks the person out
        // of the app rather than out of the invitation.
        const retry = isRetryableInviteError(e)
        if (!retry) clearPendingInvite()
        setRetryable(retry)
        // `errorMessage`, not `e instanceof Error`: supabase-js returns the
        // parsed response body, a plain object, unless the call asked for
        // `.throwOnError()` — so the instanceof test was always false, and
        // every reason the database gave arrived here as the generic string.
        // `translate`, not `t`: this runs from a promise callback, and adding
        // `t` to the effect deps could re-fire acceptance on a language change.
        setMessage(errorMessage(e, translate('auth.invite.error.generic')))
        setStatus('error')
      })
  }, [loading, userId, token, attempt, refresh])

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
        {/* This branch outranks every other, so without it the card is a page
            with no way off it. */}
        <Button
          className="mt-4 w-full"
          onClick={() => navigate(landing, { replace: true })}
        >
          {t('common.continue')}
        </Button>
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
        {/*
          Only when the server said nothing. Its own reason is now on screen
          above, and guessing "you used the wrong email" underneath "This
          invitation is no longer valid" sends the person off to hunt for an
          account they do not need.
        */}
        {retryable ? (
          <p className="text-muted-foreground mt-2 text-xs">
            {t('auth.invite.error.retryable')}
          </p>
        ) : null}
        {retryable ? (
          <Button
            className="mt-4 w-full"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t('common.retry')}
          </Button>
        ) : (
          <Button
            className="mt-4 w-full"
            onClick={() => navigate(landing, { replace: true })}
          >
            {t('common.continue')}
          </Button>
        )}
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
