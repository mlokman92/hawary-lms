// ============================================================================
// Edge Function: create-bill
// Mints a ToyyibPay bill for an invoice and returns the hosted payment URL.
// ----------------------------------------------------------------------------
// Security model
//   - verify_jwt = false: called from the login-less public pay page. The
//     boundary is the unguessable `pay_token`; tenancy is derived from data
//     (pay_token → invoice → academy), never from the request.
//   - `amount_sen` in the body is a REQUEST, not an instruction. Part-payment
//     has to be enabled on the invoice, and the figure is re-derived here under
//     the service role against the real balance and the invoice's own minimum.
//     A caller cannot bill themselves RM1 for an RM2,500 invoice.
//   - Uses the SERVICE ROLE to resolve the invoice, read the academy's secret
//     (get_toyyibpay_secret is service-role only), and write payment_intents
//     (no authenticated write policy). The secret never leaves the function.
//   - A per-bill nonce is embedded in the callback URL and stored on the intent
//     so the callback can authenticate itself (defense-in-depth alongside the
//     server-side re-query).
//   - billReturnUrl is built from server config (APP_URL) only; a client-supplied
//     `origin` is honoured solely when it matches ALLOWED_ORIGINS. Since
//     verify_jwt = false, an unauthenticated caller would otherwise choose where
//     ToyyibPay sends the payer after paying.
// Optional secrets: APP_URL (canonical base, e.g. "https://app.hawary.my"),
//   ALLOWED_ORIGINS (comma-separated origins a client `origin` may request).
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

const DEFAULT_APP_URL = 'https://app.hawary.my'
const PAYABLE = ['issued', 'partially_paid', 'overdue']

// ToyyibPay's standard B2C FPX rate: a flat RM1.00 per transaction, independent
// of the amount. Only used when the academy passes the charge to the payer, and
// only as the tolerance `record_gateway_payment` allows on top of the bill
// amount — the money itself is ToyyibPay's and never enters our ledger. If they
// ever reprice, an outdated value here shows up as `needs_reconciliation` on the
// intent, not as a wrongly settled invoice.
const FPX_FEE_SEN = 100

// ToyyibPay will not create a bill below RM1.00, so it is also the floor for a
// part-payment however small an academy sets its own minimum.
const FPX_MIN_SEN = 100

// billChargeToCustomer: blank = bill owner pays both, "0" = FPX to the customer
// and card to the owner. We open the FPX channel only (billPaymentChannel "0"),
// so "0" is the exact setting.
const CHARGE_FPX_TO_CUSTOMER = '0'

// Resolve the return-URL base from trusted server config only. A client-supplied
// origin is accepted solely when it is explicitly allowlisted. (Same helper as
// send-invitation — kept inline so each function stays a single deployable file.)
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

function host(isSandbox: boolean): string {
  return isSandbox ? 'https://dev.toyyibpay.com' : 'https://toyyibpay.com'
}

