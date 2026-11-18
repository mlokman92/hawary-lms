import { CalendarClock } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { EmptyState } from '@/components/patterns/EmptyState'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  COURSE_STATUS_LABEL,
  useCourses,
  useSetCourseAppointments,
} from '@/features/courses/api'

/**
 * Which courses' students may book (docs/appointments.md, "Which courses may
 * book"). One student, one course, so this is the switch for a whole intake.
 * The database enforces it in `get_booking_options` and `book_appointment`;
 * this card only flips `courses.appointments_enabled`.
 *
 * An archived course is listed only while it is still switched on — otherwise
 * finished intakes would fill the card with switches nobody needs.
 */
export function CourseAppointmentsCard({ academyId }: { academyId: string }) {
  const { t } = useT()
  const { data: courses } = useCourses(academyId)
  const setEnabled = useSetCourseAppointments(academyId)

  const rows = (courses ?? []).filter(
    (c) => c.status !== 'archived' || c.appointments_enabled,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appt.courses.title')}</CardTitle>
        <CardDescription>{t('appt.courses.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={CalendarClock} title={t('appt.courses.none')} />
        ) : (
          <ul className="divide-y rounded-md border">
            {rows.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  {c.status !== 'published' ? (
                    <p className="text-muted-foreground text-xs">
                      {t(COURSE_STATUS_LABEL[c.status])}
                    </p>
                  ) : null}
                </div>
                <Switch
                  checked={c.appointments_enabled}
                  onCheckedChange={(v) =>
                    setEnabled.mutate({ id: c.id, enabled: v })
                  }
                  aria-label={t('appt.courses.toggle_aria', { name: c.title })}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
