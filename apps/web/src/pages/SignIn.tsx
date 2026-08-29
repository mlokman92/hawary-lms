import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { AuthCard } from '@/components/AuthCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * What another page sent us here to say. /signup bounces an address that
 * already has an account to this page (Supabase answers a duplicate signup
 * with an empty `identities` array rather than an error, so there is nothing
 * to show on the signup form itself) — and until this was read, that bounce
 * was silent: you pressed "Create account" and simply found yourself on "Sign
 * in", with no reason given and the email you had just typed thrown away.
 */
type SignInNotice = { notice?: string; email?: string }

export function SignIn() {
  const { t } = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const signupTo = next !== '/' ? `/signup?next=${encodeURIComponent(next)}` : '/signup'
  const sentUs = (location.state ?? null) as SignInNotice | null
  const notice = sentUs?.notice ?? null
  const [email, setEmail] = useState(sentUs?.email ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(next, { replace: true })
  }

  return (
    <AuthCard title={t('auth.signin.title')} subtitle={t('auth.signin.subtitle')}>
      {notice ? (
        <p className="bg-muted text-muted-foreground mb-4 rounded-md border p-3 text-sm">
          {notice}
        </p>
      ) : null}
      <form className="grid gap-4" onSubmit={onSubmit}>
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
          <Label htmlFor="password">{t('common.password')}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? t('auth.signin.busy') : t('auth.signin.title')}
        </Button>
      </form>
      <div className="mt-4 grid gap-2 text-center text-sm">
        <Link
          to="/forgot"
          className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          {t('auth.signin.forgot')}
        </Link>
        <span className="text-muted-foreground">
          {t('auth.signin.new_here')}{' '}
          <Link
            to={signupTo}
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            {t('auth.signin.create_account')}
          </Link>
        </span>
      </div>
    </AuthCard>
  )
}
