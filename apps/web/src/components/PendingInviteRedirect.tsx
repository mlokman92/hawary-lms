import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { acceptInvitePath, getPendingInvite } from '@/lib/invite'
import { LANDING_PATHS } from '@/lib/landing'

/**
 * Belt-and-suspenders for the invite flow: if a signed-in user has a pending
 * invite token stashed (because the auth redirect dropped the ?next= query and
 * landed them on a landing route), send them to the canonical accept page, which
 * runs and clears it. Renders nothing. Mounted once, inside the router.
 */
export function PendingInviteRedirect() {
  const { loading, session } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading || !session) return
    if (!LANDING_PATHS.has(location.pathname)) return
    const token = getPendingInvite()
    if (token) navigate(acceptInvitePath(token), { replace: true })
  }, [loading, session, location.pathname, navigate])

  return null
}
