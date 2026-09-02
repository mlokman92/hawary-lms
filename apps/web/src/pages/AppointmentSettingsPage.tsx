import { useAcademy } from '@/lib/academy'
import { getLang, useT } from '@/lib/i18n'
import { localeFor } from '@/lib/format'
import { BackLink } from '@/components/patterns/BackLink'
import { PageHeader } from '@/components/patterns/PageHeader'
import { AvailabilityCard } from '@/features/appointments/AvailabilityCard'
import { BlockedDatesCard } from '@/features/appointments/BlockedDatesCard'
import { BookingPoolCard } from '@/features/appointments/BookingPoolCard'
import { BookingSettingsCard } from '@/features/appointments/BookingSettingsCard'
import { useMyInstructorRecord } from '@/features/profile/api'
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
 *
 * **Not admin-only any more, and it never should have been in full.** The page
 * was gated as one thing, so a trainer who opened it got "admins only" — including
 * for the one control on it that has always been theirs. `booking_time_off` has
 * allowed `app.is_admin(academy_id) OR app.owns_instructor(instructor_id)` on
 * insert, update and delete since it was created; the UI was simply never built
 * to let an instructor use it. So the gate moved from the page to the cards: an
 * admin still sees all four, an instructor sees the one that is about them.
 */
export function AppointmentSettingsPage() {
  const { t } = useT()
  const locale = localeFor(getLang())
  const { activeAcademyId, active } = useAcademy()
  const academyId = activeAcademyId ?? ''
  const isAdmin = active?.role === 'admin'

  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(activeAcademyId)
  const myInstructor = useMyInstructorRecord(activeAcademyId)

  const { data: settings } = useBookingSettings(isAdmin ? activeAcademyId : null)
  const { data: hours } = useBookingHours(isAdmin ? activeAcademyId : null)
  // Both roles: an instructor needs to see what is already blocked before
  // blocking anything, and `booking time off: staff read` allows it.
  const { data: timeOff } = useTimeOff(activeAcademyId)
  // The pool is only ever read for the admin's "who" picker.
  const { data: pool } = useBookingPool(isAdmin ? activeAcademyId : null)

  // A trainer with no instructor record has nothing to block dates against —
  // the same real case the trainer dashboard's marking cards handle, because
  // `course_instructors` and `instructors.user_id` are filled in separately.
  const noRecord = !isAdmin && !myInstructor.isLoading && !myInstructor.data

  return (
    <div className="mx-auto w-full max-w-3xl">
      <BackLink to="/appointments">{t('appt.title')}</BackLink>

      <PageHeader
        className="mt-2"
        title={t('appt.setup.title')}
        description={
          isAdmin ? t('appt.setup.subtitle') : t('appt.setup.subtitle_own')
        }
      />

      <div className="mt-6 grid gap-6">
        {noRecord ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
            {t('appt.setup.no_instructor_record')}
          </div>
        ) : (
          <>
            {/* 1 — the policy */}
            {isAdmin ? (
              <BookingSettingsCard
                academyId={academyId}
                settings={settings ?? null}
                canEdit={isAdmin}
              />
            ) : null}

            {/* 2 — when the academy is open */}
            {isAdmin ? (
              <AvailabilityCard
                academyId={academyId}
                locale={locale}
                hours={hours ?? []}
                bookingOpen={!!settings?.is_open}
                canEdit={isAdmin}
              />
            ) : null}

            {/* 3 — when it is shut anyway. The one card both roles get. */}
            <BlockedDatesCard
              academyId={academyId}
              tz={tz}
              locale={locale}
              timeOff={timeOff ?? []}
              instructors={pool ?? []}
              isAdmin={isAdmin}
              myInstructorId={myInstructor.data?.id ?? null}
            />

            {/* 4 — who can be booked */}
            {isAdmin ? (
              <BookingPoolCard academyId={academyId} instructors={pool ?? []} />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
