import { Linking, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { waLink, waNumber } from '@/lib/phone'
import { useInstructor, useInstructorCourses } from '@/features/instructors/api'
import { STATUS_META } from '@/features/instructors/status'
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorBlock,
  Loading,
  Row,
  Screen,
  Section,
  T,
  space,
} from '@/ui'

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <T muted style={{ width: 120 }}>
        {label}
      </T>
      <T style={{ flex: 1 }}>{value}</T>
    </View>
  )
}

/** One instructor, read-only: who they are, how to reach them, what they teach. */
export default function InstructorScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const { t } = useT()
  const { data: ins, isLoading, error } = useInstructor(id)
  const { data: courses } = useInstructorCourses(id)

  if (isLoading) return <Loading />
  if (error || !ins) {
    return <ErrorBlock error={error ?? new Error(t('instructors.not_found'))} />
  }

  const number = waNumber(ins.phone)
  const wa = waLink(ins.phone)

  return (
    <Screen>
      <Stack.Screen options={{ title: t('common.instructor') }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar uri={ins.avatar_url} name={ins.full_name} email={ins.email} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="title" numberOfLines={2}>
            {ins.full_name || ins.email || t('instructors.unnamed')}
          </T>
          <T v="small" muted>
            {t('instructors.member_since', {
              date: fmtDate(ins.created_at),
              no: ins.instructor_no,
            })}
          </T>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Badge
              label={t(STATUS_META[ins.status].labelKey)}
              variant={STATUS_META[ins.status].variant}
            />
            {ins.user_id ? (
              <Badge label={t('instructors.account_linked')} variant="outline" />
            ) : null}
          </View>
        </View>
      </View>

      {number ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            style={{ flex: 1 }}
            variant="outline"
            icon="phone"
            title={t('m.today.call')}
            onPress={() => void Linking.openURL(`tel:+${number}`)}
          />
          {wa ? (
            <Button
              style={{ flex: 1 }}
              variant="outline"
              icon="message-circle"
              title={t('appt.whatsapp')}
              onPress={() => void Linking.openURL(wa)}
            />
          ) : null}
        </View>
      ) : null}

      <Card style={{ gap: space.sm }}>
        <T v="heading">{t('instructors.personal.title')}</T>
        <Fact label={t('common.email')} value={ins.email} />
        <Fact label={t('common.phone')} value={ins.phone} />
        <Fact label={t('instructors.field.specialization')} value={ins.specialization} />
        <Fact label={t('instructors.field.bio')} value={ins.bio} />
      </Card>

      <Section title={t('instructors.courses.title')}>
        <Card flush>
          {(courses ?? []).length === 0 ? (
            <T muted style={{ padding: space.lg }}>
              {t('instructors.courses.empty')}
            </T>
          ) : (
            (courses ?? []).map((c, i) => (
              <Row
                key={c.id}
                first={i === 0}
                title={c.courses?.title ?? t('common.untitled')}
              />
            ))
          )}
        </Card>
      </Section>
    </Screen>
  )
}
