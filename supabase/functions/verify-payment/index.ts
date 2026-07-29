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
      .select('id, bill_code, host, amount_sen')
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
        _amount_sen: normalizeSen(success.billpaymentAmount, intent.amount_sen),
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

function normalizeSen(raw: unknown, expected: number): number {
  const n = parseFloat(str(raw).replace(/,/g, ''))
  if (!Number.isFinite(n)) return -1
  const asDecimal = Math.round(n * 100)
  const asCents = Math.round(n)
  if (asCents === expected) return asCents
  if (asDecimal === expected) return asDecimal
  return asDecimal
}

function parseDate(raw: unknown): string {
  const s = str(raw)
  const t = s ? Date.parse(s) : NaN
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString()
}
