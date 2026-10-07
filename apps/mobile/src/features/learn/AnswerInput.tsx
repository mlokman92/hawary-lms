import { Pressable, View } from 'react-native'
import { useT } from '@/lib/i18n'
import {
  parseBoolValue,
  parseChoiceOptions,
  parseChoiceValue,
  parseMatchingOptions,
  parsePairsValue,
  parseTextValue,
  type AnswerValue,
} from '@/lib/questions'
import type { AttemptQuestion } from '@/features/learn/api'
import { Icon, Input, Select, T, space, useTheme } from '@/ui'

/**
 * The answer control for one question, by type (docs/question-types.md).
 *
 * An answer is encoded exactly like the question's `correct_answer`, which is
 * why each branch writes the shape it does: a string, a boolean, an array of
 * option ids, or `{leftId: rightId}`.
 *
 * `onDraft` is typing (saved on a debounce); `onCommit` is a finished answer —
 * a tap on a choice — and saves at once.
 */
function Option({
  label,
  selected,
  multi,
  disabled,
  onPress,
}: {
  label: string
  selected: boolean
  multi?: boolean
  disabled: boolean
  onPress: () => void
}) {
  const { c } = useTheme()
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected, disabled }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 46,
        borderWidth: 1,
        borderRadius: 10,
        borderColor: selected ? c.primary : c.border,
        backgroundColor: selected ? c.muted : c.card,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        opacity: disabled && !selected ? 0.6 : 1,
      }}
    >
      <Icon
        name={
          multi
            ? selected
              ? 'check-square'
              : 'square'
            : selected
              ? 'check-circle'
              : 'circle'
        }
        color={selected ? c.foreground : c.mutedForeground}
      />
      <T style={{ flex: 1 }}>{label}</T>
    </Pressable>
  )
}

export function AnswerInput({
  question,
  value,
  readOnly,
  onDraft,
  onCommit,
  onBlur,
}: {
  question: AttemptQuestion
  value: AnswerValue | undefined
  readOnly: boolean
  onDraft: (v: AnswerValue) => void
  onCommit: (v: AnswerValue) => void
  onBlur: () => void
}) {
  const { t } = useT()
  const type = question.question_type

  if (type === 'essay' || type === 'short_text') {
    return (
      <Input
        multiline={type === 'essay'}
        value={parseTextValue(value)}
        editable={!readOnly}
        onChangeText={onDraft}
        onBlur={onBlur}
        placeholder={t('lwork.assessment.answer_placeholder')}
      />
    )
  }

  if (type === 'true_false') {
    const current = parseBoolValue(value)
    return (
      <View style={{ gap: space.sm }}>
        <Option
          label={t('qtype.true')}
          selected={current === true}
          disabled={readOnly}
          onPress={() => onCommit(true)}
        />
        <Option
          label={t('qtype.false')}
          selected={current === false}
          disabled={readOnly}
          onPress={() => onCommit(false)}
        />
      </View>
    )
  }

  if (type === 'single_choice' || type === 'multiple_choice') {
    const multi = type === 'multiple_choice'
    const { choices } = parseChoiceOptions(question.options)
    const picked = parseChoiceValue(value)
    return (
      <View style={{ gap: space.sm }}>
        {multi ? (
          <T v="small" muted>
            {t('lwork.assessment.select_all')}
          </T>
        ) : null}
        {choices.map((choice) => {
          const on = picked.includes(choice.id)
          return (
            <Option
              key={choice.id}
              label={choice.text}
              selected={on}
              multi={multi}
              disabled={readOnly}
              onPress={() =>
                onCommit(
                  multi
                    ? on
                      ? picked.filter((x) => x !== choice.id)
                      : [...picked, choice.id]
                    : [choice.id],
                )
              }
            />
          )
        })}
      </View>
    )
  }

  if (type === 'matching') {
    const { left, right } = parseMatchingOptions(question.options)
    const pairs = parsePairsValue(value)
    return (
      <View style={{ gap: space.md }}>
        {left.map((item) => (
          <View key={item.id} style={{ gap: 6 }}>
            <T style={{ fontWeight: '500' }}>{item.text}</T>
            {readOnly ? (
              <T muted>
                {right.find((r) => r.id === pairs[item.id])?.text ?? '—'}
              </T>
            ) : (
              <Select
                value={pairs[item.id] ?? null}
                options={right.map((r) => ({ value: r.id, label: r.text }))}
                onChange={(rightId) => onCommit({ ...pairs, [item.id]: rightId })}
                placeholder={t('lwork.assessment.pick_match')}
                title={item.text}
              />
            )}
          </View>
        ))}
      </View>
    )
  }

  return null
}
