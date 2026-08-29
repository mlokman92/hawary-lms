import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { UserMenu } from '@/components/UserMenu'
import { cn } from '@/lib/utils'
import {
  isBranchActive,
  isNavActive,
  type NavGroup,
  type NavItem,
} from './nav'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'

/**
 * A count that wants acting on, not merely noticing — the solid fill every
 * notification badge uses.
 *
 * `text-background` rather than a fixed white: --destructive is a mid red in
 * light mode and a *lighter* red in dark, so white would drop to roughly 2.5:1
 * there. The background token inverts with the theme, which is exactly the
 * contrast this needs, in one class and no new token.
 */
const URGENT_BADGE =
  'bg-destructive text-background rounded-full text-xs font-semibold tabular-nums'

/**
 * A count that is only worth knowing. No fill — it sits in the rail at the
 * weight of the label it belongs to, so the eye finds the red one first.
 */
const NEUTRAL_BADGE = 'text-muted-foreground rounded-full text-xs tabular-nums'

function badgeClass(tone: NavItem['badgeTone']): string {
  return tone === 'neutral' ? NEUTRAL_BADGE : URGENT_BADGE
}

/**
 * The sidebar body shared by both trees. `UserMenu` is role-agnostic — it reads
 * only useAuth/useTheme/useSidebar — so mounting it here is what gives the
 * learner an identity menu and a theme control at all.
 */
export function ShellSidebar({
  switcher,
  groups,
  profileTo,
}: {
  switcher: ReactNode
  groups: NavGroup[]
  /** Where the footer identity block points — see `UserMenu`. */
  profileTo: string
}) {
  const { pathname } = useLocation()
  // On a phone the sidebar is a sheet over the page, so following a link
  // without closing it leaves the destination hidden behind the thing that
  // sent you there. Harmless on desktop, where `openMobile` is not rendered.
  const { setOpenMobile } = useSidebar()
  const close = () => setOpenMobile(false)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>{switcher}</SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = isNavActive(pathname, item)
                const branch = isBranchActive(pathname, item)
                const { icon: Icon } = item
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      // The tinted row marks the page you are on. A parent
                      // whose *child* is active gets the brand colour on the
                      // icon alone — "the section you are in" and "the page
                      // you are on" must not read as the same thing, and two
                      // stacked tinted rows would say the latter twice.
                      isActive={active}
                      className={cn(
                        !active &&
                          branch &&
                          'font-medium [&_svg]:text-sidebar-primary',
                      )}
                      tooltip={item.title}
                    >
                      <Link
                        to={item.to}
                        onClick={close}
                        aria-current={active ? 'page' : undefined}
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.badge ? (
                      <SidebarMenuBadge className={badgeClass(item.badgeTone)}>
                        {item.badge}
                      </SidebarMenuBadge>
                    ) : null}
                    {item.children?.length ? (
                      // Always open. These are four fixed destinations, not a
                      // tree that grows — a disclosure would only add a click
                      // and hide them again. Radix's own styles collapse this
                      // away in the icon rail.
                      <SidebarMenuSub>
                        {item.children.map((child) => {
                          const childActive = isNavActive(pathname, child)
                          const { icon: ChildIcon } = child
                          return (
                            <SidebarMenuSubItem key={child.to}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={childActive}
                              >
                                <Link
                                  to={child.to}
                                  onClick={close}
                                  aria-current={
                                    childActive ? 'page' : undefined
                                  }
                                >
                                  <ChildIcon />
                                  <span>{child.title}</span>
                                  {child.badge ? (
                                    <span
                                      className={cn(
                                        'ml-auto flex h-5 min-w-5 items-center justify-center px-1',
                                        badgeClass(child.badgeTone),
                                      )}
                                    >
                                      {child.badge}
                                    </span>
                                  ) : null}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu profileTo={profileTo} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
