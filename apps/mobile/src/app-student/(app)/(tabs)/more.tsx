import { Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { useT } from '@/lib/i18n'
import { SUPPORT_WHATSAPP_URL } from '@/lib/support'
import { Card, Row, Screen } from '@/ui'

/** Everything that is not one of the four tabs. */
export default function MoreTab() {
  const { t } = useT()
  const router = useRouter()
  const go = (to: string) => () => router.push(to as never)
  return (
    <Screen>
      <Card flush>
        <Row first icon="clipboard" title={t('nav.learn.reports')} onPress={go('/reports')} />
        <Row icon="credit-card" title={t('nav.learn.billing')} onPress={go('/billing')} />
        <Row icon="volume-2" title={t('m.ann.title')} onPress={go('/announcements')} />
        <Row icon="user" title={t('nav.learn.profile')} onPress={go('/profile')} />
      </Card>
      <Card flush>
        <Row
          first
          icon="message-circle"
          title={t('common.help_whatsapp')}
          onPress={() => void Linking.openURL(SUPPORT_WHATSAPP_URL)}
        />
      </Card>
    </Screen>
  )
}
