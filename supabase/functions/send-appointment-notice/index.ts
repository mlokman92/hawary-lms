// ============================================================================
// Edge Function: send-appointment-notice
// Tells both parties what became of a one-to-one session: the student, and the
// instructor the rota (or a staff member) picked.
// ----------------------------------------------------------------------------
// Three events, one function
//   `event` in the body says which: `booked` (the default, and what this
//   function did when it only did one thing), `cancelled` (the session is off)
//   and `reassigned` (staff could not take it, somebody else covered — the
//   session survives with a different instructor). They are one function and
//   not three because the shape is identical: two parties, an id-only body,
//   RLS-then-service-role authorization, academy-timezone formatting and one
//   template. Only the heading, the "with" line, the button and one detail row
//   differ, and a second copy of the other two hundred lines would be a second
//   place for the trust model to drift.
//
//   Who is told differs too, and it is decided HERE, not by the caller. For
//   `cancelled` and `reassigned` **the actor is skipped**, the same rule the
//   in-app notification follows: a message telling you what you just clicked is
//   not news. `booked` is unchanged — a booking confirmation is wanted by the
//   person who booked, and it carries the details they need to turn up.
// ----------------------------------------------------------------------------
// Why this one needs the service role, when send-invitation and
// send-course-access do not
//   Those email one person, and that person's address is on a row the caller
//   can already read. This emails *two* people, and a student cannot read
//   `instructors` at all — that table is staff-only, deliberately: under round
//   robin even naming the free teachers would defeat the mode. So the function
//   follows the `material-url` shape instead:
//
//     1. AUTHORIZE under the caller's own JWT. The appointment is read with a
//        caller-scoped client, so RLS decides — "admin all, own instructor,
//        own student" — falling back to active staff membership of the
//        appointment's academy, which covers a trainer booking for a student
//        under round robin (she cannot read the session the rota just gave to
//        somebody else). No row and no membership means 404, which is the right
//        answer to both "not yours" and "does not exist".
//     2. Only then READ AND SEND under the service role, and only for the
//        appointment the database just admitted. The request body carries an
//        id, never an address: that is what stops this being an open relay.
//
// Recipients are never client input
//   Both addresses come from the record — `students.email` / `instructors.email`
//   — falling back to the linked account's auth address when the record has
//   none. The fallback is why "every confirmed booking tells both parties" is
//   actually true: 22 of 659 student records carry no email of their own, and a
//   student who can book is by definition a linked account with a real inbox.
//
// Idempotency
//   A booking is an INSERT, so unlike an approval there is no race to lose: the
//   row did not exist a moment ago and only its creator knows the id. What is
//   left is a client re-invoking (a double-click, a reload), and two things
//   settle that — a party with a receipt id is skipped, and each send carries a
//   per-recipient Resend Idempotency-Key, which dedupes for 24h. A re-invoke
//   after a partial failure therefore fills only the gap.
//
//   The two new events carry **no receipt columns**, only the key. Cancelling
//   is terminal — `cancel_appointment` refuses a row that is not `booked`, so
//   there is no second cancellation of the same session to distinguish — and a
//   handover keys on the instructor who received it, so a session passed on
//   twice mails twice, which is correct. Columns would buy nothing that the
//   24h key does not already give, and would need a migration to say it.
//
// Required / optional function secrets (all already set, shared with the three
// other mail functions — this introduces no new secret):
//   RESEND_API_KEY     Resend API key. If unset, responds
//                      { ok: false, code: 'email_not_configured' } and the
//                      booking still stands — nothing breaks.
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
const DEFAULT_TZ = 'Asia/Kuala_Lumpur'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Same helper as the other three mail functions — kept inline so each function
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
    return u.origin // scheme+host+port only; drops any path/query and normalizes
  } catch {
    return DEFAULT_APP_URL
  }
}

// PostgREST returns a to-one embed as an object, but tolerate an array too.
function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

type Person = { full_name?: string | null; email?: string | null; user_id?: string | null }

/** What happened to the session. `booked` is the default so older clients — and
 *  the booking call, which sends no `event` — keep working unchanged. */
const EVENTS = ['booked', 'cancelled', 'reassigned'] as const
type Event = (typeof EVENTS)[number]

/** The status the row must be in for the event to be true of it. A session
 *  cancelled between the RPC and this call must not send "you're booked", and a
 *  handover leaves the row `booked` — the instructor changed, not the status. */
const EXPECTED_STATUS: Record<Event, string> = {
  booked: 'booked',
  cancelled: 'cancelled',
  reassigned: 'booked',
}

