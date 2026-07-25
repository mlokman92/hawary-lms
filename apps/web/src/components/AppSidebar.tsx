import { Link, useLocation } from 'react-router-dom'
import {
  BookOpen,
  ClipboardList,
  FileCheck2,
  FileText,
  LayoutDashboard,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { AcademySwitcher } from './AcademySwitcher'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

const NAV: { title: string; to: string; icon: LucideIcon }[] = [
  { title: 'Dashboard', to: '/', icon: LayoutDashboard },
  { title: 'Courses', to: '/courses', icon: BookOpen },
  { title: 'Students', to: '/students', icon: Users },
  { title: 'Notes', to: '/notes', icon: FileText },
  { title: 'Assessments', to: '/assessments', icon: ClipboardList },
  { title: 'Assignments', to: '/assignments', icon: FileCheck2 },
  { title: 'Payments', to: '/payments', icon: Receipt },
]

export function AppSidebar() {
  const { pathname } = useLocation()

  const isActive = (to: string) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <AcademySwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            {NAV.map(({ title, to, icon: Icon }) => (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton asChild isActive={isActive(to)} tooltip={title}>
                  <Link to={to}>
                    <Icon />
                    <span>{title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
