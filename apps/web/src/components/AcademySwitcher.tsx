import { Check, ChevronsUpDown, GraduationCap } from 'lucide-react'
import { LogoTile } from '@/components/Logo'
import { useAcademy } from '@/lib/academy'
import { useT, type TKey } from '@/lib/i18n'
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
 * Switches between the Hawary Academy branches a staff member belongs to;
 * renders as a plain label with one. Branches are opened by the owner, so
 * there is nothing to add here.
 */
export function AcademySwitcher() {
  const { staffMemberships, active, setActiveAcademyId } = useAcademy()
  const { isMobile } = useSidebar()
  const { t } = useT()

  // A Director shows as one here, where the role already is — the only place
  // in the shell that says this account holds the extra powers.
  const roleLabel = !active
    ? ''
    : active.isDirector
      ? t('members.tier.director')
      : t(`role.${active.role}` as TKey)
  const name = active?.academy?.name ?? t('academy.fallback')

  const trigger = (
    <SidebarMenuButton
      size="lg"
      tooltip={name}
      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
    >
      <LogoTile />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">
          {name}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {roleLabel}
        </span>
      </div>
      {staffMemberships.length > 1 ? <ChevronsUpDown className="ml-auto" /> : null}
    </SidebarMenuButton>
  )

  // One branch is the common case: keep the chrome, drop the affordance — a
  // dropdown with a single option is a dead control.
  if (staffMemberships.length <= 1) {
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
            {staffMemberships.map((m) => (
              <DropdownMenuItem
                key={m.academyId}
                onClick={() => setActiveAcademyId(m.academyId)}
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
