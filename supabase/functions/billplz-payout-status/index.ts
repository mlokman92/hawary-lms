// ============================================================================
// Edge Function: billplz-payout-status
// Re-queries Billplz for every still-open payout of one incentive batch and
// applies the authoritative status. This is `verify-payment`'s Payment Order
// twin: settlement is reconciliation-driven, not callback-driven.
// ----------------------------------------------------------------------------
// Why this exists
//   Billplz's payment-order callback fires only on `completed`/`refunded`,
//   retries exactly once (an hour later) and wants a 200 inside 20s — so a
//   deploy, a cold start or a 21-second blip loses the notification for good,
//   and the intermediate states (`enquiring`, `executing`, `reviewing`) are
//   never announced at all. Treating it as the settlement mechanism would leave
//   money marked "sending" forever. Same lesson as ToyyibPay, recorded in
//   docs/toyyibpay-payments.md → "Settlement is reconciliation-driven, not
//   callback-driven": `billplz-payout-callback` is the fast path, this is the
//   real one. Safe to call repeatedly.
//
// Security model
//   - verify_jwt = true: an Authorization header is required.
//   - Authorization is decided by the DATABASE first: the batch is read with a
//     caller-scoped client, and incentive_batches' SELECT policy is
//     app.is_admin(academy_id) — which already demands an *active* admin
//     membership. No rows back means "not yours", indistinguishable from "does
//     not exist", which is the right answer to both.
//   - Only after that does the service-role client appear: the payout rows have
//     no client DML policy at all, and the Billplz keys come from
//     get_billplz_credentials, which is granted to service_role alone. Neither
//     key is ever returned to the browser.
// Auto-injected by the platform: SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY.
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

const BASE = (sandbox: boolean) =>
  sandbox ? 'https://www.billplz-sandbox.com/api/v5' : 'https://www.billplz.com/api/v5'

async function checksum(xsign: string, values: (string | number)[]): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(xsign),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(values.join('')),
  )
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
const basic = (secret: string) => 'Basic ' + btoa(`${secret}:`)

// Statuses we may move a row out of. `completed`/`failed`/`cancelled` are
// terminal and are never re-queried, so a reconciliation pass can only ever
// advance a payout, never resurrect one.
const OPEN_STATUSES = ['sending', 'processing']

// One invocation stays well inside the function timeout; the client loops on
// `remaining_open` for a batch with more open payouts than this.
const MAX_PER_RUN = 50

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type PayoutUpdate = {
  status: 'processing' | 'completed' | 'failed'
  provider_status: string
  completed_at?: string
  failure_reason?: string
}

/**
 * Billplz payment-order status → our payout status. Deliberately identical to
 * the mapping in billplz-payout-callback: both doors have to agree or a
 * callback and a reconciliation pass would disagree about the same payout.
 * Duplicated rather than shared because each function is a single deployable
 * file (see the note in create-bill). `refunded` means the money came back —
 * that is a FAILED payout, not a neutral one. Everything else Billplz reports
 * (`processing`, `enquiring`, `executing`, `reviewing`) is still in flight.
 */
