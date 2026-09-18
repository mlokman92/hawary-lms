import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { Enums, Tables } from '@hawary/shared'
import { supabase } from '@/lib/supabase'
import { translate, type TKey } from '@/lib/i18n'
import type { Tone } from '@/lib/tone'

/**
 * Report checks — the data layer for both surfaces.
 *
 * Writes go through four RPCs and never through PostgREST: clients have no DML
 * on any of the three tables, because assignment has to be fair and a status
 * change has to be the same statement as the timeline entry and the
 * notification that reports it. Reads split: the staff queue is a plain select
 * (staff can read `students` and `courses`), but a single thread is an RPC,
 * because it carries the checker's name and a student cannot read `instructors`
 * at all — the same reason `get_my_appointments` exists.
 * Full note: docs/report-checks.md
 */

export type ReportSubmission = Tables<'report_submissions'>
export type ReportStatus = Enums<'report_status'>
export type ReportEventKind = Enums<'report_event_kind'>

/**
 * Two of these wait on the checker, one waits on the student, one is finished.
 * That split is the only thing the queue's tiles and both dashboards sort on,
 * so it is stated once here rather than re-derived at each call site.
 */
export const REPORT_STATUS: Record<
  ReportStatus,
  { labelKey: TKey; tone: Tone }
> = {
  submitted: { labelKey: 'report.status.submitted', tone: 'info' },
  in_review: { labelKey: 'report.status.in_review', tone: 'warning' },
  changes_requested: {
    labelKey: 'report.status.changes_requested',
    tone: 'danger',
  },
  approved: { labelKey: 'report.status.approved', tone: 'positive' },
}

/** Waiting on whoever checks it. The trainer dashboard's whole question. */
export const AWAITING_CHECKER: ReportStatus[] = ['submitted', 'in_review']

/** The verdicts a checker may set. `submitted` is not one — only an upload
 *  puts a report back into that state, and only the student can upload. */
export const VERDICTS: ReportStatus[] = [
  'in_review',
  'changes_requested',
  'approved',
]

export type ReportRow = ReportSubmission & {
  students: {
    id: string
    full_name: string | null
    student_no: string | null
    email: string | null
  } | null
  courses: { id: string; title: string; code: string | null } | null
  instructors: { id: string; full_name: string | null } | null
}

/** One entry in the thread. Shaped by `get_report`, not by the table. */
export type ReportEvent = {
  id: string
  kind: ReportEventKind
  body: string | null
  to_status: ReportStatus | null
  version: number | null
  actor_id: string | null
  actor_name: string | null
  actor_role: 'student' | 'instructor' | 'admin' | 'system'
  created_at: string
  files: ReportFile[]
}

export type ReportFile = {
  id: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
}

/** The whole thread, as `get_report` projects it. */
export type ReportThread = {
  id: string
  academy_id: string
  title: string
  status: ReportStatus
  version: number
  auto_assigned: boolean
  submitted_at: string
  reviewed_at: string | null
  approved_at: string | null
  /** What the reader may do, decided by the server so it cannot drift. */
  my_role: 'student' | 'instructor' | 'admin'
  student: {
    id: string
    full_name: string | null
    student_no: string | null
    email: string | null
    phone: string | null
  }
  course: { id: string; title: string; code: string | null }
  instructor: {
    id: string
    full_name: string | null
    avatar_url: string | null
    email: string | null
  } | null
  events: ReportEvent[]
}

/** One row of the learner's list: a course, and its report if there is one. */
export type MyReportRow = {
  course_id: string
  course_title: string
  course_code: string | null
  report: {
    id: string
    title: string
    status: ReportStatus
    version: number
    submitted_at: string
    reviewed_at: string | null
    instructor_name: string | null
    last_at: string
  } | null
}

export type MyReports = { is_open: boolean; courses: MyReportRow[] }

/** A file that has been uploaded but not yet attached to a thread. */
export type PendingFile = {
  path: string
  name: string
  mime: string
  size: number
}

export const REPORT_PAGE_SIZE = 50

