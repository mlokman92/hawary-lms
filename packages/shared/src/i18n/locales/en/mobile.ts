/**
 * Copy that exists only in the two mobile apps (Hawary Student LMS, Hawary
 * Academy LMS). Everything a phone shares with the web — and that is most of
 * it — uses the web's own namespaces; a key lands here only when the thing it
 * names does not exist on the web at all: the tab bar, the phone's camera and
 * calendar, announcements, the forced-update wall.
 */
export const mobile = {
  // --- tab bar --------------------------------------------------------------
  'm.tab.more': 'More',
  'm.tab.today': 'Today',
  'm.tab.marking': 'Marking',

  // --- forced update --------------------------------------------------------
  'm.update.title': 'Update needed',
  'm.update.body':
    'This version of the app is too old to keep working. Install the latest one to carry on.',
  'm.update.action': 'Open the store',

  // --- over-the-air update: downloaded, waiting for a restart ---------------
  'm.ota.title': 'New update available',
  'm.ota.body': 'Restart the app to see the changes.',
  'm.ota.restart': 'Restart',
  'm.ota.later': 'Later',

  // --- onboarding: the right account in the wrong app -----------------------
  'm.onboarding.staff.title': 'This is a staff account',
  'm.onboarding.staff.body':
    'This app is for students. Sign in to Hawary Academy LMS with this account instead.',
  'm.onboarding.student.title': 'This is a student account',
  'm.onboarding.student.body':
    'This app is for academy staff. Sign in to Hawary Student LMS with this account instead.',

  // --- attaching a file -----------------------------------------------------
  'm.attach.camera': 'Take a photo',
  'm.attach.photos': 'Choose photos',
  'm.attach.files': 'Choose a file',

  // --- the phone's calendar -------------------------------------------------
  'm.calendar.add': 'Add to calendar',
  'm.calendar.event_title': 'Session with {name}',
  'm.calendar.added': 'Added to your calendar, with a reminder an hour before.',
  'm.calendar.denied':
    'Calendar access is off. Allow it in your phone’s settings to add sessions.',
  'm.calendar.failed': 'Could not add this to your calendar.',

  // --- announcements --------------------------------------------------------
  'm.ann.title': 'Announcements',
  'm.ann.new': 'New announcement',
  'm.ann.empty': 'No announcements yet.',
  'm.ann.everyone': 'All students',
  'm.ann.to': 'Send to',
  'm.ann.message': 'Message',
  'm.ann.post': 'Send to students',
  'm.ann.no_courses':
    'You are not assigned to a course, so there is nobody to announce to.',
  'm.ann.delete.title': 'Delete this announcement?',
  'm.ann.delete.body': 'Students will no longer see it.',

  // --- deleting an account (Student app) ------------------------------------
  'm.account.delete.action': 'Delete my account',
  'm.account.delete.title': 'Delete your account?',
  'm.account.delete.body':
    'Your sign-in, profile and notifications are deleted and you are signed out. Your academy keeps its own record of you — enrolments, invoices and payments — as it must for its accounts. This cannot be undone.',
  'm.account.delete.confirm': 'Delete account',

  // --- Academy app: Today ---------------------------------------------------
  'm.today.sessions': 'Today’s sessions',
  'm.today.none': 'No sessions today.',
  'm.today.call': 'Call',
  'm.today.no_instructor':
    'Your account is not linked to an instructor record, so there are no sessions to show.',
  'm.today.attention': 'Needs attention',
  'm.today.requests': 'Enrolment requests',

  // --- Academy app: small labels the web spells out in table headers --------
  'm.staff.paid_on': 'Paid on',
  'm.staff.share_link': 'Share pay link',
  'm.staff.online_off': 'Online payment is not set up for this academy.',
  'm.staff.blocked.add': 'Block dates',
} as const

export type MobileDict = Record<keyof typeof mobile, string>
