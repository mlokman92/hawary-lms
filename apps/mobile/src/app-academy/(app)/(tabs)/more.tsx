import { useRouter } from 'expo-router'
import { useT } from '@/lib/i18n'
import { usePendingEnrollmentCount } from '@/features/enrollment/api'
import { useScope } from '@/shell/scope'
import { Card, Row, Screen, T } from '@/ui'

/**
 * Everything that is not one of the four tabs.
 *
 * The money rows are drawn for an admin only. Hiding a row is not the boundary
 * — RLS is, and the screens guard themselves too — but a control the reader's
 * role cannot use is one that should not be there.
 */
export default function MoreTab() {
  const { t } = useT()
  const router = useRouter()
  const { academyId, isAdmin } = useScope()
  const { data: requests = 0 } = usePendingEnrollmentCount(academyId)
  const go = (to: string) => () => router.push(to as never)

  return (
    <Screen>
      <Card flush>
        <Row first icon="calendar" title={t('nav.appointments')} onPress={go('/appointments')} />
        <Row icon="book-open" title={t('nav.courses')} onPress={go('/courses')} />
        <Row
          icon="user-plus"
          title={t('nav.enrollments')}
          right={requests > 0 ? <T bold>{requests}</T> : null}
          onPress={go('/enrollments')}
        />
        <Row icon="award" title={t('nav.instructors')} onPress={go('/instructors')} />
        <Row icon="volume-2" title={t('m.ann.title')} onPress={go('/announcements')} />
      </Card>

      {isAdmin ? (
        <Card flush>
          <Row first icon="credit-card" title={t('nav.payments')} onPress={go('/payments')} />
          <Row icon="list" title={t('nav.payment_log')} onPress={go('/payments/log')} />
          <Row icon="gift" title={t('nav.incentives')} onPress={go('/incentives')} />
        </Card>
      ) : null}

      <Card flush>
        <Row first icon="user" title={t('user.profile')} onPress={go('/profile')} />
      </Card>
    </Screen>
  )
}
