import { useAcademy } from '@/lib/academy'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'

/** The back-office's notifications, scoped to the switcher's academy. */
export function StaffNotificationsPage() {
  const { activeAcademyId } = useAcademy()
  return <NotificationsPage academyId={activeAcademyId} />
}
