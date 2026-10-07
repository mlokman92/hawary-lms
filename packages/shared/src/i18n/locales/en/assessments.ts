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
  'assess.questions.meta': '{questions} · {points}',
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

  // Per-type configuration. The type labels themselves are `qtype.*` in
  // `common` — the student and the grader render them too.
  'qtype.label': 'Question type',
  'qedit.auto_marked': 'Marked automatically',
  'qedit.correct_answer': 'Correct answer',
  'qedit.choices.single': 'Options — pick the correct one',
  'qedit.choices.multi': 'Options — tick every correct one',
  'qedit.mark_correct': 'Mark as correct',
  'qedit.option_placeholder': 'Option {n}',
  'qedit.add_option': 'Add option',
  'qedit.remove_option': 'Remove option',
  'qedit.no_key_hint': 'No correct answer set — this question is marked by hand.',
  'qedit.pairs': 'Pairs — the item and what it matches',
  'qedit.pair_left_placeholder': 'Item {n}',
  'qedit.pair_right_placeholder': 'Matches with…',
  'qedit.add_pair': 'Add pair',
  'qedit.remove_pair': 'Remove pair',
} as const

export type AssessmentsDict = Record<keyof typeof assessments, string>
