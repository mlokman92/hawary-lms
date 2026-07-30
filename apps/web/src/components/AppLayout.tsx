import type { ReactNode } from 'react'
import { AppSidebar } from './AppSidebar'
import { HeaderSearch } from './HeaderSearch'
import { SidebarShell } from './shell/SidebarShell'

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarShell sidebar={<AppSidebar />} headerSlot={<HeaderSearch />}>
      {children}
    </SidebarShell>
  )
}
