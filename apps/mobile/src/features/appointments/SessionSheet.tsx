import { useState } from 'react'
import { Alert, Linking, View } from 'react-native'
import { useRouter } from 'expo-router'
import { addSessionToCalendar } from '@/lib/deviceCalendar'
import { errorMessage } from '@/lib/errors'
import { localeFor } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { waLink, waNumber } from '@/lib/phone'
import { Badge, Button, FormError, Sheet, T, space } from '@/ui'
import {
  APPOINTMENT_STATUS,
  useCancelAppointment,
  useSetAppointmentStatus,
  type AppointmentRow,
} from './api'
import { fmtDayLong, fmtTime, fmtWhen, ymdOf } from './calendar'

/**
 * One session, opened from anywhere in the Academy app — the phone counterpart
 * of the web's `AppointmentDialog`, and like it the single place the rule for
 * who may act lives: **an admin, or the instructor whose session it is**. That
 * mirrors the UPDATE policy exactly (docs/appointments.md); a button that
 * fails at the policy is worse than no button.
 *
 * Reaching the student is not gated the same way: calling or messaging changes
 * nothing, and anyone who can see the session can already read the number.
 *
 * "Can't take it" is `cancel_appointment`, which for staff means *hand it to
 * whoever can cover, cancel only if nobody can* — and the sheet says which of
 * the two happened, because about half of them find cover.
 */
export function SessionSheet({
  session,
  academyId,
  tz,
  canAct,
  onClose,
}: {
  session: AppointmentRow | null
  academyId: string | null
  tz: string
  canAct: boolean
  onClose: () => void
}) {
  const { t, lang } = useT()
  const locale = localeFor(lang)
  const router = useRouter()
  const setStatus = useSetAppointmentStatus(academyId)
  const cancel = useCancelAppointment(academyId)
  const [error, setError] = useState<string | null>(null)

  if (!session) return null
  const a = session
  const meta = APPOINTMENT_STATUS[a.status]
  const name = a.students?.full_name ?? t('common.unnamed')
  const phone = a.students?.phone ?? null
  const number = waNumber(phone)
  const live = a.status === 'booked'
  const busy = setStatus.isPending || cancel.isPending

  async function mark(status: 'completed' | 'no_show') {
    setError(null)
    try {
      await setStatus.mutateAsync({ id: a.id, status })
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.error')))
    }
  }

  async function handOn() {
    setError(null)
    try {
      const result = await cancel.mutateAsync({ id: a.id })
      onClose()
      Alert.alert(
        result.reassigned
          ? t('appt.handover.done', {
              name: result.instructor?.full_name ?? t('common.unnamed'),
            })
          : t('appt.handover.none'),
      )
    } catch (e) {
      setError(errorMessage(e, t('common.error')))
    }
  }

  async function toCalendar() {
    const outcome = await addSessionToCalendar({
      title: t('m.calendar.event_title', { name }),
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      notes: a.note,
      timeZone: tz,
    })
    Alert.alert(
      t(
        outcome === 'added'
          ? 'm.calendar.added'
          : outcome === 'denied'
            ? 'm.calendar.denied'
            : 'm.calendar.failed',
      ),
    )
  }

  // The draft is only offered for a session still going ahead: "a reminder
  // about your session" under a Cancelled badge would put words in somebody's
  // mouth that contradict the row they are looking at.
  const wa = waLink(
    phone,
    live
      ? t('appt.whatsapp.draft', {
          date: fmtDayLong(ymdOf(a.starts_at, tz), locale),
          time: fmtTime(a.starts_at, tz),
        })
      : undefined,
  )

  return (
    <Sheet visible onClose={onClose} title={name}>
      <View style={{ gap: 4 }}>
        <T style={{ fontWeight: '600' }}>{fmtWhen(a.starts_at, tz, locale)}</T>
        <T v="small" muted>
          {[a.students?.student_no, a.instructors?.full_name].filter(Boolean).join(' · ')}
        </T>
        <Badge label={t(meta.labelKey)} tone={meta.tone} />
        {a.note ? <T>{a.note}</T> : null}
        {a.cancel_reason ? (
          <T v="small" muted>
            {t('appt.field.cancel_reason')}: {a.cancel_reason}
          </T>
        ) : null}
      </View>

      {canAct && live ? (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              style={{ flex: 1 }}
              icon="check"
              title={t('appt.action.complete')}
              disabled={busy}
              onPress={() => void mark('completed')}
            />
            <Button
              style={{ flex: 1 }}
              variant="outline"
              title={t('appt.action.no_show')}
              disabled={busy}
              onPress={() => void mark('no_show')}
            />
          </View>
          <Button
            variant="ghost"
            title={t('appt.action.cancel')}
            loading={cancel.isPending}
            disabled={busy}
            onPress={() => void handOn()}
          />
        </View>
      ) : null}

      <FormError error={error} />

      {/* Absent, not disabled, when there is no usable number. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {number ? (
          <Button
            small
            variant="outline"
            icon="phone"
            title={t('m.today.call')}
            onPress={() => void Linking.openURL(`tel:+${number}`)}
          />
        ) : null}
        {wa ? (
          <Button
            small
            variant="outline"
            icon="message-circle"
            title={t('appt.whatsapp')}
            onPress={() => void Linking.openURL(wa)}
          />
        ) : null}
        {live ? (
          <Button
            small
            variant="outline"
            icon="calendar"
            title={t('m.calendar.add')}
            onPress={() => void toCalendar()}
          />
        ) : null}
        {a.students ? (
          <Button
            small
            variant="outline"
            icon="user"
            title={t('appt.open_student')}
            onPress={() => {
              onClose()
              router.push(`/students/${a.students!.id}` as never)
            }}
          />
        ) : null}
      </View>
    </Sheet>
  )
}
