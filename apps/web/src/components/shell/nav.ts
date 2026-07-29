import type { LucideIcon } from 'lucide-react'

export type NavItem = {
  title: string
  to: string
  icon: LucideIcon
  /** Match the path exactly. Needed for index routes like '/' and '/learn'. */
  exact?: boolean
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
