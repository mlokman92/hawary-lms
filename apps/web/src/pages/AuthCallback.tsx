import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/**
 * Landing route for email confirmation / password-reset links. The Supabase
 * client (detectSessionInUrl) parses the tokens from the URL on load; once the
 * auth state resolves we bounce the user into the app.
 */
export function AuthCallback() {
  const { loading, session } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    navigate(session ? '/' : '/signin', { replace: true })
  }, [loading, session, navigate])

  return <div className="center muted">Signing you in…</div>
}
