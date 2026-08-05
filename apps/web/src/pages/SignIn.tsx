import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { readEnrollDraftValues } from '@/lib/enrollDraft'
import { useT } from '@/lib/i18n'
import { AuthCard } from '@/components/AuthCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignIn() {
  const { t } = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const signupTo = next !== '/' ? `/signup?next=${encodeURIComponent(next)}` : '/signup'
  // Arriving from an enrollment form, which already asked for the address.
  // Guarded on `next` so an unrelated sign-in never inherits a stale draft.
  const seed = useMemo(
    () => (next.startsWith('/enroll/') ? readEnrollDraftValues() : null),
    [next],
  )
  const [email, setEmail] = useState(seed?.email ?? '')
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
