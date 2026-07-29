import { useQuery } from '@tanstack/react-query'
import type { Enums } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import type { Lang } from '@/lib/i18n'
import { localeFor } from '@/lib/format'
import { countOf, type CourseRow } from '@/features/courses/api'
import type { InvoiceRow } from '@/features/payments/api'

/**
 * Dashboard data layer.
 *
 * The page reuses `useStudents` / `useCourses` / `useInvoices` /
 * `useActiveStudentCounts` / `usePaymentSettings` verbatim so it shares a cache
 * with the section pages and cannot drift from them. Only the four queries that
 * nothing else needs live here, plus the pure derivations they feed.
 */

// --- Row shapes (PostgREST embeds; cast the query result to these) -----------

/** One module with a count of its *unpublished* children, per kind. */
export type ModuleReadinessRow = {
  id: string
  course_id: string
  title: string
  is_published: boolean
  draft_notes: { count: number }[]
  draft_assessments: { count: number }[]
  draft_assignments: { count: number }[]
}

/** A live invitation. `student` XOR `instructor` is set — the other is null. */
export type PendingInvitationRow = {
  id: string
  email: string
  role: 'admin' | 'trainer' | 'student'
  expires_at: string
  created_at: string
  student: { full_name: string | null } | null
  instructor: { full_name: string | null } | null
}

export type RecentPaymentRow = {
  id: string
  amount_sen: number
  paid_at: string | null
  method: Enums<'payment_method'>
  invoice: { id: string; invoice_no: string } | null
  student: { id: string; full_name: string | null } | null
}

const readinessKey = (a: string | null) =>
  ['dashboard', 'module-readiness', a] as const
const invitationsKey = (a: string | null) =>
  ['dashboard', 'invitations', a] as const
const activityKey = (a: string | null, since: string) =>
  ['dashboard', 'payment-activity', a, since] as const
const reconKey = (a: string | null) =>
  ['dashboard', 'reconciliation', a] as const

// --- Malaysian month boundaries ---------------------------------------------
// `academies.timezone` is Asia/Kuala_Lumpur (UTC+8, no DST), but the browser's
// zone is whatever the staff member's laptop says. Bucketing on the browser's
// month would push a payment taken at 01:00 on the 1st into the previous month
// for anyone west of MY, so every boundary here is built in MY time.

const MY_OFFSET_MS = 8 * 60 * 60 * 1000

/** Instant of the start of a Malaysian calendar month, `monthsAgo` back. */
export function monthStartIso(monthsAgo = 0): string {
  const my = new Date(Date.now() + MY_OFFSET_MS)
  const startUtc = Date.UTC(my.getUTCFullYear(), my.getUTCMonth() - monthsAgo, 1)
  return new Date(startUtc - MY_OFFSET_MS).toISOString()
}

const MY_MONTH = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur',
  year: 'numeric',
  month: '2-digit',
})

/**
 * Month names for the axis and the tooltip. These are copy, so they follow the
 * UI language — unlike `MY_MONTH` above, which is a bucket identity and must
 * stay a fixed numeric format in every language.
 */
function monthNames(lang: Lang) {
  const locale = localeFor(lang)
  return {
    short: new Intl.DateTimeFormat(locale, {
      timeZone: 'Asia/Kuala_Lumpur',
      month: 'short',
    }),
    long: new Intl.DateTimeFormat(locale, {
      timeZone: 'Asia/Kuala_Lumpur',
      month: 'long',
      year: 'numeric',
    }),
  }
}

/** "2026-07" for an instant, as seen from Malaysia. */
export const monthKeyMY = (iso: string) => MY_MONTH.format(new Date(iso))

/** How many months the revenue chart covers, current month included. */
export const REVENUE_MONTHS = 6

/** Sum of settled payments that landed in a given Malaysian month. */
export function collectedInMonth(
  rows: RecentPaymentRow[],
  monthsAgo: number,
): number {
  const key = monthKeyMY(monthStartIso(monthsAgo))
  return rows.reduce(
    (sum, p) =>
      p.paid_at && monthKeyMY(p.paid_at) === key ? sum + p.amount_sen : sum,
    0,
  )
}

// --- Revenue series ---------------------------------------------------------

export type RevenuePoint = {
  /** "2026-07" — the bucket identity, language-independent. */
  key: string
  /** "Jul" / "Jul" — the axis tick, in the UI language. */
  label: string
  /** "July 2026" / "Julai 2026" — the tooltip heading, in the UI language. */
  full: string
  invoiced: number
  collected: number
}

