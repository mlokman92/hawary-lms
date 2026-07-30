import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type SearchHit = {
  kind: 'student' | 'instructor'
  id: string
  name: string | null
  /** student_no / instructor_no — what staff quote to each other. */
  no: string
  email: string | null
  phone: string | null
  /** Where selecting this hit goes. */
  to: string
}

/** Per kind. Deliberately small: this is a jump-to, not a report. */
export const SEARCH_LIMIT = 6

/** Below this the result set is everyone, which is not an answer. */
export const MIN_QUERY = 2

/**
 * PostgREST parses `or=(…)` itself, so a comma, bracket or quote in the term
 * would be read as filter syntax rather than as text. Strip them — none of them
 * appear in a name, an IC or a record number — and use `*` as the wildcard
 * (PostgREST's own alias for `%`), which sidesteps escaping entirely.
 */
function sanitize(query: string): string {
  return query.replace(/[%,()"\\*]/g, ' ').replace(/\s+/g, ' ').trim()
}

function orFilter(term: string, columns: string[]): string {
  return columns.map((c) => `${c}.ilike.*${term}*`).join(',')
}

/**
 * The header search: people in the active academy, by any handle staff might
 * remember them by — name, email, phone, IC or record number.
 *
 * Two queries rather than one view: students and instructors are separate
 * tables with separate RLS, and the results are grouped by kind anyway. Both
 * are academy-scoped in the query *and* by policy, so a stale academy id can
 * only ever return nothing.
 */
export function useGlobalSearch(academyId: string | null, query: string) {
  const term = sanitize(query)
  return useQuery({
    queryKey: ['search', academyId, term] as const,
    enabled: !!academyId && term.length >= MIN_QUERY,
    // Keeping the previous page of results while the next one loads is what
    // stops the panel flickering empty on every keystroke.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const [students, instructors] = await Promise.all([
        supabase
          .from('students')
          .select('id, full_name, student_no, email, phone')
          .eq('academy_id', academyId!)
          .is('archived_at', null)
          .or(
            orFilter(term, [
              'full_name',
              'email',
              'phone',
              'ic_number',
              'student_no',
            ]),
          )
          .order('full_name')
          .limit(SEARCH_LIMIT),
        supabase
          .from('instructors')
          .select('id, full_name, instructor_no, email, phone')
          .eq('academy_id', academyId!)
          .is('archived_at', null)
          .or(
            orFilter(term, [
              'full_name',
              'email',
              'phone',
              'ic_number',
              'instructor_no',
              'specialization',
            ]),
          )
          .order('full_name')
          .limit(SEARCH_LIMIT),
      ])

      if (students.error) throw students.error
      if (instructors.error) throw instructors.error

      const hits: SearchHit[] = [
        ...(students.data ?? []).map((s) => ({
          kind: 'student' as const,
          id: s.id,
          name: s.full_name,
          no: s.student_no,
          email: s.email,
          phone: s.phone,
          to: `/students/${s.id}`,
        })),
        ...(instructors.data ?? []).map((i) => ({
          kind: 'instructor' as const,
          id: i.id,
          name: i.full_name,
          no: i.instructor_no,
          email: i.email,
          phone: i.phone,
          to: `/instructors/${i.id}`,
        })),
      ]
      return hits
    },
  })
}
