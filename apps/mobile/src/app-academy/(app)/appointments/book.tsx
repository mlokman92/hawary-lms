import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { errorMessage } from '@/lib/errors'
import { localeFor } from '@/lib/format'
import { useT } from '@/lib/i18n'
import {
  DEFAULT_TZ,
  useAcademyAvailability,
  useAcademyTimezone,
  useBookAppointment,
} from '@/features/appointments/api'
import { addDays, fmtWhen, today } from '@/features/appointments/calendar'
import { SlotPicker } from '@/features/appointments/SlotPicker'
import { useMyInstructorRecord } from '@/features/profile/api'
import { useStudents } from '@/features/students/api'
import { useScope } from '@/shell/scope'
import {
  Button,
  Card,
  Empty,
  Field,
  FormError,
  Input,
  Loading,
  Row,
  Screen,
  SearchInput,
  Select,
  T,
  space,
} from '@/ui'

const WINDOW_DAYS = 62
const AUTO = 'auto'

/**
 * Book a session for a student — the web's `BookForStudentDialog`.
 *
 * Who may name an instructor is the database's rule, mirrored here so no
 * control fails on submit: an admin may hand the session to anyone free at that
 * time, or leave it to the rota; a trainer books **herself**, so she has no
 * picker and is offered only the times she is free for
 * (docs/appointments.md → "Who may name an instructor").
 */
export default function BookScreen() {
  const { t, lang } = useT()
  const locale = localeFor(lang)
  const router = useRouter()
  const params = useLocalSearchParams<{ student?: string }>()
  const { academyId, isAdmin } = useScope()
  const { data: tz = DEFAULT_TZ } = useAcademyTimezone(academyId)
  const me = useMyInstructorRecord(academyId)
  const mineId = me.data?.id ?? null
  const { data: students } = useStudents(academyId)
  const from = today(tz)
  const { data: slots, isLoading } = useAcademyAvailability(
    academyId,
    from,
    addDays(from, WINDOW_DAYS),
  )
  const book = useBookAppointment(academyId)

  const [studentId, setStudentId] = useState<string | null>(params.student ?? null)
  const [search, setSearch] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [instructorId, setInstructorId] = useState<string>(AUTO)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  // A trainer is offered only the times SHE is free for, and the count on each
  // chip becomes 1: the academy-wide figure would be a lie on a slot that can
  // only be booked one way.
  const offered = useMemo(() => {
    const all = slots ?? []
    if (isAdmin || !mineId) return all
    return all
      .filter((s) => (s.instructors ?? []).some((i) => i.id === mineId))
      .map((s) => ({ ...s, capacity: 1 }))
  }, [slots, isAdmin, mineId])

  const student = (students ?? []).find((s) => s.id === studentId) ?? null
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return (students ?? [])
      .filter(
        (s) =>
          (s.full_name ?? '').toLowerCase().includes(q) ||
          (s.email ?? '').toLowerCase().includes(q) ||
          s.student_no.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [students, search])

  const slot = offered.find((s) => s.starts_at === startsAt) ?? null
  const blocked = !isAdmin && !mineId && !me.isLoading

  async function submit() {
    if (!studentId || !startsAt) return
    setError(null)
    try {
      await book.mutateAsync({
        startsAt,
        studentId,
        instructorId: isAdmin ? (instructorId === AUTO ? null : instructorId) : mineId,
        note: note.trim() || null,
      })
      router.back()
    } catch (e) {
      setError(errorMessage(e, t('common.error')))
    }
  }

  if (blocked) {
    return (
      <Screen>
        <Stack.Screen options={{ title: t('appt.book_for.title') }} />
        <Empty icon="user-x" title={t('appt.book_for.no_record')} />
      </Screen>
    )
  }

  return (
    <Screen
      footer={
        <>
          <FormError error={error} />
          <Button
            title={
              book.isPending
                ? t('appt.booking')
                : slot
                  ? `${t('appt.book')} · ${fmtWhen(slot.starts_at, tz, locale)}`
                  : t('appt.book')
            }
            loading={book.isPending}
            disabled={!studentId || !slot}
            onPress={() => void submit()}
          />
        </>
      }
    >
      <Stack.Screen options={{ title: t('appt.book_for.title') }} />

      <Field label={t('appt.book_for.student')}>
        {student ? (
          <Card flush>
            <Row
              first
              title={student.full_name || student.email || t('common.unnamed')}
              subtitle={student.student_no}
              right={
                <Button
                  small
                  variant="ghost"
                  title={t('appt.book_for.change')}
                  onPress={() => setStudentId(null)}
                />
              }
            />
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            <SearchInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('appt.book_for.student_search')}
            />
            {search.trim().length >= 2 ? (
              <Card flush>
                {matches.length === 0 ? (
                  <T muted style={{ padding: space.lg }}>
                    {t('appt.book_for.no_students')}
                  </T>
                ) : (
                  matches.map((s, i) => (
                    <Row
                      key={s.id}
                      first={i === 0}
                      title={s.full_name || s.email || t('common.unnamed')}
                      subtitle={s.student_no}
                      chevron={false}
                      onPress={() => {
                        setStudentId(s.id)
                        setSearch('')
                      }}
                    />
                  ))
                )}
              </Card>
            ) : null}
          </View>
        )}
      </Field>

      <Field label={t('appt.book_for.time')}>
        {isLoading ? (
          <Loading />
        ) : offered.length === 0 ? (
          <T muted>{t('appt.learn.nothing_free')}</T>
        ) : (
          <SlotPicker
            slots={offered}
            tz={tz}
            locale={locale}
            value={startsAt}
            onChange={(v) => {
              setStartsAt(v)
              setInstructorId(AUTO)
            }}
          />
        )}
      </Field>

      {slot && isAdmin ? (
        <Field label={t('appt.book_for.instructor')}>
          <Select
            value={instructorId}
            onChange={setInstructorId}
            title={t('appt.book_for.instructor')}
            options={[
              { value: AUTO, label: t('appt.book_for.auto_any') },
              ...(slot.instructors ?? []).map((i) => ({
                value: i.id,
                label: i.full_name ?? t('common.unnamed'),
              })),
            ]}
          />
        </Field>
      ) : null}

      <Field label={t('appt.book_for.note')}>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder={t('appt.book_for.note_placeholder')}
        />
      </Field>
    </Screen>
  )
}
