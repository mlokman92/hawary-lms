// ============================================================================
// Edge Function: send-appointment-reminders
// The evening before, tells each student what tomorrow holds: the sessions
// still on, and any that staff called off. Instructors are not reminded.
// ----------------------------------------------------------------------------
// Called by pg_cron, not by a person
//   `appointment-reminders` fires every hour on the hour. The SQL
//   (`appointment_reminders_due`) decides whose evening it is — it returns
//   nothing outside 21:00–23:59 in an academy's own timezone — so this function
//   never does timezone arithmetic of its own. The 22:00 and 23:00 runs pick up
//   whatever the 21:00 run could not send.
//
// Trust model
//   There is no user, so there is no JWT to let RLS decide. The job sends a
//   Bearer token held in Vault (`appointment_reminders_cron`), and this function
//   compares it with the same secret read under the service role. Deployed with
//   verify_jwt off for that reason. The body carries no addresses and no ids —
//   what is sent, and to whom, is entirely what the database says is due.
//
// One email per student, not per session
//   A student with a session at 10:00 and a cancelled one at 14:00 gets one
//   email listing both. Rows arrive ordered by student.
//
// Idempotency
//   Each row the email listed is stamped with `reminder_sent_at` and the Resend
//   id, and a stamped row is never due again. The send-then-die window is closed
//   by the Resend Idempotency-Key, which hashes the exact set of rows: a retry of
//   the same email dedupes, and a set that changed is a different email.
//   A provider failure leaves the rows unstamped, which is what the next hour's
//   retry reads. No address stamps the time with a null id — nobody to tell.
//
// Body (optional): { "dry_run": true, "at": "<ISO instant>" } returns what would
// be sent, sending and stamping nothing. `at` is honoured only on a dry run.
//
// Secrets: RESEND_API_KEY, INVITE_FROM_EMAIL, APP_URL — shared with the other
// mail functions; nothing new. Auto-injected: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const DEFAULT_APP_URL = 'https://app.hawary.my'

function resolveBase(): string {
  const configured = Deno.env.get('APP_URL')?.trim() || DEFAULT_APP_URL
  try {
    const u = new URL(configured)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return DEFAULT_APP_URL
    return u.origin
  } catch {
    return DEFAULT_APP_URL
  }
}

/** One row of `appointment_reminders_due`. */
type Due = {
  appointment_id: string
  academy_name: string | null
  tz: string
  student_id: string
  student_name: string | null
  student_email: string | null
  instructor_name: string | null
  starts_at: string
  ends_at: string
  status: 'booked' | 'cancelled'
  note: string | null
  cancel_reason: string | null
}