function mapStatus(raw: string): PayoutUpdate {
  const s = raw.trim().toLowerCase()
  if (s === 'completed')
    return { status: 'completed', provider_status: raw, completed_at: new Date().toISOString() }
  if (s === 'refunded')
    return { status: 'failed', provider_status: raw, failure_reason: 'Refunded by Billplz' }
  return { status: 'processing', provider_status: raw }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  let payload: { batch_id?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const batchId = String(payload.batch_id ?? '').trim()
  if (!UUID_RE.test(batchId))
    return json({ error: 'Missing or malformed batch_id' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey)
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500)

  // --- authorization: the caller's own JWT, before anything privileged -------
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData } = await caller.auth.getUser()
  if (!userData?.user) return json({ error: 'Not authenticated' }, 401)

  const { data: batch } = await caller
    .from('incentive_batches')
    .select('id, academy_id, is_sandbox, status')
    .eq('id', batchId)
    .maybeSingle()
  if (!batch)
    return json({ error: 'Only an academy admin can check this batch', code: 'not_found' }, 403)

  // --- everything below runs as the service role ----------------------------
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: settings } = await admin
    .from('academy_payment_settings')
    .select('billplz_has_secret')
    .eq('academy_id', batch.academy_id)
    .maybeSingle()
  if (!settings?.billplz_has_secret) return json({ ok: false, code: 'not_configured' })

  const { data: creds, error: credErr } = await admin.rpc('get_billplz_credentials', {
    _academy: batch.academy_id,
  })
  if (credErr) return json({ error: credErr.message }, 500)
  const { secret, xsign } = (creds ?? {}) as { secret?: string; xsign?: string }
  if (!secret || !xsign) return json({ ok: false, code: 'not_configured' })

  // The batch pinned is_sandbox when sending started, so a later settings flip
  // cannot send us looking for a live order on the sandbox host.
  const base = BASE(batch.is_sandbox)

  const { data: payouts, error: listErr } = await admin
    .from('incentive_payouts')
    .select('id, status, provider_status, billplz_payment_order_id')
    .eq('batch_id', batchId)
    .in('status', OPEN_STATUSES)
    .not('billplz_payment_order_id', 'is', null)
    // Least-recently-reconciled first, NOT oldest-first. A batch of 582 is the
    // stated scale and this window is 50: ordering by created_at re-checks the
    // same head rows on every pass, so a row that sits in `reviewing` — or an
    // order id that 404s — starves the entire tail of the batch of the only
    // authoritative path it has. Rotating on updated_at walks the whole batch.
    .order('updated_at', { ascending: true })
    .limit(MAX_PER_RUN)
  if (listErr) return json({ error: listErr.message }, 500)

  let checked = 0
  let updated = 0

  // Sequential on purpose: this is a payments API, and 50 parallel GETs is how
  // an account gets rate-limited mid-reconciliation.
  for (const row of payouts ?? []) {
    const orderId = row.billplz_payment_order_id as string
    const epoch = Math.floor(Date.now() / 1000)

    let raw = ''
    try {
      const sum = await checksum(xsign, [orderId, epoch])
      const url =
        `${base}/payment_orders/${encodeURIComponent(orderId)}` +
        `?${new URLSearchParams({ epoch: String(epoch), checksum: sum })}`
      const res = await fetch(url, { headers: { Authorization: basic(secret) } })
      const body = (await res.json().catch(() => null)) as { status?: unknown } | null
      // A non-2xx here is Billplz being unavailable, not a failed payout — leave
      // the row open and let the next pass decide.
      if (!res.ok) continue
      raw = String(body?.status ?? '').trim()
    } catch {
      continue
    }
    checked++
    if (!raw) continue

    const next = mapStatus(raw)
    const changed = next.status !== row.status || raw !== row.provider_status

    // Written even when nothing changed, so the `set_updated_at` trigger moves
    // this row to the back of the queue the read above orders by. Skipping the
    // write is what would pin the window to the same 50 rows forever.
    //
    // Re-assert the open-status filter in the WHERE clause: a callback may have
    // landed between the read above and this write, and it must win rather than
    // be rolled back to `processing`.
    const { data: written } = await admin
      .from('incentive_payouts')
      .update(next)
      .eq('id', row.id)
      .in('status', OPEN_STATUSES)
      .select('id')
      .maybeSingle()
    if (written && changed) updated++
  }

  // Same filter as the read: rows still in flight *at Billplz*. A `sending` row
  // with no order id is disburse's business, and counting it here would make a
  // client that loops on this number spin against nothing.
  const { count } = await admin
    .from('incentive_payouts')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .in('status', OPEN_STATUSES)
    .not('billplz_payment_order_id', 'is', null)

  return json({ ok: true, checked, updated, remaining_open: count ?? 0 })
})
