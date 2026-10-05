/**
 * `/analytics` — whether students are using the LMS. Directors only.
 *
 * "Login" has one meaning on this page and the subtitle states it, because the
 * obvious reading (somebody typed a password) is not what is counted: a person
 * who is still signed in and comes back has logged in too.
 */
export const analytics = {
  'analytics.title': 'Analytics',
  'analytics.subtitle':
    'Students only. A login is counted each time a student signs in, or comes back on a device that was still signed in.',
  'analytics.month': 'Month',
  'analytics.active_users': 'Active students',
  'analytics.logins_per_day': 'Logins per day',
  // The chart's series name, in its tooltip.
  'analytics.logins': 'Logins',
  'analytics.logins_total_one': '{count} login',
  'analytics.logins_total_other': '{count} logins',
  'analytics.no_logins': 'No logins in this month.',

  // The student list
  'analytics.users.search_placeholder': 'Search by name or email…',
  'analytics.users.col.last_login': 'Last logged in',
  'analytics.users.never': 'Never',
  'analytics.users.no_match': 'No student matches your search.',
} as const

export type AnalyticsDict = Record<keyof typeof analytics, string>