/** What one student's email came to. `id` set means the provider took it. */
type Outcome = { sent: boolean; code?: 'no_email' | 'send_failed'; id?: string | null }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey)
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  // --- 1. the caller must be the cron job ------------------------------------
  const presented = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: secret, error: secretErr } = await admin.rpc(
    'appointment_reminders_secret',
  )
  if (secretErr || typeof secret !== 'string' || !secret)
    return json({ error: 'Server misconfigured: no reminder secret' }, 500)
  if (!(await sameSecret(presented, secret)))
    return json({ error: 'Unauthorized' }, 401)

  let payload: { dry_run?: unknown; at?: unknown } = {}
  try {
    payload = await req.json()
  } catch {
    // An empty body is the cron's normal call.
  }
  const dryRun = payload.dry_run === true
  const at =
    dryRun && typeof payload.at === 'string' && !Number.isNaN(Date.parse(payload.at))
      ? new Date(payload.at).toISOString()
      : new Date().toISOString()

  // --- 2. what is due --------------------------------------------------------
  const { data, error } = await admin.rpc('appointment_reminders_due', { _at: at })
  if (error) return json({ error: error.message }, 500)
  const rows = (data ?? []) as Due[]
  if (rows.length === 0) return json({ ok: true, due: 0 })

  const byStudent = new Map<string, Due[]>()
  for (const r of rows) {
    const list = byStudent.get(r.student_id)
    if (list) list.push(r)
    else byStudent.set(r.student_id, [r])
  }

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      at,
      due: rows.length,
      students: [...byStudent.values()].map((list) => ({
        to: list[0].student_email,
        name: list[0].student_name,
        subject: compose(list, resolveBase()).subject,
        sessions: list.map((r) => ({
          id: r.appointment_id,
          status: r.status,
          starts_at: r.starts_at,
          with: r.instructor_name,
        })),
      })),
    })
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    // Nothing stamped, so the next hour tries again once the key is back.
    return json({ ok: false, code: 'email_not_configured' })
  }
  const from =
    Deno.env.get('INVITE_FROM_EMAIL') ?? 'Hawary LMS <onboarding@resend.dev>'
  const base = resolveBase()

  // --- 3. send, one student at a time ----------------------------------------
  // Sequential: a busy evening here is ~50 students, well inside the provider's
  // 10 requests a second, and one student's failure must not touch the next.
  const tally = { sent: 0, no_email: 0, failed: 0 }
  for (const list of byStudent.values()) {
    const ids = list.map((r) => r.appointment_id).sort()
    const mail = compose(list, base)
    const outcome: Outcome = await send(resendKey, {
      from,
      to: list[0].student_email?.trim() || null,
      idempotencyKey: `appointment-reminder:${list[0].student_id}:${await digest(ids.join(','))}`,
      ...mail,
    })

    if (outcome.sent) tally.sent++
    else if (outcome.code === 'no_email') tally.no_email++
    else {
      tally.failed++
      continue // unstamped: the next hour retries it
    }

    const { error: stampErr } = await admin
      .from('appointments')
      .update({ reminder_sent_at: new Date().toISOString(), reminder_id: outcome.id ?? null })
      .in('id', ids)
    if (stampErr)
      console.error('send-appointment-reminders: sent but could not stamp', ids, stampErr.message)
  }

  console.log('send-appointment-reminders:', at, 'due=', rows.length, tally)
  return json({ ok: tally.failed === 0, due: rows.length, ...tally })
})