function clean(s: string, max: number): string {
  return (s || '').replace(/[^A-Za-z0-9 _]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let payload: { pay_token?: string; origin?: string; amount_sen?: number }
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

  // 1. Resolve the invoice from the pay token (tenancy comes from this row).
  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .select(
      'id, academy_id, invoice_no, currency, total_sen, amount_paid_sen, status, student_id, charge_to_payor, allow_partial_payment, min_partial_sen',
    )
    .eq('pay_token', token)
    .maybeSingle()
  if (invErr) return json({ error: invErr.message }, 500)
  if (!invoice) return json({ ok: false, code: 'not_found' }, 404)
  if (!PAYABLE.includes(invoice.status))
    return json({ ok: false, code: 'not_payable', status: invoice.status })

  const dueSen = Math.max(0, invoice.total_sen - invoice.amount_paid_sen)
  if (dueSen <= 0) return json({ ok: false, code: 'already_paid' })
  if (dueSen < FPX_MIN_SEN)
    return json({ ok: false, code: 'below_minimum', message: 'Minimum online payment is RM1.00.' })

  // 1a. Settle the amount to bill. Anything the caller asks for is bounded by
  // three server-held facts: part-payment must be on for this invoice, the
  // figure may not fall under the invoice's own minimum (itself never below
  // ToyyibPay's RM1.00, and never above what is actually left), and it may not
  // exceed the balance. Asking for more than the balance simply pays it off —
  // that is not an error worth stopping a payment for.
  const minSen = Math.min(
    dueSen,
    Math.max(invoice.min_partial_sen ?? FPX_MIN_SEN, FPX_MIN_SEN),
  )
  const requested = Number.isFinite(payload.amount_sen)
    ? Math.round(payload.amount_sen as number)
    : dueSen

  let amountSen = dueSen
  if (invoice.allow_partial_payment && requested < dueSen) {
    if (requested < minSen) {
      return json({
        ok: false,
        code: 'below_minimum',
        min_sen: minSen,
        message: `Minimum payment for this invoice is RM${(minSen / 100).toFixed(2)}.`,
      })
    }
    amountSen = requested
  }

  // 2. Load gateway settings for this academy.
  const { data: settings } = await admin
    .from('academy_payment_settings')
    .select(
      'toyyibpay_enabled, toyyibpay_category_code, toyyibpay_is_sandbox, toyyibpay_charge_to_payor',
    )
    .eq('academy_id', invoice.academy_id)
    .maybeSingle()
  if (!settings?.toyyibpay_enabled || !settings.toyyibpay_category_code)
    return json({ ok: false, code: 'not_configured' })

  const isSandbox = settings.toyyibpay_is_sandbox !== false
  const base = host(isSandbox)

  // Per-invoice decision wins; NULL means "follow the academy's default".
  const chargeToPayor =
    invoice.charge_to_payor ?? settings.toyyibpay_charge_to_payor ?? false
  const feeSen = chargeToPayor ? FPX_FEE_SEN : 0

  // 3. Reuse a live intent so a repeated click doesn't mint duplicate bills —
  // but only one for the SAME amount. A payer who opens an RM500 bill, goes
  // back and chooses RM1,000 must not be handed the RM500 bill again, which is
  // what an amount-blind reuse did.
  //
  // Intents at other amounts are deliberately left live rather than expired:
  // verify-payment sweeps every `created`/`pending` intent that has a bill
  // code, so a bill abandoned mid-flow — or paid from a stale tab after the
  // payer changed their mind — still reconciles. Two settling intents are
  // correct by construction: record_gateway_payment recomputes
  // `amount_paid_sen` from the sum of succeeded payments.
  const live = await liveIntent(admin, invoice.id, amountSen)

  let intentId = live?.id ?? crypto.randomUUID()
  let nonce = live?.nonce ?? crypto.randomUUID().replace(/-/g, '')

  if (live?.bill_code) {
    return json({ ok: true, url: `${(live.host || base)}/${live.bill_code}`, reused: true })
  }

  if (!live) {
    const { error: insErr } = await admin.from('payment_intents').insert({
      id: intentId,
      academy_id: invoice.academy_id,
      invoice_id: invoice.id,
      provider: 'toyyibpay',
      host: base,
      amount_sen: amountSen,
      status: 'created',
      nonce,
      charge_to_payor: chargeToPayor,
      fee_sen: feeSen,
    })
    if (insErr) {
      // Lost a race to a concurrent call — re-read the now-live intent.
      const raced = await liveIntent(admin, invoice.id, amountSen)
      if (raced?.bill_code)
        return json({ ok: true, url: `${(raced.host || base)}/${raced.bill_code}`, reused: true })
      if (!raced) return json({ error: insErr.message }, 500)
      intentId = raced.id
      nonce = raced.nonce ?? nonce
    }
  }

  // 4. Read the academy's secret (service-role only) and the payer details.
  const { data: secret, error: secErr } = await admin.rpc('get_toyyibpay_secret', {
    _academy: invoice.academy_id,
  })
  if (secErr) return json({ error: secErr.message }, 500)
  if (!secret) return json({ ok: false, code: 'not_configured' })

  const { data: student } = await admin
    .from('students')
    .select('full_name, email, phone')
    .eq('id', invoice.student_id)
    .maybeSingle()

  const appUrl = resolveBase(payload.origin)
  const returnUrl = `${appUrl}/pay/${encodeURIComponent(token)}/result`
  const callbackUrl = `${supabaseUrl}/functions/v1/toyyibpay-callback?k=${nonce}`

  // 5. Create the bill on ToyyibPay (amount is in cents = sen; FPX only).
  // billPayorInfo=1 makes ToyyibPay REQUIRE billTo/billEmail/billPhone, so only
  // enable it when the student record has all three; otherwise let the payer
  // enter their details on ToyyibPay's page (=0). billTo is always non-empty.
  const payerName = clean(student?.full_name ?? '', 50)
  const payerEmail = (student?.email ?? '').trim()
  const payerPhone = (student?.phone ?? '').trim()
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payerEmail)
  const hasFullPayer = !!payerName && validEmail && !!payerPhone

  const fields: Record<string, string> = {
    userSecretKey: secret as string,
    categoryCode: settings.toyyibpay_category_code,
    billName: clean(invoice.invoice_no, 30) || 'Invoice',
    // Says "Part payment" on the payer's bank confirmation and in the
    // ToyyibPay dashboard, so an instalment is not mistaken for a settled bill.
    billDescription: clean(
      `${amountSen < dueSen ? 'Part payment' : 'Payment'} for ${invoice.invoice_no}`,
      100,
    ),
    billPriceSetting: '1',
    billPayorInfo: hasFullPayer ? '1' : '0',
    billAmount: String(amountSen),
    billReturnUrl: returnUrl,
    billCallbackUrl: callbackUrl,
    billExternalReferenceNo: intentId,
    billPaymentChannel: '0',
    billTo: payerName || 'Customer',
  }
  if (validEmail) fields.billEmail = payerEmail
  if (payerPhone) fields.billPhone = payerPhone
  // Omitted entirely when the academy absorbs the charge — ToyyibPay reads a
  // blank/absent billChargeToCustomer as "bill owner pays".
  if (chargeToPayor) fields.billChargeToCustomer = CHARGE_FPX_TO_CUSTOMER

  const res = await fetch(`${base}/index.php/api/createBill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  })
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text
  }

  const billCode = extractBillCode(parsed)
  if (!billCode) {
    return json(
      {
        ok: false,
        code: 'gateway_rejected',
        message: extractMsg(parsed) ?? 'ToyyibPay could not create the bill.',
      },
      502,
    )
  }

  // Restate the charge terms alongside the bill code: this row is what
  // record_gateway_payment judges the settled amount against, so it must record
  // what we actually sent — including on a reused intent minted before the
  // academy changed its default.
  await admin
    .from('payment_intents')
    .update({
      bill_code: billCode,
      status: 'pending',
      host: base,
      charge_to_payor: chargeToPayor,
      fee_sen: feeSen,
    })
    .eq('id', intentId)

  return json({ ok: true, url: `${base}/${billCode}`, amount_sen: amountSen })
})

/**
 * The newest live intent for this invoice at exactly this amount.
 *
 * `limit(1)` rather than `.maybeSingle()`: part-payment means an invoice can
 * legitimately carry several live intents at once (RM500 abandoned, RM1,000
 * open), and `.maybeSingle()` errors on more than one row.
 */
async function liveIntent(
  admin: ReturnType<typeof createClient>,
  invoiceId: string,
  amountSen: number,
) {
  const { data } = await admin
    .from('payment_intents')
    .select('id, bill_code, nonce, host')
    .eq('invoice_id', invoiceId)
    .eq('amount_sen', amountSen)
    .in('status', ['created', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
  return (data?.[0] ?? null) as {
    id: string
    bill_code: string | null
    nonce: string | null
    host: string | null
  } | null
}

function extractBillCode(data: unknown): string {
  const obj = Array.isArray(data) ? data[0] : data
  if (obj && typeof obj === 'object') {
    const code = (obj as Record<string, unknown>).BillCode
    if (typeof code === 'string' && code.trim()) return code.trim()
  }
  return ''
}

function extractMsg(data: unknown): string | null {
  const obj = Array.isArray(data) ? data[0] : data
  if (obj && typeof obj === 'object') {
    const rec = obj as Record<string, unknown>
    const msg = rec.msg ?? rec.message ?? rec.error
    if (typeof msg === 'string') return msg
  }
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 200)
  return null
}
