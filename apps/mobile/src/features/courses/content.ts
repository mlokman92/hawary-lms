import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ItemKind } from '@/features/modules/api'

/** One thing inside a module, of any of the four kinds. */
export type CourseItem = {
  kind: ItemKind
  id: string
  module_id: string
  title: string
  is_published: boolean
  sort_order: number
}

/**
 * Everything in a course, for staff: all four kinds, published or not.
 *
 * The web course page reads each kind with its own hook because each has its
 * own editor. The phone only lists them and flips their publish switch, so one
 * read with a common shape is enough — and the query key starts with
 * `course-content`, which is invalidated alongside the per-kind keys the
 * synced `useTogglePublished` already refreshes.
 */
export function useCourseItems(academyId: string | null, courseId: string | null) {
  return useQuery({
    queryKey: ['course-content', academyId, courseId] as const,
    enabled: !!academyId && !!courseId,
    queryFn: async (): Promise<CourseItem[]> => {
      const read = (table: 'notes' | 'assessments' | 'assignments') =>
        supabase
          .from(table)
          .select('id, module_id, title, is_published, sort_order')
          .eq('academy_id', academyId!)
          .eq('course_id', courseId!)
          .order('sort_order', { ascending: true })
      const [notes, materials, assessments, assignments] = await Promise.all([
        read('notes'),
        supabase
          .from('course_materials')
          .select('id, module_id, title, file_name, is_published, sort_order')
          .eq('academy_id', academyId!)
          .eq('course_id', courseId!)
          .order('sort_order', { ascending: true }),
        read('assessments'),
        read('assignments'),
      ])
      const err =
        notes.error ?? materials.error ?? assessments.error ?? assignments.error
      if (err) throw err
      const as = (
        kind: ItemKind,
        rows: {
          id: string
          module_id: string
          title: string | null
          is_published: boolean
          sort_order: number
        }[],
      ): CourseItem[] =>
        rows.map((r) => ({
          kind,
          id: r.id,
          module_id: r.module_id,
          title: r.title ?? '',
          is_published: r.is_published,
          sort_order: r.sort_order,
        }))
      return [
        ...as('note', notes.data ?? []),
        ...as(
          'material',
          (materials.data ?? []).map((m) => ({ ...m, title: m.title || m.file_name })),
        ),
        ...as('assessment', assessments.data ?? []),
        ...as('assignment', assignments.data ?? []),
      ]
    },
  })
}
