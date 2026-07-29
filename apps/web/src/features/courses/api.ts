import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesInsert, TablesUpdate } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import type { TKey } from '@/lib/i18n'

export type Course = Tables<'courses'>
export type CourseStatus = Course['status']

/** Enum → copy. Held as keys, not strings, so it can stay a module constant. */
export const COURSE_STATUS_LABEL: Record<CourseStatus, TKey> = {
  draft: 'common.draft',
  published: 'common.published',
  archived: 'courses.status.archived',
}
export type CourseCreateInput = Omit<TablesInsert<'courses'>, 'academy_id'>
export type CoursePatch = TablesUpdate<'courses'>

/** A course row plus the content counts shown on its card. */
export type CourseRow = Course & {
  modules: { count: number }[]
  notes: { count: number }[]
  assessments: { count: number }[]
  assignments: { count: number }[]
}

const coursesKey = (academyId: string | null) => ['courses', academyId] as const
const courseKey = (id: string) => ['course', id] as const

/** Counts come from PostgREST aggregate embeds — one round trip for the grid. */
export function useCourses(academyId: string | null) {
  return useQuery({
    queryKey: coursesKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select(
          '*, modules:course_modules(count), notes(count), assessments(count), assignments(count)',
        )
        .eq('academy_id', academyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as CourseRow[]
    },
  })
}

/**
 * Active students per course, as a course_id → count map.
 *
 * Kept separate from useCourses rather than embedded: the count must exclude
 * archived students, and that needs a join through students.archived_at which a
 * PostgREST count embed can't express. The `course_enrollment_stats` view does
 * the join (security_invoker, so RLS still applies) and omits courses with no
 * active students — hence the `?? 0` at the call site.
 */
export function useActiveStudentCounts(academyId: string | null) {
  return useQuery({
    queryKey: ['course-enrollment-stats', academyId] as const,
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_enrollment_stats')
        .select('course_id, active_students')
        .eq('academy_id', academyId!)
      if (error) throw error
      return new Map(
        (data ?? []).map((r) => [r.course_id ?? '', r.active_students ?? 0]),
      )
    },
  })
}

export function useCourse(id: string | undefined) {
  return useQuery({
    queryKey: courseKey(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
  })
}

/** Read a count embed: `notes(count)` arrives as `[{ count: n }]`, or `[]`. */
export const countOf = (embed: { count: number }[] | null | undefined) =>
  embed?.[0]?.count ?? 0

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
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: coursesKey(academyId) })
      qc.invalidateQueries({ queryKey: courseKey(row.id) })
    },
  })
}
