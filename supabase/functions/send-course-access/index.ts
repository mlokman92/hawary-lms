// ============================================================================
// Edge Function: send-course-access
// Tells a student their enrollment request was approved and the course is open.
// ----------------------------------------------------------------------------
// Security model — identical to send-invitation, for the same reasons.
//   - The caller must present a valid Supabase auth JWT (verify_jwt = true).
//   - Authorization + tenant isolation are enforced by RLS: the enrollment is
//     read with a *caller-scoped* client, so a non-staff caller — or a staff
//     member of a different academy — simply gets no row back. No service-role
//     key is used anywhere in this function.
//   - The recipient is ALWAYS the student record's stored email, never a value
//     the client supplies, so this cannot be used as an open email relay. The
//     request carries an enrollment id and nothing else.
//   - The course link base is NEVER taken from arbitrary client input. It comes
//     from server config (APP_URL); a client-supplied `origin` is honoured only
//     if it exactly matches ALLOWED_ORIGINS. All interpolated values are
//     HTML-escaped as defence in depth.
//
// Why this function refuses rows whose access_email_at is null
//   Three of the four ways a student becomes 'active' must stay silent (staff
//   enrolling from the student page, bulk enrol, and the public join link,
//   which only creates a request). Only public.approve_enrollment stamps
//   access_email_at, and it does so under the same lock as the transition. So
//   that column IS the authorization to send: without it there is no reachable
//   path from this endpoint to a student who was never approved through the
//   request list. Of the 639 enrollments already active when this shipped,
//   every one has a null access_email_at and is therefore unreachable here.
//
// The body is per course, and silence is the default
//   `course_enrollment_settings.access_email_body` is authored by staff on
//   /enrollments. A course with no settings row, or a blank body, sends NOTHING
//   — that is the configured default, not a failure. approve_enrollment makes
//   the same test before it claims, so a course without a body never even
//   stamps access_email_at; the check is repeated here because this endpoint
//   can also be invoked directly. The subject stays generated, so there is one
//   field to fill and no way to ship a blank subject line.
//   Staff text is plain: it is HTML-escaped before {{placeholders}} are filled
//   with already-escaped values, so nothing a person types can become markup.
//
// Required / optional function secrets (all already set, shared with the two
// other mail functions — this introduces no new secret):
//   RESEND_API_KEY     Resend API key. If unset, responds
//                      { ok: false, code: 'email_not_configured' } and the
//                      approval still stands — nothing breaks.
//   INVITE_FROM_EMAIL  (optional) e.g. "Hawary LMS <noreply@hawary.my>".
//   APP_URL            Canonical base for the course link.
//   ALLOWED_ORIGINS    (optional) Comma-separated origins a client `origin` may
//                      use instead of APP_URL.
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

// Same helper as send-invitation and send-pay-link — kept inline so each
// function stays a single deployable file.
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

// PostgREST returns a to-one embed as an object, but tolerate an array too.
function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

