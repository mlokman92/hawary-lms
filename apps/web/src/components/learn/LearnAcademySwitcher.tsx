import { Check, ChevronsUpDown, GraduationCap } from 'lucide-react'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { useT } from '@/lib/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

/**
 * The learner's academy switcher. Visually identical to AcademySwitcher, with
 * two deliberate differences:
 *
 *  - it reads useStudentAcademy(), not useAcademy() — the back-office `active`
 *    is derived from staff memberships only and is null for a student;
 *  - there is no "Add academy" item. Creating an academy makes the caller its
 *    admin, and StudentShell then evicts them from /learn permanently, so
 *    offering it here would be a one-way door out of the learner tree.
 */
export function LearnAcademySwitcher() {
  const { memberships, active, setAcademyId } = useStudentAcademy()
  const { isMobile } = useSidebar()
  const { t } = useT()

  const label = active?.academy?.name ?? t('academy.fallback')

  const trigger = (
    <SidebarMenuButton
      size="lg"
      tooltip={label}
      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
    >
      <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
        <GraduationCap className="size-4" />
      </div>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{label}</span>
        <span className="text-muted-foreground truncate text-xs">
          {t('role.student')}
        </span>
      </div>
      {memberships.length > 1 ? <ChevronsUpDown className="ml-auto" /> : null}
    </SidebarMenuButton>
  )

  // One academy is the common case: keep the chrome, drop the affordance —
  // a dropdown with a single option is a dead control.
  if (memberships.length <= 1) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>{trigger}</SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              {t('academy.heading')}
            </DropdownMenuLabel>
            {memberships.map((m) => (
              <DropdownMenuItem
                key={m.academyId}
                onClick={() => setAcademyId(m.academyId)}
                className="gap-2 p-2"
              >
                <div className="flex size-6 items-center justify-center rounded-md border">
                  <GraduationCap className="size-3.5 shrink-0" />
                </div>
                <span className="truncate">
                  {m.academy?.name ?? m.academyId}
                </span>
                {m.academyId === active?.academyId ? (
                  <Check className="ml-auto size-4" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
