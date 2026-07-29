/** App chrome: sidebars, header, academy switcher, user menu. */
export const nav = {
  // Sidebar groups
  'nav.group.platform': 'Platform',
  'nav.group.learning': 'Learning',
  'nav.group.account': 'Account',

  // Back-office destinations
  'nav.dashboard': 'Dashboard',
  'nav.courses': 'Courses',
  'nav.students': 'Students',
  'nav.instructors': 'Instructors',
  'nav.payments': 'Payments',
  'nav.members': 'Members',
  'nav.settings': 'Settings',

  // Learner destinations
  'nav.learn.dashboard': 'Dashboard',
  'nav.learn.courses': 'My courses',
  'nav.learn.work': 'My work',
  'nav.learn.billing': 'Billing',
  'nav.learn.profile': 'My profile',

  // Header
  'nav.search_placeholder': 'Search…',
  'nav.search_label': 'Search',
  'nav.toggle_sidebar': 'Toggle sidebar',
  'nav.sidebar': 'Sidebar',
  'nav.sidebar_description': 'Displays the mobile sidebar.',

  // Academy switcher
  'academy.select': 'Select academy',
  'academy.heading': 'Academies',
  'academy.add': 'Add academy',
  'academy.fallback': 'Academy',
  'academy.this_academy': 'this academy',

  // Roles
  'role.admin': 'Admin',
  'role.trainer': 'Trainer',
  'role.student': 'Student',

  // User menu
  'user.account': 'Account',
  'user.theme': 'Theme',
  'user.theme.light': 'Light',
  'user.theme.dark': 'Dark',
  'user.theme.system': 'System',
  'user.language': 'Language',
  'user.sign_out': 'Sign out',

  // Learner gap state (no linked student record)
  'shell.no_student_record.title':
    'Your account isn’t linked to a student record yet',
  'shell.no_student_record.body':
    'You’re signed in to {academy}, but no student record is linked to your account. {detail}',
  'shell.no_student_record.detail':
    'Ask your academy to finish setting you up.',
} as const

export type NavDict = Record<keyof typeof nav, string>
