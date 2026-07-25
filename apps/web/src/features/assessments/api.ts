import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables, TablesUpdate } from '@hawary/shared'
import { supabase } from '@/lib/supabase'

export type Assessment = Tables<'assessments'>
export type AssessmentPatch = TablesUpdate<'assessments'>
export type Question = Tables<'assessment_questions'>
export type AssessmentRow = Assessment & { questions: { count: number }[] }

/** A question being edited: id is null until first saved. */
export type QuestionDraft = {
  key: string
  id: string | null
  prompt: string
  points: number
}

const listKey = (a: string | null, c: string | null) =>
  ['assessments', a, c] as const
const oneKey = (id: string) => ['assessment', id] as const
const qsKey = (id: string) => ['assessment-questions', id] as const

export function useAssessments(academyId: string | null, courseId: string | null) {
  return useQuery({
    queryKey: listKey(academyId, courseId),
    enabled: !!academyId && !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessments')
        .select('*, questions:assessment_questions(count)')
        .eq('academy_id', academyId!)
        .eq('course_id', courseId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as AssessmentRow[]
    },
  })
}

export function useAssessment(id: string | undefined) {
  return useQuery({
    queryKey: oneKey(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useQuestions(assessmentId: string | undefined) {
  return useQuery({
    queryKey: qsKey(assessmentId ?? ''),
    enabled: !!assessmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessment_questions')
        .select('*')
        .eq('assessment_id', assessmentId!)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useCreateAssessment(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title: string; created_by?: string | null }) => {
      const { data, error } = await supabase
        .from('assessments')
        .insert({
          academy_id: academyId,
          course_id: courseId,
          title: input.title,
          created_by: input.created_by ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey(academyId, courseId) }),
  })
}

export function useDeleteAssessment(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('assessments').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey(academyId, courseId) }),
  })
}

/** Save assessment metadata + reconcile its questions (insert/update/delete). */
export function useSaveAssessment(
  academyId: string,
  courseId: string,
  assessmentId: string,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      patch,
      questions,
      deletedIds,
    }: {
      patch: AssessmentPatch
      questions: QuestionDraft[]
      deletedIds: string[]
    }) => {
      if (deletedIds.length) {
        const { error } = await supabase
          .from('assessment_questions')
          .delete()
          .in('id', deletedIds)
        if (error) throw error
      }
      const ordered = questions.map((q, i) => ({ ...q, sort_order: i }))
      const inserted: { key: string; id: string }[] = []
      for (const q of ordered) {
        if (q.id) {
          const { error } = await supabase
            .from('assessment_questions')
            .update({ prompt: q.prompt, points: q.points, sort_order: q.sort_order })
            .eq('id', q.id)
          if (error) throw error
        } else {
          const { data, error } = await supabase
            .from('assessment_questions')
            .insert({
              academy_id: academyId,
              assessment_id: assessmentId,
              question_type: 'essay' as const,
              prompt: q.prompt,
              points: q.points,
              sort_order: q.sort_order,
            })
            .select('id')
            .single()
          if (error) throw error
          inserted.push({ key: q.key, id: data.id })
        }
      }
      const { error } = await supabase
        .from('assessments')
        .update(patch)
        .eq('id', assessmentId)
      if (error) throw error
      return { inserted }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: oneKey(assessmentId) })
      qc.invalidateQueries({ queryKey: qsKey(assessmentId) })
      qc.invalidateQueries({ queryKey: listKey(academyId, courseId) })
    },
  })
}
