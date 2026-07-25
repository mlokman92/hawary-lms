import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="text-muted-foreground grid min-h-svh place-items-center text-sm">
        Loading…
      </div>
    )
  }
  if (!session) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
