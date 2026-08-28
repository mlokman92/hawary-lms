import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Enums, Tables, TablesInsert, TablesUpdate } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { inviteImported } from '@/features/invitations/autoInvite'
import { translate } from '@/lib/i18n'
import { errorMessage } from '@/lib/errors'

export type Student = Tables<'students'>
export type StudentStatus = Enums<'student_status'>
export type Gender = Enums<'gender'>
export type StudentCreateInput = Omit<
  TablesInsert<'students'>,
  'academy_id' | 'student_no'
>
export type StudentPatch = TablesUpdate<'students'>

/** A student row plus a lightweight view of its enrollments (for the list "Course" column). */
export type StudentRow = Student & {
  enrollments: {
    id: string
    status: Enums<'enrollment_status'>
    courses: { id: string; title: string } | null
  }[]
}

export type EnrollmentRow = Tables<'enrollments'> & {
  courses: { id: string; title: string; status: Enums<'course_status'> } | null
}

const studentsKey = (academyId: string | null) => ['students', academyId] as const
const studentKey = (id: string) => ['student', id] as const
const enrollmentsKey = (studentId: string) =>
  ['enrollments', 'student', studentId] as const

export function useStudents(academyId: string | null) {
  return useQuery({
    queryKey: studentsKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('*, enrollments(id, status, courses(id, title))')
        .eq('academy_id', academyId!)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as StudentRow[]
    },
  })
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: studentKey(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useCreateStudent(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: StudentCreateInput) => {
      // student_no: '' triggers the DB to generate a unique 8-char code.
      const { data, error } = await supabase
        .from('students')
        .insert({ ...input, academy_id: academyId, student_no: '' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: studentsKey(academyId) }),
  })
}

/**
 * One round trip per 100 rows. A single insert of an 800-row roster is a large
 * payload to lose to one bad cell, and PostgREST rejects the whole statement on
 * any row's failure — chunking bounds what a failure costs.
 */
const IMPORT_CHUNK = 100

/**
 * Bulk create from a parsed CSV (see `features/import`). Rows arrive already
 * validated and normalised, so this only stamps the tenant fields and batches.
 *
 * On a mid-way failure it reports how many rows were already written: the
 * batches are separate statements, so the earlier ones are committed and the
 * user needs to know not to re-import the whole file.
 */
export function useImportStudents(academyId: string) {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({
      rows,
      invite,
    }: {
      rows: Record<string, string | null>[]
      invite: boolean
    }) => {
      const payload = rows.map((row) => ({
        ...row,
        academy_id: academyId,
        // student_no: '' triggers the DB to generate a unique 8-char code —
        // the trigger is BEFORE INSERT per row, so a batch gets one each.
        student_no: '',
        created_by: user?.id ?? null,
      })) as unknown as TablesInsert<'students'>[]

      // `email` comes back beside `id` rather than being zipped from the
      // payload by index: PostgREST does not promise a bulk insert returns
      // rows in the order they were sent, and inviting the wrong address is
      // worse than not inviting at all.
      const created: { id: string; email: string | null }[] = []
      for (let i = 0; i < payload.length; i += IMPORT_CHUNK) {
        const { data, error } = await supabase
          .from('students')
          .insert(payload.slice(i, i + IMPORT_CHUNK))
          .select('id, email')
        if (error) {
          throw new Error(
            `${translate('import.partial', { count: created.length })} ${error.message}`,
          )
        }
        created.push(...((data ?? []) as { id: string; email: string | null }[]))
      }

      // The records are written by now. Invitations are a second pass, so a
      // provider that starts refusing loses emails, never rows.
      const invited = invite ? await inviteImported('student', created) : null
      return { inserted: created.length, invited }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: studentsKey(academyId) }),
  })
}

export function useUpdateStudent(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: StudentPatch }) => {
      const { data, error } = await supabase
        .from('students')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: studentsKey(academyId) })
      qc.invalidateQueries({ queryKey: studentKey(row.id) })
    },
  })
}

export function useArchiveStudent(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('students')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: studentsKey(academyId) }),
  })
}

export function useStudentEnrollments(studentId: string | undefined) {
  return useQuery({
    queryKey: enrollmentsKey(studentId ?? ''),
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('*, courses(id, title, status)')
        .eq('student_id', studentId!)
        .order('enrolled_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as EnrollmentRow[]
    },
  })
}

export function useEnrollStudent(academyId: string, studentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (courseId: string) => {
      const { data, error } = await supabase
        .from('enrollments')
        .insert({
          academy_id: academyId,
          student_id: studentId,
          course_id: courseId,
          status: 'active',
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: enrollmentsKey(studentId) })
      qc.invalidateQueries({ queryKey: studentsKey(academyId) })
    },
  })
}

export function useUnenroll(academyId: string, studentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase
        .from('enrollments')
        .delete()
        .eq('id', enrollmentId)
      if (error) throw error
      return enrollmentId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: enrollmentsKey(studentId) })
      qc.invalidateQueries({ queryKey: studentsKey(academyId) })
    },
  })
}

export const STUDENT_STATUSES: StudentStatus[] = [
  'active',
  'trial',
  'inactive',
  'withdrawn',
  'unenrolled',
]

export function studentStats(students: StudentRow[]) {
  const by = (s: StudentStatus) => students.filter((x) => x.status === s).length
  return {
    total: students.length,
    active: by('active'),
    trial: by('trial'),
    inactive: by('inactive'),
    withdrawn: by('withdrawn'),
    // "Unenrolled" is derived: a student with no courses attached.
    unenrolled: students.filter((x) => x.enrollments.length === 0).length,
  }
}

/**
 * Result of the `send-invitation` edge function. `ok: false` is a soft outcome
 * (the invite still exists; only email delivery didn't happen) — the UI falls
 * back to the copy-link. `code: 'email_not_configured'` means no provider key
 * is set yet, so we treat it as informational rather than an error.
 */
export type SendInvitationResult = {
  ok: boolean
  id?: string | null
  to?: string
  code?: 'email_not_configured' | 'send_failed'
  message?: string
}

/** Email the accept link for an invitation via the send-invitation edge function. */
export function useSendInvitation() {
  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.functions.invoke<SendInvitationResult>(
        'send-invitation',
        { body: { token, origin: window.location.origin } },
      )
      if (error) {
        // A non-2xx status yields a FunctionsHttpError whose `.message` is a
        // generic SDK string; the real reason is JSON on `error.context`.
        const body = await readFunctionError(error)
        throw new Error(
          body ?? errorMessage(error, translate('students.invite.send_failed')),
        )
      }
      return (data ?? {
        ok: false,
        message: translate('students.invite.no_response'),
      }) as SendInvitationResult
    },
  })
}

async function readFunctionError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown })?.context
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const parsed = (await (ctx as Response).json()) as { error?: string; message?: string }
      return parsed.error ?? parsed.message ?? null
    } catch {
      return null
    }
  }
  return null
}

/** Accept an invitation (invited person, signed in). Links their profile + membership. */
export async function acceptInvitation(token: string) {
  const { data, error } = await supabase.rpc('accept_invitation', {
    _token: token,
  })
  if (error) throw error
  // `accept_invitation` always returns a row, so a null here is postgrest-js's
  // workaround for supabase/postgrest-js#295 rewriting a 404-with-empty-body
  // into a 204 with no error at all. Unguarded that reads as a successful
  // join: the caller would clear the stashed token and say "You're in!" to
  // somebody who is not. An Error carries no `code`, so this stays retryable.
  if (!data) throw new Error(translate('auth.invite.error.generic'))
  return data as unknown as { academy_id: string; status: string }
}
