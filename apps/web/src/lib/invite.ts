import { errorCode } from './errors'

// Pending-invite persistence. Bridges the invite token across the auth hop
// (signup -> email confirm -> signin) in case the ?next= query is stripped by
// the Supabase redirect allowlist. Same-device only (localStorage).
const PENDING_INVITE_KEY = 'hawary.pendingInvite'

export function setPendingInvite(token: string): void {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, token)
  } catch {
    // ignore (private mode / storage disabled)
  }
}

export function getPendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_KEY)
  } catch {
    return null
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY)
  } catch {
    // ignore
  }
}

export function acceptInvitePath(token: string): string {
  return `/accept-invite?token=${encodeURIComponent(token)}`
}

/**
 * Insufficient privilege. `accept_invitation` is granted to `authenticated`
 * and not to `anon`, so a caller who reaches it and is refused was being read
 * as `anon` — their token did not attach. A session problem, not a verdict.
 */
const RETRYABLE_SQLSTATES = new Set(['42501'])

/** Postgres classes that mean the database was unavailable, not unwilling. */
const RETRYABLE_CLASSES = new Set([
  '08', // connection exception
  '40', // transaction rollback (serialization failure, deadlock)
  '53', // insufficient resources
  '57', // operator intervention (query cancelled, admin shutdown)
])

/**
 * Might a retry succeed, or has the server already judged this invitation?
 *
 * Classify on the error `code`, never on the message. The previous test matched
 * the raise text against a list of English phrases and treated anything it did
 * not recognise as retryable — so a rejection nobody had listed left the token
 * in place for good, and `PendingInviteRedirect` sent the person back to
 * /accept-invite from every landing route afterwards. That is how an academy
 * admin who opened an invite link meant for someone else lost access to their
 * own academy: signing out, signing back in and resetting the password all
 * landed on the same dead invitation.
 *
 * The token survives only where the invitation was never actually judged.
 * Erring towards `false` is the point — an unrecognised failure now releases
 * the stashed token instead of outliving it — but the cases below genuinely
 * say "ask again" rather than "no", and discarding a live invitation over a
 * pooler blip would be its own small betrayal.
 */
export function isRetryableInviteError(e: unknown): boolean {
  const code = errorCode(e)
  // PostgREST did not answer in its own voice: a transport failure, or a body
  // that would not parse as JSON. Either way nothing looked at the token.
  if (code === '') return true
  // A `PGRST…` code means PostgREST answered for itself, so the function still
  // never ran: no database to reach (`PGRST0xx`, `PGRSTX00`), a JWT it would
  // not take (`PGRST3xx`), or a schema cache that has not caught up with a
  // migration yet (`PGRST2xx`). Only `PGRST1xx` — the request itself was
  // malformed — is beyond help by repeating it.
  if (code.startsWith('PGRST')) return !code.startsWith('PGRST1')
  // Length-checked because the class test is only meaningful for a SQLSTATE:
  // some SDKs put a stringified HTTP status in `code`, and '404' would
  // otherwise read as class 40, "transaction rollback".
  if (code.length !== 5) return false
  return RETRYABLE_SQLSTATES.has(code) || RETRYABLE_CLASSES.has(code.slice(0, 2))
}
