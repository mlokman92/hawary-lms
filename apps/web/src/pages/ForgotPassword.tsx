import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { AuthCard } from '@/components/AuthCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
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
      <AuthCard title="Check your email" subtitle="Password reset">
        <p className="bg-muted text-muted-foreground mb-4 rounded-md border p-3 text-sm">
          If an account exists for{' '}
          <strong className="text-foreground">{email}</strong>, a reset link is
          on its way.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link to="/signin">Back to sign in</Link>
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Reset password" subtitle="We'll email you a link">
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
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
          {busy ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <div className="mt-4 text-center text-sm">
        <Link
          to="/signin"
          className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  )
}
