/**
 * Snapshot of the entry URL's password-recovery parameters, read at module load
 * — i.e. before the Supabase client's `detectSessionInUrl` consumes the tokens
 * and clears `window.location.hash`. Reading them from a component would be a
 * race, so take the snapshot once and let the pages consume it.
 *
 * Recovery links arrive in one of three shapes:
 *  - success: `#access_token=…&type=recovery` (default email template, via
 *    Supabase's /verify endpoint) — the client turns it into a session for us.
 *  - failure: `#error=access_denied&error_code=otp_expired&error_description=…`
 *  - `?token_hash=…&type=recovery` if the email template is switched to
 *    `{{ .TokenHash }}`; that one has to be redeemed with `verifyOtp`.
 */
export type RecoveryLink = {
  /** The URL is a recovery callback (as opposed to a plain visit). */
  isRecovery: boolean
  /** Present only on the `{{ .TokenHash }}` template; redeem with `verifyOtp`. */
  tokenHash: string | null
  errorCode: string | null
  errorDescription: string | null
}

function read(): RecoveryLink {
  if (typeof window === 'undefined') {
    return {
      isRecovery: false,
      tokenHash: null,
      errorCode: null,
      errorDescription: null,
    }
  }
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const get = (key: string) => search.get(key) ?? hash.get(key)
  return {
    // Only the success hash carries `type`; a failed link says nothing about
    // which flow it came from, so those are left to the page they landed on.
    isRecovery: get('type') === 'recovery',
    tokenHash: get('token_hash'),
    errorCode: get('error_code') ?? get('error'),
    errorDescription: get('error_description'),
  }
}

export const recoveryLink: RecoveryLink = read()
