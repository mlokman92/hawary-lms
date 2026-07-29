import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesUpdate } from '@hawary/shared'
import { supabase } from '@/lib/supabase'

export type Note = Tables<'notes'>
export type NotePatch = TablesUpdate<'notes'>

const notesKey = (academyId: string | null, courseId: string | null) =>
  ['notes', academyId, courseId] as const
const noteKey = (id: string) => ['note', id] as const

/** Every note in a course, flat. The course page groups them by module_id. */
export function useNotes(academyId: string | null, courseId: string | null) {
  return useQuery({
    queryKey: notesKey(academyId, courseId),
    enabled: !!academyId && !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
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

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: noteKey(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useCreateNote(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      module_id: string
      created_by?: string | null
      sort_order?: number
    }) => {
      const { data, error } = await supabase
        .from('notes')
        .insert({
          academy_id: academyId,
          course_id: courseId,
          module_id: input.module_id,
          title: input.title,
          created_by: input.created_by ?? null,
          sort_order: input.sort_order ?? 0,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notesKey(academyId, courseId) })
      qc.invalidateQueries({ queryKey: ['courses', academyId] })
    },
  })
}

export function useUpdateNote(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: NotePatch }) => {
      const { data, error } = await supabase
        .from('notes')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: notesKey(academyId, courseId) })
      qc.invalidateQueries({ queryKey: noteKey(row.id) })
    },
  })
}

export function useDeleteNote(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notesKey(academyId, courseId) })
      qc.invalidateQueries({ queryKey: ['courses', academyId] })
    },
  })
}
