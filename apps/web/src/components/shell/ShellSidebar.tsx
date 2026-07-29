import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { UserMenu } from '@/components/UserMenu'
import { isNavActive, type NavGroup } from './nav'
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
}: {
  switcher: ReactNode
  groups: NavGroup[]
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
                const { icon: Icon } = item
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
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
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