/**
 * Billed vs actually banked, per Malaysian calendar month.
 *
 * The two series come from different books on purpose: `invoiced` is what was
 * put on paper (invoices, dated by `issued_at`), `collected` is what arrived
 * (the payments ledger, dated by `paid_at`). The gap between them is the whole
 * point of the chart, so they must not be derived from one another.
 *
 * Months with no activity are kept as explicit zeroes — a gap in a time axis
 * reads as missing data rather than a quiet month.
 *
 * `lang` is taken as an argument rather than read from the i18n module: the
 * caller memoises the result, so the language has to be visible to it as a
 * dependency or the axis would keep last language's month names.
 */
export function revenueSeries(
  payments: RecentPaymentRow[],
  invoices: InvoiceRow[],
  lang: Lang,
  months = REVENUE_MONTHS,
): RevenuePoint[] {
  const points: RevenuePoint[] = []
  const byKey = new Map<string, RevenuePoint>()
  const month = monthNames(lang)

  for (let i = months - 1; i >= 0; i--) {
    const startIso = monthStartIso(i)
    const start = new Date(startIso)
    const point: RevenuePoint = {
      key: monthKeyMY(startIso),
      label: month.short.format(start),
      full: month.long.format(start),
      invoiced: 0,
      collected: 0,
    }
    points.push(point)
    byKey.set(point.key, point)
  }

  for (const inv of invoices) {
    if (EXCLUDED.includes(inv.status)) continue
    // A draft that was later issued carries issued_at; fall back to created_at
    // so an invoice never silently drops out of the chart.
    const bucket = byKey.get(monthKeyMY(inv.issued_at ?? inv.created_at))
    if (bucket) bucket.invoiced += inv.total_sen
  }

  for (const pay of payments) {
    if (!pay.paid_at) continue
    const bucket = byKey.get(monthKeyMY(pay.paid_at))
    if (bucket) bucket.collected += pay.amount_sen
  }

  return points
}

// --- Invoice money ----------------------------------------------------------

export type OverdueRow = InvoiceRow & {
  balanceSen: number
  daysOverdue: number | null
}

export type InvoiceStats = {
  invoiced: number
  paid: number
  outstanding: number
  notYetDue: number
  overdue: number
  overdueCount: number
  oldestOverdueDays: number | null
  overdueRows: OverdueRow[]
}

// Not real receivables — they must stay out of every money total.
const EXCLUDED: Enums<'invoice_status'>[] = ['draft', 'void', 'cancelled']

/**
 * Every invoice figure the page shows, in one pass.
 *
 * `status = 'overdue'` is a dead enum value — nothing ever sets it (no trigger,
 * pg_cron is not installed), so overdue has to be derived from `due_at`. The
 * status arm is kept for parity with PaymentsPage in case that ever changes.
 */
export function invoiceStats(invoices: InvoiceRow[]): InvoiceStats {
  const now = Date.now()
  let invoiced = 0
  let paid = 0
  let overdue = 0
  const overdueRows: OverdueRow[] = []

  for (const inv of invoices) {
    if (EXCLUDED.includes(inv.status)) continue
    invoiced += inv.total_sen
    // Overpayment is allowed (record_gateway_payment leaves amount_paid_sen
    // above total_sen), so clamp both sides: unclamped, one student's credit
    // silently erases another's debt and the meter runs past 100%.
    paid += Math.min(inv.amount_paid_sen, inv.total_sen)

    const balance = Math.max(0, inv.total_sen - inv.amount_paid_sen)
    if (balance === 0) continue
    const due = inv.due_at ? Date.parse(inv.due_at) : NaN
    const isOverdue =
      inv.status === 'overdue' || (Number.isFinite(due) && due < now)
    if (!isOverdue) continue

    overdue += balance
    overdueRows.push({
      ...inv,
      balanceSen: balance,
      // Null when a row is overdue by status alone — it has no due date to
      // measure from, so the table renders an em dash rather than NaN.
      daysOverdue: Number.isFinite(due)
        ? Math.floor((now - due) / 86_400_000)
        : null,
    })
  }

  // Oldest debt first: that is the one that goes bad.
  overdueRows.sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'))
  const outstanding = Math.max(0, invoiced - paid)

  return {
    invoiced,
    paid,
    outstanding,
    notYetDue: Math.max(0, outstanding - overdue),
    overdue,
    overdueCount: overdueRows.length,
    oldestOverdueDays: overdueRows.reduce<number | null>(
      (max, r) => (r.daysOverdue !== null && r.daysOverdue > (max ?? -1) ? r.daysOverdue : max),
      null,
    ),
    overdueRows,
  }
}

