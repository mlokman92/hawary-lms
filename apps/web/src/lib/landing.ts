import { useAcademy } from './academy'
import { getPendingInvite, acceptInvitePath } from './invite'
import { enrollPath, getEnrollIntent } from './enrollIntent'

/**
 * Where a signed-in user belongs. One place, because this decision was
 * previously duplicated (and inverted) across AppShell, StudentLanding,
 * AcceptInvitePage and AuthCallback — a fourth copy is how you get an infinite
 * redirect loop between the staff and student trees.
 *
 *   staff membership          -> the back-office
 *   student membership only   -> the /learn tree
 *   no membership + a token   -> finish accepting the invitation
 *   no membership + an intent -> finish joining the academy they came for
 *   no membership at all      -> create an academy
 */
export function useLandingTarget(): string {
  const { staffMemberships, studentMemberships } = useAcademy()
  if (staffMemberships.length > 0) return '/'
  if (studentMemberships.length > 0) return '/learn'
  const token = getPendingInvite()
  if (token) return acceptInvitePath(token)
  const slug = getEnrollIntent()
  if (slug) return enrollPath(slug)
  return '/onboarding'
}

/**
 * Routes on which a stashed invite token or join intent may be recovered. Never
 * public pages (e.g. /pay, /enroll) or the auth/accept pages themselves, so a
 * stale one cannot hijack an unrelated navigation. Kept beside useLandingTarget
 * so a new landing route cannot be added to one without the other.
 */
export const LANDING_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/onboarding',
  '/student',
  '/learn',
])
