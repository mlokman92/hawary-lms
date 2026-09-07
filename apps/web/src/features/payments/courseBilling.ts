import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TKey } from '@/lib/i18n'

/**
 * A course's billing roster: who has paid, who has not finished paying, and
 * who has never been invoiced at all.
 *
 * The third question is why this exists and why it could not be a filter on
 * `/payments`. Both money screens read `invoices`, so a student nobody has
 * billed has no row on either — they are not "missing from a list", they are
 * absent from the book the list is drawn from. Only `enrollments` knows they
 * are on the course, so `course_billing_roster` starts there and joins the
 * invoices onto it.
 *
 * There is no date window here, unlike every other report hook in this folder.
 * "Not yet billed" is a state rather than a period, and any window would filter
 * out exactly the students being looked for.
 */

/** Where a student stands on one course. The RPC's own vocabulary. */
export const PAY_STATUSES = [
  'uninvoiced',
  'unpaid',
  'partial',
  'paid',
] as const
export type PayStatus = (typeof PAY_STATUSES)[number]

/**
 * Copy for each state, in the drill's own order — never invoiced first,
 * because that is the row that exists nowhere else in the app.
 */
export const PAY_STATUS_LABEL: Record<PayStatus, TKey> = {
  uninvoiced: 'courses.billing.status.uninvoiced',
  unpaid: 'courses.billing.status.unpaid',
  partial: 'courses.billing.status.partial',
  paid: 'courses.billing.status.paid',
}

/** A hand-edited query string must not reach the RPC as an unknown state. */
export function readPayStatus(raw: string | null): PayStatus | null {
  return PAY_STATUSES.includes(raw as PayStatus) ? (raw as PayStatus) : null
}

/** One course, rolled up. Also the totals line for the roster beneath it. */
export type CourseBillingSummary = {
  courseId: string
  courseTitle: string
  courseCode: string | null
  studentCount: number
  uninvoicedCount: number
  unpaidCount: number
  partialCount: number
  paidCount: number
  billedSen: number
  paidSen: number
  outstandingSen: number
}

/** One enrolled student, with their standing on this course. */
export type CourseBillingRow = {
  student_id: string
  full_name: string | null
  student_no: string
  email: string | null
  phone: string | null
  invoice_count: number
  billed_sen: number
  paid_sen: number
  outstanding_sen: number
  pay_status: PayStatus
  last_invoice_id: string | null
  last_invoice_no: string | null
  due_at: string | null
  total_count: number
}

/** Rows per page, matching the rest of the money section. */
export const ROSTER_PAGE_SIZE = 50

type SummaryRpcRow = {
  course_id: string
  course_title: string
  course_code: string | null
  student_count: number
  uninvoiced_count: number
  unpaid_count: number
  partial_count: number
  paid_count: number
  billed_sen: number
  paid_sen: number
  outstanding_sen: number
}

function toSummary(r: SummaryRpcRow): CourseBillingSummary {
  return {
    courseId: r.course_id,
    courseTitle: r.course_title,
    courseCode: r.course_code,
    studentCount: Number(r.student_count),
    uninvoicedCount: Number(r.uninvoiced_count),
    unpaidCount: Number(r.unpaid_count),
    partialCount: Number(r.partial_count),
    paidCount: Number(r.paid_count),
    billedSen: Number(r.billed_sen),
    paidSen: Number(r.paid_sen),
    outstandingSen: Number(r.outstanding_sen),
  }
}

/**
 * The whole course's standing — the four counts and the three money figures.
 *
 * Deliberately not derived from the rows on screen: the roster is paged and
 * filtered, and "9 students have never been invoiced" is a fact about the
 * course rather than about the 50 rows in front of you. Same split the rest of
 * the section makes between `payment_log_page` and `payment_log_totals`.
 *
 * Returns null rather than throwing when the course has no live enrolments —
 * `course_billing_summary` groups over the roster, so a course nobody is on
 * has no row at all, and that is a real state the page has to render.
 */
export function useCourseBillingSummary(
  academyId: string | null,
  courseId: string | undefined,
) {
  return useQuery({
    queryKey: ['course-billing-summary', academyId, courseId] as const,
    enabled: !!academyId && !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('course_billing_summary', {
        _academy: academyId!,
        _course: courseId!,
      })
      if (error) throw error
      const row = (data as unknown as SummaryRpcRow[] | null)?.[0]
      return row ? toSummary(row) : null
    },
  })
}

/**
 * One page of the roster.
 *
 * `keepPreviousData` for the same reason the ledger uses it: without it a page
 * turn or a filter change blanks the table through the empty state and back,
 * which on a money screen reads as "there is nothing here" at the moment there
 * is.
 */
export function useCourseBillingRoster(
  academyId: string | null,
  courseId: string | undefined,
  status: PayStatus | null,
  search: string,
  page: number,
) {
  return useQuery({
    queryKey: [
      'course-billing-roster',
      academyId,
      courseId,
      status ?? '',
      search,
      page,
    ] as const,
    enabled: !!academyId && !!courseId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('course_billing_roster', {
        _academy: academyId!,
        _course: courseId!,
        ...(status ? { _status: status } : {}),
        ...(search.trim() ? { _search: search.trim() } : {}),
        _limit: ROSTER_PAGE_SIZE,
        _offset: (page - 1) * ROSTER_PAGE_SIZE,
      })
      if (error) throw error
      const rows = (data ?? []) as unknown as CourseBillingRow[]
      return {
        rows,
        // The filtered count, for the pager. Zero rows means zero matches, and
        // the window function has nowhere to report that from.
        total: Number(rows[0]?.total_count ?? 0),
      }
    },
  })
}

/** One request's worth of rows when sweeping the whole roster. */
const CHUNK = 200

/**
 * Every row in the current filter, not the page on screen.
 *
 * Two callers, and both would be wrong with 50 rows: the CSV export (a chase
 * list that stops at row 50 leaves debts uncollected) and the "invoice the
 * un-billed" action, which has to hand the invoice dialog all 94 students on a
 * fresh intake rather than the first page of them.
 *
 * Bounded by the count the query already reported, so a roster that grows
 * mid-sweep cannot turn this into an unbounded loop.
 */
export async function fetchCourseRosterAll(
  academyId: string,
  courseId: string,
  status: PayStatus | null,
  search: string,
  total: number,
): Promise<CourseBillingRow[]> {
  const rows: CourseBillingRow[] = []
  while (rows.length < total) {
    const { data, error } = await supabase.rpc('course_billing_roster', {
      _academy: academyId,
      _course: courseId,
      ...(status ? { _status: status } : {}),
      ...(search.trim() ? { _search: search.trim() } : {}),
      _limit: CHUNK,
      _offset: rows.length,
    })
    if (error) throw error
    const chunk = (data ?? []) as unknown as CourseBillingRow[]
    if (chunk.length === 0) break
    rows.push(...chunk)
  }
  return rows
}