/** What one recipient's send came to. `id` set means the provider took it. */
type Outcome = { sent: boolean; code?: string; id?: string | null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  let payload: { appointment_id?: unknown; event?: unknown; origin?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const appointmentId = String(payload.appointment_id ?? '').trim()
  if (!UUID_RE.test(appointmentId))
    return json({ error: 'Missing or malformed appointment_id' }, 400)

  const event = (payload.event ?? 'booked') as Event
  if (!EVENTS.includes(event)) return json({ error: 'Unknown event' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey)
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500)

  // --- 1. authorization: RLS first, then "could you have booked this?" ------
  //
  // The primary check is unchanged and is still RLS deciding: read the
  // appointment under the caller's own JWT and let the policy answer. A row
  // means the student it belongs to, the instructor taking it, or an admin.
  //
  // The second arm exists because the read policy is narrower than the set of
  // people who can legitimately cause this call. `appointments: admin all, own
  // instructor, own student` deliberately hides other instructors' sessions
  // from a trainer — but a trainer booking on a student's behalf under round
  // robin hands the session to whoever the rota picks, which is usually
  // somebody else. She just created it and cannot read it, so the RLS probe
  // alone would 404 and neither party would be told their session exists.
  //
  // So: staff of the appointment's own academy may trigger its notice. That is
  // the honest boundary — it is exactly the set of people `book_appointment`
  // lets book on a student's behalf. The membership is checked against the
  // **verified JWT's** subject, the way upload-media re-checks staff for its
  // target academy; the client still sends nothing but an id, so this is not a
  // relay either way.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const [{ data: visible, error: visErr }, { data: auth }] = await Promise.all([
    caller.from('appointments').select('id').eq('id', appointmentId).maybeSingle(),
    // Read up here rather than only on the fallback path: the actor decides who
    // is *told* about a cancellation or a handover, not just who may ask.
    caller.auth.getUser(),
  ])
  if (visErr) return json({ error: visErr.message }, 400)
  const uid = auth?.user?.id ?? null

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  if (!visible) {
    if (!uid) return json({ error: 'Appointment not found or not permitted' }, 404)

    // Whose academy, read under the service role — the caller has already
    // proved nothing at this point, so this is a lookup, not a grant.
    const { data: owner } = await admin
      .from('appointments')
      .select('academy_id')
      .eq('id', appointmentId)
      .maybeSingle()
    if (!owner)
      return json({ error: 'Appointment not found or not permitted' }, 404)

    const { data: member } = await admin
      .from('academy_members')
      .select('role')
      .eq('academy_id', owner.academy_id)
      .eq('user_id', uid)
      .eq('status', 'active')
      .maybeSingle()
    if (!member || (member.role !== 'admin' && member.role !== 'trainer'))
      return json({ error: 'Appointment not found or not permitted' }, 404)
  }

  // --- 2. the detail, under the service role --------------------------------
  const { data: row, error: rowErr } = await admin
    .from('appointments')
    .select(
      'id, status, starts_at, ends_at, note, cancel_reason, instructor_id, ' +
        'student_notice_id, instructor_notice_id, ' +
        'students(full_name, email, user_id), instructors(full_name, email, user_id), ' +
        'academies(name, timezone)',
    )
    .eq('id', appointmentId)
    .maybeSingle()
  if (rowErr) return json({ error: rowErr.message }, 400)
  if (!row) return json({ error: 'Appointment not found' }, 404)

  // The row has to agree with the event. A session cancelled between the insert
  // and this call must not send "you're booked", and a cancellation notice for
  // a session that is still on would be worse.
  if (row.status !== EXPECTED_STATUS[event])
    return json({ error: `This session is ${row.status}` }, 409)
  // Receipts belong to the booking confirmation alone — see the header.
  if (event === 'booked' && row.student_notice_id && row.instructor_notice_id)
    return json({ error: 'Both parties have already been told' }, 409)

  const student = one(row.students as Person | Person[] | null)
  const instructor = one(row.instructors as Person | Person[] | null)
  const academy = one(
    row.academies as { name?: string; timezone?: string } | null,
  )

  const tz = academy?.timezone?.trim() || DEFAULT_TZ
  const academyName = academy?.name?.trim() || 'Your academy'
  const studentName = student?.full_name?.trim() || 'A student'
  const instructorName = instructor?.full_name?.trim() || 'your instructor'

  const [studentTo, instructorTo] = await Promise.all([
    addressFor(admin, student),
    addressFor(admin, instructor),
  ])

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
  const when = formatWhen(row.starts_at, row.ends_at, tz)
  // On a cancellation the booking note is no longer the news; why it is off is.
  const detail =
    event === 'cancelled'
      ? row.cancel_reason?.trim() || null
      : row.note?.trim() || null
  const detailLabel = event === 'cancelled' ? 'Reason' : 'Note'

  // Whoever pressed the button already knows. Skipped only for the two events
  // that report somebody else's decision — a booking confirmation is wanted by
  // the person who made it, and carries the details they need to turn up.
  const skipActor = event !== 'booked'
  const actorIsStudent = skipActor && !!uid && student?.user_id === uid
  const actorIsInstructor = skipActor && !!uid && instructor?.user_id === uid

  const copy = COPY[event]

  // --- 3. send: each party independently ------------------------------------
  // A receipt short-circuits only the booking confirmation; the other two are
  // deduped by the Resend key alone — see the header.
  const studentOutcome: Outcome = actorIsStudent
    ? { sent: true, code: 'is_actor', id: null }
    : event === 'booked' && row.student_notice_id
      ? { sent: true, code: 'already_sent', id: row.student_notice_id }
      : await send(resendKey, {
          from,
          to: studentTo,
          idempotencyKey: keyFor(event, row.id, row.instructor_id, 'student'),
          subject: `${copy.student.subject(instructorName)} — ${when.subject}`,
          heading: copy.student.heading,
          withLabel: copy.student.withLabel,
          withName: instructorName,
          academy: academyName,
          when,
          detail,
          detailLabel,
          cta: 'View my sessions',
          url: `${base}/learn/appointments`,
        })

  const instructorOutcome: Outcome = actorIsInstructor
    ? { sent: true, code: 'is_actor', id: null }
    : event === 'booked' && row.instructor_notice_id
      ? { sent: true, code: 'already_sent', id: row.instructor_notice_id }
      : await send(resendKey, {
          from,
          to: instructorTo,
          idempotencyKey: keyFor(event, row.id, row.instructor_id, 'instructor'),
          subject: `${copy.instructor.subject(studentName)} — ${when.subject}`,
          heading: copy.instructor.heading,
          withLabel: copy.instructor.withLabel,
          withName: studentName,
          academy: academyName,
          when,
          detail,
          detailLabel,
          cta: copy.instructor.cta,
          // The diary is one week wide and has nowhere to draw a cancelled
          // session, so anything but a fresh booking leads to the register.
          url: `${base}${copy.instructor.path}`,
        })

  // --- 4. the receipts ------------------------------------------------------
  // Booking only. Best-effort: the mail has already gone, so failing to record
  // it must never be reported as failing to send it. `notice_sent_at` is
  // stamped even when neither party had an address — it says an attempt ran,
  // which is the difference between "nobody could be told" and "nothing was
  // tried".
  if (event === 'booked') {
    const patch: Record<string, string> = {
      notice_sent_at: new Date().toISOString(),
    }
    if (studentOutcome.id) patch.student_notice_id = studentOutcome.id
    if (instructorOutcome.id) patch.instructor_notice_id = instructorOutcome.id
    const { error: stampErr } = await admin
      .from('appointments')
      .update(patch)
      .eq('id', row.id)
    if (stampErr)
      console.error(
        'send-appointment-notice: sent but could not stamp',
        row.id,
        stampErr.message,
      )
  }

  console.log(
    'send-appointment-notice:',
    event,
    row.id,
    'student=',
    studentOutcome.code ?? studentOutcome.id,
    'instructor=',
    instructorOutcome.code ?? instructorOutcome.id,
  )

  return json({
    ok: studentOutcome.sent && instructorOutcome.sent,
    student: studentOutcome,
    instructor: instructorOutcome,
  })
})

