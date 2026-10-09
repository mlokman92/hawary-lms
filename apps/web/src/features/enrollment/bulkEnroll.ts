import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { parseCsv } from '@/lib/csv'

/**
 * Bulk enrolment by email address.
 *
 * Deliberately matches against `students` and nothing else: enrolling is adding
 * a RECORD to a course, and there is no record to add for an address the
 * academy has never seen. Those rows are reported, not invented — creating a
 * student from a bare email is what the Students page and the CSV importer are
 * for, and the public enrollment page is what a stranger should be sent to.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Header names an email column may carry, in English and Malay. */
const EMAIL_HEADER_RE = /^\s*"?(e-?mail|e-?mel|emel|alamat e-?mel)"?\s*$/i

export type ParsedEmails = { emails: string[]; invalid: string[] }

/**
 * Accepts both shapes people actually have: a pasted column of addresses, and a
 * spreadsheet export with headers. Everything is lowercased and de-duplicated
 * here, so "omit duplicates" is true of the input before any matching happens.
 */
export function parseEmailList(text: string): ParsedEmails {
  const rows = parseCsv(text)
  if (rows.length === 0) return { emails: [], invalid: [] }

  // A header row is only a header if one of its cells names an email column;
  // otherwise the first line is data, and dropping it would silently lose it.
  const header = rows[0]
  const emailCol = header.findIndex((cell) => EMAIL_HEADER_RE.test(cell))
  const cells =
    emailCol >= 0
      ? rows.slice(1).map((r) => r[emailCol] ?? '')
      : rows.flatMap((r) => r)

  const emails: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()

  for (const raw of cells) {
    const value = raw.trim().replace(/^[<]|[>]$/g, '')
    if (!value) continue
    const lower = value.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    if (EMAIL_RE.test(lower)) emails.push(lower)
    else invalid.push(value)
  }

  return { emails, invalid }
}

export type RosterEntry = { id: string; full_name: string | null; email: string | null }

export type EnrollRoster = {
  students: RosterEntry[]
  /** Already on the course and active — nothing to do for these. */
  activeIds: Set<string>
  /**
   * In a *different* course. One student, one course: these cannot be enrolled
   * here until they are removed from where they are, and the database would
   * refuse the whole batch if one were sent.
   */
  elsewhereIds: Set<string>
}

/**
 * The academy roster plus this course's existing enrolments, in two reads.
 *
 * The whole roster rather than an `.in('email', …)` filter: stored addresses
 * keep whatever case they were typed in, and Postgres `in` is case-sensitive —
 * matching in the browser is the only way "Aina@" finds "aina@".
 */
export function useEnrollRoster(
  academyId: string | null,
  courseId: string | undefined,
) {
  return useQuery({
    queryKey: ['enroll-roster', academyId, courseId] as const,
    enabled: !!academyId && !!courseId,
    queryFn: async (): Promise<EnrollRoster> => {
      // Each student comes with their enrolments, so one read answers both
      // "already here" and "already somewhere else".
      const { data, error } = await supabase
        .from('students')
        .select('id, full_name, email, enrollments(course_id, status)')
        .eq('academy_id', academyId!)
        .is('archived_at', null)
      if (error) throw error
      const rows = (data ?? []) as unknown as (RosterEntry & {
        enrollments: { course_id: string; status: string }[]
      })[]

      const activeIds = new Set<string>()
      const elsewhereIds = new Set<string>()
      for (const s of rows)
        for (const e of s.enrollments) {
          if (e.course_id === courseId) {
            if (e.status === 'active') activeIds.add(s.id)
          } else if (e.status !== 'cancelled') {
            // A refused request does not hold a student anywhere.
            elsewhereIds.add(s.id)
          }
        }

      return {
        students: rows.map(({ id, full_name, email }) => ({
          id,
          full_name,
          email,
        })),
        activeIds,
        elsewhereIds,
      }
    },
  })
}

export type Classification = {
  /** Matched exactly one record and not already active on the course. */
  ready: { email: string; student: RosterEntry }[]
  /** Matched a record that is already actively enrolled. */
  already: string[]
  /** Matched a record that is in another course, and so cannot join this one. */
  elsewhere: string[]
  /** No student record in this academy carries this address. */
  unknown: string[]
  /** Two or more records share the address — a shared inbox, most often. */
  ambiguous: string[]
}

export function classifyEmails(
  emails: string[],
  roster: EnrollRoster | undefined,
): Classification {
  const out: Classification = {
    ready: [],
    already: [],
    elsewhere: [],
    unknown: [],
    ambiguous: [],
  }
  if (!roster) return out

  const byEmail = new Map<string, RosterEntry[]>()
  for (const s of roster.students) {
    const key = s.email?.trim().toLowerCase()
    if (!key) continue
    const list = byEmail.get(key)
    if (list) list.push(s)
    else byEmail.set(key, [s])
  }

  for (const email of emails) {
    const matches = byEmail.get(email)
    if (!matches || matches.length === 0) out.unknown.push(email)
    else if (matches.length > 1) out.ambiguous.push(email)
    else if (roster.activeIds.has(matches[0].id)) out.already.push(email)
    else if (roster.elsewhereIds.has(matches[0].id)) out.elsewhere.push(email)
    else out.ready.push({ email, student: matches[0] })
  }

  return out
}

/** Same chunk size as the CSV student importer, for the same reason. */
const CHUNK = 100

export function useBulkEnroll(academyId: string, courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (studentIds: string[]) => {
      let landed = 0
      for (let i = 0; i < studentIds.length; i += CHUNK) {
        const rows = studentIds.slice(i, i + CHUNK).map((student_id) => ({
          academy_id: academyId,
          course_id: courseId,
          student_id,
          status: 'active' as const,
        }))
        // Upsert, not insert: a student who was dropped from this course before
        // is re-activated rather than colliding with the unique index.
        const { error } = await supabase
          .from('enrollments')
          .upsert(rows, { onConflict: 'course_id,student_id' })
        if (error) {
          throw new Error(
            landed > 0 ? `${error.message} (${landed} enrolled first)` : error.message,
          )
        }
        landed += rows.length
      }
      return landed
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['enroll-roster', academyId, courseId] })
      void qc.invalidateQueries({ queryKey: ['course-enrollment-stats', academyId] })
      void qc.invalidateQueries({ queryKey: ['students', academyId] })
      void qc.invalidateQueries({ queryKey: ['courses', academyId] })
    },
  })
}
