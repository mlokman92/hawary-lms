import { Outlet } from 'react-router-dom'
import { useStudentAcademy } from '@/lib/studentAcademy'
import { SidebarShell } from '@/components/shell/SidebarShell'
import { LearnSidebar } from './LearnSidebar'

/**
 * No headerSlot: the back-office header carries a search box that is
 * uncontrolled and inert. Reproducing a decorative control on a new surface
 * would just double the debt.
 *
 * The academy comes from `useStudentAcademy`, the learner tree's own context.
 * It has to: `useAcademy().activeAcademyId` is staff-scoped and stays null for
 * a student-only account, which is exactly why the bell here showed nothing.
 */
export function LearnLayout() {
  const { academyId } = useStudentAcademy()
  return (
    <SidebarShell sidebar={<LearnSidebar />} academyId={academyId}>
      <Outlet />
    </SidebarShell>
  )
}
