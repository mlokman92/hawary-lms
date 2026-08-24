import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import type { Enums, Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import type { TKey } from '@/lib/i18n'

export type AcademyEnrollmentSettings = Tables<'academy_enrollment_settings'>
export type CourseEnrollmentSettings = Tables<'course_enrollment_settings'>
export type EnrollmentStatus = Enums<'enrollment_status'>

/**
 * Enrollment status → label. `pending` is a REQUEST: the person is already a
 * member of the academy, and `app.is_enrolled` requires 'active', so the course
 * stays shut until staff move it.
 */
export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, TKey> = {
  pending: 'enroll.status.pending',
  active: 'enroll.status.active',
  completed: 'enroll.status.completed',
  dropped: 'enroll.status.dropped',
  cancelled: 'enroll.status.rejected',
}

export type PublicAcademy = {
  id: string
  name: string
  slug: string
  logo_url: string | null
}

export type OpenCourse = {
  id: string
  title: string
  code: string | null
  description: string | null
  price_sen: number
  currency: string
  capacity: number | null
  seats_taken: number
  closes_at: string | null
}

export type AcademyEnrollment = {
  academy: PublicAcademy
  is_open: boolean
  intro: string | null
  courses: OpenCourse[]
}

export type JoinResult = {
  academy_id: string
  student_id: string
  enrollment_id: string
  status: EnrollmentStatus
}

/** A request row as the staff queue reads it. */
export type EnrollmentRequest = Tables<'enrollments'> & {
  students: {
    id: string
    full_name: string | null
    student_no: string
    email: string | null
    phone: string | null
  } | null
  courses: { id: string; title: string } | null
}

/** A course with its opening, as /enrollments lists them. */
export type CourseOpening = {
  id: string
  title: string
  code: string | null
  status: Tables<'courses'>['status']
  isOpen: boolean
  capacity: number | null
  closesAt: string | null
  seatsTaken: number
  /** Blank means this course sends no acceptance email — the default. */
  accessEmailBody: string
}

const academySettingsKey = (academyId: string | null) =>
  ['academy-enrollment-settings', academyId] as const
const openingsKey = (academyId: string | null) =>
  ['course-openings', academyId] as const
const requestsKey = (academyId: string | null) =>
  ['enrollment-requests', academyId] as const
const pendingCountKey = (academyId: string | null) =>
  ['enrollment-requests-pending', academyId] as const

export function seatsLeft(capacity: number | null, taken: number): number | null {
  return capacity === null ? null : Math.max(0, capacity - taken)
}

// ---------------------------------------------------------------------------
// Public — works signed out, both grants reach anon
// ---------------------------------------------------------------------------

export function useAcademyEnrollment(slug: string | undefined) {
  return useQuery({
    queryKey: ['academy-enrollment', slug ?? ''] as const,
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_academy_enrollment', {
        _slug: slug!,
      })
      if (error) throw error
      return (data as unknown as AcademyEnrollment | null) ?? null
    },
  })
}

/**
 * Join the academy and request a course in one call.
 *
 * Re-entrant: an existing member calling it again just requests another course,
 * which is why there is no separate "request" mutation.
 */
