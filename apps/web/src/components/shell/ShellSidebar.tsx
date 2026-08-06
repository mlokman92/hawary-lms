import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { UserMenu } from '@/components/UserMenu'
import { cn } from '@/lib/utils'
import { isBranchActive, isNavActive, type NavGroup } from './nav'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@/components/ui/sidebar'

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
                        aria-current={active ? 'page' : undefined}
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
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
                                  aria-current={
                                    childActive ? 'page' : undefined
                                  }
                                >
                                  <ChildIcon />
                                  <span>{child.title}</span>
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
