import type { Notification } from './api'
import {
  apptData,
  isReportKind,
  moneyData,
  reportData,
  workData,
} from './render'

/**
 * Where the row leads. The words are in `render.ts`, shared with the mobile
 * apps; the route is this surface's own.
 *
 * `role` decides, not the shell the reader happens to be standing in: the
 * notification was addressed to them as a student or as an instructor, and
 * that is the surface where the session lives.
 *
 * An instructor lands on the **register**, not the diary. The diary is one
 * week: a session booked for next month is not on it, so following a
 * notification about one would show a grid with nothing in it and no clue
 * where the session went. The register opens on her own upcoming sessions,
 * soonest first, which is where the row she just read actually is.
 */
export function linkOf(row: Notification): string | null {
  if (isReportKind(row)) {
    // Straight to the thread, on the side the reader was addressed as. Unlike
    // the appointment case there is no windowing problem to route around: a
    // report has an id and a page of its own, whatever its status.
    const d = reportData(row)
    if (!d) return null
    return d.role === 'instructor'
      ? `/lpkc/${d.report_id}`
      : `/learn/reports/${d.report_id}`
  }
  if (row.kind === 'work_marked' || row.kind === 'work_due') {
    const d = workData(row)
    if (!d) return null
    return d.work === 'assessment'
      ? `/learn/assessments/${d.work_id}`
      : `/learn/assignments/${d.work_id}`
  }
  if (row.kind === 'invoice_issued' || row.kind === 'payment_received') {
    const d = moneyData(row)
    return d ? `/learn/billing/${d.invoice_id}` : null
  }
  // Announcements are read in the mobile apps; the web has no page for them,
  // so the row carries the message's first lines and leads nowhere.
  if (row.kind === 'announcement') return null
  const d = apptData(row)
  if (!d) return null
  return d.role === 'instructor' ? '/appointments/list' : '/learn/appointments'
}
