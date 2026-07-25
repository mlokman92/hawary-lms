import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesUpdate } from '@hawary/shared'
import { supabase } from '@/lib/supabase'

export type Note = Tables<'notes'>
export type NotePatch = TablesUpdate<'notes'>
export type NoteNode = Note & { children: NoteNode[] }

const notesKey = (academyId: string | null, courseId: string | null) =>
  ['notes', academyId, courseId] as const

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

export function useCreateNote(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      parent_id: string | null
      created_by?: string | null
    }) => {
      const { data, error } = await supabase
        .from('notes')
        .insert({
          academy_id: academyId,
          course_id: courseId,
          title: input.title,
          parent_id: input.parent_id,
          created_by: input.created_by ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: notesKey(academyId, courseId) }),
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: notesKey(academyId, courseId) }),
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: notesKey(academyId, courseId) }),
  })
}

/** Build a nested tree from the flat note list (by parent_id). */
export function buildTree(notes: Note[]): NoteNode[] {
  const byId = new Map<string, NoteNode>()
  notes.forEach((n) => byId.set(n.id, { ...n, children: [] }))
  const roots: NoteNode[] = []
  byId.forEach((node) => {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  })
  return roots
}
