import { View } from 'react-native'
import type { Enums, Json } from '@hawary/shared'
import { useT } from '@/lib/i18n'
import {
  isTextType,
  parseBoolValue,
  parseChoiceOptions,
  parseChoiceValue,
  parseMatchingOptions,
  parsePairsValue,
  parseTextValue,
} from '@/lib/questions'
import { Icon, T, space, useTheme } from '@/ui'

export type ReviewQuestion = {
  id: string
  prompt: string
  points: number
  question_type: Enums<'question_type'>
  options: Json | null
  correct_answer: Json | null
}

function Line({ text, right }: { text: string; right?: boolean | null }) {
  const { c } = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
      {right == null ? null : (
        <Icon
          name={right ? 'check' : 'x'}
          size={16}
          color={right ? c.tone.positive : c.tone.danger}
        />
      )}
      <T style={{ flex: 1 }}>{text}</T>
    </View>
  )
}

/**
 * What the student answered, as the grader needs to read it: their words for a
 * written answer; for an objective one, what they picked, each marked right or
 * wrong against the key.
 *
 * This is the one place in the apps that reads `correct_answer`. It only ever
 * arrives here because the `assessment_questions` SELECT policy is
 * `app.can_grade_assessment` — RLS, not this component, keeps the key away
 * from students (docs/question-types.md).
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
  const none = <T muted>{t('grading.attempt.no_answer')}</T>

  if (isTextType(type)) {
    const text = parseTextValue(answer)
    return text.trim() ? <T>{text}</T> : none
  }

  if (type === 'true_false') {
    const value = parseBoolValue(answer)
    if (value === null) return none
    const key = typeof question.correct_answer === 'boolean' ? question.correct_answer : null
    return (
      <Line
        text={t(value ? 'qtype.true' : 'qtype.false')}
        right={key === null ? null : value === key}
      />
    )
  }

  if (type === 'single_choice' || type === 'multiple_choice') {
    const { choices } = parseChoiceOptions(question.options)
    const picked = parseChoiceValue(answer)
    const key = parseChoiceValue(question.correct_answer)
    if (picked.length === 0) return none
    return (
      <View style={{ gap: 4 }}>
        {choices
          .filter((c) => picked.includes(c.id))
          .map((c) => (
            <Line
              key={c.id}
              text={c.text}
              right={key.length === 0 ? null : key.includes(c.id)}
            />
          ))}
      </View>
    )
  }

  if (type === 'matching') {
    const { left, right } = parseMatchingOptions(question.options)
    const pairs = parsePairsValue(answer)
    const key = parsePairsValue(question.correct_answer)
    if (Object.keys(pairs).length === 0) return none
    return (
      <View style={{ gap: 4 }}>
        {left.map((l) => {
          const chosen = right.find((r) => r.id === pairs[l.id])
          return (
            <Line
              key={l.id}
              text={`${l.text} → ${chosen?.text ?? '—'}`}
              right={key[l.id] ? pairs[l.id] === key[l.id] : null}
            />
          )
        })}
      </View>
    )
  }

  return null
}
