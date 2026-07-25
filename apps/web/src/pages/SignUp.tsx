import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { AuthCard } from '@/components/AuthCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignUp() {
  const navigate = useNavigate()
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
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    if (data.session) {
      navigate('/', { replace: true })
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" subtitle="One more step">
        <p className="bg-muted text-muted-foreground mb-4 rounded-md border p-3 text-sm">
          We sent a confirmation link to{' '}
          <strong className="text-foreground">{email}</strong>. Click it to
          activate your account, then sign in.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link to="/signin">Back to sign in</Link>
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Create your account" subtitle="Start with Hawary LMS">
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
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
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
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
          {busy ? 'Creating…' : 'Create account'}
        </Button>
      </form>
      <div className="text-muted-foreground mt-4 text-center text-sm">
        Already have an account?{' '}
        <Link
          to="/signin"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </div>
    </AuthCard>
  )
}
