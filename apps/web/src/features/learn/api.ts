import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Enums, Json, Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { translate } from '@/lib/i18n'
import type { AnswerValue } from '@/lib/questions'

export type Student = Tables<'students'>
export type Submission = Tables<'assignment_submissions'>

/**
 * The signed-in user's student record FOR A GIVEN ACADEMY.
 *
 * Academy-scoped on purpose: students_academy_user_key is unique on
 * (academy_id, user_id), not on user_id, so one profile can hold a student
 * record in several academies. Resolving by user_id alone picks an arbitrary
 * tenant's row.
 *
 * The user id comes from useAuth() rather than a getUser() call inside the
 * queryFn: six of the seven learner pages mount this hook, and the session is
 * already in memory — there is no reason to pay an auth round-trip per page.
 */
export function useMyStudent(academyId: string | null) {
  const { user } = useAuth()
  const uid = user?.id ?? null
  return useQuery({
    queryKey: ['my-student', academyId, uid] as const,
    enabled: !!academyId && !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('academy_id', academyId!)
        .eq('user_id', uid!)
        .is('archived_at', null)
        .maybeSingle()
      if (error) throw error
      return data as Student | null
    },
  })
}

export type LearnCourse = {
  enrollment_id: string
  enrollment_status: Enums<'enrollment_status'>
  id: string
  title: string
  code: string | null
  description: string | null
}

/**
 * Courses the student is actually enrolled in.
 *
 * Deliberately NOT useCourses(): the courses SELECT policy is
 * `status = 'published' AND app.is_member(academy_id)`, so RLS alone would list
 * every published course in the tenant. The enrolment join has to be explicit.
 */
export function useMyCourses(academyId: string | null, studentId: string | null) {
  return useQuery({
    queryKey: ['learn-courses', academyId, studentId] as const,
    enabled: !!academyId && !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('id, status, courses(id, title, code, description)')
        .eq('academy_id', academyId!)
        .eq('student_id', studentId!)
        .eq('status', 'active')
        .order('enrolled_at', { ascending: false })
      if (error) throw error
      type Row = {
        id: string
        status: Enums<'enrollment_status'>
        courses: {
          id: string
          title: string
          code: string | null
          description: string | null
        } | null
      }
      return ((data ?? []) as unknown as Row[])
        .filter((r) => r.courses)
        .map<LearnCourse>((r) => ({
          enrollment_id: r.id,
          enrollment_status: r.status,
          id: r.courses!.id,
          title: r.courses!.title,
          code: r.courses!.code,
          description: r.courses!.description,
        }))
    },
  })
}

/**
 * Courses this student has asked for and staff have not opened yet.
 *
 * Separate from useMyCourses rather than widening its filter: everything
 * downstream of that hook assumes a course you can actually open.
 */
export function useMyPendingCourses(
  academyId: string | null,
  studentId: string | null,
) {
  return useQuery({
    queryKey: ['learn-pending-courses', academyId, studentId] as const,
    enabled: !!academyId && !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('id, courses(id, title)')
        .eq('academy_id', academyId!)
        .eq('student_id', studentId!)
        .eq('status', 'pending')
      if (error) throw error
      type Row = { id: string; courses: { id: string; title: string } | null }
      return ((data ?? []) as unknown as Row[])
        .filter((r) => r.courses)
        .map((r) => ({ id: r.id, title: r.courses!.title }))
    },
  })
}