/**
 * What each party is told, per event.
 *
 * A table rather than three branches because the only differences ARE these
 * strings: authorization, addresses, timezone and template are one code path
 * for all three, and that is the whole argument for one function.
 */
const COPY: Record<
  Event,
  {
    student: {
      subject: (other: string) => string
      heading: string
      withLabel: string
    }
    instructor: {
      subject: (other: string) => string
      heading: string
      withLabel: string
      cta: string
      path: string
    }
  }
> = {
  booked: {
    student: {
      subject: (n) => `Your session with ${n}`,
      heading: 'Your session is booked',
      withLabel: 'With',
    },
    instructor: {
      subject: (n) => `New session with ${n}`,
      heading: 'A session has been booked with you',
      withLabel: 'Student',
      cta: 'Open the diary',
      path: '/appointments',
    },
  },
  cancelled: {
    student: {
      subject: (n) => `Cancelled: your session with ${n}`,
      heading: 'Your session has been cancelled',
      withLabel: 'Was with',
    },
    instructor: {
      subject: (n) => `Cancelled: your session with ${n}`,
      heading: 'A session has been cancelled',
      withLabel: 'Student',
      cta: 'Open the register',
      path: '/appointments/list',
    },
  },
  reassigned: {
    student: {
      subject: (n) => `Your session is now with ${n}`,
      heading: 'Your session has a new instructor',
      withLabel: 'Now with',
    },
    instructor: {
      subject: (n) => `Session with ${n} passed to you`,
      heading: 'A session has been passed to you',
      withLabel: 'Student',
      cta: 'Open the register',
      path: '/appointments/list',
    },
  },
}

