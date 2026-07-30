// ============================================================================
// Edge Function: toyyibpay-callback
// Server-to-server payment notification from ToyyibPay → settles the invoice.
// (Fast-path only: verify-payment polling is the authoritative reconciler.)
// ----------------------------------------------------------------------------
// Trust model
//   - verify_jwt = false: ToyyibPay's server has no Supabase JWT. Uses the
//     SERVICE ROLE and does its own tenant lookup.
//   - The callback is UNSIGNED, so posted status/amount are only a trigger. We
//     identify our intent by order_id (== intent.id) OR the posted bill_code,
//     require the URL nonce ?k to match intent.nonce, re-query
//     getBillTransactions by our STORED bill_code, require the returned
//     billExternalReferenceNo == our intent id, then settle idempotently.
//   - Always returns HTTP 200 quickly.
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

function ok(msg = 'OK'): Response {
  return new Response(msg, { status: 200 })
}

function host(isSandbox: boolean): string {
  return isSandbox ? 'https://dev.toyyibpay.com' : 'https://toyyibpay.com'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return ok()
  if (req.method !== 'POST') return ok()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return ok()

  const url = new URL(req.url)
  const nonceFromQuery = url.searchParams.get('k') ?? ''

  // Read fields from the POST body; fall back to the query string defensively.
  const fields = await readFields(req, url)
  const orderId = fields.order_id?.trim()
  const postedBillCode = (fields.billcode ?? fields.billCode ?? '').trim()
  // ToyyibPay's callback doesn't always include order_id, so identify the intent
  // by order_id (== intent.id) OR by the posted bill_code (unique). Either alone
  // is enough; the unguessable nonce below is the real gate.
  if (!orderId && !postedBillCode) return ok()

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  // 1. Our own intent is the tenancy anchor.
  const cols =
    'id, academy_id, invoice_id, amount_sen, fee_sen, bill_code, nonce, host, status'
  let intent: {
    id: string
    academy_id: string
    invoice_id: string
    amount_sen: number
    fee_sen: number | null
    bill_code: string | null
    nonce: string | null
    host: string | null
    status: string
  } | null = null
  if (orderId) {
    const { data } = await admin
      .from('payment_intents')
      .select(cols)
      .eq('id', orderId)
      .maybeSingle()
    intent = data
  }
  if (!intent && postedBillCode) {
    const { data } = await admin
      .from('payment_intents')
      .select(cols)
      .eq('bill_code', postedBillCode)
      .maybeSingle()
    intent = data
  }
  if (!intent) return ok() // unknown reference — ignore silently

  // Short-circuit once terminal.
  if (intent.status === 'succeeded' || intent.status === 'failed') return ok()

  // 2. Nonce + 3. billcode must match what WE recorded (H2).
  if (intent.nonce && nonceFromQuery !== intent.nonce) return ok()
  if (intent.bill_code && postedBillCode && postedBillCode !== intent.bill_code)
    return ok()
  if (!intent.bill_code) return ok() // nothing to verify against yet

  // 4. Re-query ToyyibPay authoritatively BY BILL CODE. getBillTransactions must
  //    NOT be given a userSecretKey (the sandbox returns "No data found!"). We
  //    re-query OUR OWN stored bill_code and require billExternalReferenceNo ==
  //    intent id; the unguessable nonce (checked above) gates the whole path.
  const base = intent.host || host(true)
  let txns: Record<string, unknown>[] = []
  try {
    const res = await fetch(`${base}/index.php/api/getBillTransactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ billCode: intent.bill_code }),
    })
    const parsed = JSON.parse(await res.text())
    if (Array.isArray(parsed)) txns = parsed as Record<string, unknown>[]
  } catch {
    return ok()
  }

  const success = txns.find(
    (t) =>
      String(t.billpaymentStatus) === '1' &&
      str(t.billExternalReferenceNo) === intent.id,
  )

  if (!success) {
    if (String(fields.status ?? '') === '3') {
      await admin
        .from('payment_intents')
        .update({ status: 'failed' })
        .eq('id', intent.id)
        .in('status', ['created', 'pending'])
    }
    return ok()
  }

  const amountSen = normalizeSen(
    success.billpaymentAmount,
    intent.amount_sen,
    intent.amount_sen + (intent.fee_sen ?? 0),
  )
  const providerRef =
    str(success.billpaymentInvoiceNo) ||
    str(fields.transaction_id) ||
    str(fields.refno) ||
    intent.bill_code
  const paidAt = parseDate(success.billPaymentDate ?? success.billpaymentDate)

  await admin.rpc('record_gateway_payment', {
    _intent_id: intent.id,
    _amount_sen: amountSen,
    _provider_ref: providerRef,
    _paid_at: paidAt,
  })

  return ok()
})

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
      for (const [k, v] of Object.entries(body)) out[k] = String(v)
    } else {
      const body = await req.text()
      for (const [k, v] of new URLSearchParams(body)) out[k] = v
    }
  } catch {
    // ignore body parse errors — query params may still carry the identifiers
  }
  return out
}

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

function parseDate(raw: unknown): string {
  const s = str(raw)
  const t = s ? Date.parse(s) : NaN
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString()
}
