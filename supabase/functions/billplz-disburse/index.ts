// ============================================================================
// Edge Function: billplz-disburse
// Sends one chunk of an incentive batch as Billplz Payment Orders.
// ----------------------------------------------------------------------------
// This function moves real money. Every design choice below is about making a
// double transfer impossible and a stuck row visible.
//
// Security model
//   - verify_jwt = true: the caller must be a signed-in admin of the batch's
//     academy. The batch is read with a *caller-scoped* client, so RLS
//     (incentive_batches is app.is_admin on every command) is the gate; the
//     explicit academy_members check that follows keeps the guarantee if that
//     policy ever loosens.
//   - Everything after that runs under the SERVICE ROLE: incentive_payouts has
//     no client DML policy at all (the appointments precedent), and the Billplz
//     keys come from get_billplz_credentials, which is granted to service_role
//     only. Neither key is ever returned to the browser.
//   - `limit` in the body is a REQUEST: it is clamped to 1..50 here, and the
//     batch identifies its own academy, so a caller cannot widen the run or
//     reach into another tenant.
//
// Correctness model
//   - Claiming is a single SQL statement (claim_incentive_payouts), never a
//     read-then-update: the client loops these calls and double-clicks exist,
//     and two invocations must never claim the same row.
//   - Per-row POSTs are SEQUENTIAL. Billplz is a payments API; 25 parallel
//     transfers is not a thing to do to one.
//   - Chunked and resumable: 582 recipients do not fit in one invocation, so a
//     run claims at most `limit` rows, reports `remaining`, and the client calls
//     again. No row is left in 'sending' by any exit path taken here — and for
//     the exits NOT taken here (the invocation being killed mid-chunk), the
//     claim carries a 15-minute lease so a stranded row is reclaimed rather than
//     abandoned. `remaining` counts those rows too, so a batch cannot read as
//     'sent' while somebody is still unpaid.
//   - Insufficient funds stops the run dead and returns the unsent claims to
//     'pending'. A batch that half-disburses and then stalls silently is the
//     worst outcome available.
//   - Settlement is NOT this function's job: payment orders sit in `processing`
//     and are resolved by billplz-payout-callback (fast path) and
//     billplz-payout-status (the authoritative reconciler).
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

// Every payment-order request is signed: HMAC-SHA512 over the documented
// parameter values concatenated in order with no delimiter, keyed by the
// account's X Signature Key, lowercase hex.
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

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 50
const MAX_REASON = 500

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

type Client = ReturnType<typeof createClient>

