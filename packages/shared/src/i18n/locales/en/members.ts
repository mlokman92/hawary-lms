/**
 * The staff roster (`/members`) and a single member's page.
 *
 * Two vocabularies live here and are deliberately not mixed: *access* (what the
 * database lets someone do — Director / Admin / Trainer) and *instructor*
 * (whether they hold a teaching record). A member can be both.
 */
export const members = {
  'members.title': 'Members',
  'members.subtitle':
    'Everyone who can sign in to this academy’s back office. Students are managed on the Students page.',
  'members.col.person': 'Person',
  'members.col.access': 'Access',
  'members.col.contact': 'Contact',
  'members.you': '(you)',
  'members.actions': 'Member actions',
  'members.empty': 'No one has back-office access to this academy yet.',
  'members.member_since': 'Member since {date}',
  'members.no_email': 'No email on file',
  'members.no_record':
    'No record to open — give them an instructor record first.',

  // Access levels. A Director is an admin with academy_members.is_director, a
  // flag the owner sets in SQL; there can be several. Directors alone grant and
  // revoke staff access and change the payment and letterhead settings.
  'members.tier.system_admin': 'System admin',
  'members.tier.director': 'Director',
  'members.tier.admin': 'Admin',
  'members.tier.trainer': 'Trainer',
  'members.tier.student': 'Student',

  // academy_members.status
  'members.status.active': 'Active',
  'members.status.invited': 'Invited',
  'members.status.suspended': 'Suspended',

  // Actions
  'members.make_admin': 'Make admin',
  'members.make_trainer': 'Make trainer',
  'members.suspend': 'Suspend access',
  'members.restore': 'Restore access',
  'members.last_admin':
    'This is the last active admin — demoting or suspending them would leave the academy with no one who can manage it.',
  'members.last_director':
    'This is the last active director — demoting or suspending them would leave no one who can grant staff access or change payment settings.',
  'members.footnote':
    'Suspending a member revokes their access immediately. Student access is managed on each student’s own page.',
  'members.access.failed': 'Could not change this member’s access.',

  // The second axis: a linked `instructors` record.
  'members.instructor': 'Instructor',
  'members.instructor.make': 'Make instructor',
  'members.instructor.create_new': 'Create a new record',
  'members.instructor.dialog_description':
    'Gives {name} an instructor record, so they can be assigned courses and grade them. Their access level does not change.',
  'members.instructor.making': 'Creating record…',
  'members.instructor.made_from_profile':
    'Creates an instructor record from this account’s name, email and phone.',
  'members.instructor.attach_label': 'Or link a record you already have',
  'members.instructor.attach_placeholder': 'Choose an instructor record',
  'members.instructor.attach': 'Link record',
  'members.instructor.attach_empty':
    'Every instructor record in this academy is already linked to an account.',
  'members.instructor.detach': 'Remove instructor record',
  'members.instructor.needs_email':
    'This account has no email address, so an instructor record cannot be linked to it.',
  'members.instructor.failed': 'Could not update the instructor record.',
  'members.instructor.courses_one': 'Teaches {count} course',
  'members.instructor.courses_other': 'Teaches {count} courses',
  'members.instructor.record': 'Record {no}',
} as const

export type MembersDict = Record<keyof typeof members, string>
