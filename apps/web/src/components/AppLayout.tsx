import type { ReactNode } from 'react'
import { useAcademy } from '@/lib/academy'
import { AppSidebar } from './AppSidebar'
import { HeaderSearch } from './HeaderSearch'
import { SidebarShell } from './shell/SidebarShell'

export function AppLayout({ children }: { children: ReactNode }) {
  // The back-office's staff-scoped academy — the one the switcher sets. The
  // learner tree passes its own instead; see SidebarShell for why this cannot
  // be read inside the shell.
  const { activeAcademyId } = useAcademy()
  return (
    <SidebarShell
      sidebar={<AppSidebar />}
      headerSlot={<HeaderSearch />}
      academyId={activeAcademyId}
    >
      {children}
    </SidebarShell>
  )
}
