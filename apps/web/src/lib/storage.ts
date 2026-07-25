import { supabase } from './supabase'

/**
 * Upload an image to a public bucket, scoped under the academy id (first path
 * segment — storage RLS checks it). Returns the public URL.
 */
export async function uploadPublicImage(
  bucket: string,
  academyId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${academyId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
