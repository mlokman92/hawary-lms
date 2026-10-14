/** Learner tree: dashboard, my courses, my work, a course page, a note page. */
export const learn = {
  // Page subtitles. The titles themselves reuse `nav.learn.*` — the sidebar
  // destination and the h1 are deliberately the same words.
  'learn.courses.subtitle': 'Course material, assignments and assessments.',
  'learn.work.subtitle':
    'Assignments and assessments across all your courses.',

  // What a task is, and the units a row is annotated with
  'learn.kind.assignment': 'Assignment',
  'learn.kind.assessment': 'Assessment',
  'learn.points': '{points} pts',
  'learn.meta.minutes': '{minutes} min',
  'learn.meta.due': 'Due {date}',

  // Relative deadline, shown at the end of a task row
  'learn.due.none': 'No deadline',
  'learn.due.overdue_by': 'Overdue by {days}d',
  'learn.due.today': 'Due today',
  'learn.due.tomorrow': 'Due tomorrow',
  'learn.due.in_days': 'Due in {days}d',

  // My work filter cards, and the Student app's home tiles. "Overdue", "To do"
  // and "Marked" come from `common.overdue` and the `status.task.*` block.
  'learn.stat.due_week': 'Due this week',
  'learn.stat.awaiting': 'Awaiting marks',

  // The Student app's home sections. The web dashboard is a launcher and
  // carries none of them.
  'learn.up_next': 'Up next',
  'learn.all_work': 'All work',
  'learn.all_courses': 'All courses',
  'learn.view_all': 'View all',
  'learn.empty.outstanding': 'Nothing outstanding. Everything is handed in.',
  'learn.empty.courses_short': 'You haven’t been enrolled in a course yet.',

  // Counts and progress
  'learn.count.notes_one': '{count} note',
  'learn.count.notes_other': '{count} notes',
  'learn.count.modules_one': '{count} module',
  'learn.count.modules_other': '{count} modules',
  'learn.progress': 'Progress',
  'learn.progress.tasks_done': '{done}/{total} tasks done',
  'learn.percent_complete': '{pct}% complete',
  'learn.no_tasks_yet': 'No tasks yet',
  // Bare labels: the course card prints the number and the noun separately.
  'learn.stat.notes': 'notes',
  'learn.stat.tasks_done': 'tasks done',

  // My courses
  'learn.empty.courses.title': 'No courses yet',
  'learn.empty.courses.body':
    'You’re set up, but you haven’t been enrolled in a course yet. Your academy adds you to courses — once they do, they’ll appear here.',

  // My work
  'learn.empty.no_match': 'Nothing matches this filter.',
  'learn.empty.no_work': 'Nothing has been set for you yet.',

  // Course page
  'learn.not_enrolled': 'You’re not enrolled in this course.',
  'learn.back_to_courses': 'Back to my courses',
  'learn.empty.published.title': 'Nothing published yet',
  'learn.empty.published.body':
    'Your academy hasn’t published any modules in this course. Check back soon.',
  'learn.empty.module': 'Nothing published in this module yet.',

  // Note page
  'learn.note.not_available': 'This note isn’t available to you.',
  'learn.note.last_updated': 'Last updated {date}',
  'learn.note.loading_content': 'Loading content…',
  'learn.note.empty': 'This note doesn’t have any content yet.',

  // Data layer
  'learn.submission.delete_locked':
    'This submission can no longer be deleted — it has already been handed in.',
} as const

export type LearnDict = Record<keyof typeof learn, string>
