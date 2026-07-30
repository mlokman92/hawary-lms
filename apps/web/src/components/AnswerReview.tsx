import { Check, Minus, X } from 'lucide-react'
import type { Json } from '@hawary/shared'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import {
  isChoiceType,
  isTextType,
  parseChoiceOptions,
  parseChoiceValue,
  parseMatchingOptions,
  parsePairsValue,
  parseTextValue,
  type QuestionType,
} from '@/lib/questions'

export type ReviewQuestion = {
  id: string
  prompt: string
  points: number
  question_type: QuestionType
  options: Json | null
  correct_answer: Json | null
}

/**
 * One student answer, as the grader sees it.
 *
 * Correctness is recomputed here rather than read back from the attempt: the
 * server banks a single total, not a per-question breakdown, and a grader
 * topping up an essay needs to see WHICH objective answers earned the marks
 * already on the row. questionFraction mirrors app.question_fraction exactly.
 */
export function AnswerReview({
  question,
  answer,
}: {
  question: ReviewQuestion
  answer: unknown
}) {
  const { t } = useT()
  const type = question.question_type

  if (isTextType(type)) {
    const text = parseTextValue(answer).trim()
    return (
      <p className="bg-muted/40 rounded-md border p-3 text-sm leading-7 whitespace-pre-line">
        {text || t('grading.attempt.no_answer')}
      </p>
    )
  }

  if (type === 'true_false') {
    const given = typeof answer === 'boolean' ? answer : null
    const key =
      typeof question.correct_answer === 'boolean'
        ? question.correct_answer
        : null
    return (
      <ul className="divide-y rounded-md border">
        {[true, false].map((v) => (
          <Row
            key={String(v)}
            text={v ? t('qtype.true') : t('qtype.false')}
            picked={given === v}
            correct={key === v}
          />
        ))}
        {given === null ? <Blank /> : null}
      </ul>
    )
  }

  if (isChoiceType(type)) {
    const { choices } = parseChoiceOptions(question.options)
    const picked = parseChoiceValue(answer)
    const key = parseChoiceValue(question.correct_answer)
    return (
      <ul className="divide-y rounded-md border">
        {choices.map((c) => (
          <Row
            key={c.id}
            text={c.text}
            picked={picked.includes(c.id)}
            correct={key.includes(c.id)}
          />
        ))}
        {picked.length === 0 ? <Blank /> : null}
      </ul>
    )
  }

  if (type === 'matching') {
    const { left, right } = parseMatchingOptions(question.options)
    const given = parsePairsValue(answer)
    const key = parsePairsValue(question.correct_answer)
    const label = (id: string | undefined) =>
      right.find((r) => r.id === id)?.text ?? ''
    return (
      <ul className="divide-y rounded-md border">
        {left.map((l) => {
          const ok = given[l.id] !== undefined && given[l.id] === key[l.id]
          return (
            <li key={l.id} className="flex items-start gap-2 p-2 text-sm">
              <Mark ok={given[l.id] === undefined ? null : ok} />
              <span className="min-w-0 flex-1">
                <span className="text-muted-foreground">{l.text}</span>{' '}
                <span aria-hidden>&rarr;</span>{' '}
                <span className={cn(!ok && 'line-through')}>
                  {label(given[l.id]) || t('grading.attempt.no_answer')}
                </span>
                {!ok && key[l.id] ? (
                  <span className="text-muted-foreground">
                    {' '}
                    ({label(key[l.id])})
                  </span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
    )
  }

  return null
}

function Mark({ ok }: { ok: boolean | null }) {
  if (ok === null)
    return <Minus className="text-muted-foreground mt-1 size-4 shrink-0" />
  return ok ? (
    <Check className="mt-1 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
  ) : (
    <X className="text-destructive mt-1 size-4 shrink-0" />
  )
}

/**
 * A choice row is four states, not two: chosen-and-right, chosen-and-wrong,
 * not-chosen-but-right (what they missed), and simply not chosen. Only the
 * first three earn an icon.
 */
function Row({
  text,
  picked,
  correct,
}: {
  text: string
  picked: boolean
  correct: boolean
}) {
  return (
    <li
      className={cn(
        'flex items-start gap-2 p-2 text-sm',
        picked && 'bg-muted/40',
      )}
    >
      {picked ? (
        <Mark ok={correct} />
      ) : correct ? (
        <Check className="mt-1 size-4 shrink-0 text-emerald-600/40 dark:text-emerald-500/40" />
      ) : (
        <span className="mt-1 size-4 shrink-0" />
      )}
      <span className={cn('min-w-0 flex-1', !picked && 'text-muted-foreground')}>
        {text}
      </span>
    </li>
  )
}

function Blank() {
  const { t } = useT()
  return (
    <li className="text-muted-foreground p-2 text-sm italic">
      {t('grading.attempt.no_answer')}
    </li>
  )
}
