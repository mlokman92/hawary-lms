import { useState } from 'react'
import { Alert, View } from 'react-native'
import { addSessionToCalendar } from '@/lib/deviceCalendar'
import { errorMessage } from '@/lib/errors'
import { localeFor } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  APPOINTMENT_STATUS,
  DEFAULT_TZ,
  useAcademyTimezone,
  useBookAppointment,
  useBookingOptions,
  useCancelAppointment,
  useMyAppointments,
  type MyAppointment,
} from '@/features/appointments/api'
import { addDays, fmtWhen, today } from '@/features/appointments/calendar'
import { SlotPicker } from '@/features/appointments/SlotPicker'
import { useScope } from '@/shell/scope'
import {
  Badge,
  Button,
  Card,
  confirm,
  Empty,
  ErrorBlock,
  Field,
  FormError,
  Input,
  Loading,
  Screen,
  Section,
  Select,
  T,
  space,
} from '@/ui'

/** How far ahead one call reaches. The server clamps to the academy horizon. */
const WINDOW_DAYS = 62

/**
 * Book a one-to-one session, and see the ones already booked.
 *
 * Under round robin the server does not say who is free, so there is no
 * teacher picker — which is the point of the mode. The instructor's name
 * appears the moment the booking exists (docs/appointments.md).
 */
export default function AppointmentsTab() {
  const { t, lang } = useT()
  const locale = localeFor(lang)
  const { academyId, active } = useScope()
  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(academyId)
  const from = today(tz)
  const { data: options, isLoading, error, refetch, isRefetching } =
    useBookingOptions(academyId, from, addDays(from, WINDOW_DAYS))
  const { data: mine, refetch: refetchMine } = useMyAppointments(academyId)
  const book = useBookAppointment(academyId)
  const cancel = useCancelAppointment(academyId)

  const [startsAt, setStartsAt] = useState('')
  const [instructorId, setInstructorId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [bookError, setBookError] = useState<string | null>(null)

  if (isLoading) return <Loading />
  if (error) return <ErrorBlock error={error} onRetry={() => void refetch()} />

  const openSlots = options?.slots ?? []
  const slot = openSlots.find((s) => s.starts_at === startsAt) ?? null
  const choose = options?.assignment_mode === 'student_choice'
  const upcoming = (mine ?? []).filter(
    (a) => a.status === 'booked' && Date.parse(a.ends_at) >= Date.now(),
  )
  const past = (mine ?? []).filter((a) => !upcoming.includes(a))
  const atCap =
    options?.max_open_per_student != null &&
    (options.open_count ?? 0) >= options.max_open_per_student

  async function submit() {
    if (!startsAt) return
    setBookError(null)
    try {
      await book.mutateAsync({
        startsAt,
        instructorId: choose ? instructorId : null,
        note: note.trim() || null,
      })
      setStartsAt('')
      setInstructorId(null)
      setNote('')
    } catch (e) {
      setBookError(errorMessage(e, t('common.error')))
    }
  }

  async function onCancel(a: MyAppointment) {
    const ok = await confirm({
      title: t('appt.action.cancel'),
      message: fmtWhen(a.starts_at, tz, locale),
      confirmLabel: t('appt.action.cancel'),
      cancelLabel: t('common.back'),
      destructive: true,
    })
    if (!ok) return
    try {
      await cancel.mutateAsync({ id: a.id })
    } catch (e) {
      // The notice period is enforced by the server; its sentence is the
      // explanation.
      Alert.alert(t('appt.action.cancel'), errorMessage(e, t('common.error')))
    }
  }

  async function onCalendar(a: MyAppointment) {
    const outcome = await addSessionToCalendar({
      title: t('m.calendar.event_title', {
        name: a.instructor.full_name ?? t('common.instructor'),
      }),
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      notes: [active?.academy?.name, a.note].filter(Boolean).join('\n'),
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

  return (
    <Screen
      onRefresh={() => {
        void refetch()
        void refetchMine()
      }}
      refreshing={isRefetching}
    >
      {!options?.is_open ? (
        <Empty
          icon="calendar"
          title={t('appt.learn.closed')}
          body={t('appt.learn.closed_hint')}
        />
      ) : (
        <Section title={t('appt.learn.book_title')}>
          <Card style={{ gap: space.lg }}>
            {atCap ? (
              <T muted>{t('appt.learn.at_cap')}</T>
            ) : openSlots.length === 0 ? (
              <T muted>{t('appt.learn.nothing_free')}</T>
            ) : (
              <>
                <SlotPicker
                  slots={openSlots}
                  tz={tz}
                  locale={locale}
                  value={startsAt}
                  onChange={(v) => {
                    setStartsAt(v)
                    setInstructorId(null)
                  }}
                />
                {slot ? (
                  <>
                    {choose ? (
                      <Field label={t('appt.learn.instructor')}>
                        <Select
                          value={instructorId}
                          options={(slot.instructors ?? []).map((i) => ({
                            value: i.id,
                            label: i.full_name ?? t('common.unnamed'),
                          }))}
                          onChange={setInstructorId}
                          placeholder={t('appt.learn.instructor_placeholder')}
                          title={t('appt.learn.instructor')}
                        />
                      </Field>
                    ) : null}
                    <Field label={t('appt.learn.note')}>
                      <Input
                        value={note}
                        onChangeText={setNote}
                        placeholder={t('appt.learn.note_placeholder')}
                      />
                    </Field>
                    <FormError error={bookError} />
                    <Button
                      title={
                        book.isPending
                          ? t('appt.booking')
                          : `${t('appt.book')} · ${fmtWhen(slot.starts_at, tz, locale)}`
                      }
                      loading={book.isPending}
                      disabled={choose && !instructorId}
                      onPress={() => void submit()}
                    />
                  </>
                ) : null}
              </>
            )}
          </Card>
        </Section>
      )}

      <Section title={t('appt.learn.mine')}>
        {(mine ?? []).length === 0 ? (
          <Card>
            <T muted center>
              {t('appt.learn.none')}
            </T>
          </Card>
        ) : (
          <>
            {upcoming.map((a) => (
              <Card key={a.id} style={{ gap: space.sm }}>
                <T style={{ fontWeight: '600' }}>{fmtWhen(a.starts_at, tz, locale)}</T>
                <T v="small" muted>
                  {a.instructor.full_name ?? t('common.unnamed')}
                  {a.note ? ` · ${a.note}` : ''}
                </T>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button
                    small
                    variant="outline"
                    icon="calendar"
                    title={t('m.calendar.add')}
                    onPress={() => void onCalendar(a)}
                  />
                  <Button
                    small
                    variant="ghost"
                    title={t('appt.action.cancel')}
                    disabled={cancel.isPending}
                    onPress={() => void onCancel(a)}
                  />
                </View>
              </Card>
            ))}
            {past.length > 0 ? (
              <Card flush>
                {past.map((a, i) => {
                  const meta = APPOINTMENT_STATUS[a.status]
                  return (
                    <View
                      key={a.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        padding: space.lg,
                        borderTopWidth: i === 0 ? 0 : 0.5,
                        borderTopColor: '#8884',
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <T>{fmtWhen(a.starts_at, tz, locale)}</T>
                        <T v="small" muted>
                          {a.instructor.full_name ?? t('common.unnamed')}
                        </T>
                      </View>
                      <Badge label={t(meta.labelKey)} tone={meta.tone} />
                    </View>
                  )
                })}
              </Card>
            ) : null}
          </>
        )}
      </Section>
    </Screen>
  )
}