// --- Content readiness ------------------------------------------------------

export type CourseReadiness = { live: number; total: number; drafts: number }

export type ContentReadiness = {
  /** Modules + items still in draft, counted only inside published courses. */
  notLiveCount: number
  modulesLive: number
  modulesTotal: number
  byCourse: Map<string, CourseReadiness>
}

/**
 * What students can and cannot see yet.
 *
 * Only published courses contribute to `notLiveCount`: a draft course is
 * *meant* to be invisible, so counting its unpublished modules as a problem
 * would nag about work in progress.
 */
export function contentReadiness(
  modules: ModuleReadinessRow[],
  courses: CourseRow[],
): ContentReadiness {
  const publishedIds = new Set(
    courses.filter((c) => c.status === 'published').map((c) => c.id),
  )
  const byCourse = new Map<string, CourseReadiness>()
  let modulesLive = 0
  let notLiveCount = 0

  for (const m of modules) {
    const drafts =
      countOf(m.draft_notes) +
      countOf(m.draft_assessments) +
      countOf(m.draft_assignments)
    const entry = byCourse.get(m.course_id) ?? { live: 0, total: 0, drafts: 0 }
    entry.total += 1
    entry.drafts += drafts
    if (m.is_published) {
      entry.live += 1
      modulesLive += 1
    }
    byCourse.set(m.course_id, entry)

    if (!publishedIds.has(m.course_id)) continue
    if (!m.is_published) notLiveCount += 1
    notLiveCount += drafts
  }

  return {
    notLiveCount,
    modulesLive,
    modulesTotal: modules.length,
    byCourse,
  }
}

// --- Queries ----------------------------------------------------------------

/**
 * Every module with a count of its unpublished children.
 *
 * The aliased embed filters (`draft_notes.is_published=eq.false`) narrow only
 * the embedded rows — without `!inner` the parent list stays complete, so a
 * fully published module still comes back, with zeroes. One round trip instead
 * of four.
 */
export function useModuleReadiness(academyId: string | null) {
  return useQuery({
    queryKey: readinessKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_modules')
        .select(
          'id, course_id, title, is_published, draft_notes:notes(count), draft_assessments:assessments(count), draft_assignments:assignments(count)',
        )
        .eq('academy_id', academyId!)
        .eq('draft_notes.is_published', false)
        .eq('draft_assessments.is_published', false)
        .eq('draft_assignments.is_published', false)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as ModuleReadinessRow[]
    },
  })
}

/**
 * Invitations still worth chasing.
 *
 * The `expires_at` filter is load-bearing: nothing expires invitations in the
 * background — `accept_invitation` flips the status only when someone tries to
 * accept — so a bare `status = 'pending'` also counts dead 14-day-old invites.
 */
export function usePendingInvitations(academyId: string | null) {
  return useQuery({
    queryKey: invitationsKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academy_invitations')
        .select(
          'id, email, role, expires_at, created_at, student:students(full_name), instructor:instructors(full_name)',
        )
        .eq('academy_id', academyId!)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return (data ?? []) as unknown as PendingInvitationRow[]
    },
  })
}

/**
 * Settled payments over the chart window — the ledger, not invoice balances.
 *
 * One bounded request serves four things: the revenue chart's `collected`
 * series, the "Collected this month" tile, its month-on-month delta and the
 * recent-payments list. `invoices.amount_paid_sen` cannot do this job: it
 * carries no paid-on date and refunds never decrement it.
 */
export function usePaymentActivity(academyId: string | null) {
  const since = monthStartIso(REVENUE_MONTHS - 1)
  return useQuery({
    queryKey: activityKey(academyId, since),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(
          'id, amount_sen, paid_at, method, invoice:invoices(id, invoice_no), student:students(id, full_name)',
        )
        .eq('academy_id', academyId!)
        .eq('status', 'succeeded')
        .gte('paid_at', since)
        // paid_at is nullable and PostgREST sorts nulls first, which would
        // float an unsettled row to the top of "recent".
        .order('paid_at', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as unknown as RecentPaymentRow[]
    },
  })
}

/**
 * Gateway payments that landed with an amount mismatch or on a voided invoice.
 * Admin-only work (resolving one means recording or voiding money), so the page
 * passes `null` for a trainer and the request never fires.
 */
export function useReconciliationCount(academyId: string | null) {
  return useQuery({
    queryKey: reconKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('payment_intents')
        .select('id', { count: 'exact', head: true })
        .eq('academy_id', academyId!)
        .eq('needs_reconciliation', true)
      if (error) throw error
      return count ?? 0
    },
  })
}
