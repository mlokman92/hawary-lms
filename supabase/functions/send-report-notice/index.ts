// ============================================================================
// Edge Function: send-report-notice
// Emails the other party about one thing that happened on a report-check thread.
// ----------------------------------------------------------------------------
// FOUR EVENTS, ONE FUNCTION - the send-appointment-notice shape, for the same
// reason: two parties, an id-only body, RLS-then-service-role authorisation,
// one template. Only the heading, the "with" line and the button differ, and a
// second copy of the other two hundred lines would be a second place for the
// trust model to drift.
//
// THE EVENT IS READ, NOT DECLARED. The body carries `report_id` and `event_id`
// and nothing else. What happened, who did it, and therefore who should be told
// all come from the stored `report_events` row - so a client cannot ask this
// function to mail somebody about something that did not happen, and cannot
// misreport who acted in order to redirect the mail.
//
// WHO IS TOLD: the other party, never the actor.
//   submitted  → the checker            (the student acted)
//   comment    → the other side         (either may act)
//   status     → the student            (staff decided)
//   assigned   → the incoming checker AND the student, minus whoever acted
//
// That is the OPPOSITE of send-appointment-notice, which mails both parties
// including the actor. The difference is real and not an inconsistency: there,
// the student is nearly always the actor (they book and cancel their own
// sessions), so an actor-skip meant never mailing the student at all. Here both
// sides act on the same thread repeatedly, and posting somebody a copy of the
// comment they just wrote is noise, not a receipt.
//
// WHY THE SERVICE ROLE, when send-invitation does not need it
//   This emails a party the caller may not be able to read. A student cannot
//   read `instructors` at all - that table is staff-only - so the student side
//   could never look up their own checker's address. The function therefore
//   follows the material-url shape: AUTHORIZE under the caller's own JWT (the
//   report is read with a caller-scoped client, so RLS decides), falling back
//   to active staff membership of the report's academy; only then READ AND SEND
//   under the service role. No row and no membership means 404, the right
//   answer to both "not yours" and "does not exist".
//
// Recipients are never client input. Addresses come from the record -
// `students.email` / `instructors.email` - falling back to the linked account's
// auth address when the record carries none. 22 of 659 student records here have
// no email of their own, and a student who can submit is by definition a linked
// account with a real inbox.
//
// Idempotency: no receipt columns, only a per-(event, recipient) Resend
// Idempotency-Key, which dedupes for 24h. A timeline event is append-only and
// happens once, so there is nothing a column would distinguish that the key
// does not - the same conclusion the appointment function reached for its two
// newer events.
//
// Soft failure, always. This is a second call after the RPC has committed; the
// comment exists whether or not the mail lands, and the in-app notification was
// written in the same transaction as the write. So every failure path returns
// 200 with ok:false and a code.
//
// Required / optional function secrets (all already set, shared with the four
// other mail functions - this introduces no new secret):
//   RESEND_API_KEY     If unset, responds { ok:false, code:'email_not_configured' }.
//   INVITE_FROM_EMAIL  (optional) e.g. "Hawary LMS <noreply@hawary.my>".
//   APP_URL            Canonical base for the links.
//   ALLOWED_ORIGINS    (optional) Comma-separated origins a client `origin` may
//                      use instead of APP_URL.
// Auto-injected by the platform: SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.
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

// Same helper as the other four mail functions - kept inline so each function
// stays a single deployable file.
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

type Side = 'student' | 'instructor'

type Mail = {
  to: string
  from: string
  academy: string
  heading: string
  /** "Report" / "Course" / "From" rows under the heading. */
  rows: [string, string][]
  /** The comment itself, quoted, when there is one. */
  quote: string | null
  cta: string
  url: string
  idempotencyKey: string
}

/**
 * The words, keyed by (event, which side is reading). Everything else about a
 * notice is identical, so this table IS the difference between the four events
 * - the same shape as send-appointment-notice's COPY.
 *
 * `{who}` is the other party's name, `{status}` how the verdict reads.
 */
const COPY: Record<
  string,
  Record<Side, { heading: string; cta: string }>
