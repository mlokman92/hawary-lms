import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Enums, Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import {
  employmentLetterUrl,
  icCopyUrl,
  uploadEmploymentLetter,
  uploadIcCopy,
} from '@/lib/storage'

/**
 * Documents — the offer letter, the IC copy and the employment letter. See
 * docs/documents.md.
 *
 * The staff pages list the same people, so they share one read: every live
 * student, the course they are on and which of their documents are on file.
 * None is reachable by a trainer, and the uploaded halves would come back
 * empty for one anyway — those tables are admin-or-own.
 */

export type DocumentCourse = {
  id: string
  title: string
  start_date: string | null
}

/** A student's own PDF on file — an IC copy or an employment letter. */
export type UploadedPdf = Pick<
  Tables<'student_ic_copies'>,
  'created_at' | 'file_name'
>

export type DocumentStudent = Pick<
  Tables<'students'>,
  'id' | 'student_no' | 'full_name' | 'email' | 'ic_number' | 'personal_address'
> & {
  course: DocumentCourse | null
  icCopy: UploadedPdf | null
  employmentLetter: UploadedPdf | null
  /** When the student signed and agreed to the letter's terms; null if not. */
  offerAcceptedAt: string | null
}

/** A student's signature on the offer letter, and when they gave it. */
export type OfferAcceptance = Pick<
  Tables<'student_offer_acceptances'>,
  'signature' | 'accepted_at'
>

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
          'id, student_no, full_name, email, ic_number, personal_address, enrollments(status, courses(id, title, start_date)), ic_copy:student_ic_copies(created_at, file_name), employment_letter:student_employment_letters(created_at, file_name), offer_acceptance:student_offer_acceptances(accepted_at)',
        )
        .eq('academy_id', academyId!)
        .is('archived_at', null)
        .order('full_name', { ascending: true })
      if (error) throw error
      type Row = Omit<
        DocumentStudent,
        'course' | 'icCopy' | 'employmentLetter' | 'offerAcceptedAt'
      > & {
        enrollments: EnrollmentEmbed[] | null
        ic_copy: UploadedPdf | null
        employment_letter: UploadedPdf | null
        offer_acceptance: { accepted_at: string } | null
      }
      return ((data ?? []) as unknown as Row[]).map<DocumentStudent>(
        ({
          enrollments,
          ic_copy,
          employment_letter,
          offer_acceptance,
          ...student
        }) => ({
          ...student,
          course: courseOf(enrollments),
          icCopy: ic_copy,
          employmentLetter: employment_letter,
          offerAcceptedAt: offer_acceptance?.accepted_at ?? null,
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

/**
 * The signature on file for one student, or null when they have not signed.
 * RLS decides who may ask: an admin, or the student themselves.
 */
export async function fetchOfferAcceptance(
  studentId: string,
): Promise<OfferAcceptance | null> {
  const { data, error } = await supabase
    .from('student_offer_acceptances')
    .select('signature, accepted_at')
    .eq('student_id', studentId)
    .maybeSingle()
  if (error) throw error
  return data
}

const myOfferAcceptanceKey = (studentId: string | undefined) =>
  ['my-offer-acceptance', studentId] as const

export function useMyOfferAcceptance(studentId: string | undefined) {
  return useQuery({
    queryKey: myOfferAcceptanceKey(studentId),
    enabled: !!studentId,
    queryFn: () => fetchOfferAcceptance(studentId!),
  })
}

/**
 * Sign and agree. Returns the moment the database recorded, which is the date
 * the letter prints — not the browser's clock.
 */
export function useSignOfferLetter(studentId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (signature: string) => {
      const { data, error } = await supabase.rpc('sign_offer_letter', {
        _student_id: studentId!,
        _signature: signature,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: myOfferAcceptanceKey(studentId) })
      qc.invalidateQueries({ queryKey: ['document-students'] })
    },
  })
}

/**
 * A student's own uploaded PDFs: the same three hooks for each document, so
 * the learner page and the staff page are written once over either.
 */
export type UploadedPdfKind = 'ic' | 'employment'

const PDF_KINDS = {
  ic: {
    table: 'student_ic_copies',
    key: 'my-ic-copy',
    upload: uploadIcCopy,
    url: icCopyUrl,
  },
  employment: {
    table: 'student_employment_letters',
    key: 'my-employment-letter',
    upload: uploadEmploymentLetter,
    url: employmentLetterUrl,
  },
} as const

const myPdfKey = (kind: UploadedPdfKind, studentId: string | undefined) =>
  [PDF_KINDS[kind].key, studentId] as const

export function useMyPdf(kind: UploadedPdfKind, studentId: string | undefined) {
  return useQuery({
    queryKey: myPdfKey(kind, studentId),
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(PDF_KINDS[kind].table)
        .select('created_at, file_name')
        .eq('student_id', studentId!)
        .maybeSingle()
      if (error) throw error
      return data as UploadedPdf | null
    },
  })
}

export function useUploadMyPdf(
  kind: UploadedPdfKind,
  studentId: string | undefined,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => PDF_KINDS[kind].upload(studentId!, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: myPdfKey(kind, studentId) })
      qc.invalidateQueries({ queryKey: ['document-students'] })
    },
  })
}

/** Open a student's PDF in a new tab, through a link minted for the click. */
export function useOpenPdf(kind: UploadedPdfKind) {
  return useMutation({
    mutationFn: async (studentId: string) => {
      const url = await PDF_KINDS[kind].url(studentId)
      // window.opener would hand the new tab a reference back to this one.
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })
}
