/** Course list (card grid), course detail with its module tree, course form. */
export const courses = {
  // List page
  'courses.subtitle': 'Open a course to manage its modules and content.',
  'courses.new': 'New course',
  'courses.edit': 'Edit course',
  'courses.materials': 'Materials',
  'courses.assessments': 'Assessments',
  'courses.assignments': 'Assignments',
  'courses.menu.edit_details': 'Edit details',
  'courses.menu.archive': 'Archive',

  // Duplicate for a new intake
  'courses.duplicate': 'Duplicate',
  'courses.duplicate.description':
    'Copy this course for a new intake. Name the copy so the two can be told apart — most academies put the intake in the title.',
  'courses.duplicate.title_default': '{title} (copy)',
  'courses.duplicate.code_hint':
    'Course codes must be unique, so the copy starts without one. The original is “{code}”.',
  'courses.duplicate.code_hint_none':
    'Course codes must be unique in an academy. Optional.',
  'courses.duplicate.copies.title': 'What comes across',
  'courses.duplicate.copies.body':
    'Modules, notes, materials, assessments with their questions and answer keys, assignments, and the assigned instructors. The copy is created as a draft.',
  'courses.duplicate.skips.body':
    'Students, enrolments, submissions, attempts and invoices are not copied. Opening and due dates are cleared so you can set this intake’s own.',
  'courses.duplicate.confirm': 'Duplicate course',
  'courses.duplicate.working': 'Duplicating…',
  'courses.status.archived': 'Archived',
  'courses.empty.none': 'No courses yet.',
  'courses.empty.create_first': 'Create your first course',
  'courses.empty.all_archived': 'Every course is archived.',

  // Archive
  'courses.archived_count': 'Archived ({count})',
  'courses.view_archived': 'View archived ({count})',
  'courses.archived.title': 'Archived courses',
  'courses.archived.description':
    'Hidden from the course list. Restoring one puts it back as a draft.',
  'courses.archived.empty': 'Nothing archived.',
  'courses.archived.restore': 'Restore',

  // Detail page
  'courses.not_found': 'Course not found.',
  'courses.back_to_courses': 'Back to courses',
  'courses.grading': 'Grading',
  'courses.module_count_one': '{count} module',
  'courses.module_count_other': '{count} modules',

  // Modules inside a course
  'courses.module.new': 'New module',
  'courses.module.hidden': 'Hidden',
  'courses.module.item_count_one': '{count} item',
  'courses.module.item_count_other': '{count} items',
  'courses.module.actions': 'Module actions',
  'courses.module.edit': 'Edit module',
  'courses.module.hide': 'Hide from students',
  'courses.module.show': 'Show to students',
  'courses.module.delete': 'Delete module',
  'courses.modules.empty.title': 'No modules yet',
  'courses.modules.empty.body':
    'Notes, assessments and assignments live inside a module — add one to start building this course.',
  'courses.modules.empty.create_first': 'Create first module',
  'courses.move_up': 'Move up',
  'courses.move_down': 'Move down',

  // Content inside a module
  'courses.section.empty': 'None yet.',
  'courses.item.note': 'Note',
  'courses.item.material': 'Material',
  'courses.item.assessment': 'Assessment',
  'courses.item.assignment': 'Assignment',
  'courses.item.actions': '{title} actions',
  'courses.item.move_to_module': 'Move to module',
  'courses.item.questions_one': '{count} question',
  'courses.item.questions_other': '{count} questions',
  'courses.item.due': 'Due {date}',
  'courses.item.points': '{points} pts',

  // Default titles given to freshly created content
  'courses.new_item.assessment': 'Untitled assessment',
  'courses.new_item.assignment': 'Untitled assignment',

  // Delete confirmations
  'courses.delete.note.title': 'Delete this note?',
  'courses.delete.material.title': 'Remove this material?',
  'courses.delete.assessment.title': 'Delete this assessment?',
  'courses.delete.assignment.title': 'Delete this assignment?',
  'courses.delete.module.title': 'Delete this module?',
  'courses.delete.body': '“{title}” will be permanently deleted.',
  'courses.delete.module.body_one':
    '“{title}” and the {count} item inside it will be permanently deleted.',
  'courses.delete.module.body_other':
    '“{title}” and the {count} items inside it will be permanently deleted.',

  // Add / edit form
  'courses.form.description_new': 'Create a course for your academy.',
  'courses.form.description_edit': 'Update this course’s details.',
  'courses.form.title_placeholder': 'e.g. Certified Welding — Level 1',
  'courses.form.code': 'Code (optional)',
  'courses.form.code_placeholder': 'WELD-101',
  'courses.form.price': 'Price (RM)',
  'courses.form.description': 'Description (optional)',
  'courses.form.description_placeholder': 'What this course covers…',
  'courses.form.title_required': 'Title is required.',
  'courses.form.save_changes': 'Save changes',
  'courses.form.create': 'Create course',
} as const

export type CoursesDict = Record<keyof typeof courses, string>
