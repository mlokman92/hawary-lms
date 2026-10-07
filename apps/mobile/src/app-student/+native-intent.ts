import { routeForIncomingLink } from '@/shell/links'

/**
 * Every link that opens the app passes through here first: an email link to
 * the web app (through universal links), or one on the app's own scheme. The
 * web app's paths are translated into this app's routes in one place —
 * `shell/links.ts` — and a link that cannot be read opens the home screen
 * rather than an error.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return routeForIncomingLink(path)
  } catch {
    return '/'
  }
}
