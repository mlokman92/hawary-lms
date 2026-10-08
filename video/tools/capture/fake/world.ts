// Look-ups into the world base.ts builds, for partitions that would rather
// say "Aina Sofea Rosli" than remember she is HA-2026-0319.

import type { FakeDb, RowOf } from './db'
import { ID, enrollmentId, invoiceId, studentId } from './ids.js'

export { TRAINERS, courseOfStudent, invoiceSeqOfStudent, LAST_ENROLLED, STUDENT_COUNT, type TrainerKey } from './db/base'

import { courseOfStudent, invoiceSeqOfStudent } from './db/base'

/** A student row by full name or by the number in their student_no. Throws on a miss. */
export function student(db: FakeDb, who: string | number): RowOf<'students'> {
  return typeof who === 'number' ? db.get('students', studentId(who)) : db.get('students', { full_name: who })
}

/** 318 for HA-2026-0318. */
export function numberOf(row: { student_no: string }): number {
  return Number(row.student_no.slice(-4))
}

/** An instructor row by full name. Throws on a miss. */
export function instructor(db: FakeDb, name: string): RowOf<'instructors'> {
  return db.get('instructors', { full_name: name })
}

/** The one invoice of an enrolled student. */
export function invoiceOf(db: FakeDb, who: string | number): RowOf<'invoices'> {
  const n = typeof who === 'number' ? who : numberOf(student(db, who))
  return db.get('invoices', invoiceId(invoiceSeqOfStudent(n)))
}

/** The one enrolment of an enrolled student. */
export function enrollmentOf(db: FakeDb, who: string | number): RowOf<'enrollments'> {
  const n = typeof who === 'number' ? who : numberOf(student(db, who))
  return db.get('enrollments', enrollmentId(n))
}

/** The student numbers enrolled in a course, in student_no order. */
export function roster(course: 'siri1' | 'siri2' | 'siri3'): number[] {
  const out: number[] = []
  for (let n = 1; n <= 796; n++) if (courseOfStudent(n) === course) out.push(n)
  return out
}

/** The cast's sixteen named students (HA-2026-0318 … 0333), all in Siri 3. */
export const CAST_STUDENT_NUMBERS: number[] = Array.from({ length: 16 }, (_x, i) => 318 + i)

export const HERO = ID.hero
