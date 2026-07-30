// ============================================================================
// Edge Function: material-url
// Mints a short-lived signed URL for one course material.
// ----------------------------------------------------------------------------
// Why this exists
//   course-materials is a PRIVATE bucket — slide decks and PDFs are the thing
//   the academy sells, and in a public bucket the URL *is* the product. A
//   private bucket means every read needs a signed URL, and signing needs the
//   service role, which must never reach a browser. So the signing happens
//   here.
//
// Security model
//   - verify_jwt = true: an Authorization header is required.
//   - Entitlement is decided in the DATABASE, not here: the caller-scoped
//     client (their JWT) calls public.material_download, whose SECURITY DEFINER
//     body applies exactly the rule the table's SELECT policy applies — staff of
//     the tenant, or a student for whom the row is published and its module is
//     visible. Zero rows back means "not yours", and it is indistinguishable
//     from "does not exist", which is the correct answer to both.
//   - Only then does the service-role client sign, and only the path the
//     database returned. The request body carries an id, never a path, so a
//     caller cannot ask for an arbitrary object.
//   - The URL expires in 60 seconds. It is followed immediately by the browser;
//     a longer life only widens the window in which a copied link works.
// Auto-injected by the platform: SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.
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

const BUCKET = 'course-materials'
const EXPIRES_IN = 60 // seconds

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey)
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500)

  let body: { material_id?: unknown; download?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }

  const materialId = String(body.material_id ?? '').trim()
  if (!UUID_RE.test(materialId))
    return json({ error: 'Missing or malformed material_id' }, 400)

  // --- entitlement: decided by the database, under the caller's own JWT ------
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: rows, error: rpcErr } = await caller.rpc('material_download', {
    _material_id: materialId,
  })
  if (rpcErr) return json({ error: rpcErr.message }, 500)

  const row = Array.isArray(rows) ? rows[0] : rows
  if (!row?.file_path)
    return json(
      { error: 'This material is not available to you.', code: 'not_found' },
      404,
    )

  // --- sign (service role: the bucket is private) ---------------------------
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(row.file_path, EXPIRES_IN, {
      // Save-as name comes from the row, so the student gets
      // "Week 1 slides.pdf" rather than the uuid the object is stored under.
      // Only when the caller asked to download — previewing a PDF inline is
      // the nicer default for a link click.
      download: body.download ? (row.file_name ?? true) : undefined,
    })
  if (signErr) return json({ error: signErr.message, code: 'sign_failed' }, 500)

  return json({
    ok: true,
    url: signed.signedUrl,
    file_name: row.file_name,
    mime_type: row.mime_type,
    expires_in: EXPIRES_IN,
  })
})
