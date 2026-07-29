/** Staff assessment editor: instructions, questions and their settings. */
export const assessments = {
  // Page-level states
  'assess.not_found': 'Assessment not found.',
  'assess.not_found.back': 'Back to courses',

  // Header
  'assess.title_placeholder': 'Untitled assessment',
  'assess.delete.aria': 'Delete assessment',
  'assess.delete.title': 'Delete this assessment?',
  'assess.delete.body':
    '“{title}” and its questions will be permanently deleted.',

  // Instructions card
  'assess.instructions.title': 'Instructions',
  'assess.instructions.desc':
    'Explanation, directives and any reference material.',

  // Questions card
  'assess.questions.title': 'Questions',
  'assess.questions.meta': 'Open-ended questions · {questions} · {points}',
  'assess.questions.count_one': '{count} question',
  'assess.questions.count_other': '{count} questions',
  'assess.points.count_one': '{count} point',
  'assess.points.count_other': '{count} points',
  'assess.questions.empty': 'No questions yet.',

  // A single question row
  'assess.question.n': 'Question {n}',
  'assess.question.move_up': 'Move up',
  'assess.question.move_down': 'Move down',
  'assess.question.remove': 'Remove question',
  'assess.question.prompt_placeholder': 'Question prompt…',
  'assess.question.points': 'Points',
  'assess.question.add': 'Add question',
} as const

export type AssessmentsDict = Record<keyof typeof assessments, string>
