import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Enums, Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'

export type Attempt = Tables<'assessment_attempts'>
export type Submission = Tables<'assignment_submissions'>

type StudentRef = { id: string; full_name: string | null; student_no: string }

/**
 * The courses the signed-in user may grade.
 *
 * `isAdmin` short-circuits to "all courses in the academy" — admins keep
 * academy-wide reach, which is the escape hatch when an instructor link is
 * wrong. For a trainer the ONLY path to their courses is
 * instructors.user_id -> course_instructors, mirroring app.can_grade_course.
 */
export function useMyGradableCourses(academyId: string | null, isAdmin: boolean) {
  return useQuery({
    queryKey: ['gradable-courses', academyId, isAdmin] as const,
    enabled: !!academyId,
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from('courses')
          .select('id, title')
          .eq('academy_id', academyId!)
          .order('title')
        if (error) throw error
        return { linked: true, courses: data ?? [] }
      }

      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) return { linked: false, courses: [] }

      const { data: instructor, error: insErr } = await supabase
        .from('instructors')
        .select('id')
        .eq('academy_id', academyId!)
        .eq('user_id', uid)
        .is('archived_at', null)
        .maybeSingle()
      if (insErr) throw insErr
      // No instructor record => no assigned courses. Surfaced explicitly so a
      // trainer sees "you aren't assigned" rather than a silent empty page.
      if (!instructor) return { linked: false, courses: [] }

      const { data, error } = await supabase
        .from('course_instructors')
        .select('courses(id, title)')
        .eq('academy_id', academyId!)
        .eq('instructor_id', instructor.id)
      if (error) throw error
      type Row = { courses: { id: string; title: string } | null }
      return {
        linked: true,
        courses: ((data ?? []) as unknown as Row[])
          .map((r) => r.courses)
          .filter((c): c is { id: string; title: string } => !!c),
      }
    },
  })
}

type ParentRef = {
  id: string
  title: string
  total_points: number
  course_id: string
}

export type QueueAttempt = Attempt & {
  students: StudentRef | null
  assessments: ParentRef | null
}

export type QueueSubmission = Submission & {
  students: StudentRef | null
  assignments: ParentRef | null
}

/**
 * Everything awaiting (or holding) a mark for one course. RLS already limits
 * these to courses the caller may grade; the course filter is for the UI.
 */
export function useGradingQueue(academyId: string | null, courseId: string | null) {
  return useQuery({
    queryKey: ['grading-queue', academyId, courseId] as const,
    enabled: !!academyId && !!courseId,
    queryFn: async () => {
      const [attempts, submissions] = await Promise.all([
        supabase
          .from('assessment_attempts')
          .select(
            '*, students(id, full_name, student_no), assessments!inner(id, title, total_points, course_id)',
          )
          .eq('academy_id', academyId!)
          .eq('assessments.course_id', courseId!)
          .neq('status', 'in_progress')
          .order('submitted_at', { ascending: true }),
        supabase
          .from('assignment_submissions')
          .select(
            '*, students(id, full_name, student_no), assignments!inner(id, title, total_points, course_id)',
          )
          .eq('academy_id', academyId!)
          .eq('assignments.course_id', courseId!)
          .neq('status', 'draft')
          .order('submitted_at', { ascending: true }),
      ])
      if (attempts.error) throw attempts.error
      if (submissions.error) throw submissions.error
      return {
        attempts: (attempts.data ?? []) as unknown as QueueAttempt[],
        submissions: (submissions.data ?? []) as unknown as QueueSubmission[],
      }
    },
  })
}

/**
 * One row of the academy-wide grading queue, with the two kinds flattened into
 * a single shape so `/assessments` and `/assignments` can be one page.
 */
export type QueueRow = {
  id: string
  href: string
  student: StudentRef | null
  title: string
  /**
   * The course is carried as an id only. Its title comes from
   * useMyGradableCourses at render: that query already holds every course this
   * caller can grade — which is exactly the set that can appear here — and
   * embedding `courses(title)` would mean leaning on PostgREST to resolve the
   * composite (academy_id, course_id) foreign key.
   */
  courseId: string
  submittedAt: string | null
  /** 'returned' is assignments-only; the page groups it with 'graded'. */
  status: 'submitted' | 'graded' | 'returned'
  score: number | null
  outOf: number | null
  /** Assessments only. */
  attemptNo: number | null
}

/**
 * Everything of one kind awaiting or holding a mark, across the whole academy.
 *
 * No course filter in the query: the SELECT policies on both tables are
 * `app.can_grade_*`, so RLS already returns exactly the rows this caller may
 * mark — academy-wide for an admin, assigned courses only for a trainer. Adding
 * a client-side course list would be a second, weaker copy of that rule; the
 * page's course dropdown is built from the rows that come back.
 */
