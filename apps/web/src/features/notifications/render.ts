import { formatMYR } from '@hawary/shared'
import type { TFn } from '@/lib/i18n'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { DEFAULT_TZ } from '@/features/appointments/api'
import { fmtWhen } from '@/features/appointments/calendar'
import { REPORT_STATUS } from '@/features/reports/api'
import type {
  AppointmentBookedData,
  Notification,
  ReportEventData,
} from './api'

/**
 * A notification row as two lines of text.
 *
 * A row arrives as an event (`kind` + `data`), never as a sentence, so the
 * wording is assembled here and follows the reader's language. Pure functions
 * with no component in them, because three surfaces render the same row — the
 * web bell and the notification screen in each mobile app — and they must not
 * each decide what a booking is called.
 *
 * Where a row LEADS is not here: that is a route, and each surface has its own.
 *
 * Adding a kind costs a case in `titleOf` and `detailOf`, a `linkOf` case per
 * surface, one enum value and two dictionary lines.
 */

const REPORT_KINDS = [
  'report_submitted',
  'report_comment',
  'report_status',
  'report_assigned',
] as const

export const isReportKind = (row: Notification): boolean =>
  (REPORT_KINDS as readonly string[]).includes(row.kind)

const APPOINTMENT_KINDS = [
  'appointment_booked',
  'appointment_reassigned',
  'appointment_cancelled',
  'appointment_reminder',
] as const

export const isAppointmentKind = (row: Notification): boolean =>
  (APPOINTMENT_KINDS as readonly string[]).includes(row.kind)

/** `data` for `work_marked` and `work_due`. */
export type WorkData = {
  work: 'assignment' | 'assessment'
  work_id: string
  title: string | null
  course: string | null
  score?: number | null
  out_of?: number | null
  due_at?: string | null
}

/** `data` for `invoice_issued` and `payment_received`. */
export type MoneyData = {
  invoice_id: string
  invoice_no: string | null
  total_sen?: number | null
  amount_sen?: number | null
  due_at?: string | null
}

/** `data` for `announcement`. The message itself lives in `announcements`. */
export type AnnouncementData = {
  announcement_id: string
  title: string | null
  preview: string | null
  course: string | null
  author: string | null
}

export function reportData(row: Notification): ReportEventData | null {
  const d = row.data as Partial<ReportEventData> | null
  return d && typeof d === 'object' && typeof d.report_id === 'string'
    ? (d as ReportEventData)
    : null
}

export function apptData(row: Notification): AppointmentBookedData | null {
  const d = row.data as Partial<AppointmentBookedData> | null
  return d && typeof d === 'object' && typeof d.starts_at === 'string'
    ? (d as AppointmentBookedData)
    : null
}

export function workData(row: Notification): WorkData | null {
  const d = row.data as Partial<WorkData> | null
  return d && typeof d === 'object' && typeof d.work_id === 'string'
    ? (d as WorkData)
    : null
}

export function moneyData(row: Notification): MoneyData | null {
  const d = row.data as Partial<MoneyData> | null
  return d && typeof d === 'object' && typeof d.invoice_id === 'string'
    ? (d as MoneyData)
    : null
}

export function announcementData(row: Notification): AnnouncementData | null {
  const d = row.data as Partial<AnnouncementData> | null
  return d && typeof d === 'object' && typeof d.announcement_id === 'string'
    ? (d as AnnouncementData)
    : null
}

function reportTitle(row: Notification, t: TFn): string {
  const d = reportData(row)
  const name = d?.with_name?.trim() || t('notif.someone')
  const asInstructor = d?.role === 'instructor'
  // The status is rendered through the same map the queue's badges use, so a
  // notification and the thread it opens never disagree about what to call it.
  const status = d?.status ? t(REPORT_STATUS[d.status].labelKey) : ''
  switch (row.kind) {
    case 'report_comment':
      return asInstructor
        ? t('notif.report_comment.instructor', { name })
        : t('notif.report_comment.student', { name })
    case 'report_status':
      return asInstructor
        ? t('notif.report_status.instructor', { name, status })
        : t('notif.report_status.student', { name, status })
    case 'report_assigned':
      return asInstructor
        ? t('notif.report_assigned.instructor', { name })
        : t('notif.report_assigned.student', { name })
    default:
      return asInstructor
        ? t('notif.report_submitted.instructor', { name })
        : t('notif.report_submitted.student')
  }
}

export function titleOf(row: Notification, t: TFn): string {
  if (isReportKind(row)) return reportTitle(row, t)

  if (row.kind === 'work_marked' || row.kind === 'work_due') {
    const title = workData(row)?.title?.trim() || t('common.untitled')
    return row.kind === 'work_marked'
      ? t('notif.work_marked', { title })
      : t('notif.work_due', { title })
  }
  if (row.kind === 'invoice_issued' || row.kind === 'payment_received') {
    const no = moneyData(row)?.invoice_no ?? ''
    return row.kind === 'invoice_issued'
      ? t('notif.invoice_issued', { no })
      : t('notif.payment_received', { no })
  }
  if (row.kind === 'announcement') {
    return announcementData(row)?.title?.trim() || t('notif.announcement')
  }

  const d = apptData(row)
  const name = d?.with_name?.trim() || t('notif.someone')
  const asInstructor = d?.role === 'instructor'
  if (row.kind === 'appointment_reminder') {
    return t('notif.appt_reminder', { name })
  }
  if (row.kind === 'appointment_reassigned') {
    return asInstructor
      ? t('notif.appt_moved.instructor', { name })
      : t('notif.appt_moved.student', { name })
  }
  if (row.kind === 'appointment_cancelled') {
    return asInstructor
      ? t('notif.appt_cancelled.instructor', { name })
      : t('notif.appt_cancelled.student', { name })
  }
  return asInstructor
    ? t('notif.appt_booked.instructor', { name })
    : t('notif.appt_booked.student', { name })
}

const joined = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(' · ')

/**
 * The second line. For a session that is when it is, in the academy's zone and
 * snapshotted on the row; for a report it is which batch, on which course —
 * "LPKC, slide dan portfolio · DKM1" is what tells two threads apart when a
 * student has one per course. For the rest it is the one figure the title left
 * out: the mark, the deadline, the amount.
 */
export function detailOf(row: Notification, locale: string): string {
  if (isReportKind(row)) {
    const d = reportData(row)
    return d ? joined(d.title, d.course) : ''
  }
  if (row.kind === 'work_marked') {
    const d = workData(row)
    if (!d) return ''
    const score =
      d.score == null
        ? null
        : d.out_of == null
          ? String(d.score)
          : `${d.score} / ${d.out_of}`
    return joined(score, d.course)
  }
  if (row.kind === 'work_due') {
    const d = workData(row)
    return d ? joined(d.due_at ? fmtDateTime(d.due_at) : null, d.course) : ''
  }
  if (row.kind === 'invoice_issued') {
    const d = moneyData(row)
    return d
      ? joined(
          d.total_sen == null ? null : formatMYR(d.total_sen),
          d.due_at ? fmtDate(d.due_at) : null,
        )
      : ''
  }
  if (row.kind === 'payment_received') {
    const d = moneyData(row)
    return d?.amount_sen == null ? '' : formatMYR(d.amount_sen)
  }
  if (row.kind === 'announcement') {
    const d = announcementData(row)
    return d ? joined(d.course, d.preview) : ''
  }
  const d = apptData(row)
  return d ? fmtWhen(d.starts_at, d.tz || DEFAULT_TZ, locale) : ''
}