/** Constant-time comparison, over digests so the lengths always match. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const xa = new Uint8Array(x)
  const ya = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i]
  return diff === 0 && a.length > 0
}

async function digest(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ----------------------------------------------------------------------------
// Wording. The cancelled case leads whenever there is one, because that is the
// line a student must not miss.
// ----------------------------------------------------------------------------
type Composed = {
  subject: string
  heading: string
  academy: string
  sessions: Session[]
  tz: string
  cta: string
  url: string
}

type Session = {
  cancelled: boolean
  when: string
  withName: string
  detailLabel: string
  detail: string | null
}

function compose(list: Due[], base: string): Composed {
  const tz = list[0].tz
  const academy = list[0].academy_name?.trim() || 'Your academy'
  const cancelled = list.filter((r) => r.status === 'cancelled').length
  const booked = list.length - cancelled
  const day = formatDay(list[0].starts_at, tz)

  const sessions: Session[] = list.map((r) => ({
    cancelled: r.status === 'cancelled',
    when: `${formatDay(r.starts_at, tz)}, ${formatTime(r.starts_at, tz)} – ${formatTime(r.ends_at, tz)}`,
    withName: r.instructor_name?.trim() || 'your instructor',
    detailLabel: r.status === 'cancelled' ? 'Reason' : 'Note',
    detail: (r.status === 'cancelled' ? r.cancel_reason : r.note)?.trim() || null,
  }))

  let heading: string
  let subject: string
  if (booked === 0) {
    heading =
      cancelled === 1
        ? 'Your session tomorrow is cancelled'
        : 'Your sessions tomorrow are cancelled'
    subject = `Cancelled: ${cancelled === 1 ? 'your session' : 'your sessions'} tomorrow — ${day}`
  } else if (cancelled > 0) {
    heading = `Your sessions tomorrow — ${cancelled} cancelled`
    subject = `Reminder: your sessions tomorrow (${cancelled} cancelled) — ${day}`
  } else if (booked === 1) {
    heading = 'Reminder: your session is tomorrow'
    subject = `Reminder: your session tomorrow — ${day}, ${formatTime(list[0].starts_at, tz)}`
  } else {
    heading = 'Reminder: your sessions are tomorrow'
    subject = `Reminder: your sessions tomorrow — ${day}`
  }

  return {
    subject,
    heading,
    academy,
    sessions,
    tz,
    cta: booked === 0 ? 'Book another time' : 'View my sessions',
    url: `${base}/learn/appointments`,
  }
}

function formatDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}

type Mail = Composed & { from: string; to: string | null; idempotencyKey: string }

async function send(apiKey: string, mail: Mail): Promise<Outcome> {
  if (!mail.to) return { sent: false, code: 'no_email', id: null }

  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': mail.idempotencyKey,
      },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        from: mail.from,
        to: [mail.to],
        subject: mail.subject,
        html: emailHtml(mail),
        text: emailText(mail),
      }),
    })
  } catch (e) {
    console.error('send-appointment-reminders: provider unreachable', mail.idempotencyKey, e)
    return { sent: false, code: 'send_failed', id: null }
  }

  if (!res.ok) {
    console.error(
      'send-appointment-reminders: provider rejected',
      mail.idempotencyKey,
      res.status,
      await res.text().catch(() => ''),
    )
    return { sent: false, code: 'send_failed', id: null }
  }

  const body = (await res.json().catch(() => ({}))) as { id?: string }
  return { sent: true, id: body.id ?? null }
}

// ----------------------------------------------------------------------------
// Templates — the same chrome as send-appointment-notice, one block per
// session. English plus the house's one Malay line; transactional email is not
// translated yet.
// ----------------------------------------------------------------------------
function emailText(mail: Mail): string {
  const blocks = mail.sessions.map((s) =>
    [
      s.cancelled ? `CANCELLED — ${s.when}` : s.when,
      `With: ${s.withName}`,
      ...(s.cancelled ? ['This session will not take place.'] : []),
      ...(s.detail ? [`${s.detailLabel}: ${s.detail}`] : []),
    ].join('\n'),
  )
  return [
    mail.heading,
    '',
    ...blocks.flatMap((b) => [b, '']),
    `${mail.cta}:`,
    mail.url,
    '',
    `Times are in ${mail.tz}.`,
    'Waktu mengikut zon masa akademi.',
  ].join('\n')
}

function emailHtml(mail: Mail): string {
  const url = escapeHtml(mail.url)
  const row = (label: string, value: string, color = '#18181b') =>
    `<tr>
       <td style="padding:4px 12px 4px 0;font-size:13px;color:#71717a;white-space:nowrap;vertical-align:top;">${label}</td>
       <td style="padding:4px 0;font-size:14px;color:${color};">${value}</td>
     </tr>`

  const sessions = mail.sessions
    .map((s) => {
      const rows = [
        row('When', escapeHtml(s.when), s.cancelled ? '#71717a' : '#18181b'),
        row('With', escapeHtml(s.withName), s.cancelled ? '#71717a' : '#18181b'),
        ...(s.detail ? [row(escapeHtml(s.detailLabel), escapeHtml(s.detail))] : []),
      ].join('')
      const label = s.cancelled
        ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#b91c1c;">Cancelled — this session will not take place</p>`
        : ''
      return `<div style="padding:12px 0;border-top:1px solid #e4e4e7;">${label}<table role="presentation" cellpadding="0" cellspacing="0">${rows}</table></div>`
    })
    .join('')

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;">${escapeHtml(mail.academy)}</p>
          <h1 style="margin:12px 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(mail.heading)}</h1>
          ${sessions}
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
          <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">
            Times are in ${escapeHtml(mail.tz)}.<br />
            Waktu mengikut zon masa akademi.
          </p>
          <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            If the button doesn't work, copy and paste this link into your browser:<br />
            <span style="color:#52525b;word-break:break-all;">${url}</span>
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
