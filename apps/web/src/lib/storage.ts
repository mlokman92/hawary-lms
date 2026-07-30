import { supabase } from './supabase'
import { translate } from './i18n'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type UploadResponse = {
  ok?: boolean
  url?: string
  path?: string
  file_name?: string
  mime_type?: string
  size_bytes?: number
  error?: string
  code?: string
  signed_in_as?: string
  requested_academy?: string
  your_academies?: string[]
}

/** Turn a FunctionsHttpError into the sentence the function actually sent. */
async function functionError(error: unknown): Promise<Error> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    const detail = (await ctx.json().catch(() => null)) as UploadResponse | null
    if (detail?.code === 'not_staff') {
      return new Error(
        translate('upload.not_staff', {
          account: detail.signed_in_as ?? translate('upload.another_account'),
        }),
      )
    }
    if (detail?.error) return new Error(detail.error)
  }
  return error instanceof Error ? error : new Error(translate('upload.failed'))
}

/**
 * Upload an image and return its public URL.
 *
 * Goes through the `upload-media` Edge Function rather than
 * `supabase.storage.upload()`: the direct path is authorised by RLS policies on
 * storage.objects calling app.is_staff(...), and those rejected every upload
 * ("new row violates row-level security policy") even for a valid staff user on
 * a correct <academy_id>/... path. The function verifies the caller's JWT,
 * re-checks staff membership for the target academy, and writes with the
 * service role — so uploads no longer depend on storage RLS.
 *
 * Pass the *record's own* academy_id where there is one, not the ambient active
 * academy, so the file always lands in the row's tenant.
 */
export async function uploadPublicImage(
  bucket: string,
  academyId: string,
  file: File,
): Promise<string> {
  if (!UUID_RE.test(academyId)) {
    throw new Error(translate('upload.no_academy'))
  }

  const body = new FormData()
  body.append('file', file)
  body.append('bucket', bucket)
  body.append('academy_id', academyId)

  // invoke() attaches the caller's access token; FormData sets its own boundary.
  const { data, error } = await supabase.functions.invoke<UploadResponse>(
    'upload-media',
    { body },
  )

  // FunctionsHttpError keeps the JSON body on `context`; surface the real
  // reason (wrong account, unsupported type, too large) instead of "failed".
  if (error) throw await functionError(error)

  if (!data?.url) throw new Error(data?.error ?? translate('upload.failed'))
  return data.url
}

export type UploadedMaterial = {
  path: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

/**
 * Upload a course material and return what the `course_materials` row needs.
 *
 * Unlike `uploadPublicImage` there is no URL to return: the bucket is private,
 * because slide decks and PDFs are the thing the academy sells. The caller
 * stores the path; reading it later goes through `materialUrl` below.
 */
export async function uploadMaterial(
  academyId: string,
  courseId: string,
  file: File,
): Promise<UploadedMaterial> {
  if (!UUID_RE.test(academyId)) throw new Error(translate('upload.no_academy'))

  const body = new FormData()
  body.append('file', file)
  body.append('bucket', 'course-materials')
  body.append('academy_id', academyId)
  body.append('course_id', courseId)

  const { data, error } = await supabase.functions.invoke<UploadResponse>(
    'upload-media',
    { body },
  )
  if (error) throw await functionError(error)
  if (!data?.path) throw new Error(data?.error ?? translate('upload.failed'))

  return {
    path: data.path,
    fileName: data.file_name ?? file.name,
    mimeType: data.mime_type ?? file.type,
    sizeBytes: data.size_bytes ?? file.size,
  }
}

/**
 * A short-lived signed URL for one material.
 *
 * Minted per click rather than held in the row: the URL is the only thing
 * standing between a private bucket and the open internet, so it is worth
 * nothing 60 seconds later. `download` picks between saving the file under its
 * real name and letting the browser preview it inline.
 */
export async function materialUrl(
  materialId: string,
  download = false,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{
    url?: string
    error?: string
  }>('material-url', { body: { material_id: materialId, download } })

  if (error) throw await functionError(error)
  if (!data?.url) throw new Error(data?.error ?? translate('material.no_url'))
  return data.url
}
