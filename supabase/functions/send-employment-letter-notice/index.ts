// ============================================================================
// Edge Function: send-employment-letter-notice
// Emails a student that an admin rejected their employment duration letter,
// with the admin's note, so they can upload it again.
// ----------------------------------------------------------------------------
// A SECOND CALL AFTER THE RPC, like send-report-notice. `reject_employment_letter`
// writes the rejection and the in-app notification (bell + push) in one
// transaction; the web then calls this. The mail is the extra copy — the one a
// student with no phone app and no reason to open the web still sees.
//
// THE REJECTION IS READ, NOT DECLARED. The body carries `student_id` (and the
// page's `origin`) and nothing else. The note, the address and whether the
// letter is rejected at all all come from the stored rows, so a client cannot
// have this function mail anybody about something that did not happen.
//
// WHO MAY CALL: an active admin of the letter's academy — the same people the
// RPC lets reject. The caller is read from their own JWT; everything after
// that is read under the service role. Not an admin, no letter, or a letter
// that is not rejected: 404 / ok:false, never a mail.
//
// The address is `students.email`, else the linked account's sign-in address.
//
// Idempotency: a Resend Idempotency-Key per (student, reviewed_at). Rejecting
// again moves `reviewed_at`, so a second rejection — a new note — is a new
// mail; a retried call for the same one is not.
//
// Soft failure, always: the rejection has committed whatever happens here, so
// every failure path returns 200 with ok:false and a code.
//
// Secrets: the ones every mail function shares — RESEND_API_KEY,
// INVITE_FROM_EMAIL (optional), APP_URL, ALLOWED_ORIGINS (optional). English
// only, like every other transactional mail here.
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
const DEFAULT_FROM = 'Hawary LMS <noreply@hawary.my>'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Same helper as the other mail functions - kept inline so each function stays
// a single deployable file.
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
    return u.origin
  } catch {
    return DEFAULT_APP_URL
  }
}

/** PostgREST returns a to-one embed as an object, but tolerate an array too. */
function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type Mail = {
  to: string
  from: string
  academy: string
  heading: string
  rows: [string, string][]
  quote: string
  cta: string
  url: string
  idempotencyKey: string
}

function emailText(mail: Mail): string {
  const rows = mail.rows.map(([k, v]) => `${k}: ${v}`).join('\n')
  return `${mail.academy}\n\n${mail.heading}\n\n${rows}\n\n"${mail.quote}"\n\n${mail.cta}: ${mail.url}\n`
}

function emailHtml(mail: Mail): string {
  const rows = mail.rows
    .map(
      ([label, value]) =>
        `<tr>
           <td style="padding:6px 12px 6px 0;font-size:13px;color:#71717a;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
           <td style="padding:6px 0;font-size:14px;color:#18181b;">${escapeHtml(value)}</td>
         </tr>`,
    )
    .join('')
  const url = escapeHtml(mail.url)

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;">${escapeHtml(mail.academy)}</p>
          <h1 style="margin:12px 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(mail.heading)}</h1>
          <table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>
        </td>
      </tr>
      <tr>
        <td style="padding:4px 28px 0;">
          <div style="border-left:3px solid #e4e4e7;padding:2px 0 2px 14px;font-size:14px;line-height:1.6;color:#3f3f46;white-space:pre-wrap;">${escapeHtml(mail.quote)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px;">
          <a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">
            ${escapeHtml(mail.cta)}
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 24px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            If the button does not work, copy and paste this link into your browser:<br />
            <span style="color:#52525b;word-break:break-all;">${url}</span>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

async function send(mail: Mail): Promise<{ sent: boolean; code: string | null }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return { sent: false, code: 'email_not_configured' }

  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': mail.idempotencyKey,
      },
      // A hung provider must not freeze the dialog that just rejected.
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        from: mail.from,
        to: [mail.to],
        subject: mail.heading,
        html: emailHtml(mail),
        text: emailText(mail),
      }),
    })
  } catch (e) {
    console.error('send-employment-letter-notice: provider unreachable', mail.idempotencyKey, e)
    return { sent: false, code: 'send_failed' }
  }

  if (!res.ok) {
    console.error(
      'send-employment-letter-notice: provider rejected',
      mail.idempotencyKey,
      res.status,
      await res.text().catch(() => ''),
    )
    return { sent: false, code: 'send_failed' }
  }
  return { sent: true, code: null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey)
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500)

  let body: { student_id?: unknown; origin?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }
  const studentId = String(body.student_id ?? '').trim()
  if (!UUID_RE.test(studentId))
    return json({ error: 'Missing or malformed student_id' }, 400)

  // --- 1. who is calling ----------------------------------------------------
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: me } = await caller.auth.getUser()
  if (!me?.user) return json({ error: 'Not authenticated' }, 401)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // --- 2. the letter, and whether this caller may speak for its academy -----
  const { data: letter, error: letterErr } = await admin
    .from('student_employment_letters')
    .select(
      `academy_id, status, review_note, reviewed_at, file_name,
       academies ( name ),
       students ( full_name, email, user_id )`,
    )
    .eq('student_id', studentId)
    .maybeSingle()
  if (letterErr) return json({ error: letterErr.message }, 500)
  if (!letter) return json({ error: 'Letter not found', code: 'not_found' }, 404)

  const { data: member } = await admin
    .from('academy_members')
    .select('role')
    .eq('academy_id', letter.academy_id)
    .eq('user_id', me.user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (member?.role !== 'admin')
    return json({ error: 'Letter not found', code: 'not_found' }, 404)

  // Only a rejection is mailed, and only with the note the student must act on.
  const note = (letter.review_note ?? '').trim()
  if (letter.status !== 'rejected' || !note || !letter.reviewed_at)
    return json({ ok: false, code: 'not_rejected' })

  // --- 3. the address -------------------------------------------------------
  const student = one(
    letter.students as { full_name: string | null; email: string | null; user_id: string | null } | null,
  )
  let to = student?.email?.trim() || null
  if (!to && student?.user_id) {
    const { data } = await admin.auth.admin.getUserById(student.user_id)
    to = data?.user?.email ?? null
  }
  if (!to) return json({ ok: false, code: 'no_address' })

  // --- 4. send --------------------------------------------------------------
  const academy = one(letter.academies as { name: string } | null)
  const base = resolveBase(typeof body.origin === 'string' ? body.origin : undefined)
  const result = await send({
    to,
    from: Deno.env.get('INVITE_FROM_EMAIL')?.trim() || DEFAULT_FROM,
    academy: academy?.name ?? 'Your academy',
    heading: 'Your employment duration letter was rejected',
    rows: [
      ['Student', student?.full_name ?? '-'],
      ['File', letter.file_name ?? '-'],
    ],
    quote: note,
    cta: 'Upload it again',
    url: `${base}/learn/documents/employment-letter`,
    idempotencyKey: `employment-letter-rejected-${studentId}-${Date.parse(letter.reviewed_at)}`,
  })

  return json({ ok: result.sent, code: result.code })
})
