import type { NotificationsDict } from '../en/notifications'

export const notifications: NotificationsDict = {
  'notif.title': 'Pemberitahuan',
  'notif.open': 'Pemberitahuan',
  'notif.unread_aria': '{count} belum dibaca',
  'notif.mark_all': 'Tandakan semua dibaca',
  'notif.empty': 'Tiada apa-apa lagi.',

  // --- appointment_booked ---------------------------------------------------
  'notif.appt_booked.student': 'Sesi ditempah bersama {name}',
  'notif.appt_booked.instructor': 'Sesi baharu bersama {name}',
  'notif.someone': 'seseorang',
  // --- appointment_reassigned -----------------------------------------------
  'notif.appt_moved.student': 'Sesi anda kini bersama {name}',
  'notif.appt_moved.instructor': 'Sesi bersama {name} diserahkan kepada anda',
  // --- appointment_cancelled ------------------------------------------------
  'notif.appt_cancelled.student': 'Sesi anda bersama {name} telah dibatalkan',
  'notif.appt_cancelled.instructor': 'Sesi bersama {name} telah dibatalkan',

  // --- report checks --------------------------------------------------------
  'notif.report_submitted.instructor': '{name} menghantar laporan untuk semakan',
  'notif.report_submitted.student': 'Laporan anda telah dihantar',
  'notif.report_comment.student': '{name} memberi komen pada laporan anda',
  'notif.report_comment.instructor': '{name} membalas pada satu laporan',
  'notif.report_status.student': 'Laporan anda: {status}',
  'notif.report_status.instructor': 'Laporan bersama {name}: {status}',
  'notif.report_assigned.instructor': 'Laporan daripada {name} diberikan kepada anda',
  'notif.report_assigned.student': 'Laporan anda kini bersama {name}',

}
