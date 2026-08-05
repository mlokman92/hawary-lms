/** App chrome: sidebars, header, academy switcher, user menu. */
export const nav = {
  // Sidebar groups
  'nav.group.platform': 'Platform',
  'nav.group.learning': 'Learning',
  'nav.group.account': 'Account',

  // Back-office destinations
  'nav.dashboard': 'Dashboard',
  'nav.courses': 'Courses',
  // Sub-navigation under Courses, shared by both shells.
  'nav.assessments': 'Assessments',
  'nav.assignments': 'Assignments',
  'nav.enrollments': 'Enrollments',
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

  // Header search. It looks across the people records in the active academy —
  // the thing an admin most often arrives wanting to find.
  'nav.search_placeholder': 'Search students and instructors…',
  'nav.search_label': 'Search students and instructors',
  'search.group.students': 'Students',
  'search.group.instructors': 'Instructors',
  'search.searching': 'Searching…',
  'search.no_results': 'Nothing matches “{query}”.',
  'search.hint': 'Keep typing — two characters or more.',
  'search.failed': 'Search failed.',
  'search.clear': 'Clear search',

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
  'user.profile': 'My profile',
  'nav.profile': 'My profile',
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
