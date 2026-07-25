import { Link, useLocation } from 'react-router-dom'
import {
  BookOpen,
  ClipboardList,
  FileCheck2,
  FileText,
  LayoutDashboard,
  Receipt,
  Users,
} from 'lucide-react'
import { AcademySwitcher } from './AcademySwitcher'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

const COMING_SOON = [
  { title: 'Assignments', icon: FileCheck2 },
  { title: 'Invoices', icon: Receipt },
]

export function AppSidebar() {
  const { pathname } = useLocation()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <AcademySwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === '/'}
                tooltip="Dashboard"
              >
                <Link to="/">
                  <LayoutDashboard />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/courses')}
                tooltip="Courses"
              >
                <Link to="/courses">
                  <BookOpen />
                  <span>Courses</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/students')}
                tooltip="Students"
              >
                <Link to="/students">
                  <Users />
                  <span>Students</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/notes')}
                tooltip="Notes"
              >
                <Link to="/notes">
                  <FileText />
                  <span>Notes</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/assessments')}
                tooltip="Assessments"
              >
                <Link to="/assessments">
                  <ClipboardList />
                  <span>Assessments</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarMenu>
            {COMING_SOON.map(({ title, icon: Icon }) => (
              <SidebarMenuItem key={title}>
                <SidebarMenuButton
                  disabled
                  tooltip={`${title} — coming soon`}
                  className="opacity-60"
                >
                  <Icon />
                  <span>{title}</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>Soon</SidebarMenuBadge>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
