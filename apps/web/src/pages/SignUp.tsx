import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { AuthCard } from '@/components/AuthCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignUp() {
  const { t } = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const signinTo = next !== '/' ? `/signin?next=${encodeURIComponent(next)}` : '/signin'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone: phone || null },
        // Carry `next` through the confirmation hop so an invite (e.g.
        // /accept-invite?token=…) survives email confirmation.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    // Enumeration protection: for an email that already has an account Supabase
    // returns a user with an EMPTY identities array and no session, instead of
    // an error. Without this the invitee is told to check an inbox that will
    // never receive anything — and "the invited person already has a Hawary
    // account" is the common case, not an edge case.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      navigate(signinTo, {
        replace: true,
        state: { notice: t('auth.signup.email_exists') },
      })
      return
    }
    if (data.session) {
      navigate(next, { replace: true })
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthCard
        title={t('auth.check_email.title')}
        subtitle={t('auth.signup.confirm.subtitle')}
      >
        <p className="bg-muted text-muted-foreground mb-4 rounded-md border p-3 text-sm">
          {t('auth.signup.confirm.body_before')}{' '}
          <strong className="text-foreground">{email}</strong>
          {t('auth.signup.confirm.body_after')}
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link to={signinTo}>{t('auth.back_to_sign_in')}</Link>
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t('auth.signup.title')} subtitle={t('auth.signup.subtitle')}>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="fullName">{t('common.full_name')}</Label>
          <Input
            id="fullName"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">{t('common.email')}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">{t('auth.field.phone_optional')}</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">{t('common.password')}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? t('common.creating') : t('auth.signup.submit')}
        </Button>
      </form>
      <div className="text-muted-foreground mt-4 text-center text-sm">
        {t('auth.signup.have_account')}{' '}
        <Link
          to={signinTo}
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          {t('auth.signin.title')}
        </Link>
      </div>
    </AuthCard>
  )
}
