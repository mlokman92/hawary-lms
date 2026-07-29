import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { FullPageLoading } from '@/components/patterns/QueryState'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <FullPageLoading />
  }
  if (!session) {
    // SignIn reads ?next=, not router state, and a deep link into /learn can
    // carry query/hash — pass the whole location or it is silently dropped and
    // the user lands on the generic home page after signing in.
    const target = `${location.pathname}${location.search}${location.hash}`
    return (
      <Navigate to={`/signin?next=${encodeURIComponent(target)}`} replace />
    )
  }
  return <>{children}</>
}
