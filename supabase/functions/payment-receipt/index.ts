// ============================================================================
// Edge Function: payment-receipt
// The receipt a bank-transfer payment was recorded from — attach one, or get a
// short-lived link to look at it.
//
//   multipart/form-data  file + payment_id   -> upload (or replace)
//   application/json     { payment_id }      -> signed URL
// ----------------------------------------------------------------------------
// Why one function, and why not upload-media
//   The bucket is PRIVATE: a receipt carries a payer's name, bank and account
//   number. Both halves need the service role — to write past storage RLS, and
//   to sign — and both are about the same object under the same rule, so they
//   live together.
//
//   upload-media stops at the file and leaves the caller to insert its row.
//   Here the row *is* the point (a payment is "pending" exactly when it has no
//   receipt row), and the table takes no client writes. So this function
//   uploads the object and writes the row in one go, and undoes the upload if
//   the row fails — there is never a receipt nobody can see, or a row pointing
//   at nothing.
//
// Security model
//   - verify_jwt = true: an Authorization header is required.
//   - Identity comes from the JWT, never the body.
//   - Upload: the payment is read with the service role, then the caller must
//     be an active **admin** of *that payment's* academy. The academy is taken
//     from the payment, not the request, so the object key and the row can
//     only ever land in the payment's own tenant. "No such payment" and "not
//     yours" return the same 404.
//   - Link: entitlement is decided by the DATABASE under the caller's own JWT
//     — payment_receipts' SELECT policy is admin-only. Zero rows means "not
//     yours" or "none uploaded", and only a path the database handed back is
//     ever signed. The body carries an id, never a path.
//   - Type is allow-listed, size is capped, and the URL lives 60 seconds.
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

const BUCKET = 'payment-receipts'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const EXPIRES_IN = 60 // seconds

/** Kept in step with the bucket's own allowed_mime_types. */
const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const NOT_FOUND = {
  error: 'This payment is not available to you.',
  code: 'not_found',
}

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

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const isUpload = (req.headers.get('Content-Type') ?? '').includes(
    'multipart/form-data',
  )

  // ==========================================================================
  // Link: { payment_id, download? } -> signed URL
  // ==========================================================================
  if (!isUpload) {
    let body: { payment_id?: unknown; download?: unknown }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Expected a JSON body' }, 400)
    }
    const paymentId = String(body.payment_id ?? '').trim()
    if (!UUID_RE.test(paymentId))
      return json({ error: 'Missing or malformed payment_id' }, 400)

    // The caller's own JWT: RLS on payment_receipts decides.
    const { data: row, error: rowErr } = await caller
      .from('payment_receipts')
      .select('file_path, file_name, mime_type')
      .eq('payment_id', paymentId)
      .maybeSingle()
    if (rowErr) return json({ error: rowErr.message }, 500)
    if (!row?.file_path) return json(NOT_FOUND, 404)

    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(row.file_path, EXPIRES_IN, {
        download: body.download ? (row.file_name ?? true) : undefined,
      })
    if (signErr)
      return json({ error: signErr.message, code: 'sign_failed' }, 500)

    return json({
      ok: true,
      url: signed.signedUrl,
      file_name: row.file_name,
      mime_type: row.mime_type,
      expires_in: EXPIRES_IN,
    })
  }

  // ==========================================================================
  // Upload: file + payment_id -> object + row
  // ==========================================================================
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ error: 'Expected multipart/form-data' }, 400)
  }

  const paymentId = String(form.get('payment_id') ?? '').trim()
  const file = form.get('file')
  if (!UUID_RE.test(paymentId))
    return json({ error: 'Missing or malformed payment_id' }, 400)
  if (!(file instanceof File)) return json({ error: 'Missing file' }, 400)
  if (file.size === 0) return json({ error: 'File is empty' }, 400)
  if (file.size > MAX_BYTES)
    return json(
      { error: `File is larger than ${MAX_BYTES / 1024 / 1024} MB` },
      413,
    )

  const contentType = file.type || 'application/octet-stream'
  const ext = EXT_BY_TYPE[contentType]
  if (!ext)
    return json(
      {
        error: `Unsupported file type: ${contentType}. Upload a PDF, JPG, PNG or WebP.`,
        code: 'bad_type',
      },
      415,
    )

  // --- identity: from the JWT only -----------------------------------------
  const { data: userData, error: userErr } = await caller.auth.getUser()
  const user = userData?.user
  if (userErr || !user)
    return json({ error: 'Not authenticated', detail: userErr?.message }, 401)

  // --- the payment, and whether the caller administers its academy ----------
  const { data: payment, error: payErr } = await admin
    .from('payments')
    .select('id, academy_id, method')
    .eq('id', paymentId)
    .maybeSingle()
  if (payErr) return json({ error: payErr.message }, 500)
  if (!payment) return json(NOT_FOUND, 404)

  const { data: membership, error: memberErr } = await admin
    .from('academy_members')
    .select('role')
    .eq('academy_id', payment.academy_id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .eq('role', 'admin')
    .maybeSingle()
  if (memberErr) return json({ error: memberErr.message }, 500)
  // Same answer as "no such payment": an id is not something to confirm to a
  // caller who has no business with it.
  if (!membership) return json(NOT_FOUND, 404)

  if (payment.method !== 'bank_transfer')
    return json(
      {
        error: 'Only a bank-transfer payment takes a receipt.',
        code: 'not_bank_transfer',
      },
      400,
    )

  // --- write the object ------------------------------------------------------
  const path = `${payment.academy_id}/${payment.id}/${crypto.randomUUID()}.${ext}`
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false })
  if (upErr) return json({ error: upErr.message, code: 'upload_failed' }, 500)

  // --- then the row ----------------------------------------------------------
  // The old object, if this is a replacement, is removed only after the new
  // row is safely in — so a failure anywhere leaves the previous receipt
  // exactly as it was.
  const { data: previous } = await admin
    .from('payment_receipts')
    .select('file_path')
    .eq('payment_id', payment.id)
    .maybeSingle()

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()
  const uploadedByName = profile?.full_name?.trim() || user.email || null

  const { error: rowErr } = await admin.from('payment_receipts').upsert(
    {
      payment_id: payment.id,
      academy_id: payment.academy_id,
      file_path: path,
      file_name: file.name,
      mime_type: contentType,
      size_bytes: file.size,
      uploaded_by: user.id,
      uploaded_by_name: uploadedByName,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'payment_id' },
  )
  if (rowErr) {
    // No row, so nothing may point at this object: take it back out.
    await admin.storage.from(BUCKET).remove([path])
    return json({ error: rowErr.message, code: 'save_failed' }, 500)
  }

  if (previous?.file_path && previous.file_path !== path) {
    // Best effort. A stray object costs a few hundred kilobytes; failing the
    // request over it would tell the admin their upload did not work when it
    // did.
    await admin.storage.from(BUCKET).remove([previous.file_path])
  }

  return json({
    ok: true,
    payment_id: payment.id,
    file_name: file.name,
    mime_type: contentType,
    size_bytes: file.size,
    replaced: !!previous?.file_path,
  })
})