export type ReportFilters = {
  status: ReportStatus | 'all'
  /** Matched against the student's name, through an inner embed. */
  search: string
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const queueKey = (a: string | null, f: ReportFilters, page: number) =>
  ['reports', a, 'queue', f.status, f.search, page] as const
const countsKey = (a: string | null) => ['reports', a, 'counts'] as const
const threadKey = (id: string | null) => ['report', id] as const
const mineKey = (a: string | null) => ['reports', a, 'mine'] as const
const poolKey = (a: string | null) => ['report-pool', a] as const

/**
 * One place a report write invalidates everything that counts reports. Six
 * lists read the same rows, and a comment that moves a status has to move the
 * tile above it, the queue behind it and both dashboards.
 */
function invalidateReports(
  qc: ReturnType<typeof useQueryClient>,
  academyId: string | null,
  reportId?: string | null,
) {
  void qc.invalidateQueries({ queryKey: ['reports', academyId] })
  if (reportId) void qc.invalidateQueries({ queryKey: threadKey(reportId) })
}

// ---------------------------------------------------------------------------
// Staff — the queue
// ---------------------------------------------------------------------------

/**
 * Paged on the server from the start rather than when it hurts. One report per
 * (student, course) means this table's ceiling is the enrolment count — already
 * 677 here — and PostgREST silently caps a request at the project maximum, so a
 * queue that stops at row 1000 would be a queue that lies.
 *
 * `id` is the final tie-break on every ordering: reports genuinely share a
 * `submitted_at` (a whole cohort uploads the night before a deadline), and
 * OFFSET paging over a non-unique sort repeats one row and skips another.
 */
export function useReportQueue(
  academyId: string | null,
  filters: ReportFilters,
  page: number,
) {
  return useQuery({
    queryKey: queueKey(academyId, filters, page),
    enabled: !!academyId,
    // Without this a page turn blanks the table through the empty state and
    // back, which reads as an error rather than as a page turn.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = page * REPORT_PAGE_SIZE
      const search = filters.search.trim()

      // `!inner` on students so the name filter can be expressed at all —
      // PostgREST cannot filter on a left-joined embed. Reports always have a
      // student, so the inner join changes no result.
      let q = supabase
        .from('report_submissions')
        .select(
          `*,
           students!inner(id, full_name, student_no, email),
           courses(id, title, code),
           instructors(id, full_name)`,
          { count: 'exact' },
        )
        .eq('academy_id', academyId!)

      if (filters.status !== 'all') q = q.eq('status', filters.status)
      if (search) q = q.ilike('students.full_name', `%${search}%`)

      const { data, error, count } = await q
        // Oldest first: a queue is answered from the top, and the report that
        // has waited longest is the one that has waited longest.
        .order('submitted_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + REPORT_PAGE_SIZE - 1)

      if (error) throw error
      return {
        rows: (data ?? []) as unknown as ReportRow[],
        total: count ?? 0,
      }
    },
  })
}

/**
 * The four tiles. Their own call, because a page of 50 cannot answer "how many
 * are waiting" and a tile derived from the page would answer a different
 * question than the one it is labelled with.
 */
export function useReportCounts(academyId: string | null) {
  return useQuery({
    queryKey: countsKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_counts', {
        _academy_id: academyId!,
      })
      if (error) throw error
      const out: Record<ReportStatus, number> = {
        submitted: 0,
        in_review: 0,
        changes_requested: 0,
        approved: 0,
      }
      const rows = (data ?? []) as unknown as {
        status: ReportStatus
        n: number
      }[]
      for (const r of rows) {
        out[r.status] = Number(r.n)
      }
      return out
    },
  })
}

/**
 * What is waiting on this trainer, for their dashboard. A display narrowing,
 * not a boundary — RLS already limits a trainer to the reports assigned to
 * them; this narrows an admin's academy-wide view to their own desk.
 */