type Claimed = {
  id: string
  student_id: string
  amount_sen: number
  bank_code: string
  bank_account_number: string
  account_holder_name: string
  billplz_payment_order_id: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  let payload: { batch_id?: unknown; limit?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const batchId = String(payload.batch_id ?? '').trim()
  if (!UUID_RE.test(batchId))
    return json({ error: 'Missing or malformed batch_id' }, 400)

  const asked = Number(payload.limit)
  const limit = Number.isFinite(asked)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.round(asked)))
    : DEFAULT_LIMIT

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey)
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500)

  // --- 1. authorization: the caller's own JWT, judged by the database --------
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData } = await caller.auth.getUser()
  const me = userData?.user
  if (!me) return json({ error: 'Not authenticated' }, 401)

  const { data: batch } = await caller
    .from('incentive_batches')
    .select(
      'id, academy_id, title, description, status, billplz_collection_id, is_sandbox, callback_nonce',
    )
    .eq('id', batchId)
    .maybeSingle()
  // Invisible and non-existent are the same answer, and it is the right one.
  if (!batch) return json({ error: 'Batch not found', code: 'not_found' }, 404)

  const { data: membership } = await caller
    .from('academy_members')
    .select('role')
    .eq('academy_id', batch.academy_id)
    .eq('user_id', me.id)
    .eq('status', 'active')
    .maybeSingle()
  if (!membership || membership.role !== 'admin')
    return json({ error: 'Only an academy admin can send transfers' }, 403)

  if (batch.status === 'cancelled')
    return json({ ok: false, code: 'batch_cancelled' })

  // --- 2. service role from here on ----------------------------------------
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  // --- 3. credentials -------------------------------------------------------
  const { data: settings } = await admin
    .from('academy_payment_settings')
    .select('billplz_has_secret, billplz_is_sandbox, billplz_enabled')
    .eq('academy_id', batch.academy_id)
    .maybeSingle()
  if (!settings?.billplz_has_secret) return json({ ok: false, code: 'not_configured' })

  const { data: creds, error: credErr } = await admin.rpc('get_billplz_credentials', {
    _academy: batch.academy_id,
  })
  if (credErr) return json({ error: credErr.message }, 500)
  const secret = str((creds as Record<string, unknown> | null)?.secret)
  const xsign = str((creds as Record<string, unknown> | null)?.xsign)
  if (!secret || !xsign) return json({ ok: false, code: 'not_configured' })

  // The BATCH decides the environment, always — never the academy's current
  // setting. create_incentive_batch pins is_sandbox at creation and the batch
  // page paints its "Sandbox" badge from that same column, so reading settings
  // here would let an academy that reconnected with live keys send a batch the
  // UI still labels Sandbox. The badge has to predict the endpoint, and the
  // failure is asymmetric: a live batch sent to the sandbox moves no money and
  // is obvious, a sandbox-labelled batch sent live is hundreds of thousands of
  // ringgit that cannot be recalled.
  const sandbox = batch.is_sandbox !== false
  const base = BASE(sandbox)

  const title = str(batch.title).slice(0, 255) || 'Incentive'
  // Billplz caps `description` at 200 chars and rejects special characters
  // outright. It is computed once and sent on every POST in the loop, so an
  // apostrophe or a hyphen in the academy's own batch title would fail the
  // entire chunk identically — hence the same `clean` the ToyyibPay functions
  // use, and a fallback for a title that cleans away to nothing.
  const description = clean(str(batch.description) || title, 200) || 'Incentive'

  // --- 4. the collection (once per batch) -----------------------------------
  let collectionId = str(batch.billplz_collection_id)
  let batchStatus = String(batch.status)

  if (!collectionId) {
    // Refuse an empty batch: creating the collection flips it out of 'draft',
    // and set_incentive_recipients is draft-only — an empty batch that reached
    // 'sent' could never be given recipients again.
    const { count } = await admin
      .from('incentive_payouts')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batch.id)
    if (!count) return json({ ok: false, code: 'no_recipients' })

    const epoch = String(Math.floor(Date.now() / 1000))
    const callbackUrl = `${supabaseUrl}/functions/v1/billplz-payout-callback?k=${batch.callback_nonce}`
    const res = await fetch(`${base}/payment_order_collections`, {
      method: 'POST',
      headers: {
        Authorization: basic(secret),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        title,
        callback_url: callbackUrl,
        epoch,
        checksum: await checksum(xsign, [title, callbackUrl, epoch]),
      }),
    })
    const text = await res.text()
    const parsed = parseBody(text)
    collectionId = str(pick(parsed, 'id'))
    if (!res.ok || !collectionId)
      return json({
        ok: false,
        code: 'collection_failed',
        message:
          extractMsg(parsed) ??
          'Billplz rejected the payment order collection. Check the API keys and that the account is approved for Payment Order.',
      })

    await admin
      .from('incentive_batches')
      .update({
        billplz_collection_id: collectionId,
        status: 'sending',
        is_sandbox: sandbox,
        sent_at: new Date().toISOString(),
      })
      .eq('id', batch.id)
    batchStatus = 'sending'
  }

  // --- 5. claim this run's rows in one statement ----------------------------
  // A single UPDATE ... FOR UPDATE SKIP LOCKED ... RETURNING inside the RPC is
  // what makes two concurrent invocations disjoint. It takes 'pending' rows and
  // 'sending' rows whose lease has expired, never one that already carries an
  // order id. PostgREST cannot reach the app schema, so the migration exposes
  // this wrapper in public (service_role only) over app.claim_incentive_payouts.
  const { data: claimedRaw, error: claimErr } = await admin.rpc(
    'claim_incentive_payouts',
    { _batch: batch.id, _limit: limit },
  )
  if (claimErr) return json({ error: claimErr.message }, 500)
  const claimed = (claimedRaw ?? []) as Claimed[]

  // One lookup for the whole chunk — the recipient notification is optional and
  // not worth a query per row.
  const emails = new Map<string, string>()
  if (claimed.length) {
    const { data: students } = await admin
      .from('students')
      .select('id, email')
      .in('id', [...new Set(claimed.map((r) => r.student_id))])
    for (const s of students ?? []) {
      const email = str(s.email)
      if (EMAIL_RE.test(email)) emails.set(String(s.id), email)
    }
  }

  // --- 6. one POST per recipient, sequentially ------------------------------
  let processed = 0
  let failed = 0
  let halted = false

  for (let i = 0; i < claimed.length; i++) {
    const row = claimed[i]

    // Idempotency: a row that already carries an order id was sent by an
    // earlier run (or by the request that timed out before it could record the
    // answer). Advance it, never re-post it.
    if (row.billplz_payment_order_id) {
      await admin
        .from('incentive_payouts')
        .update({ status: 'processing' })
        .eq('id', row.id)
        .eq('status', 'sending')
      processed++
      continue
    }

    try {
      const epoch = String(Math.floor(Date.now() / 1000))
      const total = String(row.amount_sen) // sen, 1:1 with Billplz `total`
      const fields: Record<string, string> = {
        payment_order_collection_id: collectionId,
        // SWIFT codes are case sensitive at Billplz and nothing upstream
        // guarantees the case of a stored one. Not part of the checksum, so
        // normalising here is free.
        bank_code: str(row.bank_code).toUpperCase(),
        bank_account_number: row.bank_account_number,
        name: str(row.account_holder_name).slice(0, 255),
        description,
        total,
        // The payout row's own id: this is how the callback finds its way home.
        reference_id: row.id,
        epoch,
        checksum: await checksum(xsign, [
          collectionId,
          row.bank_account_number,
          total,
          epoch,
        ]),
      }
      // `email` omitted defaults to the SENDER's address, which would mail the
      // academy about its own transfer instead of the student. Sent when we
      // have one; `recipient_notification` is deliberately not sent at all —
      // it is a boolean that already defaults to true, and a wrong literal is
      // worse than the default.
      const email = emails.get(row.student_id)
      if (email) fields.email = email

      const res = await fetch(`${base}/payment_orders`, {
        method: 'POST',
        headers: {
          Authorization: basic(secret),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(fields),
      })
      const text = await res.text()
      const parsed = parseBody(text)

      // The Payment Order Limit is prefunded and separate from the credit
      // balance, so this is a "top up and resume", not a failure of these rows.
      // Hand back this claim and every claim behind it, then stop: continuing
      // would just mint N identical rejections.
      if (res.status === 422 && /enough payments/i.test(text)) {
        await release(admin, claimed.slice(i).map((r) => r.id))
        halted = true
        break
      }

      const orderId = str(pick(parsed, 'id'))
      if (!res.ok || !orderId) {
        await markFailed(
          admin,
          row.id,
          extractMsg(parsed) ?? `Billplz returned HTTP ${res.status}`,
        )
        failed++
        continue
      }

      const providerStatus = str(pick(parsed, 'status')).toLowerCase()
      const done = providerStatus === 'completed'
      const nowIso = new Date().toISOString()
      const patch: Record<string, unknown> = {
        status: done ? 'completed' : 'processing',
        billplz_payment_order_id: orderId,
        provider_status: providerStatus || null,
        sent_at: nowIso,
        failure_reason: null,
      }
      if (done) patch.completed_at = nowIso

      const { data: touched } = await admin
        .from('incentive_payouts')
        .update(patch)
        .eq('id', row.id)
        .eq('status', 'sending')
        .select('id')

      if (!touched?.length) {
        // Something already moved the row on (only the callback can, and only
        // to a terminal state) — do not regress it. The order id still has to
        // land: it is how billplz-payout-status reconciles this payout.
        await admin
          .from('incentive_payouts')
          .update({ billplz_payment_order_id: orderId })
          .eq('id', row.id)
          .is('billplz_payment_order_id', null)
      }
      processed++
    } catch (e) {
      // The request threw, so its fate is unknown — Billplz may or may not have
      // accepted the order. The row is marked FAILED rather than returned to
      // 'pending', because an automatic retry could pay the same person twice
      // and a duplicate transfer cannot be undone, while a failed row is
      // visible with its reason and can be re-sent deliberately. If the order
      // did land, its callback carries reference_id and settles this row anyway.
      // markFailed refuses to touch a row that already has an order id, so a
      // throw from the bookkeeping above cannot mislabel a sent payout.
      await markFailed(admin, row.id, `Network error: ${errText(e)}`)
      failed++
    }
  }

  // --- 7. what is left ------------------------------------------------------
  // 'sending' with no order id counts as remaining, not as done. If this
  // invocation is killed mid-chunk its claimed rows are stranded there, and
  // counting only 'pending' would flip the batch to 'sent' and take away the
  // Resume button while those students go unpaid. claim_incentive_payouts
  // reclaims them once the lease expires, so they are genuinely still to send.
  const { count: openCount } = await admin
    .from('incentive_payouts')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batch.id)
    .in('status', ['pending', 'sending'])
    .is('billplz_payment_order_id', null)
  const remaining = openCount ?? 0

  if (halted)
    return json({ ok: false, code: 'insufficient_funds', processed, failed, remaining })

  if (remaining === 0) {
    await admin
      .from('incentive_batches')
      .update({ status: 'sent' })
      .eq('id', batch.id)
      .eq('status', 'sending')
    batchStatus = 'sent'
  }

  return json({ ok: true, processed, failed, remaining, batch_status: batchStatus })
})

