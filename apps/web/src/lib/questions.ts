import type { Enums, Json } from '@hawary/shared'
import type { TKey } from '@/lib/i18n'

/**
 * The question model shared by the three surfaces that touch it: the staff
 * editor, the student attempt, and the grader's review.
 *
 * Two jsonb columns carry everything type-specific. `options` is public — it
 * ships to the student inside the attempt payload. `correct_answer` is not: it
 * is projected out by app.attempt_questions and readable only by graders.
 * Nothing in this module may put an answer key inside `options`.
 *
 * A student's answer is encoded EXACTLY like the matching correct_answer, so
 * scoring is a comparison and never a translation:
 *
 *   type              options                          correct_answer / answer
 *   ────────────────  ───────────────────────────────  ───────────────────────
 *   essay             null                             "free text"
 *   short_text        null                             "free text"
 *   true_false        null                             true | false
 *   single_choice     {choices:[{id,text}]}            ["optId"]
 *   multiple_choice   {choices:[{id,text}]}            ["optId","optId"]
 *   matching          {left:[{id,text}],right:[…]}     {"leftId":"rightId"}
 *
 * Every encoding is distinguishable at runtime (typeof / Array.isArray), which
 * is why the v1 essay answers already in the database — bare strings — keep
 * working untouched.
 */
export type QuestionType = Enums<'question_type'>

export type Choice = { id: string; text: string }

export type ChoiceOptions = { choices: Choice[] }
export type MatchingOptions = { left: Choice[]; right: Choice[] }

export type AnswerValue = string | string[] | boolean | Record<string, string>

/** Picker order: the two free-text types first, since they were v1. */
export const QUESTION_TYPES: QuestionType[] = [
  'essay',
  'short_text',
  'true_false',
  'single_choice',
  'multiple_choice',
  'matching',
]

/**
 * `autoGraded` means the database can mark it — app.question_fraction knows the
 * type AND the author has supplied a key. A type that is auto-gradable in
 * principle still falls to a human when correct_answer is null, which is what
 * keeps a half-authored quiz out of status 'graded'.
 */
export const QUESTION_TYPE_META: Record<
  QuestionType,
  { labelKey: TKey; hintKey: TKey; autoGraded: boolean }
> = {
  essay: {
    labelKey: 'qtype.essay',
    hintKey: 'qtype.essay.hint',
    autoGraded: false,
  },
  short_text: {
    labelKey: 'qtype.short_text',
    hintKey: 'qtype.short_text.hint',
    autoGraded: false,
  },
  true_false: {
    labelKey: 'qtype.true_false',
    hintKey: 'qtype.true_false.hint',
    autoGraded: true,
  },
  single_choice: {
    labelKey: 'qtype.single_choice',
    hintKey: 'qtype.single_choice.hint',
    autoGraded: true,
  },
  multiple_choice: {
    labelKey: 'qtype.multiple_choice',
    hintKey: 'qtype.multiple_choice.hint',
    autoGraded: true,
  },
  matching: {
    labelKey: 'qtype.matching',
    hintKey: 'qtype.matching.hint',
    autoGraded: true,
  },
}

export function isTextType(t: QuestionType): boolean {
  return t === 'essay' || t === 'short_text'
}

export function isChoiceType(t: QuestionType): boolean {
  return t === 'single_choice' || t === 'multiple_choice'
}

export function newChoice(text = ''): Choice {
  return { id: crypto.randomUUID(), text }
}

// ---------------------------------------------------------------------------
// Parsing. Everything arriving from jsonb is `unknown` in practice, so each
// reader coerces and drops junk rather than trusting the column. A malformed
// row renders as an empty question instead of crashing the page it is on.
// ---------------------------------------------------------------------------

function asChoices(v: unknown): Choice[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((c) =>
    c && typeof c === 'object' && typeof (c as Choice).id === 'string'
      ? [{ id: (c as Choice).id, text: String((c as Choice).text ?? '') }]
      : [],
  )
}

