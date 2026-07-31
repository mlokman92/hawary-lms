/**
 * Generic UI vocabulary shared by every feature. Reach for a `common.*` key
 * before inventing a feature-scoped one — "Save" must not exist sixteen times.
 */
export const common = {
  // Actions
  'common.save': 'Save',
  'common.saving': 'Saving…',
  'common.saved': 'Saved',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.deleting': 'Deleting…',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.create': 'Create',
  'common.creating': 'Creating…',
  'common.update': 'Update',
  'common.remove': 'Remove',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.confirm': 'Confirm',
  'common.continue': 'Continue',
  'common.retry': 'Try again',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.sort': 'Sort by',
  'common.view': 'View',
  'common.open': 'Open',
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.copy_link': 'Copy link',
  'common.upload': 'Upload',
  'common.uploading': 'Uploading…',
  'common.download': 'Download',
  'common.submit': 'Submit',
  'common.submitting': 'Submitting…',
  'common.send': 'Send',
  'common.sending': 'Sending…',
  'common.done': 'Done',
  'common.actions': 'Actions',
  'common.select': 'Select',
  'common.clear': 'Clear',

  // States
  'common.loading': 'Loading…',
  'common.error': 'Something went wrong.',
  'common.none': 'None',
  'common.empty': 'Nothing here yet.',
  'common.not_found': 'Not found.',
  'common.optional': 'Optional',
  'common.required': 'Required',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.all': 'All',
  'common.unnamed': 'Unnamed',
  'common.untitled': 'Untitled',

  // Field labels reused across forms
  'common.name': 'Name',
  'common.full_name': 'Full name',
  'common.email': 'Email',
  'common.password': 'Password',
  'common.phone': 'Phone',
  'common.status': 'Status',
  'common.title': 'Title',
  'common.description': 'Description',
  'common.notes': 'Notes',
  'common.date': 'Date',
  'common.amount': 'Amount',
  'common.total': 'Total',
  'common.role': 'Role',
  'common.course': 'Course',
  'common.courses': 'Courses',
  /** The "no filter" option in every course dropdown. */
  'common.all_courses': 'All courses',
  'common.student': 'Student',
  'common.students': 'Students',
  'common.instructor': 'Instructor',
  'common.instructors': 'Instructors',
  'common.module': 'Module',
  'common.modules': 'Modules',

  // Publishing
  'common.published': 'Published',
  'common.draft': 'Draft',
  'common.publish': 'Publish',
  'common.unpublish': 'Unpublish',
  // Accessible name for the inline publish switch — a row of unlabelled
  // switches tells a screen reader nothing about which one it is on.
  'common.publish_aria': 'Published — {title}',
  'common.visible_to_students': 'Visible to students',

  // Time
  'common.today': 'today',
  'common.days_one': '{count} day',
  'common.days_other': '{count} days',
  'common.overdue': 'Overdue',
  'common.due': 'Due',
  'common.no_due_date': 'No due date',

  // Counts used by several list pages
  'common.count_one': '{count} item',
  'common.count_other': '{count} items',

  // Record statuses. These live in `common` because the same enum is rendered
  // on several surfaces (list, detail, dashboard, learner) that are otherwise
  // unrelated — see the `status.ts` modules that hold the enum→label map.
  'status.student.active': 'Active',
  'status.student.trial': 'Trial',
  'status.student.inactive': 'Inactive',
  'status.student.withdrawn': 'Withdrawn',
  'status.student.unenrolled': 'Unenrolled',

  'status.instructor.active': 'Active',
  'status.instructor.on_leave': 'On leave',
  'status.instructor.inactive': 'Inactive',
  'status.instructor.unassigned': 'Unassigned',

  'status.task.todo': 'To do',
  'status.task.in_progress': 'Started',
  'status.task.awaiting': 'Handed in',
  'status.task.marked': 'Marked',

  'status.submission.draft': 'Draft',
  'status.submission.submitted': 'Handed in',
  'status.submission.graded': 'Marked',
  'status.submission.returned': 'Returned for changes',

  'status.attempt.in_progress': 'In progress',
  'status.attempt.submitted': 'Handed in',
  'status.attempt.graded': 'Marked',

  // Question types. Here rather than in `assessments` for the same reason as
  // the statuses above: the author picks one, the student answers one and the
  // grader reads one, on three unrelated surfaces. The map is
  // QUESTION_TYPE_META in lib/questions.ts.
  'qtype.essay': 'Long answer',
  'qtype.essay.hint': 'Free text. Marked by a person.',
  'qtype.short_text': 'Short answer',
  'qtype.short_text.hint': 'One line of free text. Marked by a person.',
  'qtype.true_false': 'True or false',
  'qtype.true_false.hint': 'Marked automatically.',
  'qtype.single_choice': 'Multiple choice (one answer)',
  'qtype.single_choice.hint': 'Marked automatically.',
  'qtype.multiple_choice': 'Multiple choice (several answers)',
  'qtype.multiple_choice.hint':
    'Marked automatically. All the right options and none of the wrong ones.',
  'qtype.matching': 'Matching',
  'qtype.matching.hint':
    'Marked automatically, with part marks for each correct pair.',
  'qtype.true': 'True',
  'qtype.false': 'False',

  // Image upload (lib/storage.ts — shared by avatars and note media)
  'upload.no_academy':
    'No academy selected — reload the page and try again. (Uploads are stored per academy.)',
  'upload.not_staff':
    'Signed in as {account}, which is not staff of this academy. Sign in with the account that owns this course.',
  'upload.another_account': 'another account',
  'upload.failed': 'Upload failed',
} as const

export type CommonDict = Record<keyof typeof common, string>
