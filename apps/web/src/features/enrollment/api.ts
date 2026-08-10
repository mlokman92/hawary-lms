import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
 * Approve or reject: a plain UPDATE. The `enrollments: staff update` policy has
 * always allowed this — the same right staff already exercise when they enrol
 * somebody from the student page — so there is nothing for an RPC to add.
 */
export function useSetEnrollmentStatus(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; status: EnrollmentStatus }) => {
      const { error } = await supabase
        .from('enrollments')
        .update({ status: input.status })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: requestsKey(academyId) })
      void qc.invalidateQueries({ queryKey: pendingCountKey(academyId) })
      void qc.invalidateQueries({ queryKey: openingsKey(academyId) })
      void qc.invalidateQueries({ queryKey: ['students', academyId] })
      void qc.invalidateQueries({ queryKey: ['courses', academyId] })
      void qc.invalidateQueries({
        queryKey: ['course-enrollment-stats', academyId],
      })
    },
  })
}