/** A course's published modules with their published content, student vantage. */
export function useLearnCourseContent(
  academyId: string | null,
  courseId: string | null,
) {
  return useQuery({
    queryKey: ['learn-content', academyId, courseId] as const,
    enabled: !!academyId && !!courseId,
    queryFn: async () => {
      // RLS already restricts these to published rows in visible modules of
      // enrolled courses; the filters are for clarity and a smaller payload.
      const [modules, notes, materials, assessments, assignments] =
        await Promise.all([
        supabase
          .from('course_modules')
          .select('id, title, description, sort_order')
          .eq('academy_id', academyId!)
          .eq('course_id', courseId!)
          .eq('is_published', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('notes')
          .select('id, title, module_id, sort_order')
          .eq('academy_id', academyId!)
          .eq('course_id', courseId!)
          .eq('is_published', true)
          .order('sort_order', { ascending: true }),
        // file_path is deliberately NOT selected: it is of no use to a client
        // (the bucket is private) and the row is the id the signing function
        // wants.
        supabase
          .from('course_materials')
          .select('id, title, module_id, sort_order, file_name, mime_type, size_bytes')
          .eq('academy_id', academyId!)
          .eq('course_id', courseId!)
          .eq('is_published', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('assessments')
          .select('id, title, module_id, sort_order, total_points, duration_minutes, available_until')
          .eq('academy_id', academyId!)
          .eq('course_id', courseId!)
          .eq('is_published', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('assignments')
          .select('id, title, module_id, sort_order, total_points, due_at, allow_late')
          .eq('academy_id', academyId!)
          .eq('course_id', courseId!)
          .eq('is_published', true)
          .order('sort_order', { ascending: true }),
      ])
      const err =
        modules.error ??
        notes.error ??
        materials.error ??
        assessments.error ??
        assignments.error
      if (err) throw err
      return {
        modules: modules.data ?? [],
        notes: notes.data ?? [],
        materials: materials.data ?? [],
        assessments: assessments.data ?? [],
        assignments: assignments.data ?? [],
      }
    },
  })
}

export function useLearnNote(id: string | undefined) {
  return useQuery({
    queryKey: ['learn-note', id] as const,
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('id, title, content, course_id, updated_at')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
  })
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export function useLearnAssignment(id: string | undefined) {
  return useQuery({
    queryKey: ['learn-assignment', id] as const,
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

/** The caller's own submission for an assignment, if any. */
export function useMySubmission(
  assignmentId: string | undefined,
  studentId: string | null,
) {
  return useQuery({
    queryKey: ['learn-submission', assignmentId, studentId] as const,
    enabled: !!assignmentId && !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('assignment_id', assignmentId!)
        .eq('student_id', studentId!)
        .maybeSingle()
      if (error) throw error
      return data as Submission | null
    },
  })
}

/** Assessment title/points without touching assessment_questions.
 *
 * The attempt RPCs carry the title, but only once an attempt exists — before
 * that the landing page has nothing to name itself with. `assessments` SELECT
 * admits `is_published AND app.module_visible(module_id)`, so a student may
 * read this row directly.
 */
export function useLearnAssessmentMeta(id: string | undefined) {
  return useQuery({
    queryKey: ['learn-assessment-meta', id] as const,
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessments')
        .select(
          'id, title, course_id, total_points, duration_minutes, max_attempts, available_from, available_until',
        )
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/**
 * Create-or-update the caller's draft. Grading columns are never sent: the
 * BEFORE INSERT guard would null them anyway, and sending them invites drift
 * between what the client thinks it controls and what the DB allows.
 */
export function useSaveSubmission(
  academyId: string,
  assignmentId: string,
  studentId: string,
) {
  const qc = useQueryClient()
  const key = ['learn-submission', assignmentId, studentId] as const
  return useMutation({
    mutationFn: async ({
      id,
      content,
      submit,
    }: {
      id?: string
      content: string
      submit?: boolean
    }) => {
      const status = submit ? ('submitted' as const) : ('draft' as const)
      if (id) {
        const { data, error } = await supabase
          .from('assignment_submissions')
          .update({ content, status })
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        return data
      }
      const { data, error } = await supabase
        .from('assignment_submissions')
        .insert({
          academy_id: academyId,
          assignment_id: assignmentId,
          student_id: studentId,
          content,
        })
        .select()
        .single()
      if (error) throw error
      // A brand-new row is forced to 'draft' by the guard; submitting it is a
      // second step so the due-date check runs against a real transition.
      if (submit) {
        const { data: sent, error: sendErr } = await supabase
          .from('assignment_submissions')
          .update({ status: 'submitted' })
          .eq('id', data.id)
          .select()
          .single()
        if (sendErr) throw sendErr
        return sent
      }
      return data
    },
    // The dashboard and My work both derive their state from submissions, so a
    // hand-in that only invalidates its own detail key leaves the task showing
    // as outstanding everywhere else.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: ['learn-dashboard'] })
    },
  })
}

/** Discard an unsubmitted draft. Permitted while status = 'draft' only. */
export function useDeleteSubmission(assignmentId: string, studentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // count:'exact' turns an RLS refusal into an error instead of a silent
      // success: the DELETE policy requires status='draft', and a submitted row
      // simply matches zero rows rather than failing.
      const { error, count } = await supabase
        .from('assignment_submissions')
        .delete({ count: 'exact' })
        .eq('id', id)
      if (error) throw error
      if (!count)
        throw new Error(translate('learn.submission.delete_locked'))
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['learn-submission', assignmentId, studentId],
      })
      void qc.invalidateQueries({ queryKey: ['learn-dashboard'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Assessments — RPC only. correct_answer never reaches this file.
// ---------------------------------------------------------------------------

export type AttemptQuestion = {
  id: string
  question_type: Enums<'question_type'>
  prompt: string
  points: number
  sort_order: number
  /**
   * Public per-type configuration — choices, or a matching question's two
   * columns. app.attempt_questions builds this by hand and never includes
   * correct_answer; for matching it also reshuffles the right column, because
   * authoring order is itself the answer key. Shapes: lib/questions.ts.
   */
  options: Json | null
}

export type AttemptPayload = {
  attempt: {
    id: string
    assessment_id: string
    attempt_no: number
    status: Enums<'attempt_status'>
    /**
     * Keyed by question id. The value's JSON shape IS the question type —
     * string for free text (which is every answer written before question
     * types existed), boolean, array of option ids, or {leftId: rightId}.
     */
    answers: Record<string, AnswerValue>
    started_at: string
    submitted_at: string | null
    score: number | null
    max_score: number | null
    expires_at: string | null
  }
  assessment: {
    id: string
    title: string
    instructions: Json
    total_points: number
    duration_minutes: number | null
    max_attempts: number
    course_id: string
  }
  questions: AttemptQuestion[]
}

/** My attempts for one assessment (list view: status + score only). */
export function useMyAttempts(
  assessmentId: string | undefined,
  studentId: string | null,
) {
  return useQuery({
    queryKey: ['learn-attempts', assessmentId, studentId] as const,
    enabled: !!assessmentId && !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessment_attempts')
        .select('id, attempt_no, status, score, max_score, started_at, submitted_at')
        .eq('assessment_id', assessmentId!)
        .eq('student_id', studentId!)
        .order('attempt_no', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useStartAttempt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (assessmentId: string) => {
      const { data, error } = await supabase.rpc('start_attempt', {
        _assessment_id: assessmentId,
      })
      if (error) throw error
      return data as unknown as AttemptPayload
    },
    onSuccess: (payload) => {
      qc.setQueryData(['learn-attempt', payload.attempt.id], payload)
      void qc.invalidateQueries({ queryKey: ['learn-attempts'] })
      void qc.invalidateQueries({ queryKey: ['learn-dashboard'] })
    },
  })
}

export function useAttempt(attemptId: string | undefined) {
  return useQuery({
    queryKey: ['learn-attempt', attemptId] as const,
    enabled: !!attemptId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_attempt', {
        _attempt_id: attemptId!,
      })
      if (error) throw error
      return data as unknown as AttemptPayload
    },
  })
}

export function useSaveAnswers(attemptId: string) {
  const qc = useQueryClient()
  return useMutation({
    // Serialise saves for this attempt. save_attempt_answers REPLACES the
    // answers column rather than merging, so a debounced payload landing after
    // a newer on-blur one would erase whatever the newer one added. Same
    // scope.id makes TanStack run them FIFO, one at a time.
    scope: { id: `save-attempt-${attemptId}` },
    mutationFn: async (answers: Record<string, AnswerValue>) => {
      const { data, error } = await supabase.rpc('save_attempt_answers', {
        _attempt_id: attemptId,
        _answers: answers as unknown as Json,
      })
      if (error) throw error
      return data as unknown as AttemptPayload
    },
    onSuccess: (payload) =>
      qc.setQueryData(['learn-attempt', attemptId], payload),
  })
}

export function useSubmitAttempt(attemptId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('submit_attempt', {
        _attempt_id: attemptId,
      })
      if (error) throw error
      return data as unknown as AttemptPayload
    },
    onSuccess: (payload) => {
      qc.setQueryData(['learn-attempt', attemptId], payload)
      void qc.invalidateQueries({ queryKey: ['learn-attempts'] })
      void qc.invalidateQueries({ queryKey: ['learn-dashboard'] })
    },
  })
}
