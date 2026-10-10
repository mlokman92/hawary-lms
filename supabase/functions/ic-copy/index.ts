// ============================================================================
// Edge Function: ic-copy
// The PDF copy of a student's identity card — the student uploads theirs, and
// the student or an admin gets a short-lived link to look at it.
//
//   multipart/form-data  file + student_id   -> upload (or replace)
//   application/json     { student_id }      -> signed URL
// ----------------------------------------------------------------------------
// Why one function
//   The same reasons payment-receipt is one: the bucket is PRIVATE, both
//   halves need the service role — to write past storage RLS, and to sign —
//   and `student_ic_copies` takes no client writes, so the object and its row
//   are written together here and the upload is undone if the row fails.
//
// Security model
//   - verify_jwt = true: an Authorization header is required.
//   - Identity comes from the JWT, never the body.
//   - Upload: the student record is read with the service role, and the caller
//     must be the account that record is linked to (`students.user_id`). The
//     academy is taken from the record, not the request, so the object key and
//     the row can only land in the student's own tenant. "No such student" and
//     "not yours" return the same 404. Staff do not upload on a student's
//     behalf.
//   - Link: entitlement is decided by the DATABASE under the caller's own JWT
//     — student_ic_copies' SELECT policy is `app.is_admin OR
//     app.owns_student`. Zero rows means "not yours" or "none uploaded", and
//     only a path the database handed back is ever signed. The body carries an
//     id, never a path.
//   - PDF only — by declared type and by the file's first bytes — size is
//     capped, and the URL lives 60 seconds.
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

const BUCKET = 'ic-copies'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const EXPIRES_IN = 60 // seconds

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const NOT_FOUND = {
  error: 'This IC copy is not available to you.',
  code: 'not_found',
}

const NOT_PDF = {
  error: 'Upload the IC copy as a PDF file.',
  code: 'bad_type',
}

/** A PDF starts `%PDF-`. The declared type is only what the browser guessed. */
async function looksLikePdf(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  return (
    head.length === 5 &&
    head[0] === 0x25 &&
    head[1] === 0x50 &&
    head[2] === 0x44 &&
    head[3] === 0x46 &&
    head[4] === 0x2d
  )
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
  // Link: { student_id, download? } -> signed URL
  // ==========================================================================
  if (!isUpload) {
    let body: { student_id?: unknown; download?: unknown }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Expected a JSON body' }, 400)
    }
    const studentId = String(body.student_id ?? '').trim()
    if (!UUID_RE.test(studentId))
      return json({ error: 'Missing or malformed student_id' }, 400)

    // The caller's own JWT: RLS on student_ic_copies decides.
    const { data: row, error: rowErr } = await caller
      .from('student_ic_copies')
      .select('file_path, file_name')
      .eq('student_id', studentId)
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
      expires_in: EXPIRES_IN,
    })
  }

  // ==========================================================================
  // Upload: file + student_id -> object + row
  // ==========================================================================
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ error: 'Expected multipart/form-data' }, 400)
  }

  const studentId = String(form.get('student_id') ?? '').trim()
  const file = form.get('file')
  if (!UUID_RE.test(studentId))
    return json({ error: 'Missing or malformed student_id' }, 400)
  if (!(file instanceof File)) return json({ error: 'Missing file' }, 400)
  if (file.size === 0) return json({ error: 'File is empty' }, 400)
  if (file.size > MAX_BYTES)
    return json(
      { error: `File is larger than ${MAX_BYTES / 1024 / 1024} MB` },
      413,
    )
  if (file.type !== 'application/pdf' || !(await looksLikePdf(file)))
    return json(NOT_PDF, 415)

  // --- identity: from the JWT only -----------------------------------------
  const { data: userData, error: userErr } = await caller.auth.getUser()
  const user = userData?.user
  if (userErr || !user)
    return json({ error: 'Not authenticated', detail: userErr?.message }, 401)

  // --- the record, and whether it is the caller's own ------------------------
  const { data: student, error: studentErr } = await admin
    .from('students')
    .select('id, academy_id, user_id, archived_at')
    .eq('id', studentId)
    .maybeSingle()
  if (studentErr) return json({ error: studentErr.message }, 500)
  // Same answer for "no such student" and "not yours": an id is not something
  // to confirm to a caller who has no business with it.
  if (!student || student.archived_at || student.user_id !== user.id)
    return json(NOT_FOUND, 404)

  // --- write the object ------------------------------------------------------
  const path = `${student.academy_id}/${student.id}/${crypto.randomUUID()}.pdf`
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: false })
  if (upErr) return json({ error: upErr.message, code: 'upload_failed' }, 500)

  // --- then the row ----------------------------------------------------------
  // The old object, if this is a replacement, is removed only after the new
  // row is safely in — so a failure anywhere leaves the previous copy exactly
  // as it was.
  const { data: previous } = await admin
    .from('student_ic_copies')
    .select('file_path')
    .eq('student_id', student.id)
    .maybeSingle()

  const { error: rowErr } = await admin.from('student_ic_copies').upsert(
    {
      student_id: student.id,
      academy_id: student.academy_id,
      file_path: path,
      file_name: file.name,
      size_bytes: file.size,
      uploaded_by: user.id,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'student_id' },
  )
  if (rowErr) {
    // No row, so nothing may point at this object: take it back out.
    await admin.storage.from(BUCKET).remove([path])
    return json({ error: rowErr.message, code: 'save_failed' }, 500)
  }

  if (previous?.file_path && previous.file_path !== path) {
    // Best effort, as in payment-receipt: failing the request over a stray
    // object would tell the student their upload did not work when it did.
    await admin.storage.from(BUCKET).remove([previous.file_path])
  }

  return json({
    ok: true,
    student_id: student.id,
    file_name: file.name,
    size_bytes: file.size,
    replaced: !!previous?.file_path,
  })
})
