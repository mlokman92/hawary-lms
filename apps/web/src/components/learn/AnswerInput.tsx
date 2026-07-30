import { useT } from '@/lib/i18n'
import {
  isChoiceType,
  parseChoiceOptions,
  parseChoiceValue,
  parseMatchingOptions,
  parsePairsValue,
  parseTextValue,
  type AnswerValue,
} from '@/lib/questions'
import type { AttemptQuestion } from '@/features/learn/api'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

/**
 * How a student answers one question.
 *
 * `commit` is the eager path (a click is a complete answer — save it) and
 * `draft` the debounced one (a keystroke is not). The caller wires draft to its
 * autosave timer and commit to an immediate persist, so a radio button never
 * sits unsaved for two seconds while a timed attempt runs out.
 */
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

  if (type === 'short_text') {
    return (
      <Input
        disabled={readOnly}
        value={parseTextValue(value)}
        onChange={(e) => onDraft(e.target.value)}
        onBlur={onBlur}
        placeholder={t('lwork.assessment.answer_placeholder')}
      />
    )
  }

  if (type === 'true_false') {
    const current = typeof value === 'boolean' ? String(value) : ''
    return (
      <RadioGroup
        value={current}
        disabled={readOnly}
        onValueChange={(v) => onCommit(v === 'true')}
        className="gap-2"
      >
        {[true, false].map((v) => (
          <div key={String(v)} className="flex items-center gap-2">
            <RadioGroupItem
              value={String(v)}
              id={`${question.id}-${String(v)}`}
            />
            <Label
              htmlFor={`${question.id}-${String(v)}`}
              className="font-normal"
            >
              {v ? t('qtype.true') : t('qtype.false')}
            </Label>
          </div>
        ))}
      </RadioGroup>
    )
  }

  if (isChoiceType(type)) {
    const { choices } = parseChoiceOptions(question.options)
    const selected = parseChoiceValue(value)

    if (type === 'single_choice') {
      return (
        <RadioGroup
          value={selected[0] ?? ''}
          disabled={readOnly}
          onValueChange={(v) => onCommit([v])}
          className="gap-2"
        >
          {choices.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <RadioGroupItem
                value={c.id}
                id={`${question.id}-${c.id}`}
                className="mt-0.5"
              />
              <Label
                htmlFor={`${question.id}-${c.id}`}
                className="font-normal leading-6"
              >
                {c.text}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )
    }

    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">
          {t('lwork.assessment.select_all')}
        </p>
        {choices.map((c) => (
          <div key={c.id} className="flex items-start gap-2">
            <Checkbox
              id={`${question.id}-${c.id}`}
              className="mt-0.5"
              disabled={readOnly}
              checked={selected.includes(c.id)}
              onCheckedChange={() =>
                onCommit(
                  selected.includes(c.id)
                    ? selected.filter((x) => x !== c.id)
                    : [...selected, c.id],
                )
              }
            />
            <Label
              htmlFor={`${question.id}-${c.id}`}
              className="font-normal leading-6"
            >
              {c.text}
            </Label>
          </div>
        ))}
      </div>
    )
  }

  if (type === 'matching') {
    const { left, right } = parseMatchingOptions(question.options)
    const pairs = parsePairsValue(value)
    return (
      <ul className="space-y-2">
        {left.map((l) => (
          <li
            key={l.id}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <span className="min-w-0 flex-1 text-sm leading-6">{l.text}</span>
            <Select
              value={pairs[l.id] ?? ''}
              disabled={readOnly}
              onValueChange={(v) => onCommit({ ...pairs, [l.id]: v })}
            >
              <SelectTrigger className="w-full sm:w-64" aria-label={l.text}>
                <SelectValue placeholder={t('lwork.assessment.pick_match')} />
              </SelectTrigger>
              <SelectContent>
                {right.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Textarea
      rows={6}
      disabled={readOnly}
      value={parseTextValue(value)}
      onChange={(e) => onDraft(e.target.value)}
      onBlur={onBlur}
      placeholder={t('lwork.assessment.answer_placeholder')}
    />
  )
}
