/** Staff assignment editor: brief, due date, points and late-submission rules. */
export const assignments = {
  // Page states
  'assign.not_found': 'Assignment not found.',
  'assign.back_to_courses': 'Back to courses',

  // Title
  'assign.untitled': 'Untitled assignment',

  // Delete
  'assign.delete.action': 'Delete assignment',
  'assign.delete.confirm_title': 'Delete this assignment?',
  'assign.delete.confirm_body': '“{title}” will be permanently deleted.',

  // Sections
  'assign.section.brief': 'Brief',
  'assign.section.settings': 'Settings',

  // Settings fields
  'assign.due_date': 'Due date',
  'assign.total_points': 'Total points',
  'assign.late.label': 'Late submissions',
  'assign.late.allowed': 'Allowed',
  'assign.late.not_allowed': 'Not allowed',
} as const

export type AssignmentsDict = Record<keyof typeof assignments, string>
