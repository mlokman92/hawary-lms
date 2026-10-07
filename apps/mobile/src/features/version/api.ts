import { Platform } from 'react-native'
import * as Application from 'expo-application'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { APP_VARIANT } from '@/lib/env'

/**
 * The forced-update check.
 *
 * `app_min_versions` holds the oldest build of each app that may still run. The
 * owner raises it in SQL after a change an old build cannot survive (a dropped
 * RPC, a renamed column); a build below the floor shows a link to the store and
 * nothing else.
 *
 * Fails OPEN. If the row cannot be read — no signal, an outage — the app runs:
 * locking everybody out because a version check could not reach the server
 * would turn a small problem into a total one.
 */
export type UpdateState = { required: boolean; storeUrl: string | null }

/** Compares `1.4.0`-style versions numerically, missing parts counting as 0. */
export function isOlder(current: string, minimum: string): boolean {
  const a = current.split('.').map((n) => parseInt(n, 10) || 0)
  const b = minimum.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

export function useUpdateRequired() {
  return useQuery({
    queryKey: ['app-min-version', APP_VARIANT, Platform.OS] as const,
    enabled: Platform.OS === 'ios' || Platform.OS === 'android',
    // Once per launch is enough; the floor moves a few times a year.
    staleTime: Infinity,
    retry: 0,
    queryFn: async (): Promise<UpdateState> => {
      const current = Application.nativeApplicationVersion
      if (!current) return { required: false, storeUrl: null }
      const { data, error } = await supabase
        .from('app_min_versions')
        .select('min_version, store_url')
        .eq('app', APP_VARIANT)
        .eq('platform', Platform.OS)
        .maybeSingle()
      if (error || !data) return { required: false, storeUrl: null }
      return {
        required: isOlder(current, data.min_version),
        storeUrl: data.store_url,
      }
    },
  })
}
