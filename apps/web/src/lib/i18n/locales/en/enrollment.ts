/**
 * Enrollment: the academy's one public join link, the staff page that governs
 * it, and bulk enrolment by email.
 */
export const enrollment = {
  // --- Public join page -----------------------------------------------------
  'enroll.unavailable.title': 'Page unavailable',
  'enroll.unavailable.body':
    'This link is not valid, or the academy is no longer accepting new students here.',
  'enroll.closed.title': 'Enrollment closed',
  'enroll.closed.body': 'This academy is not accepting new students right now.',
  'enroll.page.title': 'Join this academy',
  'enroll.page.subtitle':
    'Pick the course you want. You join straight away; the course opens once staff approve it.',
  'enroll.choose': 'Choose a course',
  'enroll.no_courses': 'No courses are open for enrollment right now.',
  'enroll.join': 'Join and request this course',
  'enroll.joining': 'Joining…',
  'enroll.cta.create_account': 'Create an account',
  'enroll.cta.sign_in': 'Sign in',
  'enroll.cta.have_account': 'Already have an account?',
  'enroll.already_staff':
    'You are staff of this academy — enroll students from the back office.',
  'enroll.go_dashboard': 'Go to my dashboard',
  'enroll.price_free': 'Free',
  'enroll.seats.left_one': '{count} seat left',
  'enroll.seats.left_other': '{count} seats left',
  'enroll.seats.enrolled': '{count} enrolled',
  'enroll.closes': 'Closes {date}',

  // --- Enrollment status ----------------------------------------------------
  'enroll.status.pending': 'Awaiting approval',
  'enroll.status.active': 'Active',
  'enroll.status.completed': 'Completed',
  'enroll.status.dropped': 'Dropped',
  'enroll.status.rejected': 'Not approved',

  // --- Learner --------------------------------------------------------------
  'enroll.learn.pending': 'Awaiting approval',
  'enroll.learn.pending_hint': 'Opens once staff approve your place.',

  // --- Staff: the page ------------------------------------------------------
  'enroll.staff.subtitle':
    'The public join link, which courses accept requests, and who is waiting.',

  'enroll.link.title': 'Public join link',
  'enroll.link.description':
    'Anyone with this link can create an account and request a course. Nobody gets course access until you approve it.',
  'enroll.link.open': 'Open for enrollment',
  'enroll.link.closed_note': 'Switch this on to publish the link.',
  'enroll.link.intro': 'Message on the page',
  'enroll.link.intro_placeholder':
    'Who this is for, when classes start, what to bring.',
  'enroll.link.preview': 'Preview',
  'enroll.link.admin_only': 'Only an admin can change this.',

  'enroll.courses.title': 'Courses accepting requests',
  'enroll.courses.description':
    'A course must be published and switched on here before it appears on the link.',
  'enroll.courses.empty': 'No courses yet.',
  'enroll.courses.limits': 'Limits',
  'enroll.courses.seats_uncapped': '{taken} enrolled',
  'enroll.courses.seats_capped': '{taken} of {capacity} seats',
  'enroll.courses.no_deadline': 'No closing date',

  'enroll.limits.title': 'Enrollment limits',
  'enroll.limits.description': 'Applies to {course}.',
  'enroll.limits.capacity': 'Seats',
  'enroll.limits.capacity_hint':
    'Blank for no limit. A full course still takes requests — you decide who gets the seat.',
  'enroll.limits.closes_at': 'Stop accepting requests on',
  'enroll.limits.closes_at_hint': 'Blank to stay open until you switch it off.',

  'enroll.requests.title': 'Requests',
  'enroll.requests.pending': 'Awaiting approval',
  'enroll.requests.enrolled': 'Enrolled',
  'enroll.requests.search_placeholder': 'Search name, email, phone or course',
  'enroll.requests.empty': 'No requests yet.',
  'enroll.requests.empty_hint':
    'Open the link and switch a course on to start receiving them.',
  'enroll.requests.no_match': 'Nothing matches this filter.',
  'enroll.requests.approve': 'Approve',
  'enroll.requests.reject': 'Reject',
  'enroll.requests.full': 'Full',

  // --- Staff: bulk enroll by email ------------------------------------------
  'enroll.bulk.action': 'Enroll students',
  'enroll.bulk.title': 'Enroll existing students',
  'enroll.bulk.description':
    'Paste a list of email addresses, or upload a CSV. Only people who already have a student record in this academy can be enrolled this way.',
  'enroll.bulk.course': 'Course',
  'enroll.bulk.pick_course': 'Select a course',
  'enroll.bulk.label': 'Email addresses',
  'enroll.bulk.placeholder': 'aina@example.com\nrahim@example.com',
  'enroll.bulk.hint':
    'One address per line, or a CSV with an “email” column. Duplicates are removed.',
  'enroll.bulk.upload': 'Upload CSV',
  'enroll.bulk.stat.ready': 'To enroll',
  'enroll.bulk.stat.already': 'Already enrolled',
  'enroll.bulk.stat.unknown': 'No student record',
  'enroll.bulk.stat.invalid': 'Not an email',
  'enroll.bulk.stat.ambiguous': 'More than one match',
  'enroll.bulk.unknown_title': 'No student record for these addresses',
  'enroll.bulk.unknown_hint':
    'Add or import them on the Students page, or send them the join link so they can request a place. Archived students do not match.',
  'enroll.bulk.ambiguous_title': 'More than one student shares these addresses',
  'enroll.bulk.ambiguous_hint':
    'Enroll these from the student’s own page, so the right record is picked.',
  'enroll.bulk.invalid_title': 'Not valid email addresses',
  'enroll.bulk.submit': 'Enroll {count}',
  'enroll.bulk.submitting': 'Enrolling…',
  'enroll.bulk.nothing': 'Nothing to enroll',
  'enroll.bulk.done_one': '{count} student enrolled.',
  'enroll.bulk.done_other': '{count} students enrolled.',
} as const

export type EnrollmentDict = Record<keyof typeof enrollment, string>
