import { useAcademy } from '@/lib/academy'
import { getLang, useT } from '@/lib/i18n'
import { localeFor } from '@/lib/format'
import { BackLink } from '@/components/patterns/BackLink'
import { PageHeader } from '@/components/patterns/PageHeader'
import { AvailabilityCard } from '@/features/appointments/AvailabilityCard'
import { BookingPoolCard } from '@/features/appointments/BookingPoolCard'
import { BookingSettingsCard } from '@/features/appointments/BookingSettingsCard'
import {
  DEFAULT_TZ,
  useAcademyTimezone,
  useBookingHours,
  useBookingPool,
  useBookingSettings,
  useTimeOff,
} from '@/features/appointments/api'

/**
 * Everything that decides what can go in the diary — the policy, the hours,
 * and who is in the pool — on its own page.
 *
 * It used to sit under the calendar on /appointments, which meant the screen
 * staff open every day ended in three cards they touch once. Setup is a
 * destination you go to, not something the diary carries around.
 */
export function AppointmentSettingsPage() {
  const { t } = useT()
  const locale = localeFor(getLang())
  const { activeAcademyId, active } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isAdmin = active?.role === 'admin'

  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(activeAcademyId)
  const { data: settings } = useBookingSettings(isAdmin ? activeAcademyId : null)
  const { data: hours } = useBookingHours(isAdmin ? activeAcademyId : null)
  const { data: timeOff } = useTimeOff(isAdmin ? activeAcademyId : null)
  const { data: pool } = useBookingPool(isAdmin ? activeAcademyId : null)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <BackLink to="/appointments">{t('appt.title')}</BackLink>

      <PageHeader
        className="mt-2"
        title={t('appt.setup.title')}
        description={t('appt.setup.subtitle')}
      />

      <div className="mt-6 grid gap-6">
        {!isAdmin ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
            {t('settings.admin_only')}
          </div>
        ) : (
          <>
            {/* 1 — the policy */}
            <BookingSettingsCard
              academyId={academyId}
              settings={settings ?? null}
              canEdit={isAdmin}
            />

            {/* 2 — when */}
            <AvailabilityCard
              academyId={academyId}
              tz={tz}
              locale={locale}
              hours={hours ?? []}
              timeOff={timeOff ?? []}
              instructors={pool ?? []}
              bookingOpen={!!settings?.is_open}
              canEdit={isAdmin}
            />

            {/* 3 — who */}
            <BookingPoolCard academyId={academyId} instructors={pool ?? []} />
          </>
        )}
      </div>
    </div>
  )
}
