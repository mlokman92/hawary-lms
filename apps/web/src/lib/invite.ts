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
 * Is this failure final, or might a retry succeed?
 *
 * Only a terminal outcome may clear the persisted token: clearing on ANY error
 * means one offline moment permanently destroys the bridge that every recovery
 * path depends on. These strings are the raise messages in accept_invitation.
 */
const TERMINAL_PATTERNS = [
  'invitation not found',
  'no longer valid',
  'has expired',
  'invited email address',
  'already linked to another account',
  'already linked to a student',
  'already linked to an instructor',
  'archived or already linked',
  'malformed invitation',
]

export function isTerminalInviteError(message: string): boolean {
  const m = message.toLowerCase()
  return TERMINAL_PATTERNS.some((p) => m.includes(p))
}
