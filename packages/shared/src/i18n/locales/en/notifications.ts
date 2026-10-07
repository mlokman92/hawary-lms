/**
 * The notification centre — the bell in the header.
 *
 * A row is stored as an event, not a sentence, so every line a person reads is
 * assembled here. That is the point: the same row reads Malay for a Malay
 * reader and English for an English one.
 */
export const notifications = {
  'notif.title': 'Notifications',
  'notif.open': 'Notifications',
  'notif.unread_aria': '{count} unread',
  'notif.mark_all': 'Mark all read',
  'notif.empty': 'Nothing yet.',

  // --- appointment_booked ---------------------------------------------------
  'notif.appt_booked.student': 'Session booked with {name}',
  'notif.appt_booked.instructor': 'New session with {name}',
  'notif.someone': 'someone',
  // --- appointment_reassigned -----------------------------------------------
  'notif.appt_moved.student': 'Your session is now with {name}',
  'notif.appt_moved.instructor': 'Session with {name} passed to you',
  // --- appointment_cancelled ------------------------------------------------
  'notif.appt_cancelled.student': 'Your session with {name} was cancelled',
  'notif.appt_cancelled.instructor': 'Session with {name} was cancelled',

  // --- report checks --------------------------------------------------------
  // Four kinds, because "your report was approved" and "somebody left a
  // comment" are different events with different urgency. Only `titleOf`
  // branches; the payload is identical across all four.
  'notif.report_submitted.instructor': '{name} sent a report for checking',
  'notif.report_submitted.student': 'Your report was sent',
  'notif.report_comment.student': '{name} commented on your report',
  'notif.report_comment.instructor': '{name} replied on a report',
  'notif.report_status.student': 'Your report: {status}',
  'notif.report_status.instructor': 'Report with {name}: {status}',
  'notif.report_assigned.instructor': 'A report from {name} was assigned to you',
  'notif.report_assigned.student': 'Your report is now with {name}',
  // --- the six kinds added with the mobile apps ------------------------------
  // Written for push, but they are ordinary rows, so the web bell shows them too.
  'notif.appt_reminder': 'Your session tomorrow with {name}',
  'notif.work_marked': 'Marked: {title}',
  'notif.work_due': 'Due soon: {title}',
  'notif.invoice_issued': 'New invoice {no}',
  'notif.payment_received': 'Payment received for {no}',
  'notif.announcement': 'Announcement',

} as const

export type NotificationsDict = Record<keyof typeof notifications, string>
