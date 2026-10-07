import { useState } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { errorMessage } from '@/lib/errors'
import { localeFor } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  DEFAULT_TZ,
  useAcademyTimezone,
  useAddTimeOff,
  useDeleteTimeOff,
  useTimeOff,
} from '@/features/appointments/api'
import {
  addDays,
  fmtDayLong,
  today,
  ymdOf,
  zonedDayStart,
} from '@/features/appointments/calendar'
import { useInstructors } from '@/features/instructors/api'
import { useMyInstructorRecord } from '@/features/profile/api'
import { useScope } from '@/shell/scope'
import {
  Button,
  Card,
  DateField,
  Empty,
  Field,
  FormError,
  IconButton,
  Input,
  Row,
  Screen,
  Select,
  Sheet,
  T,
  space,
} from '@/ui'

const ACADEMY = '__all__'

/**
 * Blocked dates: days nothing can be booked.
 *
 * The one booking setting that belongs to a trainer as well as an admin, and
 * the database has always said so (`app.is_admin OR app.owns_instructor`):
 *
 *   - an **admin** may close the whole academy or block any instructor, and
 *     sees and removes every block;
 *   - an **instructor** blocks only herself — so she gets no "who" picker, a
 *     control with one option not being a control — and sees her own blocks
 *     plus any academy-wide closure, which carries no Remove for her.
 *
 * The rest of the booking setup (policy, hours, pool) stays on the web.
 */
export default function BlockedDatesScreen() {
  const { t, lang } = useT()
  const locale = localeFor(lang)
  const { academyId, isAdmin } = useScope()
  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(academyId)
  const me = useMyInstructorRecord(academyId)
  const mineId = me.data?.id ?? null
  const { data: instructors } = useInstructors(isAdmin ? academyId : null)
  const { data, refetch, isRefetching } = useTimeOff(academyId)
  const add = useAddTimeOff(academyId ?? '')
  const remove = useDeleteTimeOff(academyId ?? '')

  const [adding, setAdding] = useState(false)
  const [who, setWho] = useState<string>(ACADEMY)
  const [from, setFrom] = useState<string | null>(today(tz))
  const [to, setTo] = useState<string | null>(today(tz))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const rows = (data ?? []).filter(
    (o) => isAdmin || o.instructor_id === null || o.instructor_id === mineId,
  )
  const noRecord = !isAdmin && !mineId && !me.isLoading

  async function submit() {
    if (!from || !to) return
    if (to < from) return setError(t('appt.timeoff.range_invalid'))
    setError(null)
    try {
      await add.mutateAsync({
        instructor_id: isAdmin ? (who === ACADEMY ? null : who) : mineId,
        // Whole days in the academy's own timezone: from the first midnight to
        // the midnight after the last day.
        starts_at: zonedDayStart(from, tz).toISOString(),
        ends_at: zonedDayStart(addDays(to, 1), tz).toISOString(),
        reason: reason.trim() || null,
      })
      setReason('')
      setAdding(false)
    } catch (e) {
      setError(errorMessage(e, t('common.error')))
    }
  }

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Stack.Screen
        options={{
          title: isAdmin ? t('appt.timeoff.title') : t('appt.timeoff.mine_title'),
        }}
      />
      {noRecord ? (
        <Empty icon="user-x" title={t('appt.setup.no_instructor_record')} />
      ) : (
        <>
          <T muted>
            {isAdmin ? t('appt.timeoff.description') : t('appt.timeoff.mine_description')}
          </T>
          <Button
            variant="outline"
            icon="slash"
            title={t('m.staff.blocked.add')}
            onPress={() => {
              setError(null)
              setAdding(true)
            }}
          />
          <Card flush>
            {rows.length === 0 ? (
              <T muted style={{ padding: space.lg }}>
                {t('appt.timeoff.none')}
              </T>
            ) : (
              rows.map((o, i) => {
                const first = ymdOf(o.starts_at, tz)
                // `ends_at` is the midnight AFTER the last day.
                const last = ymdOf(new Date(new Date(o.ends_at).getTime() - 1000), tz)
                const mine = isAdmin || (!!mineId && o.instructor_id === mineId)
                return (
                  <Row
                    key={o.id}
                    first={i === 0}
                    title={
                      first === last
                        ? fmtDayLong(first, locale)
                        : `${fmtDayLong(first, locale)} – ${fmtDayLong(last, locale)}`
                    }
                    subtitle={[
                      o.instructor_id
                        ? (o.instructors?.full_name ?? t('common.instructor'))
                        : t('appt.timeoff.whole_academy'),
                      o.reason,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    right={
                      mine ? (
                        <IconButton
                          name="trash-2"
                          label={t('common.remove')}
                          onPress={() => remove.mutate(o.id)}
                        />
                      ) : null
                    }
                  />
                )
              })
            )}
          </Card>
        </>
      )}

      <Sheet visible={adding} onClose={() => setAdding(false)} title={t('m.staff.blocked.add')}>
        {isAdmin ? (
          <Field label={t('appt.timeoff.who')}>
            <Select
              value={who}
              onChange={setWho}
              title={t('appt.timeoff.who')}
              options={[
                { value: ACADEMY, label: t('appt.timeoff.whole_academy') },
                ...(instructors ?? []).map((i) => ({
                  value: i.id,
                  label: i.full_name ?? t('common.unnamed'),
                })),
              ]}
            />
          </Field>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label={t('appt.timeoff.from')}>
              <DateField value={from} onChange={setFrom} minimumDate={new Date()} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('appt.timeoff.to')}>
              <DateField value={to} onChange={setTo} minimumDate={new Date()} />
            </Field>
          </View>
        </View>
        <Field label={t('appt.timeoff.reason')}>
          <Input
            value={reason}
            onChangeText={setReason}
            placeholder={t('appt.timeoff.reason_placeholder')}
          />
        </Field>
        <FormError error={error} />
        <Button
          title={add.isPending ? t('common.saving') : t('common.save')}
          loading={add.isPending}
          disabled={!from || !to}
          onPress={() => void submit()}
        />
      </Sheet>
    </Screen>
  )
}
