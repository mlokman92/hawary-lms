const RELOADED_KEY = 'hawary.buildReload'
const CHECK_EVERY_MS = 60_000

// The id of the deployed build, once it is known to differ from this one.
let newerBuild: string | null = null
let lastCheck = 0

/**
 * Reload at most once per `reason` in this tab. The guard is what stops a
 * reload that did not fix anything (a CDN still serving the old index.html, a
 * chunk that is really gone) from becoming a loop.
 */
function reloadOnce(reason: string) {
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === reason) return
    sessionStorage.setItem(RELOADED_KEY, reason)
  } catch {
    // Storage is blocked, so there is no guard — and no guard means no reload.
    return
  }
  window.location.reload()
}

/** Ask the host which build is deployed. Throttled; safe to call often. */
export async function checkBuild() {
  if (import.meta.env.DEV) return
  if (Date.now() - lastCheck < CHECK_EVERY_MS) return
  lastCheck = Date.now()
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return
    const { id } = (await res.json()) as { id?: string }
    newerBuild = id && id !== __BUILD_ID__ ? id : null
  } catch {
    // Offline or mid-deploy. The next check asks again.
  }
}

/** Load the deployed build if it is newer than the one running. */
export function reloadIfNewerBuild() {
  if (newerBuild) reloadOnce(`build:${newerBuild}`)
}

/**
 * A lazy chunk of the build this tab was loaded on stops existing the moment a
 * newer one is deployed, and the SPA fallback answers its URL with index.html.
 * Load the new build rather than leave the Suspense boundary dead.
 */
export function reloadOnMissingChunk() {
  window.addEventListener('vite:preloadError', () => {
    reloadOnce(`chunk:${__BUILD_ID__}`)
  })
}
