import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
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
  /** The browser's own File, on the web preview only. */
  file?: Blob
}

/**
 * What goes into FormData for a picked file.
 *
 * NOT React Native's `{ uri, name, type }` descriptor. From SDK 57 the global
 * `fetch` is Expo's own, and it refuses that shape ("Unsupported FormDataPart
 * implementation") before the request leaves the phone — which is what every
 * upload did until this was changed. It takes a Blob, or anything with
 * `bytes()`, and reads the part's filename and content type off `name` and
 * `type`. So the file is read through expo-file-system, and the name and type
 * are the ones the picker reported rather than whatever the cache copy is
 * called.
 *
 * On the web preview the picker's own File is passed through instead.
 */
export function formFile(file: UploadFile): Blob {
  if (file.file) return file.file
  const source = new File(file.uri)
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    bytes: () => source.bytes(),
    arrayBuffer: () => source.arrayBuffer(),
  } as unknown as Blob
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
  body.append('file', formFile(file), file.name)
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
    // As it was picked: the filename is percent-encoded in transit, so the
    // server's copy of it reads "My%20work.pdf".
    name: file.name || data.file_name || 'document',
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

/**
 * The type a file's name implies. Some file providers hand back a document with
 * no MIME type at all, and `upload-media` refuses what it cannot name.
 */
const TYPE_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

function typeOf(name: string, reported: string | undefined): string {
  if (reported && reported !== 'application/octet-stream') return reported
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return TYPE_BY_EXT[ext] ?? reported ?? 'application/octet-stream'
}

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
    type: typeOf(a.name, a.mimeType),
    size: a.size ?? 0,
    file: a.file,
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
    file: a.file,
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
