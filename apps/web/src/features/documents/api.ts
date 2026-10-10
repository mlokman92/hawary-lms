import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Enums, Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { icCopyUrl, uploadIcCopy } from '@/lib/storage'

/**
 * Documents — the offer letter and the IC copy. See docs/documents.md.
 *
 * Both staff pages list the same people, so they share one read: every live
 * student, the course they are on and whether an IC copy is on file. Neither
 * page is reachable by a trainer, and the IC copy half would come back empty
 * for one anyway — `student_ic_copies` is admin-or-own.
 */

export type DocumentCourse = {
  id: string
  title: string
  start_date: string | null
}

export type DocumentStudent = Pick<
  Tables<'students'>,
  'id' | 'student_no' | 'full_name' | 'email' | 'ic_number' | 'personal_address'
> & {
  course: DocumentCourse | null
  icCopy: Pick<Tables<'student_ic_copies'>, 'created_at' | 'file_name'> | null
}

type EnrollmentEmbed = {
  status: Enums<'enrollment_status'>
  courses: DocumentCourse | null
}

/**
 * A student has one course: `enrollments_one_course_per_student` allows a
 * single enrolment that is not cancelled. That one is theirs, whatever state
 * it is in.
 */
function courseOf(enrollments: EnrollmentEmbed[] | null): DocumentCourse | null {
  return (enrollments ?? []).find((e) => e.status !== 'cancelled')?.courses ?? null
}

export function useDocumentStudents(academyId: string | null) {
  return useQuery({
    queryKey: ['document-students', academyId] as const,
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select(
          'id, student_no, full_name, email, ic_number, personal_address, enrollments(status, courses(id, title, start_date)), ic_copy:student_ic_copies(created_at, file_name)',
        )
        .eq('academy_id', academyId!)
        .is('archived_at', null)
        .order('full_name', { ascending: true })
      if (error) throw error
      type Row = Omit<DocumentStudent, 'course' | 'icCopy'> & {
        enrollments: EnrollmentEmbed[] | null
        ic_copy: DocumentStudent['icCopy']
      }
      return ((data ?? []) as unknown as Row[]).map<DocumentStudent>(
        ({ enrollments, ic_copy, ...student }) => ({
          ...student,
          course: courseOf(enrollments),
          icCopy: ic_copy,
        }),
      )
    },
  })
}

/**
 * The course the signed-in student's letter is about. Null when they are on
 * none — or on one they cannot read yet, which is a course still in draft.
 */
export function useMyDocumentCourse(
  academyId: string | null,
  studentId: string | undefined,
) {
  return useQuery({
    queryKey: ['my-document-course', academyId, studentId] as const,
    enabled: !!academyId && !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('status, courses(id, title, start_date)')
        .eq('academy_id', academyId!)
        .eq('student_id', studentId!)
      if (error) throw error
      return courseOf(data as unknown as EnrollmentEmbed[])
    },
  })
}

const myIcCopyKey = (studentId: string | undefined) =>
  ['my-ic-copy', studentId] as const

export function useMyIcCopy(studentId: string | undefined) {
  return useQuery({
    queryKey: myIcCopyKey(studentId),
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_ic_copies')
        .select('created_at, file_name')
        .eq('student_id', studentId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useUploadMyIcCopy(studentId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadIcCopy(studentId!, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: myIcCopyKey(studentId) }),
  })
}

/** Open a student's IC copy in a new tab, through a link minted for the click. */
export function useOpenIcCopy() {
  return useMutation({
    mutationFn: async (studentId: string) => {
      const url = await icCopyUrl(studentId)
      // window.opener would hand the new tab a reference back to this one.
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })
}