/**
 * Return unsent claims to the pool. The two filters are the safety: a row that
 * left 'sending', or that acquired an order id, has been dealt with and must
 * never be handed back to a later run.
 */
async function release(admin: Client, ids: string[]): Promise<void> {
  if (!ids.length) return
  await admin
    .from('incentive_payouts')
    .update({ status: 'pending' })
    .in('id', ids)
    .eq('status', 'sending')
    .is('billplz_payment_order_id', null)
}

async function markFailed(admin: Client, id: string, reason: string): Promise<void> {
  await admin
    .from('incentive_payouts')
    .update({ status: 'failed', failure_reason: reason.trim().slice(0, MAX_REASON) })
    .eq('id', id)
    .eq('status', 'sending')
    .is('billplz_payment_order_id', null)
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function pick(data: unknown, key: string): unknown {
  const obj = Array.isArray(data) ? data[0] : data
  return obj && typeof obj === 'object'
    ? (obj as Record<string, unknown>)[key]
    : undefined
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

// Billplz rejects special characters in `description` outright, so the field is
// reduced to what it will accept rather than sent and hoped for — the same
// treatment `create-bill` gives ToyyibPay's text fields.
function clean(s: string, max: number): string {
  return (s || '').replace(/[^A-Za-z0-9 _]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// Billplz v5 errors come back as {"error":{"type":..,"message":["..."]}}, but a
// gateway or proxy in front of it may answer with plain text. Be defensive.
function extractMsg(data: unknown): string | null {
  const obj = Array.isArray(data) ? data[0] : data
  if (obj && typeof obj === 'object') {
    const rec = obj as Record<string, unknown>
    const nested = rec.error
    if (nested && typeof nested === 'object') {
      const m = flatten((nested as Record<string, unknown>).message)
      if (m) return m
    }
    const m = flatten(rec.message ?? rec.msg ?? nested)
    if (m) return m
  }
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, MAX_REASON)
  return null
}

function flatten(v: unknown): string | null {
  if (Array.isArray(v)) {
    const joined = v.map(str).filter(Boolean).join('; ')
    return joined ? joined.slice(0, MAX_REASON) : null
  }
  if (typeof v === 'string' && v.trim()) return v.trim().slice(0, MAX_REASON)
  return null
}
