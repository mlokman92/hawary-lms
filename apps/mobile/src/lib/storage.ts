import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from './supabase'
import { translate } from './i18n'

/**
 * Files on a phone: picking them, uploading them, opening them.
 *
 * The counterpart of the web app's `lib/storage.ts`, with the same two rules.
 * Uploads go through the `upload-media` Edge Function, never straight to
 * Storage; and a private file is only ever read through a 60-second signed URL
 * minted for one click (docs/course-materials.md, docs/report-checks.md).
 */

/** A picked file, in the shape React Native's FormData uploads. */
export type UploadFile = {
  uri: string
  name: string
  type: string
  size: number
}

type UploadResponse = {
  ok?: boolean
  path?: string
  file_name?: string
  mime_type?: string
  size_bytes?: number
  error?: string
}

/** What an attach RPC wants: where the object is and what to call it. */
export type UploadedFile = {
  path: string
  name: string
  mime: string
  size: number
}

/** Turn a FunctionsHttpError into the sentence the function actually sent. */
async function functionError(error: unknown): Promise<Error> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    const detail = (await ctx.json().catch(() => null)) as UploadResponse | null
    if (detail?.error) return new Error(detail.error)
  }
  return error instanceof Error ? error : new Error(translate('upload.failed'))
}

/**
 * Upload one file into a private bucket a student may write to. The key comes
 * back; it is not a grant — the RPC that attaches it re-checks that the caller
 * uploaded it (`app.assert_own_upload`).
 */
export async function uploadPrivateFile(
  bucket: 'submissions' | 'student-reports',
  academyId: string,
  file: UploadFile,
): Promise<UploadedFile> {
  const body = new FormData()
  // React Native's FormData takes a { uri, name, type } descriptor where the
  // browser takes a File; the multipart request it produces is the same.
  body.append('file', file as unknown as Blob)
  body.append('bucket', bucket)
  body.append('academy_id', academyId)

  const { data, error } = await supabase.functions.invoke<UploadResponse>(
    'upload-media',
    { body },
  )
  if (error) throw await functionError(error)
  if (!data?.path) throw new Error(data?.error ?? translate('upload.failed'))
  return {
    path: data.path,
    name: data.file_name ?? file.name,
    mime: data.mime_type ?? file.type,
    size: data.size_bytes ?? file.size,
  }
}

/** A signed URL from one of the three signing functions. */
async function signedUrl(
  fn: 'material-url' | 'report-url' | 'submission-url',
  body: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{
    url?: string
    error?: string
  }>(fn, { body })
  if (error) throw await functionError(error)
  if (!data?.url) throw new Error(data?.error ?? translate('material.no_url'))
  return data.url
}

/**
 * Open a private file. The URL is followed at once, in the system browser
 * sheet: it shows a PDF or an image in place and hands anything else to the
 * phone's own viewer, which is the same "let the platform decide" the web app
 * does with a new tab.
 */
export async function openPrivateFile(
  kind: 'material' | 'report' | 'submission',
  id: string,
): Promise<void> {
  const url =
    kind === 'material'
      ? await signedUrl('material-url', { material_id: id })
      : kind === 'report'
        ? await signedUrl('report-url', { file_id: id })
        : await signedUrl('submission-url', { file_id: id })
  await WebBrowser.openBrowserAsync(url)
}

const DOC_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
  'image/jpeg',
  'image/png',
  'image/webp',
]

/** Pick documents from the phone's files. Empty when the person backs out. */
export async function pickDocuments(): Promise<UploadFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: DOC_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  })
  if (result.canceled) return []
  return result.assets.map((a) => ({
    uri: a.uri,
    name: a.name,
    type: a.mimeType ?? 'application/octet-stream',
    size: a.size ?? 0,
  }))
}

function imageAsset(a: ImagePicker.ImagePickerAsset, i: number): UploadFile {
  const type = a.mimeType ?? 'image/jpeg'
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  return {
    uri: a.uri,
    name: a.fileName ?? `photo-${Date.now()}-${i + 1}.${ext}`,
    type,
    size: a.fileSize ?? 0,
  }
}

/** Pick photos from the library. */
export async function pickPhotos(): Promise<UploadFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    // Phone photos are 3–8 MB each; a hand-in is usually several. JPEG at this
    // quality stays legible for handwriting and keeps ten pages uploadable on
    // mobile data.
    quality: 0.7,
  })
  if (result.canceled) return []
  return result.assets.map(imageAsset)
}

/** Take one photo with the camera. Empty when permission is refused. */
export async function takePhoto(): Promise<UploadFile[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) return []
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.7,
  })
  if (result.canceled) return []
  return result.assets.map(imageAsset)
}

/** "1.2 MB". Shared by every list that shows a file. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
