import {
  ChevronsUpDown,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Sun,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useTheme, type Theme } from '@/lib/theme'
import { LANGS, useT, type Lang } from '@/lib/i18n'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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

export function UserMenu() {
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
            <DropdownMenuLabel className="font-normal">
              <div className="grid gap-0.5">
                <span className="truncate text-sm font-medium">
                  {displayName}
                </span>
                {email ? (
                  <span className="text-muted-foreground truncate text-xs">
                    {email}
                  </span>
                ) : null}
              </div>
            </DropdownMenuLabel>
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
