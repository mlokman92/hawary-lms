import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Enums, Tables, TablesInsert, TablesUpdate } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { translate } from '@/lib/i18n'

export type Instructor = Tables<'instructors'>
export type InstructorStatus = Enums<'instructor_status'>
export type Gender = Enums<'gender'>
export type InstructorCreateInput = Omit<
  TablesInsert<'instructors'>,
  'academy_id' | 'instructor_no'
>
export type InstructorPatch = TablesUpdate<'instructors'>

/** An instructor row plus a lightweight view of course assignments (list "Courses" column). */
export type InstructorRow = Instructor & {
  course_instructors: {
    id: string
    courses: { id: string; title: string } | null
  }[]
}

export type InstructorCourseRow = Tables<'course_instructors'> & {
  courses: { id: string; title: string; status: Enums<'course_status'> } | null
}

const instructorsKey = (academyId: string | null) =>
  ['instructors', academyId] as const
const instructorKey = (id: string) => ['instructor', id] as const
const assignmentsKey = (instructorId: string) =>
  ['course_instructors', 'instructor', instructorId] as const

export function useInstructors(academyId: string | null) {
  return useQuery({
    queryKey: instructorsKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instructors')
        .select('*, course_instructors(id, courses(id, title))')
        .eq('academy_id', academyId!)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as InstructorRow[]
    },
  })
}

export function useInstructor(id: string | undefined) {
  return useQuery({
    queryKey: instructorKey(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instructors')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useCreateInstructor(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: InstructorCreateInput) => {
      // instructor_no: '' triggers the DB to generate a unique 8-char code.
      const { data, error } = await supabase
        .from('instructors')
        .insert({ ...input, academy_id: academyId, instructor_no: '' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: instructorsKey(academyId) }),
  })
}

/** See the note on the student importer — same reasoning, same batch size. */
const IMPORT_CHUNK = 100

/**
 * Bulk create instructor *records* from a parsed CSV. Deliberately not accounts:
 * `instructors.user_id` is only ever written by accept_invitation or
 * link_instructor_account, and granting back-office access to a row in a
 * spreadsheet is not something an import should do quietly.
 */
export function useImportInstructors(academyId: string) {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (rows: Record<string, string | null>[]) => {
      const payload = rows.map((row) => ({
        ...row,
        academy_id: academyId,
        instructor_no: '',
        created_by: user?.id ?? null,
      })) as unknown as TablesInsert<'instructors'>[]

      let inserted = 0
      for (let i = 0; i < payload.length; i += IMPORT_CHUNK) {
        const { data, error } = await supabase
          .from('instructors')
          .insert(payload.slice(i, i + IMPORT_CHUNK))
          .select('id')
        if (error) {
          throw new Error(
            `${translate('import.partial', { count: inserted })} ${error.message}`,
          )
        }
        inserted += data?.length ?? 0
      }
      return inserted
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: instructorsKey(academyId) }),
  })
}

export function useUpdateInstructor(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: InstructorPatch }) => {
      const { data, error } = await supabase
        .from('instructors')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: instructorsKey(academyId) })
      qc.invalidateQueries({ queryKey: instructorKey(row.id) })
    },
  })
}

export function useArchiveInstructor(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('instructors')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: instructorsKey(academyId) }),
  })
}

export function useInstructorCourses(instructorId: string | undefined) {
  return useQuery({
    queryKey: assignmentsKey(instructorId ?? ''),
    enabled: !!instructorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_instructors')
        .select('*, courses(id, title, status)')
        .eq('instructor_id', instructorId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as InstructorCourseRow[]
    },
  })
}

export function useAssignCourse(academyId: string, instructorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (courseId: string) => {
      const { data, error } = await supabase
        .from('course_instructors')
        .insert({
          academy_id: academyId,
          instructor_id: instructorId,
          course_id: courseId,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assignmentsKey(instructorId) })
      qc.invalidateQueries({ queryKey: instructorsKey(academyId) })
    },
  })
}

export function useUnassignCourse(academyId: string, instructorId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('course_instructors')
        .delete()
        .eq('id', assignmentId)
      if (error) throw error
      return assignmentId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assignmentsKey(instructorId) })
      qc.invalidateQueries({ queryKey: instructorsKey(academyId) })
    },
  })
}

export const INSTRUCTOR_STATUSES: InstructorStatus[] = [
  'active',
  'on_leave',
  'inactive',
]

export function instructorStats(instructors: InstructorRow[]) {
  const by = (s: InstructorStatus) =>
    instructors.filter((x) => x.status === s).length
  return {
    total: instructors.length,
    active: by('active'),
    on_leave: by('on_leave'),
    inactive: by('inactive'),
    // "Unassigned" is derived: an instructor with no courses attached.
    unassigned: instructors.filter((x) => x.course_instructors.length === 0)
      .length,
  }
}

/** Create an invitation for an instructor record; accepting grants the `trainer` role. */
export function useCreateInstructorInvitation() {
  return useMutation({
    mutationFn: async (instructorId: string) => {
      const { data, error } = await supabase.rpc(
        'create_instructor_invitation',
        { _instructor_id: instructorId },
      )
      if (error) throw error
      return data as unknown as { id: string; token: string }
    },
  })
}
