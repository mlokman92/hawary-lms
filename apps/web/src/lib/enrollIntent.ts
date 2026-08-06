/**
 * The academy someone is on their way to join, kept across the auth hop.
 *
 * Same job and same shape as lib/invite.ts, and it exists for a failure that is
 * already documented: GoTrue silently drops `emailRedirectTo` when the URL is
 * not on its redirect allow list (docs/production-urls.md), so the confirmation
 * link lands on the Site URL with no `?next=`. Without this the person who
 * clicked "join this academy" arrives at "create your academy" — the opposite
 * of what they came to do.
 *
 * Same device only, and cleared on sign-out with the other tenant keys.
 */
const KEY = 'hawary.enrollIntent'

export function setEnrollIntent(slug: string): void {
  try {
    localStorage.setItem(KEY, slug)
  } catch {
    // ignore (private mode / storage disabled)
  }
}

export function getEnrollIntent(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearEnrollIntent(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

export const enrollPath = (slug: string) => `/enroll/${encodeURIComponent(slug)}`
