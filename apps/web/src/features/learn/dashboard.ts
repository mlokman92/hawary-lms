import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type TaskKind = 'assignment' | 'assessment'

export type LearnTask = {
  id: string
  kind: TaskKind
  title: string
  course_id: string
  due_at: string | null
  allow_late: boolean
  total_points: number
  /** Where this task stands for THIS student. */
  state: 'todo' | 'in_progress' | 'awaiting' | 'marked'
  score: number | null
  outOf: number | null
  submittedAt: string | null
}

export type LearnDashboard = {
  tasks: LearnTask[]
  /** course_id -> how many of its tasks are done (submitted or marked). */
  byCourse: Map<string, { total: number; done: number; notes: number }>
}

/**
 * Everything the learner dashboard needs, in five reads.
 *
 * No course filter is applied to the content tables on purpose: the student
 * SELECT policies are already `is_published AND app.module_visible(module_id)`,
 * so RLS returns exactly the rows this student may see. Re-deriving the course
 * list client-side would be a second, weaker copy of that rule.
 */
export function useLearnDashboard(
  academyId: string | null,
  studentId: string | null,
) {
  return useQuery({
    queryKey: ['learn-dashboard', academyId, studentId] as const,
    enabled: !!academyId && !!studentId,
    queryFn: async (): Promise<LearnDashboard> => {
      const [assignments, assessments, submissions, attempts, notes] =
        await Promise.all([
          supabase
            .from('assignments')
            .select('id, title, course_id, due_at, allow_late, total_points')
            .eq('academy_id', academyId!)
            .eq('is_published', true),
          supabase
            .from('assessments')
            .select('id, title, course_id, total_points, available_until')
            .eq('academy_id', academyId!)
            .eq('is_published', true),
          supabase
            .from('assignment_submissions')
            .select('id, assignment_id, status, grade, submitted_at')
            .eq('student_id', studentId!),
          supabase
            .from('assessment_attempts')
            .select('id, assessment_id, status, score, max_score, submitted_at')
            .eq('student_id', studentId!),
          supabase
            .from('notes')
            .select('id, course_id')
            .eq('academy_id', academyId!)
            .eq('is_published', true),
        ])

      const err =
        assignments.error ??
        assessments.error ??
        submissions.error ??
        attempts.error ??
        notes.error
      if (err) throw err

      const subByAssignment = new Map(
        (submissions.data ?? []).map((s) => [s.assignment_id, s]),
      )
      // Several attempts per assessment are possible; the best-resolved one
      // decides the state, so a graded first attempt is not hidden by an open
      // second one.
      const attemptsByAssessment = new Map<string, typeof attempts.data>()
      for (const a of attempts.data ?? []) {
        const list = attemptsByAssessment.get(a.assessment_id) ?? []
        list.push(a)
        attemptsByAssessment.set(a.assessment_id, list)
      }

      const tasks: LearnTask[] = []

      for (const a of assignments.data ?? []) {
        const s = subByAssignment.get(a.id)
        const state: LearnTask['state'] =
          !s || s.status === 'draft'
            ? s?.status === 'draft'
              ? 'in_progress'
              : 'todo'
            : s.status === 'submitted'
              ? 'awaiting'
              : 'marked'
        tasks.push({
          id: a.id,
          kind: 'assignment',
          title: a.title,
          course_id: a.course_id,
          due_at: a.due_at,
          allow_late: a.allow_late,
          total_points: Number(a.total_points),
          state,
          score: s?.grade == null ? null : Number(s.grade),
          outOf: Number(a.total_points),
          submittedAt: s?.submitted_at ?? null,
        })
      }

      for (const a of assessments.data ?? []) {
        const list = attemptsByAssessment.get(a.id) ?? []
        const graded = list.find((x) => x.status === 'graded')
        const open = list.find((x) => x.status === 'in_progress')
        const sent = list.find((x) => x.status === 'submitted')
        const state: LearnTask['state'] = graded
          ? 'marked'
          : sent
            ? 'awaiting'
            : open
              ? 'in_progress'
              : 'todo'
        tasks.push({
          id: a.id,
          kind: 'assessment',
          title: a.title,
          course_id: a.course_id,
          // Assessments close rather than fall due; treat the window end as the
          // deadline so both kinds sort on one axis.
          due_at: a.available_until,
          allow_late: false,
          total_points: Number(a.total_points),
          state,
          score: graded?.score == null ? null : Number(graded.score),
          outOf: graded?.max_score == null ? null : Number(graded.max_score),
          submittedAt: graded?.submitted_at ?? sent?.submitted_at ?? null,
        })
      }

      const byCourse = new Map<
        string,
        { total: number; done: number; notes: number }
      >()
      const bump = (id: string) =>
        byCourse.get(id) ?? { total: 0, done: 0, notes: 0 }
      for (const t of tasks) {
        const e = bump(t.course_id)
        e.total += 1
        if (t.state === 'awaiting' || t.state === 'marked') e.done += 1
        byCourse.set(t.course_id, e)
      }
      for (const n of notes.data ?? []) {
        const e = bump(n.course_id)
        e.notes += 1
        byCourse.set(n.course_id, e)
      }

      return { tasks, byCourse }
    },
  })
}

/** Overdue = past due, not yet handed in, and late hand-ins are not allowed. */
export function isOverdue(t: LearnTask, now = Date.now()): boolean {
  if (t.state === 'awaiting' || t.state === 'marked') return false
  if (!t.due_at || t.allow_late) return false
  return new Date(t.due_at).getTime() < now
}

export function isDueSoon(t: LearnTask, days = 7, now = Date.now()): boolean {
  if (t.state === 'awaiting' || t.state === 'marked') return false
  if (!t.due_at) return false
  const due = new Date(t.due_at).getTime()
  return due >= now && due <= now + days * 86_400_000
}
