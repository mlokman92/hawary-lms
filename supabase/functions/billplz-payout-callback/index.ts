// ============================================================================
// Edge Function: billplz-payout-callback
// Billplz Payment Order notification → settles one incentive payout.
// (Fast path only: billplz-payout-status re-queries Billplz and is the
// authoritative reconciler — the callback fires once and retries once.)
// ----------------------------------------------------------------------------
// Trust model
//   - verify_jwt = false: Billplz's server has no Supabase JWT. Uses the
//     SERVICE ROLE and derives tenancy from DATA — reference_id (== our payout
//     id) → batch → academy — never from anything the request claims about
//     itself.
//   - Two gates, both required. The unguessable `?k` nonce must match the
//     batch's callback_nonce (it only ever existed inside the callback_url we
//     handed Billplz), and the posted `checksum` must equal HMAC-SHA512 over
//     [id, bank_account_number, status, total, reference_id, epoch] keyed by
//     THAT academy's X Signature Key.
//   - The signature is compared in constant time. A `===` on a payout webhook
//     leaks how many leading bytes were right, and a forger walks that one byte
//     at a time until the money moves.
//   - An unknown reference_id answers 200 exactly like a success: an
//     unauthenticated caller learns nothing about which payouts exist.
//   - Billplz wants HTTP 200 within 20s and retries only once, an hour later,
//     so every non-auth path returns 200 immediately.
// Auto-injected by the platform: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
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

// Billplz signs every payment-order message with HMAC-SHA512 over the listed
// values concatenated in the documented order with no delimiter, keyed by the
// account's X Signature Key, lowercase hex. (Duplicated per function on
// purpose — each function stays a single deployable file.)
async function checksum(
  xsign: string,
  values: (string | number)[],
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(xsign),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(values.join('')),
  )
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Length is not the secret (hex SHA-512 is always 128 chars, the nonce a fixed
// 32); the XOR-accumulating loop over every byte is the point.
function equalsConstantTime(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const UNAUTHORIZED = { ok: false, error: 'Unauthorized' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: true, ignored: true })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  // The one case worth a non-200: it is our fault, and Billplz's single retry
  // is a free second chance once the env is fixed.
  if (!supabaseUrl || !serviceKey)
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500)

  const url = new URL(req.url)
  const fields = await readFields(req, url)

  // reference_id IS our payout id — the whole tenancy chain hangs off it.
  const payoutId = (fields.reference_id ?? '').trim()
  if (!UUID.test(payoutId)) return json({ ok: true, ignored: true })

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const { data: payout } = await admin
    .from('incentive_payouts')
    .select('id, batch_id, academy_id, status')
    .eq('id', payoutId)
    .maybeSingle()
  if (!payout) return json({ ok: true, ignored: true })

  const { data: batch } = await admin
    .from('incentive_batches')
    .select('id, academy_id, callback_nonce')
    .eq('id', payout.batch_id)
    .maybeSingle()
  if (!batch) return json({ ok: true, ignored: true })

  // Gate 1 — the nonce.
  if (
    !equalsConstantTime(
      url.searchParams.get('k') ?? '',
      batch.callback_nonce ?? '',
    )
  )
    return json(UNAUTHORIZED, 401)

  // Gate 2 — the signature, under the key of the academy the DATA pointed at.
  const { data: creds } = await admin.rpc('get_billplz_credentials', {
    _academy: batch.academy_id,
  })
  const xsign = ((creds ?? {}) as { xsign?: string }).xsign ?? ''
  if (!xsign) return json(UNAUTHORIZED, 401)

  // Signed over the values exactly as posted — no trimming, no re-encoding.
  const expected = await checksum(xsign, [
    fields.id ?? '',
    fields.bank_account_number ?? '',
    fields.status ?? '',
    fields.total ?? '',
    fields.reference_id ?? '',
    fields.epoch ?? '',
  ])
  const posted = (fields.checksum ?? '').trim().toLowerCase()
  if (!equalsConstantTime(expected, posted)) return json(UNAUTHORIZED, 401)

  // ---- authenticated ----

  const providerStatus = (fields.status ?? '').trim()
  // A refund is the one thing that may overturn a settled payout: Billplz
  // settles, the receiving bank bounces it, and the money comes back. Nothing
  // else ever re-reads a `completed` row (the reconciler only looks at open
  // ones), so discarding this callback would leave the row permanently claiming
  // the student was paid.
  const isRefund = providerStatus.toLowerCase() === 'refunded'

  // Billplz retries once; any other duplicate callback must not reopen a
  // settled payout.
  if (payout.status === 'completed' && !isRefund)
    return json({ ok: true, unchanged: true })

  // Keep the provider's own word whatever we map it to, so a status Billplz
  // adds later is visible on the row instead of hidden behind 'processing'.
  const patch: Record<string, unknown> = { provider_status: providerStatus }
  switch (providerStatus.toLowerCase()) {
    case 'completed':
      patch.status = 'completed'
      patch.completed_at = new Date().toISOString()
      patch.failure_reason = null
      break
    case 'refunded':
      // The money came back, so the payout did not land.
      patch.status = 'failed'
      patch.failure_reason = 'Refunded by Billplz'
      break
    default:
      patch.status = 'processing'
  }

  // Re-check the terminal guard at write time, in case the reconciler settled
  // the same row between our read and this update. A refund is exempt for the
  // reason above — it is the only signed status allowed to overturn 'completed'.
  const write = admin.from('incentive_payouts').update(patch).eq('id', payout.id)
  await (isRefund ? write : write.neq('status', 'completed'))

  return json({ ok: true, status: patch.status })
})

// Billplz posts application/x-www-form-urlencoded; accept JSON too, and seed
// from the query string defensively. Everything in here is attacker-supplied —
// the checksum above is what makes any of it trustworthy.
async function readFields(
  req: Request,
  url: URL,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const [k, v] of url.searchParams) out[k] = v
  try {
    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      const body = (await req.json()) as Record<string, unknown>
      for (const [k, v] of Object.entries(body))
        out[k] = v == null ? '' : String(v)
    } else {
      const body = await req.text()
      for (const [k, v] of new URLSearchParams(body)) out[k] = v
    }
  } catch {
    // ignore body parse errors — the query string may still carry the fields
  }
  return out
}
