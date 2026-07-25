import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { AuthCard } from '@/components/AuthCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignIn() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
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
    navigate('/', { replace: true })
  }

  return (
    <AuthCard title="Sign in" subtitle="Welcome back to Hawary LMS">
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
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
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
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <div className="mt-4 grid gap-2 text-center text-sm">
        <Link
          to="/forgot"
          className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
        <span className="text-muted-foreground">
          New here?{' '}
          <Link
            to="/signup"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </span>
      </div>
    </AuthCard>
  )
}
