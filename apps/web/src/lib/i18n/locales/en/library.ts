/**
 * The academy-wide Assessments and Assignments lists reached from the Courses
 * sub-navigation. Shared by the staff page and the learner one — the list is
 * the same idea from either side, only the columns differ.
 */
export const library = {
  'library.assessments.subtitle':
    'Every assessment in this academy, across all courses.',
  'library.assignments.subtitle':
    'Every assignment in this academy, across all courses.',
  'library.learn.assessments.subtitle':
    'Assessments from the courses you are enrolled in.',
  'library.learn.assignments.subtitle':
    'Assignments from the courses you are enrolled in.',

  'library.search_placeholder': 'Search by title, course or module…',
  'library.all_courses': 'All courses',
  'library.always_open': 'No close date',
  'library.questions_one': '{count} question',
  'library.questions_other': '{count} questions',

  'library.empty.assessments': 'No assessments yet.',
  'library.empty.assignments': 'No assignments yet.',
  'library.empty.hint': 'Open a course and add one to a module.',
  'library.empty.no_match': 'Nothing matches that search.',
  'library.learn.empty.assessments': 'You have no assessments yet.',
  'library.learn.empty.assignments': 'You have no assignments yet.',
} as const

export type LibraryDict = Record<keyof typeof library, string>
