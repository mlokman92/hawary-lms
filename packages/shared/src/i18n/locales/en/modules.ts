/** Course module add/edit dialog. */
export const modules = {
  // Dialog chrome
  'modules.dialog.new_title': 'New module',
  'modules.dialog.edit_title': 'Edit module',
  'modules.dialog.new_description':
    'Modules group the notes, assessments and assignments of a course.',
  'modules.dialog.edit_description':
    'Rename this module or update its summary.',

  // Fields
  'modules.field.title_placeholder': 'e.g. Week 1 — Safety fundamentals',
  'modules.field.summary': 'Summary (optional)',
  'modules.field.summary_placeholder': 'What this module covers…',

  // Actions
  'modules.action.create': 'Create module',
  'modules.action.save_changes': 'Save changes',

  // Validation
  'modules.error.title_required': 'Title is required.',
} as const

export type ModulesDict = Record<keyof typeof modules, string>