/** The placeholders a staff-authored body may use. */
type Vars = { student_name: string; course: string; academy: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  let payload: { enrollment_id?: string; origin?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const enrollmentId = payload.enrollment_id?.trim()
  if (!enrollmentId) return json({ error: 'Missing enrollment id' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) {
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500)
  }

  // Caller-scoped client → RLS decides whether this staff member may read the
  // enrollment. No service-role key is used anywhere in this function.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: row, error } = await supabase
    .from('enrollments')
    .select(
      'id, status, course_id, access_email_at, students(full_name, email), courses(title), academies(name)',
    )
    .eq('id', enrollmentId)
    .maybeSingle()

  if (error) return json({ error: error.message }, 400)
  if (!row) return json({ error: 'Enrollment not found or not permitted' }, 404)
  if (row.status !== 'active')
    return json({ error: 'This enrollment is not active' }, 409)
  // The claim IS the authorization to send. See the header note.
  if (!row.access_email_at)
    return json({ error: 'No access email was claimed for this enrollment' }, 409)

  const student = one(row.students as { full_name?: string; email?: string } | null)
  const course = one(row.courses as { title?: string } | null)
  const academy = one(row.academies as { name?: string } | null)

  const to = student?.email?.trim()
  const vars: Vars = {
    student_name: student?.full_name?.trim() || 'there',
    course: course?.title ?? 'your course',
    academy: academy?.name ?? 'your academy',
  }

  // The body is per course and staff-authored. No settings row, or a blank
  // body, both mean this course sends nothing — the configured default, not an
  // error. approve_enrollment makes the same test before it claims; it is
  // repeated here because this endpoint can also be called directly.
  const { data: settings, error: settingsError } = await supabase
    .from('course_enrollment_settings')
    .select('access_email_body')
    .eq('course_id', row.course_id)
    .maybeSingle()
  if (settingsError) return json({ error: settingsError.message }, 400)
  const body = settings?.access_email_body?.trim()
  if (!body)
    return json({ error: 'This course has no acceptance email' }, 409)

  // From here down we're only reporting the *email delivery* outcome. The
  // student is already enrolled, so these are soft results (ok: false).
  if (!to) {
    return json({
      ok: false,
      code: 'no_email',
      message: 'This student has no email address on file.',
    })
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    return json({
      ok: false,
      code: 'email_not_configured',
      message: 'Email delivery is not configured yet.',
    })
  }

  const from =
    Deno.env.get('INVITE_FROM_EMAIL') ?? 'Hawary LMS <onboarding@resend.dev>'
  const base = resolveBase(payload.origin)
  const courseUrl = `${base}/learn/courses/${encodeURIComponent(row.course_id)}`

  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
        // Closes the one window the row lock cannot: this function sent, then
        // died before stamping access_email_id, and somebody re-invoked it.
        // Resend dedupes on this key for 24h.
        'Idempotency-Key': `enrollment-email:${row.id}`,
      },
      // A hung provider would otherwise freeze the approvals page: the client
      // awaits this call so it can render a failure line.
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        from,
        to: [to],
        subject: `You're enrolled in ${vars.course} at ${vars.academy}`,
        html: emailHtml(body, vars, courseUrl),
        text: emailText(body, vars, courseUrl),
      }),
    })
  } catch (e) {
    console.error('send-course-access: provider unreachable', row.id, e)
    return json({
      ok: false,
      code: 'send_failed',
      message: 'Could not reach the email provider.',
    })
  }

  if (!res.ok) {
    // Log the provider detail server-side; don't echo it to the client.
    console.error(
      'send-course-access: provider rejected',
      row.id,
      res.status,
      await res.text().catch(() => ''),
    )
    return json({
      ok: false,
      code: 'send_failed',
      message: `The email provider rejected the request (${res.status}).`,
    })
  }

  const sent = (await res.json().catch(() => ({}))) as { id?: string }

  // Stamp the receipt. access_email_at said "a send was claimed"; this says the
  // provider accepted it. (set, null) is the one otherwise-invisible failure
  // state — claimed, never confirmed. Best-effort: the email has already gone,
  // so failing to record it must not be reported as failing to send it.
  if (sent.id) {
    const { error: stampErr } = await supabase
      .from('enrollments')
      .update({ access_email_id: sent.id })
      .eq('id', row.id)
    if (stampErr) {
      console.error(
        'send-course-access: sent but could not stamp id',
        row.id,
        sent.id,
        stampErr.message,
      )
    }
  }
  console.log('send-course-access: sent', row.id, sent.id ?? null)

  return json({ ok: true, id: sent.id ?? null, to })
})

// ----------------------------------------------------------------------------
// Email templates. Kept inline so the function stays a single deployable file.
// The BODY is staff-authored per course; only the chrome around it is ours, and
// that chrome keeps the house bilingual convention (English + one Malay line).
// ----------------------------------------------------------------------------
/**
 * Substitute the three placeholders staff may use. Anything else they type is
 * left alone — an unrecognised {{token}} is not an error, it simply does not
 * move, which is kinder than erroring on a typo in an email nobody can recall.
 */
function fill(template: string, vars: Vars): string {
  return template.replace(
    /\{\{\s*(student_name|course|academy)\s*\}\}/g,
    (_full, key: string) => vars[key as keyof Vars],
  )
}

function emailText(body: string, vars: Vars, courseUrl: string): string {
  return [
    fill(body, vars),
    '',
    'Open the course:',
    courseUrl,
    '',
    'Sign in with the email address this message was sent to.',
    'Log masuk dengan alamat e-mel yang menerima mesej ini.',
  ].join('\n')
}

function emailHtml(body: string, vars: Vars, courseUrl: string): string {
  const safeAcademy = escapeHtml(vars.academy)
  const safeCourse = escapeHtml(vars.course)
  const safeUrl = escapeHtml(courseUrl)

  // Escape FIRST, then substitute already-escaped values. The {{token}} markers
  // pass through escapeHtml untouched, so this order means a '<' typed by staff
  // — or living in a student's name — can never become markup. Blank lines
  // become paragraphs, single newlines become breaks.
  const safeBody = fill(escapeHtml(body), {
    student_name: escapeHtml(vars.student_name),
    course: safeCourse,
    academy: safeAcademy,
  })
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#3f3f46;">${para.replace(/\n/g, '<br />')}</p>`,
    )
    .join('')

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;">${safeAcademy}</p>
          <h1 style="margin:12px 0 0;font-size:20px;line-height:1.3;">You're enrolled in ${safeCourse}</h1>
          ${safeBody}
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px;">
          <a href="${safeUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">
            Open the course
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 24px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">
            Sign in with the email address this message was sent to.<br />
            Log masuk dengan alamat e-mel yang menerima mesej ini.
          </p>
          <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            If the button doesn't work, copy and paste this link into your browser:<br />
            <span style="color:#52525b;word-break:break-all;">${safeUrl}</span>
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
