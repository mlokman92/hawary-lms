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
  useSetInstructorBookable,
  type BookableInstructor,
} from '@/features/appointments/api'

/**
 * Who is offered to students. Lifted out of the page when the setup moved to
 * /appointments/settings, so the diary page holds the diary and nothing else.
 */
export function BookingPoolCard({
  academyId,
  instructors,
}: {
  academyId: string
  instructors: BookableInstructor[]
}) {
  const { t } = useT()
  const setBookable = useSetInstructorBookable(academyId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appt.pool.title')}</CardTitle>
        <CardDescription>{t('appt.pool.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {instructors.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={t('appt.pool.none')}
            body={t('appt.pool.none_hint')}
          />
        ) : (
          <ul className="divide-y rounded-md border">
            {instructors.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {i.full_name ?? t('common.unnamed')}
                  </p>
                  {i.status !== 'active' ? (
                    <p className="text-muted-foreground text-xs">
                      {t('appt.pool.not_active')}
                    </p>
                  ) : null}
                </div>
                <Switch
                  checked={i.is_bookable}
                  // An on_leave instructor is left out by the generator
                  // whatever this says, so the switch would be a lie.
                  disabled={i.status !== 'active'}
                  onCheckedChange={(v) =>
                    setBookable.mutate({ id: i.id, is_bookable: v })
                  }
                  aria-label={t('appt.pool.toggle_aria', {
                    name: i.full_name ?? t('common.unnamed'),
                  })}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
