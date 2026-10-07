import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Linking, Platform, View } from 'react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { AcademyProvider, useAcademy } from '@/lib/academy'
import { AuthProvider, useAuth } from '@/lib/auth'
import { IS_STUDENT_APP } from '@/lib/env'
import { LanguageProvider, useT } from '@/lib/i18n'
import { hydrateKv } from '@/lib/kv'
import { readPushData, registerPushDevice, type PushData } from '@/lib/push'
import { queryClient } from '@/lib/query'
import { StudentAcademyProvider } from '@/lib/studentAcademy'
import { supabase } from '@/lib/supabase'
import { useUpdateRequired } from '@/features/version/api'
import { Button, T, space, useTheme } from '@/ui'
import { FONT_FILES, ThemeProvider } from '@/ui/theme'
import { linkOf } from './links'
import { useScope } from './scope'

void SplashScreen.preventAutoHideAsync()

/**
 * Everything both apps mount above their routes: storage, theme, language,
 * data, session, memberships — in the web app's order, for the web app's
 * reasons (`apps/web/src/App.tsx`).
 *
 * Renders nothing until the key-value cache is hydrated and the typeface is
 * loaded, because the providers below read the stored language, theme and
 * academy during their first render. The splash screen covers the gap.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void hydrateKv().finally(() => setReady(true))
  }, [])
  // The typeface, too: drawing a first frame in the system font and then
  // swapping would make every screen jump. A font that fails to load is not a
  // reason to show nothing — the app falls back to the system face.
  const [fontsLoaded, fontError] = useFonts(FONT_FILES)
  if (!ready || !(fontsLoaded || fontError)) return null

  return (
    <ThemeProvider>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AcademyProvider>
              {IS_STUDENT_APP ? (
                <StudentAcademyProvider>{children}</StudentAcademyProvider>
              ) : (
                children
              )}
            </AcademyProvider>
          </AuthProvider>
        </QueryClientProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}

/**
 * Where a person belongs. One place, like the web app's `useLandingTarget`:
 *
 *   loading        nothing trustworthy to render yet
 *   signedOut      the sign-in screens
 *   noMembership   signed in, but not a member THIS app serves — pending
 *                  invitations, or "this account belongs in the other app"
 *   ready          the app
 */
export type Gate = 'loading' | 'signedOut' | 'noMembership' | 'ready'

export function useGate(): Gate {
  const { session, loading: authLoading } = useAuth()
  const { loading, staffMemberships, studentMemberships } = useAcademy()
  const uid = session?.user.id ?? null

  // Memberships are fetched in an effect, so for one render after sign-in the
  // context still says "not loading, no memberships" — which would flash the
  // no-membership screen at somebody who is about to be let in. Wait until the
  // fetch for THIS user has been seen to start.
  const [startedFor, setStartedFor] = useState<string | null>(null)
  useEffect(() => {
    if (uid && loading) setStartedFor(uid)
    if (!uid) setStartedFor(null)
  }, [uid, loading])

  if (authLoading) return 'loading'
  if (!uid) return 'signedOut'
  if (loading || startedFor !== uid) return 'loading'
  const mine = IS_STUDENT_APP ? studentMemberships : staffMemberships
  return mine.length > 0 ? 'ready' : 'noMembership'
}

/**
 * Opening the screen a push leads to.
 *
 * `send-push` attaches the notification's own `kind` and `data`, and the route
 * is computed here with `linkOf` — the function the notifications screen uses —
 * so a push and the row it copies cannot lead to different places.
 */
function usePushNavigation(enabled: boolean) {
  const { memberships, academyId, setAcademyId } = useScope()
  const handled = useRef<string | null>(null)

  useEffect(() => {
    // Push exists on a phone only; the web target is a development convenience.
    if (!enabled || Platform.OS === 'web') return

    function open(data: PushData | null) {
      if (!data || handled.current === data.notification_id) return
      handled.current = data.notification_id
      // The row is the record; reading it here is what clears the badge.
      void supabase
        .rpc('mark_notifications_read', { _ids: [data.notification_id] })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ['notifications'] })
          void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
        })
      // A notification belongs to one branch. Follow it there first, or the
      // screen it opens would be reading the wrong tenant.
      if (
        data.academy_id !== academyId &&
        memberships.some((m) => m.academyId === data.academy_id)
      ) {
        setAcademyId(data.academy_id)
      }
      const to = linkOf({
        kind: data.kind as never,
        data: data.payload as never,
      })
      if (to) router.push(to as never)
    }

    // The tap that launched the app, if one did.
    const last = Notifications.getLastNotificationResponse()
    if (last) open(readPushData(last.notification))

    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      open(readPushData(r.notification)),
    )
    return () => sub.remove()
  }, [enabled, memberships, academyId, setAcademyId])
}

/** Registers this phone once per signed-in user, and again if the language changes. */
function usePushRegistration(enabled: boolean) {
  const { user } = useAuth()
  const { lang } = useT()
  const uid = user?.id ?? null
  useEffect(() => {
    if (!enabled || !uid) return
    void registerPushDevice(lang)
  }, [enabled, uid, lang])
}

/**
 * The forced-update wall. Below the floor in `app_min_versions`, the app shows
 * this and nothing else — see `features/version/api.ts` for why it fails open.
 */
function UpdateWall({ storeUrl }: { storeUrl: string | null }) {
  const { c } = useTheme()
  const { t } = useT()
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: space.xl,
        gap: space.lg,
      }}
    >
      <T v="title" center>
        {t('m.update.title')}
      </T>
      <T muted center>
        {t('m.update.body')}
      </T>
      {storeUrl ? (
        <Button
          title={t('m.update.action')}
          onPress={() => void Linking.openURL(storeUrl)}
        />
      ) : null}
    </View>
  )
}

/**
 * Wraps the route tree: hides the splash once the gate has an answer, puts the
 * update wall in front when the build is too old, and wires push.
 */
export function AppFrame({
  gate,
  children,
}: {
  gate: Gate
  children: ReactNode
}) {
  const { c, dark } = useTheme()
  const { data: update } = useUpdateRequired()

  useEffect(() => {
    if (gate !== 'loading') void SplashScreen.hideAsync()
  }, [gate])

  usePushRegistration(gate === 'ready')
  usePushNavigation(gate === 'ready')

  const body = update?.required ? (
    <UpdateWall storeUrl={update.storeUrl} />
  ) : (
    children
  )

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {Platform.OS === 'web' ? (
        // The web preview: a phone-width column, so a desktop browser shows
        // the screen as a phone would rather than stretched across a monitor.
        <View style={{ flex: 1, alignItems: 'center', backgroundColor: c.border }}>
          <View
            style={{
              flex: 1,
              width: '100%',
              maxWidth: 480,
              backgroundColor: c.background,
              overflow: 'hidden',
            }}
          >
            {body}
          </View>
        </View>
      ) : (
        body
      )}
    </>
  )
}
