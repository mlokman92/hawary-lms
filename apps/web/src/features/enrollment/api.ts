import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Enums, Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import type { TKey } from '@/lib/i18n'

export type EnrollmentSettings = Tables<'course_enrollment_settings'>
export type EnrollmentApplication = Tables<'enrollment_applications'>
export type ApplicationStatus = Enums<'enrollment_application_status'>

/** Enum → label, resolved at render. Built at import time, so it holds keys. */
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, TKey> = {
  pending: 'enroll.status.pending',
  approved: 'enroll.status.approved',
  rejected: 'enroll.status.rejected',
  withdrawn: 'enroll.status.withdrawn',
}

/**
 * The student-detail fields an enrollment form can ask for. Names match
 * `students` columns 1:1 — that is what makes approval a straight copy rather
 * than a mapping table.
 */
export const APPLICANT_FIELDS = [
  'full_name',
  'email',
  'phone',
  'ic_number',
  'date_of_birth',
  'gender',
  'address',
  'organization',
] as const
export type ApplicantField = (typeof APPLICANT_FIELDS)[number]

/** Fields the settings dialog lets you toggle. full_name is never optional. */
export const OPTIONAL_APPLICANT_FIELDS = APPLICANT_FIELDS.filter(
  (f): f is Exclude<ApplicantField, 'full_name'> => f !== 'full_name',
)

export type PublicAcademy = {
  id: string
  name: string
  slug: string
  logo_url: string | null
}

export type PublicCourse = {
  id: string
  title: string
  code: string | null
  description: string | null
  price_sen: number
  currency: string
}

export type EnrollmentPage = {
  academy: PublicAcademy
  course: PublicCourse
  intro: string | null
  required_fields: ApplicantField[]
  is_open: boolean
  closes_at: string | null
  capacity: number | null
  seats_taken: number
}

export type EnrollmentOpening = PublicCourse & {
  closes_at: string | null
  capacity: number | null
  seats_taken: number
}

export type EnrollmentDirectory = {
  academy: PublicAcademy
  courses: EnrollmentOpening[]
}

export type MyApplication = {
  id: string
  academy_id: string
  academy_name: string
  academy_slug: string
  academy_logo_url: string | null
  course_id: string
  course_title: string
  status: ApplicationStatus
  review_note: string | null
  created_at: string
  reviewed_at: string | null
}

export type MatchCandidate = {
  student_id: string
  student_no: string
  full_name: string | null
  email: string | null
  ic_number: string | null
  match_reason: 'verified_email' | 'email' | 'ic'
  linkable: boolean
}

export type QueueApplication = EnrollmentApplication & {
  courses: { id: string; title: string } | null
}

const settingsKey = (courseId: string) =>
  ['course-enrollment-settings', courseId] as const
const queueKey = (academyId: string | null) =>
  ['enrollment-applications', academyId] as const
const myApplicationsKey = ['my-enrollment-applications'] as const
const myApplicationKey = (courseId: string | undefined) =>
  ['my-enrollment-application', courseId ?? ''] as const

/** Seats left, or null when the intake is uncapped. */
export function seatsLeft(
  capacity: number | null,
  taken: number,
): number | null {
  return capacity === null ? null : Math.max(0, capacity - taken)
}

// ---------------------------------------------------------------------------
// Public (works signed out — both RPCs are granted to anon)
// ---------------------------------------------------------------------------

export function useEnrollmentPage(
  slug: string | undefined,
  courseId: string | undefined,
) {
  return useQuery({
    queryKey: ['enrollment-page', slug ?? '', courseId ?? ''] as const,
    enabled: !!slug && !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_enrollment_page', {
        _slug: slug!,
        _course: courseId!,
      })
      if (error) throw error
      return (data as unknown as EnrollmentPage | null) ?? null
    },
  })
}

export function useEnrollmentDirectory(slug: string | undefined) {
  return useQuery({
    queryKey: ['enrollment-directory', slug ?? ''] as const,
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_enrollment_openings', {
        _slug: slug!,
      })
      if (error) throw error
      return (data as unknown as EnrollmentDirectory | null) ?? null
    },
  })
}

// ---------------------------------------------------------------------------
// Applicant
// ---------------------------------------------------------------------------

/**
 * The signed-in caller's own application for one course, latest first.
 *
 * `user_id` is filtered explicitly and not left to RLS. The policy is
 * `can_grade_course(course_id) OR user_id = auth.uid()`, so for a trainer
 * viewing their own course's public page an unfiltered read would return
 * somebody else's application as "yours".
 */
export function useMyApplication(
  courseId: string | undefined,
  userId: string | undefined,
) {
  return useQuery({
    queryKey: [...myApplicationKey(courseId), userId ?? ''] as const,
    enabled: !!courseId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollment_applications')
        .select('*')
        .eq('course_id', courseId!)
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) throw error
      return (data?.[0] ?? null) as EnrollmentApplication | null
    },
  })
}

