import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesUpdate } from '@hawary/shared'
import { supabase } from '@/lib/supabase'

export type Assignment = Tables<'assignments'>
export type AssignmentPatch = TablesUpdate<'assignments'>

const listKey = (a: string | null, c: string | null) =>
  ['assignments', a, c] as const
const oneKey = (id: string) => ['assignment', id] as const

export function useAssignments(academyId: string | null, courseId: string | null) {
  return useQuery({
    queryKey: listKey(academyId, courseId),
    enabled: !!academyId && !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignments')
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

export function useAssignment(id: string | undefined) {
  return useQuery({
    queryKey: oneKey(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignments')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useCreateAssignment(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      module_id: string
      created_by?: string | null
      sort_order?: number
    }) => {
      const { data, error } = await supabase
        .from('assignments')
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
      qc.invalidateQueries({ queryKey: listKey(academyId, courseId) })
      qc.invalidateQueries({ queryKey: ['courses', academyId] })
    },
  })
}

export function useUpdateAssignment(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: AssignmentPatch }) => {
      const { data, error } = await supabase
        .from('assignments')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: listKey(academyId, courseId) })
      qc.invalidateQueries({ queryKey: oneKey(row.id) })
    },
  })
}

export function useDeleteAssignment(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('assignments').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey(academyId, courseId) }),
  })
}
