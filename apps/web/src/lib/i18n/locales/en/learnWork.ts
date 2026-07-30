/** Learner doing work: handing in an assignment, sitting an assessment attempt. */
export const learnWork = {
  // Shared by both pages
  'lwork.back_to_courses': 'Back to my courses',
  'lwork.back_to_course': 'Back to course',
  'lwork.points_one': '{count} point',
  'lwork.points_other': '{count} points',
  'lwork.pts': '{count} pts',
  'lwork.duration': '{count} min',
  'lwork.due_at': 'Due {date}',
  'lwork.closes_at': 'Closes {date}',
  'lwork.late_allowed': 'Late submissions allowed',

  // Assignment
  'lwork.assignment.not_available': 'This assignment isn’t available to you.',
  'lwork.assignment.brief': 'Brief',
  'lwork.assignment.result': 'Result',
  'lwork.assignment.no_feedback': 'No feedback given.',
  'lwork.assignment.your_submission': 'Your submission',
  'lwork.assignment.answer_placeholder': 'Write your answer here…',
  'lwork.assignment.submitted_at': 'Submitted {date}',
  'lwork.assignment.overdue':
    'The due date has passed and this assignment does not allow late submissions, so it can no longer be handed in.',
  'lwork.assignment.locked_returned':
    'Your trainer returned this. Ask them to reopen it if you need to make changes.',
  'lwork.assignment.locked_submitted':
    'Your work has been submitted and can no longer be edited.',
  'lwork.assignment.save_draft': 'Save draft',
  'lwork.assignment.delete_draft': 'Delete draft',
  'lwork.assignment.confirm_submit.title': 'Submit this assignment?',
  'lwork.assignment.confirm_submit.body':
    'Once submitted you can’t edit your answer.',
  'lwork.assignment.confirm_delete.title': 'Delete this draft?',
  'lwork.assignment.confirm_delete.body':
    'Your saved answer will be removed. You can start again at any time before the deadline.',
  'lwork.assignment.error.save': 'Could not save.',
  'lwork.assignment.error.delete': 'Could not delete your draft.',

  // Assessment — overview and attempt history
  'lwork.assessment.not_available': 'This assessment isn’t available to you.',
  'lwork.attempt.not_available': 'This attempt isn’t available.',
  'lwork.assessment.attempts_used': '{used} of {total} attempts used',
  'lwork.assessment.your_attempts': 'Your attempts',
  'lwork.assessment.attempt_no': 'Attempt {n}',
  'lwork.assessment.attempt_of': 'Attempt {n} of {total}',
  'lwork.assessment.resume': 'Resume',
  'lwork.assessment.exhausted':
    'You’ve used all {count} attempts for this assessment.',
  'lwork.assessment.start': 'Start assessment',
  'lwork.assessment.starting': 'Starting…',

  // Assessment — sitting an attempt
  'lwork.assessment.instructions': 'Instructions',
  'lwork.assessment.answer_placeholder': 'Your answer…',
  'lwork.assessment.select_all': 'Select every answer that applies.',
  'lwork.assessment.pick_match': 'Choose…',
  'lwork.assessment.answered': '{n} of {total} answered',
  'lwork.assessment.save_answers': 'Save answers',
  'lwork.assessment.submit': 'Submit assessment',
  'lwork.assessment.confirm_submit.title': 'Submit this assessment?',
  'lwork.assessment.confirm_submit.body':
    'Your answers are final once submitted.',
  'lwork.assessment.submitted_on': 'Submitted {date}.',
  'lwork.assessment.submitted': 'Submitted.',
  'lwork.assessment.score': 'Score:',
  'lwork.assessment.awaiting_marking': 'Your trainer will mark it shortly.',
  'lwork.assessment.closed':
    'This assessment has closed, so no further answers can be saved.',
  'lwork.assessment.time_up':
    'Your time for this attempt has run out, so no further answers can be saved.',
  'lwork.assessment.expired_hint':
    'Submit what you have — everything saved up to the deadline is kept.',
  'lwork.assessment.error.start': 'Could not start this assessment.',
  'lwork.assessment.error.save': 'Could not save your answers.',
  'lwork.assessment.error.submit': 'Could not submit.',

  // Countdown
  'lwork.timer.time_up': 'Time is up',
  'lwork.timer.left_one': '{count} minute remaining',
  'lwork.timer.left_other': '{count} minutes remaining',
} as const

export type LearnWorkDict = Record<keyof typeof learnWork, string>
