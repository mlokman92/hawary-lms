// ============================================================================
// Edge Function: toyyibpay-connect
// Saves an academy's ToyyibPay userSecretKey and (auto) provisions a category.
// ----------------------------------------------------------------------------
// Security model
//   - verify_jwt = true: the caller must be a signed-in admin of the academy.
//   - Authorization is checked with a *caller-scoped* client (their JWT) against
//     academy_members — a non-admin (or admin of another academy) is rejected.
//   - The secret key is sent ONCE from the admin's browser over HTTPS, used
//     server-side to call ToyyibPay, and stored via set_toyyibpay_credentials
//     (SECURITY DEFINER → Supabase Vault). It is never written to a
//     client-readable column and never returned to the browser.
//   - The category is created on ToyyibPay with the same key so onboarding needs
//     only the secret; an admin may instead pass a categoryCode made in the
//     ToyyibPay dashboard.
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

function host(isSandbox: boolean): string {
  return isSandbox ? 'https://dev.toyyibpay.com' : 'https://toyyibpay.com'
}

// ToyyibPay text fields accept alphanumerics, spaces and underscores only.
function clean(s: string, max: number): string {
  return (s || '').replace(/[^A-Za-z0-9 _]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function form(url: string, fields: Record<string, string>) {
  const body = new URLSearchParams(fields)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data, text }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  let payload: {
    academy_id?: string
    secret_key?: string
    is_sandbox?: boolean
    category_code?: string
  }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const academyId = payload.academy_id?.trim()
  const secretKey = payload.secret_key?.trim()
  const isSandbox = payload.is_sandbox !== false // default sandbox
  let categoryCode = payload.category_code?.trim() || ''
  if (!academyId) return json({ error: 'Missing academy_id' }, 400)
  if (!secretKey || secretKey.length < 8)
    return json({ error: 'A valid ToyyibPay secret key is required' }, 400)

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

  const base = host(isSandbox)

  // Auto-provision a category if the admin didn't supply one.
  if (!categoryCode) {
    const { data: academy } = await supabase
      .from('academies')
      .select('name')
      .eq('id', academyId)
      .maybeSingle()
    const catName = clean(`Hawary ${academy?.name ?? 'Academy'}`, 40) || 'Hawary LMS'
    const created = await form(`${base}/index.php/api/createCategory`, {
      userSecretKey: secretKey,
      catname: catName,
      catdescription: clean('Course fees and invoices via Hawary LMS', 100),
    })
    categoryCode = extractCategoryCode(created.data)
    if (!categoryCode) {
      return json({
        ok: false,
        code: 'category_failed',
        message:
          extractMsg(created.data) ??
          'ToyyibPay rejected the secret key or could not create a category. Check the key and that the account is active.',
      })
    }
  }

  // Store the secret (Vault) + metadata; the RPC re-checks is_admin.
  const { data: saved, error } = await supabase.rpc('set_toyyibpay_credentials', {
    _academy: academyId,
    _secret: secretKey,
    _category: categoryCode,
    _is_sandbox: isSandbox,
    _enabled: true,
  })
  if (error) return json({ error: error.message }, 400)

  const meta = (saved ?? {}) as { has_secret?: boolean; last4?: string }
  return json({
    ok: true,
    has_secret: meta.has_secret ?? true,
    last4: meta.last4 ?? secretKey.slice(-4),
    category_code: categoryCode,
    is_sandbox: isSandbox,
    enabled: true,
  })
})

// createCategory responses vary: {"CategoryCode":"..."}, [{"CategoryCode":"..."}],
// or occasionally a bare code string. Be defensive.
function extractCategoryCode(data: unknown): string {
  if (!data) return ''
  if (typeof data === 'string') {
    const s = data.trim()
    // A bare code has no spaces/braces; guard against HTML/error strings.
    return /^[A-Za-z0-9]{4,}$/.test(s) ? s : ''
  }
  const obj = Array.isArray(data) ? data[0] : data
  if (obj && typeof obj === 'object') {
    const rec = obj as Record<string, unknown>
    const code = rec.CategoryCode ?? rec.categoryCode ?? rec.Category ?? ''
    return typeof code === 'string' ? code.trim() : ''
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
