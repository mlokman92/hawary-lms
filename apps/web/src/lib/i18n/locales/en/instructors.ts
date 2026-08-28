/** Instructor list, instructor detail, and the form / assign / invite dialogs. */
export const instructors = {
  // List page
  'instructors.description':
    'Manage your academy’s instructors and course assignments.',
  'instructors.add': 'Add instructor',
  'instructors.search_placeholder': 'Search name, email, phone, IC, subject…',
  'instructors.filter.all_statuses': 'All statuses',
  'instructors.sort.name_asc': 'Name A–Z',
  'instructors.sort.name_desc': 'Name Z–A',
  'instructors.sort.joined_desc': 'Join date: newest',
  'instructors.sort.joined_asc': 'Join date: oldest',
  'instructors.empty.no_match': 'No instructors match your filters.',
  'instructors.empty.none':
    'No instructors yet. Add your first instructor to get started.',
  'instructors.col.contact': 'Contact',
  'instructors.row.meta': 'Joined {date} · {no}',
  'instructors.row.meta_subject': 'Joined {date} · {no} · {subject}',

  // Detail page
  'instructors.not_found': 'Instructor not found.',
  'instructors.back_to_list': 'Back to instructors',
  'instructors.unnamed': 'Unnamed instructor',
  'instructors.this_instructor': 'This instructor',
  'instructors.member_since': 'Member since {date} · ID {no}',
  'instructors.account_linked': 'App account linked',
  'instructors.link_account': 'Link existing account',
  'instructors.edit_profile': 'Edit profile',

  'instructors.personal.title': 'Personal details',
  'instructors.personal.description':
    'View only — use “Edit profile” to make changes.',

  // Field labels specific to an instructor record
  'instructors.field.id': 'Instructor ID',
  'instructors.field.specialization': 'Specialization',
  'instructors.field.ic': 'IC Number',
  'instructors.field.gender': 'Gender',
  'instructors.field.dob': 'Date of birth',
  'instructors.field.phone_number': 'Phone number',
  'instructors.field.bio': 'Bio',
  'instructors.field.address': 'Address',

  'instructors.gender.male': 'Male',
  'instructors.gender.female': 'Female',

  // Assigned courses card
  'instructors.courses.title': 'Assigned courses',
  'instructors.courses.assign': 'Assign course',
  'instructors.courses.empty': 'Not assigned to any courses yet.',
  'instructors.courses.remove': 'Remove assignment',
  // Only the third course status needs a key here — Published and Draft
  // already live in `common`.
  'instructors.course_status.archived': 'Archived',

  // Danger zone
  'instructors.danger.title': 'Danger zone',
  'instructors.danger.description':
    'Archiving removes this instructor from your lists.',
  'instructors.danger.archive': 'Archive instructor',
  'instructors.danger.confirm_title': 'Archive this instructor?',
  'instructors.danger.confirm_body':
    '{name} will be hidden from your instructors list.',
  'instructors.danger.confirm_action': 'Archive',

  // Add / edit dialog
  'instructors.form.edit_title': 'Edit instructor',
  'instructors.form.edit_description': 'Update this instructor’s details.',
  'instructors.form.add_description':
    'Add an instructor record. Only name and gender are required — an ID is generated automatically.',
  'instructors.form.gender_placeholder': 'Select gender',
  'instructors.form.ic_placeholder': 'e.g. 010203-14-5678',
  'instructors.form.specialization_placeholder': 'e.g. Mathematics, English',
  'instructors.form.more': 'Add more details',
  'instructors.form.avatar': 'Profile picture',
  'instructors.form.bio_placeholder': 'Short professional bio',
  'instructors.form.save_changes': 'Save changes',
  'instructors.form.name_required': 'Name is required.',
  'instructors.form.gender_required': 'Gender is required.',

  // Assign course dialog
  'instructors.assign.title': 'Assign a course',
  'instructors.assign.description':
    'Assign this instructor to one of your academy’s courses.',
  'instructors.assign.placeholder': 'Select a course',
  'instructors.assign.empty': 'No available courses',
  'instructors.assign.required': 'Select a course.',
  'instructors.assign.submit': 'Assign',
  'instructors.assign.busy': 'Assigning…',

  // Invite instructor dialog
} as const

export type InstructorsDict = Record<keyof typeof instructors, string>
