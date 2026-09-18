// ============================================================================
// Edge Function: report-url
// Mints a short-lived signed URL for one file on a report-check thread.
// ----------------------------------------------------------------------------
// This is material-url with a different table, and deliberately a separate
// function rather than a `bucket` parameter on that one: the thing that decides
// entitlement is the database function it calls, so a shared function would
// have to take the RPC name from the client, which is the one input that must
// never come from there.
//
// Security model (identical to material-url, which is the point):
//   - verify_jwt = true: an Authorization header is required.
//   - Entitlement is decided in the DATABASE, under the caller's own JWT:
//     public.report_download applies exactly the rule report_submissions' SELECT
//     policy applies — admin of the tenant, the assigned checker, or the student
//     whose report it is. Zero rows means "not yours", indistinguishable from
//     "does not exist", which is the correct answer to both.
//   - Only then does the service-role client sign, and only the path the
//     database returned. The request body carries a FILE ID, never a path, so a
//     caller cannot ask for an arbitrary object in the bucket.
//   - The URL expires in 60 seconds. It is followed immediately by the browser;
//     a longer life only widens the window in which a copied link works — and
//     the object here is somebody's unfinished coursework.
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

const BUCKET = 'student-reports'
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

  let body: { file_id?: unknown; download?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }

  const fileId = String(body.file_id ?? '').trim()
  if (!UUID_RE.test(fileId))
    return json({ error: 'Missing or malformed file_id' }, 400)

  // --- entitlement: decided by the database, under the caller's own JWT ------
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: rows, error: rpcErr } = await caller.rpc('report_download', {
    _file_id: fileId,
  })
  if (rpcErr) return json({ error: rpcErr.message }, 500)

  const row = Array.isArray(rows) ? rows[0] : rows
  if (!row?.file_path)
    return json(
      { error: 'This file is not available to you.', code: 'not_found' },
      404,
    )

  // --- sign (service role: the bucket is private) ---------------------------
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(row.file_path, EXPIRES_IN, {
      // Save-as name comes from the row, so the reader gets "LPKC v2.pdf"
      // rather than the uuid the object is stored under. Only when they asked
      // to download — previewing a PDF inline is the nicer default for a click.
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
