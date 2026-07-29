import { Outlet } from 'react-router-dom'
import { SidebarShell } from '@/components/shell/SidebarShell'
import { LearnSidebar } from './LearnSidebar'

/**
 * No headerSlot: the back-office header carries a search box that is
 * uncontrolled and inert. Reproducing a decorative control on a new surface
 * would just double the debt.
 */
export function LearnLayout() {
  return (
    <SidebarShell sidebar={<LearnSidebar />}>
      <Outlet />
    </SidebarShell>
  )
}