export function useAcademyQueue(
  kind: 'assessment' | 'assignment',
  academyId: string | null,
) {
  return useQuery({
    queryKey: ['grading-academy-queue', kind, academyId] as const,
    enabled: !!academyId,
    queryFn: async (): Promise<QueueRow[]> => {
      if (kind === 'assessment') {
        const { data, error } = await supabase
          .from('assessment_attempts')
          .select(
            '*, students(id, full_name, student_no), assessments!inner(id, title, total_points, course_id)',
          )
          .eq('academy_id', academyId!)
          .neq('status', 'in_progress')
          .order('submitted_at', { ascending: true })
        if (error) throw error
        type Row = Attempt & {
          students: StudentRef | null
          assessments: ParentRef | null
        }
        return ((data ?? []) as unknown as Row[]).map((r) => ({
          id: r.id,
          href: `/grading/attempts/${r.id}`,
          student: r.students,
          title: r.assessments?.title ?? '',
          courseId: r.assessments?.course_id ?? '',
          submittedAt: r.submitted_at,
          status: r.status === 'graded' ? 'graded' : 'submitted',
          score: r.score == null ? null : Number(r.score),
          outOf: r.max_score == null ? null : Number(r.max_score),
          attemptNo: r.attempt_no,
        }))
      }

      const { data, error } = await supabase
        .from('assignment_submissions')
        .select(
          '*, students(id, full_name, student_no), assignments!inner(id, title, total_points, course_id)',
        )
        .eq('academy_id', academyId!)
        .neq('status', 'draft')
        .order('submitted_at', { ascending: true })
      if (error) throw error
      type Row = Submission & {
        students: StudentRef | null
        assignments: ParentRef | null
      }
      return ((data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        href: `/grading/submissions/${r.id}`,
        student: r.students,
        title: r.assignments?.title ?? '',
        courseId: r.assignments?.course_id ?? '',
        submittedAt: r.submitted_at,
        status:
          r.status === 'graded'
            ? 'graded'
            : r.status === 'returned'
              ? 'returned'
              : 'submitted',
        score: r.grade == null ? null : Number(r.grade),
        outOf:
          r.assignments?.total_points == null
            ? null
            : Number(r.assignments.total_points),
        attemptNo: null,
      }))
    },
  })
}

export function useGradingSubmission(id: string | undefined) {
  return useQuery({
    queryKey: ['grading-submission', id] as const,
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignment_submissions')
        .select(
          '*, students(id, full_name, student_no), assignments(id, title, total_points, instructions, course_id)',
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as unknown as QueueSubmission & {
        assignments: (ParentRef & { instructions: unknown }) | null
      }
    },
  })
}

/**
 * graded_by / graded_at are NOT sent: app.guard_submission_write stamps them
 * from auth.uid() and now(). Sending them would be silently overwritten, which
 * is worse than not sending them at all.
 */
export function useGradeSubmission(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      grade,
      feedback,
      release,
    }: {
      grade: number
      feedback: string
      release: boolean
    }) => {
      const { data, error } = await supabase
        .from('assignment_submissions')
        .update({
          grade,
          feedback: feedback.trim() || null,
          status: release ? 'returned' : 'graded',
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grading-submission', id] })
      qc.invalidateQueries({ queryKey: ['grading-queue'] })
    },
  })
}

export function useGradingAttempt(id: string | undefined) {
  return useQuery({
    queryKey: ['grading-attempt', id] as const,
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessment_attempts')
        .select(
          '*, students(id, full_name, student_no), assessments(id, title, total_points, course_id)',
        )
        .eq('id', id!)
        .single<QueueAttempt>()
      if (error) throw error
      return data as unknown as QueueAttempt
    },
  })
}

/**
 * Questions with marks and their answer key, for grading.
 *
 * This is the one client surface allowed to read `correct_answer` — the
 * assessment_questions SELECT policy is app.can_grade_assessment, so RLS, not
 * this column list, is what keeps it away from students. Graders need it to see
 * which objective answers the server scored right.
 */
export function useAttemptQuestions(assessmentId: string | undefined) {
  return useQuery({
    queryKey: ['grading-questions', assessmentId] as const,
    enabled: !!assessmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessment_questions')
        .select(
          'id, prompt, points, sort_order, question_type, options, correct_answer',
        )
        .eq('assessment_id', assessmentId!)
        .order('sort_order')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useGradeAttempt(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ score, maxScore }: { score: number; maxScore: number }) => {
      const { data, error } = await supabase
        .from('assessment_attempts')
        .update({ score, max_score: maxScore, status: 'graded' as Enums<'attempt_status'> })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grading-attempt', id] })
      qc.invalidateQueries({ queryKey: ['grading-queue'] })
    },
  })
}
