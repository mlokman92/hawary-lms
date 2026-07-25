import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useAcademy } from '@/lib/academy'
import { acceptInvitation } from '@/features/students/api'
import { AuthCard } from '@/components/AuthCard'
import { Button } from '@/components/ui/button'

export function AcceptInvitePage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { session, loading } = useAuth()
  const { refresh } = useAcademy()
  const navigate = useNavigate()
  const ran = useRef(false)
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>(
    'idle',
  )
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (loading || !session || !token || ran.current) return
    ran.current = true
    setStatus('working')
    acceptInvitation(token)
      .then(async () => {
        await refresh()
        setStatus('done')
      })
      .catch((e: unknown) => {
        setMessage(
          e instanceof Error ? e.message : 'Could not accept the invitation.',
        )
        setStatus('error')
      })
  }, [loading, session, token, refresh])

  const next = `/accept-invite?token=${encodeURIComponent(token)}`

  if (!token) {
    return (
      <AuthCard title="Invalid link" subtitle="Accept invitation">
        <p className="text-muted-foreground text-sm">
          This invitation link is missing its token.
        </p>
      </AuthCard>
    )
  }
  if (loading) {
    return (
      <div className="text-muted-foreground grid min-h-svh place-items-center text-sm">
        Loading…
      </div>
    )
  }
  if (!session) {
    return (
      <AuthCard
        title="Accept your invitation"
        subtitle="You need an account first"
      >
        <div className="grid gap-2">
          <Button asChild className="w-full">
            <Link to={`/signup?next=${encodeURIComponent(next)}`}>
              Create account
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to={`/signin?next=${encodeURIComponent(next)}`}>Sign in</Link>
          </Button>
          <p className="text-muted-foreground mt-1 text-xs">
            Use the email address your academy invited.
          </p>
        </div>
      </AuthCard>
    )
  }
  if (status === 'idle' || status === 'working') {
    return (
      <div className="text-muted-foreground grid min-h-svh place-items-center text-sm">
        Joining…
      </div>
    )
  }
  if (status === 'error') {
    return (
      <AuthCard title="Couldn’t accept" subtitle="Invitation">
        <p className="text-destructive text-sm">{message}</p>
        <Button asChild variant="outline" className="mt-4 w-full">
          <Link to="/">Go to app</Link>
        </Button>
      </AuthCard>
    )
  }
  return (
    <AuthCard title="You’re in!" subtitle="Invitation accepted">
      <p className="text-muted-foreground text-sm">
        Your account is now linked to the academy.
      </p>
      <Button
        className="mt-4 w-full"
        onClick={() => navigate('/', { replace: true })}
      >
        Continue
      </Button>
    </AuthCard>
  )
}