> = {
  submitted: {
    instructor: {
      heading: '{who} sent a report for checking',
      cta: 'Open the report',
    },
    // Not sent (the student is the actor), but present so the table is total
    // and a future change cannot fall through to undefined.
    student: { heading: 'Your report was submitted', cta: 'Open your report' },
  },
  comment: {
    student: { heading: '{who} commented on your report', cta: 'Read the comment' },
    instructor: { heading: '{who} replied on a report', cta: 'Read the reply' },
  },
  status: {
    student: { heading: 'Your report was {status}', cta: 'Open your report' },
    instructor: { heading: 'A report you check was {status}', cta: 'Open the report' },
  },
  assigned: {
    instructor: { heading: 'A report was assigned to you', cta: 'Open the report' },
    student: { heading: 'Your report has a new checker', cta: 'Open your report' },
  },
}

/** How a status reads in a sentence. English only, like every other mail here. */
const STATUS_WORD: Record<string, string> = {
  submitted: 'resubmitted',
  in_review: 'being checked',
  changes_requested: 'sent back for changes',
  approved: 'approved',
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
        // Closes the window a receipt column cannot: this function sent, then
        // died before recording it. Resend dedupes on this key for 24h.
        'Idempotency-Key': mail.idempotencyKey,
      },
      // A hung provider must not freeze the page that just posted a comment.
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
    console.error('send-report-notice: provider unreachable', mail.idempotencyKey, e)
    return { sent: false, code: 'send_failed' }
  }

  if (!res.ok) {
    console.error(
      'send-report-notice: provider rejected',
      mail.idempotencyKey,
      res.status,
      await res.text().catch(() => ''),
    )
    return { sent: false, code: 'send_failed' }
  }
  return { sent: true, code: null }
}

