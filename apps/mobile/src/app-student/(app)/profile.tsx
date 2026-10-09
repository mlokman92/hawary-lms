import { View } from 'react-native'
import { Stack } from 'expo-router'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useLearner } from '@/features/learn/context'
import { STATUS_META } from '@/features/students/status'
import {
  BankAccountCard,
  PreferencesCard,
  ProfileCard,
  StudentDetailsCard,
} from '@/screens/Account'
import { Badge, Card, Screen, T, space } from '@/ui'

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
      <T muted>{label}</T>
      <T style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>
        {value || '—'}
      </T>
    </View>
  )
}

/**
 * My profile: the account (editable), the record the academy holds (not), the
 * details the student fills in themselves, the bank account incentive payouts
 * go to, and the device preferences.
 */
export default function ProfileScreen() {
  const { t } = useT()
  const { academyId, academyName, student } = useLearner()

  return (
    <Screen>
      <Stack.Screen options={{ title: t('lacct.profile.title') }} />
      <ProfileCard />

      <Card style={{ gap: space.md }}>
        <T v="heading">{t('lacct.profile.record')}</T>
        {student ? (
          <>
            <Fact label={t('lacct.profile.academy')} value={academyName} />
            <Fact label={t('lacct.profile.student_no')} value={student.student_no} />
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}
            >
              <T muted>{t('common.status')}</T>
              <Badge
                label={t(STATUS_META[student.status].labelKey)}
                variant={STATUS_META[student.status].variant}
              />
            </View>
            <Fact label={t('lacct.profile.email_on_record')} value={student.email} />
            <Fact label={t('lacct.profile.phone_on_record')} value={student.phone} />
            <Fact label={t('lacct.profile.joined')} value={fmtDate(student.created_at)} />
            <T v="small" muted>
              {t('lacct.profile.managed_by_academy')}
            </T>
          </>
        ) : (
          <T muted>
            {t('lacct.profile.no_record', {
              academy: academyName ?? t('academy.this_academy'),
            })}
          </T>
        )}
      </Card>

      {/* Neither card has anything to attach to without an academy record:
          both are keyed by the student row. */}
      {academyId && student ? (
        <>
          <StudentDetailsCard key={student.id} academyId={academyId} student={student} />
          <BankAccountCard academyId={academyId} studentId={student.id} canEdit />
        </>
      ) : null}

      <PreferencesCard />
    </Screen>
  )
}