export function useJoinAcademy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { slug: string; courseId: string }) => {
      const { data, error } = await supabase.rpc('join_academy', {
        _slug: input.slug,
        _course_id: input.courseId,
      })
      if (error) throw error
      return data as unknown as JoinResult
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-enrollments'] })
      void qc.invalidateQueries({ queryKey: ['enrollment-requests-pending'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Learner — their own rows, read straight through RLS (owns_student)
// ---------------------------------------------------------------------------

export type MyEnrollment = Tables<'enrollments'> & {
  courses: { id: string; title: string } | null
}

export function useMyEnrollments(studentId: string | null | undefined) {
  return useQuery({
    queryKey: ['my-enrollments', studentId] as const,
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('*, courses(id, title)')
        .eq('student_id', studentId!)
        .order('enrolled_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as MyEnrollment[]
    },
  })
}

// ---------------------------------------------------------------------------
// Staff — the academy's public link
// ---------------------------------------------------------------------------

export function useAcademyEnrollmentSettings(academyId: string | null) {
  return useQuery({
    queryKey: academySettingsKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academy_enrollment_settings')
        .select('*')
        .eq('academy_id', academyId!)
        .maybeSingle()
      if (error) throw error
      return data as AcademyEnrollmentSettings | null
    },
  })
}

/** Upsert: no row until someone opens the link, and absent reads as closed. */
export function useSaveAcademyEnrollment(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: { is_open?: boolean; intro?: string | null }) => {
      const { data, error } = await supabase
        .from('academy_enrollment_settings')
        .upsert({ academy_id: academyId, ...patch }, { onConflict: 'academy_id' })
        .select()
        .single()
      if (error) throw error
      return data as AcademyEnrollmentSettings
    },
    onSuccess: (row) => qc.setQueryData(academySettingsKey(academyId), row),
  })
}

// ---------------------------------------------------------------------------
// Staff — which courses can be picked
// ---------------------------------------------------------------------------

export function useCourseOpenings(academyId: string | null) {
  return useQuery({
    queryKey: openingsKey(academyId),
    enabled: !!academyId,
    queryFn: async (): Promise<CourseOpening[]> => {
      const [courses, settings, stats] = await Promise.all([
        supabase
          .from('courses')
          .select('id, title, code, status')
          .eq('academy_id', academyId!)
          .neq('status', 'archived')
          .order('title'),
        supabase
          .from('course_enrollment_settings')
          .select('*')
          .eq('academy_id', academyId!),
        supabase
          .from('course_enrollment_stats')
          .select('course_id, active_students')
          .eq('academy_id', academyId!),
      ])
      if (courses.error) throw courses.error
      if (settings.error) throw settings.error
      if (stats.error) throw stats.error

      const byCourse = new Map(
        (settings.data ?? []).map((s) => [s.course_id, s]),
      )
      const taken = new Map(
        (stats.data ?? []).map((s) => [s.course_id ?? '', s.active_students ?? 0]),
      )
      return (courses.data ?? []).map((c) => {
        const s = byCourse.get(c.id)
        return {
          id: c.id,
          title: c.title,
          code: c.code,
          status: c.status,
          isOpen: !!s?.is_open,
          capacity: s?.capacity ?? null,
          closesAt: s?.closes_at ?? null,
          seatsTaken: taken.get(c.id) ?? 0,
          accessEmailBody: s?.access_email_body ?? '',
        }
      })
    },
  })
}

export function useSaveCourseOpening(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      courseId: string
      is_open?: boolean
      capacity?: number | null
      closes_at?: string | null
      /** null clears it, and a course with no body sends no acceptance email. */
      access_email_body?: string | null
    }) => {
      const { courseId, ...patch } = input
      const { error } = await supabase
        .from('course_enrollment_settings')
        .upsert(
          { course_id: courseId, academy_id: academyId, ...patch },
          { onConflict: 'course_id' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: openingsKey(academyId) })
    },
  })
}

// ---------------------------------------------------------------------------
// Staff — requests
// ---------------------------------------------------------------------------

export function useEnrollmentRequests(academyId: string | null) {
  return useQuery({
    queryKey: requestsKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select(
          '*, students(id, full_name, student_no, email, phone), courses(id, title)',
        )
        .eq('academy_id', academyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as EnrollmentRequest[]
    },
  })
}

/**
 * Just the sidebar's number: a count, not the rows.
 *
 * Its own query rather than deriving it from useEnrollmentRequests — the
 * sidebar is mounted on every back-office page, and pulling every request with
 * its student and course embedded to display one integer would be a full table
 * read per navigation.
 */
