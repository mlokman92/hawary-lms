import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { AuthCard } from '@/components/AuthCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ForgotPassword() {
  const { t } = useT()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Land on the page that actually sets a new password — /auth/callback
      // would just sign them in and drop them on the dashboard.
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthCard
        title={t('auth.check_email.title')}
        subtitle={t('auth.password_reset')}
      >
        <p className="bg-muted text-muted-foreground mb-4 rounded-md border p-3 text-sm">
          {t('auth.forgot.sent.body_before')}{' '}
          <strong className="text-foreground">{email}</strong>
          {t('auth.forgot.sent.body_after')}
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link to="/signin">{t('auth.back_to_sign_in')}</Link>
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')}>
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
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? t('common.sending') : t('auth.forgot.submit')}
        </Button>
      </form>
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
