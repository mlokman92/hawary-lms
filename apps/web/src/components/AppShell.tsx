import { Navigate, Outlet } from 'react-router-dom'
import { useAcademy } from '@/lib/academy'
import { AppLayout } from './AppLayout'

/** Authenticated area: require an academy (else onboarding), then render the shell. */
export function AppShell() {
  const { loading, memberships } = useAcademy()

  if (loading) {
    return (
      <div className="text-muted-foreground grid min-h-svh place-items-center text-sm">
        Loading…
      </div>
    )
  }
  if (memberships.length === 0) return <Navigate to="/onboarding" replace />

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
