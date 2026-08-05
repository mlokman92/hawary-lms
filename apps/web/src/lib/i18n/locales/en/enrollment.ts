/**
 * Course enrollment: the public application pages, the staff review queue, the
 * per-course settings card, and bulk enrollment by email.
 */
export const enrollment = {
  // --- Public: academy directory -------------------------------------------
  'enroll.directory.subtitle': 'Courses open for enrollment',
  'enroll.directory.empty': 'No courses are open for enrollment right now.',
  'enroll.directory.empty_hint': 'Check back later, or contact the academy.',
  'enroll.unavailable.title': 'Page unavailable',
  'enroll.unavailable.body':
    'This enrollment link is not valid, or the academy is no longer taking applications here.',

  // --- Public: course page --------------------------------------------------
  'enroll.closed.title': 'Enrollment closed',
  'enroll.closed.body': 'This intake is not accepting applications right now.',
  'enroll.closes': 'Applications close {date}',
  'enroll.closed_on': 'Applications closed {date}',
  'enroll.price_free': 'Free',
  'enroll.seats.left_one': '{count} seat left',
  'enroll.seats.left_other': '{count} seats left',
  'enroll.seats.enrolled': '{count} enrolled',
  'enroll.seats.full':
    'All {count} seats are taken. You can still apply — the academy will let you know if one opens up.',
  'enroll.view_courses': 'See other courses',

  // --- Public: the apply call to action -------------------------------------
  'enroll.cta.title': 'Apply for a seat',
  'enroll.cta.body':
    'Enrollment is by application: create an account, send your details, and the academy confirms your seat.',
  'enroll.cta.create_account': 'Create an account to apply',
  'enroll.cta.have_account': 'Already have an account?',
  'enroll.cta.sign_in': 'Sign in',
  'enroll.cta.staff':
    'You are staff of this academy, so you cannot apply here. Enroll a student from the course page instead.',

  // --- Public: the form -----------------------------------------------------
  'enroll.form.title': 'Your details',
  'enroll.form.description':
    'The academy reviews every application before a seat is confirmed.',
  'enroll.form.submit': 'Send application',
  'enroll.form.sending': 'Sending…',
  'enroll.form.required_error': 'Please fill in every required field.',
  'enroll.field.full_name': 'Full name',
  'enroll.field.email': 'Email',
  'enroll.field.email_hint':
    'Leave as it is to use your account email. We only use this to contact you.',
  'enroll.field.phone': 'Phone',
  'enroll.field.ic_number': 'IC number',
  'enroll.field.date_of_birth': 'Date of birth',
  'enroll.field.gender': 'Gender',
  'enroll.field.address': 'Address',
  'enroll.field.organization': 'Organisation',
  'enroll.field.notes': 'Anything else the academy should know?',
  'enroll.field.optional': 'optional',
  'enroll.gender.male': 'Male',
  'enroll.gender.female': 'Female',
  'enroll.gender.placeholder': 'Select',

  // --- Public: application status -------------------------------------------
  'enroll.applied.title': 'Application sent',
  'enroll.applied.body':
    'The academy is reviewing it. The decision appears here — no email needed.',
  'enroll.applied.on': 'Applied {date}',
  'enroll.withdraw': 'Withdraw application',
  'enroll.withdrawing': 'Withdrawing…',
  'enroll.approved.title': 'You are enrolled',
  'enroll.approved.body': 'Open the course from your dashboard.',
  'enroll.approved.go': 'Go to my courses',
  'enroll.rejected.title': 'Not accepted this time',
  'enroll.rejected.body': 'The academy could not offer you a seat on this intake.',
  'enroll.withdrawn.title': 'Application withdrawn',
  'enroll.reapply': 'Apply again',
  'enroll.review_note': 'Note from the academy',

  'enroll.status.pending': 'Awaiting review',
  'enroll.status.approved': 'Approved',
  'enroll.status.rejected': 'Not accepted',
  'enroll.status.withdrawn': 'Withdrawn',

  // --- Applicant's own list (onboarding + profile pages) --------------------
  'enroll.mine.title': 'Your applications',
  'enroll.mine.description':
    'Courses you have applied for. An approved application gives you access straight away.',
  'enroll.mine.reviewed': 'Reviewed {date}',

  // --- Staff: the review queue ----------------------------------------------
  'enroll.queue.subtitle':
    'Applications from your courses’ public enrollment pages.',
  'enroll.queue.pending': 'Awaiting review',
  'enroll.queue.reviewed': 'Reviewed',
  'enroll.queue.search_placeholder': 'Search name, email, phone or course',
  'enroll.queue.empty': 'No applications yet.',
  'enroll.queue.empty_hint':
    'Open a course for enrollment and share its link to start receiving them.',
  'enroll.queue.no_match': 'No application matches this filter.',

  // --- Staff: the review sheet ----------------------------------------------
  'enroll.review.title': 'Enrollment application',
  'enroll.review.details': 'Submitted details',
  'enroll.review.applicant_note': 'From the applicant',
  'enroll.review.note_label': 'Note (optional)',
  'enroll.review.note_placeholder':
    'Shown to the applicant alongside the decision.',
  'enroll.review.approve': 'Approve',
  'enroll.review.approving': 'Approving…',
  'enroll.review.reject': 'Reject',
  'enroll.review.rejecting': 'Rejecting…',
  'enroll.review.reviewed_on': 'Reviewed {date}',
  'enroll.review.outcome_student': 'Student record',
  'enroll.review.full_warning':
    'This intake is full ({taken} of {capacity}). Approving adds a seat over capacity.',
  'enroll.review.what_happens':
    'Approving creates the student record if there isn’t one, links it to this account and enrolls them. No invoice is created.',

  'enroll.review.match.title': 'Possible existing record',
  'enroll.review.match.body':
    'This academy already has a student record that looks like this applicant.',
  'enroll.review.match.create_new': 'Create a new student record',
  'enroll.review.match.link': 'Link to {name}',
  'enroll.review.match.verified_email': 'Same confirmed email',
  'enroll.review.match.email': 'Same email — not confirmed',
  'enroll.review.match.ic': 'Same IC number',
  'enroll.review.match.not_linkable':
    'Cannot be linked automatically: the applicant has not confirmed this email address. Approve as a new record and merge the two by hand.',

  // --- Staff: the course settings card --------------------------------------
  'enroll.card.title': 'Enrollment',
  'enroll.card.description':
    'Add students who already have a record, or open a public page so new people can apply.',
  'enroll.settings.title': 'Enrollment page',
  'enroll.settings.description':
    'Let people apply for a seat from a public link.',
  'enroll.settings.open': 'Open for enrollment',
  'enroll.settings.needs_publish':
    'The course must be published before the page goes live.',
  'enroll.settings.listed': 'Show on the academy’s enrollment page',
  'enroll.settings.listed_hint':
    'Turn this off for a private intake — the link still works.',
  'enroll.settings.configure': 'Configure',
  'enroll.settings.preview': 'Preview',
  'enroll.settings.link_note':
    'Anyone with this link can apply. Nobody is enrolled until you approve them.',
  'enroll.settings.pending_one': '{count} awaiting review',
  'enroll.settings.pending_other': '{count} awaiting review',
  'enroll.settings.seats_uncapped': '{taken} enrolled · no seat limit',
  'enroll.settings.seats_capped': '{taken} of {capacity} seats taken',
  'enroll.settings.no_deadline': 'No closing date',
  'enroll.settings.dialog.title': 'Enrollment settings',
  'enroll.settings.dialog.description': 'Applies to this course only.',
  'enroll.settings.capacity': 'Seats',
  'enroll.settings.capacity_hint':
    'Leave blank for no limit. A full intake still accepts applications — you decide who gets the seat.',
  'enroll.settings.closes_at': 'Close applications on',
  'enroll.settings.closes_at_hint':
    'Leave blank to stay open until you switch it off.',
  'enroll.settings.intro': 'Introduction',
  'enroll.settings.intro_placeholder':
    'Shown above the form — who this intake is for, what to bring, when it starts.',
  'enroll.settings.required': 'Details to collect',
  'enroll.settings.required_hint':
    'Full name and email are always asked for. Tick anything else the form should collect — everything ticked is required.',

  // --- Staff: bulk enroll by email ------------------------------------------
  'enroll.bulk.action': 'Enroll students',
  'enroll.bulk.title': 'Enroll existing students',
  'enroll.bulk.description':
    'Paste a list of email addresses, or upload a CSV. Only people who already have a student record in this academy can be enrolled this way.',
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
    'They need a student record in this academy first — add or import them on the Students page, or send them the enrollment link so they can apply.',
  'enroll.bulk.ambiguous_title': 'More than one student shares these addresses',
  'enroll.bulk.ambiguous_hint':
    'Enroll these from the student’s own page, so the right record is picked.',
  'enroll.bulk.invalid_title': 'Not valid email addresses',
  'enroll.bulk.archived_note':
    'Archived students are not matched — they count as having no record.',
  'enroll.bulk.submit': 'Enroll {count}',
  'enroll.bulk.submitting': 'Enrolling…',
  'enroll.bulk.nothing': 'Nothing to enroll.',
  'enroll.bulk.done_one': '{count} student enrolled.',
  'enroll.bulk.done_other': '{count} students enrolled.',
} as const

export type EnrollmentDict = Record<keyof typeof enrollment, string>