function emailText(mail: Mail): string {
  const rows = mail.rows.map(([k, v]) => `${k}: ${v}`).join('\n')
  const quote = mail.quote ? `\n\n"${mail.quote}"\n` : '\n'
  return `${mail.academy}\n\n${mail.heading}\n\n${rows}${quote}\n${mail.cta}: ${mail.url}\n`
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

  const quote = mail.quote
    ? `<tr>
         <td style="padding:4px 28px 0;">
           <div style="border-left:3px solid #e4e4e7;padding:2px 0 2px 14px;font-size:14px;line-height:1.6;color:#3f3f46;white-space:pre-wrap;">${escapeHtml(mail.quote)}</div>
         </td>
       </tr>`
    : ''

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
      ${quote}
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

  let body: { report_id?: unknown; event_id?: unknown; origin?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }

  const reportId = String(body.report_id ?? '').trim()
  const eventId = String(body.event_id ?? '').trim()
  if (!UUID_RE.test(reportId))
    return json({ error: 'Missing or malformed report_id' }, 400)
  if (!UUID_RE.test(eventId))
    return json({ error: 'Missing or malformed event_id' }, 400)

  // --- 1. authorise under the caller's own JWT ------------------------------
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: visible } = await caller
    .from('report_submissions')
    .select('id, academy_id')
    .eq('id', reportId)
    .maybeSingle()

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let academyId = visible?.academy_id as string | undefined

  if (!academyId) {
    // The RLS read can legitimately miss: an admin reassigning a report is
    // covered, but a trainer who is not the checker is not - and neither is a
    // staff member acting the instant before the row changes hands. Fall back
    // to active staff membership of the report's own academy, the same
    // fallback send-appointment-notice needed for exactly this reason.
    const { data: row } = await admin
      .from('report_submissions')
      .select('academy_id')
      .eq('id', reportId)
      .maybeSingle()
    if (!row) return json({ error: 'Report not found', code: 'not_found' }, 404)

    const { data: user } = await caller.auth.getUser()
    if (!user?.user) return json({ error: 'Not authenticated' }, 401)

    const { data: member } = await admin
      .from('academy_members')
      .select('role')
      .eq('academy_id', row.academy_id)
      .eq('user_id', user.user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (!member || !['admin', 'trainer'].includes(member.role))
      return json({ error: 'Report not found', code: 'not_found' }, 404)

    academyId = row.academy_id
  }

  // --- 2. read the facts under the service role -----------------------------
  const { data: event, error: evErr } = await admin
    .from('report_events')
    .select('id, report_id, kind, body, to_status, actor_id, actor_name, actor_role')
    .eq('id', eventId)
    .eq('report_id', reportId)
    .maybeSingle()
  if (evErr) return json({ error: evErr.message }, 500)
  if (!event) return json({ error: 'Event not found', code: 'not_found' }, 404)

  const { data: report, error: repErr } = await admin
    .from('report_submissions')
    .select(
      `id, academy_id, title, status,
       academies ( name ),
       courses ( title ),
       students ( full_name, email, user_id ),
       instructors ( full_name, email, user_id )`,
    )
    .eq('id', reportId)
    .maybeSingle()
  if (repErr) return json({ error: repErr.message }, 500)
  if (!report) return json({ error: 'Report not found', code: 'not_found' }, 404)

  const academy = one(report.academies as { name: string } | null)
  const course = one(report.courses as { title: string } | null)
  const student = one(
    report.students as { full_name: string | null; email: string | null; user_id: string | null } | null,
  )
  const instructor = one(
    report.instructors as { full_name: string | null; email: string | null; user_id: string | null } | null,
  )

  /** The record's address, else the linked account's. */
  async function addressOf(
    p: { email: string | null; user_id: string | null } | null,
  ): Promise<string | null> {
    if (!p) return null
    if (p.email?.trim()) return p.email.trim()
    if (!p.user_id) return null
    const { data } = await admin.auth.admin.getUserById(p.user_id)
    return data?.user?.email ?? null
  }

  // --- 3. who is told, derived from the stored event ------------------------
  const kind = String(event.kind)
  const actorRole = String(event.actor_role)
  const actorIsStudent = actorRole === 'student'

  const sides: Side[] =
    kind === 'submitted'
      ? ['instructor']
      : kind === 'assigned'
        ? ['instructor', 'student']
        : // comment and status both go to whoever did not act
          [actorIsStudent ? 'instructor' : 'student']

  const base = resolveBase(
    typeof body.origin === 'string' ? body.origin : undefined,
  )
  const from = Deno.env.get('INVITE_FROM_EMAIL')?.trim() || DEFAULT_FROM
  const academyName = academy?.name ?? 'Your academy'
  const statusWord = STATUS_WORD[String(event.to_status ?? report.status)] ?? ''

  const results: Record<string, { sent: boolean; code: string | null }> = {}

  for (const side of sides) {
    // Never mail the actor their own action.
    const party = side === 'student' ? student : instructor
    if (party?.user_id && party.user_id === event.actor_id) {
      results[side] = { sent: false, code: 'is_actor' }
      continue
    }

    const to = await addressOf(party)
    if (!to) {
      results[side] = { sent: false, code: 'no_address' }
      continue
    }

    const copy = COPY[kind]?.[side]
    if (!copy) {
      results[side] = { sent: false, code: 'unknown_event' }
      continue
    }

    const other = side === 'student' ? instructor : student
    const heading = copy.heading
      .replace('{who}', other?.full_name ?? 'Somebody')
      .replace('{status}', statusWord)

    const rows: [string, string][] = [
      ['Report', report.title],
      ['Course', course?.title ?? '-'],
      [side === 'student' ? 'Checked by' : 'Student', other?.full_name ?? '-'],
    ]

    results[side] = await send({
      to,
      from,
      academy: academyName,
      heading,
      rows,
      quote: event.body ? String(event.body) : null,
      cta: copy.cta,
      url:
        side === 'student'
          ? `${base}/learn/reports/${reportId}`
          : `${base}/reports/${reportId}`,
      // Per (event, recipient): the event happened once, and the two parties
      // fail independently, so a re-invoke fills only the gap.
      idempotencyKey: `report-${eventId}-${side}`,
    })
  }

  // Always 200: the write has already committed, and the in-app notification
  // went out in the same transaction as it.
  const anySent = Object.values(results).some((r) => r.sent)
  return json({ ok: anySent, event: kind, results })
})
