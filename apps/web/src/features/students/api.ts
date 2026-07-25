import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Enums, Tables, TablesInsert, TablesUpdate } from '@hawary/shared'
import { supabase } from '@/lib/supabase'

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

export function studentStats(students: Pick<Student, 'status'>[]) {
  const by = (s: StudentStatus) => students.filter((x) => x.status === s).length
  return {
    total: students.length,
    active: by('active'),
    trial: by('trial'),
    inactive: by('inactive'),
    withdrawn: by('withdrawn'),
    unenrolled: by('unenrolled'),
  }
}
