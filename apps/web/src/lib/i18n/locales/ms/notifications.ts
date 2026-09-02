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

}
