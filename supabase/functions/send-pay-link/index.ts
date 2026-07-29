// ============================================================================
// Edge Function: send-pay-link
// Emails an invoice's public pay link (/pay/<token>) to the student. Reuses the
// same Resend setup as send-invitation.
// ----------------------------------------------------------------------------
// Security model (mirrors send-invitation)
//   - verify_jwt = true. The invoice + student email are read with a
//     *caller-scoped* client, so RLS decides whether this staff member may see
//     them — staff of another academy get no row and cannot send.
//   - The recipient is ALWAYS the student's stored email, never a request value.
//   - No service-role key. Email delivery is best-effort: if RESEND_API_KEY is
//     unset or sending fails, we return { ok: false, ... } and the web app falls
//     back to the copy-link flow.
// Required secret: RESEND_API_KEY (shared with send-invitation).
// Optional: INVITE_FROM_EMAIL (reused as the sender), APP_URL.
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

function formatMYR(sen: number): string {
  return `RM ${((sen ?? 0) / 100).toFixed(2)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  let payload: { invoice_id?: string; origin?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const invoiceId = payload.invoice_id?.trim()
  if (!invoiceId) return json({ error: 'Missing invoice_id' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey)
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500)

  // Caller-scoped → RLS decides whether this staff member may read the invoice.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: inv, error } = await supabase
    .from('invoices')
    .select(
      'id, invoice_no, total_sen, amount_paid_sen, pay_token, students(full_name, email), academies(name)',
    )
    .eq('id', invoiceId)
    .maybeSingle()
  if (error) return json({ error: error.message }, 400)
  if (!inv) return json({ error: 'Invoice not found or not permitted' }, 404)

  const student = (inv.students ?? null) as { full_name?: string; email?: string } | null
  const to = student?.email?.trim()
  if (!to)
    return json({
      ok: false,
      code: 'no_email',
      message: 'This student has no email on file. Copy the link to share it.',
    })

  // Ensure a pay token exists (admin-guarded RPC; the UI gates this to admins).
  let token = inv.pay_token as string | null
  if (!token) {
    const { data: minted, error: tokErr } = await supabase.rpc('ensure_pay_token', {
      _invoice: invoiceId,
    })
    if (tokErr) return json({ error: tokErr.message }, 400)
    token = minted as string
  }

  const academyName = (inv.academies as { name?: string } | null)?.name ?? 'your academy'
  const dueSen = Math.max(0, (inv.total_sen ?? 0) - (inv.amount_paid_sen ?? 0))
  const base = (
    Deno.env.get('APP_URL') ??
    payload.origin ??
    req.headers.get('Origin') ??
    DEFAULT_APP_URL
  ).replace(/\/+$/, '')
  const payUrl = `${base}/pay/${encodeURIComponent(token!)}`

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    return json({
      ok: false,
      code: 'email_not_configured',
      message:
        'Email delivery is not configured yet. Share the pay link manually.',
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
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Payment link for invoice ${inv.invoice_no} — ${academyName}`,
        html: emailHtml(academyName, inv.invoice_no, formatMYR(dueSen), payUrl),
        text: emailText(academyName, inv.invoice_no, formatMYR(dueSen), payUrl),
      }),
    })
  } catch (e) {
    return json({
      ok: false,
      code: 'send_failed',
      message: `Could not reach the email provider: ${
        e instanceof Error ? e.message : 'network error'
      }`,
    })
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return json({
      ok: false,
      code: 'send_failed',
      message: `Email provider rejected the request (${res.status}). ${detail}`.trim(),
    })
  }

  const sent = (await res.json().catch(() => ({}))) as { id?: string }
  return json({ ok: true, id: sent.id ?? null, to })
})

function emailText(
  academyName: string,
  invoiceNo: string,
  amount: string,
  payUrl: string,
): string {
  return [
    `${academyName} sent you an invoice (${invoiceNo}).`,
    `Amount due: ${amount}`,
    '',
    'Pay online (FPX):',
    payUrl,
    '',
    'Anda menerima invois daripada ' + academyName + '. Klik pautan di atas untuk membayar.',
  ].join('\n')
}

function emailHtml(
  academyName: string,
  invoiceNo: string,
  amount: string,
  payUrl: string,
): string {
  const safeName = escapeHtml(academyName)
  const safeNo = escapeHtml(invoiceNo)
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;">${safeName}</p>
          <h1 style="margin:12px 0 0;font-size:20px;line-height:1.3;">Invoice ${safeNo}</h1>
          <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#3f3f46;">
            Amount due: <strong>${escapeHtml(amount)}</strong>. Pay securely online via FPX.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px;">
          <a href="${payUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">
            Pay now
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 24px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            If the button doesn't work, copy and paste this link into your browser:<br />
            <span style="color:#52525b;word-break:break-all;">${payUrl}</span>
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
