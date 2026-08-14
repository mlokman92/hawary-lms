// ============================================================================
// Edge Function: billplz-connect
// Saves an academy's Billplz API Secret Key + X Signature Key, after proving
// both of them work against the account.
// ----------------------------------------------------------------------------
// Security model
//   - verify_jwt = true: the caller must be a signed-in admin of the academy.
//   - Authorization is checked with a *caller-scoped* client (their JWT) against
//     academy_members — a non-admin (or admin of another academy) is rejected.
//   - Both keys are sent ONCE from the admin's browser over HTTPS, used
//     server-side to call Billplz, and stored via set_billplz_credentials
//     (SECURITY DEFINER → Supabase Vault). They are never written to a
//     client-readable column and never returned to the browser.
//   - Verification is GET /payment_order_limit because it is the only call that
//     exercises BOTH keys at once: the API Secret Key signs the HTTP Basic
//     header, the X Signature Key produces the checksum. One read-only round
//     trip validates the pair — nothing is created to test them, and a wrong key
//     of either kind surfaces here rather than mid-disbursement.
//   - A gateway rejection is a soft { ok: false } outcome the settings card
//     renders inline; only auth and server config problems are hard 4xx/5xx.
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

// Billplz helpers, repeated in every billplz-* function on purpose: an edge
// function ships as one self-contained file.
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

// The API Secret Key is the Basic-auth USERNAME, with an EMPTY password.
const basic = (secret: string) => 'Basic ' + btoa(`${secret}:`)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  let payload: {
    academy_id?: string
    secret_key?: string
    x_signature_key?: string
    is_sandbox?: boolean
  }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const academyId = payload.academy_id?.trim()
  const secretKey = payload.secret_key?.trim()
  const xSignatureKey = payload.x_signature_key?.trim()
  // Default sandbox: never reach for the live disbursement API by accident.
  const isSandbox = payload.is_sandbox !== false
  if (!academyId) return json({ error: 'Missing academy_id' }, 400)
  if (!secretKey || secretKey.length < 8)
    return json({ error: 'A valid Billplz API Secret Key is required' }, 400)
  if (!xSignatureKey || xSignatureKey.length < 8)
    return json({ error: 'A valid Billplz X Signature Key is required' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey)
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500)

  // Caller-scoped client → RLS + the RPC's is_admin guard enforce authorization.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData } = await supabase.auth.getUser()
  const caller = userData?.user
  if (!caller) return json({ error: 'Not authenticated' }, 401)

  // Confirm the caller is an active admin of this academy before doing any work.
  const { data: membership } = await supabase
    .from('academy_members')
    .select('role')
    .eq('academy_id', academyId)
    .eq('user_id', caller.id)
    .eq('status', 'active')
    .maybeSingle()
  if (!membership || membership.role !== 'admin')
    return json({ error: 'Only an academy admin can configure payments' }, 403)

  // Every payment-order call carries `epoch` (UNIX seconds) and a checksum over
  // its listed values; for /payment_order_limit that list is [epoch] alone. The
  // string sent in the query and the string that is hashed must be identical.
  const epoch = String(Math.floor(Date.now() / 1000))
  const sig = await checksum(xSignatureKey, [epoch])
  const url =
    `${BASE(isSandbox)}/payment_order_limit?epoch=${encodeURIComponent(epoch)}&checksum=${sig}`

  let res: Response
  try {
    res = await fetch(url, {
      headers: { Authorization: basic(secretKey), Accept: 'application/json' },
    })
  } catch {
    return json({
      ok: false,
      code: 'verify_failed',
      message: 'Could not reach Billplz. Try again in a moment.',
    })
  }

  const text = await res.text()
  let data: unknown = null
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }

  if (!res.ok) {
    return json({
      ok: false,
      code: 'verify_failed',
      message:
        extractMsg(data) ??
        'Billplz rejected the credentials. Check the API Secret Key and the X Signature Key, and whether this account is Sandbox or Live.',
    })
  }

  // `total` is the Payment Order Limit and is already in sen — no conversion.
  const total = data && typeof data === 'object'
    ? (data as Record<string, unknown>).total
    : null
  const limitSen =
    total === null || total === undefined || total === '' || !Number.isFinite(Number(total))
      ? null
      : Math.trunc(Number(total))

  // Store both keys (Vault) + metadata; the RPC re-checks is_admin.
  const { data: saved, error } = await supabase.rpc('set_billplz_credentials', {
    _academy: academyId,
    _secret: secretKey,
    _xsign: xSignatureKey,
    _is_sandbox: isSandbox,
    _enabled: true,
  })
  if (error) return json({ error: error.message }, 400)

  const meta = (saved ?? {}) as { last4?: string }
  return json({
    ok: true,
    last4: meta.last4 ?? secretKey.slice(-4),
    is_sandbox: isSandbox,
    enabled: true,
    limit_sen: limitSen,
  })
})

// Billplz errors are {"error":{"type":"...","message":[...]}} — `message` is an
// array of validation strings on 422 and a bare string on 401.
function extractMsg(data: unknown): string | null {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  const err = root?.error ?? root
  if (err && typeof err === 'object') {
    const rec = err as Record<string, unknown>
    const msg = rec.message ?? rec.error
    if (Array.isArray(msg)) {
      const joined = msg.filter((m) => typeof m === 'string').join(' ').trim()
      if (joined) return joined.slice(0, 200)
    }
    if (typeof msg === 'string' && msg.trim()) return msg.trim().slice(0, 200)
  }
  if (typeof err === 'string' && err.trim()) return err.trim().slice(0, 200)
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 200)
  return null
}
