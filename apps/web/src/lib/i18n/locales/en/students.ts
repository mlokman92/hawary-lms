/** Student records: list, detail, form, enrolment, app invitation, avatar. */
export const students = {
  // List page
  'students.page.description': 'Manage your academy’s students and enrollment.',
  'students.action.add': 'Add Student',
  'students.action.invite': 'Invite Student',
  'students.search_placeholder': 'Search name, email, phone, IC…',
  'students.filter.all_statuses': 'All statuses',
  'students.sort.name_asc': 'Name A–Z',
  'students.sort.name_desc': 'Name Z–A',
  'students.sort.joined_desc': 'Join date: newest',
  'students.sort.joined_asc': 'Join date: oldest',
  'students.table.contact': 'Contact',
  'students.row.joined': 'Joined {date} · {no}',
  'students.empty.no_match': 'No students match your filters.',
  'students.empty.none':
    'No students yet. Add your first student to get started.',

  // Detail — header
  'students.not_found': 'Student not found.',
  'students.back_to_list': 'Back to students',
  'students.unnamed': 'Unnamed student',
  'students.member_since': 'Member since {date} · ID {no}',
  'students.action.edit_profile': 'Edit profile',

  // Detail — app account linking
  'students.account.linked': 'App account linked',
  'students.account.invite_to_app': 'Invite to app',
  'students.account.link_existing': 'Link existing account',
  'students.account.needs_email':
    'Add an email to invite this student by email.',

  // Detail — personal details
  'students.personal.title': 'Personal details',
  'students.personal.description':
    'View only — use “Edit profile” to make changes.',
  'students.field.student_no': 'Student ID',
  'students.field.ic': 'IC Number',
  'students.field.gender': 'Gender',
  'students.field.dob': 'Date of birth',
  'students.field.phone_number': 'Phone number',
  'students.field.organization': 'Organization',
  'students.field.address': 'Address',
  'students.gender.male': 'Male',
  'students.gender.female': 'Female',

  // Detail — enrolled courses
  'students.enrolled.title': 'Enrolled courses',
  'students.enrolled.add': 'Add course',
  'students.enrolled.empty': 'Not enrolled in any courses yet.',
  'students.enrolled.remove': 'Remove enrollment',
  'students.enrollment.active': 'Active',
  'students.enrollment.pending': 'Pending',
  'students.enrollment.completed': 'Completed',
  'students.enrollment.dropped': 'Dropped',
  'students.enrollment.cancelled': 'Cancelled',

  // Detail — billing summary. The invoice statuses are duplicated here rather
  // than borrowed from the payments namespace so this page owns every string it
  // renders; the payments module keeps its own copy of the same enum.
  'students.billing.title': 'Billing',
  'students.billing.description': 'Invoices and payments for this student.',
  'students.billing.new_invoice': 'New invoice',
  'students.billing.billed': 'Billed',
  'students.billing.paid': 'Paid',
  'students.billing.outstanding': 'Outstanding',
  'students.billing.empty': 'No invoices yet.',
  'students.billing.amount_paid': '{amount} paid',
  'students.billing.due_on': 'due {date}',
  'students.invoice.draft': 'Draft',
  'students.invoice.issued': 'Issued',
  'students.invoice.partially_paid': 'Partially paid',
  'students.invoice.paid': 'Paid',
  'students.invoice.overdue': 'Overdue',
  'students.invoice.void': 'Void',
  'students.invoice.cancelled': 'Cancelled',

  // Detail — danger zone
  'students.danger.title': 'Danger zone',
  'students.danger.description':
    'Archiving removes this student from your lists.',
  'students.danger.action': 'Archive student',
  'students.danger.confirm_title': 'Archive this student?',
  'students.danger.confirm_body':
    '{name} will be hidden from your students list.',
  'students.danger.this_student': 'This student',
  'students.danger.confirm': 'Archive',

  // Add / edit form
  'students.form.add_title': 'Add student',
  'students.form.edit_title': 'Edit student',
  'students.form.add_description':
    'Add a student record. Only name and gender are required — a student ID is generated automatically.',
  'students.form.edit_description': 'Update this student’s details.',
  'students.form.select_gender': 'Select gender',
  'students.form.ic_placeholder': 'e.g. 010203-14-5678',
  'students.form.more_details': 'Add more details',
  'students.form.organization_placeholder': 'e.g. Klinik Mesra Sdn Bhd',
  'students.form.profile_picture': 'Profile picture',
  'students.form.save_changes': 'Save changes',
  'students.form.name_required': 'Name is required.',
  'students.form.gender_required': 'Gender is required.',

  // Enrol in a course
  'students.enroll.title': 'Enroll in a course',
  'students.enroll.description':
    'Add this student to one of your academy’s courses.',
  'students.enroll.select_course': 'Select a course',
  'students.enroll.none_available': 'No available courses',
  'students.enroll.required': 'Select a course.',
  'students.enroll.submit': 'Enroll',
  'students.enroll.busy': 'Enrolling…',

  // Invite a student to the app
  'students.invite.title': 'Invite student',
  'students.invite.description':
    'Add a student by email and send them an invite to join.',
  'students.invite.description_done': 'Student added and invitation created.',
  'students.invite.email_label': 'Email address',
  'students.invite.email_required': 'Email is required.',
  'students.invite.submit': 'Send invite',
  'students.invite.sending': 'Sending invitation email…',
  'students.invite.sent': 'Invitation email sent.',
  'students.invite.sent_to': 'Invitation email sent to {email}.',
  'students.invite.created_not_sent':
    'The invitation was created but the email could not be sent.',
  'students.invite.note_sending':
    'You can also copy this link to share it directly.',
  'students.invite.note_sent':
    'Also copy this link if the student doesn’t receive the email.',
  'students.invite.note_failed':
    'Email delivery didn’t go through — share this link with the student.',
  'students.invite.send_failed': 'Could not send email.',
  'students.invite.no_response': 'No response from server.',

  // Avatar uploader
  'students.avatar.change': 'Change',
  'students.avatar.remove': 'Remove picture',
} as const

export type StudentsDict = Record<keyof typeof students, string>
