// ============================================================================
// Edge Function: upload-media
// Uploads a file into an allow-listed bucket, always scoped to <academy_id>/ .
//
//   note-media / avatars   public  · images  · <academy_id>/<uuid>.<ext>
//   course-materials       PRIVATE · docs    · <academy_id>/<course_id>/<uuid>.<ext>
//   student-reports        PRIVATE · docs    · <academy_id>/<user_id>/<uuid>.<ext>
//
// The private buckets get no URL back — reading one goes through material-url
// or report-url instead.
//
// student-reports is the one bucket a NON-STAFF caller may write to, and it is
// the reason the authorisation below is a membership test with a role branch
// rather than a flat staff check. A student uploading their own report is the
// whole point of the bucket; the key is keyed on their own user id, and
// app.assert_own_upload re-checks that prefix before the path may be attached
// to a thread. So a student can write only under their own folder, and can
// claim only what they wrote.
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
//   - Membership for the TARGET academy is re-checked server-side with the
//     service role (authoritative, no RLS recursion). For every bucket but
//     student-reports that member must also be staff; non-members, or members
//     of a different academy, are rejected with an explicit message.
//   - bucket is allow-listed; the object key always starts with the academy id
//     the caller was just proved to belong to, so a caller can never write
//     outside its tenant.
//   - Content type is allow-listed per bucket and size is capped.
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
const BUCKETS = new Set([
  'note-media',
  'avatars',
  'course-materials',
  'student-reports',
])

/** Buckets any active member may write to; everything else is staff-only. */
const MEMBER_BUCKETS = new Set(['student-reports'])

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
/** Slide decks are not images. Bigger cap, but only for the private buckets. */
const MAX_BYTES_MATERIAL = 50 * 1024 * 1024 // 50 MB

const IMAGE_EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
}

/**
 * A document is not an image, so it needs its own allow-list. Kept in step with
 * both private buckets' allowed_mime_types — Storage would reject a mismatch
 * anyway, but a 400 from here says which type was refused.
 */
const MATERIAL_EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
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

  // multipart/form-data: file + bucket + academy_id (+ course_id for materials)
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ error: 'Expected multipart/form-data' }, 400)
  }

  const bucket = String(form.get('bucket') ?? '').trim()
  const academyId = String(form.get('academy_id') ?? '').trim()
  // Materials are filed per course so the object key mirrors the hierarchy;
  // ignored by every other bucket.
  const courseId = String(form.get('course_id') ?? '').trim()
  const file = form.get('file')

  const isMaterial = bucket === 'course-materials'
  const isReport = bucket === 'student-reports'
  // Both private buckets take the same document list and the same 50 MB cap.
  const isDoc = isMaterial || isReport

  if (!BUCKETS.has(bucket)) return json({ error: 'Unknown bucket' }, 400)
  if (!UUID_RE.test(academyId))
    return json({ error: 'Missing or malformed academy_id' }, 400)
  if (isMaterial && !UUID_RE.test(courseId))
    return json({ error: 'Missing or malformed course_id' }, 400)
  if (!(file instanceof File)) return json({ error: 'Missing file' }, 400)
  if (file.size === 0) return json({ error: 'File is empty' }, 400)

  const maxBytes = isDoc ? MAX_BYTES_MATERIAL : MAX_BYTES
  if (file.size > maxBytes)
    return json(
      { error: `File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB` },
      413,
    )

  const contentType = file.type || 'application/octet-stream'
  const ext = isDoc
    ? MATERIAL_EXT_BY_TYPE[contentType]
    : IMAGE_EXT_BY_TYPE[contentType]
  if (!ext)
    return json(
      {
        error: isDoc
          ? `Unsupported file type: ${contentType}`
          : `Unsupported image type: ${contentType}`,
      },
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

  // --- authorisation: an active member of the TARGET academy ----------------
  // For every bucket but student-reports that member must also be staff. The
  // membership read is the same either way, so the role test is the only
  // branch — a second query per bucket would be a second place to get it wrong.
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

  const memberOk = MEMBER_BUCKETS.has(bucket)
    ? !!membership
    : !!membership && ['admin', 'trainer'].includes(membership.role)

  if (!memberOk) {
    // Say which academies the caller *is* in: the failure here is almost always
    // "signed in as the wrong account", and an opaque 403 is what made the
    // original storage error so hard to place.
    const { data: mine } = await admin
      .from('academy_members')
      .select('academy_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in(
        'role',
        MEMBER_BUCKETS.has(bucket)
          ? ['admin', 'trainer', 'student']
          : ['admin', 'trainer'],
      )
    return json(
      {
        error: MEMBER_BUCKETS.has(bucket)
          ? 'You are not a member of this academy, so you cannot upload to it.'
          : 'You are not staff of this academy, so you cannot upload to it.',
        code: MEMBER_BUCKETS.has(bucket) ? 'not_member' : 'not_staff',
        signed_in_as: user.email ?? user.id,
        requested_academy: academyId,
        your_academies: (mine ?? []).map((m) => m.academy_id),
      },
      403,
    )
  }

  // Materials are filed under their course, reports under the person who
  // uploaded them, images directly under the tenant. Every key starts with the
  // academy id the caller was just proved to belong to, so nothing can be
  // written outside its tenant — and the report key's second segment is the
  // caller's own user id, which is what app.assert_own_upload later matches
  // against auth.uid() before the path may be attached to a thread.
  const path = isMaterial
    ? `${academyId}/${courseId}/${crypto.randomUUID()}.${ext}`
    : isReport
      ? `${academyId}/${user.id}/${crypto.randomUUID()}.${ext}`
      : `${academyId}/${crypto.randomUUID()}.${ext}`

  // --- write (service role: independent of storage RLS) ---------------------
  const { error: upErr } = await admin.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: false })
  if (upErr) return json({ error: upErr.message, code: 'upload_failed' }, 500)

  // The private buckets have no public URL to hand back — only the key, which
  // the caller stores on course_materials.file_path, or passes to
  // submit_report / comment_on_report. Reading one later goes through
  // material-url or report-url.
  if (isDoc) {
    return json({
      ok: true,
      path,
      file_name: file.name,
      mime_type: contentType,
      size_bytes: file.size,
    })
  }

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(path)
  return json({ ok: true, path, url: pub.publicUrl })
})
