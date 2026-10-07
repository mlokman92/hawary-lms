import { Platform } from 'react-native'
import * as Calendar from 'expo-calendar'

export type CalendarOutcome = 'added' | 'denied' | 'failed'

/** How long before the session the phone should say so. */
const REMINDER_MINUTES = 60

/**
 * Put one session in the phone's own calendar, with an alert an hour before.
 *
 * Written straight into the calendar rather than through the system's "new
 * event" form: the form is one more screen to confirm something the person
 * just asked for, and on Android it cannot carry the alert at all.
 *
 * iOS is asked for write-only access — the app adds an event and has no reason
 * to read anybody's diary.
 */
export async function addSessionToCalendar(session: {
  title: string
  startsAt: string
  endsAt: string
  notes?: string | null
  timeZone?: string
}): Promise<CalendarOutcome> {
  try {
    const permission = await Calendar.requestCalendarPermissions(true)
    if (!permission.granted) return 'denied'

    let calendar: Calendar.ExpoCalendar | undefined
    if (Platform.OS === 'ios') {
      calendar = Calendar.getDefaultCalendarSync()
    } else {
      // Android has no single default calendar: take the account's primary
      // one, or failing that anything the app is allowed to write to.
      const all = await Calendar.getCalendars()
      const writable = all.filter((c) => c.allowsModifications)
      calendar = writable.find((c) => c.isPrimary) ?? writable[0]
    }
    if (!calendar) return 'failed'

    await calendar.createEvent({
      title: session.title,
      startDate: new Date(session.startsAt),
      endDate: new Date(session.endsAt),
      notes: session.notes ?? undefined,
      timeZone: session.timeZone,
      alarms: [{ relativeOffset: -REMINDER_MINUTES }],
    })
    return 'added'
  } catch (e) {
    console.warn('add to calendar failed', e)
    return 'failed'
  }
}
