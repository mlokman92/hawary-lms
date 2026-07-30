import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ItemKind } from '@/features/modules/api'

/**
 * The academy-wide inventory behind the Assessments and Assignments sub-nav.
 *
 * Deliberately not scoped to a course: the whole point of the sub-items is to
 * answer "what work exists here" without first remembering which course and
 * which module something was filed under. The course filter is applied in the
 * page, over rows RLS already limited to this tenant.
 */
export type LibraryRow = {
  id: string
  title: string
  is_published: boolean
  total_points: number
  course_id: string
  course_title: string
  module_id: string
  module_title: string
  /** available_until for an assessment, due_at for an assignment. */
  deadline: string | null
  /** Assessments only. */
  duration_minutes: number | null
  question_count: number | null
  /** Assignments only. */
  allow_late: boolean | null
  href: string
}

type Nested = {
  courses: { title: string } | null
  course_modules: { title: string } | null
}

export function useLibrary(kind: ItemKind, academyId: string | null) {
  return useQuery({
    queryKey: ['library', kind, academyId] as const,
    enabled: !!academyId && kind !== 'note',
    queryFn: async (): Promise<LibraryRow[]> => {
      if (kind === 'assessment') {
        const { data, error } = await supabase
          .from('assessments')
          .select(
            'id, title, is_published, total_points, duration_minutes, available_until, course_id, module_id, courses(title), course_modules(title), questions:assessment_questions(count)',
          )
          .eq('academy_id', academyId!)
          .order('created_at', { ascending: false })
        if (error) throw error
        type Row = {
          id: string
          title: string
          is_published: boolean
          total_points: number
          duration_minutes: number | null
          available_until: string | null
          course_id: string
          module_id: string
          questions: { count: number }[]
        } & Nested
        return ((data ?? []) as unknown as Row[]).map((r) => ({
          id: r.id,
          title: r.title,
          is_published: r.is_published,
          total_points: Number(r.total_points),
          course_id: r.course_id,
          course_title: r.courses?.title ?? '',
          module_id: r.module_id,
          module_title: r.course_modules?.title ?? '',
          deadline: r.available_until,
          duration_minutes: r.duration_minutes,
          question_count: r.questions?.[0]?.count ?? 0,
          allow_late: null,
          href: `/assessments/${r.id}`,
        }))
      }

      const { data, error } = await supabase
        .from('assignments')
        .select(
          'id, title, is_published, total_points, due_at, allow_late, course_id, module_id, courses(title), course_modules(title)',
        )
        .eq('academy_id', academyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      type Row = {
        id: string
        title: string
        is_published: boolean
        total_points: number
        due_at: string | null
        allow_late: boolean
        course_id: string
        module_id: string
      } & Nested
      return ((data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        title: r.title,
        is_published: r.is_published,
        total_points: Number(r.total_points),
        course_id: r.course_id,
        course_title: r.courses?.title ?? '',
        module_id: r.module_id,
        module_title: r.course_modules?.title ?? '',
        deadline: r.due_at,
        duration_minutes: null,
        question_count: null,
        allow_late: r.allow_late,
        href: `/assignments/${r.id}`,
      }))
    },
  })
}
