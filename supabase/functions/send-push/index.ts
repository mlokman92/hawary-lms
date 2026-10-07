// ============================================================================
// Edge Function: send-push
// Delivers notification rows to phones through Expo's push service.
// ----------------------------------------------------------------------------
// A push is a COPY of a `notifications` row. The row is written in the same
// transaction as the thing it reports (a booking, a comment, a payment); the
// `notifications_dispatch_push` trigger then posts the new row ids here. If
// this function is down, slow or refused, nothing is lost — the notification
// is already in the bell.
//
// Trust model — the send-appointment-reminders shape, not the user-facing one:
//   - verify_jwt = false. The caller is Postgres (pg_net), which has no JWT.
//   - It authenticates with a Vault secret (`push_dispatch`), read here through
//     `push_dispatch_secret()`, which only the service role may execute.
//   - The body carries notification IDS and nothing else. Who is told, what
//     they are told and in which language all come from the stored rows, so a
//     caller cannot use this function to push arbitrary text to anybody.
//
// Which app gets it
//   A person can have both apps on one phone. `data.role` says which side of
//   the event the recipient is on — 'student' goes to the Student app,
//   'instructor' to the Academy app. Kinds without a role are student-only
//   today (work, invoices, payments, announcements).
//
// Language
//   The row stores an event, not a sentence (docs/notifications.md), and the
//   app renders it in the reader's language. A push has to be a sentence, so
//   it is written here in the language the device registered with. English
//   and Malay only, mirroring the app's two dictionaries.
//
// Optional secret: EXPO_ACCESS_TOKEN — required only if "Enhanced security for
// push notifications" is switched on for the Expo account.
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Lang = 'en' | 'ms'
type Row = {
  id: string
  academy_id: string
  user_id: string
  kind: string
  data: Record<string, unknown>
}
type Device = {
  id: string
  user_id: string
  app: 'student' | 'academy'
  token: string
  lang: Lang
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
/** Expo accepts at most 100 messages per request. */
const EXPO_BATCH = 100

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function money(sen: unknown): string {
  const n = typeof sen === 'number' ? sen : Number(sen ?? 0)
  return `RM ${(n / 100).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function when(iso: unknown, tz: unknown, lang: Lang): string {
  const s = str(iso)
  if (!s) return ''
  return new Date(s).toLocaleString(lang === 'ms' ? 'ms-MY' : 'en-MY', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: str(tz) || 'Asia/Kuala_Lumpur',
  })
}

function day(iso: unknown, lang: Lang): string {
  const s = str(iso)
  if (!s) return ''
  return new Date(s).toLocaleDateString(lang === 'ms' ? 'ms-MY' : 'en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kuala_Lumpur',
  })
}

const REPORT_STATUS: Record<Lang, Record<string, string>> = {
  en: {
    submitted: 'Waiting',
    in_review: 'Being checked',
    changes_requested: 'Changes needed',
    approved: 'Approved',
  },
  ms: {
    submitted: 'Menunggu',
    in_review: 'Sedang disemak',
    changes_requested: 'Perlu pembetulan',
    approved: 'Diluluskan',
  },
}

const join = (...parts: string[]) => parts.filter(Boolean).join(' · ')

/**
 * The sentence for one row in one language, or null for a kind this function
 * does not know — an unknown kind is skipped, never pushed as a blank.
 *
 * Wording follows the `notifications` namespace of the shared dictionary
 * (packages/shared/src/i18n/locales); the Malay follows the house style in
 * docs/i18n.md.
 */
function compose(row: Row, lang: Lang): { title: string; body: string } | null {
  const d = row.data ?? {}
  const ms = lang === 'ms'
  const name = str(d.with_name) || (ms ? 'seseorang' : 'someone')
  const staff = d.role === 'instructor'
  const withName = ms ? `bersama ${name}` : `with ${name}`
  const session = join(when(d.starts_at, d.tz, lang), withName)
  const report = join(str(d.title), str(d.course))

  switch (row.kind) {
    case 'appointment_booked':
      return {
        title: staff
          ? ms ? 'Sesi baharu' : 'New session'
          : ms ? 'Sesi ditempah' : 'Session booked',
        body: session,
      }
    case 'appointment_reassigned':
      return {
        title: staff
          ? ms ? 'Satu sesi diserahkan kepada anda' : 'A session was passed to you'
          : ms ? 'Pengajar sesi anda bertukar' : 'Your session has a new instructor',
        body: session,
      }
    case 'appointment_cancelled':
      return { title: ms ? 'Sesi dibatalkan' : 'Session cancelled', body: session }
    case 'appointment_reminder':
      return { title: ms ? 'Sesi anda esok' : 'Your session tomorrow', body: session }

    case 'report_submitted':
      return staff
        ? {
            title: ms ? 'Laporan untuk disemak' : 'A report to check',
            body: join(name, report),
          }
        : { title: ms ? 'Laporan anda telah dihantar' : 'Your report was sent', body: report }
    case 'report_comment':
      return {
        title: staff
          ? ms ? `${name} membalas pada satu laporan` : `${name} replied on a report`
          : ms ? `${name} memberi komen pada laporan anda` : `${name} commented on your report`,
        body: report,
      }
    case 'report_status': {
      const status = REPORT_STATUS[lang][str(d.status)] ?? str(d.status)
      return {
        title: staff
          ? ms ? `Laporan bersama ${name}: ${status}` : `Report with ${name}: ${status}`
          : ms ? `Laporan anda: ${status}` : `Your report: ${status}`,
        body: report,
      }
    }
    case 'report_assigned':
      return {
        title: staff
          ? ms ? 'Satu laporan diberikan kepada anda' : 'A report was assigned to you'
          : ms ? `Laporan anda kini bersama ${name}` : `Your report is now with ${name}`,
        body: staff ? join(name, report) : report,
      }

    case 'work_marked': {
      const score =
        d.score === null || d.score === undefined
          ? ''
          : `${d.score}${d.out_of === null || d.out_of === undefined ? '' : ` / ${d.out_of}`}`
      return {
        title: ms ? 'Markah anda telah keluar' : 'Your work has been marked',
        body: join(str(d.title), score),
      }
    }
    case 'work_due':
      return {
        title: ms ? 'Perlu dihantar tidak lama lagi' : 'Due soon',
        body: join(str(d.title), when(d.due_at, null, lang)),
      }

    case 'invoice_issued': {
      const due = day(d.due_at, lang)
      return {
        title: ms ? `Invois baharu ${str(d.invoice_no)}` : `New invoice ${str(d.invoice_no)}`,
        body: join(
          money(d.total_sen),
          due ? (ms ? `perlu dibayar sebelum ${due}` : `due ${due}`) : '',
        ),
      }
    }
    case 'payment_received':
      return {
        title: ms ? 'Bayaran diterima' : 'Payment received',
        body: join(money(d.amount_sen), str(d.invoice_no)),
      }

    case 'announcement':
      return {
        title: str(d.title) || (ms ? 'Pengumuman' : 'Announcement'),
        body: join(str(d.course), str(d.preview)),
      }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey)
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // --- the caller is our own database, or nobody ----------------------------
  const { data: secret, error: secretErr } = await admin.rpc('push_dispatch_secret')
  if (secretErr || !secret) return json({ error: 'Server misconfigured: no secret' }, 500)
  const presented = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (presented.length !== String(secret).length || presented !== secret)
    return json({ error: 'Not authorized' }, 401)

  let body: { ids?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 500)
    : []
  if (ids.length === 0) return json({ ok: true, sent: 0 })

  const { data: rows, error: rowsErr } = await admin
    .from('notifications')
    .select('id, academy_id, user_id, kind, data')
    .in('id', ids)
  if (rowsErr) return json({ error: rowsErr.message }, 500)

  const users = [...new Set((rows ?? []).map((r) => r.user_id))]
  if (users.length === 0) return json({ ok: true, sent: 0 })

  const { data: devices, error: devErr } = await admin
    .from('push_devices')
    .select('id, user_id, app, token, lang')
    .in('user_id', users)
  if (devErr) return json({ error: devErr.message }, 500)

  const byUser = new Map<string, Device[]>()
  for (const d of (devices ?? []) as Device[]) {
    const list = byUser.get(d.user_id) ?? []
    list.push(d)
    byUser.set(d.user_id, list)
  }

  // --- one message per (row, device of the right app) -----------------------
  const messages: Record<string, unknown>[] = []
  const owner: Device[] = []
  for (const row of (rows ?? []) as Row[]) {
    const app = row.data?.role === 'instructor' ? 'academy' : 'student'
    for (const device of byUser.get(row.user_id) ?? []) {
      if (device.app !== app) continue
      const text = compose(row, device.lang === 'ms' ? 'ms' : 'en')
      if (!text) continue
      messages.push({
        to: device.token,
        title: text.title,
        body: text.body || undefined,
        sound: 'default',
        channelId: 'default',
        // What the app needs to open the right screen and mark the row read.
        // The app computes the route itself, with the same function its bell
        // uses, so a push and a bell row can never lead to different places.
        data: {
          notification_id: row.id,
          academy_id: row.academy_id,
          kind: row.kind,
          payload: row.data,
        },
      })
      owner.push(device)
    }
  }
  if (messages.length === 0) return json({ ok: true, sent: 0 })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN')
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`

  let sent = 0
  const dead: string[] = []
  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    const chunk = messages.slice(i, i + EXPO_BATCH)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      })
      const out = (await res.json().catch(() => null)) as {
        data?: { status: string; details?: { error?: string } }[]
      } | null
      const tickets = out?.data ?? []
      tickets.forEach((ticket, j) => {
        if (ticket.status === 'ok') sent += 1
        // The app was uninstalled, or the token was rotated. Keeping the row
        // would mean a failed call for this person on every event, for ever.
        else if (ticket.details?.error === 'DeviceNotRegistered') {
          const device = owner[i + j]
          if (device) dead.push(device.id)
        }
      })
      if (!res.ok) console.error('expo push refused', res.status, JSON.stringify(out))
    } catch (e) {
      // Logged, never thrown: the notification is already in the bell.
      console.error('expo push failed', e)
    }
  }

  if (dead.length > 0) {
    await admin.from('push_devices').delete().in('id', dead)
  }

  return json({ ok: true, sent, pruned: dead.length })
})
