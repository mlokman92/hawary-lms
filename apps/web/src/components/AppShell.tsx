import { Navigate, Outlet } from 'react-router-dom'
import { useAcademy } from '@/lib/academy'
import { FullPageLoading } from '@/components/patterns/QueryState'
import { acceptInvitePath, getPendingInvite } from '@/lib/invite'
import { AppLayout } from './AppLayout'

/**
 * Authenticated back-office. Routing is role-aware:
 *   - staff (admin/trainer) membership  → render the back-office
 *   - student-only membership           → /learn (the learner tree)
 *   - no membership at all               → /onboarding (genuine founder)
 *
 * StudentShell mirrors this gate exactly; keep the two in step or the trees
 * will bounce a user between them.
 */
export function AppShell() {
  const { loading, staffMemberships, studentMemberships } = useAcademy()

  if (loading) {
    return <FullPageLoading />
  }
  if (staffMemberships.length === 0) {
    if (studentMemberships.length > 0) return <Navigate to="/learn" replace />
    // A mid-accept invitee (token stashed, membership not created yet) must go
    // finish accepting — never flash "Create your academy".
    const pending = getPendingInvite()
    if (pending) return <Navigate to={acceptInvitePath(pending)} replace />
    return <Navigate to="/onboarding" replace />
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
