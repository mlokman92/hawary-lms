import { Navigate, Outlet } from 'react-router-dom'
import { useAcademy } from '@/lib/academy'
import { FullPageLoading } from '@/components/patterns/QueryState'
import { acceptInvitePath, getPendingInvite } from '@/lib/invite'
import { enrollPath, getEnrollIntent } from '@/lib/enrollIntent'
import { AppLayout } from './AppLayout'

/**
 * Authenticated back-office. Routing is role-aware:
 *   - staff (admin/trainer) membership  → render the back-office
 *   - student-only membership           → /learn (the learner tree)
 *   - no membership at all               → /onboarding (pending invitations,
 *                                          or "no record of you")
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
    // finish accepting.
    const pending = getPendingInvite()
    if (pending) return <Navigate to={acceptInvitePath(pending)} replace />
    // Likewise someone who came to join via the enrol link.
    const joining = getEnrollIntent()
    if (joining) return <Navigate to={enrollPath(joining)} replace />
    return <Navigate to="/onboarding" replace />
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
