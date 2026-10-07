import { useState } from 'react'
import { Stack } from 'expo-router'
import { localeFor } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  APPOINTMENT_PAGE_SIZE,
  APPOINTMENT_STATUS,
  DEFAULT_TZ,
  useAcademyTimezone,
  useAppointmentPage,
  type AppointmentRow,
  type AppointmentStatus,
  type AppointmentWhen,
} from '@/features/appointments/api'
import { fmtWhen } from '@/features/appointments/calendar'
import { SessionSheet } from '@/features/appointments/SessionSheet'
import { useMyInstructorRecord } from '@/features/profile/api'
import { useScope } from '@/shell/scope'
import {
  Badge,
  Card,
  Chips,
  Empty,
  ErrorBlock,
  Loading,
  Row,
  Screen,
  SearchInput,
} from '@/ui'
import { Pager } from '@/ui/Pager'

type StatusFilter = AppointmentStatus | 'any'
const STATUSES: AppointmentStatus[] = ['booked', 'completed', 'no_show', 'cancelled']

/**
 * The register: every session the reader may see, cancelled ones included —
 * which is exactly the row somebody comes looking for and the diary has
 * nowhere to put.
 *
 * Two views and no third: what is still to happen, nearest first, and the
 * archive of what already has, most recent first. The cut is `ends_at`, so a
 * lesson being taught right now is still upcoming (docs/appointments.md).
 *
 * This is also where a booking notification lands an instructor, for the
 * reason the web's does: the diary is one week, and the session may not be in
 * it.
 */
export default function RegisterScreen() {
  const { t, lang } = useT()
  const locale = localeFor(lang)
  const { academyId, isAdmin } = useScope()
  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(academyId)
  const { data: me } = useMyInstructorRecord(academyId)
  const [when, setWhen] = useState<AppointmentWhen>('upcoming')
  const [status, setStatus] = useState<StatusFilter>('any')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<AppointmentRow | null>(null)

  const { data, isLoading, error, refetch, isRefetching } = useAppointmentPage(
    academyId,
    { when, status: status === 'any' ? '' : status, search, instructorId: '' },
    page,
  )
  const rows = data?.rows ?? []
  const reset = () => setPage(1)

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Stack.Screen options={{ title: t('appt.register.title') }} />
      <Chips<AppointmentWhen>
        value={when}
        onChange={(v) => {
          setWhen(v)
          reset()
        }}
        options={[
          { value: 'upcoming', label: t('appt.register.upcoming') },
          { value: 'archive', label: t('appt.register.archive') },
        ]}
      />
      <Chips<StatusFilter>
        value={status}
        onChange={(v) => {
          setStatus(v)
          reset()
        }}
        options={[
          { value: 'any', label: t('appt.register.any_status') },
          ...STATUSES.map((s) => ({
            value: s as StatusFilter,
            label: t(APPOINTMENT_STATUS[s].labelKey),
          })),
        ]}
      />
      <SearchInput
        value={search}
        onChangeText={(v) => {
          setSearch(v)
          reset()
        }}
        placeholder={t('appt.register.search')}
      />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <Empty icon="calendar" title={t('appt.register.empty')} />
      ) : (
        <Card flush>
          {rows.map((a, i) => {
            const meta = APPOINTMENT_STATUS[a.status]
            return (
              <Row
                key={a.id}
                first={i === 0}
                title={a.students?.full_name ?? t('common.unnamed')}
                subtitle={[
                  fmtWhen(a.starts_at, tz, locale),
                  isAdmin ? a.instructors?.full_name : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={<Badge label={t(meta.labelKey)} tone={meta.tone} />}
                onPress={() => setOpen(a)}
              />
            )
          })}
        </Card>
      )}
      <Pager
        page={page}
        pageSize={APPOINTMENT_PAGE_SIZE}
        total={data?.total ?? 0}
        onChange={setPage}
      />

      <SessionSheet
        session={open}
        academyId={academyId}
        tz={tz}
        canAct={isAdmin || (!!me && open?.instructor_id === me.id)}
        onClose={() => setOpen(null)}
      />
    </Screen>
  )
}
