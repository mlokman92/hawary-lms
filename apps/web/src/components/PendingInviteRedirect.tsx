import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAcademy } from '@/lib/academy'
import { useAuth } from '@/lib/auth'
import { enrollPath, getEnrollIntent } from '@/lib/enrollIntent'
import { acceptInvitePath, getPendingInvite } from '@/lib/invite'
import { LANDING_PATHS } from '@/lib/landing'

/**
 * Belt-and-suspenders for the two flows that cross the auth hop: a stashed
 * invite token, and a stashed academy-join intent. Either means the person was
 * on their way somewhere specific when the redirect dropped the `?next=` query
 * and dumped them on a landing route — most often "create your academy", which
 * is the opposite of what they were doing.
 *
 * Renders nothing. Mounted once, inside the router.
 */
export function PendingInviteRedirect() {
  const { loading, session } = useAuth()
  const { loading: academyLoading, memberships } = useAcademy()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading || !session) return
    if (!LANDING_PATHS.has(location.pathname)) return
    // Only while they still have nowhere to be. Someone who already belongs
    // somewhere is not mid-join, and yanking them off /learn would be a loop.
    // This guard covers the token too: an academy admin who had opened an
    // invite link meant for somebody else was sent to /accept-invite from every
    // landing route — including the one a finished password reset ends on — and
    // could not get back into their own academy. A person who is genuinely
    // mid-join has no membership yet, and an invite link that still carries its
    // ?token= reaches the page without any help from here.
    if (academyLoading || memberships.length > 0) return
    const token = getPendingInvite()
    if (token) {
      navigate(acceptInvitePath(token), { replace: true })
      return
    }
    const slug = getEnrollIntent()
    if (slug) navigate(enrollPath(slug), { replace: true })
  }, [
    loading,
    session,
    academyLoading,
    memberships.length,
    location.pathname,
    navigate,
  ])

  return null
}
