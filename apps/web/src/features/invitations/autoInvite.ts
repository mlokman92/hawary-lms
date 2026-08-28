import { supabase } from '@/lib/supabase'
import type { SendInvitationResult } from '@/features/students/api'

/**
 * Mint a token for a record that was just created, and email it.
 *
 * Adding somebody now invites them. There is no button any more, so this is the
 * one place the two calls live: `create_*_invitation` mints the token, then
 * `send-invitation` re-reads the row under the caller's own JWT and posts it to
 * the provider. The record id never leaves this function as an address — the
 * function resolves the recipient itself, which is what stops it being a relay.
 *
 * **It never throws.** The record already exists by the time this runs, and it
 * is claimable with no token at all — a student or instructor row carrying
 * somebody's confirmed email is an invitation in itself
 * (`docs/account-claiming.md`). So a failure here is a missed *notification*,
 * not a missed grant, and it must not roll back or block the thing the person
 * actually did. Three failures are ordinary rather than exceptional:
 *
 *   - no email on the record — nothing to send to;
 *   - a trainer adding an instructor — `create_instructor_invitation` is
 *     admin-only by deliberate hardening, and refusing is correct;
 *   - the provider being down or rate-limited.
 *
 * Returns true only when the provider accepted the message, which is what the
 * CSV import counts.
 */
export async function sendRecordInvite(
  kind: 'student' | 'instructor',
  recordId: string,
): Promise<boolean> {
  const minted =
    kind === 'student'
      ? await supabase.rpc('create_invitation', { _student_id: recordId })
      : await supabase.rpc('create_instructor_invitation', {
          _instructor_id: recordId,
        })
  if (minted.error) return false

  const { token } = (minted.data ?? {}) as unknown as { token?: string }
  if (!token) return false

  const sent = await supabase.functions.invoke<SendInvitationResult>(
    'send-invitation',
    { body: { token, origin: window.location.origin } },
  )
  if (sent.error) return false
  return sent.data?.ok === true
}

/**
 * Resend's documented default is 2 requests a second, and each invitation costs
 * two round trips. A 429 comes back from `send-invitation` as HTTP 200 with
 * `{ ok: false }` — there is no backpressure signal to react to — so the only
 * defence is not to go too fast in the first place. Used by the CSV imports,
 * which are the only place this runs in a loop.
 */
export const INVITE_GAP_MS = 550

/**
 * Invite a freshly imported batch, one at a time, skipping rows with no email.
 * Returns how many the provider accepted.
 */
export async function inviteImported(
  kind: 'student' | 'instructor',
  rows: { id: string; email: string | null }[],
): Promise<number> {
  let invited = 0
  for (const row of rows) {
    if (!row.email) continue
    if (await sendRecordInvite(kind, row.id)) invited += 1
    await new Promise((resolve) => setTimeout(resolve, INVITE_GAP_MS))
  }
  return invited
}