export function useMyReportQueue(
  academyId: string | null,
  instructorId: string | null,
  limit = 5,
) {
  return useQuery({
    queryKey: ['reports', academyId, 'mine-to-check', instructorId, limit] as const,
    enabled: !!academyId && !!instructorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_submissions')
        .select(
          `*,
           students(id, full_name, student_no, email),
           courses(id, title, code),
           instructors(id, full_name)`,
        )
        .eq('academy_id', academyId!)
        .eq('instructor_id', instructorId!)
        .in('status', AWAITING_CHECKER)
        .order('submitted_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as unknown as ReportRow[]
    },
  })
}

// ---------------------------------------------------------------------------
// The thread — both surfaces
// ---------------------------------------------------------------------------

export function useReport(reportId: string | null) {
  return useQuery({
    queryKey: threadKey(reportId),
    enabled: !!reportId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_report', {
        _report_id: reportId!,
      })
      if (error) throw error
      return data as unknown as ReportThread
    },
  })
}

// ---------------------------------------------------------------------------
// Learner
// ---------------------------------------------------------------------------

/**
 * Keyed on enrolments, not on reports: a course with nothing submitted is a row
 * with a Submit button, not an absence the student has to interpret.
 * `is_open` is false when the academy has nobody in the checking rota — the
 * pool IS the switch, so there is no setting to read.
 */
export function useMyReports(academyId: string | null) {
  return useQuery({
    queryKey: mineKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_reports', {
        _academy_id: academyId!,
      })
      if (error) throw error
      return data as unknown as MyReports
    },
  })
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

type UploadResponse = {
  ok?: boolean
  path?: string
  file_name?: string
  mime_type?: string
  size_bytes?: number
  error?: string
  code?: string
}

/**
 * Upload one document into the private `student-reports` bucket and get back
 * what `submit_report` needs. The path is not a grant: it is checked against
 * the caller's own upload prefix again inside the RPC.
 *
 * A student's own upload is the reason `upload-media` grew a member branch —
 * every other bucket it serves is staff-only.
 */
export async function uploadReportFile(
  academyId: string,
  file: File,
): Promise<PendingFile> {
  const body = new FormData()
  body.append('file', file)
  body.append('bucket', 'student-reports')
  body.append('academy_id', academyId)

  const { data, error } = await supabase.functions.invoke<UploadResponse>(
    'upload-media',
    { body },
  )
  if (error) {
    // FunctionsHttpError keeps the JSON body on `context`; surface the real
    // reason (unsupported type, too large, wrong account) not "failed".
    const ctx = (error as { context?: Response }).context
    const detail = ctx?.json
      ? ((await ctx.json().catch(() => null)) as UploadResponse | null)
      : null
    throw new Error(detail?.error ?? translate('upload.failed'))
  }
  if (!data?.path) throw new Error(data?.error ?? translate('upload.failed'))

  return {
    path: data.path,
    name: data.file_name ?? file.name,
    mime: data.mime_type ?? file.type,
    size: data.size_bytes ?? file.size,
  }
}

/**
 * A short-lived signed URL for one file on a thread.
 *
 * Minted per click rather than held on the row: the URL is the only thing
 * between a private bucket and the open internet, and this bucket holds
 * somebody's unfinished coursework, so it is worth nothing 60 seconds later.
 */
export async function reportFileUrl(
  fileId: string,
  download = false,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{
    url?: string
    error?: string
  }>('report-url', { body: { file_id: fileId, download } })
  if (error) throw error
  if (!data?.url) throw new Error(data?.error ?? translate('report.no_url'))
  return data.url
}

// ---------------------------------------------------------------------------
// Writes — and the email that follows each one
// ---------------------------------------------------------------------------

/**
 * Every write is followed by a second call to `send-report-notice`, which is
 * told the report and the EVENT and works out the rest for itself. Its failure
 * is never thrown: the row has already committed, and the in-app notification
 * went out in the same transaction as it, so a missing email is a missing
 * email, not a missing comment.
 */
async function notify(reportId: string, eventId: string | null) {
  if (!eventId) return
  try {
    await supabase.functions.invoke('send-report-notice', {
      body: {
        report_id: reportId,
        event_id: eventId,
        origin: window.location.origin,
      },
    })
  } catch {
    // Deliberately silent. See above.
  }
}

/**
 * Submit, or submit again. The same RPC either way: a resubmission is not a new
 * thread, it is the next version of one, and the checker who asked for the
 * changes is the person who should see them.
 */