export function useApplyToCourse(courseId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (details: Record<string, string>) => {
      const { data, error } = await supabase.rpc('apply_to_course', {
        _course_id: courseId!,
        _details: details,
      })
      if (error) throw error
      return data as unknown as { id: string; status: ApplicationStatus }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: myApplicationKey(courseId) })
      void qc.invalidateQueries({ queryKey: myApplicationsKey })
    },
  })
}

export function useWithdrawApplication(courseId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('withdraw_application', { _id: id })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: myApplicationKey(courseId) })
      void qc.invalidateQueries({ queryKey: myApplicationsKey })
    },
  })
}

/**
 * Every application this account has made, with the academy and course names
 * attached. An RPC rather than an embed: the applicant is not a member, so
 * `academies` and `courses` are invisible to them through RLS.
 */
export function useMyApplications(enabled = true) {
  return useQuery({
    queryKey: myApplicationsKey,
    enabled,
    // The decision arrives without any notification, so this list is how the
    // applicant finds out. Never serve it stale.
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_enrollment_applications')
      if (error) throw error
      return (data ?? []) as unknown as MyApplication[]
    },
  })
}

// ---------------------------------------------------------------------------
// Staff — settings
// ---------------------------------------------------------------------------

export function useEnrollmentSettings(courseId: string | undefined) {
  return useQuery({
    queryKey: settingsKey(courseId ?? ''),
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_enrollment_settings')
        .select('*')
        .eq('course_id', courseId!)
        .maybeSingle()
      if (error) throw error
      return data as EnrollmentSettings | null
    },
  })
}

export type EnrollmentSettingsPatch = {
  is_open?: boolean
  is_listed?: boolean
  capacity?: number | null
  closes_at?: string | null
  intro?: string | null
  required_fields?: string[]
}

/**
 * Upsert, not update: a course has no settings row until someone configures it,
 * and "absent" is what the public RPCs read as "this course has no enrollment
 * page". Both the insert and the update policy are app.can_grade_course.
 */
export function useSaveEnrollmentSettings(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: EnrollmentSettingsPatch) => {
      const { data, error } = await supabase
        .from('course_enrollment_settings')
        .upsert(
          { course_id: courseId, academy_id: academyId, ...patch },
          { onConflict: 'course_id' },
        )
        .select()
        .single()
      if (error) throw error
      return data as EnrollmentSettings
    },
    onSuccess: (row) => {
      qc.setQueryData(settingsKey(courseId), row)
    },
  })
}

// ---------------------------------------------------------------------------
// Staff — the review queue
// ---------------------------------------------------------------------------

/**
 * Academy-wide, like the grading queue: the SELECT policy is
 * `app.can_grade_course(course_id)`, so a trainer already sees only the courses
 * they are assigned to and no client-side narrowing is needed.
 */
export function useApplicationQueue(academyId: string | null) {
  return useQuery({
    queryKey: queueKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollment_applications')
        .select('*, courses(id, title)')
        .eq('academy_id', academyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as QueueApplication[]
    },
  })
}

/** Just the badge on the course page — a count, not the rows. */
export function usePendingApplicationCount(
  academyId: string | null,
  courseId: string | undefined,
) {
  return useQuery({
    queryKey: ['enrollment-applications-pending', academyId, courseId] as const,
    enabled: !!academyId && !!courseId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('enrollment_applications')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', courseId!)
        .eq('status', 'pending')
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useMatchCandidates(applicationId: string | undefined) {
  return useQuery({
    queryKey: ['application-match-candidates', applicationId ?? ''] as const,
    enabled: !!applicationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'application_match_candidates',
        { _id: applicationId! },
      )
      if (error) throw error
      return (data ?? []) as unknown as MatchCandidate[]
    },
  })
}

export type ReviewInput = {
  id: string
  decision: 'approved' | 'rejected'
  note?: string | null
  linkStudentId?: string | null
  force?: boolean
}

export function useReviewApplication(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ReviewInput) => {
      const { data, error } = await supabase.rpc(
        'review_enrollment_application',
        {
          _id: input.id,
          _decision: input.decision,
          _note: input.note ?? undefined,
          _link_student_id: input.linkStudentId ?? undefined,
          _force: input.force ?? false,
        },
      )
      if (error) throw error
      return data as unknown as { status: ApplicationStatus; student_id?: string }
    },
    onSuccess: () => {
      // Approving mints a student and an enrollment: the roster, the per-course
      // student count and the queue all move at once.
      void qc.invalidateQueries({ queryKey: queueKey(academyId) })
      void qc.invalidateQueries({ queryKey: ['enrollment-applications-pending'] })
      void qc.invalidateQueries({ queryKey: ['students', academyId] })
      void qc.invalidateQueries({ queryKey: ['courses', academyId] })
      void qc.invalidateQueries({
        queryKey: ['course-enrollment-stats', academyId],
      })
    },
  })
}
