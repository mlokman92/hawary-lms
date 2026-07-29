/** Grading: the per-course queue, plus marking one submission or attempt. */
export const grading = {
  // Queue page
  'grading.title': 'Grading',
  'grading.subtitle': 'Submitted work for this course.',
  'grading.back_to_courses': 'Back to courses',
  'grading.queue.awaiting': 'Awaiting marks',
  'grading.queue.awaiting_empty': 'Nothing is waiting to be marked.',
  'grading.queue.marked': 'Marked',
  'grading.queue.marked_empty': 'Nothing marked yet.',
  'grading.item.assignment': 'Assignment',
  'grading.item.assessment': 'Assessment',
  'grading.attempt_no': 'Attempt {no}',
  'grading.unknown_student': 'Unknown student',

  // Not a grader of this course
  'grading.denied.title': 'You can’t grade this course',
  'grading.denied.not_assigned':
    'You aren’t assigned as an instructor on this course. An admin can assign you from the course’s instructor list.',
  'grading.denied.no_instructor_record':
    'Your account isn’t linked to an instructor record in this academy yet, so no courses are assigned to you. An admin can link it from the Instructors page.',

  // Marking a submission
  'grading.submission.unavailable': 'This submission isn’t available to you.',
  'grading.submission.meta': '{title} · submitted {when}',
  'grading.submission.brief': 'Brief',
  'grading.submission.work': 'Submitted work',
  'grading.submission.no_text': 'No text submitted.',
  'grading.mark': 'Mark',
  'grading.mark_out_of': 'Mark (out of {max})',
  'grading.feedback': 'Feedback',
  'grading.feedback_placeholder': 'What went well, what to improve…',
  'grading.save_mark': 'Save mark',
  'grading.save_and_return': 'Save & return to student',
  'grading.return_hint':
    '“Returned” is what releases the mark and feedback to the student.',

  // Marking an attempt
  'grading.attempt.unavailable': 'This attempt isn’t available to you.',
  'grading.attempt.meta': '{title} · attempt {no} · submitted {when}',
  'grading.attempt.no_answer': 'No answer given.',
  'grading.attempt.no_questions': 'This assessment has no questions.',
  'grading.attempt.release_hint':
    'Marking an attempt makes the score visible to the student.',
  'grading.score_out_of': 'Score (out of {max})',
  'grading.points_one': '{count} pt',
  'grading.points_other': '{count} pts',

  // Errors
  'grading.error.invalid_mark': 'Enter a mark of 0 or more.',
  'grading.error.save_failed': 'Could not save the mark.',
} as const

export type GradingDict = Record<keyof typeof grading, string>