/**
 * The Resend dedupe key. Cancelling is terminal — `cancel_appointment` refuses
 * a row that is not `booked` — so the id and the party are enough. A handover
 * keys on the instructor who RECEIVED it, so a session passed on twice mails
 * twice, which is the truth.
 */
function keyFor(
  event: Event,
  id: string,
  instructorId: string,
  party: 'student' | 'instructor',
): string {
  if (event === 'cancelled') return `appointment-cancel:${id}:${party}`
  if (event === 'reassigned')
    return `appointment-move:${id}:${instructorId}:${party}`
  return `appointment-notice:${id}:${party}`
}

/**
 * The record's address, or the linked account's.
 *
 * The record comes first because it is what the academy has on file and what
 * staff can see on the row. The auth address is the fallback, not the default:
 * a CSV-imported record with no email still belongs to a real person once they
 * have claimed it, and a booking confirmation that silently goes nowhere is
 * worse than one sent to the inbox they signed in with.
 */
async function addressFor(
  admin: ReturnType<typeof createClient>,
  person: Person | null,
): Promise<string | null> {
  const onRecord = person?.email?.trim()
  if (onRecord) return onRecord
  if (!person?.user_id) return null
  const { data, error } = await admin.auth.admin.getUserById(person.user_id)
  if (error) return null
  return data.user?.email?.trim() || null
}

type When = { subject: string; long: string; tz: string }

/** The session time in the ACADEMY's zone — never the server's, never UTC. */
function formatWhen(startsAt: string, endsAt: string, tz: string): When {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const date = new Intl.DateTimeFormat('en-MY', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(start)
  const time = (d: Date) =>
    new Intl.DateTimeFormat('en-MY', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d)
  return {
    subject: `${date}, ${time(start)}`,
    long: `${date}, ${time(start)} – ${time(end)}`,
    tz,
  }
}

type Mail = {
  from: string
  to: string | null
  idempotencyKey: string
  subject: string
  heading: string
  withLabel: string
  withName: string
  academy: string
  when: When
  /** The one free-text row: the booking note, or why it was cancelled. */
  detail: string | null
  detailLabel: string
  cta: string
  url: string
}

async function send(apiKey: string, mail: Mail): Promise<Outcome> {
  if (!mail.to) return { sent: false, code: 'no_email', id: null }

  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Closes the window a receipt column cannot: this function sent, then
        // died before stamping. Resend dedupes on this key for 24h.
        'Idempotency-Key': mail.idempotencyKey,
      },
      // A hung provider must not freeze the page that just booked.
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
    console.error('send-appointment-notice: provider unreachable', mail.idempotencyKey, e)
    return { sent: false, code: 'send_failed', id: null }
  }

  if (!res.ok) {
    // Log the provider detail server-side; don't echo it to the client.
    console.error(
      'send-appointment-notice: provider rejected',
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
// Email templates. Kept inline so the function stays a single deployable file.
// One shape serves both parties; only the heading, the "with" line and the
// button differ. The chrome keeps the house bilingual convention (English plus
// one Malay line) — transactional email is not translated yet.
// ----------------------------------------------------------------------------
function emailText(mail: Mail): string {
  return [
    mail.heading,
    '',
    `When: ${mail.when.long}`,
    `${mail.withLabel}: ${mail.withName}`,
    ...(mail.detail ? [`${mail.detailLabel}: ${mail.detail}`] : []),
    '',
    `${mail.cta}:`,
    mail.url,
    '',
    `Times are in ${mail.when.tz}.`,
    'Waktu mengikut zon masa akademi.',
  ].join('\n')
}

function emailHtml(mail: Mail): string {
  const academy = escapeHtml(mail.academy)
  const heading = escapeHtml(mail.heading)
  const url = escapeHtml(mail.url)
  const rows = [
    ['When', escapeHtml(mail.when.long)],
    [escapeHtml(mail.withLabel), escapeHtml(mail.withName)],
    ...(mail.detail
      ? [[escapeHtml(mail.detailLabel), escapeHtml(mail.detail)]]
      : []),
  ]
    .map(
      ([label, value]) =>
        `<tr>
           <td style="padding:6px 12px 6px 0;font-size:13px;color:#71717a;white-space:nowrap;vertical-align:top;">${label}</td>
           <td style="padding:6px 0;font-size:14px;color:#18181b;">${value}</td>
         </tr>`,
    )
    .join('')

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;">${academy}</p>
          <h1 style="margin:12px 0 16px;font-size:20px;line-height:1.3;">${heading}</h1>
          <table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>
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
            Times are in ${escapeHtml(mail.when.tz)}.<br />
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
