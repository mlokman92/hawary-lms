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
} as const

export type NotificationsDict = Record<keyof typeof notifications, string>