export function useSubmitReport(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      courseId: string
      title: string
      files: PendingFile[]
    }) => {
      const { data, error } = await supabase.rpc('submit_report', {
        _academy_id: academyId!,
        _course_id: input.courseId,
        _title: input.title,
        _files: input.files,
      })
      if (error) throw error
      const res = data as unknown as {
        id: string
        version: number
        is_new: boolean
      }
      // The submitted event is the last one on the thread; read it back rather
      // than have the RPC return a second id it does not otherwise need.
      const { data: ev } = await supabase
        .from('report_events')
        .select('id')
        .eq('report_id', res.id)
        .eq('kind', 'submitted')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      await notify(res.id, ev?.id ?? null)
      return res
    },
    onSuccess: (res) => invalidateReports(qc, academyId, res.id),
  })
}

/**
 * Say something, and optionally decide something. One call, because "please fix
 * section 3" and "changes requested" are one act by the person doing them.
 * A student's `toStatus` is dropped by the server, not hidden by the client —
 * but the client does not offer it either.
 */
export function useCommentOnReport(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      reportId: string
      body: string
      toStatus?: ReportStatus | null
      files?: PendingFile[]
    }) => {
      const { data, error } = await supabase.rpc('comment_on_report', {
        _report_id: input.reportId,
        _body: input.body,
        _to_status: input.toStatus ?? undefined,
        _files: input.files?.length ? input.files : undefined,
      })
      if (error) throw error
      const res = data as unknown as { id: string; status: ReportStatus }
      await notify(input.reportId, res.id)
      return res
    },
    onSuccess: (_res, input) =>
      invalidateReports(qc, academyId, input.reportId),
  })
}

/**
 * Hand a report to somebody else. `instructorId` null means the rota decides,
 * excluding whoever holds it now — reassigning a report to its current holder
 * is not a handover, and the server says so.
 */
export function useReassignReport(academyId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      reportId: string
      instructorId?: string | null
    }) => {
      const { data, error } = await supabase.rpc('reassign_report', {
        _report_id: input.reportId,
        _instructor_id: input.instructorId ?? undefined,
      })
      if (error) throw error
      const res = data as unknown as { id: string; instructor_id: string }
      const { data: ev } = await supabase
        .from('report_events')
        .select('id')
        .eq('report_id', input.reportId)
        .eq('kind', 'assigned')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      await notify(input.reportId, ev?.id ?? null)
      return res
    },
    onSuccess: (_res, input) =>
      invalidateReports(qc, academyId, input.reportId),
  })
}

// ---------------------------------------------------------------------------
// The pool — who checks reports
// ---------------------------------------------------------------------------

export type ReportChecker = {
  id: string
  full_name: string | null
  status: string
  is_report_checker: boolean
}

export function useReportPool(academyId: string | null) {
  return useQuery({
    queryKey: poolKey(academyId),
    enabled: !!academyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instructors')
        .select('id, full_name, status, is_report_checker')
        .eq('academy_id', academyId!)
        .is('archived_at', null)
        .order('full_name')
      if (error) throw error
      return (data ?? []) as ReportChecker[]
    },
  })
}

/** Optimistic: a switch that waits for a round trip before moving reads as
 *  broken. Same treatment as `useSetInstructorBookable`. */
export function useSetReportChecker(academyId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; is_report_checker: boolean }) => {
      const { error } = await supabase
        .from('instructors')
        .update({ is_report_checker: input.is_report_checker })
        .eq('id', input.id)
      if (error) throw error
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: poolKey(academyId) })
      const previous = qc.getQueryData<ReportChecker[]>(poolKey(academyId))
      qc.setQueryData<ReportChecker[]>(poolKey(academyId), (rows) =>
        (rows ?? []).map((r) =>
          r.id === input.id
            ? { ...r, is_report_checker: input.is_report_checker }
            : r,
        ),
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(poolKey(academyId), ctx.previous)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: poolKey(academyId) })
      void qc.invalidateQueries({ queryKey: ['instructors', academyId] })
    },
  })
}
