/**
 * The signed-in user's own profile (`/profile`), reached by clicking your name
 * in the sidebar footer. The learner tree has its own page with the student
 * record attached — see `learnAccount` — so the copy here is staff-flavoured.
 */
export const profile = {
  'profile.title': 'My profile',
  'profile.description':
    'Your name, photo and phone number. This is your account, not an academy record — it follows you into every academy you belong to.',
  'profile.account': 'Account',
  'profile.photo': 'Photo',
  'profile.name_placeholder': 'Your full name',
  'profile.email_locked':
    'Your email address is how you sign in and cannot be changed here.',
  'profile.save': 'Save changes',
  'profile.save_failed': 'Could not save your profile.',
  'profile.not_signed_in': 'You are not signed in.',

  'profile.membership.title': 'Your access',
  'profile.membership.description':
    'Set by an admin of {academy}. Ask them if it needs to change.',
  'profile.membership.academy': 'Academy',
  'profile.membership.access': 'Access level',
  'profile.membership.instructor': 'Instructor record',
  'profile.membership.instructor_none': 'None',
} as const

export type ProfileDict = Record<keyof typeof profile, string>
