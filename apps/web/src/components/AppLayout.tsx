import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { AppSidebar } from './AppSidebar'
import { SidebarShell } from './shell/SidebarShell'
import { Input } from '@/components/ui/input'

function HeaderSearch() {
  const { t } = useT()
  return (
    <div className="relative w-full max-w-sm">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        type="search"
        placeholder={t('nav.search_placeholder')}
        aria-label={t('nav.search_label')}
        className="pl-8"
      />
    </div>
  )
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarShell sidebar={<AppSidebar />} headerSlot={<HeaderSearch />}>
      {children}
    </SidebarShell>
  )
}
