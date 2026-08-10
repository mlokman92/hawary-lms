import type { LucideIcon } from 'lucide-react'

export type NavItem = {
  title: string
  to: string
  icon: LucideIcon
  /** Match the path exactly. Needed for index routes like '/' and '/learn'. */
  exact?: boolean
  /**
   * A count worth interrupting for — work waiting on this destination. Rendered
   * only when it is above zero: a badge showing "0" is a decoration, and the
   * absence of the badge already says the same thing.
   */
  badge?: number
  /**
   * One level of sub-navigation, rendered permanently rather than behind a
   * disclosure. Assessments and assignments are destinations in their own right
   * — they were previously reachable only by opening a course and scanning its
   * modules — but they are still *of* a course, so they hang off it instead of
   * becoming top-level peers of Students and Payments.
   *
   * One level only: a nested tree in a 16rem rail is a worse index than a list.
   */
  children?: NavItem[]
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

/**
 * The one home for the active-link rule. Both shells used to implement this
 * independently (staff by `to === '/'`, learner by `to === '/learn'`); an
 * explicit `exact` flag says what those special cases actually meant.
 */
export function isNavActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.to : pathname.startsWith(item.to)
}

/**
 * A parent counts as active when it or any child matches. Without this, opening
 * /assessments would light up the sub-item while "Courses" above it went dark —
 * the highlight would say you had left the section you are standing in.
 */
export function isBranchActive(pathname: string, item: NavItem): boolean {
  return (
    isNavActive(pathname, item) ||
    (item.children ?? []).some((c) => isNavActive(pathname, c))
  )
}
