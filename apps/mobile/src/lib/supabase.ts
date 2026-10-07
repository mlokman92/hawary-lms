import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import { createHawaryClient } from '@hawary/shared'
import { SUPABASE_KEY, SUPABASE_URL } from './env'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy apps/mobile/.env.example to apps/mobile/.env.local and fill in the values.',
  )
}

/**
 * The app's Supabase client (publishable key + RLS). Never the service-role key.
 *
 * The session is kept in AsyncStorage, and there is no URL to read one from.
 */
export const supabase = createHawaryClient(SUPABASE_URL, SUPABASE_KEY, {
  storage: AsyncStorage,
  detectSessionInUrl: false,
})

// A backgrounded app has no timers to speak of, so the token is refreshed only
// while the app is in front — and immediately on coming back, which is also the
// moment `login_events` records a return (docs/analytics.md).
AppState.addEventListener('change', (state) => {
  if (state === 'active') void supabase.auth.startAutoRefresh()
  else void supabase.auth.stopAutoRefresh()
})
