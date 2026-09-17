// ============================================================================
// Edge Function: verify-payment
// Actively reconciles an invoice's payment status by re-querying ToyyibPay's
// getBillTransactions API — so settlement never depends on the (unsigned,
// sometimes-missed, sandbox-flaky) server-to-server callback. Safe to call
// repeatedly: it only settles a bill that ToyyibPay reports as genuinely paid,
// and record_gateway_payment is idempotent.
// ----------------------------------------------------------------------------
// Security model
//   - verify_jwt = false: called from the public pay/result page. Boundary is
//     the unguessable `pay_token`; tenancy is derived from data.
//   - Service role (reads intents, writes via the service-role settle RPC). No
//     secret is needed — getBillTransactions is queried by billCode only, and we
//     require the returned billExternalReferenceNo == our intent id (same H2
//     compensating control as the callback).
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
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

function host(isSandbox: boolean): string {
  return isSandbox ? 'https://dev.toyyibpay.com' : 'https://toyyibpay.com'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let payload: { pay_token?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const token = payload.pay_token?.trim()
  if (!token) return json({ error: 'Missing pay_token' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey)
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const { data: invoice } = await admin
    .from('invoices')
    .select('id, status')
    .eq('pay_token', token)
    .maybeSingle()
  if (!invoice) return json({ ok: false, code: 'not_found' }, 404)

  // Already settled — short-circuit (no ToyyibPay call).
  if (invoice.status !== 'paid') {
    const { data: intents } = await admin
      .from('payment_intents')
      .select('id, bill_code, host, amount_sen, fee_sen')
      .eq('invoice_id', invoice.id)
      .in('status', ['created', 'pending'])
      .not('bill_code', 'is', null)

    for (const intent of intents ?? []) {
      const base = intent.host || host(true)
      let txns: Record<string, unknown>[] = []
      try {
        const res = await fetch(`${base}/index.php/api/getBillTransactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ billCode: intent.bill_code as string }),
        })
        const parsed = JSON.parse(await res.text())
        if (Array.isArray(parsed)) txns = parsed as Record<string, unknown>[]
      } catch {
        continue // try the next intent / next poll
      }

      const success = txns.find(
        (t) =>
          String(t.billpaymentStatus) === '1' &&
          str(t.billExternalReferenceNo) === intent.id,
      )
      if (!success) continue

      await admin.rpc('record_gateway_payment', {
        _intent_id: intent.id,
        _amount_sen: normalizeSen(
          success.billpaymentAmount,
          intent.amount_sen,
          intent.amount_sen + (intent.fee_sen ?? 0),
        ),
        _provider_ref:
          str(success.billpaymentInvoiceNo) || (intent.bill_code as string),
        _paid_at: parseDate(success.billPaymentDate ?? success.billpaymentDate),
      })
    }
  }

  // Return the freshest status (DB is the source of truth).
  const { data: fresh } = await admin
    .from('invoices')
    .select('status')
    .eq('id', invoice.id)
    .maybeSingle()
  const { data: latest } = await admin
    .from('payment_intents')
    .select('status')
    .eq('invoice_id', invoice.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return json({
    ok: true,
    invoice_status: fresh?.status ?? invoice.status,
    intent_status: latest?.status ?? null,
  })
})

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

/**
 * ToyyibPay reports the paid amount without declaring whether it is ringgit
 * ("100.00") or sen ("10000"), so the unit is inferred by matching an amount we
 * expect. When the FPX charge is passed to the payer there are two candidates —
 * the bill amount, and the bill amount plus the surcharge — because their API
 * reference does not say which one `billpaymentAmount` carries. If neither
 * matches, read it as ringgit and let record_gateway_payment reject it.
 */
function normalizeSen(raw: unknown, ...expected: number[]): number {
  const n = parseFloat(str(raw).replace(/,/g, ''))
  if (!Number.isFinite(n)) return -1
  const asDecimal = Math.round(n * 100)
  const asCents = Math.round(n)
  if (expected.includes(asCents)) return asCents
  if (expected.includes(asDecimal)) return asDecimal
  return asDecimal
}

/**
 * ToyyibPay reports `billPaymentDate` as `dd-mm-yyyy hh:mm:ss` in Malaysia
 * time, and says neither of those things in the value itself.
 *
 * `Date.parse` alone got both halves wrong: it reads a dashed date month-first,
 * so 1 September 2026 was stored as 9 January, and it assumes UTC, which moves
 * the time another eight hours. Worse silently: any day past the 12th is not a
 * month, so the parse failed and the old fallback stamped `now()` — a payment
 * dated by when the sweep happened to run. Hence the explicit field order and
 * the `+08:00` the gateway never sends.
 *
 * Kept in step with the same helper in `toyyibpay-callback`, which reads the
 * identical field from the identical API.
 */
const MYT_OFFSET = '+08:00'

function parseDate(raw: unknown): string {
  const s = str(raw)
  const m = s.match(
    /^(\d{1,2})-(\d{1,2})-(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  )
  if (m) {
    const [, d, mo, y, hh = '00', mi = '00', ss = '00'] = m
    if (inRange(y, mo, d, hh, mi, ss)) {
      const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mi}:${ss}${MYT_OFFSET}`
      const t = Date.parse(iso)
      if (Number.isFinite(t)) return new Date(t).toISOString()
    }
  }
  // Any other shape (an ISO string, or a format they change later) still goes
  // to the platform parser; only what it also rejects falls through to now().
  const t = s ? Date.parse(s) : NaN
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString()
}

/**
 * V8 rolls an impossible date over instead of rejecting it — `31-02-2026`
 * parses happily as 3 March — so the parts are checked before they are used.
 */
function inRange(
  y: string,
  mo: string,
  d: string,
  hh: string,
  mi: string,
  ss: string,
): boolean {
  const month = Number(mo)
  const day = Number(d)
  if (month < 1 || month > 12 || day < 1) return false
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(Number(y), month, 0)).getUTCDate()
  return (
    day <= lastDay && Number(hh) <= 23 && Number(mi) <= 59 && Number(ss) <= 59
  )
}
