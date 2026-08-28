// ============================================================================
// Edge Function: send-invitation
// Emails an academy_invitations accept link to the invited student.
// ----------------------------------------------------------------------------
// Security model
//   - The caller must present a valid Supabase auth JWT (verify_jwt = true).
//   - Authorization + tenant isolation are enforced by RLS: the invitation is
//     read with a *caller-scoped* client, so a non-staff caller — or a staff
//     member of a different academy — simply gets no row back. We never trust
//     the client to tell us who they are.
//   - The recipient is ALWAYS the invitation's stored email, never a value the
//     client supplies, so this function cannot be used as an open email relay.
//   - The accept-link base is NEVER taken from arbitrary client input. It comes
//     from server config (APP_URL); a client-supplied `origin` is honoured only
//     if it exactly matches ALLOWED_ORIGINS. This prevents crafting a
//     Hawary-branded email whose link points at an attacker domain. All
//     interpolated values are HTML-escaped as defence in depth.
//
// Required / optional function secrets (set with `supabase secrets set ...`):
//   RESEND_API_KEY     Resend API key. If unset, the function responds with
//                      { ok: false, code: 'email_not_configured' } and the web
//                      app falls back to the copy-link flow — nothing breaks.
//   INVITE_FROM_EMAIL  (optional) e.g. "Hawary LMS <invites@yourdomain.com>".
//                      Defaults to Resend's shared onboarding sender, which can
//                      only deliver to your own Resend account email (test mode)
//                      until you verify a domain.
//   APP_URL            Canonical base for the accept link, e.g.
//                      "https://app.hawary.my". Strongly recommended.
//   ALLOWED_ORIGINS    (optional) Comma-separated origins a client `origin` may
//                      use instead of APP_URL, e.g. for local dev:
//                      "http://localhost:5173,https://app.hawary.my".
// Auto-injected by the platform: SUPABASE_URL, SUPABASE_ANON_KEY.
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const DEFAULT_APP_URL = 'https://app.hawary.my'

// Resolve the accept-link base from trusted server config only. A client-
// supplied origin is accepted solely when it is explicitly allowlisted.
function resolveBase(payloadOrigin?: string): string {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const configured = Deno.env.get('APP_URL')?.trim()
  const candidate =
    (payloadOrigin && allowed.includes(payloadOrigin) ? payloadOrigin : '') ||
    configured ||
    allowed[0] ||
    DEFAULT_APP_URL
  try {
    const u = new URL(candidate)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return DEFAULT_APP_URL
    return u.origin // scheme+host+port only; drops any path/query and normalizes
  } catch {
    return DEFAULT_APP_URL
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  let payload: { token?: string; origin?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const token = payload.token?.trim()
  if (!token) return json({ error: 'Missing invitation token' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) {
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500)
  }

  // Caller-scoped client → RLS decides whether this staff member may read the
  // invitation. No service-role key is used anywhere in this function.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: inv, error } = await supabase
    .from('academy_invitations')
    .select('token, email, status, expires_at, academies(name)')
    .eq('token', token)
    .maybeSingle()

  if (error) return json({ error: error.message }, 400)
  if (!inv) return json({ error: 'Invitation not found or not permitted' }, 404)
  if (inv.status !== 'pending')
    return json({ error: 'This invitation is no longer pending' }, 409)
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now())
    return json({ error: 'This invitation has expired' }, 409)

  // PostgREST returns a to-one embed as an object, but tolerate an array too.
  const academyRel = inv.academies as { name?: string } | { name?: string }[] | null
  const academyName =
    (Array.isArray(academyRel) ? academyRel[0]?.name : academyRel?.name) ??
    'your academy'

  const base = resolveBase(payload.origin)
  const acceptUrl = `${base}/accept-invite?token=${encodeURIComponent(inv.token)}`

  // From here down we're only reporting the *email delivery* outcome. The
  // invitation already exists, so these are soft results (ok: false) — the web
  // app shows the copy-link fallback rather than treating them as hard errors.
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    return json({
      ok: false,
      code: 'email_not_configured',
      message:
        'Email delivery is not configured yet. Share the invite link manually.',
    })
  }

  const from =
    Deno.env.get('INVITE_FROM_EMAIL') ?? 'Hawary LMS <onboarding@resend.dev>'

  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
        // Adding somebody now invites them, and a CSV import calls this in a
        // loop, so a double-click or a retried row must not send twice. The
        // token is the natural key: resend_invitation rotates it on the same
        // row, so a deliberate resend gets a new key and does go out.
        'Idempotency-Key': `invitation:${token}`,
      },
      // A hung provider would otherwise hold the invocation to the platform
      // wall clock — and an import would hold it once per row.
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        from,
        to: [inv.email],
        subject: `You're invited to join ${academyName} on Hawary LMS`,
        html: emailHtml(academyName, acceptUrl),
        text: emailText(academyName, acceptUrl),
      }),
    })
  } catch (e) {
    console.error('send-invitation: provider unreachable', e)
    return json({
      ok: false,
      code: 'send_failed',
      message: 'Could not reach the email provider. Share the invite link instead.',
    })
  }

  if (!res.ok) {
    // Log the provider detail server-side; don't echo it to the client.
    console.error('send-invitation: provider rejected', res.status, await res.text().catch(() => ''))
    return json({
      ok: false,
      code: 'send_failed',
      message: `The email provider rejected the request (${res.status}). Share the invite link instead.`,
    })
  }

  const sent = (await res.json().catch(() => ({}))) as { id?: string }
  return json({ ok: true, id: sent.id ?? null, to: inv.email })
})

// ----------------------------------------------------------------------------
// Email templates. Kept inline so the function stays a single deployable file.
// English primary with a short Bahasa Melayu line (bilingual context).
// ----------------------------------------------------------------------------
function emailText(academyName: string, acceptUrl: string): string {
  return [
    `You've been invited to join ${academyName} on Hawary LMS.`,
    '',
    'Accept your invitation:',
    acceptUrl,
    '',
    'Sign up or sign in with the email address this invitation was sent to.',
    'This link expires in 14 days.',
    '',
    `Anda telah dijemput menyertai ${academyName} di Hawary LMS.`,
  ].join('\n')
}

function emailHtml(academyName: string, acceptUrl: string): string {
  const safeName = escapeHtml(academyName)
  const safeUrl = escapeHtml(acceptUrl)
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;">Hawary LMS</p>
          <h1 style="margin:12px 0 0;font-size:20px;line-height:1.3;">You're invited to join ${safeName}</h1>
          <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#3f3f46;">
            An academy admin has invited you to Hawary LMS. Accept the invitation to set up your account and get started.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px;">
          <a href="${safeUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">
            Accept invitation
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 24px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">
            Sign up or sign in with the email address this invitation was sent to. This link expires in 14&nbsp;days.
          </p>
          <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            If the button doesn't work, copy and paste this link into your browser:<br />
            <span style="color:#52525b;word-break:break-all;">${safeUrl}</span>
          </p>
          <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            Anda telah dijemput menyertai ${safeName}. Klik butang di atas untuk menerima jemputan.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
