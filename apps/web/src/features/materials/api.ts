import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesUpdate } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { materialUrl, uploadMaterial } from '@/lib/storage'

export type Material = Tables<'course_materials'>
export type MaterialPatch = TablesUpdate<'course_materials'>

/**
 * "2.4 MB". Language-neutral on purpose — the unit symbols are the same in
 * English and Malay, and this sits in a dense list row where a translated
 * sentence would not fit anyway.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(kb / 1024 < 10 ? 1 : 0)} MB`
}

const listKey = (a: string | null, c: string | null) =>
  ['materials', a, c] as const

/** Every material in a course, flat. The course page groups them by module. */
export function useMaterials(academyId: string | null, courseId: string | null) {
  return useQuery({
    queryKey: listKey(academyId, courseId),
    enabled: !!academyId && !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_materials')
        .select('*')
        .eq('academy_id', academyId!)
        .eq('course_id', courseId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

/**
 * Upload the file, then insert the row.
 *
 * Two steps, and the order matters: a row whose file never arrived is a broken
 * download, whereas a file with no row is an orphan nobody sees. Orphans are the
 * cheaper failure, so the upload goes first and the row is only written once
 * there is something for it to point at.
 */
export function useCreateMaterial(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      file: File
      title: string
      module_id: string
      created_by?: string | null
      sort_order?: number
    }) => {
      const up = await uploadMaterial(academyId, courseId, input.file)
      const { data, error } = await supabase
        .from('course_materials')
        .insert({
          academy_id: academyId,
          course_id: courseId,
          module_id: input.module_id,
          title: input.title.trim() || up.fileName,
          file_path: up.path,
          file_name: up.fileName,
          mime_type: up.mimeType,
          size_bytes: up.sizeBytes,
          created_by: input.created_by ?? null,
          sort_order: input.sort_order ?? 0,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: listKey(academyId, courseId) })
      void qc.invalidateQueries({ queryKey: ['courses', academyId] })
      void qc.invalidateQueries({ queryKey: ['learn-content'] })
    },
  })
}

export function useUpdateMaterial(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: MaterialPatch }) => {
      const { data, error } = await supabase
        .from('course_materials')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: listKey(academyId, courseId) }),
  })
}

/**
 * Deletes the row, not the object.
 *
 * duplicate_course points a copy at the same file_path, so removing the object
 * here would break a sibling course's material. Orphaned objects are left for a
 * sweep that can check whether any row still references the path — see
 * docs/course-materials.md.
 */
export function useDeleteMaterial(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('course_materials')
        .delete()
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: listKey(academyId, courseId) })
      void qc.invalidateQueries({ queryKey: ['courses', academyId] })
      void qc.invalidateQueries({ queryKey: ['learn-content'] })
    },
  })
}

/**
 * Open a material. Not a query: the signed URL is valid for 60 seconds, so
 * caching one would mostly cache something already expired.
 */
export function useOpenMaterial() {
  return useMutation({
    mutationFn: async ({
      id,
      download,
    }: {
      id: string
      download?: boolean
    }) => {
      const url = await materialUrl(id, download)
      // noopener: the signed URL is a bearer token in a query string, and
      // window.opener would hand the new tab a reference back to this one.
      window.open(url, '_blank', 'noopener,noreferrer')
      return url
    },
  })
}
