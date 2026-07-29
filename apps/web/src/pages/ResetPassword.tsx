import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { recoveryLink } from '@/lib/recoveryLink'
import { useNoReferrer } from '@/lib/useNoReferrer'
import { translate, useT } from '@/lib/i18n'
import { AuthCard } from '@/components/AuthCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MIN_PASSWORD_LENGTH = 8

/**
 * Landing page for the password-reset email. By the time we render, the
 * Supabase client has normally already turned the link's tokens into a session
 * (see `lib/recoveryLink`), so "has a session" is what gates the form — the one
 * link shape we still have to redeem ourselves is `?token_hash=…`.
 */
export function ResetPassword() {
  // The recovery token rides in the URL — keep it out of the Referer header.
  useNoReferrer()
  const { t } = useT()
  const navigate = useNavigate()
  const { loading, session } = useAuth()

  const badLink = Boolean(recoveryLink.errorCode)
  const [redeeming, setRedeeming] = useState(
    Boolean(recoveryLink.tokenHash) && !badLink,
  )
  const [linkError, setLinkError] = useState<string | null>(
    badLink
      ? (recoveryLink.errorDescription ?? t('auth.reset.link_expired'))
      : null,
  )
  const redeemed = useRef(false)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const tokenHash = recoveryLink.tokenHash
    if (!tokenHash || badLink || redeemed.current) return
    redeemed.current = true
    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      .then(({ error }) => {
        if (error) setLinkError(error.message)
      })
      // Not `t`: this runs from a promise callback outside the render pass, and
      // adding `t` to the effect deps would re-run it on a language change.
      .catch(() => setLinkError(translate('auth.reset.link_unverified')))
      .finally(() => setRedeeming(false))
  }, [badLink])

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const mismatch = confirm.length > 0 && password !== confirm

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError(t('auth.reset.mismatch'))
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
  }

  if (loading || redeeming) {
    return (
      <div className="text-muted-foreground grid min-h-svh place-items-center text-sm">
        {t('auth.reset.checking')}
      </div>
    )
  }

  if (done) {
    return (
      <AuthCard
        title={t('auth.reset.done.title')}
        subtitle={t('auth.reset.done.subtitle')}
      >
        <p className="bg-muted text-muted-foreground mb-4 rounded-md border p-3 text-sm">
          {t('auth.reset.done.body')}
        </p>
        <Button
          className="w-full"
          onClick={() => navigate('/', { replace: true })}
        >
          {t('common.continue')}
        </Button>
      </AuthCard>
    )
  }

  // No session means the link never produced one: expired, already used, or the
  // page was opened directly. Either way the fix is a fresh link.
  if (linkError || !session) {
    return (
      <AuthCard
        title={t('auth.reset.invalid.title')}
        subtitle={t('auth.password_reset')}
      >
        <p className="text-muted-foreground text-sm">
          {linkError ?? t('auth.reset.invalid.body')}
        </p>
        <Button asChild className="mt-4 w-full">
          <Link to="/forgot">{t('auth.reset.request_new')}</Link>
        </Button>
        <div className="mt-4 text-center text-sm">
          <Link
            to="/signin"
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            {t('auth.back_to_sign_in')}
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t('auth.reset.title')} subtitle={session.user.email}>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="password">{t('auth.reset.new_password')}</Label>
          <div className="relative">
            <Input
              id="password"
              type={reveal ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              required
              minLength={MIN_PASSWORD_LENGTH}
              className="pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={
                reveal
                  ? t('auth.reset.hide_password')
                  : t('auth.reset.show_password')
              }
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 grid w-10 place-items-center"
            >
              {reveal ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          <p className="text-muted-foreground text-xs">
            {t('auth.reset.min_length', { count: MIN_PASSWORD_LENGTH })}
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirm">{t('auth.reset.confirm_password')}</Label>
          <Input
            id="confirm"
            type={reveal ? 'text' : 'password'}
            autoComplete="new-password"
            required
            aria-invalid={mismatch}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch ? (
            <p className="text-destructive text-xs">
              {t('auth.reset.mismatch')}
            </p>
          ) : null}
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button
          type="submit"
          className="w-full"
          disabled={busy || tooShort || mismatch || !password || !confirm}
        >
          {busy ? t('common.saving') : t('auth.reset.submit')}
        </Button>
      </form>
    </AuthCard>
  )
}