export function parseChoiceOptions(options: Json | null): ChoiceOptions {
  const o = options as { choices?: unknown } | null
  return { choices: asChoices(o?.choices) }
}

export function parseMatchingOptions(options: Json | null): MatchingOptions {
  const o = options as { left?: unknown; right?: unknown } | null
  return { left: asChoices(o?.left), right: asChoices(o?.right) }
}

/** Selected option ids, for single_choice / multiple_choice. */
export function parseChoiceValue(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

/** null = unanswered, which is not the same as answering "false". */
export function parseBoolValue(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

/** {leftId: rightId}. Absent keys are unanswered pairs. */
export function parsePairsValue(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && val) out[k] = val
  }
  return out
}

export function parseTextValue(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * The fraction of a question's marks an answer earns, or null when no machine
 * can say. A faithful mirror of app.question_fraction — the server is still the
 * authority (it is the only side that may write a score); this exists so the
 * grader's review can show ✓/✗ per question without a round trip.
 *
 * Keep the two in step. The SQL lives in
 * supabase/migrations/*_objective_question_autoscoring.sql.
 */
export function questionFraction(
  type: QuestionType,
  correct: Json | null,
  answer: unknown,
): number | null {
  if (isTextType(type)) return null
  if (correct === null || correct === undefined) return null

  if (type === 'true_false') {
    if (typeof correct !== 'boolean') return null
    return answer === correct ? 1 : 0
  }

  if (isChoiceType(type)) {
    if (!Array.isArray(correct)) return null
    const want = [...new Set(parseChoiceValue(correct))].sort()
    const got = [...new Set(parseChoiceValue(answer))].sort()
    if (!want.length) return null
    return want.length === got.length && want.every((x, i) => x === got[i])
      ? 1
      : 0
  }

  if (type === 'matching') {
    const want = parsePairsValue(correct)
    const keys = Object.keys(want)
    if (!keys.length) return null
    const got = parsePairsValue(answer)
    // Partial credit, matching the server: four pairs, three right, 0.75.
    return keys.filter((k) => got[k] === want[k]).length / keys.length
  }

  return null
}

/** Marks earned on one question, or null when only a human can say. */
export function earnedPoints(
  type: QuestionType,
  correct: Json | null,
  answer: unknown,
  points: number,
): number | null {
  const frac = questionFraction(type, correct, answer)
  return frac === null ? null : Math.round(Number(points) * frac * 100) / 100
}

/**
 * A fresh, valid configuration for a question type — what the editor writes
 * when the author picks a different type.
 *
 * Switching throws the old configuration away rather than trying to carry it
 * across. A true/false key means nothing to a matching question, and a
 * half-translated one scores wrong answers as right: the loudest possible
 * failure for the quietest possible convenience.
 */
export function blankQuestionConfig(type: QuestionType): {
  question_type: QuestionType
  options: Json | null
  correct_answer: Json | null
} {
  if (isChoiceType(type)) {
    return {
      question_type: type,
      options: { choices: [newChoice(), newChoice()] } as unknown as Json,
      correct_answer: [] as unknown as Json,
    }
  }
  if (type === 'true_false') {
    return { question_type: type, options: null, correct_answer: true }
  }
  if (type === 'matching') {
    const left = [newChoice(), newChoice()]
    const right = [newChoice(), newChoice()]
    return {
      question_type: type,
      options: { left, right } as unknown as Json,
      correct_answer: {
        [left[0].id]: right[0].id,
        [left[1].id]: right[1].id,
      } as unknown as Json,
    }
  }
  return { question_type: type, options: null, correct_answer: null }
}

/** Has the student put anything here? Drives the "N of M answered" counter. */
export function isAnswered(type: QuestionType, answer: unknown): boolean {
  if (isTextType(type)) return parseTextValue(answer).trim().length > 0
  if (type === 'true_false') return typeof answer === 'boolean'
  if (isChoiceType(type)) return parseChoiceValue(answer).length > 0
  if (type === 'matching') return Object.keys(parsePairsValue(answer)).length > 0
  return false
}
