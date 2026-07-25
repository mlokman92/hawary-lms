import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesInsert, TablesUpdate } from '@hawary/shared'
import { supabase } from '@/lib/supabase'

export type Course = Tables<'courses'>
export type CourseStatus = Course['status']
export type CourseCreateInput = Omit<TablesInsert<'courses'>, 'academy_id'>
export type CoursePatch = TablesUpdate<'courses'>

const coursesKey = (academyId: string | null) => ['courses', academyId] as const

export function useCourses(academyId: string | null) {
  return useQuery({
    queryKey: coursesKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('academy_id', academyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreateCourse(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CourseCreateInput) => {
      const { data, error } = await supabase
        .from('courses')
        .insert({ ...input, academy_id: academyId })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: coursesKey(academyId) }),
  })
}

export function useUpdateCourse(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CoursePatch }) => {
      const { data, error } = await supabase
        .from('courses')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: coursesKey(academyId) }),
  })
}
