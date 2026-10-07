import { Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { APP_VARIANT, EAS_PROJECT_ID } from './env'
import { kvGet, kvRemove, kvSet } from './kv'
import { rpcPending } from './rpcPending'
import { supabase } from './supabase'

/**
 * Push notifications.
 *
 * A push is a copy of a `notifications` row: the database writes the row, the
 * `notifications_dispatch_push` trigger hands it to the `send-push` function,
 * and that delivers it to every phone registered here. So this file's whole job
 * is to tell the database "this phone, this app, this language belongs to the
 * signed-in account" — and to take that back on sign-out.
 *
 * See docs/mobile-apps.md → "Push".
 */

// A notification that arrives while the app is open is still shown: it is the
// same event the bell would poll for a minute from now, and a banner is how
// somebody learns their session was just cancelled.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

/** The payload `send-push` attaches to every message. */
export type PushData = {
  notification_id: string
  academy_id: string
  kind: string
  payload: Record<string, unknown>
}

export function readPushData(
  notification: Notifications.Notification,
): PushData | null {
  const d = notification.request.content.data as Partial<PushData> | undefined
  return d && typeof d.notification_id === 'string' && typeof d.kind === 'string'
    ? (d as PushData)
    : null
}

/**
 * Ask for permission (once) and register this phone for the signed-in account.
 *
 * Quietly does nothing where a token cannot exist: a simulator without push
 * support, a build with no EAS project id, or a person who said no. None of
 * those is an error — the bell still works, it just is not pushed.
 */
export async function registerPushDevice(lang: 'en' | 'ms'): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return
  if (!Device.isDevice || !EAS_PROJECT_ID) return
  try {
    if (Platform.OS === 'android') {
      // Android 13 will not show its permission prompt until a channel exists.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Hawary',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }
    let { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status
    }
    if (status !== 'granted') return

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    })
    const { error } = await supabase.rpc('register_push_device', {
      _token: token,
      _app: APP_VARIANT,
      _platform: Platform.OS,
      _lang: lang,
    })
    if (!error) kvSet('hawary.pushToken', token)
  } catch (e) {
    console.warn('push registration failed', e)
  }
}

/**
 * Stop this phone receiving the current account's notifications. Called before
 * sign-out, while the session can still authorise the call.
 */
export async function forgetPushDevice(): Promise<void> {
  const token = kvGet('hawary.pushToken')
  if (!token) return
  kvRemove('hawary.pushToken')
  try {
    await rpcPending('unregister_push_device', { _token: token })
  } catch {
    // The next account to sign in on this phone takes the token over anyway
    // (register_push_device upserts on it), so a failure here heals itself.
  }
}