export function usePendingEnrollmentCount(academyId: string | null) {
  return useQuery({
    queryKey: pendingCountKey(academyId),
    enabled: !!academyId,
    // The sidebar outlives every navigation, so nothing would refetch this on
    // its own. Requests arrive while the tab sits open and nobody is notified —
    // coming back to the window is the moment the number has to be right.
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('academy_id', academyId!)
        .eq('status', 'pending')
      if (error) throw error
      return count ?? 0
    },
  })
}

/**
 * The six lists an enrollment write moves. Extracted so approve and reject
 * cannot drift apart, the way `invalidateMoney` does for the payments feature.
 */
function invalidateEnrollment(qc: QueryClient, academyId: string | null) {
  void qc.invalidateQueries({ queryKey: requestsKey(academyId) })
  void qc.invalidateQueries({ queryKey: pendingCountKey(academyId) })
  void qc.invalidateQueries({ queryKey: openingsKey(academyId) })
  void qc.invalidateQueries({ queryKey: ['students', academyId] })
  void qc.invalidateQueries({ queryKey: ['courses', academyId] })
  void qc.invalidateQueries({
    queryKey: ['course-enrollment-stats', academyId],
  })
}

export type ApproveResult = {
  approved: boolean
  notify: boolean
  reason?: 'not_found' | 'already_active'
  status?: EnrollmentStatus
}

export type SendCourseAccessResult =
  | { ok: true; id: string | null; to: string }
  | {
      ok: false
      code: 'no_email' | 'email_not_configured' | 'send_failed'
      message: string
    }

export type ApproveOutcome = {
  result: ApproveResult
  /** null when the RPC did not claim an email — nothing was attempted. */
  email: SendCourseAccessResult | null
}

/** Same shape as the payments feature's copy; deliberately not shared. */
async function readFunctionError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown })?.context
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const parsed = (await (ctx as Response).json()) as {
        error?: string
        message?: string
      }
      return parsed.error ?? parsed.message ?? null
    } catch {
      return null
    }
  }
  return null
}

/**
 * Approve a request, then tell the student.
 *
 * `approve_enrollment` is an RPC and not the plain UPDATE this used to be for
 * one reason: approving now has an irreversible side effect, so the transition
 * and the decision to email have to be one statement. Two staff clicking
 * Approve on the same row is the normal case, and a select-then-update would
 * send twice. The RPC locks the row, asserts it is not already active, and
 * claims the email — the loser of the race gets `already_active` and sends
 * nothing.
 *
 * The RPC returns no student data on purpose. If it handed the recipient to the
 * browser and the browser handed it to the Edge Function, that function's
 * recipient would be client input and it would be an open relay; it re-reads
 * the address itself under the caller's own JWT.
 *
 * Delivery is soft: the student is already enrolled, so a send failure is
 * reported, never thrown.
 */
export function useApproveEnrollment(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<ApproveOutcome> => {
      const { data, error } = await supabase.rpc('approve_enrollment', {
        _enrollment_id: id,
      })
      if (error) throw error
      const result = data as unknown as ApproveResult

      // Not our call to make: the RPC decides. `notify` is false for a lost
      // race, a student with no address, and a row already emailed once.
      if (!result?.approved || !result.notify) return { result, email: null }

      const { data: sent, error: sendError } =
        await supabase.functions.invoke<SendCourseAccessResult>(
          'send-course-access',
          { body: { enrollment_id: id, origin: window.location.origin } },
        )
      if (sendError) {
        const body = await readFunctionError(sendError)
        return {
          result,
          email: {
            ok: false,
            code: 'send_failed',
            message: body ?? 'The email could not be sent.',
          },
        }
      }
      return {
        result,
        email:
          sent ??
          ({
            ok: false,
            code: 'send_failed',
            message: 'The email service did not respond.',
          } as SendCourseAccessResult),
      }
    },
    onSuccess: () => invalidateEnrollment(qc, academyId),
  })
}

/**
 * Reject: still a plain UPDATE. It has no side effect to guard, so the
 * `enrollments: staff update` policy is all it ever needed.
 */
export function useRejectEnrollment(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('enrollments')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateEnrollment(qc, academyId),
  })
}
