import {
  ChevronsUpDown,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Sun,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useTheme, type Theme } from '@/lib/theme'
import { LANGS, useT, type Lang } from '@/lib/i18n'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

function getInitials(name: string, email: string): string {
  const source = (name || email).trim()
  if (!source) return 'U'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

/**
 * `profileTo` differs per shell — `/profile` for staff, `/learn/profile` for
 * the learner — because the two pages frame the same `profiles` row around
 * different things. It is a prop rather than a route sniff so the menu stays
 * role-agnostic; that is what lets both shells mount it unchanged.
 */
export function UserMenu({ profileTo }: { profileTo: string }) {
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const { lang, setLang, t } = useT()
  const { isMobile } = useSidebar()

  const email = user?.email ?? ''
  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? ''
  const displayName = fullName || email || t('user.account')
  const initials = getInitials(fullName, email)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={displayName}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                {email ? (
                  <span className="text-muted-foreground truncate text-xs">
                    {email}
                  </span>
                ) : null}
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="end"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            {/* The identity block is the link to your own profile, not a
                static label: clicking your name is where people look for
                "edit me", and a separate menu row for it reads as a second,
                unrelated destination. */}
            <DropdownMenuItem asChild className="py-2">
              <Link to={profileTo}>
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {displayName}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {email || t('user.profile')}
                  </span>
                </div>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette className="text-muted-foreground size-4" />
                {t('user.theme')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(value) => setTheme(value as Theme)}
                >
                  <DropdownMenuRadioItem value="light">
                    <Sun className="text-muted-foreground size-4" />
                    {t('user.theme.light')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="text-muted-foreground size-4" />
                    {t('user.theme.dark')}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor className="text-muted-foreground size-4" />
                    {t('user.theme.system')}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {/* Language sits beside Theme: both are per-device display
                preferences, and this menu is the one control the staff and
                learner shells share. */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Languages className="text-muted-foreground size-4" />
                {t('user.language')}
              </DropdownMenuSubTrigger>
              {/* Wide enough that "Bahasa Melayu" stays on one line. */}
              <DropdownMenuSubContent className="min-w-56">
                <DropdownMenuRadioGroup
                  value={lang}
                  onValueChange={(value) => setLang(value as Lang)}
                >
                  {LANGS.map((l) => (
                    <DropdownMenuRadioItem key={l.value} value={l.value}>
                      <span className="text-muted-foreground w-6 text-xs font-medium">
                        {l.short}
                      </span>
                      <span className="whitespace-nowrap">{l.label}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" />
              {t('user.sign_out')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
