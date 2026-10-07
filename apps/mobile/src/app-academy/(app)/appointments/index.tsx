import { useState } from 'react'
import { View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { localeFor } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  APPOINTMENT_STATUS,
  DEFAULT_TZ,
  useAcademyAppointments,
  useAcademyTimezone,
  type AppointmentRow,
} from '@/features/appointments/api'
import {
  addDays,
  daysFrom,
  fmtDayLong,
  fmtTime,
  fmtWeekRange,
  startOfWeek,
  today,
  ymdOf,
} from '@/features/appointments/calendar'
import { SessionSheet } from '@/features/appointments/SessionSheet'
import { useInstructors } from '@/features/instructors/api'
import { useMyInstructorRecord } from '@/features/profile/api'
import { useScope } from '@/shell/scope'
import {
  Badge,
  Button,
  Card,
  ErrorBlock,
  IconButton,
  Loading,
  Menu,
  Row,
  Screen,
  Select,
  T,
  space,
} from '@/ui'

const EVERYONE = '__all__'

/**
 * The diary: one week, a day at a time down the screen. The web draws it as a
 * grid of seven columns; on a phone seven columns leave about 34px a day, so
 * the same week is a list grouped by day.
 *
 * Only booked, done and missed sessions are drawn. A cancelled session has
 * released its slot and is not something happening on Tuesday — it is in the
 * register (docs/appointments.md).
 *
 * A trainer sees her own week because the query returns her own week: the
 * SELECT policy is `admin, own instructor, own student`. The instructor filter
 * is therefore an admin's only — a control that cannot change the result is
 * worse than no control.
 */
export default function DiaryScreen() {
  const { t, lang } = useT()
  const locale = localeFor(lang)
  const router = useRouter()
  const { academyId, isAdmin } = useScope()
  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(academyId)
  const { data: me } = useMyInstructorRecord(academyId)
  const { data: instructors } = useInstructors(isAdmin ? academyId : null)
  const [offset, setOffset] = useState(0)
  const [who, setWho] = useState<string>(EVERYONE)
  const [open, setOpen] = useState<AppointmentRow | null>(null)

  const start = addDays(startOfWeek(today(tz)), offset * 7)
  const { data, isLoading, error, refetch, isRefetching } = useAcademyAppointments(
    academyId,
    tz,
    start,
    addDays(start, 7),
  )

  const sessions = (data ?? []).filter(
    (a) =>
      a.status !== 'cancelled' && (who === EVERYONE || a.instructor_id === who),
  )

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Stack.Screen
        options={{
          title: t('appt.calendar.title'),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <IconButton
                name="plus"
                label={t('appt.book_for.action')}
                onPress={() => router.push('/appointments/book' as never)}
              />
              <Menu
                label={t('common.actions')}
                items={[
                  {
                    label: t('nav.appointment_list'),
                    icon: 'list',
                    onPress: () => router.push('/appointments/list' as never),
                  },
                  {
                    label: t('appt.timeoff.mine_title'),
                    icon: 'slash',
                    onPress: () => router.push('/appointments/blocked' as never),
                  },
                ]}
              />
            </View>
          ),
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <IconButton
          name="chevron-left"
          label={t('appt.calendar.prev')}
          onPress={() => setOffset((n) => n - 1)}
        />
        <T center style={{ flex: 1, fontWeight: '600' }}>
          {fmtWeekRange(start, locale)}
        </T>
        <IconButton
          name="chevron-right"
          label={t('appt.calendar.next')}
          onPress={() => setOffset((n) => n + 1)}
        />
      </View>
      {offset !== 0 ? (
        <Button
          small
          variant="ghost"
          title={t('appt.calendar.this_week')}
          onPress={() => setOffset(0)}
        />
      ) : null}

      {isAdmin ? (
        <Select
          value={who}
          onChange={setWho}
          title={t('appt.field.instructor')}
          options={[
            { value: EVERYONE, label: t('appt.calendar.all_instructors') },
            ...(me ? [{ value: me.id, label: t('appt.register.mine') }] : []),
            ...(instructors ?? [])
              .filter((i) => i.id !== me?.id)
              .map((i) => ({
                value: i.id,
                label: i.full_name ?? t('common.unnamed'),
              })),
          ]}
        />
      ) : null}

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : (
        daysFrom(start, 7).map((day) => {
          const list = sessions.filter((a) => ymdOf(a.starts_at, tz) === day)
          if (list.length === 0) return null
          return (
            <View key={day} style={{ gap: space.sm }}>
              <T v="small" muted>
                {fmtDayLong(day, locale)}
              </T>
              <Card flush>
                {list.map((a, i) => {
                  const meta = APPOINTMENT_STATUS[a.status]
                  return (
                    <Row
                      key={a.id}
                      first={i === 0}
                      title={a.students?.full_name ?? t('common.unnamed')}
                      subtitle={[
                        fmtTime(a.starts_at, tz),
                        isAdmin ? a.instructors?.full_name : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      right={
                        a.status === 'booked' ? null : (
                          <Badge label={t(meta.labelKey)} tone={meta.tone} />
                        )
                      }
                      onPress={() => setOpen(a)}
                    />
                  )
                })}
              </Card>
            </View>
          )
        })
      )}
      {!isLoading && !error && sessions.length === 0 ? (
        <Card>
          <T muted center>
            {t('appt.dash.none')}
          </T>
        </Card>
      ) : null}

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
