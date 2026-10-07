/**
 * The learner's own lists of assessments and assignments, reached from the
 * Courses sub-navigation in `LearnLayout`.
 *
 * The staff side of these routes is the grading queue, not an inventory — its
 * copy lives in the `grading` namespace.
 */
export const library = {
  'library.learn.assessments.subtitle':
    'Assessments from the courses you are enrolled in.',
  'library.learn.assignments.subtitle':
    'Assignments from the courses you are enrolled in.',

  'library.always_open': 'No close date',

  'library.learn.empty.assessments': 'You have no assessments yet.',
  'library.learn.empty.assignments': 'You have no assignments yet.',
} as const

export type LibraryDict = Record<keyof typeof library, string>
