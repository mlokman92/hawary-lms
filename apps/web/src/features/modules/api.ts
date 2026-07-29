import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesUpdate } from '@hawary/shared'
import { supabase } from '@/lib/supabase'

export type CourseModule = Tables<'course_modules'>
export type CourseModulePatch = TablesUpdate<'course_modules'>

/** The three content kinds a module can hold. Matches reorder_module_items(p_kind). */
export type ItemKind = 'note' | 'assessment' | 'assignment'

const modulesKey = (academyId: string | null, courseId: string | null) =>
  ['course-modules', academyId, courseId] as const

export function useModules(academyId: string | null, courseId: string | null) {
  return useQuery({
    queryKey: modulesKey(academyId, courseId),
    enabled: !!academyId && !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_modules')
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

export function useCreateModule(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      description?: string | null
      created_by?: string | null
      sort_order?: number
    }) => {
      const { data, error } = await supabase
        .from('course_modules')
        .insert({
          academy_id: academyId,
          course_id: courseId,
          title: input.title,
          description: input.description ?? null,
          created_by: input.created_by ?? null,
          sort_order: input.sort_order ?? 0,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: modulesKey(academyId, courseId) })
      qc.invalidateQueries({ queryKey: ['courses', academyId] })
    },
  })
}

export function useUpdateModule(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: CourseModulePatch
    }) => {
      const { data, error } = await supabase
        .from('course_modules')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: modulesKey(academyId, courseId) }),
  })
}

/**
 * Deleting a module cascades to every note / assessment / assignment under it
 * (composite FK on (course_id, module_id)), so the content caches are dropped
 * alongside the module list.
 */
export function useDeleteModule(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('course_modules')
        .delete()
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: modulesKey(academyId, courseId) })
      qc.invalidateQueries({ queryKey: ['notes', academyId, courseId] })
      qc.invalidateQueries({ queryKey: ['assessments', academyId, courseId] })
      qc.invalidateQueries({ queryKey: ['assignments', academyId, courseId] })
      qc.invalidateQueries({ queryKey: ['courses', academyId] })
    },
  })
}

/** `orderedIds` is the course's full module list in its new order. */
export function useReorderModules(academyId: string, courseId: string) {
  const qc = useQueryClient()
  const key = modulesKey(academyId, courseId)
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const { error } = await supabase.rpc('reorder_course_modules', {
        p_course_id: courseId,
        p_ordered_ids: orderedIds,
      })
      if (error) throw error
    },
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<CourseModule[]>(key)
      if (previous) {
        const order = new Map(orderedIds.map((id, i) => [id, i]))
        qc.setQueryData(
          key,
          [...previous]
            .map((m) =>
              order.has(m.id) ? { ...m, sort_order: order.get(m.id)! } : m,
            )
            .sort(
              (a, b) =>
                a.sort_order - b.sort_order ||
                a.created_at.localeCompare(b.created_at),
            ),
        )
      }
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

/**
 * Reorder a module's items of one kind — and move items between modules.
 * `orderedIds` is the destination module's full, ordered list for that kind
 * (the moved item included); the RPC writes module_id + sort_order by position.
 * A cross-course target is rejected by the (course_id, module_id) FK.
 */
export function useReorderModuleItems(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      moduleId,
      kind,
      orderedIds,
    }: {
      moduleId: string
      kind: ItemKind
      orderedIds: string[]
    }) => {
      const { error } = await supabase.rpc('reorder_module_items', {
        p_module_id: moduleId,
        p_kind: kind,
        p_ordered_ids: orderedIds,
      })
      if (error) throw error
      return kind
    },
    onSuccess: (kind) => {
      const table =
        kind === 'note'
          ? 'notes'
          : kind === 'assessment'
            ? 'assessments'
            : 'assignments'
      qc.invalidateQueries({ queryKey: [table, academyId, courseId] })
    },
  })
}
