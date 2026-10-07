import { View } from 'react-native'
import { Stack, Tabs, useRouter } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import { useT, type TKey } from '@/lib/i18n'
import { useUnreadCount } from '@/features/notifications/api'
import { IconButton, useTheme, type IconName } from '@/ui'
import { AppFrame, AppProviders, useGate } from './AppRoot'
import { useScope } from './scope'

/**
 * The navigation skeleton both apps share. Each app's route tree supplies the
 * screens; these supply the frame, so the two apps cannot drift apart in how a
 * header looks or what happens when a session ends.
 *
 *   _layout.tsx              RootLayout   providers + the three-way gate
 *   (auth)/_layout.tsx       AuthLayout   sign in / sign up / forgot
 *   onboarding.tsx                        signed in, no membership here
 *   (app)/_layout.tsx        AppLayout    everything behind sign-in
 *   (app)/(tabs)/_layout.tsx AppTabs      the bottom bar
 */

function useHeaderOptions() {
  const { c } = useTheme()
  return {
    headerStyle: { backgroundColor: c.card },
    headerTintColor: c.foreground,
    headerTitleStyle: { color: c.foreground, fontWeight: '600' as const },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
    contentStyle: { backgroundColor: c.background },
  }
}

function Gated() {
  const gate = useGate()
  const { c } = useTheme()
  return (
    <AppFrame gate={gate}>
      {gate === 'loading' ? (
        <View style={{ flex: 1, backgroundColor: c.background }} />
      ) : (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: c.background },
          }}
        >
          {/* The guard is on the group, not the screens: a link to a screen
              the reader may not see yet lands them on the group they may. */}
          <Stack.Protected guard={gate === 'signedOut'}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={gate === 'noMembership'}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
          <Stack.Protected guard={gate === 'ready'}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
      )}
    </AppFrame>
  )
}

export function RootLayout() {
  return (
    <AppProviders>
      <Gated />
    </AppProviders>
  )
}

export function AuthLayout() {
  const { c } = useTheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
      }}
    />
  )
}

export function AppLayout() {
  const options = useHeaderOptions()
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  )
}

/** The bell. A badge above zero only — "0" is decoration. */
export function HeaderBell() {
  const router = useRouter()
  const { t } = useT()
  const { academyId } = useScope()
  const { data: unread = 0 } = useUnreadCount(academyId)
  return (
    <View style={{ marginRight: 8 }}>
      <IconButton
        name="bell"
        label={t('notif.open')}
        badge={unread}
        onPress={() => router.push('/notifications' as never)}
      />
    </View>
  )
}

export type TabSpec = {
  name: string
  titleKey: TKey
  icon: IconName
  /** A count on the tab, drawn only above zero. */
  badge?: number
}

export function AppTabs({ tabs }: { tabs: TabSpec[] }) {
  const { c } = useTheme()
  const { t } = useT()
  const header = useHeaderOptions()
  return (
    <Tabs
      screenOptions={{
        headerStyle: header.headerStyle,
        headerTintColor: header.headerTintColor,
        headerTitleStyle: header.headerTitleStyle,
        headerShadowVisible: false,
        headerRight: () => <HeaderBell />,
        sceneStyle: { backgroundColor: c.background },
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        tabBarActiveTintColor: c.foreground,
        tabBarInactiveTintColor: c.mutedForeground,
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.titleKey),
            tabBarIcon: ({ color, size }) => (
              <Feather name={tab.icon} size={size - 2} color={color} />
            ),
            tabBarBadge: tab.badge && tab.badge > 0 ? tab.badge : undefined,
          }}
        />
      ))}
    </Tabs>
  )
}
