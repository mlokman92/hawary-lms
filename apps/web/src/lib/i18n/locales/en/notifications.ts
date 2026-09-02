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

} as const

export type NotificationsDict = Record<keyof typeof notifications, string>
