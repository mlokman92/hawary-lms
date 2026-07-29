// ============================================================================
// Edge Function: upload-media
// Uploads an image into a public bucket, scoped to <academy_id>/ .
// ----------------------------------------------------------------------------
// Why this exists
//   Direct browser uploads went to storage.objects and were authorised by RLS
//   policies calling app.is_staff(...). Those policies rejected every upload
//   ("new row violates row-level security policy") even for a valid staff user
//   on a correct path, while every ordinary table query kept working. Rather
//   than keep chasing how Storage binds its connection identity, uploads now go
//   through here: the caller's JWT is verified explicitly, staff membership is
//   checked against academy_members, and the write is done with the service
//   role — so it does not depend on storage RLS at all.
//
// Security model
//   - verify_jwt = true: an Authorization header is required.
//   - The caller is resolved with a *caller-scoped* client (their JWT), never
//     from anything in the request body — the body cannot spoof identity.
//   - Staff membership for the TARGET academy is re-checked server-side with
//     the service role (authoritative, no RLS recursion). Non-staff, or staff
//     of a different academy, are rejected with an explicit message.
//   - bucket is allow-listed; the object key is always
//     <academy_id>/<uuid>.<ext>, so a caller can never write outside its tenant.
//   - Content type must be an image and size is capped.
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

/** Buckets this function may write to. Anything else is rejected outright. */
const BUCKETS = new Set(['note-media', 'avatars'])

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

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

  // multipart/form-data: file + bucket + academy_id
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ error: 'Expected multipart/form-data' }, 400)
  }

  const bucket = String(form.get('bucket') ?? '').trim()
  const academyId = String(form.get('academy_id') ?? '').trim()
  const file = form.get('file')

  if (!BUCKETS.has(bucket)) return json({ error: 'Unknown bucket' }, 400)
  if (!UUID_RE.test(academyId))
    return json({ error: 'Missing or malformed academy_id' }, 400)
  if (!(file instanceof File)) return json({ error: 'Missing file' }, 400)
  if (file.size === 0) return json({ error: 'File is empty' }, 400)
  if (file.size > MAX_BYTES)
    return json({ error: 'File is larger than 10 MB' }, 413)

  const contentType = file.type || 'application/octet-stream'
  const ext = EXT_BY_TYPE[contentType]
  if (!ext)
    return json(
      { error: `Unsupported image type: ${contentType}` },
      415,
    )

  // --- identity: from the JWT only -----------------------------------------
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  const user = userData?.user
  if (userErr || !user)
    return json({ error: 'Not authenticated', detail: userErr?.message }, 401)

  // --- authorisation: staff of the TARGET academy ---------------------------
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: membership, error: memberErr } = await admin
    .from('academy_members')
    .select('role, status')
    .eq('academy_id', academyId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (memberErr) return json({ error: memberErr.message }, 500)

  if (!membership || !['admin', 'trainer'].includes(membership.role)) {
    // Say which academies the caller *is* staff of: the failure here is almost
    // always "signed in as the wrong account", and an opaque 403 is what made
    // the original storage error so hard to place.
    const { data: mine } = await admin
      .from('academy_members')
      .select('academy_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('role', ['admin', 'trainer'])
    return json(
      {
        error: 'You are not staff of this academy, so you cannot upload to it.',
        code: 'not_staff',
        signed_in_as: user.email ?? user.id,
        requested_academy: academyId,
        your_academies: (mine ?? []).map((m) => m.academy_id),
      },
      403,
    )
  }

  // --- write (service role: independent of storage RLS) ---------------------
  const path = `${academyId}/${crypto.randomUUID()}.${ext}`
  const { error: upErr } = await admin.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: false })
  if (upErr) return json({ error: upErr.message, code: 'upload_failed' }, 500)

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(path)
  return json({ ok: true, path, url: pub.publicUrl })
})
