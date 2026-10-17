import { useStudentAcademy } from '@/lib/studentAcademy'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'

/** The learner's notifications, scoped to the learner tree's own academy. */
export function LearnNotificationsPage() {
  const { academyId } = useStudentAcademy()
  return <NotificationsPage academyId={academyId} />
}
