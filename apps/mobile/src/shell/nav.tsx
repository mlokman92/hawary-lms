import { View } from 'react-native'
import { Stack, Tabs, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { useT, type TKey } from '@/lib/i18n'
import { useUnreadCount } from '@/features/notifications/api'
import { IconButton, T, font, useTheme, type IconName } from '@/ui'
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

/** A pushed screen's header: the canvas colour, no rule under it, a bold title. */
function useHeaderOptions() {
  const { c } = useTheme()
  return {
    headerStyle: { backgroundColor: c.background },
    headerTintColor: c.foreground,
    headerTitleStyle: { color: c.foreground, fontFamily: font(700), fontSize: 17 },
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
    <IconButton
      surface
      name="bell"
      label={t('notif.open')}
      badge={unread}
      onPress={() => router.push('/notifications' as never)}
    />
  )
}

/**
 * The header of a tab: the section's name, large, with the bell beside it.
 * A tab is a place rather than a step, so it gets a title the size of a
 * heading instead of a navigation bar.
 */
function TabHeader({ title }: { title: string }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{
        backgroundColor: c.background,
        paddingTop: insets.top + 14,
        paddingHorizontal: 20,
        paddingBottom: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <T v="display" style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </T>
      <HeaderBell />
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
  const { c, dark } = useTheme()
  const { t } = useT()
  const insets = useSafeAreaInsets()
  return (
    <Tabs
      screenOptions={{
        header: ({ options }) => <TabHeader title={options.title ?? ''} />,
        sceneStyle: { backgroundColor: c.background },
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopWidth: dark ? 1 : 0,
          borderTopColor: c.border,
          // The tab item pads itself by 5 all round, so the pill (30) and the
          // label (16) need 56 between the bar's own padding or the label's
          // descenders are cut off.
          height: 72 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
          ...(dark ? null : { boxShadow: '0 -4px 18px rgba(24,24,27,0.06)' }),
        },
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.mutedForeground,
        // Five tabs on a 360-wide phone leave 72 each: the longest label
        // ("Appointments", "Papan pemuka") fits at this size and no larger.
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarLabelStyle: { fontFamily: font(600), fontSize: 10.5, marginTop: 2 },
        tabBarBadgeStyle: {
          backgroundColor: c.destructive,
          color: '#ffffff',
          fontFamily: font(700),
          fontSize: 10,
        },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.titleKey),
            // The active tab is a tinted pill behind its icon as well as a
            // colour: a second cue, for anyone to whom teal and grey look alike.
            tabBarIcon: ({ color, focused }) => (
              <View
                style={{
                  width: 54,
                  height: 30,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: focused ? c.brandSoft : 'transparent',
                }}
              >
                <Feather name={tab.icon} size={20} color={color} />
              </View>
            ),
            tabBarBadge: tab.badge && tab.badge > 0 ? tab.badge : undefined,
          }}
        />
      ))}
    </Tabs>
  )
}
