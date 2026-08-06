import { Navigate } from 'react-router-dom'
import { useAcademy } from '@/lib/academy'
import { FullPageLoading } from '@/components/patterns/QueryState'
import { acceptInvitePath, getPendingInvite } from '@/lib/invite'
import { enrollPath, getEnrollIntent } from '@/lib/enrollIntent'
import { LearnLayout } from '@/components/learn/LearnLayout'
import { StudentAcademyProvider } from '@/lib/studentAcademy'

/**
 * The learner tree's gate. The chrome itself now comes from the same
 * SidebarShell the back-office uses (via LearnLayout); what stays here is the
 * auth contract, which mirrors AppShell's gate exactly so the two trees can
 * never bounce a user back and forth.
 */
export function StudentShell() {
  const { loading, staffMemberships, studentMemberships } = useAcademy()

  if (loading) {
    return <FullPageLoading />
  }
  // Staff belong in the back-office; mirror AppShell's gate exactly.
  if (staffMemberships.length > 0) return <Navigate to="/" replace />
  if (studentMemberships.length === 0) {
    const pending = getPendingInvite()
    if (pending) return <Navigate to={acceptInvitePath(pending)} replace />
    const joining = getEnrollIntent()
    if (joining) return <Navigate to={enrollPath(joining)} replace />
    return <Navigate to="/onboarding" replace />
  }

  return (
    <StudentAcademyProvider>
      <LearnLayout />
    </StudentAcademyProvider>
  )
}
