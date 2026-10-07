/** Bulk creation from a spreadsheet — shared by students and instructors. */
export const importCsv = {
  'import.students': 'Import CSV',
  'import.students.title': 'Import students from a spreadsheet',
  'import.students.description':
    'Add many students at once. Nothing is saved until you have seen what each row will become.',
  'import.instructors': 'Import CSV',
  'import.instructors.title': 'Import instructors from a spreadsheet',
  'import.instructors.description':
    'Add many instructor records at once. Records only — nobody gets back-office access until they claim the record.',

  'import.choose_file': 'Choose a CSV file',
  'import.download_template': 'Download template',
  'import.paste_instead': 'Or paste rows',
  'import.paste_label': 'Paste CSV, including the header row',
  'import.columns_hint': 'Recognised columns: {columns}. Column order does not matter, and anything else is ignored.',

  'import.missing_columns':
    'This file has no {columns} column, so there is nothing to import. Add it — or download the template and start from that.',
  'import.no_rows': 'That file has a header row but no data under it.',
  'import.unknown_columns': 'Ignored columns: {columns}.',

  'import.ready_one': '{count} row ready',
  'import.ready_other': '{count} rows ready',
  'import.problems_one': '{count} row with a problem',
  'import.problems_other': '{count} rows with problems',
  'import.duplicates_one': '{count} possible duplicate',
  'import.duplicates_other': '{count} possible duplicates',

  'import.col.line': 'Line',
  'import.row.ready': 'Ready',
  'import.row.problem': 'Problem',
  'import.row.duplicate_existing': 'Already here',
  'import.row.duplicate_file': 'Repeated',
  'import.preview_more': 'and {count} more rows below — all of them will be imported.',

  'import.problems_title': 'These rows will be skipped',
  'import.line': 'Line {line}',
  'import.and_more': 'and {count} more.',

  'import.invite_students': 'Email each student an invitation',
  'import.invite_instructors': 'Email each instructor an invitation',

  'import.include_duplicates': 'Import the possible duplicates too',
  'import.duplicates_hint':
    'A row counts as a duplicate when its {columns} matches someone already in this academy, or an earlier row in this file.',

  'import.action_one': 'Import {count} row',
  'import.action_other': 'Import {count} rows',
  'import.importing': 'Importing…',
  'import.done_one': 'Imported {count} row.',
  'import.done_other': 'Imported {count} rows.',
  // Shown only when fewer went out than were imported — a row with no email
  // address, or a provider that refused.
  'import.invited_one': 'Only {count} invitation email was sent.',
  'import.invited_other': 'Only {count} invitation emails were sent.',
  'import.failed': 'The import failed.',
  'import.partial':
    '{count} rows were saved before this failed; re-import only the rest.',

  // Cell-level problems, shown next to the column that caused them.
  'import.error.required': 'this column cannot be empty',
  'import.error.email': 'not a valid email address',
  'import.error.date': 'use YYYY-MM-DD or DD/MM/YYYY',
  'import.error.gender': 'use male or female',
  'import.error.student_status':
    'use active, trial, inactive, withdrawn or unenrolled',
  'import.error.instructor_status': 'use active, on_leave or inactive',
} as const

export type ImportCsvDict = Record<keyof typeof importCsv, string>
