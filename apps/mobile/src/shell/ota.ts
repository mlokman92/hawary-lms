import { useEffect, useRef } from 'react'
import { AppState, Platform } from 'react-native'
import { useT } from '@/lib/i18n'
import { confirm } from '@/ui'

/**
 * Over-the-air updates: a newer JavaScript bundle for the build already on the
 * phone, published with `eas update` (docs/mobile-apps.md → "Updates without a
 * store release").
 *
 * expo-updates already looks for one every time the app is launched and
 * downloads it in the background. Left alone, the new bundle is used at the
 * NEXT cold start — which on a phone can be days away. So this asks once, when
 * the download has finished: restart now, or later.
 *
 * It also looks again each time the app comes back to the front, because a
 * phone app is rarely "launched": it is brought back.
 */

type Ota = typeof import('expo-updates')

// Guarded on purpose. A binary built before expo-updates was added has no
// native module behind this package, and importing it there throws while the
// module loads — which would take the whole app down with it. Such a build
// simply never updates over the air.
let Updates: Ota | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Updates = require('expo-updates') as Ota
} catch {
  Updates = null
}

/** Off in development (the bundle comes from the dev server) and on the web. */
const ENABLED =
  !!Updates && Updates.isEnabled && !__DEV__ && Platform.OS !== 'web'

// One hook or the other for the life of the process, so the hook order never
// changes between renders.
const usePending: () => boolean =
  Updates && ENABLED
    ? () => Updates!.useUpdates().isUpdatePending
    : () => false

async function lookForUpdate() {
  if (!Updates) return
  try {
    const found = await Updates.checkForUpdateAsync()
    if (found.isAvailable) await Updates.fetchUpdateAsync()
  } catch {
    // Offline, or the update service said "not now". The next launch, or the
    // next time the app is brought forward, asks again.
  }
}

/**
 * @param ready false while the splash is up or the forced-update wall is
 * showing — neither is a moment to ask a question.
 */
export function useOtaUpdate(ready: boolean) {
  const { t } = useT()
  const pending = usePending()
  const asked = useRef(false)

  useEffect(() => {
    if (!ENABLED) return
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void lookForUpdate()
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    // Once per run of the app. Saying "later" means later: the new bundle is
    // used the next time the app is started cold, without being asked again.
    if (!pending || !ready || asked.current) return
    asked.current = true
    void confirm({
      title: t('m.ota.title'),
      message: t('m.ota.body'),
      confirmLabel: t('m.ota.restart'),
      cancelLabel: t('m.ota.later'),
    }).then((restart) => {
      if (restart) void Updates?.reloadAsync()
    })
  }, [pending, ready, t])
}
